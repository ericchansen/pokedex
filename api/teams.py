"""Teams API — CRUD for team compositions.

Storage: single blob per user at users/{userId}/teams.json
Shape: { "teams": [{ "id", "name", "game", "members": [{ "slot", "build_id" }] }] }

All domain logic lives in shared.operations; this file is a thin HTTP adapter.
"""
from __future__ import annotations

import json

import azure.functions as func
from domain import operations as ops
from domain.operations import NotFoundError, ValidationError
from shared.auth import require_auth
from shared.blob_store import ConflictError, atomic_update, read_blob_or_default

bp = func.Blueprint()


def _teams_path(user_id: str) -> str:
    from shared.blob_store import user_path
    return user_path(user_id, "teams.json")


@bp.function_name("teams_list")
@bp.route(route="teams", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def list_teams(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    data, _ = read_blob_or_default(_teams_path(user_id), ops.EMPTY_TEAMS)
    return _json(200, ops.list_teams(data))


@bp.function_name("teams_get")
@bp.route(route="teams/{teamId}", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def get_team(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    team_id = req.route_params.get("teamId")
    data, _ = read_blob_or_default(_teams_path(user_id), ops.EMPTY_TEAMS)
    try:
        record = ops.get_team(data, team_id)
    except NotFoundError as e:
        return _error(404, str(e))

    return _json(200, record)


@bp.function_name("teams_create")
@bp.route(route="teams", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def create_team(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    body, body_err = _parse_body(req)
    if body_err:
        return body_err

    result_record = None

    def append_team(current):
        nonlocal result_record
        new_data, record = ops.create_team(current, body)
        result_record = record
        return new_data

    try:
        atomic_update(_teams_path(user_id), append_team, default=ops.EMPTY_TEAMS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except ValidationError as e:
        return _error(400, str(e))

    return _json(201, result_record)


@bp.function_name("teams_update")
@bp.route(route="teams/{teamId}", methods=["PUT"], auth_level=func.AuthLevel.ANONYMOUS)
def update_team(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    team_id = req.route_params.get("teamId")

    body, body_err = _parse_body(req)
    if body_err:
        return body_err

    result_record = None

    def replace_team(current):
        nonlocal result_record
        new_data, record = ops.update_team(current, team_id, body)
        result_record = record
        return new_data

    try:
        atomic_update(_teams_path(user_id), replace_team, default=ops.EMPTY_TEAMS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except NotFoundError as e:
        return _error(404, str(e))
    except ValidationError as e:
        return _error(400, str(e))

    return _json(200, result_record)


@bp.function_name("teams_delete")
@bp.route(route="teams/{teamId}", methods=["DELETE"], auth_level=func.AuthLevel.ANONYMOUS)
def delete_team(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    team_id = req.route_params.get("teamId")

    def remove_team(current):
        return ops.delete_team(current, team_id)

    try:
        atomic_update(_teams_path(user_id), remove_team, default=ops.EMPTY_TEAMS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except NotFoundError as e:
        return _error(404, str(e))

    return _json(200, {"deleted": team_id})


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
