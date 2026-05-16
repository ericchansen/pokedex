/**
 * state/app-store.js - Central runtime store for shell/query/selection/detail state.
 */
export const AppStore = (() => {
  const SEC = {
    boxes: globalThis.AppRoutes?.sections?.boxes || 'boxes',
    inventory: globalThis.AppRoutes?.sections?.inventory || 'inventory',
    builds: globalThis.AppRoutes?.sections?.builds || 'builds',
    teams: globalThis.AppRoutes?.sections?.teams || 'teams',
    settings: globalThis.AppRoutes?.sections?.settings || 'settings',
  };

  const SELECTION_KEY = 'pokechamp.selection';
  const VIEWER_LAYOUT_KEY = 'viewerLayout';
  const listeners = new Set();
  const QUERY_ROUTES = Object.freeze([
    SEC.boxes,
    SEC.inventory,
    SEC.builds,
    SEC.teams,
    SEC.settings,
  ]);

  function loadSelectionIds() {
    try {
      const raw = localStorage.getItem(SELECTION_KEY);
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed)
        ? [...new Set(parsed.filter((value) => typeof value === 'string' && value))]
        : [];
    } catch (error) {
      console.warn('[AppStore] failed to load selection ids', error);
      return [];
    }
  }

  function loadViewerLayout() {
    try {
      return localStorage.getItem(VIEWER_LAYOUT_KEY) === 'overlay' ? 'overlay' : 'panel';
    } catch (error) {
      console.warn('[AppStore] failed to load viewer layout', error);
      return 'panel';
    }
  }

  function getActiveQueryRoute() {
    return globalThis.AppRoutes?.sectionForHash?.()
      || globalThis.AppRoutes?.DEFAULT_SECTION
      || 'boxes';
  }

  function normalizeQueryRoute(route) {
    const normalized = String(route || getActiveQueryRoute() || '').trim();
    return QUERY_ROUTES.includes(normalized)
      ? normalized
      : (globalThis.AppRoutes?.DEFAULT_SECTION || 'boxes');
  }

  function normalizeStringArray(values) {
    return [...new Set((Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean))];
  }

  function createDefaultBrowserQuery(route) {
    const normalizedRoute = normalizeQueryRoute(route);
    return {
      search: '',
      games: [],
      flags: [],
      type: '',
      generation: '',
      transferred: '',
      source: '',
      ownedOnly: false,
      mode: normalizedRoute === (SEC.boxes) ? 'grid' : 'table',
      sortKey: 'num',
      sortAsc: true,
    };
  }

  function normalizeBrowserQuery(route, query = {}) {
    const normalizedRoute = normalizeQueryRoute(route);
    const defaults = createDefaultBrowserQuery(normalizedRoute);
    return {
      search: String(query.search ?? defaults.search),
      games: normalizeStringArray(query.games ?? defaults.games),
      flags: normalizeStringArray(query.flags ?? defaults.flags),
      type: String(query.type ?? defaults.type),
      generation: String(query.generation ?? defaults.generation),
      transferred: String(query.transferred ?? defaults.transferred),
      source: String(query.source ?? defaults.source),
      ownedOnly: !!query.ownedOnly,
      mode: normalizedRoute === (SEC.boxes)
        ? 'grid'
        : (query.mode === 'card' ? 'card' : 'table'),
      sortKey: String(query.sortKey || defaults.sortKey),
      sortAsc: query.sortAsc == null ? defaults.sortAsc : !!query.sortAsc,
    };
  }

  function cloneBrowserQuery(route, query) {
    const normalized = normalizeBrowserQuery(route, query);
    return {
      ...normalized,
      games: [...normalized.games],
    };
  }

  function cloneQueryState(byRoute = {}) {
    const out = {};
    for (const route of QUERY_ROUTES) {
      out[route] = cloneBrowserQuery(route, byRoute[route]);
    }
    return out;
  }

  function browserQueryEquals(a, b) {
    const aFlags = a.flags || [];
    const bFlags = b.flags || [];
    return (
      a.search === b.search
      && a.type === b.type
      && a.generation === b.generation
      && a.transferred === b.transferred
      && a.source === b.source
      && a.ownedOnly === b.ownedOnly
      && a.mode === b.mode
      && a.sortKey === b.sortKey
      && a.sortAsc === b.sortAsc
      && a.games.length === b.games.length
      && a.games.every((value, index) => value === b.games[index])
      && aFlags.length === bFlags.length
      && aFlags.every((value, index) => value === bFlags[index])
    );
  }

  let state = {
    query: {
      byRoute: cloneQueryState(),
    },
    selection: {
      ids: loadSelectionIds(),
    },
    route: {
      revision: 0,
    },
    detail: {
      open: false,
      layout: loadViewerLayout(),
    },
  };

  function cloneState() {
    return {
      query: {
        byRoute: cloneQueryState(state.query.byRoute),
      },
      selection: { ids: [...state.selection.ids] },
      route: { ...state.route },
      detail: { ...state.detail },
    };
  }

  function emit() {
    const snapshot = cloneState();
    for (const listener of [...listeners]) {
      listener(snapshot);
    }
  }

  function update(mutator) {
    const nextState = mutator(cloneState());
    if (!nextState) return;
    state = nextState;
    emit();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getState() {
    return cloneState();
  }

  function persistSelection(ids) {
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(ids));
    } catch (error) {
      console.warn('[AppStore] failed to persist selection ids', error);
    }
  }

  function getBrowserQuery(route) {
    const normalizedRoute = normalizeQueryRoute(route);
    return cloneBrowserQuery(normalizedRoute, state.query.byRoute[normalizedRoute]);
  }

  function setBrowserQuery(route, nextQuery) {
    const normalizedRoute = normalizeQueryRoute(route);
    const currentQuery = state.query.byRoute[normalizedRoute] || createDefaultBrowserQuery(normalizedRoute);
    const normalizedNext = normalizeBrowserQuery(normalizedRoute, nextQuery);
    if (browserQueryEquals(currentQuery, normalizedNext)) return false;
    update((current) => ({
      ...current,
      query: {
        byRoute: {
          ...current.query.byRoute,
          [normalizedRoute]: cloneBrowserQuery(normalizedRoute, normalizedNext),
        },
      },
    }));
    return true;
  }

  function patchBrowserQuery(route, patch) {
    const normalizedRoute = normalizeQueryRoute(route);
    return setBrowserQuery(normalizedRoute, {
      ...state.query.byRoute[normalizedRoute],
      ...patch,
    });
  }

  function setBrowserSearchQuery(route, query) {
    return patchBrowserQuery(route, { search: String(query || '') });
  }

  function clearBrowserSearchQuery(route) {
    return setBrowserSearchQuery(route, '');
  }

  function replaceBrowserGames(route, games) {
    return patchBrowserQuery(route, { games: normalizeStringArray(games) });
  }

  function toggleBrowserGame(route, game) {
    const normalizedRoute = normalizeQueryRoute(route);
    const value = String(game || '').trim();
    if (!value) return false;
    const currentGames = state.query.byRoute[normalizedRoute]?.games || [];
    return replaceBrowserGames(
      normalizedRoute,
      currentGames.includes(value)
        ? currentGames.filter((entry) => entry !== value)
        : [...currentGames, value]
    );
  }

  function toggleBrowserFlag(route, flagKey) {
    const normalizedRoute = normalizeQueryRoute(route);
    const value = String(flagKey || '').trim();
    if (!value) return false;
    const currentFlags = state.query.byRoute[normalizedRoute]?.flags || [];
    const nextFlags = currentFlags.includes(value)
      ? currentFlags.filter((f) => f !== value)
      : [...currentFlags, value];
    return patchBrowserQuery(normalizedRoute, { flags: nextFlags });
  }

  function setBrowserTypeFilter(route, type) {
    return patchBrowserQuery(route, { type: String(type || '') });
  }

  function setBrowserGenerationFilter(route, generation) {
    return patchBrowserQuery(route, { generation: String(generation || '') });
  }

  function setBrowserTransferredFilter(route, transferred) {
    return patchBrowserQuery(route, { transferred: String(transferred || '') });
  }

  function setBrowserOwnedOnly(route, ownedOnly) {
    return patchBrowserQuery(route, { ownedOnly: !!ownedOnly });
  }

  function setBrowserSourceFilter(route, source) {
    return patchBrowserQuery(route, { source: String(source || '') });
  }

  function setBrowserMode(route, mode) {
    return patchBrowserQuery(route, { mode: mode === 'card' ? 'card' : 'table' });
  }

  function toggleBrowserSort(route, sortKey) {
    const normalizedRoute = normalizeQueryRoute(route);
    const currentQuery = state.query.byRoute[normalizedRoute] || createDefaultBrowserQuery(normalizedRoute);
    const nextSortKey = String(sortKey || currentQuery.sortKey || 'num');
    return patchBrowserQuery(normalizedRoute, {
      sortKey: nextSortKey,
      sortAsc: currentQuery.sortKey === nextSortKey ? !currentQuery.sortAsc : true,
    });
  }

  function resetBrowserQuery(route) {
    const normalizedRoute = normalizeQueryRoute(route);
    return setBrowserQuery(normalizedRoute, createDefaultBrowserQuery(normalizedRoute));
  }

  function getSearchQuery(route) {
    return getBrowserQuery(route || getActiveQueryRoute()).search;
  }

  function normalizeSelectionIds(ids) {
    return [...new Set((ids || []).filter((value) => typeof value === 'string' && value))];
  }

  function replaceSelectionIds(ids, options = {}) {
    const nextIds = normalizeSelectionIds(ids);
    if (
      nextIds.length === state.selection.ids.length
      && nextIds.every((value, index) => value === state.selection.ids[index])
    ) {
      return false;
    }

    update((current) => ({
      ...current,
      selection: { ids: nextIds },
    }));
    if (options.persist !== false) persistSelection(nextIds);
    return true;
  }

  function getSelectedBuildIds() {
    return [...state.selection.ids];
  }

  function getSelectedBuildCount() {
    return state.selection.ids.length;
  }

  function hasSelectedBuildId(buildId) {
    return !!buildId && state.selection.ids.includes(buildId);
  }

  function addSelectedBuildId(buildId) {
    if (!buildId || hasSelectedBuildId(buildId)) return false;
    return replaceSelectionIds([...state.selection.ids, buildId]);
  }

  function removeSelectedBuildId(buildId) {
    if (!buildId || !hasSelectedBuildId(buildId)) return false;
    return replaceSelectionIds(state.selection.ids.filter((id) => id !== buildId));
  }

  function toggleSelectedBuildId(buildId) {
    if (!buildId) return false;
    if (hasSelectedBuildId(buildId)) {
      removeSelectedBuildId(buildId);
      return false;
    }
    addSelectedBuildId(buildId);
    return true;
  }

  function clearSelectedBuildIds() {
    if (!state.selection.ids.length) return false;
    return replaceSelectionIds([]);
  }

  function markRouteDirty() {
    update((current) => ({
      ...current,
      route: { revision: current.route.revision + 1 },
    }));
    return state.route.revision;
  }

  function getRouteRevision() {
    return state.route.revision;
  }

  function setDetailOpen(isOpen) {
    const normalized = !!isOpen;
    if (normalized === state.detail.open) return false;
    update((current) => ({
      ...current,
      detail: {
        ...current.detail,
        open: normalized,
      },
    }));
    return true;
  }

  function setDetailLayout(layout, options = {}) {
    const normalized = layout === 'overlay' ? 'overlay' : 'panel';
    if (normalized === state.detail.layout) return false;
    update((current) => ({
      ...current,
      detail: {
        ...current.detail,
        layout: normalized,
      },
    }));
    if (options.persist !== false) {
      try {
        localStorage.setItem(VIEWER_LAYOUT_KEY, normalized);
      } catch (error) {
        console.warn('[AppStore] failed to persist viewer layout', error);
      }
    }
    return true;
  }

  function getDetailState() {
    return { ...state.detail };
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== SELECTION_KEY) return;
      try {
        const nextIds = normalizeSelectionIds(JSON.parse(event.newValue || '[]'));
        replaceSelectionIds(nextIds, { persist: false });
      } catch (error) {
        console.warn('[AppStore] failed to sync selection from storage event', error);
      }
    });
  }

  return {
    subscribe,
    getState,
    getActiveQueryRoute,
    getBrowserQuery,
    setBrowserSearchQuery,
    clearBrowserSearchQuery,
    toggleBrowserGame,
    toggleBrowserFlag,
    setBrowserTypeFilter,
    setBrowserGenerationFilter,
    setBrowserTransferredFilter,
    setBrowserOwnedOnly,
    setBrowserSourceFilter,
    setBrowserMode,
    toggleBrowserSort,
    resetBrowserQuery,
    browserQueryEquals,
    getSearchQuery,
    replaceSelectionIds,
    getSelectedBuildIds,
    getSelectedBuildCount,
    hasSelectedBuildId,
    addSelectedBuildId,
    removeSelectedBuildId,
    toggleSelectedBuildId,
    clearSelectedBuildIds,
    markRouteDirty,
    getRouteRevision,
    setDetailOpen,
    setDetailLayout,
    getDetailState,
  };
})();

if (typeof window !== 'undefined') {
  window.AppStore = AppStore;
}
