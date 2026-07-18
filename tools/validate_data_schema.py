from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
USER_DATA_DIR = ROOT / "userdata"
DATA_DIR = ROOT / "data"
STAT_KEYS = {"hp", "atk", "def", "spa", "spd", "spe"}
EV_SYSTEM_KEYS = {"classic", "champions", "classic_ivs"}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_user_data(filename: str) -> Any:
    user_path = USER_DATA_DIR / filename
    if user_path.exists():
        return load_json(user_path)
    return load_json(DATA_DIR / filename.replace(".json", ".template.json"))


def add_error(errors: list[str], path: str, message: str) -> None:
    errors.append(f"{path}: {message}")


def validate_egg_moves(errors: list[str], path: str, egg_moves: Any) -> None:
    if egg_moves is None:
        return
    if not isinstance(egg_moves, list):
        add_error(errors, path, "egg_moves must be an array")
        return
    if len(egg_moves) > 4:
        add_error(errors, path, "egg_moves may contain at most 4 moves")
    for index, move in enumerate(egg_moves):
        if not isinstance(move, str) or not move.strip():
            add_error(errors, f"{path}[{index}]", "egg move must be a non-empty string")


def validate_evs(errors: list[str], path: str, evs: Any) -> None:
    if evs is None:
        return
    if not isinstance(evs, dict):
        add_error(errors, path, "evs must be an object")
        return
    flat_stats = sorted(k for k in evs if k in STAT_KEYS)
    if flat_stats:
        add_error(errors, path, f"flat EV stats are not allowed: {', '.join(flat_stats)}")
    for key, value in evs.items():
        if key not in EV_SYSTEM_KEYS:
            add_error(errors, f"{path}.{key}", "unknown EV object key")
            continue
        if not isinstance(value, dict):
            add_error(errors, f"{path}.{key}", "EV spread must be an object")
            continue
        invalid_stats = sorted(k for k in value if k not in STAT_KEYS)
        if invalid_stats:
            add_error(errors, f"{path}.{key}", f"unknown stat keys: {', '.join(invalid_stats)}")
        for stat, stat_value in value.items():
            if stat not in STAT_KEYS:
                continue
            if not isinstance(stat_value, int):
                add_error(errors, f"{path}.{key}.{stat}", "stat value must be an integer")


def validate_build_object(errors: list[str], path: str, build: Any) -> None:
    if build is None:
        return
    if not isinstance(build, dict):
        add_error(errors, path, "build must be an object")
        return
    if "species" not in build or not isinstance(build["species"], str) or not build["species"].strip():
        add_error(errors, f"{path}.species", "build species is required")
    if "evs" in build:
        validate_evs(errors, f"{path}.evs", build["evs"])
    if "egg_moves" in build:
        add_error(errors, f"{path}.egg_moves", "egg_moves must not be nested inside build; store them alongside library builds or inside slot.identity")


def validate_inventory(errors: list[str]) -> None:
    inventory = load_user_data("inventory.json")
    if "ownership" in inventory:
        add_error(errors, "data/inventory.json.ownership", "manual ownership state is not part of the canonical schema")
    boxes = inventory.get("boxes")
    if not isinstance(boxes, list):
        add_error(errors, "data/inventory.json.boxes", "boxes must be an array")
        return
    for box_index, box in enumerate(boxes):
        slots = box.get("slots") if isinstance(box, dict) else None
        if not isinstance(slots, list):
            add_error(errors, f"data/inventory.json.boxes[{box_index}].slots", "slots must be an array")
            continue
        for slot_index, slot in enumerate(slots):
            if slot is None:
                continue
            slot_path = f"data/inventory.json.boxes[{box_index}].slots[{slot_index}]"
            if not isinstance(slot, dict):
                add_error(errors, slot_path, "occupied slot must be an object")
                continue
            if "linked_build_id" in slot:
                add_error(errors, f"{slot_path}.linked_build_id", "use target_build_id")
            if "target_build_ids" in slot:
                add_error(errors, f"{slot_path}.target_build_ids", "multi-target arrays are not allowed")
            if "state" in slot or "species_id" in slot:
                add_error(errors, slot_path, "legacy projected slot fields are not allowed in storage")
            if "target_build_id" not in slot:
                add_error(errors, f"{slot_path}.target_build_id", "target_build_id is required, use null for no target")
            elif slot["target_build_id"] is not None and not isinstance(slot["target_build_id"], str):
                add_error(errors, f"{slot_path}.target_build_id", "target_build_id must be a string or null")
            identity = slot.get("identity")
            if identity is None:
                add_error(errors, f"{slot_path}.identity", "identity object is required")
            elif not isinstance(identity, dict):
                add_error(errors, f"{slot_path}.identity", "identity must be an object")
            else:
                validate_egg_moves(errors, f"{slot_path}.identity.egg_moves", identity.get("egg_moves"))
            validate_build_object(errors, f"{slot_path}.build", slot.get("build"))


def validate_builds(errors: list[str]) -> None:
    data = load_user_data("builds.json")
    builds = data.get("builds")
    if not isinstance(builds, list):
        add_error(errors, "data/builds.json.builds", "builds must be an array")
        return
    ALLOWED_BUILD_RECORD_KEYS = {
        "id", "kind", "slug", "build", "egg_moves", "notes", "source_url", "source",
    }
    KNOWN_SOURCES = {"smogon-bss", "smogon-sets"}
    for index, entry in enumerate(builds):
        path = f"data/builds.json.builds[{index}]"
        if not isinstance(entry, dict):
            add_error(errors, path, "build entry must be an object")
            continue
        extra = sorted(k for k in entry if k not in ALLOWED_BUILD_RECORD_KEYS)
        if extra:
            add_error(errors, path, f"unexpected top-level keys: {', '.join(extra)}")
        source = entry.get("source")
        if source is not None:
            if not isinstance(source, str) or source not in KNOWN_SOURCES:
                add_error(errors, f"{path}.source", f"source must be one of {sorted(KNOWN_SOURCES)} or absent")
        validate_build_object(errors, f"{path}.build", entry.get("build"))
        validate_egg_moves(errors, f"{path}.egg_moves", entry.get("egg_moves"))


def validate_teams(errors: list[str]) -> None:
    data = load_user_data("teams.json")
    teams = data.get("teams")
    if not isinstance(teams, list):
        add_error(errors, "data/teams.json.teams", "teams must be an array")
        return
    for team_index, team in enumerate(teams):
        if isinstance(team, dict) and "evs_migration_needed" in team:
            add_error(errors, f"data/teams.json.teams[{team_index}].evs_migration_needed", "evs_migration_needed is not part of the canonical schema")
        members = team.get("members") if isinstance(team, dict) else None
        if not isinstance(members, list):
            add_error(errors, f"data/teams.json.teams[{team_index}].members", "members must be an array")
            continue
        for member_index, member in enumerate(members):
            path = f"data/teams.json.teams[{team_index}].members[{member_index}]"
            if not isinstance(member, dict):
                add_error(errors, path, "member must be an object")
                continue
            extra_keys = sorted(key for key in member if key not in {"slot", "build_id"})
            if extra_keys:
                add_error(errors, path, f"unexpected keys: {', '.join(extra_keys)}")
            build_id = member.get("build_id")
            if not isinstance(build_id, str) or not build_id.strip():
                add_error(errors, f"{path}.build_id", "build_id must be a non-empty string")


def main() -> int:
    errors: list[str] = []
    validate_inventory(errors)
    validate_builds(errors)
    validate_teams(errors)

    if errors:
        print("Data schema validation failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print("Data schema validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
