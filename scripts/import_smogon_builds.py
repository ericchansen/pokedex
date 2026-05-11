#!/usr/bin/env python3
"""Import Smogon competitive sets into userdata/builds.json as Library Builds.

Reads BSS factory set files (gen7/8/9) and @pkmn/smogon strategy dex sets,
converting each into a Library Build record with fingerprint deduplication.

Usage:
    uv run python scripts/import_smogon_builds.py             # dry run (preview only)
    uv run python scripts/import_smogon_builds.py --write     # write to builds.json
    uv run python scripts/import_smogon_builds.py --clear-source smogon-bss --write
    uv run python scripts/import_smogon_builds.py --clear-source smogon-sets --write
    uv run python scripts/import_smogon_builds.py --clear-all-templates --write
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from build_fingerprint import build_fingerprint  # noqa: E402

BUILDS_FILE = ROOT / "userdata" / "builds.json"
BACKUP_DIR = ROOT / "userdata" / "backups"
REF_DIR = ROOT / "data" / "reference"

# Ordered list of source files to process; each tuple is (path, source_tag, format)
# format: "bss" = BSS factory format, "smogon" = @pkmn/smogon strategy dex format
SOURCES = [
    (REF_DIR / "bss-factory-sets-gen7.json", "smogon-bss", "bss"),
    (REF_DIR / "bss-factory-sets-gen8.json", "smogon-bss", "bss"),
    (REF_DIR / "bss-factory-sets.json", "smogon-bss", "bss"),
    (REF_DIR / "smogon-sets-gen7.json", "smogon-sets", "smogon"),
    (REF_DIR / "smogon-sets-gen8.json", "smogon-sets", "smogon"),
    (REF_DIR / "smogon-sets-gen9.json", "smogon-sets", "smogon"),
]

STAT_KEYS = ("hp", "atk", "def", "spa", "spd", "spe")


def _first(val: Any, default: Any = None) -> Any:
    """Return val[0] if val is a non-empty list, else val if scalar, else default."""
    if isinstance(val, list):
        return val[0] if val else default
    return val if val is not None else default


def _slug(species: str) -> str:
    """Derive a URL-safe slug from a species name.

    Mirrors the logic in the JS species-resolver: lowercase, strip dots,
    replace spaces/hyphens runs with single hyphen.
    """
    s = species.lower()
    s = s.replace(".", "")
    s = re.sub(r"[\s\-]+", "-", s)
    s = s.strip("-")
    return s


def _new_id() -> str:
    """Generate a 24-char hex ID (matches existing builds.json id format)."""
    return os.urandom(12).hex()


def _map_bss_set(set_entry: dict, source: str) -> dict | None:
    """Convert a single BSS factory set dict → Library Build record.

    Returns None if the set can't be mapped (missing species).
    """
    species = set_entry.get("species")
    if not species:
        return None

    nature = set_entry.get("nature")
    ability = _first(set_entry.get("ability"))
    item = _first(set_entry.get("item"))
    tera_type = _first(set_entry.get("teraType"))

    # Moves: each slot is a list of alternatives; pick first from each slot
    raw_moves = set_entry.get("moves") or []
    moves = [_first(slot) for slot in raw_moves if slot]
    moves = [m for m in moves if m]  # drop None

    # EVs: already in classic EV format (hp/atk/def/spa/spd/spe)
    # May be a dict or a list of dicts (alternative spreads) — pick first
    raw_evs = set_entry.get("evs") or {}
    if isinstance(raw_evs, list):
        raw_evs = raw_evs[0] if raw_evs else {}
    classic_evs: dict[str, int] = {}
    for stat in STAT_KEYS:
        v = raw_evs.get(stat)
        if v:
            classic_evs[stat] = int(v)

    # IVs (only present when non-31)
    raw_ivs = set_entry.get("ivs") or {}
    if isinstance(raw_ivs, list):
        raw_ivs = raw_ivs[0] if raw_ivs else {}
    classic_ivs: dict[str, int | None] = {}
    if raw_ivs:
        for stat in STAT_KEYS:
            classic_ivs[stat] = raw_ivs.get(stat, 31)  # default = 31

    build: dict[str, Any] = {"species": species}
    if nature:
        build["nature"] = nature
    if ability:
        build["ability"] = ability
    if item:
        build["item"] = item
    if tera_type:
        build["tera_type"] = tera_type
    if moves:
        build["moves"] = moves
    if classic_evs:
        build["evs"] = {"classic": classic_evs}
        if classic_ivs:
            build["evs"]["classic_ivs"] = classic_ivs

    return {
        "id": _new_id(),
        "kind": "library",
        "slug": _slug(species),
        "build": build,
        "egg_moves": [],
        "source": source,
    }


def _map_smogon_sets(sets_doc: dict, source: str) -> list[dict]:
    """Convert @pkmn/smogon gen9.json structure → Library Build records.

    The @pkmn/smogon format differs from BSS factory:
    {
      "Dragonite": {
        "OU": {
          "Dragon Dance": {
            "moves": [...],
            "item": "Heavy-Duty Boots",
            "nature": "Adamant",
            "evs": { "hp": 196, "atk": 204, ... },
            "ivs": { ... },
            "ability": "Multiscale",
            "teraType": "Normal"
          }
        }
      }
    }
    """
    records: list[dict] = []
    for species, formats in sets_doc.items():
        if not isinstance(formats, dict):
            continue
        for _fmt_name, named_sets in formats.items():
            if not isinstance(named_sets, dict):
                continue
            for _set_name, set_data in named_sets.items():
                if not isinstance(set_data, dict):
                    continue
                # Normalize to same shape as BSS factory
                synthetic = {
                    "species": species,
                    "nature": set_data.get("nature"),
                    "ability": set_data.get("ability"),
                    "item": set_data.get("item"),
                    "teraType": set_data.get("teraType"),
                    "moves": set_data.get("moves") or [],
                    "evs": set_data.get("evs") or {},
                    "ivs": set_data.get("ivs") or {},
                }
                rec = _map_bss_set(synthetic, source)
                if rec:
                    records.append(rec)
    return records


def load_builds() -> dict:
    if BUILDS_FILE.exists():
        return json.loads(BUILDS_FILE.read_text(encoding="utf-8"))
    return {"meta": {}, "builds": []}


def backup_builds() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKUP_DIR / f"builds_{ts}.json"
    shutil.copy2(BUILDS_FILE, dest)
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Smogon builds into builds.json")
    parser.add_argument("--write", action="store_true", help="Write changes (default: dry run)")
    parser.add_argument(
        "--clear-source",
        metavar="SOURCE",
        help="Remove all existing builds with this source tag before importing",
    )
    parser.add_argument(
        "--clear-all-templates",
        action="store_true",
        help="Remove ALL template builds (any non-None source) before importing",
    )
    args = parser.parse_args()

    doc = load_builds()
    existing_builds: list[dict] = doc.get("builds") or []

    # Clear source if requested
    if args.clear_all_templates:
        before = len(existing_builds)
        existing_builds = [b for b in existing_builds if not b.get("source")]
        removed = before - len(existing_builds)
        print(f"Cleared {removed} template builds (all sources)")
    elif args.clear_source:
        before = len(existing_builds)
        existing_builds = [b for b in existing_builds if b.get("source") != args.clear_source]
        removed = before - len(existing_builds)
        print(f"Cleared {removed} existing '{args.clear_source}' builds")

    # Build fingerprint index for dedup
    fp_index: set[str] = set()
    for rec in existing_builds:
        try:
            fp = build_fingerprint(rec.get("build") or {}, rec.get("egg_moves") or [])
            fp_index.add(fp)
        except Exception:
            pass

    candidates: list[dict] = []

    for src_path, source_tag, fmt in SOURCES:
        if not src_path.exists():
            print(f"[skip] {src_path.name} not found — run convert_smogon_data.py first")
            continue

        print(f"\nProcessing {src_path.name} (source={source_tag})...")
        raw = json.loads(src_path.read_text(encoding="utf-8"))

        if fmt == "bss":
            # BSS factory format: { "species-key": { "weight": N, "sets": [...] } }
            for _key, entry in raw.items():
                for set_entry in entry.get("sets") or []:
                    rec = _map_bss_set(set_entry, source_tag)
                    if rec:
                        candidates.append(rec)
        elif fmt == "smogon":
            # @pkmn/smogon format
            records = _map_smogon_sets(raw, source_tag)
            candidates.extend(records)

    # Dedup against existing + dedup within candidates
    imported: list[dict] = []
    skipped_fp = 0
    seen_in_batch: set[str] = set()

    for rec in candidates:
        fp = build_fingerprint(rec["build"], rec.get("egg_moves") or [])
        if fp in fp_index or fp in seen_in_batch:
            skipped_fp += 1
            continue
        seen_in_batch.add(fp)
        fp_index.add(fp)
        imported.append(rec)

    # Report
    print(f"\n{'='*50}")
    print(f"Candidates:  {len(candidates)}")
    print(f"Skipped (duplicate fingerprint): {skipped_fp}")
    print(f"To import:   {len(imported)}")
    print(f"Existing builds: {len(existing_builds)}")
    print(f"New total:   {len(existing_builds) + len(imported)}")

    if not imported:
        print("\nNothing to import.")
        return

    # Sample preview
    print("\nSample (first 5 to import):")
    for rec in imported[:5]:
        b = rec["build"]
        evs_str = ""
        if b.get("evs", {}).get("classic"):
            ev = b["evs"]["classic"]
            evs_str = "/".join(str(ev.get(s, 0)) for s in STAT_KEYS)
        print(f"  {b.get('species'):20}  {b.get('nature','?'):10}  EVs:{evs_str}  [{rec['source']}]")

    if not args.write:
        print("\n[DRY RUN] Pass --write to apply changes.")
        return

    # Backup + write
    if BUILDS_FILE.exists():
        bk = backup_builds()
        print(f"\nBackup: {bk}")

    doc["builds"] = existing_builds + imported
    BUILDS_FILE.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Written: {BUILDS_FILE}")
    print(f"Done — {len(imported)} builds imported.")


if __name__ == "__main__":
    main()
