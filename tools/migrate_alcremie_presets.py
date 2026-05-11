#!/usr/bin/env python3
"""Migrate Alcremie preset entries from string PIDs to structured form.

Converts:  "alcremie-vanilla-cream-strawberry"
       →   {"species": "Alcremie", "requires": {"cream": "Vanilla Cream", "sweet": "Strawberry"}}

The cream/sweet dimensions are not in Smogon's pokedex — they're HOME-specific
visual variants. Structured form makes the matching data-driven (no hardcoded
parser logic for Alcremie cream/sweet detection).

Usage:
    uv run python tools/migrate_alcremie_presets.py          # dry-run
    uv run python tools/migrate_alcremie_presets.py --apply  # write changes
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CREAMS = [
    "Vanilla Cream", "Ruby Cream", "Matcha Cream", "Mint Cream",
    "Lemon Cream", "Salted Cream", "Ruby Swirl", "Caramel Swirl", "Rainbow Swirl",
]
SWEETS = ["Strawberry", "Berry", "Love", "Star", "Clover", "Flower", "Ribbon"]

CREAM_SLUGS = {c.lower().replace(" ", "-"): c for c in CREAMS}
SWEET_SLUGS = {s.lower(): s for s in SWEETS}


def parse_alcremie_pid(pid: str) -> dict | None:
    """Parse 'alcremie-{cream}-{sweet}' into structured form. Returns None if not Alcremie."""
    if not pid or not pid.startswith("alcremie"):
        return None
    if pid == "alcremie":
        return None  # plain alcremie — no migration needed
    # Strip "alcremie-" prefix
    rest = pid[len("alcremie-"):]
    # The sweet is the last word (single token); the cream is everything before
    parts = rest.rsplit("-", 1)
    if len(parts) != 2:
        return None
    cream_slug, sweet_slug = parts
    if cream_slug not in CREAM_SLUGS:
        return None
    if sweet_slug not in SWEET_SLUGS:
        return None
    return {
        "species": "Alcremie",
        "requires": {
            "cream": CREAM_SLUGS[cream_slug],
            "sweet": SWEET_SLUGS[sweet_slug],
        },
    }


def migrate_pokemon_list(pokemon_list: list) -> tuple[list, int]:
    """Walk a box's `pokemon` array, migrating Alcremie strings. Returns (new_list, count)."""
    new_list = []
    count = 0
    for entry in pokemon_list:
        if isinstance(entry, str):
            migrated = parse_alcremie_pid(entry)
            if migrated:
                new_list.append(migrated)
                count += 1
            else:
                new_list.append(entry)
        else:
            new_list.append(entry)
    return new_list, count


def migrate_file(path: Path, apply: bool) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    total = 0
    for layout_id, layout in data.items():
        for box in layout.get("boxes", []):
            pokemon = box.get("pokemon", [])
            new_pokemon, count = migrate_pokemon_list(pokemon)
            if count > 0:
                box["pokemon"] = new_pokemon
                total += count
                print(f"  {path.name}::{layout_id}::{box.get('title', '?')} — migrated {count} entries")

    if apply and total > 0:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {path.name} with {total} migrations")
    elif total > 0:
        print(f"  [dry-run] would migrate {total} entries in {path.name}")
    return total


def main() -> int:
    apply = "--apply" in sys.argv
    if not apply:
        print("DRY RUN — pass --apply to write changes")
        print()

    preset_files = [
        ROOT / "data" / "presets" / "home.json",
        ROOT / "data" / "presets" / "sv.json",
    ]

    grand_total = 0
    for path in preset_files:
        if not path.exists():
            print(f"⚠️  Skipping {path} (not found)")
            continue
        print(f"Processing {path.name}...")
        grand_total += migrate_file(path, apply)
        print()

    if apply:
        print(f"\nTotal migrations: {grand_total}")
    else:
        print(f"\nDry run total: {grand_total} entries would be migrated")
        print("Run with --apply to write changes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
