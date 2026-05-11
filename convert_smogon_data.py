#!/usr/bin/env python3
"""Fetch Smogon pokemon-showdown data/*.ts files and convert to JSON.

Outputs to data/reference/. Uses Node.js to eval TS files —
JSON.stringify naturally drops function properties, leaving clean data.

Usage:
    python convert_smogon_data.py          # fetch from GitHub + convert
    python convert_smogon_data.py --local  # use cached .ts files in .smogon-cache/
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

BASE_URL = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data"
CACHE_DIR = Path(".smogon-cache")
OUTPUT_DIR = Path("data/reference")

# Files to fetch and their export variable names
SOURCES = {
    "pokedex.ts": "Pokedex",
    "moves.ts": "Moves",
    "items.ts": "Items",
    "abilities.ts": "Abilities",
    "natures.ts": "Natures",
    "typechart.ts": "TypeChart",
    "learnsets.ts": "Learnsets",
}

# Direct JSON downloads (no TS conversion needed)
JSON_DOWNLOADS = {
    "random-battles/gen7/bss-factory-sets.json": "bss-factory-sets-gen7.json",
    "random-battles/gen8/bss-factory-sets.json": "bss-factory-sets-gen8.json",
    "random-battles/gen9/bss-factory-sets.json": "bss-factory-sets.json",
}

# External JSON downloads (not from Smogon's pokemon-showdown repo)
PKMN_SMOGON_BASE = "https://raw.githubusercontent.com/pkmn/smogon/main/data/sets"
EXTERNAL_JSON_DOWNLOADS = {
    f"{PKMN_SMOGON_BASE}/gen7.json": "smogon-sets-gen7.json",
    f"{PKMN_SMOGON_BASE}/gen8.json": "smogon-sets-gen8.json",
    f"{PKMN_SMOGON_BASE}/gen9.json": "smogon-sets-gen9.json",
}


def fetch_file(filename: str, use_cache: bool) -> str:
    """Fetch a TS file from GitHub or cache."""
    cache_path = CACHE_DIR / filename
    if use_cache and cache_path.exists():
        print(f"  [cache] {filename}")
        return cache_path.read_text(encoding="utf-8")

    url = f"{BASE_URL}/{filename}"
    print(f"  [fetch] {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "pokemon-champions/1.0"})
    with urllib.request.urlopen(req) as resp:
        text = resp.read().decode("utf-8")

    CACHE_DIR.mkdir(exist_ok=True)
    cache_path.write_text(text, encoding="utf-8")
    return text


def strip_ts_annotations(ts_content: str) -> str:
    """Minimal TS stripping — only remove the import() type on the export line."""
    # This is handled in ts_to_esm now
    return ts_content


def ts_to_esm(ts_content: str, var_name: str) -> str:
    """Convert Smogon TS export to ESM default export for Node --experimental-strip-types."""
    # Change `export const X: ... = {` to `const X: ... = {`
    ts = re.sub(r"^export\s+", "", ts_content, count=1)
    # Add default export at the end
    ts += f"\nexport default {var_name};\n"
    return ts


def eval_with_node(content: str) -> dict:
    """Use Node.js with --experimental-strip-types to eval TS and output JSON."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".mts", delete=False, encoding="utf-8"
    ) as f:
        f.write(content)
        tmp_path = f.name

    try:
        # ESM import on Windows needs file:/// URL
        tmp_url = Path(tmp_path).as_uri()
        eval_script = (
            f'import d from "{tmp_url}";\n'
            f"process.stdout.write(JSON.stringify(d));\n"
        )
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".mts", delete=False, encoding="utf-8"
        ) as runner:
            runner.write(eval_script)
            runner_path = runner.name
        try:
            result = subprocess.run(
                [
                    "node",
                    "--experimental-strip-types",
                    "--no-warnings",
                    runner_path,
                ],
                capture_output=True,
                timeout=60,
                encoding="utf-8",
                errors="replace",
            )
        finally:
            os.unlink(runner_path)
        if result.returncode != 0:
            print(f"  [ERROR] Node.js: {result.stderr[:500]}")
            sys.exit(1)
        return json.loads(result.stdout)
    finally:
        os.unlink(tmp_path)


