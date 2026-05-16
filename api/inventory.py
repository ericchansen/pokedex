"""Inventory API — HOME box grid management.

Storage: single blob per user at users/{userId}/inventory.json
Route ordering: /move and /batch MUST be registered before /{boxId} to avoid
treating them as box IDs.

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


def _inventory_path(user_id: str) -> str:
    from shared.blob_store import user_path
    return user_path(user_id, "inventory.json")


# ── POST /api/inventory/move — MUST be before /{boxId} ──────────

@bp.function_name("inventory_move")
@bp.route(route="inventory/move", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def move_slot(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    body, body_err = _parse_body(req)
    if body_err:
        return body_err

    from_box = body.get("from_box")
    from_slot = body.get("from_slot")
    to_box = body.get("to_box")
    to_slot = body.get("to_slot")

    if any(v is None for v in (from_box, from_slot, to_box, to_slot)):
        return _error(400, "from_box, from_slot, to_box, to_slot required")
    if not all(isinstance(v, int) for v in (from_box, from_slot, to_box, to_slot)):
        return _error(400, "from_box, from_slot, to_box, to_slot must be integers")

    result_data = None

    def do_move(data):
        nonlocal result_data
        new_data, result = ops.move_slots(data, from_box, from_slot, to_box, to_slot)
        result_data = result
        return new_data

    try:
        atomic_update(_inventory_path(user_id), do_move, default=ops.EMPTY_INVENTORY)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except NotFoundError as e:
        return _error(404, str(e))

    return _json(200, result_data)


# ── POST /api/inventory/batch — MUST be before /{boxId} ─────────

@bp.function_name("inventory_batch")
@bp.route(route="inventory/batch", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def batch_slots(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    body, body_err = _parse_body(req)
    if body_err:
        return body_err

    batch_results = None
    batch_errors = None

    def do_batch(data):
        nonlocal batch_results, batch_errors
        new_data, results, errors = ops.batch_slots(data, body.get("operations"))
        batch_results = results
        batch_errors = errors
        return new_data

    try:
        atomic_update(_inventory_path(user_id), do_batch, default=ops.EMPTY_INVENTORY)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except ValidationError as e:
        return _error(400, str(e))

    if batch_errors and not batch_results:
        return _error(400, "; ".join(batch_errors))

    resp: dict = {"applied": len(batch_results), "results": batch_results}
    if batch_errors:
        resp["errors"] = batch_errors
    return _json(200, resp)


# ── GET /api/inventory — all boxes (sparse) ─────────────────

@bp.function_name("inventory_list")
@bp.route(route="inventory", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def list_inventory(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    data, _ = read_blob_or_default(_inventory_path(user_id), ops.EMPTY_INVENTORY)
    return _json(200, ops.sparse_inventory(data))


# ── GET /api/inventory/{boxId} ───────────────────────────────────

@bp.function_name("inventory_get_box")
@bp.route(route="inventory/{boxId}", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def get_box(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    box_id = _parse_box_id(req)
    if isinstance(box_id, func.HttpResponse):
        return box_id

    data, _ = read_blob_or_default(_inventory_path(user_id), ops.EMPTY_INVENTORY)
    try:
        box = ops.get_box(data, box_id)
    except NotFoundError as e:
        return _error(404, str(e))

    return _json(200, box)


# ── PUT /api/inventory/{boxId} — rename box ──────────────────

@bp.function_name("inventory_rename_box")
@bp.route(route="inventory/{boxId}", methods=["PUT"], auth_level=func.AuthLevel.ANONYMOUS)
def rename_box(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    box_id = _parse_box_id(req)
    if isinstance(box_id, func.HttpResponse):
        return box_id

    body, body_err = _parse_body(req)
    if body_err:
        return body_err

    result_box = None

    def do_rename(data):
        nonlocal result_box
        new_data, box_dict = ops.rename_box(data, box_id, body.get("name"))
        result_box = box_dict.copy()
        return new_data

    try:
        atomic_update(_inventory_path(user_id), do_rename, default=ops.EMPTY_INVENTORY)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except NotFoundError as e:
        return _error(404, str(e))

    return _json(200, result_box)


# ── PUT /api/inventory/{boxId}/{slot} — set slot ─────────────

@bp.function_name("inventory_set_slot")
@bp.route(route="inventory/{boxId}/{slot}", methods=["PUT"], auth_level=func.AuthLevel.ANONYMOUS)
def set_slot(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    box_id = _parse_box_id(req)
    if isinstance(box_id, func.HttpResponse):
        return box_id

    slot_idx = _parse_slot(req)
    if isinstance(slot_idx, func.HttpResponse):
        return slot_idx

    body, body_err = _parse_body(req)
    if body_err:
        return body_err

    # Validate slot body *before* entering atomic_update (fail fast)
    try:
        occupant = ops.validate_slot_body(body)
    except ValidationError as e:
        return _error(400, str(e))

    result_occupant = None

    def do_set(data):
        nonlocal result_occupant
        new_data, occ = ops.set_slot(data, box_id, slot_idx, occupant)
        result_occupant = occ
        return new_data

    try:
        atomic_update(_inventory_path(user_id), do_set, default=ops.EMPTY_INVENTORY)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except NotFoundError as e:
        return _error(404, str(e))

    return _json(200, result_occupant)


# ── DELETE /api/inventory/{boxId}/{slot} — clear slot ──────────

@bp.function_name("inventory_clear_slot")
@bp.route(route="inventory/{boxId}/{slot}", methods=["DELETE"], auth_level=func.AuthLevel.ANONYMOUS)
def clear_slot(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    box_id = _parse_box_id(req)
    if isinstance(box_id, func.HttpResponse):
        return box_id

    slot_idx = _parse_slot(req)
    if isinstance(slot_idx, func.HttpResponse):
        return slot_idx

    def do_clear(data):
        return ops.clear_slot(data, box_id, slot_idx)

    try:
        atomic_update(_inventory_path(user_id), do_clear, default=ops.EMPTY_INVENTORY)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except NotFoundError as e:
        return _error(404, str(e))

    return _json(200, {"cleared": True, "box": box_id, "slot": slot_idx})


# ── Helpers ────────────────────────────────────────────────────────────


def _parse_box_id(req: func.HttpRequest) -> int | func.HttpResponse:
    try:
        return int(req.route_params.get("boxId"))
    except (TypeError, ValueError):
        return _error(400, f"Invalid box ID: {req.route_params.get('boxId')}")


def _parse_slot(req: func.HttpRequest) -> int | func.HttpResponse:
    try:
        return int(req.route_params.get("slot"))
    except (TypeError, ValueError):
        return _error(400, f"Invalid slot index: {req.route_params.get('slot')}")


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
