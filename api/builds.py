"""Builds API — CRUD for competitive Pokémon builds.

Storage: single blob per user at users/{userId}/builds.json
Shape: { "meta": {...}, "builds": [...] } or { "builds": [...] }
"""
from __future__ import annotations

import json

import azure.functions as func
from shared.auth import require_auth
from shared.blob_store import ConflictError, atomic_update, read_blob_or_default, user_path
from shared.build_fingerprint import build_fingerprint
from shared.ulid import generate_ulid
from shared.validation import validate_evs

bp = func.Blueprint()

EMPTY_BUILDS = {"builds": []}


def _builds_path(user_id: str) -> str:
    return user_path(user_id, "builds.json")


def _normalize(data) -> dict:
    """Ensure data is in {builds: [...]} shape."""
    if isinstance(data, dict) and "builds" in data:
        return data
    if isinstance(data, list):
        return {"builds": data}
    return {"builds": []}


@bp.function_name("builds_list")
@bp.route(route="builds", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def list_builds(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    data, _ = read_blob_or_default(_builds_path(user_id), EMPTY_BUILDS)
    data = _normalize(data)
    return func.HttpResponse(
        json.dumps(data, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


@bp.function_name("builds_get")
@bp.route(route="builds/{buildId}", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def get_build(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    build_id = req.route_params.get("buildId")
    data, _ = read_blob_or_default(_builds_path(user_id), EMPTY_BUILDS)
    data = _normalize(data)
    record = next((b for b in data["builds"] if b.get("id") == build_id), None)
    if not record:
        return _error(404, f"Build {build_id} not found")

    return func.HttpResponse(
        json.dumps(record, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


@bp.function_name("builds_create")
@bp.route(route="builds", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def create_build(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "Invalid JSON body")

    inner = body.get("build", {}) if isinstance(body, dict) else {}
    if isinstance(inner, dict) and "evs" in inner:
        ev_errors = validate_evs(inner["evs"])
        if ev_errors:
            return _error(400, "EV validation failed: " + "; ".join(ev_errors))

    # Dedupe check via fingerprint
    egg = body.get("egg_moves") if isinstance(body, dict) else None
    incoming_fp = build_fingerprint(
        inner if isinstance(inner, dict) else {}, egg
    )

    # Create new build
    build_id = generate_ulid()
    body["id"] = build_id
    body["fingerprint"] = incoming_fp

    existing_match = None

    def append_build(current):
        nonlocal existing_match
        current = _normalize(current)
        # Dedupe inside callback to handle retries with fresh data
        for b in current["builds"]:
            if b.get("fingerprint") == incoming_fp:
                existing_match = b
                return current  # No mutation — return as-is
        existing_match = None
        current["builds"].append(body)
        return current

    try:
        atomic_update(_builds_path(user_id), append_build, default=EMPTY_BUILDS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")

    # Return existing if dedupe found a match
    if existing_match:
        return func.HttpResponse(
            json.dumps(existing_match, ensure_ascii=False),
            status_code=200,
            mimetype="application/json",
        )

    return func.HttpResponse(
        json.dumps(body, ensure_ascii=False),
        status_code=201,
        mimetype="application/json",
    )


@bp.function_name("builds_update")
@bp.route(route="builds/{buildId}", methods=["PUT"], auth_level=func.AuthLevel.ANONYMOUS)
def update_build(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    build_id = req.route_params.get("buildId")

    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "Invalid JSON body")

    inner = body.get("build", {}) if isinstance(body, dict) else {}
    if isinstance(inner, dict) and "evs" in inner:
        ev_errors = validate_evs(inner["evs"])
        if ev_errors:
            return _error(400, "EV validation failed: " + "; ".join(ev_errors))

    body["id"] = build_id
    egg = body.get("egg_moves") if isinstance(body, dict) else None
    body["fingerprint"] = build_fingerprint(
        inner if isinstance(inner, dict) else {}, egg
    )

    found = False

    def replace_build(current):
        nonlocal found
        found = False  # Reset on each retry
        current = _normalize(current)
        for i, b in enumerate(current["builds"]):
            if b.get("id") == build_id:
                current["builds"][i] = body
                found = True
                return current
        return current

    try:
        atomic_update(_builds_path(user_id), replace_build, default=EMPTY_BUILDS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")

    if not found:
        return _error(404, f"Build {build_id} not found")

    return func.HttpResponse(
        json.dumps(body, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


@bp.function_name("builds_delete")
@bp.route(route="builds/{buildId}", methods=["DELETE"], auth_level=func.AuthLevel.ANONYMOUS)
def delete_build(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    build_id = req.route_params.get("buildId")

    found = False

    def remove_build(current):
        nonlocal found
        current = _normalize(current)
        before = len(current["builds"])
        current["builds"] = [b for b in current["builds"] if b.get("id") != build_id]
        found = len(current["builds"]) < before
        return current

    try:
        atomic_update(_builds_path(user_id), remove_build, default=EMPTY_BUILDS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")

    if not found:
        return _error(404, f"Build {build_id} not found")

    return func.HttpResponse(
        json.dumps({"deleted": build_id}, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


def _error(status: int, message: str) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({"error": message}),
        status_code=status,
        mimetype="application/json",
    )
