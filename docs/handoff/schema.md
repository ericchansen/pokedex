# Data Contracts

All data files live under `data/`. This document is the authoritative schema reference — part of the handoff package alongside `functional-spec.md`.

## Domains

| Domain | Mutability | Files |
|--------|-----------|-------|
| **User data** | Full CRUD | `builds.json`, `teams.json`, `inventory.json` |
| **Reference** | Read-only (rebuilt from upstream) | `reference/*.json`, `champions_pokemon.json` |
| **Presets** | Read-only (from PokéPC) | `presets/*.json`, `home_box_layout.json` |
| **Derived** | Read-only (filtered from reference) | `champions_filter.json` |

## Core concept: Build is ONE shape playing TWO roles

A **Build** is a portable data shape — `{species, form, level, nature, ability, item, tera_type, moves, evs}` — that plays one of two roles depending on where it lives:

| Role | Where it lives | What it means | Multiplicity |
|---|---|---|---|
| **Library Build** | `builds.json` (top-level) | A reusable spec — a competitive ideal, factory set, or promoted instance state. Shared and deduped. | 0..N per species |
| **Instance Build** ("Current Build") | `inventory.json` slot, embedded as `slot.build` | The *actual current state* of a real Pokémon you own. Edited as you train, breed, or hyper-train it. | exactly 1 per Instance |

A Build's role is stamped on the record itself via `kind: "library" \| "instance"`. The two roles share the same fields; they differ only in **lifecycle and ownership**:
- A Library Build exists independently and can have many Pokémon Instances pointing to it.
- An Instance Build belongs 1:1 to its Pokémon and dies with it.

### Two relationship tables (conceptual)

```
real_pokemon (inventory slot)         Library Build pool (builds.json)
┌─────────────────────────┐           ┌─────────────────────────────┐
│ inventory slot          │           │ build (id, kind="library")  │
│  • species_id           │           │  • species/form/nature/...  │
│  • state ← current Build│           │  • moves/evs/...            │
│    (kind="instance")    │           └─────────────────────────────┘
│  • target_build_id ─────┼──FK (nullable, 0..1)──▶ ▲
└─────────────────────────┘                          │
                                                     │
team (teams.json)                                    │
┌─────────────────────────┐                          │
│ team                    │                          │
│  • members[1..6]        │                          │
│    • build_id ──────────┼──FK (required, exactly 1)┘
└─────────────────────────┘
```

Two FK relationships exist:

| FK | From | To | Cardinality | Nullable? |
|---|---|---|---|---|
| **Target Build** | `inventory.json` slot.`target_build_id` | `builds.json` builds[].`id` | many-to-1 | **Yes** — most Instances have no target |
| **Team Member** | `teams.json` member.`build_id` | `builds.json` builds[].`id` | many-to-1 (6 per team) | **No** — a team slot is meaningless without a Build |

### What "Target Build" means on an Instance

`target_build_id` is **optional**. It expresses "this Pokémon is aiming to become this Library Build." When set, the UI shows drift between the Instance's current state and the targeted spec. When null (the common case), the Pokémon simply has its actual stats — no goal, no drift display. **Most users will leave most Instances with no target.**

### Promote: Instance Build → Library Build

A user can **Promote** an Instance Build to the Library, creating a new Library entry with the same shape (or reusing an existing identical one via fingerprint dedupe). After promoting, the Instance's `target_build_id` is set to the new Library Build's `id` automatically — the Pokémon is now "matching" its own promoted spec.

Identity fields (ball, OT, origin game, nickname, language, event provenance, transfer tracking, known egg moves) live on the Instance — never inside `slot.build`.

---

## 1. builds.json — Library Builds

The reusable Library of Builds — competitive ideals, factory sets, and promoted Instance specs. Each Library Build is keyed by `id` and carries the embedded Build shape plus optional metadata. Library Builds have `kind: "library"`. They carry **no Instance-identity fields** (those live on the Instance — see §3).

