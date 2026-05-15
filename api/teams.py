"""Teams API — CRUD for team compositions.

Storage: single blob per user at users/{userId}/teams.json
Shape: { "teams": [{ "id", "name", "game", "members": [{ "slot", "build_id" }] }] }
"""
from __future__ import annotations

import json

import azure.functions as func
from shared.auth import require_auth
from shared.blob_store import ConflictError, atomic_update, read_blob_or_default, user_path
from shared.ulid import generate_ulid
from shared.validation import validate_team_members

bp = func.Blueprint()

EMPTY_TEAMS = {"teams": []}


def _teams_path(user_id: str) -> str:
    return user_path(user_id, "teams.json")


@bp.function_name("teams_list")
@bp.route(route="teams", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def list_teams(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    data, _ = read_blob_or_default(_teams_path(user_id), EMPTY_TEAMS)
    return func.HttpResponse(
        json.dumps(data, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


@bp.function_name("teams_get")
@bp.route(route="teams/{teamId}", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def get_team(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    team_id = req.route_params.get("teamId")
    data, _ = read_blob_or_default(_teams_path(user_id), EMPTY_TEAMS)
    team = next((t for t in data["teams"] if t.get("id") == team_id), None)
    if not team:
        return _error(404, f"Team {team_id} not found")

    return func.HttpResponse(
        json.dumps(team, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


@bp.function_name("teams_create")
@bp.route(route="teams", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def create_team(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "Invalid JSON body")

    if not isinstance(body, dict):
        return _error(400, "Request body must be a JSON object")

    ev_errors = validate_team_members(body)
    if ev_errors:
        return _error(400, "Team validation failed: " + "; ".join(ev_errors))

    if "id" not in body:
        body["id"] = generate_ulid()

    def append_team(current):
        if not isinstance(current, dict) or "teams" not in current:
            current = {"teams": []}
        current["teams"].append(body)
        return current

    try:
        atomic_update(_teams_path(user_id), append_team, default=EMPTY_TEAMS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")

    return func.HttpResponse(
        json.dumps(body, ensure_ascii=False),
        status_code=201,
        mimetype="application/json",
    )


@bp.function_name("teams_update")
@bp.route(route="teams/{teamId}", methods=["PUT"], auth_level=func.AuthLevel.ANONYMOUS)
def update_team(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    team_id = req.route_params.get("teamId")

    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "Invalid JSON body")

    if not isinstance(body, dict):
        return _error(400, "Request body must be a JSON object")

    ev_errors = validate_team_members(body)
    if ev_errors:
        return _error(400, "Team validation failed: " + "; ".join(ev_errors))

    body["id"] = team_id

    def update_in_list(current):
        if not isinstance(current, dict) or "teams" not in current:
            raise ValueError("not_found")
        teams = current["teams"]
        idx = next((i for i, t in enumerate(teams) if t.get("id") == team_id), None)
        if idx is None:
            raise ValueError("not_found")
        teams[idx] = body
        return current

    try:
        atomic_update(_teams_path(user_id), update_in_list, default=EMPTY_TEAMS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except ValueError:
        return _error(404, f"Team {team_id} not found")

    return func.HttpResponse(
        json.dumps(body, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


@bp.function_name("teams_delete")
@bp.route(route="teams/{teamId}", methods=["DELETE"], auth_level=func.AuthLevel.ANONYMOUS)
def delete_team(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    team_id = req.route_params.get("teamId")

    found = False

    def remove_from_list(current):
        nonlocal found
        if not isinstance(current, dict) or "teams" not in current:
            return current
        before = len(current["teams"])
        current["teams"] = [t for t in current["teams"] if t.get("id") != team_id]
        found = len(current["teams"]) < before
        return current

    try:
        atomic_update(_teams_path(user_id), remove_from_list, default=EMPTY_TEAMS)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")

    if not found:
        return _error(404, f"Team {team_id} not found")

    return func.HttpResponse(
        json.dumps({"deleted": team_id}, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


def _error(status: int, message: str) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({"error": message}),
        status_code=status,
        mimetype="application/json",
    )
