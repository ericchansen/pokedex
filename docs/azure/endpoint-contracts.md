# API Endpoint Contracts

All endpoints require authentication (SWA `x-ms-client-principal-id` header) unless marked anonymous.
User data is namespaced: `users/{userId}/...` in Blob Storage.

## Builds (5 endpoints)

| Method | Path | Auth | Request Body | Response | Status |
|--------|------|------|-------------|----------|--------|
| GET | `/api/builds` | ✓ | — | `{ "builds": [...] }` | 200 |
| GET | `/api/builds/{id}` | ✓ | — | `{ "id", "build": {...}, "egg_moves"?, ... }` | 200 / 404 |
| POST | `/api/builds` | ✓ | `{ "build": {...}, "egg_moves"?: [...] }` | Created build object | 201 (new) / 200 (dedupe match) |
| PUT | `/api/builds/{id}` | ✓ | `{ "build": {...}, "egg_moves"?: [...] }` | Updated build object | 200 / 404 |
| DELETE | `/api/builds/{id}` | ✓ | — | `{ "deleted": "{id}" }` | 200 / 404 |

### Builds — Implementation Notes

- **Storage (Azure):** Per-build blobs at `users/{userId}/builds/{id}.json` + index at `users/{userId}/builds/_index.json`
- **Index shape:** `[{ "id", "species", "slug", "fingerprint", "updated" }]`
- **POST dedupe:** Compute fingerprint; if match found in index, return existing build (200, not 201)
- **POST create:** Generate ULID for `id`, write individual blob, append to index
- **PUT:** Update individual blob + update index entry
- **DELETE:** Remove individual blob + remove from index
- **EV validation:** Validates `build.evs.classic` (per_stat ≤ 252, total ≤ 510) and `build.evs.champions` (per_stat ≤ 32, total ≤ 66) and `build.evs.classic_ivs` (0–31)
- **ETag:** Per-build blob uses ETag for atomic_update. Index uses ETag for append/remove.

## Teams (5 endpoints)

| Method | Path | Auth | Request Body | Response | Status |
|--------|------|------|-------------|----------|--------|
| GET | `/api/teams` | ✓ | — | `{ "teams": [...] }` | 200 |
| GET | `/api/teams/{id}` | ✓ | — | Team object | 200 / 404 |
| POST | `/api/teams` | ✓ | Team object (without id) | Team object (with id) | 201 |
| PUT | `/api/teams/{id}` | ✓ | Team object | Updated team object | 200 / 404 |
| DELETE | `/api/teams/{id}` | ✓ | — | `{ "deleted": "{id}" }` | 200 / 404 |

### Teams — Implementation Notes

- **Storage (Azure):** Single blob at `users/{userId}/teams.json`
- **Shape:** `{ "teams": [{ "id", "name", "game", "members": [{ "slot", "build_id" }] }] }`
- **POST:** Generate ULID if no `id`; append to teams array
- **Team member validation:** Each member must have `build_id` (string), `slot` (int). No extra keys allowed. No `evs_migration_needed` field on team.
- **ETag:** Single blob ETag for read-modify-write

## Inventory (7 endpoints)

| Method | Path | Auth | Request Body | Response | Status |
|--------|------|------|-------------|----------|--------|
| GET | `/api/inventory` | ✓ | — | Sparse inventory (all boxes) | 200 |
| GET | `/api/inventory/{boxId}` | ✓ | — | Single box object | 200 / 404 |
| PUT | `/api/inventory/{boxId}` | ✓ | `{ "name": "..." }` | Updated box | 200 / 404 |
| PUT | `/api/inventory/{boxId}/{slot}` | ✓ | `{ "build": {...}, "identity"?: {}, "target_build_id"?: str }` | Occupant object | 200 / 400 / 404 |
| DELETE | `/api/inventory/{boxId}/{slot}` | ✓ | — | `{ "cleared": true, "box": N, "slot": N }` | 200 / 404 |
| POST | `/api/inventory/move` | ✓ | `{ "from_box", "from_slot", "to_box", "to_slot" }` | Move result | 200 / 400 / 404 |
| POST | `/api/inventory/batch` | ✓ | `{ "operations": [{ "op": "set"\|"clear", "box", "slot", ... }] }` | `{ "applied": N, "results": [...], "errors"?: [...] }` | 200 / 400 |

### Inventory — Implementation Notes

- **Storage (Azure):** Single blob at `users/{userId}/inventory.json`
- **Sparse GET:** Returns full structure with metadata (`version`, `box_count`, `slots_per_box`, `columns`, `rows`, `boxes`)
- **Set slot validation:** `build.species` required; EV validation on `build.evs`; `target_build_id` must be string or null; `identity` must be object
- **Move:** Swap semantics (source and target swap contents)
- **Batch:** Partial success allowed — applies valid ops, reports errors for invalid ones. Single disk write.
- **Route ordering:** `/move` and `/batch` matched BEFORE `/{boxId}` to avoid treating them as box IDs
- **ETag:** Single blob ETag for all inventory mutations

## Health (1 endpoint)

| Method | Path | Auth | Request Body | Response | Status |
|--------|------|------|-------------|----------|--------|
| GET | `/api/health` | anonymous | — | `{ "status": "ok" }` | 200 |

## Blob Namespace

```
userdata/                              ← blob container
  users/{principalId}/
    builds/
      _index.json                      ← lightweight list: [{id, species, slug, fingerprint, updated}]
      {buildId}.json                   ← individual build (full payload)
    teams.json                         ← { "teams": [...] }
    inventory.json                     ← { "version", "box_count", ..., "boxes": [...] }
```

## ETag Concurrency Strategy

| Resource | Granularity | Conflict Behavior |
|----------|-------------|-------------------|
| Individual build blob | Per-build ETag | Retry with fresh ETag (5x exponential backoff) |
| Builds index | Single ETag | Retry on conflict (append/remove are idempotent) |
| Teams blob | Single ETag | Retry with fresh ETag (5x exponential backoff) |
| Inventory blob | Single ETag | Retry with fresh ETag (5x exponential backoff) |

On unresolvable conflict (all retries exhausted): return **409 Conflict** to client.
Client should refetch and retry the operation.

## Error Responses

All errors return JSON:
```json
{ "error": "Human-readable message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Validation failure (EV limits, missing required fields) |
| 401 | Not authenticated (no principal ID header) |
| 404 | Resource not found |
| 405 | Method not allowed |
| 409 | ETag conflict (all retries exhausted) |
| 412 | Precondition failed (stale ETag from client) |
| 500 | Internal server error |