### Top-level

```jsonc
{
  "meta": {
    "ot": "Eric",           // Original Trainer name (for Showdown export)
    "ot_gender": "Male",
    "trade_link": "46974523",
    "batch_size": 4          // Max mons per $bt Discord command
  },
  "builds": [ /* TargetBuild[] */ ]
}
```

### Library Build record

```jsonc
{
  "id": "37177aca7d1b4350a8a1db80",   // Unique primary key (hex string or ULID)
  "kind": "library",                   // Always "library" for builds.json entries
  "slug": "charizard",                 // Kebab-case species[-form] for display/URLs

  // ── The embedded Build shape ──────────────────────
  "build": {
    "species": "Charizard",            // Showdown species name
    "form": "Heat",                    // Optional form (null if base form)
    "nature": "Timid",                 // One of 25 natures (plain name, no +/- annotation)
    "ability": "Solar Power",
    "item": "Charizardite Y",
    "tera_type": "Fire",               // Optional: tera type
    "moves": ["Heat Wave", "Solar Beam", "Weather Ball", "Protect"],
    "evs": {
      "champions": {                   // Champions stat points (0–32 each, total ≤ 66)
        "hp": 1, "atk": 0, "def": 0,
        "spa": 32, "spd": 1, "spe": 32
      },
      "classic": {                     // Optional: classic EVs (0–252 each, total ≤ 510)
        "hp": 0, "atk": 0, "def": 0,
        "spa": 252, "spd": 4, "spe": 252
      },
      "classic_ivs": {                 // Optional: target IVs (0–31 or null), only with classic
        "hp": 31, "atk": null, "def": 31,
        "spa": 31, "spd": 31, "spe": 31
      }
    }
  },

  "egg_moves": ["Counter", "Haze"],    // Optional: egg moves (separate from battle moves)
  "notes": null,                       // Free text
  "source_url": null,                  // Optional: URL to source paste/article
  "source": "smogon-bss"              // Optional: origin tag for imported/template builds
                                       // Known values: "smogon-bss" (BSS factory sets),
                                       //               "smogon-sets" (@pkmn/smogon tier sets)
                                       // Absent or null = user-created build
}
```

**Fields NOT on a Library Build** (Instance identity — see §3):
`ball`, `gender`, `shiny`, `language`, `ot`, `origin_game`, `nickname`, `event_origin`, `transferred_to_champions`, `from_go`, `egg_moves`, `met_location`, `gigantamax`, `alpha`, `hyper_trained`, `genned`, `owned`.

**All Library Build fields except `id`, `kind`, `slug`, and `build.species` are optional.** A Library Build can be as sparse as `{ id, kind: "library", slug, build: { species: "Bulbasaur" } }`. Missing fields display as empty/unknown in the UI.

### EV system rules

A Build may have `champions`, `classic`, both, or neither (WIP):

| Key | Scale | Per-stat max | Total max | IVs? |
|-----|-------|-------------|-----------|------|
| `evs.champions` | Stat Points | 32 | 66 | No |
| `evs.classic` | EVs | 252 | 510 | Yes → `evs.classic_ivs` |

A total under the max is valid (not every Build maxes out).

### Constraints

- `id` must be unique across all Library Builds
- `kind` must be `"library"`
- `build.species` must match a key in `reference/pokedex.json`
- `build.nature` must match a key in `reference/natures.json`
- `build.moves[]` should each match a key in `reference/moves.json`
- `egg_moves[]` may contain at most 4 moves and each entry should be a legal egg move for the species
- `build.ability` should match one of the species' legal abilities in `reference/pokedex.json`
- Per-stat and total EV limits are hard-enforced per system

### Ownership is derived

A Library Build has no `owned` field. Ownership is computed:

```
isOwned(libraryBuild) = exists instance where instance.target_build_id == libraryBuild.id
```

See §3 for the Instance schema.

### Dedupe

