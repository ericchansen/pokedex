"""Scrape the Legends: Z-A Pokédex from pokemondb.net.

Writes data/reference/legends_za_pokemon.json with the species slug list.
Idempotent — overwrites the file on each run.
"""
import json
import re
import urllib.request
from pathlib import Path


def main() -> None:
    url = "https://pokemondb.net/pokedex/game/legends-z-a"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 pokemon-champions-tracker/1.0"},
    )
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf8")

    pattern = r'<a class="ent-name" href="/pokedex/([a-z0-9-]+)"'
    slugs = re.findall(pattern, html)

    seen: set[str] = set()
    out: list[str] = []
    for slug in slugs:
        if slug not in seen:
            seen.add(slug)
            out.append(slug)

    print(f"found {len(out)} unique species")

    payload = {
        "game": "legends-za",
        "name": "Pokémon Legends: Z-A",
        "pokemon_count": len(out),
        "pokemon": sorted(out),
        "source": "pokemondb.net/pokedex/game/legends-z-a",
    }

    target = Path("data/reference/legends_za_pokemon.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf8",
    )
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
