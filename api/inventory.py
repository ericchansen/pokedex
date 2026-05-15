"""Inventory API — HOME box grid management.

Storage: single blob per user at users/{userId}/inventory.json
Route ordering: /move and /batch MUST be registered before /{boxId} to avoid
treating them as box IDs.
"""
from __future__ import annotations

import json

import azure.functions as func
from shared.auth import require_auth
from shared.blob_store import ConflictError, atomic_update, read_blob_or_default, user_path
from shared.validation import validate_evs

bp = func.Blueprint()

EMPTY_INVENTORY = {
    "version": 1,
    "box_count": 200,
    "slots_per_box": 30,
    "columns": 6,
    "rows": 5,
    "boxes": [],
}


def _inventory_path(user_id: str) -> str:
    return user_path(user_id, "inventory.json")


def _ensure_boxes(data: dict) -> dict:
    """Ensure boxes array has the correct number of initialized boxes."""
    box_count = data.get("box_count", 200)
    slots_per_box = data.get("slots_per_box", 30)
    while len(data.get("boxes", [])) < box_count:
        data.setdefault("boxes", []).append({
            "name": f"Box {len(data['boxes']) + 1}",
            "slots": [None] * slots_per_box,
        })
    return data


# ── POST /api/inventory/move — MUST be before /{boxId} ──────────