When the user creates a Library Build (manually, via Promote, or via factory-set picker) the system computes a battle-identity fingerprint. If a Library Build with the same fingerprint exists, that one is **reused** instead of inserting a duplicate. This is why Promote may not increase the Library Build count.

---

## 2. teams.json — Team Compositions

Teams are collections of 6 **Library Build** references. All competitive data lives on the Library Builds — teams are organizational metadata plus FK pointers. **A team member's `build_id` is required and non-nullable** — a team slot is meaningless without a Build.

### Top-level

```jsonc
{
  "teams": [ /* Team[] */ ]
}
```

### Team record

```jsonc
{
  "id": "team-01",                      // Unique team identifier
  "source": "imported",                 // "imported" (locked / read-only) | "user" (full CRUD)
  "name": "Team01 Cybertronvgc",
  "creator": "CybertronVGC",            // null for user's own teams
  "archetype": "Sun",                   // Optional team archetype label
  "mega": "Charizard Y",                // Optional mega evolution used
  "ev_system": "champions",             // "champions" | "classic" — the system this team was built for
  "team_id": "NFVS4SYCW2",             // Champions in-game team code (champions teams only; null otherwise)
  "members": [
    { "slot": 1, "build_id": "37177aca7d1b4350a8a1db80" },
    { "slot": 2, "build_id": "c13febd2d903bff0cd2625fa" },
    { "slot": 3, "build_id": "275515cdbd8ade2396fa7210" },
    { "slot": 4, "build_id": "373ff5e8d7e2380a914b5f50" },
    { "slot": 5, "build_id": "4e19d5d720fd034f5c6aeaec" },
    { "slot": 6, "build_id": "3bd81e059f9c2b6d38414fca" }
  ]
}
```

### Member record

```jsonc
{
  "slot": 1,                             // Position in team (1–6)
  "build_id": "37177aca7d1b4350a8a1db80" // FK → builds.json builds[].id
}
```

### Constraints

- Every `build_id` must reference an existing Library Build in `builds.json` (non-nullable)
- `ev_system` determines which EV scale the Library Builds must have
- Only `"champions"` teams may have a non-null `team_id`
- Teams have exactly 6 members (slots 1–6)

### Navigating relationships

```
Team → Library Builds:   team.members[].build_id → builds.builds[].id
Library Builds → Teams:  filter teams where any member.build_id == build.id  (runtime join)
```

### Derived state (never stored)

Completeness and integrity are computed at runtime, not persisted:

- **Build completeness**: Does the Build have nature? ability? 4 moves? EVs? UI derives badges by inspecting fields.
- **Team completeness**: Do all 6 members resolve to valid Library Builds? Do those Builds have natures and legal EVs for the team's `ev_system`?
- **EV trained**: Is the EV total equal to the system max (510 classic, 66 champions)?

No `completeness`, `status`, or `tier` fields exist in the stored data.

---

## 3. inventory.json — HOME Box Grid (Pokémon Instances)

Mirrors the user's real Pokémon HOME storage. 200 boxes × 30 slots (6 columns × 5 rows). Each non-null slot is a **Pokémon Instance** — a real Pokémon the user owns. Each Instance carries:

- `species_id` — what species this Pokémon is.
- `state` — its **Instance Build** (`kind: "instance"`), the *current actual stats* of this specific Pokémon. **Always present.** This IS a Build, just one whose lifecycle is tied to its Pokémon.
- `identity` — Instance-only fields (ball, OT, origin game, language, event provenance, etc.) that are not part of the Build shape.
- `target_build_id` — **optional** FK pointing at a Library Build the user is aiming this Pokémon toward. Most Instances have `null` here. Used only for displaying drift / "battle-ready" status.

### Top-level

```jsonc
{
  "schema_version": 4,
  "box_count": 200,
  "slots_per_box": 30,
  "columns": 6,
  "rows": 5,
  "boxes": [ /* Box[] */ ],
  "ownership": {
    "manual": { "3": true, "9": true, "727": false }
    // Species IDs marked owned but not placed in any slot.
    // Rendered as synthetic unplaced instances (location "—").
  }
}
```

