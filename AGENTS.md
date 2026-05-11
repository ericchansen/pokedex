# AGENTS.md

> **Status: Public** — feature branches via worktrees, PRs required, CI must pass before merge.

## Project Overview

Pokémon HOME Tracker — a local-first SPA (vanilla HTML/CSS/JS, no framework) for tracking competitive Pokémon Builds, HOME inventory, and Teams across Pokémon Champions and classic games (SV/SwSh). The backend is a minimal Python dev server (`serve.py`) that serves static files and provides PATCH endpoints for JSON persistence.

## Dev Setup

### Prerequisites

- [uv](https://docs.astral.sh/uv/) — fast Python runner (no global install needed)
- Python 3.10+

### Run the Dev Server

```powershell
uv run serve.py              # http://127.0.0.1:8138/
uv run serve.py --port 8080  # custom port
```

### Rebuild Reference Data

```powershell
uv run python convert_smogon_data.py    # Smogon dex/moves/items/abilities
uv run python fetch_legends_arceus.py   # Hisui dex from PokeAPI
uv run python fetch_legends_za.py       # Z-A dex from PokeAPI
```

Reference data lands in `data/reference/` (gitignored).

## Code Structure

```
site/                  SPA frontend (vanilla HTML/CSS/JS)
├── index.html         Single page shell
├── css/               Stylesheets
├── js/
│   ├── app.js              App bootstrap + navigation
│   ├── data.js             Data loading + PATCH persistence
│   ├── build-editor.js     Build creation/editing surfaces
│   ├── pokemon-viewer.js   Species/build detail viewer + build cards
│   ├── team-surfaces.js    Team list/detail/import/editor surfaces
│   ├── export-ui.js        Bulk export modal
│   ├── build-ui-helpers.js Shared build stat/render helpers
│   ├── progress-indicator.js Header progress UI
│   ├── route-refresh.js    Route remount helper after mutations
│   ├── router.js           Hash-based SPA router
│   ├── ev-convert.js       Champions SP ↔ Classic EV conversion
│   ├── team-export.js      Showdown paste export formatting
│   ├── showdown-parser.js  Showdown paste import/parse
│   ├── buildFingerprint.js Build deduplication via fingerprints
│   ├── selection.js        Multi-select state management
│   ├── selection-bar.js    Floating action bar for selections
│   ├── ui-shared.js        Shared UI utilities
│   └── views/              Per-tab view modules
userdata/              User data (gitignored — never touched by git)
├── builds.json        Library of reusable competitive Builds
├── inventory.json     200-box HOME grid (Pokémon Instances)
├── teams.json         Team compositions (FK → builds)
└── backups/           Rolling timestamped backups (last 50 per file)
data/                  Reference/config data + seed templates
├── champions_*.json   Champions-specific species/filter data
├── sv_filter.json     Scarlet/Violet availability filter
├── *.template.json    Empty seed templates for fresh clones
└── reference/         Generated from Smogon data (gitignored)
docs/handoff/          Canonical spec — this wins over README/code comments
serve.py               Dev server + JSON persistence endpoints
```

## Conventions

### Tech Stack
- **No frameworks, no bundler** — vanilla JS with ES modules loaded via `<script>` tags
- Runtime/dev server tooling is Python via `uv`; Node is dev-test-only for Playwright visual verification
- Sprites: use Showdown sprites (`play.pokemonshowdown.com/sprites/gen5/{slug}.png`), not PokéSprite (missing Gen 9)

### Data Model
- Canonical spec: `docs/handoff/schema.md` and `docs/handoff/functional-spec.md` — **the spec wins** over code comments or README
- `builds.json` = Library Builds (competitive ideals); `inventory.json` = Instances with Current Builds; `teams.json` = team compositions
- **User data lives in `userdata/` (gitignored)** — never tracked by git. The server auto-migrates from `data/` on first run and creates rolling backups in `userdata/backups/`
- Champions uses "Stat Points" (SP): 0–32 per stat, 66 total. Classic uses EVs: 0–252 per stat, 510 total
- **1 SP ≈ 8 EVs** at Level 50 (not 4). The formulas are structurally different — see `ev-convert.js` header comment

### EV/SP Conversion
- Champions stat formula: `stat = base + SP + 20` (SP adds directly, no level scaling)
- Classic at L50: `~8 EVs = 1 stat point` (due to `floor(EV/4) × 50/100`)
- All converted EVs must be multiples of 4 (sub-4 EVs are wasted in classic)
- Overflow: trim from smallest stats in 4-EV chunks to preserve max investments

## Git Workflow

- Use conventional commit prefixes: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `ci`, `perf`
- **Feature branches required** — never commit directly to `main`
- Use worktrees for feature branches: `git fetch origin && git worktree add ../pokedex-feature -b feat/description origin/main`
- PRs require CI passing before merge
- Prefer rebase + fast-forward merges for clean linear history

## Linting

All three linters must pass before committing:

```powershell
npm run lint          # ESLint (JS) + Stylelint (CSS)
npm run lint:js       # ESLint only
npm run lint:css      # Stylelint only
npm run lint:py       # Ruff (Python) via uvx
```

Contract validation scripts (run by CI):
```powershell
npm run validate:phase5-contracts   # Data schema + browser surface contracts
```

## Testing

- `ev-convert.js` has inline self-tests that run on page load (check browser console for `[EvConvert] self-test passed`)
- Verify changes visually by running the dev server and checking the browser
- Check browser console for errors after any JS changes

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/builds` | All builds |
| GET | `/api/teams` | All teams |
| GET | `/api/inventory` | HOME inventory |
| PATCH | `/api/builds` | Update builds.json |
| PATCH | `/api/teams` | Update teams.json |
| PATCH | `/api/inventory` | Update inventory.json |

## Domain Notes

- Smogon's Showdown stores Champions SP values in the `evs` field (same key, different scale)
- PokéPaste (BSD-3) has reusable type-color CSS and Showdown parser regexes
- Smogon `pokemon-showdown/data/` (MIT) is the reference for dex, moves, items, abilities, natures, typechart