@bp.function_name("inventory_move")
@bp.route(route="inventory/move", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def move_slot(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "Invalid JSON body")

    from_box = body.get("from_box")
    from_slot = body.get("from_slot")
    to_box = body.get("to_box")
    to_slot = body.get("to_slot")

    if any(v is None for v in (from_box, from_slot, to_box, to_slot)):
        return _error(400, "from_box, from_slot, to_box, to_slot required")

    def do_move(data):
        data = _ensure_boxes(data)
        boxes = data["boxes"]
        slots_per_box = data.get("slots_per_box", 30)

        if from_box < 0 or from_box >= len(boxes) or to_box < 0 or to_box >= len(boxes):
            raise ValueError("Box out of range")
        if from_slot < 0 or from_slot >= slots_per_box or to_slot < 0 or to_slot >= slots_per_box:
            raise ValueError("Slot out of range")

        # Swap
        src = boxes[from_box]["slots"][from_slot]
        dst = boxes[to_box]["slots"][to_slot]
        boxes[from_box]["slots"][from_slot] = dst
        boxes[to_box]["slots"][to_slot] = src
        move_result["data"] = {
            "moved": True,
            "from": {"box": from_box, "slot": from_slot, "occupant": dst},
            "to": {"box": to_box, "slot": to_slot, "occupant": src},
        }
        return data

    move_result: dict = {}
    try:
        atomic_update(_inventory_path(user_id), do_move, default=EMPTY_INVENTORY)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except ValueError as e:
        return _error(404, str(e))

    result = move_result.get("data", {"moved": True})
    return func.HttpResponse(json.dumps(result, ensure_ascii=False), status_code=200, mimetype="application/json")


# ── POST /api/inventory/batch — MUST be before /{boxId} ─────────

@bp.function_name("inventory_batch")
@bp.route(route="inventory/batch", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def batch_slots(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "Invalid JSON body")

    ops = body.get("operations")
    if not isinstance(ops, list) or not ops:
        return _error(400, "operations array required")

    results = []
    errors = []

    def do_batch(data):
        nonlocal results, errors
        results = []
        errors = []
        data = _ensure_boxes(data)
        boxes = data["boxes"]
        slots_per_box = data.get("slots_per_box", 30)

        for i, op in enumerate(ops):
            action = op.get("op", "set")
            box_id = op.get("box")
            slot_idx = op.get("slot")
            if box_id is None or slot_idx is None:
                errors.append(f"op[{i}]: box and slot required")
                continue
            if box_id < 0 or box_id >= len(boxes) or slot_idx < 0 or slot_idx >= slots_per_box:
                errors.append(f"op[{i}]: box {box_id} slot {slot_idx} out of range")
                continue

            if action == "clear":
                boxes[box_id]["slots"][slot_idx] = None
                results.append({"box": box_id, "slot": slot_idx, "cleared": True})
            elif action == "set":
                build = op.get("build")
                if not isinstance(build, dict) or not build.get("species"):
                    errors.append(f"op[{i}]: build.species required for set")
                    continue
                if "evs" in build:
                    ev_errors = validate_evs(build["evs"])
                    if ev_errors:
                        errors.append(f"op[{i}]: " + "; ".join(ev_errors))
                        continue
                occupant = {
                    "build": build,
                    "identity": op.get("identity", {}),
                    "target_build_id": op.get("target_build_id"),
                }
                boxes[box_id]["slots"][slot_idx] = occupant
                results.append({"box": box_id, "slot": slot_idx, "occupant": occupant})
            else:
                errors.append(f"op[{i}]: unknown op '{action}'")

        return data

    try:
        atomic_update(_inventory_path(user_id), do_batch, default=EMPTY_INVENTORY)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")

    if errors and not results:
        return _error(400, "; ".join(errors))

    resp: dict = {"applied": len(results), "results": results}
    if errors:
        resp["errors"] = errors
    return func.HttpResponse(json.dumps(resp, ensure_ascii=False), status_code=200, mimetype="application/json")


# ── GET /api/inventory — all boxes (sparse) ─────────────────────

@bp.function_name("inventory_list")
@bp.route(route="inventory", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def list_inventory(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    data, _ = read_blob_or_default(_inventory_path(user_id), EMPTY_INVENTORY)
    data = _ensure_boxes(data)
    sparse = {
        "version": data.get("version", 1),
        "box_count": data.get("box_count", 200),
        "slots_per_box": data.get("slots_per_box", 30),
        "columns": data.get("columns", 6),
        "rows": data.get("rows", 5),
        "boxes": data["boxes"],
    }
    return func.HttpResponse(json.dumps(sparse, ensure_ascii=False), status_code=200, mimetype="application/json")


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

    data, _ = read_blob_or_default(_inventory_path(user_id), EMPTY_INVENTORY)
    data = _ensure_boxes(data)
    if box_id < 0 or box_id >= len(data["boxes"]):
        return _error(404, f"Box {box_id} not found")

    box_json = json.dumps(data["boxes"][box_id], ensure_ascii=False)
    return func.HttpResponse(box_json, status_code=200, mimetype="application/json")


# ── PUT /api/inventory/{boxId} — rename box ──────────────────────

@bp.function_name("inventory_rename_box")
@bp.route(route="inventory/{boxId}", methods=["PUT"], auth_level=func.AuthLevel.ANONYMOUS)
def rename_box(req: func.HttpRequest) -> func.HttpResponse:
    user_id, err = require_auth(req)
    if err:
        return err

    box_id = _parse_box_id(req)
    if isinstance(box_id, func.HttpResponse):
        return box_id

    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "Invalid JSON body")

    rename_result: dict = {}

    def do_rename(data):
        data = _ensure_boxes(data)
        if box_id < 0 or box_id >= len(data["boxes"]):
            raise ValueError(f"Box {box_id} not found")
        if "name" in body:
            data["boxes"][box_id]["name"] = body["name"]
        rename_result["data"] = data["boxes"][box_id].copy()
        return data

    try:
        atomic_update(_inventory_path(user_id), do_rename, default=EMPTY_INVENTORY)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except ValueError as e:
        return _error(404, str(e))

    result = rename_result.get("data", {})
    return func.HttpResponse(json.dumps(result, ensure_ascii=False), status_code=200, mimetype="application/json")


# ── PUT /api/inventory/{boxId}/{slot} — set slot ─────────────────

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

    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "Invalid JSON body")

    build = body.get("build")
    if not isinstance(build, dict) or not build.get("species"):
        return _error(400, "build.species is required")

    target_build_id = body.get("target_build_id")
    if target_build_id is not None and not isinstance(target_build_id, str):
        return _error(400, "target_build_id must be a string or null")

    identity = body.get("identity")
    if identity is None:
        identity = {}
    if not isinstance(identity, dict):
        return _error(400, "identity must be an object")

    if "evs" in build:
        ev_errors = validate_evs(build["evs"])
        if ev_errors:
            return _error(400, "EV validation failed: " + "; ".join(ev_errors))

    occupant = {
        "build": build,
        "identity": identity,
        "target_build_id": target_build_id,
    }

    def do_set(data):
        data = _ensure_boxes(data)
        if box_id < 0 or box_id >= len(data["boxes"]):
            raise ValueError(f"Box {box_id} not found")
        slots_per_box = data.get("slots_per_box", 30)
        if slot_idx < 0 or slot_idx >= slots_per_box:
            raise ValueError(f"Slot {slot_idx} out of range")
        data["boxes"][box_id]["slots"][slot_idx] = occupant
        return data

    try:
        atomic_update(_inventory_path(user_id), do_set, default=EMPTY_INVENTORY)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except ValueError as e:
        return _error(404, str(e))

    return func.HttpResponse(json.dumps(occupant, ensure_ascii=False), status_code=200, mimetype="application/json")


# ── DELETE /api/inventory/{boxId}/{slot} — clear slot ────────────

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
        data = _ensure_boxes(data)
        if box_id < 0 or box_id >= len(data["boxes"]):
            raise ValueError(f"Box {box_id} not found")
        slots_per_box = data.get("slots_per_box", 30)
        if slot_idx < 0 or slot_idx >= slots_per_box:
            raise ValueError(f"Slot {slot_idx} out of range")
        data["boxes"][box_id]["slots"][slot_idx] = None
        return data

    try:
        atomic_update(_inventory_path(user_id), do_clear, default=EMPTY_INVENTORY)
    except ConflictError:
        return _error(409, "Concurrent modification — please retry")
    except ValueError as e:
        return _error(404, str(e))

    return func.HttpResponse(
        json.dumps({"cleared": True, "box": box_id, "slot": slot_idx}, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
    )


# ── Helpers ──────────────────────────────────────────────────────

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


def _error(status: int, message: str) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({"error": message}),
        status_code=status,
        mimetype="application/json",
    )
