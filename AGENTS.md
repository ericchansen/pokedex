# AGENTS.md

> **Status: Public** — feature branches via worktrees, PRs required, CI must pass before merge.

## Project Overview

Pokémon HOME Tracker — a multi-user SPA (vanilla HTML/CSS/JS, no framework) for tracking competitive Pokémon Builds, HOME inventory, and Teams across Pokémon Champions and classic games (SV/SwSh). Hosted on Azure Static Web Apps with a Python Azure Functions backend and Blob Storage persistence. Local dev via `serve.py` (single-user, no auth) or SWA CLI + Azurite (multi-user, mock auth).

## Dev Setup

### Prerequisites

- [uv](https://docs.astral.sh/uv/) — fast Python runner (no global install needed)
- Python 3.10+
- [Node.js 22+](https://nodejs.org/) (for SWA CLI + linting)

### Run Locally (Simple — Single User)

```powershell
uv run serve.py              # http://127.0.0.1:8138/
uv run serve.py --port 8080  # custom port
```

### Run Locally (Full Stack — Multi-User Mock)

```powershell
# Terminal 1: Start Azurite (blob storage emulator)
azurite --silent --location .azurite

# Terminal 2: Seed test data + start SWA CLI
uv run python scripts/seed_azurite.py
npx swa start site --api-location api
# Browse: http://localhost:4280
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
│   ├── data.js             Data facade + mutation orchestration
│   ├── data/               Repositories, mappers, reference loaders, entity store
│   ├── state/              Selector-based shell state and derived selectors
│   ├── build-editor.js     Build creation/editing surfaces
│   ├── pokemon-viewer.js   Species/build detail viewer + build cards
│   ├── team-surfaces.js    Team list/detail/import/editor surfaces
│   ├── export-ui.js        Bulk export modal
│   ├── build-ui-helpers.js Shared build stat/render helpers
│   ├── progress-indicator.js Header progress UI
│   ├── router.js           Hash-based SPA router
│   ├── ev-convert.js       Champions SP ↔ Classic EV conversion
│   ├── team-export.js      Showdown paste export formatting
│   ├── showdown-parser.js  Showdown paste import/parse
│   ├── buildFingerprint.js Build deduplication via fingerprints
│   ├── selection.js        Multi-select state management
│   ├── selection-bar.js    Floating action bar for selections
│   ├── ui/                 Reusable widgets, surfaces, DOM, dialog, panel, keyed list
│   ├── ui-shared.js        Domain presentation helpers
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
api/                   Azure Functions backend (Python 3.10, v2 model)
├── function_app.py    Entry point — registers blueprints
├── builds.py          Build CRUD endpoints (per-build blobs)
├── teams.py           Team CRUD endpoints
├── inventory.py       Inventory CRUD endpoints
├── domain/            Pure domain logic (operations, validation, fingerprint, ulid)
├── shared/            Cloud-only modules (blob_store, auth)
├── tests/             pytest unit tests
├── host.json          Functions runtime config
└── requirements.txt   Python dependencies
infra/                 Bicep IaC templates
├── data.bicep         Storage account + lock (rg-pokemon-data)
├── app.bicep          SWA + identity + role (rg-pokemon-app)
└── modules/           Reusable Bicep modules
docs/handoff/          Canonical spec — this wins over README/code comments
docs/azure/            Azure deployment contracts + docs
serve.py               Local-only dev server (single user, no auth)
```

## Conventions

### Tech Stack
- **No frameworks, no bundler** — vanilla JS with one module entry and explicit ES module imports
- Runtime/dev server tooling is Python via `uv`; Node is dev-test-only for linting, checked JavaScript, and Edge tests
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

### Preset Matching (Data-Driven)

Preset slot matching uses a generic key-value system. A `PresetTarget` declares two metadata maps:

```js
{
  pid: string,                      // round-trip identifier
  species, speciesKey: string,
  requires: { [key]: value },       // STRICT: actual must be set AND equal
  defaults: { [key]: value },       // LENIENT: unset OK; explicit non-equal fails
}
```

**Adding a new match dimension** (e.g., a new species with cap-color metadata):

1. **Add an entry to `FORM_METADATA`** in `site/js/form-metadata.js`:
   ```js
   capColor: {
     normalize: v => String(v).toLowerCase(),
     tooltip: v => v ? formatValue(v) : null,
     sprite: (v, slug) => slug === 'newmon' ? [`newmon-${v}`] : null,
     placement: (slug) => slug === 'newmon' ? { type: 'select', options: ['Red', 'Blue'] } : null,
   },
   ```

2. **Edit preset JSON** (`data/presets/*.json`):
   ```json
   { "species": "NewMon", "requires": { "capColor": "Red" } }
   ```

That's it. Everything derives from the registry:
- **Storage roundtrip**: `FORM_EXTRA_FIELDS` auto-includes registry keys
- **Matching**: `NORMALIZERS` auto-derived from `normalize` functions
- **Tooltips**: `buildTooltipSuffix` calls each entry's `tooltip` function
- **Sprites**: `buildSpriteCandidates` calls each entry's `sprite` function
- **Placement UI**: `getPlacementControls` calls each entry's `placement` function
- **The matcher** (`matchesPreset`): NO changes — pure key-value loop

Legacy PID string shorthand is still supported for simple cases:
- `"butterfree-f"` → auto-extracted as `requires.gender = "F"`
- `"rockruff--own-tempo"` → auto-extracted as `requires.ability = "Own Tempo"`
- `{ "pid": "venusaur", "gmax": true }` → auto-extracted as `requires.gigantamax = true`

Complex multi-dimension cases (Alcremie cream + sweet) MUST use structured form.

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
npm run validate:contracts   # Deprecated API scan + data schema + domain round trips
npm run validate:modules     # One entry, acyclic imports, no app globals
```

## Testing

- `ev-convert.js` has inline self-tests that run on page load (check browser console for `[EvConvert] self-test passed`)
- `npm run typecheck` checks JavaScript and shared contracts without emitting files
- `npm run test:unit` runs frontend state and infrastructure tests
- `npm run test:frontend` runs critical browser flows in Microsoft Edge
- `uv run --with pytest --with azure-functions pytest api/tests/ -v` runs backend tests
- Verify changes visually by running the dev server and checking the browser
- Check browser console for errors after any JS changes

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/builds` | All builds (index) |
| GET | `/api/builds/{id}` | Single build |
| POST | `/api/builds` | Create build |
| PUT | `/api/builds/{id}` | Update build |
| DELETE | `/api/builds/{id}` | Delete build |
| GET | `/api/teams` | All teams |
| GET | `/api/teams/{id}` | Single team |
| POST | `/api/teams` | Create team |
| PUT | `/api/teams/{id}` | Update team |
| DELETE | `/api/teams/{id}` | Delete team |
| GET | `/api/inventory` | Full inventory |
| GET | `/api/inventory/{boxId}` | Single box |
| PUT | `/api/inventory/{boxId}` | Rename box |
| PUT | `/api/inventory/{boxId}/{slot}` | Set slot |
| DELETE | `/api/inventory/{boxId}/{slot}` | Clear slot |
| POST | `/api/inventory/move` | Move slot |
| POST | `/api/inventory/batch` | Batch operations |
| GET | `/api/health` | Health check (anonymous) |

## Domain Notes

- Smogon's Showdown stores Champions SP values in the `evs` field (same key, different scale)
- PokéPaste (BSD-3) has reusable type-color CSS and Showdown parser regexes
- Smogon `pokemon-showdown/data/` (MIT) is the reference for dex, moves, items, abilities, natures, typechart

## Azure Deployment

### Architecture

- **Azure Static Web Apps (Free)** — hosts `site/` as static content + `api/` as managed Functions
- **Azure Functions (Python 3.10)** — API backend, auto-scaled by SWA
- **Azure Blob Storage** — per-user data in `users/{principalId}/` namespace
- **SWA Easy Auth** — zero-code GitHub + Microsoft login

### Infrastructure (Bicep)

```powershell
# Deploy data layer (storage + lock) — do this ONCE
az deployment sub create --location eastus2 --template-file infra/data.bicep --parameters infra/data.bicepparam

# Deploy app layer (SWA + identity + role)
az deployment sub create --location eastus2 --template-file infra/app.bicep --parameters infra/app.bicepparam
```

### Data Protection

- **CanNotDelete lock** on storage account (must `az lock delete` before any destructive ops)
- **Split resource groups**: `rg-pokemon-data` (locked) + `rg-pokemon-app` (teardown-safe)
- **Blob versioning** + 7-day soft delete + 90-day lifecycle cleanup
- **ETag concurrency** — 412 on conflict, client retries

### Migration

```powershell
# Dry run
uv run python scripts/migrate_to_blob.py --user-id <principal-id>

# Execute
uv run python scripts/migrate_to_blob.py --user-id <principal-id> --execute
```

### Backend Tests

```powershell
uv run --with pytest --with azure-functions pytest api/tests/ -v
```
