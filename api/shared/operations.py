"""Shared CRUD operations — pure functions on data dicts.

Both backends (serve.py local, api/*.py cloud) call these functions for domain
logic. No HTTP, no storage — callers handle I/O and map domain exceptions to
their transport layer (HTTP status codes, etc.).

Convention: mutating operations return (new_data, result_record). Callers
persist new_data and respond with result_record.
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from shared.build_fingerprint import build_fingerprint, fingerprint_record
from shared.ulid import generate_ulid
from shared.validation import validate_evs, validate_team_members

# ── Domain exceptions ───────────────────────────────────────────────


class DomainError(Exception):
    """Base for all domain-layer errors."""


class NotFoundError(DomainError):
    """Resource does not exist."""


class ValidationError(DomainError):
    """Input failed validation."""


class DuplicateBuildError(DomainError):
    """A build with an identical fingerprint already exists."""

    def __init__(self, existing: dict):
        self.existing = existing
        super().__init__("Duplicate build")


class FKConflictError(DomainError):
    """Deletion blocked by a foreign-key reference."""

    def __init__(self, message: str):
        super().__init__(message)


# ── Builds ──────────────────────────────────────────────────────────

EMPTY_BUILDS: dict = {"builds": []}

_DEPRECATED_SLOT_KEYS = frozenset({"linked_build_id", "target_build_ids"})


def normalize_builds(data: Any) -> dict:
    """Ensure data is in ``{builds: [...]}`` shape."""
    if isinstance(data, dict) and "builds" in data:
        return data
    if isinstance(data, list):
        return {"builds": data}
    return {"builds": []}


def create_build(data: dict, body: dict) -> tuple[dict, dict]:
    """Validate, dedupe, assign ID, and append a new build.

    Returns (mutated_data, new_record).
    Raises DuplicateBuildError(existing) if fingerprint already exists.
    Raises ValidationError on bad EVs.
    """
    data = normalize_builds(data)
    inner = body.get("build", {})
    if not isinstance(inner, dict):
        inner = {}

    if "evs" in inner:
        ev_errors = validate_evs(inner["evs"])
        if ev_errors:
            raise ValidationError("EV validation failed: " + "; ".join(ev_errors))

    incoming_fp = build_fingerprint(inner, body.get("egg_moves"))

    # Dedupe: prefer stored fingerprint, fall back to recompute
    for existing in data["builds"]:
        stored_fp = existing.get("fingerprint")
        if stored_fp:
            if stored_fp == incoming_fp:
                raise DuplicateBuildError(existing)
        else:
            # No stored fingerprint — recompute from record
            if fingerprint_record(existing) == incoming_fp:
                raise DuplicateBuildError(existing)

    body["id"] = generate_ulid()
    body["fingerprint"] = incoming_fp
    data["builds"].append(body)
    return data, body


def get_build(data: dict, build_id: str) -> dict:
    """Find a build by ID. Raises NotFoundError if missing."""
    data = normalize_builds(data)
    record = next((b for b in data["builds"] if b.get("id") == build_id), None)
    if not record:
        raise NotFoundError(f"Build {build_id} not found")
    return record


def list_builds(data: dict) -> dict:
    """Return normalized builds data."""
    return normalize_builds(data)


def update_build(data: dict, build_id: str, body: dict) -> tuple[dict, dict]:
    """Validate EVs, recompute fingerprint, replace build in-place.

    Returns (mutated_data, updated_record).
    Raises NotFoundError if build_id not found.
    Raises ValidationError on bad EVs.
    """
    data = normalize_builds(data)
    inner = body.get("build", {})
    if not isinstance(inner, dict):
        inner = {}

    if "evs" in inner:
        ev_errors = validate_evs(inner["evs"])
        if ev_errors:
            raise ValidationError("EV validation failed: " + "; ".join(ev_errors))

    body["id"] = build_id
    body["fingerprint"] = build_fingerprint(inner, body.get("egg_moves"))

    for i, b in enumerate(data["builds"]):
        if b.get("id") == build_id:
            data["builds"][i] = body
            return data, body

    raise NotFoundError(f"Build {build_id} not found")


def delete_build(
    data: dict,
    build_id: str,
    teams_reader: Callable[[], dict],
) -> dict:
    """Remove a build, checking FK references via teams_reader().

    teams_reader is a callable that returns the current teams data dict.
    In the cloud backend, this reads the teams blob *inside* the atomic_update
    retry loop, ensuring fresh data. In the local backend, the global lock
    already serializes access, so it simply reads the file.

    Note — known limitation (cloud only): the FK check and the builds-blob
    commit are NOT cross-blob atomic.  A concurrent team create/update could
    reference this build between the teams_reader() call and the ETag-guarded
    write, leaving a dangling build_id.  Fixing this would require a per-user
    lease blob or similar cross-resource lock, which adds significant
    complexity for a very low-probability race.  The local backend is immune
    (global threading lock serializes all writes).

    Returns mutated_data.
    Raises NotFoundError if build_id not found.
    Raises FKConflictError if a team references this build.
    """
    data = normalize_builds(data)

    # FK guard
    teams_data = teams_reader()
    if isinstance(teams_data, dict):
        for team in teams_data.get("teams", []):
            for member in team.get("members", []):
                if isinstance(member, dict) and member.get("build_id") == build_id:
                    team_name = team.get("name", team.get("id", "unknown"))
                    raise FKConflictError(
                        f"Build {build_id} is referenced by team "
                        f"'{team_name}' — remove it from the team first"
                    )

    before = len(data["builds"])
    data["builds"] = [b for b in data["builds"] if b.get("id") != build_id]
    if len(data["builds"]) == before:
        raise NotFoundError(f"Build {build_id} not found")

    return data


# ── Teams ───────────────────────────────────────────────────────────

EMPTY_TEAMS: dict = {"teams": []}


def _normalize_teams(data: Any) -> dict:
    """Ensure data is in ``{teams: [...]}`` shape."""
    if isinstance(data, dict) and "teams" in data:
        return data
    return {"teams": []}


def create_team(data: dict, body: dict) -> tuple[dict, dict]:
    """Validate members, assign ID, append team.

    Returns (mutated_data, new_record).
    Raises ValidationError on bad members.
    """
    data = _normalize_teams(data)

    ev_errors = validate_team_members(body)
    if ev_errors:
        raise ValidationError("Team validation failed: " + "; ".join(ev_errors))

    if "id" not in body:
        body["id"] = generate_ulid()

    data["teams"].append(body)
    return data, body


def get_team(data: dict, team_id: str) -> dict:
    """Find a team by ID. Raises NotFoundError if missing."""
    data = _normalize_teams(data)
    record = next((t for t in data["teams"] if t.get("id") == team_id), None)
    if not record:
        raise NotFoundError(f"Team {team_id} not found")
    return record


def list_teams(data: dict) -> dict:
    """Return normalized teams data."""
    return _normalize_teams(data)


def update_team(data: dict, team_id: str, body: dict) -> tuple[dict, dict]:
    """Validate members, replace team in-place.

    Returns (mutated_data, updated_record).
    Raises NotFoundError if team_id not found.
    Raises ValidationError on bad members.
    """
    data = _normalize_teams(data)

    ev_errors = validate_team_members(body)
    if ev_errors:
        raise ValidationError("Team validation failed: " + "; ".join(ev_errors))

    body["id"] = team_id

    for i, t in enumerate(data["teams"]):
        if t.get("id") == team_id:
            data["teams"][i] = body
            return data, body

    raise NotFoundError(f"Team {team_id} not found")


def delete_team(data: dict, team_id: str) -> dict:
    """Remove a team by ID. Returns mutated_data. Raises NotFoundError."""
    data = _normalize_teams(data)
    before = len(data["teams"])
    data["teams"] = [t for t in data["teams"] if t.get("id") != team_id]
    if len(data["teams"]) == before:
        raise NotFoundError(f"Team {team_id} not found")
    return data


# ── Inventory ───────────────────────────────────────────────────────

EMPTY_INVENTORY: dict = {
    "version": 1,
    "box_count": 200,
    "slots_per_box": 30,
    "columns": 6,
    "rows": 5,
    "boxes": [],
}


def ensure_boxes(data: dict) -> dict:
    """Ensure boxes array has the correct number of initialized boxes."""
    box_count = data.get("box_count", 200)
    slots_per_box = data.get("slots_per_box", 30)
    boxes = data.setdefault("boxes", [])
    while len(boxes) < box_count:
        boxes.append({
            "name": f"Box {len(boxes) + 1}",
            "slots": [None] * slots_per_box,
        })
    return data


def sparse_inventory(data: dict) -> dict:
    """Return the inventory metadata + boxes (full representation)."""
    data = ensure_boxes(data)
    return {
        "version": data.get("version", 1),
        "box_count": data.get("box_count", 200),
        "slots_per_box": data.get("slots_per_box", 30),
        "columns": data.get("columns", 6),
        "rows": data.get("rows", 5),
        "boxes": data["boxes"],
    }


def get_box(data: dict, box_id: int) -> dict:
    """Return a single box by index. Raises NotFoundError."""
    data = ensure_boxes(data)
    if box_id < 0 or box_id >= len(data["boxes"]):
        raise NotFoundError(f"Box {box_id} not found")
    return data["boxes"][box_id]


def rename_box(data: dict, box_id: int, name: str | None) -> tuple[dict, dict]:
    """Rename a box. Returns (mutated_data, box_dict). Raises NotFoundError."""
    data = ensure_boxes(data)
    if box_id < 0 or box_id >= len(data["boxes"]):
        raise NotFoundError(f"Box {box_id} not found")
    if name is not None:
        data["boxes"][box_id]["name"] = name
    return data, data["boxes"][box_id]


def validate_slot_body(body: dict) -> dict:
    """Validate and extract a slot occupant from a request body.

    Returns the validated occupant dict.
    Raises ValidationError on bad input.
    """
    build = body.get("build")
    if not isinstance(build, dict) or not build.get("species"):
        raise ValidationError("build.species is required")

    # Reject deprecated field aliases
    if any(key in body for key in _DEPRECATED_SLOT_KEYS):
        raise ValidationError(
            "Use target_build_id; deprecated target aliases are not accepted"
        )

    target_build_id = body.get("target_build_id")
    if target_build_id is not None and not isinstance(target_build_id, str):
        raise ValidationError("target_build_id must be a string or null")

    identity = body.get("identity")
    if identity is None:
        identity = {}
    if not isinstance(identity, dict):
        raise ValidationError("identity must be an object")

    if "evs" in build:
        ev_errors = validate_evs(build["evs"])
        if ev_errors:
            raise ValidationError("EV validation failed: " + "; ".join(ev_errors))

    return {
        "build": build,
        "identity": identity,
        "target_build_id": target_build_id,
    }


def set_slot(data: dict, box_id: int, slot_idx: int, occupant: dict) -> tuple[dict, dict]:
    """Place an occupant in a specific slot.

    Returns (mutated_data, occupant).
    Raises NotFoundError if box/slot out of range.
    """
    data = ensure_boxes(data)
    if box_id < 0 or box_id >= len(data["boxes"]):
        raise NotFoundError(f"Box {box_id} not found")
    slots_per_box = data.get("slots_per_box", 30)
    if slot_idx < 0 or slot_idx >= slots_per_box:
        raise NotFoundError(f"Slot {slot_idx} out of range")
    data["boxes"][box_id]["slots"][slot_idx] = occupant
    return data, occupant


def clear_slot(data: dict, box_id: int, slot_idx: int) -> dict:
    """Clear a slot. Returns mutated_data. Raises NotFoundError."""
    data = ensure_boxes(data)
    if box_id < 0 or box_id >= len(data["boxes"]):
        raise NotFoundError(f"Box {box_id} not found")
    slots_per_box = data.get("slots_per_box", 30)
    if slot_idx < 0 or slot_idx >= slots_per_box:
        raise NotFoundError(f"Slot {slot_idx} out of range")
    data["boxes"][box_id]["slots"][slot_idx] = None
    return data


def move_slots(
    data: dict,
    from_box: int,
    from_slot: int,
    to_box: int,
    to_slot: int,
) -> tuple[dict, dict]:
    """Swap two slots. Returns (mutated_data, result_dict).

    Raises ValidationError if indices are missing or non-integer.
    Raises NotFoundError if box/slot out of range.
    """
    data = ensure_boxes(data)
    boxes = data["boxes"]
    slots_per_box = data.get("slots_per_box", 30)

    if from_box < 0 or from_box >= len(boxes) or to_box < 0 or to_box >= len(boxes):
        raise NotFoundError("Box out of range")
    if from_slot < 0 or from_slot >= slots_per_box or to_slot < 0 or to_slot >= slots_per_box:
        raise NotFoundError("Slot out of range")

    src = boxes[from_box]["slots"][from_slot]
    dst = boxes[to_box]["slots"][to_slot]
    boxes[from_box]["slots"][from_slot] = dst
    boxes[to_box]["slots"][to_slot] = src

    return data, {
        "moved": True,
        "from": {"box": from_box, "slot": from_slot, "occupant": dst},
        "to": {"box": to_box, "slot": to_slot, "occupant": src},
    }


def batch_slots(
    data: dict,
    operations: list[dict],
) -> tuple[dict, list[dict], list[str]]:
    """Apply multiple set/clear operations atomically.

    Returns (mutated_data, results, errors).
    Individual op errors are collected in errors list; valid ops still apply.
    Raises ValidationError if operations is not a non-empty list.
    """
    if not isinstance(operations, list) or not operations:
        raise ValidationError("operations array required")

    data = ensure_boxes(data)
    boxes = data["boxes"]
    slots_per_box = data.get("slots_per_box", 30)
    results: list[dict] = []
    errors: list[str] = []

    for i, op in enumerate(operations):
        action = op.get("op", "set")
        box_id = op.get("box")
        slot_idx = op.get("slot")

        if box_id is None or slot_idx is None:
            errors.append(f"op[{i}]: box and slot required")
            continue
        if not isinstance(box_id, int) or not isinstance(slot_idx, int):
            errors.append(f"op[{i}]: box and slot must be integers")
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

    return data, results, errors
