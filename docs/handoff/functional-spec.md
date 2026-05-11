# Functional Specification: Pokémon HOME Tracker

| | |
|---|---|
| **Status** | Draft |
| **Version** | 3.1 |
| **Author** | Eric Hansen |

> **Alpha rules**: No backwards compatibility. DRY. Minimize LoC. Ideal state only.
> RFC-2119 keywords: **MUST**, **SHOULD**, **MAY**, **MUST NOT**.

---

## Glossary

> **Refactored terminology (v3.x):** A **Build is ONE data shape that plays two roles** depending on where it lives. The role is stamped on the record via `kind: "library" | "instance"`.
> - **Library Build** = a reusable Build in `builds.json`. Shared, deduped, can be referenced by 0..N Instances and Teams. (Older spec text calls this "Target".)
> - **Instance Build** ("Current Build") = a Build embedded 1:1 in an inventory slot. Describes the *actual current state* of a real Pokémon. Edited as the Pokémon is trained.
> - **Target Build** = an *optional* FK from an Instance pointing at a Library Build the user is aiming this Pokémon toward. Stored as `target_build_id` on the slot. **Most Instances have no target** — that's the common case.
>
> Where the older spec text below says "Target" it means "Library Build". Where it talks about an Instance's "linked Target" it means an Instance whose `target_build_id` is set. The schema doc (`schema.md`) uses the new terminology end-to-end.

| Term | Definition |
|---|---|
| **Build** | The comprehensive data shape describing a Pokémon: species, form, level, nature, ability, item, tera type, moves, EVs, IVs. **Just data.** Plays one of two roles via `kind`: `"library"` (in `builds.json`) or `"instance"` (embedded in an inventory slot). |
| **Library Build** (= Target) | A Build with `kind: "library"`, stored in `data/builds.json`. Shared, deduped, references-counted. Represents a competitive ideal, factory set, or promoted Instance spec. The Builds tab lists Library Builds. Teams reference 6 Library Builds. |
| **Instance Build** ("Current Build") | A Build with `kind: "instance"`, embedded as `slot.build` in `data/inventory.json`. Describes the actual current stats of a real Pokémon. 1:1 with its Pokémon — created with the Instance, dies with it. Edited freely as the Pokémon is trained. |
| **Instance** | A real Pokémon the user owns at a specific location. Carries: `species_id`, an Instance Build (always), `identity` fields (ball, OT, language, event provenance, known egg moves, etc.), and an *optional* `target_build_id` FK pointing at a Library Build. |
| **Target Build** | A Library Build that an Instance is aiming for. Stored as `instance.target_build_id`. Optional and nullable; null is the default. When set, the UI shows drift between Current and Target. |
| **Promote** | User action: copy an Instance Build into the Library as a new Library Build (or reuse an identical existing one via fingerprint dedupe), then auto-set the Instance's `target_build_id` to that Library Build. |
| **Slot** | One of 30 cells (6×5) in a Box. Holds either an Instance or nothing. |
| **Box** | A 30-slot container in HOME. There are 200 boxes. |
| **Ownership** | Derived. A species is "owned" iff at least one Instance of that species exists. A Library Build is "owned" iff at least one Instance has `target_build_id` pointing to it. |
| **State** | Synonym for the data carried by an Instance's embedded Build plus identity fields. Any field MAY be `null` (unknown). |
| **Builds-match** (was "battle-ready") | Derived per Instance. True iff `target_build_id` is set AND the Instance's Build matches the targeted Library Build on `nature, ability, item, tera_type, moves (as set), evs`. Never stored. |
| **Lock** | A viewer state that disables editing. Used for imported Library Builds, read-only contexts. |

---

## 1. Introduction

### 1.1 Purpose

A single-user web tool for managing competitive Pokémon Builds, tracking a real Pokémon HOME inventory of Instances, organizing battle Teams from Pokémon Champions research, and storing local UI preferences such as the default HOME language.

### 1.2 Scope

The tracker is a web application served locally. Five tabs, one reusable component.

| Tab | What | Default? |
|---|---|---|
| **Boxes** | Spatial 200-box grid mirroring HOME storage. Slots hold Instances. | ✅ landing |
| **Inventory** | Analytical list of all owned Instances. Two render modes (table, card). |  |
| **Builds** | Library of target Builds (`data/builds.json`). Read/edit competitive ideals. |  |
| **Teams** | Imported and user-created battle Teams. Each Team references 6 targets. |  |
| **Settings** | Local browser preferences such as the default language used when instance language is left on the default editor option. |  |

**Pokémon Viewer** — reusable detail component (not a standalone page). Opens from any clickable Pokémon context (slot, inventory row, build card, team member). Edits a Build (intrinsic on an Instance, or a Target). Same component everywhere; the lock prop disables editing for read-only contexts.

### 1.3 Routing contract

Hash-routed SPA. URL drives view selection.

| Route | View |
|---|---|
| `#/boxes` | Boxes tab (default if no hash) |
| `#/boxes/:boxId` | Boxes tab scrolled/focused on box `:boxId` (0–199) |
| `#/inventory` | Inventory tab |
| `#/builds` | Builds tab (target library) |
| `#/builds/:buildId` | Builds tab with viewer open on target `:buildId` |
| `#/teams` | Teams tab |
| `#/teams/:teamId` | Teams tab with team `:teamId` expanded |
| `#/settings` | Settings tab |

