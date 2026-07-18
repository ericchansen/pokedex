import { AppRoutes } from '../app-routes.js';

/**
 * state/app-store.js - Central runtime store for shell/query/selection/detail state.
 */
export const AppStore = (() => {
  /** @typedef {import('../types/contracts.js').RouteSection} RouteSection */
  /** @typedef {import('../types/contracts.js').BrowserQuery} BrowserQuery */
  /** @typedef {import('../types/contracts.js').AppState} AppState */
  /** @typedef {{selector: (state: AppState) => unknown, listener: (value: unknown, previous: unknown) => void, equality: (a: unknown, b: unknown) => boolean, value: unknown}} Subscription */
  /** @type {Record<RouteSection, RouteSection>} */
  const SEC = {
    boxes: AppRoutes?.sections?.boxes || 'boxes',
    inventory: AppRoutes?.sections?.inventory || 'inventory',
    builds: AppRoutes?.sections?.builds || 'builds',
    teams: AppRoutes?.sections?.teams || 'teams',
    settings: AppRoutes?.sections?.settings || 'settings',
  };

  const SELECTION_KEY = 'pokechamp.selection';
  const VIEWER_LAYOUT_KEY = 'viewerLayout';
  /** @type {Set<Subscription>} */
  const subscriptions = new Set();
  /** @type {readonly RouteSection[]} */
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
      const parsed = /** @type {unknown} */ (JSON.parse(raw || '[]'));
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
    return AppRoutes?.sectionForHash?.()
      || AppRoutes?.DEFAULT_SECTION
      || 'boxes';
  }

  /** @param {string|null|undefined} route @returns {RouteSection} */
  function normalizeQueryRoute(route) {
    const normalized = String(route || getActiveQueryRoute() || '').trim();
    return QUERY_ROUTES.includes(/** @type {RouteSection} */ (normalized))
      ? /** @type {RouteSection} */ (normalized)
      : (AppRoutes?.DEFAULT_SECTION || 'boxes');
  }

  /** @param {unknown} values */
  function normalizeStringArray(values) {
    return [...new Set((Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean))];
  }

  /** @param {string|null|undefined} route @returns {BrowserQuery} */
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

  /**
   * @param {string|null|undefined} route
   * @param {Partial<BrowserQuery>} [query]
   * @returns {BrowserQuery}
   */
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

  /** @param {string|null|undefined} route @param {Partial<BrowserQuery>|undefined} query */
  function cloneBrowserQuery(route, query) {
    const normalized = normalizeBrowserQuery(route, query);
    return {
      ...normalized,
      games: [...normalized.games],
    };
  }

  /** @param {Partial<Record<RouteSection, BrowserQuery>>} [byRoute] */
  function cloneQueryState(byRoute = {}) {
    /** @type {Record<RouteSection, BrowserQuery>} */
    const out = /** @type {Record<RouteSection, BrowserQuery>} */ ({});
    for (const route of QUERY_ROUTES) {
      out[route] = cloneBrowserQuery(route, byRoute[route]);
    }
    return out;
  }

  /** @param {BrowserQuery} a @param {BrowserQuery} b */
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

  /** @type {AppState} */
  let state = {
    query: {
      byRoute: cloneQueryState(),
    },
    selection: {
      ids: loadSelectionIds(),
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
      detail: { ...state.detail },
    };
  }

  function emit() {
    for (const subscription of [...subscriptions]) {
      const nextValue = subscription.selector(state);
      if (subscription.equality(subscription.value, nextValue)) continue;
      const previousValue = subscription.value;
      subscription.value = nextValue;
      subscription.listener(nextValue, previousValue);
    }
  }

  /** @param {(state: AppState) => AppState|null|undefined} mutator */
  function update(mutator) {
    const nextState = mutator(state);
    if (!nextState) return;
    state = nextState;
    emit();
  }

  /**
   * @template T
   * @overload
   * @param {(state: AppState) => T} selectorOrListener
   * @param {(value: T, previous: T) => void} listener
   * @param {(a: T, b: T) => boolean} [equality]
   * @returns {() => boolean}
   */
  /**
   * @overload
   * @param {(state: AppState) => void} selectorOrListener
   * @returns {() => boolean}
   */
  /**
   * @param {((state: AppState) => unknown)|((state: AppState) => void)} selectorOrListener
   * @param {((value: unknown, previous: unknown) => void)|undefined} [listener]
   * @param {(a: unknown, b: unknown) => boolean} [equality]
   */
  function subscribe(selectorOrListener, listener, equality = Object.is) {
    const usesSelector = typeof listener === 'function';
    const resolvedListener = usesSelector
      ? listener
      : /** @type {(value: unknown, previous: unknown) => void} */ (selectorOrListener);
    if (typeof resolvedListener !== 'function') return () => {};
    const selector = usesSelector
      ? /** @type {(state: AppState) => unknown} */ (selectorOrListener)
      : () => cloneState();
    /** @type {Subscription} */
    const subscription = {
      selector,
      listener: resolvedListener,
      equality: usesSelector ? equality : () => false,
      value: selector(state),
    };
    subscriptions.add(subscription);
    return () => subscriptions.delete(subscription);
  }

  function getState() {
    return cloneState();
  }

  /** @param {string[]} ids */
  function persistSelection(ids) {
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(ids));
    } catch (error) {
      console.warn('[AppStore] failed to persist selection ids', error);
    }
  }

  /** @param {string|null|undefined} route */
  function getBrowserQuery(route) {
    const normalizedRoute = normalizeQueryRoute(route);
    return cloneBrowserQuery(normalizedRoute, state.query.byRoute[normalizedRoute]);
  }

  /** @param {string|null|undefined} route @param {Partial<BrowserQuery>} nextQuery */
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

  /** @param {string|null|undefined} route @param {Partial<BrowserQuery>} patch */
  function patchBrowserQuery(route, patch) {
    const normalizedRoute = normalizeQueryRoute(route);
    return setBrowserQuery(normalizedRoute, {
      ...state.query.byRoute[normalizedRoute],
      ...patch,
    });
  }

  /** @param {string|null|undefined} route @param {unknown} query */
  function setBrowserSearchQuery(route, query) {
    return patchBrowserQuery(route, { search: String(query || '') });
  }

  /** @param {string|null|undefined} route */
  function clearBrowserSearchQuery(route) {
    return setBrowserSearchQuery(route, '');
  }

  /** @param {string|null|undefined} route @param {unknown} games */
  function replaceBrowserGames(route, games) {
    return patchBrowserQuery(route, { games: normalizeStringArray(games) });
  }

  /** @param {string|null|undefined} route @param {unknown} game */
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

  /** @param {string|null|undefined} route @param {unknown} flagKey */
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

  /** @param {string|null|undefined} route @param {unknown} type */
  function setBrowserTypeFilter(route, type) {
    return patchBrowserQuery(route, { type: String(type || '') });
  }

  /** @param {string|null|undefined} route @param {unknown} generation */
  function setBrowserGenerationFilter(route, generation) {
    return patchBrowserQuery(route, { generation: String(generation || '') });
  }

  /** @param {string|null|undefined} route @param {unknown} transferred */
  function setBrowserTransferredFilter(route, transferred) {
    return patchBrowserQuery(route, { transferred: String(transferred || '') });
  }

  /** @param {string|null|undefined} route @param {unknown} ownedOnly */
  function setBrowserOwnedOnly(route, ownedOnly) {
    return patchBrowserQuery(route, { ownedOnly: !!ownedOnly });
  }

  /** @param {string|null|undefined} route @param {unknown} source */
  function setBrowserSourceFilter(route, source) {
    return patchBrowserQuery(route, { source: String(source || '') });
  }

  /** @param {string|null|undefined} route @param {unknown} mode */
  function setBrowserMode(route, mode) {
    return patchBrowserQuery(route, { mode: mode === 'card' ? 'card' : 'table' });
  }

  /** @param {string|null|undefined} route @param {unknown} sortKey */
  function toggleBrowserSort(route, sortKey) {
    const normalizedRoute = normalizeQueryRoute(route);
    const currentQuery = state.query.byRoute[normalizedRoute] || createDefaultBrowserQuery(normalizedRoute);
    const nextSortKey = String(sortKey || currentQuery.sortKey || 'num');
    return patchBrowserQuery(normalizedRoute, {
      sortKey: nextSortKey,
      sortAsc: currentQuery.sortKey === nextSortKey ? !currentQuery.sortAsc : true,
    });
  }

  /** @param {string|null|undefined} route */
  function resetBrowserQuery(route) {
    const normalizedRoute = normalizeQueryRoute(route);
    return setBrowserQuery(normalizedRoute, createDefaultBrowserQuery(normalizedRoute));
  }

  /** @param {string|null|undefined} [route] */
  function getSearchQuery(route) {
    return getBrowserQuery(route || getActiveQueryRoute()).search;
  }

  /** @param {unknown} ids */
  function normalizeSelectionIds(ids) {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.filter((value) => typeof value === 'string' && value))];
  }

  /** @param {unknown} ids @param {{persist?: boolean}} [options] */
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

  /** @param {string|null|undefined} buildId */
  function hasSelectedBuildId(buildId) {
    return !!buildId && state.selection.ids.includes(buildId);
  }

  /** @param {string|null|undefined} buildId */
  function addSelectedBuildId(buildId) {
    if (!buildId || hasSelectedBuildId(buildId)) return false;
    return replaceSelectionIds([...state.selection.ids, buildId]);
  }

  /** @param {string|null|undefined} buildId */
  function removeSelectedBuildId(buildId) {
    if (!buildId || !hasSelectedBuildId(buildId)) return false;
    return replaceSelectionIds(state.selection.ids.filter((id) => id !== buildId));
  }

  /** @param {string|null|undefined} buildId */
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

  /** @param {unknown} isOpen */
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

  /** @param {unknown} layout @param {{persist?: boolean}} [options] */
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
    setDetailOpen,
    setDetailLayout,
    getDetailState,
  };
})();
