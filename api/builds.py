"""Builds API — CRUD for competitive Pokémon builds.

Storage: single blob per user at users/{userId}/builds.json
Shape: { "meta": {...}, "builds": [...] } or { "builds": [...] }

All domain logic lives in shared.operations; this file is a thin HTTP adapter.
"""
from __future__ import annotations

import json

import azure.functions as func
from shared import operations as ops
from shared.auth import require_auth
from shared.blob_store import ConflictError, atomic_update, read_blob_or_default, user_path
from shared.operations import (
    DuplicateBuildError,
    FKConflictError,
    NotFoundError,
    ValidationError,
)

bp = func.Blueprint()


def _builds_path(user_id: str) -> str:
    return user_path(user_id, "builds.json")


@bp.function_name("builds_list")
@bp.route(route="builds", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def list_builds(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    data, _ = read_blob_or_default(_builds_path(user_id), ops.EMPTY_BUILDS)
    return _json(200, ops.list_builds(data))


@bp.function_name("builds_get")
@bp.route(route="builds/{buildId}", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def get_build(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    build_id = req.route_params.get("buildId")
    data, _ = read_blob_or_default(_builds_path(user_id), ops.EMPTY_BUILDS)
    try:
        record = ops.get_build(data, build_id)
    except NotFoundError as e:
        return _error(404, str(e))

    return _json(200, record)


@bp.function_name("builds_create")
@bp.route(route="builds", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def create_build(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    body, body_err = _parse_body(req)
    if body_err:
        return body_err

    result_record = None
    duplicate_record = None

    def append_build(current):
        nonlocal result_record, duplicate_record
        result_record = None
        duplicate_record = None
        try:
            new_data, record = ops.create_build(current, body)
            result_record = record
            return new_data
        except DuplicateBuildError as e:
            duplicate_record = e.existing
            return current  # No mutation
        except ValidationError as e:
            raise ValueError(str(e)) from e

    try:
        atomic_update(_builds_path(user_id), append_build, default=ops.EMPTY_BUILDS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except ValueError as e:
        return _error(400, str(e))

    if duplicate_record:
        return _json(200, duplicate_record)

    return _json(201, result_record)


@bp.function_name("builds_update")
@bp.route(route="builds/{buildId}", methods=["PUT"], auth_level=func.AuthLevel.ANONYMOUS)
def update_build(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    build_id = req.route_params.get("buildId")

    body, body_err = _parse_body(req)
    if body_err:
        return body_err

    result_record = None

    def replace_build(current):
        nonlocal result_record
        result_record = None
        new_data, record = ops.update_build(current, build_id, body)
        result_record = record
        return new_data

    try:
        atomic_update(_builds_path(user_id), replace_build, default=ops.EMPTY_BUILDS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except NotFoundError as e:
        return _error(404, str(e))
    except ValidationError as e:
        return _error(400, str(e))

    return _json(200, result_record)


@bp.function_name("builds_delete")
@bp.route(route="builds/{buildId}", methods=["DELETE"], auth_level=func.AuthLevel.ANONYMOUS)
def delete_build(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    build_id = req.route_params.get("buildId")

    def remove_build(current):
        # teams_reader reads the teams blob *inside* the retry loop —
        # this ensures fresh data on each retry, fixing the FK race.
        def teams_reader():
            data, _ = read_blob_or_default(user_path(user_id, "teams.json"), ops.EMPTY_TEAMS)
            return data

        return ops.delete_build(current, build_id, teams_reader)

    try:
        atomic_update(_builds_path(user_id), remove_build, default=ops.EMPTY_BUILDS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except NotFoundError as e:
        return _error(404, str(e))
    except FKConflictError as e:
        return _error(409, str(e))

    return _json(200, {"deleted": build_id})


# ── Helpers ────────────────────────────────────────────────────────────


def _parse_body(req: func.HttpRequest) -> tuple[dict | None, func.HttpResponse | None]:
    """Parse and validate JSON body. Returns (body, None) or (None, error_response)."""
    try:
        body = req.get_json()
    except ValueError:
        return None, _error(400, "Invalid JSON body")
    if not isinstance(body, dict):
        return None, _error(400, "Request body must be a JSON object")
    return body, None


def _json(status: int, data) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(data, ensure_ascii=False),
        status_code=status,
        mimetype="application/json",
    )


def _error(status: int, message: str) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({"error": message}),
        status_code=status,
        mimetype="application/json",
    )