Deep links MUST open the corresponding view + viewer. Back/forward MUST work via browser history.

### 1.4 Design Principles

- **Reuse external open-source data and assets** wherever possible. Do not maintain own species/sprite databases.
- **Single source of truth** for each concern — no duplication.
- **One Pokémon component.** The viewer is a single reusable component rendered identically everywhere. Context determines data, not rendering. Layout container (side panel vs. overlay) is an outer-shell concern; the inner component is one.
- **View and edit are the same surface.** No separate edit page. The viewer IS the editor. Lock disables editing without changing the surface. A separate "editor" page is a **MUST NOT**.
- **Data first, chrome second.** The hero content is always the Pokémon themselves. Toolbars, filters, buttons SHOULD be compact.
- **Entire surfaces are clickable.** Cards, rows, list items are click targets. Discrete action buttons live inside, but the primary action is always the surface.
- **Mobile and desktop.** Responsive web app. Touch targets ≥ 44×44px on mobile. One codebase, one URL.
- **Pokémon visual identity.** Use sprites/icons/graphics from the Pokémon ecosystem (Showdown sprites, type icons, game logos). MUST NOT use generic emojis (🔥, ⚔️, 🛡️) as substitutes for Pokémon concepts.
- **Reuse icons; do not hand-draw UI chrome.** Pokéballs, item sprites, type icons, move-category icons, game logos, favicon MUST come from existing asset sources (Showdown, PokéSprite, PokéPaste, Smogon).
- **Unowned Pokémon are visually dimmed.** Default visual state is "not owned" — quiet (grayed/desaturated). Owned Pokémon appear in full color with no extra decoration. MUST NOT use bright outlines on owned mons.
- **Controls are organized, not dumped.** Toolbars MUST have visible grouping (clusters, dividers, labels). Prefer text labels over icon-only buttons.
- **Visual direction (deferred — not initial)**: Game Boy / GBA aesthetic. Functional first.

---

## 2. External Data Sources

