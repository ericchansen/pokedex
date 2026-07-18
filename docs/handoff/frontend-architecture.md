# Frontend Architecture

The frontend is a framework-free single-page application built from native ES modules. It has
no bundler and must remain deployable as static files.

## Bootstrap and routes

- `site/index.html` contains the application shell and one module entry: `site/js/app.js`.
- `app.js` initializes bootstrap data, composes shell services, and registers route loaders.
- `router.js` loads route modules with dynamic `import()`, caches successful loads, ignores stale
  asynchronous dispatches, and exposes retryable load errors.
- The Boxes and Settings routes load only their view modules. Inventory, Builds, and Teams also
  call `DataManager.ensureEditorData()` before mounting.
- Application modules use explicit imports. Publishing app-owned APIs on `window` or consuming
  them through `globalThis` is prohibited by `tools/validate_module_graph.mjs`.

## Data ownership

`data.js` remains the compatibility facade used by feature modules, while focused modules under
`site/js/data/` own API access, repositories, storage mapping, reference loading, learnsets,
presets, species queries, and entity notifications.

Bootstrap loads the species data and user entities needed for read-only browsing. Moves, items,
abilities, and natures are editor-only reference data and load once on demand. Learnsets, presets,
and factory sets retain their own cached lazy loaders.

Mutations persist through the repository layer, update the affected in-memory indexes, and then
replace the current `EntityStore` slice with precise change metadata. They must not call full
application initialization.

`EntityStore` owns four versioned data slices:

| Slice | Contents |
|-------|----------|
| `reference` | Species and game-availability reference state |
| `builds` | Library builds and derived indexes |
| `teams` | Teams and build-reference indexes |
| `inventory` | Boxes, slots, instances, and ownership indexes |

Each event identifies the changed slice and, where applicable, entity IDs, boxes, or slots.
Callers must always provide the current slice value, even when they mutate it in place. Nested
events are queued to preserve listener order. Listener failures are logged and isolated after a
committed mutation.

## Shell state

`AppStore` owns only browser queries, selection IDs, and detail-panel state. Consumers subscribe
with `subscribe(selector, listener, equality)`, so an unrelated state change does not notify or
remount a surface.

Route navigation is separate from state invalidation: the router mounts on navigation, while
mounted views subscribe to the specific `AppStore` selectors and `EntityStore` slices they use.

## Rendering

- Inventory, Builds, and Team collections reconcile children by stable entity key.
- `ui/keyed-list.js` preserves unchanged nodes and listeners, performs in-place ordering, and
  restores equivalent keyboard focus when a changed item must be replaced.
- `views/home.js` composes the Boxes route from focused grid, slot-rendering, drag/drop, placement,
  and slot-action controllers under `views/boxes/`. Each stateful controller owns its cleanup.
- The Boxes route responds to inventory metadata and slot events rather than remounting the route.
- Query selectors cache derived results by normalized query and entity-slice version.
- Existing pagination, lazy images, `content-visibility`, and box observation limit mounted work.
  Do not add general virtualization without measuring a remaining bottleneck in Edge.

## Shared UI

Reusable DOM, clipboard, feedback-dialog, detail-panel, and keyed-list behavior lives under
`site/js/ui/`. Existing form, move, stat, autocomplete, and surface modules remain the canonical
implementations for editor controls.

`DetailPanel` owns panel lifecycle, focus restoration, cancellation revisions, `aria-hidden`, and
`inert`. Modal feedback traps focus and consumes Escape before the application-level handler.

Styles are split by cascade ownership and linked in this order:

1. `core.css`
2. `boxes.css`
3. `details.css`
4. `features.css`
5. `themes.css`

Keep responsive rules with the feature they modify and preserve this explicit order.

## Runtime contracts and validation

Shared checked-JavaScript contracts live in `site/js/types/contracts.d.ts`. TypeScript runs with
`allowJs`, `checkJs`, and `noEmit`; JavaScript remains the runtime source.

Run these checks after frontend architecture changes:

```powershell
npm run lint
npm run lint:py
npm run typecheck
npm run validate:modules
npm run validate:contracts
npm run test:unit
npm run test:frontend
npm run test:py
```

The frontend E2E suite launches Microsoft Edge and covers route loading, isolated route search,
targeted mutations, node/focus preservation, dialog keyboard behavior, and cancellation of stale
detail requests.