def convert_pokedex(raw: dict) -> dict:
    """Extract the fields we need from Smogon pokedex."""
    out = {}
    for key, entry in raw.items():
        out[key] = {
            "num": entry.get("num"),
            "name": entry.get("name"),
            "types": entry.get("types", []),
            "baseStats": entry.get("baseStats"),
            "abilities": entry.get("abilities"),
            "forme": entry.get("forme"),
            "baseSpecies": entry.get("baseSpecies"),
            "otherFormes": entry.get("otherFormes"),
            "formeOrder": entry.get("formeOrder"),
            "genderRatio": entry.get("genderRatio"),
            "gender": entry.get("gender"),
            "evos": entry.get("evos"),
            "prevo": entry.get("prevo"),
            "requiredItem": entry.get("requiredItem"),
            "isNonstandard": entry.get("isNonstandard"),
            "gen": entry.get("gen"),
        }
        # Strip None values for compactness
        out[key] = {k: v for k, v in out[key].items() if v is not None}
    return out


def convert_moves(raw: dict) -> dict:
    """Extract move data we need (name, type, power, category, accuracy, pp)."""
    out = {}
    for key, entry in raw.items():
        out[key] = {
            "num": entry.get("num"),
            "name": entry.get("name"),
            "type": entry.get("type"),
            "category": entry.get("category"),
            "basePower": entry.get("basePower"),
            "accuracy": entry.get("accuracy"),
            "pp": entry.get("pp"),
            "priority": entry.get("priority"),
            "target": entry.get("target"),
            "flags": entry.get("flags"),
            "isNonstandard": entry.get("isNonstandard"),
            "gen": entry.get("gen"),
        }
        out[key] = {k: v for k, v in out[key].items() if v is not None}
    return out


def convert_items(raw: dict) -> dict:
    """Extract item data (name, num, gen, mega info)."""
    out = {}
    for key, entry in raw.items():
        out[key] = {
            "num": entry.get("num"),
            "name": entry.get("name"),
            "gen": entry.get("gen"),
            "megaStone": entry.get("megaStone"),
            "isNonstandard": entry.get("isNonstandard"),
            "fling": entry.get("fling"),
        }
        out[key] = {k: v for k, v in out[key].items() if v is not None}
    return out


def convert_abilities(raw: dict) -> dict:
    """Extract ability data (name, num, gen)."""
    out = {}
    for key, entry in raw.items():
        out[key] = {
            "num": entry.get("num"),
            "name": entry.get("name"),
            "gen": entry.get("gen"),
            "isNonstandard": entry.get("isNonstandard"),
            "rating": entry.get("rating"),
        }
        out[key] = {k: v for k, v in out[key].items() if v is not None}
    return out


def convert_natures(raw: dict) -> dict:
    """Natures are already clean — just pass through."""
    return raw


def convert_typechart(raw: dict) -> dict:
    """Extract type effectiveness data."""
    out = {}
    for key, entry in raw.items():
        out[key] = {
            "damageTaken": entry.get("damageTaken"),
            "HPivs": entry.get("HPivs"),
            "HPdvs": entry.get("HPdvs"),
            "isNonstandard": entry.get("isNonstandard"),
        }
        out[key] = {k: v for k, v in out[key].items() if v is not None}
    return out


def convert_learnsets(raw: dict) -> dict:
    """Pass through learnset data — already keyed by species slug."""
    # Each entry is { learnset: { movename: ["9L1", "9M", ...] } }
    # Keep as-is; the learnset codes encode game + method
    return raw