| Source | License | What we use |
|--------|---------|-------------|
| [smogon/pokemon-showdown](https://github.com/smogon/pokemon-showdown) `data/` | MIT | Pokédex, moves, items, abilities, natures, type chart, learnsets, BSS factory sets |
| [Pokémon Showdown sprites](https://play.pokemonshowdown.com/sprites/) | MIT | Box sprites (`gen5/`), detail sprites (`dex/`). Full Gen 1–9. |
| [pokepc/classic.pokepc.net](https://github.com/pokepc/classic.pokepc.net) | MIT | Box layout presets (`home.json`, `sv.json`) |
| [felixphew/pokepaste](https://github.com/felixphew/pokepaste) | BSD-3 | Type-color styling, stat-color styling, Showdown parser patterns |

### 2.1 Reference data pipeline

`convert_smogon_data.py` converts Smogon's `data/*.ts` to portable JSON in `data/reference/`. Includes pokedex, moves, items, abilities, natures, typechart, learnsets, bss-factory-sets. Replaces PokeAPI.

### 2.2 Game compatibility datasets

Per-game species lists in `data/reference/`:

| Game | Key | File |
|------|-----|------|
| Pokémon Champions | `champions` | `data/champions_pokemon.json` |
| Scarlet / Violet | `sv` | `data/sv_filter.json` |
| Legends: Arceus | `legends-arceus` | `data/reference/legends_arceus_pokemon.json` |
| Legends: Z-A | `legends-za` | `data/reference/legends_za_pokemon.json` |

Each is a set of national dex numbers. The UI uses these for per-slot indicators and toolbar filters.

### 2.3 Sprites

- `sprites/gen5/{slug}.png` (96×96) — box/grid sprites
- `sprites/dex/{slug}.png` (120×120) — detail/viewer sprites

**One sprite set everywhere.** MUST NOT mix PokéSprite + Showdown gen5 + custom in the same app. Missing sprites render a placeholder, never a fallback to a different set.

**Slug conventions** follow Showdown's ID format (lowercase, no spaces). Forms hyphenated (`rotom-wash`), Paradox unhyphenated (`ironhands`). Canonical slug = `Dex.Species.id` from `pokedex.ts`.

**Known pitfall**: PokéSprite `pokemon-gen8/` is missing all Gen 9. Use Showdown.

### 2.4 Showdown syntax rendering

Showdown text renders with type-aware syntax highlighting (PokéPaste-style):

- Species name colored by primary type
- Move names colored by move type
- EV/IV stats colored per stat (HP green, Atk red, Def yellow, SpA blue, SpD teal, Spe pink)

---

## 3. Data Architecture

### 3.1 Data Domains

| Domain | Contents | Mutability |
|--------|----------|-----------|
| **Reference** | Species, moves, items, abilities, natures, type chart, learnsets, BSS sets, game filters | Read-only. Sourced from Smogon at build time. |
| **User data** | Inventory (Instances in boxes), Builds (Targets), Teams | Full CRUD via API. Single-user authoritative state. |
| **Derived** | Ownership flags, progress stats, search indexes, battle-ready status | Computed at load time. Never persisted. |

### 3.2 File map

| File | Purpose |
|---|---|
| `data/inventory.json` | All Instances (placed in box slots + unplaced ownership) |
| `data/builds.json` | All target Builds + meta (OT, trade config) |
| `data/teams.json` | All Teams (imported + user-created) |
| `data/reference/*.json` | Reference data (read-only) |
| `data/presets/*.json` | PokéPC box layout presets |
| `data/champions_pokemon.json` | Champions species list |
| `data/sv_filter.json` | SV species list |

---

## 4. Persistence

Local dev server with API endpoints for CRUD. `.bak` written before any destructive write. Storage format: JSON files on disk.

---

## 5. Identity

| Field | Purpose | Example |
|-------|---------|---------|
| `id` | Stable unique primary key (hex string). Used for Builds, Teams. | `"01JRT8K2M3..."` |
| `slug` | Human-readable label. Auto-generated from species + form. Not used for identity. | `"rotom-heat"` |

Instances are identified by their location in `inventory.json` (box index + slot index) or by their position in the unplaced ownership list. They have no separate `id` — the location IS the identity.

---

## 6. Build Model (Core Taxonomy)

> **Build** = the data shape. Just data. Never a "thing in the world" by itself.

### 6.1 The three concepts

| Concept | Definition | Storage |
|---|---|---|
| **Build** (data shape) | `{species, form, level, nature, ability, item, tera_type, moves, evs, ivs}`. Any field MAY be `null` (unknown). Used everywhere stats are described. Known egg moves are tracked separately from the active 4-move set. | Embedded inside an Instance, OR stored as a Target record. |
| **Instance** | A real Pokémon at a location. Wraps a `build` (intrinsic — possibly imperfect) plus identity fields (ball, OT, language, origin game, met location, nickname, gender, shiny, event provenance, known egg moves) plus an optional `target_build_id` reference. | `data/inventory.json` slots and `ownership.unplaced[]`. |
| **Target** | A min-maxed competitive Build stored in the library. Has its own `id`, `slug`, optional `notes` and `source_url`. | `data/builds.json` `builds[]` array. |

The "Builds" UI tab shows **Targets only** — the curated competitive library. Instances live in Boxes and Inventory.

### 6.2 Linkage (Instance → Target, N:M)

| Rule | Detail |
|---|---|
| Each Instance carries `target_build_id: string \| null` | A real Pokémon can only have one set of stats at a time, so it can be aimed at only one Target. Null is legal (non-competitive mons — shinies, fillers). |
| Each Target may be referenced by 0..N Instances | Unowned Targets are valid. |
| **Ownership is derived.** | Target T is "owned" iff `∃ instance.target_build_id == T.id`. There is no `owned` flag on Targets. |
| **Battle-ready is derived.** | An Instance I is battle-ready iff `I.target_build_id != null` AND `I.build` matches the linked Target on `nature, ability, item, tera_type, moves (as set), evs`. |

### 6.3 Forbidden status labels

The data MUST NOT carry workflow status labels on Builds (Instance-intrinsic or Target). Specifically forbidden:

- ❌ `pending`, `draft`, `WIP`, `ready`, `published`, `active`, `editing`

Allowed derived indicators:

- ✅ `owned` / `unowned` (derived from references)
- ✅ `battle-ready` (derived per pair)
- ✅ Field-level integrity warnings (missing nature, EVs over budget, illegal moves)

UI summary pills (e.g., `7 owned · 72 total`, `N battle-ready / M total`) MUST NOT say `N pending`.

A transient "unsaved changes" indicator inside an active edit session is fine — it describes a UI state, not persisted lifecycle.

---

## 7. EV Systems

Two EV systems exist with different scales.

| System | Per-stat range | Total budget | IVs? |
|--------|---------------|-------------|------|
| `classic` | 0–252 | ≤ 510 | Yes (0–31) |
| `champions` | 0–32 | ≤ 66 | No |

### 7.1 Builds carry both

A Build (intrinsic on an Instance, or a Target) MAY carry both EV systems simultaneously:

```jsonc
"evs": {
  "classic":     { "hp": 252, "atk": 0, ... },
  "classic_ivs": { "hp": 31,  "atk": 0, ... },
  "champions":   { "hp": 32,  "atk": 0, ... }
}
```

Either system MAY be `null` (not yet filled). The viewer renders all available systems clearly labeled.

### 7.2 Origin game lives on the Instance

A Pokémon can move between mainline games (SV, HOME) and Champions. The `origin_game` field tracks where it was originally generated (matters for ball legality). It lives on the **Instance** (instance identity), not in the Build (the data shape).

Champions stat points are locked on first introduction to Champions (per current Champions rules).

### 7.3 Teams use one EV system

Each Team has `ev_system: "classic" | "champions"`. Members reference Targets; the referenced Target's EVs in that system MUST be present.

- Only `"champions"` Teams MAY have a `team_id`.
- Champions team members omit IVs entirely.

### 7.4 Data Integrity

Imported team data MUST satisfy:

- **EVs match the declared `ev_system` scale.** Wrong-scale EVs are invalid.
- **Every member has a `nature`.** Missing natures make the Build incomplete.
- **Moves are legal for the species** (cross-reference Smogon learnsets).

Completeness is **derived at runtime, never stored**. No `completeness` field on Teams or Builds.

---

## 8. Pokémon Viewer

The Viewer is **one component** — not "read mode" + "edit mode" + "create mode" as separate surfaces. It always renders the same way. A `lock` flag disables editing for read-only contexts (e.g., imported team's targets).

### 8.1 Layout (user preference)

| ID | Status | Requirement |
|----|--------|-------------|
| FR-001 | Implemented | The user chooses the viewer layout: side panel or overlay. A toggle in the viewer header switches between (1) **side panel** — viewer docks to one side; underlying list/grid remains visible alongside, and (2) **overlay** — viewer renders as a centered modal/dialog over a dimmed backdrop. Preference persists per-user (localStorage). Default: side panel. Both modes use the same internal component. |

### 8.2 Sections (always rendered when applicable)

| ID | Status | Requirement |
|----|--------|-------------|
| FR-002 | Implemented | **Species identity**: Showdown sprite (§2.3), name, dex number, types (type-colored badges), base stats, game-availability badges. |
| FR-003 | Implemented | **Stat rendering is one reusable component.** Base stats, EVs, IVs, and calculated final stats use the same stat-bar renderer (label, max, value → colored horizontal bar). Bar color uses standard per-stat convention: HP green, Attack red/orange, Defense yellow, Sp. Atk blue, Sp. Def teal, Speed pink. MUST NOT render all bars in a single color. |
| FR-004 | Implemented | **All info in one pane.** A Build shows all fields in a single cohesive view — no tabs or split panels for different data categories. Layout: species, nature, ability, item, ball, tera type, moves, EVs, IVs — all visible at once. |
| FR-005 | Implemented | **Build cards are immediately recognizable.** When multiple Targets exist for a species, each renders as a visually distinct card with key identity visible: item sprite/name, nature, ability, owned status, EV summary, moveset preview. MUST NOT render Targets as bare text pills. |
| FR-006 | Implemented | **Instance section first when an Instance is in context.** When the viewer opens from a box slot, inventory row, or unplaced owned record, the first section after species identity is the Instance's own intrinsic Build (its current actual fields). The linked Target card (from `target_build_id`) follows, if set. An Instance with no linked Target is valid — render the instance section alone with a "+ Link target" / "+ New target" affordance. MUST NOT hide the instance section. MUST NOT substitute species-level Targets for it. |
| FR-007 | Implemented | **Build summary header**: total Targets for this species, owned status, battle-ready count. |
| FR-008 | Implemented | **Game availability**: Show which games the species exists in (per §2.2 datasets). |

### 8.3 Editing (single surface; lock disables)

| ID | Status | Requirement |
|----|--------|-------------|
| FR-009 | Implemented | **Editing is inline.** Stat fields, dropdowns, and sliders ARE the viewer — there is no separate "edit mode" route or layout. The lock flag (when `true`) disables interaction (sliders become read-only, dropdowns become text). The lock flag does NOT change the layout. A separate edit page is a **MUST NOT**. |
| FR-010 | Implemented | **Stat editing uses sliders.** EV and IV sliders are always present in the viewer (lock disables drag). Each slider per stat × per EV system. Live recalc of derived stats. Per-system budget enforcement (510 classic / 66 champions). Numeric input boxes alongside sliders are allowed for precise entry. |
| FR-011 | Implemented | **Save workflow**: live-edit. Field changes persist immediately via the API. No separate Save button. An unsaved-changes indicator MAY appear briefly during the in-flight write. |
| FR-012 | Implemented | **Delete with confirmation.** Deleting a Target removes references from Instances and Teams (cascading null). Deleting an Instance vacates the slot. |

### 8.4 Form helpers (context-aware)

| ID | Status | Requirement |
|----|--------|-------------|
| FR-013 | Implemented | **Moves autocomplete MUST be filtered to the species' learnset.** Source: `reference/learnsets.json` (union of all game learnsets). Unfiltered move list is a **MUST NOT**. |
| FR-014 | Implemented | **Abilities MUST be filtered to the species' legal abilities** (slot 0, 1, hidden). Source: `pokedex.ts`. |
| FR-015 | Implemented | **Ball legality is NOT validated** (depends on game origin, transfer chains, breeding — too complex). Ball is a free autocomplete. |
| FR-016 | Implemented | **Smart defaults on Target creation.** When creating a new Target for a species, pre-fill from that species' default competitive set (highest-weight BSS factory set from `reference/bss-factory-sets.json`). All fields remain editable. If no factory set exists, start empty (only species pre-filled). |

### 8.5 Showdown export and import

| ID | Status | Requirement |
|----|--------|-------------|
| FR-017 | Implemented | **Showdown export** per Build and per Team. Type-aware syntax highlighting (§2.4). One-click copy. **Scope**: per-Build (inside the viewer) and per-Team (inside the team card; "copy full team" and "copy this member"). MUST NOT add per-box or global export. |
| FR-018 | Implemented | **Multi-EV export disambiguation.** When a Build has both classic and champions EVs, export defaults to **classic** (trade-bot use case). A toggle/tab switches to champions. Teams export with their declared `ev_system`. |
| FR-019 | Implemented | **Showdown paste import.** A "Paste Showdown" action accepts Showdown export text and parses it into the Build form (species, nature, ability, item, EVs, IVs, moves, tera type). Parser follows [Smogon TEAMS.md](https://github.com/smogon/pokemon-showdown/blob/master/sim/TEAMS.md). Unknown fields silently ignored. Round-trip MUST be lossless: export → re-import produces an identical Build. |

---

## 9. Boxes

The Boxes view is a 1-to-1 spatial mirror of Pokémon HOME. Every Pokémon in a box is real (an Instance). PokéPC presets overlay organizational templates toward a Living Dex.

### 9.1 Grid

| ID | Status | Requirement |
|----|--------|-------------|
| FR-020 | Implemented | HOME has **200 boxes**, each a **6×5 grid** (30 slots). Default names: "HOME 1" … "HOME 200". User MAY rename boxes. |
| FR-021 | Implemented | Each slot holds **any Instance** (any species, any form) or is **empty**. Free-form, not species-locked. |
| FR-022 | Implemented | **Clicking a populated slot opens the Pokémon Viewer with the slot's Instance context** — box index, slot index, Instance state, linked Targets. The Viewer MUST distinguish "this Pokémon in Box 3 Slot 12" from "all Targets for Garchomp." |
| FR-023 | Implemented | **Clicking an empty slot with a preset target species** opens the viewer in **reference mode** for the preset's target species — species identity, base stats, availability, existing user Targets. |
| FR-024 | Implemented | **Clicking an empty slot with no preset target** opens a **blank Pokémon editor**. Species is autocomplete. When user picks a species, form auto-populates with that species' default BSS factory set (FR-016). If multiple canonical sets exist, user picks one. |
| FR-025 | Implemented | **Drag-and-drop**: Slots support drag-and-drop to move Instances between slots/boxes. Manual reassignment via the viewer is also allowed. |
| FR-026 | Implemented | All inventory state persists via the API. |

### 9.2 Layout & density

| ID | Status | Requirement |
|----|--------|-------------|
| FR-027 | Implemented | **All 200 boxes render on a single scrollable page.** No pagination. Virtualized rendering is acceptable for performance. |
| FR-028 | Implemented | **Slots are compact — sprites only, no text.** Each slot is a small sprite with minimal padding. No species name, no dex number, no badges in the slot at default zoom. Hover/click reveals details. A 1080p screen MUST show ≥ **6 complete boxes** without scrolling. |
| FR-029 | Implemented | **Boxes have fixed dimensions — no stretching.** Box width = (slot_size × 6) + padding. Boxes tile in a grid with consistent gaps. Stretchy boxes that expand to fill columns are a **MUST NOT**. |
| FR-030 | Implemented | Box headers are compact single-line labels (box name + optional preset title). MUST NOT consume more vertical space than a single row of slots. |

### 9.3 Preset templates (PokéPC)

| ID | Status | Requirement |
|----|--------|-------------|
| FR-031 | Implemented | PokéPC presets (`home.json`, `sv.json`) define a suggested layout for a Living Dex. |
| FR-032 | Implemented | User picks one preset to apply. **Keep it simple** — offer 2–3 meaningful presets at most. MUST NOT dump every sort variant from upstream into a dropdown. |
| FR-033 | Implemented | When a preset is active, the grid shows the preset's target species per slot as a ghost/watermark. Slots where the user's actual Instance matches the preset target are visually marked "complete." |

### 9.4 Game compatibility indicators

| ID | Status | Requirement |
|----|--------|-------------|
| FR-034 | Implemented | Each occupied slot displays small game-compatibility icons for games that species is available in. Compact symbols, legible at slot scale (≤16px). |
| FR-035 | Implemented | **User selects which games to display** via a toggle bar above the boxes. Toggles: Champions, Scarlet/Violet, Legends: Arceus, Legends: Z-A. Multiple MAY be active. When none active, no compat icons shown. |
| FR-036 | Implemented | At a glance, user MUST distinguish compatible vs. incompatible Pokémon for selected games. Visible treatment on every occupied slot. |
| FR-037 | Implemented | Ghost/watermark sprites in preset mode also show compatibility icons for their target species. |

### 9.5 Filters

| ID | Status | Requirement |
|----|--------|-------------|
| FR-038 | Implemented | Filter bar above boxes: by game compatibility (Champions, SV, PLA, Z-A), by type, by region. **No owned/unowned filter** — everything in a box is owned. |
| FR-039 | Implemented | **Multi-select game filter semantics: AND (intersection).** Selecting "SV" + "PLA" shows only species available in BOTH games. Selecting nothing shows all species. |
| FR-040 | Implemented | Active filters **dim** non-matching slots (do not remove — spatial familiarity matters for HOME organization). |

### 9.6 Ownership

| ID | Status | Requirement |
|----|--------|-------------|
| FR-041 | Implemented | An Instance placed in any box slot is **owned**. |
| FR-042 | Implemented | Ownership is also manually togglable — user MAY mark a species as owned without placing it. Renders as one synthetic Instance with location `—`. |

### 9.7 Progress & summary

| ID | Status | Requirement |
|----|--------|-------------|
| FR-043 | Implemented | **Progress bar**: `owned / total` with fill % against the active preset. Live-updated. Style as in-game XP/HP bar. |
| FR-044 | Implemented | **Summary dashboard**: Living Dex completion (vs preset), total Instances, total Targets. All derived. |

---

## 10. Inventory

Analytical complement to Boxes: same data (Instances), different presentation.

**Inventory ≠ Builds.** Inventory shows Instances. The Builds tab (§ separate) shows Targets. Both views MUST reuse the same rendering primitives — same row component, same card component, same stat bars, same Viewer.

### 10.1 Instance-keyed rows

| ID | Status | Requirement |
|----|--------|-------------|
| FR-045 | Implemented | **Rows represent Instances, not species.** Two Venusaurs render as two rows. An Instance marked owned-but-unplaced renders with location `—`. **MUST NOT collapse Instances of the same species into a single row.** Data source: iterate inventory slots + unplaced ownership entries; never iterate the Pokédex. Columns reflect the Instance's intrinsic Build (`instance.build.nature` etc.), not any linked Target. |

### 10.2 Rendering modes

| ID | Status | Requirement |
|----|--------|-------------|
| FR-046 | Implemented | **Table mode** (default): Each Instance is a compact row. Columns: sprite (≤32px), name, dex#, types, location, nature, ability, item, game compat icons, linked-target badges. ≥20 rows visible on 1080p. |
| FR-047 | Implemented | **Card mode**: Each Instance with competitive data renders as a rich card showing nature, ability, item, ball, tera, EVs, IVs, moves, Showdown export copy. Responsive grid. Instances without competitive data show a minimal card. |
| FR-048 | Implemented | **Mode toggle** in the toolbar. Persists in session state (not server). |
| FR-049 | Implemented | Clicking a row/card opens the Viewer with that Instance's context. |
| FR-050 | Implemented | In table mode, all columns sortable. Default sort: dex# asc. |

### 10.3 Toolbar design

| ID | Status | Requirement |
|----|--------|-------------|
| FR-051 | Implemented | **Toolbar controls MUST be visually grouped and labeled.** Groups: (1) View mode toggles (Table/Card), (2) Ownership filter, (3) Content filters (type, game, has-target, search). Each group visually separated. A flat row of identical buttons is a **MUST NOT**. |
| FR-052 | Implemented | **Labels over icons.** Prefer text labels. Icon-only buttons MUST have a visible text label, not just a tooltip. |

### 10.4 Filters & search

| ID | Status | Requirement |
|----|--------|-------------|
| FR-053 | Implemented | **No "All" toggle.** Inventory shows only owned Instances. To see what's missing, use Boxes with a Living Dex preset. |
| FR-054 | Implemented | **Game filter** — checkboxes for Champions, SV, PLA, Z-A. Multi-select = AND (intersection — must exist in ALL selected games). |
| FR-055 | Implemented | **Type filter** — multi-select for 18 types. |
| FR-056 | Implemented | **Text search** — debounced filter by species name. |
| FR-057 | Implemented | Filters compose (AND logic). Filters are shared between table and card modes. |
| FR-057a | Implemented | **Transferred filter** — tri-state dropdown: All / Transferred to Champions / Not yet transferred. Inventory-only; composes (AND) with other filters. Absent from Builds because `transferred_to_champions` is an Instance field; Library Builds have no physical instance identity. |

### 10.5 Summary bar

| ID | Status | Requirement |
|----|--------|-------------|
| FR-058 | Implemented | Above the content: `Showing X of Y` (live with filters). |
| FR-059 | Implemented | Quick stats: total owned, total with linked targets, total in Champions, total transferred to Champions (Inventory-only). |

---

## 11. Builds (Target Library)

The Builds tab shows **target Builds only** — entries from `data/builds.json`. Reuses Inventory's renderer for cards (a Build card is the same as an Instance card minus Instance identity fields).

| ID | Status | Requirement |
|----|--------|-------------|
| FR-060 | Implemented | **Target list view.** Iterate `builds.json builds[]`. Show as cards (sprite, item, nature, ability, EV summary, moveset, owned indicator). Click → Viewer with target context. |
| FR-061 | Implemented | **Filters**: game compatibility, type, owned status (derived), search. Owned filter is meaningful here (Targets MAY be unowned). Transferred filter is intentionally absent — `transferred_to_champions` is an Instance field; Library Builds have no physical instance identity. |
| FR-062 | Implemented | **Create Target**: "New build" action. Form pre-fills from BSS factory set (FR-016). On save, persists with new id. |
| FR-063 | Implemented | **Edit / Delete**: via Viewer (same surface, FR-009 / FR-012). |
| FR-064 | Implemented | **Showdown paste import** creates a new Target (FR-019). |

---

## 12. Teams

### 12.1 Unified data model

All teams share one model with a `source` discriminator. The UI does **NOT** separate them into sections.

- `"imported"` — read-only (locked), from import. User MAY clone to make editable.
- `"user"` — full CRUD.

A small badge ("Read-only" / lock icon) on the card indicates source. Separate UI sections is a **MUST NOT**.

### 12.2 Layout

| ID | Status | Requirement |
|----|--------|-------------|
| FR-065 | Implemented | **Teams use horizontal and vertical space.** Cards tile in a responsive grid (2–3 across on 1080p). Single-column layout is a **MUST NOT** on widescreen. Each card: team name, badges, row of 6 member sprites. |
| FR-066 | Implemented | **No duplication on expand.** Expanded view replaces or extends the compact view. MUST NOT show member sprites twice. |

### 12.3 EV system & Team ID

| ID | Status | Requirement |
|----|--------|-------------|
| FR-067 | Implemented | Each team has `ev_system: "classic" | "champions"` (§7). |
| FR-068 | Implemented | Only `"champions"` teams display `team_id`. UI shows "Use in Champions" badge with the import code. |
| FR-069 | Implemented | Imported teams show `ev_system` prominently. |

### 12.4 Imported teams (locked behavior)

| ID | Status | Requirement |
|----|--------|-------------|
| FR-070 | Implemented | Imported teams display in the unified team list with a lock indicator. Cards show: creator, archetype, team_id (if champions), ev_system, derived completeness, member grid, Showdown export. |
| FR-071 | Implemented | "Clone" creates an editable copy with `source: "user"`, `cloned_from` reference. |
| FR-072 | Implemented | Each member references a Target Build. Importing a team auto-creates Targets for any unmatched members in the team's `ev_system`. If a Target for that species already exists with matching fields, member links to existing rather than duplicating. |

### 12.5 User teams (full CRUD)

| ID | Status | Requirement |
|----|--------|-------------|
| FR-073 | Implemented | User teams (`source: "user"`) fully editable. Same unified list. |
| FR-074 | Implemented | Create: empty 6-slot team with name, archetype, ev_system, notes. |
| FR-075 | Implemented | Per-member editing: species autocomplete, item, ability, nature, EVs, moves — all via the Viewer (FR-009). |
| FR-076 | Implemented | Team ops: reorder members, remove/add, delete team. |
| FR-077 | Implemented | Showdown export with PokéPaste highlighting. Copy full team or member. |

### 12.6 Cross-references

| ID | Status | Requirement |
|----|--------|-------------|
| FR-078 | Implemented | Team members show cross-references to the linked Instance (if any): owned status, "Open species detail" link. |
| FR-079 | Implemented | When an Instance is linked to a target Build (`target_build_id` set), the Viewer shows a **Gap to target** diff — fields where the Instance's intrinsic `build` differs from the linked Target. |

---

## 13. Cross-Cutting

### 13.1 Search

| ID | Status | Requirement |
|----|--------|-------------|
| FR-080 | Implemented | **Universal search** across Boxes, Inventory, Builds, Teams. Debounced. Dims non-matches in-place. |

### 13.2 Validation

| ID | Status | Requirement |
|----|--------|-------------|
| FR-081 | Implemented | **EV limits hard-enforced** (frontend inputs + backend API). Classic: per-stat 0–252, total ≤ 510. Champions: per-stat 0–32, total ≤ 66. Frontend MUST clamp to budget. Backend MUST reject violations. |
| FR-082 | Implemented | **"EV Trained" label**: a Build's EV set is labeled "EV Trained" when total = system max (510 / 66). Below the max, total is shown without the badge. Sub-max EVs are valid. Each system is labeled independently. |
| FR-083 | Implemented | **IVs**: each 0–31 OR `null` (unknown). Only on classic EV sets. Champions omits IVs entirely. |
| FR-084 | Implemented | **Unknown-value display**: `null` renders as `?` (dimmed/italicized). MUST NOT display unknown as `0`. MUST NOT hide unknown fields. The three visual states: known value (solid), known zero (solid `0`), unknown (`?` dimmed). |
| FR-085 | Implemented | Required for Build creation: species. All other fields optional. |
| FR-086 | Implemented | **Validation errors visible.** On save/create failure, UI MUST show a clear, persistent error identifying the field(s) and reason. Silent failures are a **MUST NOT**. Errors appear inline next to fields and/or in a summary banner. |

### 13.3 Loading & empty states

| ID | Status | Requirement |
|----|--------|-------------|
| FR-087 | Implemented | **Empty state**: Fresh install shows meaningful landing — not a blank screen. Boxes view renders 200 empty boxes with placeholders. Builds view shows "No targets yet — create one" CTA. Teams view shows "No teams — import or create one." |
| FR-088 | Implemented | **Loading state**: While data is fetching, show a skeleton/placeholder UI rather than a blank page or spinner. |

### 13.4 Batch operations

| ID | Status | Requirement |
|----|--------|-------------|
| FR-089 | Implemented | Build data maintains compatibility with the Showdown batch-file generation pipeline. The `meta` section (OT, trade config) lives in `builds.json` alongside `builds[]`. |

---

## 14. Viewer Contexts

The Viewer opens from multiple entry points. Context determines sections + lock state. This table is authoritative.

| Entry point | Context passed | `lock` | Sections (in order) |
|---|---|---|---|
| Box slot — occupied | `{ instance: {boxId, slotId, build, identity, target_build_id} }` | false | Species identity → **Instance** (intrinsic build, editable) → linked Target card with battle-ready badge (if linked) → "+ Link target" / "+ New target" CTA |
| Box slot — empty with preset overlay | `{ species_id, preset: true }` | true (no entity yet) | Species identity for preset species → species-level Targets (read-only) → "Place a Pokémon here" CTA |
| Box slot — empty, no preset | `{ boxId, slotId, empty: true }` | n/a | "Slot empty" placeholder → "Place a Pokémon here" CTA |
| Inventory row/card | `{ instance: {...} }` | false | Same as box slot occupied |
| Builds tab — Target | `{ target }` | false (or true if user-locked) | Species identity → Target details (editable) → linked Instances list with per-pair battle-ready status → "New Instance from this Target" CTA. **No instance section** — no Instance is in context. |
| Team member card | `{ team, member, target }` | true if `team.source === "imported"` else false | Team context + lock badge → Target details → Showdown export → cross-references to Instances linked to this Target |

Rules:

- **Instance section is present iff an Instance is in context.** Target-drill-in contexts MUST NOT synthesize a fake Instance.
- **The linked Target comes from `instance.target_build_id`, not from species lookup.** A species may have 5 Targets in `builds.json`, but the Instance renders at most one Target card — the one it's linked to.
- **Per-pair battle-ready** computed from `buildHasBattleReadyMatch(instance.build, target)` — reasons surfaced on the Target card (e.g., "Nature: Bold → Timid", "EVs: 252/0/252/0/6/0 → 32/0/32/0/0/2").
- **Layout (side panel vs. overlay) is orthogonal** — see FR-001.
- **Lock disables editing without changing the layout.** Sliders read-only. Dropdowns become text. No mode switch.

---

## Appendix A: Schema — Target Build (`data/builds.json`)

A Target is a Build record stored in the library. Carries no Instance-identity fields — those live on the Instance (Appendix C).

```jsonc
{
  "meta": {
    "ot": "Eric",
    "ot_gender": "Male",
    "trade_link": "46974523",
    "batch_size": 4
  },
  "builds": [
    {
      "id": "37177aca7d1b4350a8a1db80",
      "slug": "garchomp",
      "build": {
        "species": "Garchomp",
        "form": null,
        "nature": "Jolly",
        "ability": "Rough Skin",
        "item": "Life Orb",
        "tera_type": "Steel",
        "moves": ["Earthquake", "Scale Shot", "Swords Dance", "Protect"],
        "evs": {
          "classic":     { "hp": 0,  "atk": 252, "def": 4, "spa": 0, "spd": 0, "spe": 252 },
          "classic_ivs": { "hp": 31, "atk": 31,  "def": 31,"spa": 31,"spd": 31,"spe": 31  },
          "champions":   { "hp": 0,  "atk": 32,  "def": 2, "spa": 0, "spd": 0, "spe": 32  }
        }
      },
      "egg_moves": [],
      "notes": null,
      "source_url": null
    }
  ]
}
```

Notes:
- `meta` is for the Showdown batch-file generation pipeline (FR-089).
- `build` is the embedded Build shape (the same shape used by Instances).
- `egg_moves` stores up to 4 known inherited egg moves separately from the active 4-move set.
- `id` is the FK referenced by Instance `target_build_id` and Team `members[].build_id`.
- See `docs/handoff/schema.md` §1 for full field documentation.

---

## Appendix B: Schema — Team (`data/teams.json`)

Teams reference Target Builds by foreign key. All competitive data lives on the referenced Target.

```jsonc
{
  "teams": [
    {
      "id": "team-01",
      "source": "imported",
      "cloned_from": null,
      "name": "Cybertron Sun Offense",
      "creator": "CybertronVGC",
      "archetype": "Sun",
      "mega": "Charizard Y",
      "ev_system": "champions",
      "team_id": "NFVS4SYCW2",
      "members": [
        { "slot": 1, "build_id": "37177aca7d1b4350a8a1db80" },
        { "slot": 2, "build_id": "c13febd2d903bff0cd2625fa" },
        { "slot": 3, "build_id": "275515cdbd8ade2396fa7210" },
        { "slot": 4, "build_id": "373ff5e8d7e2380a914b5f50" },
        { "slot": 5, "build_id": "4e19d5d720fd034f5c6aeaec" },
        { "slot": 6, "build_id": "3bd81e059f9c2b6d38414fca" }
      ]
    }
  ]
}
```

Each `build_id` is a foreign key to `builds.json builds[].id`. The data layer hydrates references at load time — rendering code receives full Build objects.

See `docs/handoff/schema.md` §2 for full field documentation.

---

## Appendix C: Schema — Instance (`data/inventory.json`)

An Instance is a real Pokémon at a location. Wraps an embedded `build` (intrinsic state — possibly imperfect) plus identity fields plus an optional `target_build_id` reference (single, nullable).

```jsonc
{
  "schema_version": 3,
  "box_count": 200,
  "slots_per_box": 30,
  "columns": 6,
  "rows": 5,
  "boxes": [
    {
      "id": 0,
      "name": "Box 1",
      "slots": [
        // Empty slot:
        null,

        // Instance with known intrinsic build linked to one target:
        {
          "build": {
            "species": "Venusaur",
            "form": null,
            "level": 100,
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
          "identity": {
            "ball": "Poke",
            "gender": "F",
            "shiny": false,
            "language": "ENG",
            "ot": "Eric",
            "origin_game": "Scarlet",
            "nickname": null,
            "event_origin": false,
            "transferred_to_champions": false,
            "egg_moves": ["Leaf Storm"],
            "met_location": null,
            "hyper_trained": null,
            "gigantamax": false,
            "alpha": false
          },
          "target_build_id": "d02b52ec02c6d7efdcec2310"
        },

        // Instance with unknown intrinsic build (just placed, not yet examined), no target linked:
        {
          "build": { "species": "Pikachu" },
          "identity": {},
          "target_build_id": null
        }
      ]
    }
  ],
}
```

Rules:

- `build` is **always** an object on every non-null slot. `build.species` is required. All other fields MAY be `null` (unknown) and render as `?` (FR-084).
- `identity` is **always** an object on every non-null slot. May be `{}` (all unknown).
- `identity.egg_moves` is optional, may contain up to 4 legal egg moves for the species, and is tracked separately from `build.moves`.
- `target_build_id` is a **string or null**. Null = no competitive target linked (valid, common). When set, it MUST reference an existing Target in `builds.json`.
- Null slot = empty slot.
- Ownership is derived from placed box slots only. If a Pokémon is not in a slot, it is not counted as owned.
- An Instance's sprite, types, and base stats are derived from `build.species` against the Pokédex — never duplicated into the Instance.

See `docs/handoff/schema.md` §3 for full field documentation.

---

## Appendix D: Out of Scope

- Multi-user / auth (single-user local tool)
- Real-time sync with Pokémon HOME (no API)
- `.pk9` generation from UI (separate `Pk9Generator/` pipeline)
- Offline / PWA (always served locally)
- Other game datasets beyond Champions, SV, PLA, Z-A
