"""Dedupe builds by battle fingerprint.

Groups builds in data/builds.json by their `build_fingerprint(...)` hash.
For each group of size > 1:

  1. Pick a "winner" — the most-referenced build (by team members + linked
     inventory slots), tiebroken by lexicographically lowest id for
     determinism.
  2. Rewrite every team `members[].build_id` and every inventory slot's
     `target_build_id` from the losers to the winner.
  3. Remove the loser builds from builds.json.

Idempotent: if there are no duplicate fingerprint groups, exit 0 without
touching disk. Always backs up data files before any mutation.

Usage:
    uv run scripts/dedupe_builds.py            # apply
    uv run scripts/dedupe_builds.py --dry-run  # report only, no writes
    uv run scripts/dedupe_builds.py --check    # exit non-zero if dupes exist
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Import shared domain modules from api/domain/ — single source of truth
sys.path.insert(0, str(ROOT / "api"))
from domain.build_fingerprint import build_fingerprint  # noqa: E402

USER_DATA_DIR = ROOT / "userdata"
INV_PATH = USER_DATA_DIR / "inventory.json"
TEAMS_PATH = USER_DATA_DIR / "teams.json"
BUILDS_PATH = USER_DATA_DIR / "builds.json"


def _record_fingerprint(rec: dict) -> str:
    return build_fingerprint(rec.get("build") or {}, rec.get("egg_moves") or [])


def _count_refs(builds: list[dict], teams: dict, inv: dict) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for t in teams.get("teams", []):
        for m in t.get("members") or []:
            bid = m.get("build_id")
            if bid:
                counts[bid] += 1
    for box in inv.get("boxes", []):
        for slot in (box.get("slots") or []):
            if not slot:
                continue
            target_id = slot.get("target_build_id")
            if target_id:
                counts[target_id] += 1
    return counts


def _pick_winner(group: list[dict], ref_counts: dict[str, int]) -> dict:
    # Most-referenced first; tiebreak by lex-lowest id for determinism.
    return max(group, key=lambda b: (ref_counts.get(b["id"], 0), -ord(b["id"][0]) if b["id"] else 0, b["id"]))


def _rewrite_refs(teams: dict, inv: dict, remap: dict[str, str]) -> tuple[int, int]:
    """Rewrite loser id -> winner id in teams + inventory. Returns (team_refs, inv_refs)."""
    team_refs = 0
    for t in teams.get("teams", []):
        for m in t.get("members") or []:
            bid = m.get("build_id")
            if bid in remap:
                m["build_id"] = remap[bid]
                team_refs += 1

    inv_refs = 0
    for box in inv.get("boxes", []):
        for slot in (box.get("slots") or []):
            if not slot:
                continue
            target_id = slot.get("target_build_id")
            if target_id in remap:
                slot["target_build_id"] = remap[target_id]
                inv_refs += 1
    return team_refs, inv_refs


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true", help="Report what would change; don't write.")
    p.add_argument("--check", action="store_true", help="Exit 1 if dupes exist (CI-friendly).")
    args = p.parse_args()

    builds_doc = json.loads(BUILDS_PATH.read_text(encoding="utf-8"))
    teams_doc = json.loads(TEAMS_PATH.read_text(encoding="utf-8"))
    inv_doc = json.loads(INV_PATH.read_text(encoding="utf-8"))

    builds = builds_doc["builds"] if isinstance(builds_doc, dict) else builds_doc

    groups: dict[str, list[dict]] = defaultdict(list)
    for b in builds:
        groups[_record_fingerprint(b)].append(b)

    dupes = {fp: bs for fp, bs in groups.items() if len(bs) > 1}

    if not dupes:
        print(f"No duplicate builds found ({len(builds)} builds, {len(groups)} distinct fingerprints).")
        return 0

    if args.check:
        print(f"FAIL: {len(dupes)} duplicate group(s) found across {sum(len(g) for g in dupes.values())} builds.")
        return 1

    ref_counts = _count_refs(builds, teams_doc, inv_doc)
    remap: dict[str, str] = {}
    losers: set[str] = set()

    print(f"Found {len(dupes)} duplicate group(s):")
    for _fp, group in sorted(dupes.items(), key=lambda kv: -len(kv[1])):
        winner = _pick_winner(group, ref_counts)
        species = (winner.get("build") or {}).get("species", "?")
        print(f"  {species:20} x{len(group)}  winner={winner['id'][:12]} (refs={ref_counts.get(winner['id'], 0)})")
        for b in group:
            if b["id"] == winner["id"]:
                continue
            print(f"     loser={b['id'][:12]} (refs={ref_counts.get(b['id'], 0)})")
            remap[b["id"]] = winner["id"]
            losers.add(b["id"])

    if args.dry_run:
        print(f"\n[dry-run] Would rewrite {len(remap)} ref(s) and drop {len(losers)} build(s).")
        return 0

    # Backups
    for path in (BUILDS_PATH, TEAMS_PATH, INV_PATH):
        shutil.copy2(path, path.with_suffix(".json.bak"))

    # Mutate
    team_refs, inv_refs = _rewrite_refs(teams_doc, inv_doc, remap)
    new_builds = [b for b in builds if b["id"] not in losers]
    if isinstance(builds_doc, dict):
        builds_doc["builds"] = new_builds
    else:
        builds_doc = new_builds

    BUILDS_PATH.write_text(json.dumps(builds_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    TEAMS_PATH.write_text(json.dumps(teams_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    INV_PATH.write_text(json.dumps(inv_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"\nRewrote {team_refs} team ref(s), {inv_refs} inventory ref(s).")
    print(f"Dropped {len(losers)} build(s) from builds.json ({len(builds)} -> {len(new_builds)}).")
    print(f"Backups in: {USER_DATA_DIR / 'backups'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
