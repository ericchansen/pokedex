"""Builds API — CRUD for competitive Pokémon builds.

Storage: per-build blobs + lightweight index.
- users/{userId}/builds/_index.json  → [{id, species, slug, fingerprint, updated}]
- users/{userId}/builds/{buildId}.json → full build record
"""
from __future__ import annotations

import time

import azure.functions as func

from shared.auth import require_auth
from shared.blob_store import atomic_update, delete_blob, read_blob, read_blob_or_default, user_path, write_blob
from shared.build_fingerprint import build_fingerprint
from shared.ulid import generate_ulid
from shared.validation import validate_evs

bp = func.Blueprint()


def _index_path(user_id: str) -> str:
    return user_path(user_id, "builds", "_index.json")


def _build_path(user_id: str, build_id: str) -> str:
    return user_path(user_id, "builds", f"{build_id}.json")


def _make_index_entry(record: dict) -> dict:
    """Create a lightweight index entry from a full build record."""
    build = record.get("build") or {}
    return {
        "id": record["id"],
        "species": build.get("species"),
        "slug": record.get("slug"),
        "fingerprint": record.get("fingerprint"),
        "updated": int(time.time() * 1000),
    }


@bp.function_name("builds_list")
@bp.route(route="builds", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def list_builds(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    # Read the single builds.json blob (whole-file, same as local mode)
    data, _ = read_blob_or_default(user_path(user_id, "builds.json"), {"builds": []})

    import json
    # Normalize: if data is already {"builds": [...]}, return as-is; else wrap
    if isinstance(data, dict) and "builds" in data:
        return func.HttpResponse(
            json.dumps(data, ensure_ascii=False),
            status_code=200,
            mimetype="application/json",
        )
    elif isinstance(data, list):
        return func.HttpResponse(
            json.dumps({"builds": data}, ensure_ascii=False),
            status_code=200,
            mimetype="application/json",
        )
    else:
        return func.HttpResponse(
            json.dumps({"builds": []}, ensure_ascii=False),
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
    try:
        record, _ = read_blob(_build_path(user_id, build_id))
    except Exception:
        return _error(404, f"Build {build_id} not found")

    import json
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

    import json
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
    index, _ = read_blob_or_default(_index_path(user_id), [])
    for entry in index:
        if entry.get("fingerprint") == incoming_fp:
            # Return existing build
            try:
                existing, _ = read_blob(_build_path(user_id, entry["id"]))
                return func.HttpResponse(
                    json.dumps(existing, ensure_ascii=False),
                    status_code=200,
                    mimetype="application/json",
                )
            except Exception:
                break  # Index stale, proceed with creation

    # Create new build
    build_id = generate_ulid()
    body["id"] = build_id
    body["fingerprint"] = incoming_fp
    write_blob(_build_path(user_id, build_id), body)

    # Update index
    new_entry = _make_index_entry(body)
    def append_to_index(current):
        if not isinstance(current, list):
            current = []
        current.append(new_entry)
        return current
    atomic_update(_index_path(user_id), append_to_index, default=[])

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

    import json
    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "Invalid JSON body")

    inner = body.get("build", {}) if isinstance(body, dict) else {}
    if isinstance(inner, dict) and "evs" in inner:
        ev_errors = validate_evs(inner["evs"])
        if ev_errors:
            return _error(400, "EV validation failed: " + "; ".join(ev_errors))

    # Verify exists
    try:
        read_blob(_build_path(user_id, build_id))
    except Exception:
        return _error(404, f"Build {build_id} not found")

    # Update
    body["id"] = build_id
    egg = body.get("egg_moves") if isinstance(body, dict) else None
    body["fingerprint"] = build_fingerprint(
        inner if isinstance(inner, dict) else {}, egg
    )
    write_blob(_build_path(user_id, build_id), body)

    # Update index entry
    updated_entry = _make_index_entry(body)
    def update_index(current):
        if not isinstance(current, list):
            current = []
        current = [e for e in current if e.get("id") != build_id]
        current.append(updated_entry)
        return current
    atomic_update(_index_path(user_id), update_index, default=[])

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

    # Verify exists
    try:
        read_blob(_build_path(user_id, build_id))
    except Exception:
        return _error(404, f"Build {build_id} not found")

    # Delete blob
    delete_blob(_build_path(user_id, build_id))

    # Remove from index
    def remove_from_index(current):
        if not isinstance(current, list):
            return []
        return [e for e in current if e.get("id") != build_id]
    atomic_update(_index_path(user_id), remove_from_index, default=[])

    import json
    return func.HttpResponse(
        json.dumps({"deleted": build_id}, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


def _error(status: int, message: str) -> func.HttpResponse:
    import json
    return func.HttpResponse(
        json.dumps({"error": message}),
        status_code=status,
        mimetype="application/json",
    )
