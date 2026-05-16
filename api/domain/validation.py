"""EV and team validation — ported from serve.py."""
from __future__ import annotations

from typing import Any

EV_LIMITS = {
    "classic": {"per_stat": 252, "total": 510},
    "champions": {"per_stat": 32, "total": 66},
}


def validate_evs(evs: dict[str, Any]) -> list[str]:
    """Validate EV spreads. Returns list of error messages (empty = valid)."""
    errors: list[str] = []
    for system, limits in EV_LIMITS.items():
        spread = evs.get(system)
        if not spread or not isinstance(spread, dict):
            continue
        total = 0
        for stat, val in spread.items():
            if stat.startswith("classic_"):
                continue  # skip classic_ivs nested under wrong key
            if not isinstance(val, (int, float)):
                errors.append(f"{system}.{stat}: not a number")
                continue
            if val < 0:
                errors.append(f"{system}.{stat}: negative ({val})")
            elif val > limits["per_stat"]:
                errors.append(f"{system}.{stat}: {val} > {limits['per_stat']} max")
            total += val
        if total > limits["total"]:
            errors.append(f"{system} total: {total} > {limits['total']} max")

    # Validate IVs if present
    ivs = evs.get("classic_ivs")
    if ivs and isinstance(ivs, dict):
        for stat, val in ivs.items():
            if isinstance(val, (int, float)) and (val < 0 or val > 31):
                errors.append(f"classic_ivs.{stat}: {val} not in 0-31")
    return errors


def validate_team_members(body: dict[str, Any]) -> list[str]:
    """Validate canonical team member references."""
    errors: list[str] = []
    if "evs_migration_needed" in body:
        errors.append("team field evs_migration_needed is not allowed")
    members = body.get("members")
    if not members or not isinstance(members, list):
        return errors

    for i, member in enumerate(members):
        if not isinstance(member, dict):
            errors.append(f"slot {i + 1} member must be an object")
            continue
        label = f"slot {member.get('slot', i + 1)}"
        build_id = member.get("build_id")
        if not isinstance(build_id, str) or not build_id.strip():
            errors.append(f"{label} build_id is required")
        extra_keys = sorted(k for k in member.keys() if k not in {"slot", "build_id"})
        if extra_keys:
            errors.append(f"{label} unexpected keys: {', '.join(extra_keys)}")

    return errors