### Box record

```jsonc
{
  "id": 0,               // 0-indexed box number
  "name": "HOME 1",      // User-editable box name
  "slots": [ /* Slot | null, length 30 */ ]
}
```

### Slot values

A slot is either `null` (empty) or an **Instance record**:

```jsonc
{
  // ── Embedded Instance Build (Current Build — the actual stats) ─────────
  // Same Build shape as a Library Build. Any field MAY be null (unknown)
  // — rendered as "?" per FR-084. This Build has kind="instance".
  "build": {
    "kind": "instance",
    "id": "8b7d0f5a-7897-477c-a1c4-769f265bcd51",  // Stable per-Instance UUID
    "species": "Venusaur",                     // Required
    "form": null,
    "level": 100,                              // null = unset (default 50 for display)
    "nature": "Bold",
    "ability": "Overgrow",
    "item": null,
    "tera_type": null,
    "moves": ["Energy Ball", "Leech Seed", "Sludge Bomb", "Synthesis"],
    "evs": {
      "classic":     { "hp": 252, "atk": 0,    "def": 252, "spa": 0,  "spd": 6,  "spe": 0  },
      "classic_ivs": { "hp": 31,  "atk": null, "def": 31,  "spa": 31, "spd": 31, "spe": 31 },
      "champions":   null
    }
  },

  // ── Instance identity (NOT part of the Build shape) ─
  "identity": {
    "ball": "Poke",
    "gender": "F",
    "shiny": false,
    "language": "ENG",
    "ot": "Eric",
    "origin_game": "Scarlet",
    "nickname": null,
    "event_origin": false,                  // true = obtained from an event / giveaway
    "egg_moves": ["Leaf Storm"],            // Optional: known inherited egg moves tracked separately from current moves
    "met_location": null,
    "hyper_trained": null,
    "gigantamax": false,
    "alpha": false,
    "genned": false,                               // true = known to be generated / hacked
    "from_go": false,                              // true = originally caught/obtained in Pokémon GO
    "transferred_to_champions": false          // true = this instance has been sent to Pokémon Champions
  },

  // ── Target Build (optional FK → builds.json builds[].id) ─
  // Null = no target set (the common case). Non-null = the user is aiming
  // this Pokémon toward that Library Build; the UI shows drift between
  // `build` (current) and the target.
  "target_build_id": "d02b52ec02c6d7efdcec2310"
}
```

### Rules

- `build` (the Instance Build / Current Build) is **always** an object on every non-null slot. `build.species` is required. All other Build fields MAY be null (unknown) and render as `?` per FR-084. `build.kind` is always `"instance"`.
- `build.id` is stable per Instance — assigned on creation and preserved through edits.
- `identity` is **always** an object on every non-null slot. May be `{}` (all unknown).
- `target_build_id` is a **string or null**. **Null is the default and the common case** — most Pokémon have no target. When set, it MUST reference an existing Library Build in `builds.json`. A real Pokémon has only one set of stats, so it can be aimed at only one Library Build.
- Null slot = empty slot.
- Ownership is derived from placed box slots only. If a Pokémon is not in a slot, it is not counted as owned.
- Sprite, types, base stats, and learnset are derived from `build.species` against `reference/pokedex.json` — never duplicated into the Instance.
- **Unknown vs. zero**: `build.evs.classic.atk = null` means unknown → renders `?`. `= 0` means known zero → renders `0`. See FR-084.

### Derived: builds-match (was "battle-ready")

```
buildsMatch(instance) =
  instance.target_build_id != null AND
  fieldsMatch(instance.build, getBuild(instance.target_build_id).build) on:
    nature, ability, item, tera_type, moves (as set), evs
```

Computed at render time, never stored. See §6.2 of the functional spec.

