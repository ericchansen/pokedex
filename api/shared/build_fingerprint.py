"""Build fingerprint — SHA-1 canonical hash for deduplication.

Copied from scripts/build_fingerprint.py. Two builds with the same
fingerprint are considered identical.
"""
from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping
from typing import Any

FINGERPRINT_VERSION = 2


def _sorted_dict(obj: Any) -> Any:
    if not isinstance(obj, Mapping):
        return obj
    return {k: _sorted_dict(obj[k]) for k in sorted(obj.keys())}


def _canonical_payload(build: Mapping[str, Any], egg_moves: Iterable[str] | None) -> dict:
    b = build or {}
    moves_in = b.get("moves") or []
    moves = list(moves_in) if isinstance(moves_in, list) else []
    evs_in = b.get("evs") or {}
    evs: dict = {}
    if isinstance(evs_in, Mapping):
        for sys_key in sorted(evs_in.keys()):
            spread = evs_in.get(sys_key) or {}
            evs[sys_key] = _sorted_dict(spread)
    egg_list = list(egg_moves) if egg_moves else []
    egg = sorted(egg_list)
    return {
        "v": FINGERPRINT_VERSION,
        "species": b.get("species") or None,
        "form": b.get("form") or None,
        "item": b.get("item") or None,
        "ability": b.get("ability") or None,
        "nature": b.get("nature") or None,
        "tera_type": b.get("tera_type") or None,
        "moves": moves,
        "evs": evs,
        "egg_moves": egg,
    }


def build_fingerprint(build: Mapping[str, Any], egg_moves: Iterable[str] | None = None) -> str:
    """Compute SHA-1 fingerprint of a build for deduplication."""
    payload = _canonical_payload(build, egg_moves)
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha1(encoded.encode("utf-8")).hexdigest()


def fingerprint_record(record: Mapping[str, Any]) -> str:
    """Takes a top-level record {id, slug, build, egg_moves} and returns its fingerprint."""
    return build_fingerprint(record.get("build") or {}, record.get("egg_moves") or [])