CONVERTERS = {
    "pokedex.ts": ("pokedex.json", convert_pokedex),
    "moves.ts": ("moves.json", convert_moves),
    "items.ts": ("items.json", convert_items),
    "abilities.ts": ("abilities.json", convert_abilities),
    "natures.ts": ("natures.json", convert_natures),
    "typechart.ts": ("typechart.json", convert_typechart),
    "learnsets.ts": ("learnsets.json", convert_learnsets),
}


def main():
    parser = argparse.ArgumentParser(description="Convert Smogon TS data to JSON")
    parser.add_argument("--local", action="store_true", help="Use cached .ts files")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for ts_file, var_name in SOURCES.items():
        print(f"\n{'='*40}")
        print(f"Processing {ts_file}...")
        out_name, converter = CONVERTERS[ts_file]

        # Fetch
        ts_content = fetch_file(ts_file, use_cache=args.local)
        print(f"  {len(ts_content):,} bytes")

        # Convert TS → ESM with default export
        esm_content = ts_to_esm(ts_content, var_name)

        # Eval with Node.js (--experimental-strip-types)
        print("  [node] Evaluating...")
        raw_data = eval_with_node(esm_content)
        print(f"  {len(raw_data):,} entries")

        # Extract fields we need
        clean_data = converter(raw_data)

        # Write JSON
        out_path = OUTPUT_DIR / out_name
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(clean_data, f, ensure_ascii=False, separators=(",", ":"))
        size_kb = out_path.stat().st_size / 1024
        print(f"  [write] {out_path} ({size_kb:.0f} KB)")

    print(f"\n{'='*40}")
    print(f"Done! Reference data in {OUTPUT_DIR}/")

    # Direct JSON downloads (already JSON, no TS conversion)
    for src_path, out_name in JSON_DOWNLOADS.items():
        print(f"\n{'='*40}")
        print(f"Downloading {src_path}...")
        url = f"{BASE_URL}/{src_path}"
        cache_path = CACHE_DIR / out_name
        if args.local and cache_path.exists():
            print(f"  [cache] {out_name}")
            raw = cache_path.read_text(encoding="utf-8")
        else:
            print(f"  [fetch] {url}")
            req = urllib.request.Request(url, headers={"User-Agent": "pokemon-champions/1.0"})
            with urllib.request.urlopen(req) as resp:
                raw = resp.read().decode("utf-8")
            CACHE_DIR.mkdir(exist_ok=True)
            cache_path.write_text(raw, encoding="utf-8")
        out_path = OUTPUT_DIR / out_name
        # Compact the JSON
        data = json.loads(raw)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        size_kb = out_path.stat().st_size / 1024
        print(f"  [write] {out_path} ({size_kb:.0f} KB)")

    print(f"\n{'='*40}")
    total_kb = sum(f.stat().st_size for f in OUTPUT_DIR.glob("*.json")) / 1024
    print(f"All done! {total_kb:.0f} KB total in {OUTPUT_DIR}/")

    # External JSON downloads (e.g. @pkmn/smogon CDN)
    for url, out_name in EXTERNAL_JSON_DOWNLOADS.items():
        print(f"\n{'='*40}")
        print(f"Downloading {out_name}...")
        cache_path = CACHE_DIR / out_name
        if args.local and cache_path.exists():
            print(f"  [cache] {out_name}")
            raw = cache_path.read_text(encoding="utf-8")
        else:
            print(f"  [fetch] {url}")
            req = urllib.request.Request(url, headers={"User-Agent": "pokemon-champions/1.0"})
            with urllib.request.urlopen(req) as resp:
                raw = resp.read().decode("utf-8")
            CACHE_DIR.mkdir(exist_ok=True)
            cache_path.write_text(raw, encoding="utf-8")
        out_path = OUTPUT_DIR / out_name
        data = json.loads(raw)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        size_kb = out_path.stat().st_size / 1024
        print(f"  [write] {out_path} ({size_kb:.0f} KB)")

    print(f"\n{'='*40}")
    total_kb = sum(f.stat().st_size for f in OUTPUT_DIR.glob("*.json")) / 1024
    print(f"Grand total: {total_kb:.0f} KB in {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