---

## 4. home_box_layout.json — Living Dex Preset

A preset template mapping each of the 1,025 National Dex species to a specific box+slot position. Used as an organizational guide overlay on the inventory.

### Top-level

```jsonc
{
  "source": "pokepc/classic.pokepc.net",
  "source_url": "https://github.com/pokepc/classic.pokepc.net/...",
  "preset": "grouped-region",           // Preset name (e.g., "grouped-region", "national-dex")
  "total_boxes": 65,                     // Boxes needed for full Living Dex
  "boxes": [ /* PresetBox[] */ ],
  "slots": [ /* PresetSlot[] */ ]
}
```

### PresetBox

```jsonc
{ "box": 0, "source_label": "Kanto 1" }
```

### PresetSlot

```jsonc
{
  "dex_id": 1,                    // National Dex number
  "box": 0,                       // Target box index
  "slot": 0,                      // Target slot index (0–29)
  "source_token": "bulbasaur",    // Showdown-compatible slug
  "source_box_title": "Kanto 1"   // Display label for the box
}
```

1,025 slots total, covering every species in the National Dex.

---

## 5. champions_pokemon.json — Champions Reference

Which Pokémon species and Mega Evolutions are available in Pokémon Champions.

### Top-level

```jsonc
{
  "meta": {
    "source": "https://bulbapedia.bulbagarden.net/...",
    "version": "1.0.2",
    "scraped_date": "2025-07-23-fixed",
    "total_base_entries": 311,
    "total_mega_entries": 59,
    "unique_dex_numbers": 283
  },
  "pokemon": [ /* ChampionsSpecies[] */ ],
  "megas": [ /* ChampionsMega[] */ ]
}
```

### ChampionsSpecies

```jsonc
{
  "dex_id": 6,
  "name": "Charizard",
  "form": null,              // null for base, string for alternate forms
  "type1": "Fire",
  "type2": "Flying",
  "version_added": "1.0.2",
  "normally_available": "TBD"
}
```

### ChampionsMega

```jsonc
{
  "dex_id": 6,
  "name": "Charizard",
  "mega_form": "Mega X",    // "Mega", "Mega X", "Mega Y"
  "type1": "Fire",
  "type2": "Dragon",
  "version_added": "1.0.2"
}
```

311 base species + 59 Mega Evolutions (283 unique dex numbers).

---

## 6. champions_filter.json — Derived Filter

Pre-computed filter for quick Champions availability checks. Derived from `champions_pokemon.json`.

```jsonc
{
  "description": "...",
  "dex_ids": [3, 6, 9, ...],           // Array of 283 National Dex numbers in Champions
  "mega_slugs": ["venusaur-mega", ...]  // Array of 59 Mega Showdown slugs
}
```

---

## 7. reference/*.json — Smogon Reference Data

