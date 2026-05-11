"""Fetch Legends: Arceus dex from PokeAPI -> data/reference/legends_arceus_pokemon.json.

Idempotent. Re-run any time to refresh.
"""
import json
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "reference" / "legends_arceus_pokemon.json"
URL = "https://pokeapi.co/api/v2/pokedex/hisui/"


def fetch():
    req = urllib.request.Request(URL, headers={"User-Agent": "pokemon-champions-tracker/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def main():
    data = fetch()
    slugs = sorted({entry["pokemon_species"]["name"] for entry in data["pokemon_entries"]})
    out = {
        "game": "legends-arceus",
        "name": "Pokémon Legends: Arceus",
        "pokemon_count": len(slugs),
        "pokemon": slugs,
        "source": URL,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(slugs)} species to {OUT}")


if __name__ == "__main__":
    main()
