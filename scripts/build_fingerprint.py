"""Build fingerprint helper.

Mirrors site/js/buildFingerprint.js exactly. Two builds with the same
fingerprint are considered identical for de-duplication purposes.

Identity rules:
  - species, form, item, ability, nature: as stored
  - moves: ORDER-SENSITIVE
  - evs: per-system; each system's spread sorted by stat key. Different
         EV systems (champions vs classic) are NOT collapsed.
  - egg_moves: SORTED (set semantics)
  - slug is excluded (derived from species+form)

Algorithm: canonical-keys JSON over a fixed payload, SHA-1 of UTF-8 bytes.
"""
from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping
from typing import Any

FINGERPRINT_VERSION = 1


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
        for sys in sorted(evs_in.keys()):
            spread = evs_in.get(sys) or {}
            evs[sys] = _sorted_dict(spread)
    egg_list = list(egg_moves) if egg_moves else []
    egg = sorted(egg_list)
    return {
        "v": FINGERPRINT_VERSION,
        "species": b.get("species") or None,
        "form": b.get("form") or None,
        "item": b.get("item") or None,
        "ability": b.get("ability") or None,
        "nature": b.get("nature") or None,
        "moves": moves,
        "evs": evs,
        "egg_moves": egg,
    }


def build_fingerprint(build: Mapping[str, Any], egg_moves: Iterable[str] | None = None) -> str:
    payload = _canonical_payload(build, egg_moves)
    # sort_keys=True + separators matches the JS stableStringify exactly
    # (no whitespace, sorted keys at every level).
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha1(encoded.encode("utf-8")).hexdigest()


def fingerprint_record(record: Mapping[str, Any]) -> str:
    """Convenience: takes a top-level builds.json record `{id, slug, build, egg_moves}`."""
    return build_fingerprint(record.get("build") or {}, record.get("egg_moves") or [])


if __name__ == "__main__":
    # Quick smoke: print fingerprints for first 5 builds
    import sys
    from pathlib import Path

    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "data" / "builds.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    for rec in doc["builds"][:5]:
        fp = fingerprint_record(rec)
        species = (rec.get("build") or {}).get("species")
        print(f"  {fp}  {rec.get('id')[:12]}  {species}")