Read-only reference data converted from [smogon/pokemon-showdown](https://github.com/smogon/pokemon-showdown) `data/` (MIT license). These are keyed by Showdown ID (lowercase, no spaces).

### reference/pokedex.json

1,516 entries. Key = Showdown ID (e.g., `"bulbasaur"`, `"rotomheat"`).

```jsonc
{
  "bulbasaur": {
    "num": 1,
    "name": "Bulbasaur",
    "types": ["Grass", "Poison"],
    "baseStats": { "hp": 45, "atk": 49, "def": 49, "spa": 65, "spd": 65, "spe": 45 },
    "abilities": { "0": "Overgrow", "H": "Chlorophyll" },
    "genderRatio": { "M": 0.875, "F": 0.125 },
    "evos": ["Ivysaur"]
    // ... additional fields
  }
}
```

### reference/moves.json

954 entries. Key = Showdown ID.

```jsonc
{
  "earthquake": {
    "num": 89,
    "name": "Earthquake",
    "type": "Ground",
    "category": "Physical",
    "basePower": 100,
    "accuracy": 100,
    "pp": 10,
    "priority": 0
    // ... additional fields
  }
}
```

### reference/items.json

583 entries. Key = Showdown ID.

```jsonc
{
  "lifeorb": {
    "num": 270,
    "name": "Life Orb",
    "gen": 4,
    "fling": { "basePower": 30 }
  }
}
```

### reference/abilities.json

318 entries. Key = Showdown ID.

```jsonc
{
  "intimidate": {
    "num": 22,
    "name": "Intimidate",
    "rating": 3.5
  }
}
```

### reference/natures.json

25 entries. Key = lowercase nature name.

```jsonc
{
  "adamant": { "name": "Adamant", "plus": "atk", "minus": "spa" },
  "jolly":   { "name": "Jolly",   "plus": "spe", "minus": "spa" },
  "hardy":   { "name": "Hardy",   "plus": null,   "minus": null  }
}
```

### reference/typechart.json

19 entries (18 types + Stellar). Key = lowercase type name.

```jsonc
{
  "fire": {
    "damageTaken": {
      "Bug": 3, "Dragon": 0, "Electric": 0, "Fairy": 3,
      "Fire": 3, "Flying": 0, "Ghost": 0, "Grass": 3,
      "Ground": 1, "Ice": 3, "Normal": 0, "Poison": 0,
      "Psychic": 0, "Rock": 1, "Steel": 3, "Water": 1,
      "Dark": 0, "Fighting": 0
    }
  }
}
```

Damage values: 0 = neutral, 1 = super effective, 2 = immune, 3 = resisted.

### reference/learnsets.json

~1,500 entries. Key = Showdown ID. Each species maps to a `learnset` object where keys are move slugs and values are arrays of learn method codes.

```jsonc
{
  "bulbasaur": {
    "learnset": {
      "tackle": ["9L1", "8L1", "7L1"],     // Level-up in gens 9, 8, 7
      "sludgebomb": ["9M", "8M"],            // TM in gens 9, 8
      "curse": ["9E"],                       // Egg move in gen 9
      "grassknot": ["9T"]                    // Tutor in gen 9
    }
  }
}
```

Learn method codes: `{gen}{method}[level]` where method is `L` (level-up), `M` (TM/HM), `T` (tutor), `E` (egg), `S` (special/event), `R` (recall/relearn).

**Size: ~3.1 MB.** This is the largest reference file. Consider lazy-loading in the browser (fetch only when the build editor opens, not on page load).

### reference/bss-factory-sets.json

Pre-built competitive sets for Battle Stadium Singles, sourced from Smogon's `data/random-battles/gen9/bss-factory-sets.json`. Used for smart defaults when creating new builds (FR-1.9a).

```jsonc
{
  "Garchomp": {
    "sets": [
      {
        "species": "Garchomp",
        "item": "Life Orb",
        "ability": "Rough Skin",
        "nature": "Jolly",
        "evs": { "atk": 252, "spe": 252, "hp": 4 },
        "teraType": "Steel",
        "moves": [["Earthquake"], ["Scale Shot"], ["Swords Dance"], ["Protect"]],
        "weight": 5
      }
    ]
  }
}
```

Each species has one or more weighted sets. Used both as smart defaults when creating a Library Build (FR-016) **and** as the source for the per-Instance "Pick from factory sets" picker — letting users instantly stamp a known competitive set onto an Instance's Current Build without going through Library creation first.

---

## 8. presets/*.json — PokéPC Box Presets

Box layout presets from [pokepc/classic.pokepc.net](https://github.com/pokepc/classic.pokepc.net) (MIT). Used to generate `home_box_layout.json`.

- `presets/home.json` — Full HOME Living Dex layout
- `presets/sv.json` — Scarlet/Violet regional dex layout

These are upstream data consumed by the build pipeline; the app reads `home_box_layout.json` (the processed output), not these raw presets directly.

---

## Handoff Checklist

See `docs/handoff/README.md` for what to share and how to use this package.
