/**
 * state/app-selectors.js - Derived state selectors over AppStore + DataManager.
 */
const AppSelectors = (() => {
  const SEC = {
    boxes: globalThis.AppRoutes?.sections?.boxes || 'boxes',
    inventory: globalThis.AppRoutes?.sections?.inventory || 'inventory',
    builds: globalThis.AppRoutes?.sections?.builds || 'builds',
    teams: globalThis.AppRoutes?.sections?.teams || 'teams',
    settings: globalThis.AppRoutes?.sections?.settings || 'settings',
  };

  const SORT_COMPARATORS = {
    name: (a, b) => a.name.localeCompare(b.name),
    dex: (a, b) => a.num - b.num,
    num: (a, b) => a.num - b.num,
    nature: (a, b) => (a.nature || '').localeCompare(b.nature || ''),
    ability: (a, b) => (a.ability || '').localeCompare(b.ability || ''),
    item: (a, b) => (a.item || '').localeCompare(b.item || ''),
    ball: (a, b) => (a.ball || '').localeCompare(b.ball || ''),
    location: (a, b) => (a.location || '').localeCompare(b.location || ''),
    type: (a, b) => (a.types?.[0] || '').localeCompare(b.types?.[0] || ''),
    sprite: (a, b) => a.num - b.num,
  };

  // ── Pure filter predicates (shared with home.js Boxes view) ──────────────

  function typeMatches(types, filterType) {
    return !filterType || types.some(t => t.toLowerCase() === filterType.toLowerCase());
  }

  function generationMatches(gen, filterGeneration) {
    return !filterGeneration || String(gen) === filterGeneration;
  }

  function gamesMatch(compatibleGames, filterGames) {
    return !filterGames.length || filterGames.every(g => compatibleGames.includes(g));
  }

  // Maps query flag keys (snake_case) to inventory entry view-model properties (camelCase).
  const FLAG_ENTRY_KEYS = {
    shiny: 'shiny',
    genned: 'genned',
    gigantamax: 'gigantamax',
    alpha: 'alpha',
    event_origin: 'eventOrigin',
    from_go: 'fromGo',
    transferred_to_champions: 'transferredToChampions',
    ev_guesstimate: 'evGuesstimate',
  };

  function flagsMatch(entry, filterFlags) {
    return !filterFlags.length || filterFlags.every(key => !!entry[FLAG_ENTRY_KEYS[key] ?? key]);
  }

  // ─────────────────────────────────────────────────────────────────────────

  function getActiveQueryRoute() {
    return typeof AppStore?.getActiveQueryRoute === 'function'
      ? AppStore.getActiveQueryRoute()
      : (globalThis.AppRoutes?.DEFAULT_SECTION || 'boxes');
  }

  function selectBrowserQuery(route = getActiveQueryRoute(), state = AppStore.getState()) {
    const normalizedRoute = String(route || getActiveQueryRoute()).trim() || getActiveQueryRoute();
    const query = state.query?.byRoute?.[normalizedRoute]
      || (typeof AppStore?.getBrowserQuery === 'function' ? AppStore.getBrowserQuery(normalizedRoute) : {});
    return {
      search: String(query.search || ''),
      games: [...(query.games || [])],
      flags: [...(query.flags || [])],
      type: String(query.type || ''),
      generation: String(query.generation || ''),
      transferred: String(query.transferred || ''),
      source: String(query.source || ''),
      ownedOnly: !!query.ownedOnly,
      mode: String(query.mode || (normalizedRoute === (SEC.boxes) ? 'grid' : 'table')),
      sortKey: String(query.sortKey || 'num'),
      sortAsc: query.sortAsc == null ? true : !!query.sortAsc,
    };
  }

  function selectSearch(state = AppStore.getState(), route = getActiveQueryRoute()) {
    return {
      query: selectBrowserQuery(route, state).search,
    };
  }

  function selectSelection(state = AppStore.getState()) {
    return {
      ids: [...state.selection.ids],
      count: state.selection.ids.length,
    };
  }

  function selectRouteRevision(state = AppStore.getState()) {
    return state.route.revision;
  }

  function selectDetail(state = AppStore.getState()) {
    return { ...state.detail };
  }

  function matchesEntrySearch(entry, search) {
    const normalized = String(search || '').trim();
    if (!normalized) return true;
    return UIModels.matchesSearch(entry.searchText, normalized);
  }

  function sortBrowserEntries(entries, query) {
    const dir = query.sortAsc ? 1 : -1;
    const cmp = SORT_COMPARATORS[query.sortKey] || SORT_COMPARATORS.dex;
    return [...entries].sort((a, b) => cmp(a, b) * dir);
  }

  function fetchBrowserEntries(normalizedRoute) {
    return normalizedRoute === (SEC.inventory)
      ? (DataManager.getAllInstances?.() || []).map((instance) => UIModels.buildInventoryEntryView(instance))
      : (DataManager.getAllBuilds?.() || []).map((build) => UIModels.buildLibraryBuildEntryView(build));
  }

  function filterBrowserEntries(allEntries, query, normalizedRoute) {
    return allEntries.filter((entry) => {
      if (normalizedRoute === (SEC.inventory) && !entry.owned) return false;
      if (normalizedRoute === (SEC.builds) && entry.builds.length === 0) return false;
      if (!gamesMatch(entry.compatibleGames, query.games)) return false;
      if (normalizedRoute === (SEC.builds) && query.ownedOnly && !entry.owned) return false;
      if (!typeMatches(entry.types, query.type)) return false;
      if (!matchesEntrySearch(entry, query.search)) return false;
      if (query.transferred === 'yes' && !entry.transferredToChampions) return false;
      if (query.transferred === 'no' && entry.transferredToChampions) return false;
      if (normalizedRoute === (SEC.inventory) && !flagsMatch(entry, query.flags || [])) return false;
      if (normalizedRoute === (SEC.builds) && query.source) {
        if (query.source === 'mine' && entry.source) return false;
        if (query.source === 'templates' && !entry.source) return false;
      }
      return true;
    });
  }

  function computeQuickStats(allEntries, isInventory) {
    let ownedCount = isInventory ? allEntries.length : 0;
    let withBuildsCount = 0;
    let inChampionsCount = 0;
    for (const entry of allEntries) {
      if (!isInventory && entry.owned) ownedCount++;
      if (entry.owned && entry.builds.length > 0) withBuildsCount++;
      if (isInventory && entry.transferredToChampions) inChampionsCount++;
    }
    return [
      `${ownedCount} owned`,
      `${withBuildsCount} with ${isInventory ? 'target build' : 'build'}${withBuildsCount === 1 ? '' : 's'}`,
      ...(isInventory ? [`${inChampionsCount} in Champions`] : []),
    ];
  }

  function buildEmptyState(visibleEntries, allEntries, normalizedRoute) {
    if (visibleEntries.length > 0) return null;
    if (allEntries.length === 0) {
      return normalizedRoute === (SEC.inventory)
        ? {
            title: 'No Pokemon yet',
            message: 'Pokemon you place in your boxes show up here.',
            action: { kind: 'goto-boxes', label: 'Go to Boxes' },
          }
        : {
            title: 'No builds yet',
            message: 'Open a Pokemon and add a competitive build to track movesets, EVs, and items.',
            action: { kind: 'new-build', label: 'Create your first build' },
          };
    }
    return {
      title: 'No Pokemon match your filters',
      message: 'Try adjusting your filters or search term.',
      action: { kind: 'reset-query', label: 'Reset filters' },
    };
  }

  function buildToolbarModel(normalizedRoute, query, summaryText, quickStats) {
    return {
      route: normalizedRoute,
      query,
      showModeToggle: true,
      showGames: true,
      showType: true,
      showGeneration: false,
      showTransferred: normalizedRoute === (SEC.inventory),
      showOwnedOnly: normalizedRoute === (SEC.builds),
      showFlags: normalizedRoute === (SEC.inventory),
      showSource: normalizedRoute === (SEC.builds),
      summaryText,
      statItems: quickStats,
    };
  }

  function selectInventoryBrowser(route = SEC.inventory, state = AppStore.getState()) {
    const normalizedRoute = route === (SEC.builds)
      ? (SEC.builds)
      : (SEC.inventory);
    const query = selectBrowserQuery(normalizedRoute, state);
    const allEntries = fetchBrowserEntries(normalizedRoute);
    const filteredEntries = filterBrowserEntries(allEntries, query, normalizedRoute);
    const visibleEntries = sortBrowserEntries(filteredEntries, query);
    const summaryText = normalizedRoute === (SEC.builds)
      ? `Showing ${filteredEntries.length} library build${filteredEntries.length === 1 ? '' : 's'} (${new Set(filteredEntries.map((entry) => entry.slug)).size} species)`
      : `Showing ${filteredEntries.length} Pokemon`;
    const isInventory = normalizedRoute === (SEC.inventory);
    const quickStats = computeQuickStats(allEntries, isInventory);
    const emptyState = buildEmptyState(visibleEntries, allEntries, normalizedRoute);
    const toolbarModel = buildToolbarModel(normalizedRoute, query, summaryText, quickStats);

    return {
      route: normalizedRoute,
      query,
      allEntries,
      filteredEntries,
      visibleEntries,
      summaryText,
      quickStats,
      emptyState,
      toolbarModel,
    };
  }

  function selectBrowserToolbarConfig(route = getActiveQueryRoute(), state = AppStore.getState()) {
    const normalizedRoute = String(route || getActiveQueryRoute()).trim() || getActiveQueryRoute();
    const query = selectBrowserQuery(normalizedRoute, state);
    if (normalizedRoute === (SEC.inventory)
      || normalizedRoute === (SEC.builds)) {
      const browser = selectInventoryBrowser(normalizedRoute, state);
      return browser.toolbarModel;
    }

    return {
      route: normalizedRoute,
      query,
      showModeToggle: false,
      showGames: normalizedRoute === (SEC.boxes),
      showType: normalizedRoute === (SEC.boxes),
      showGeneration: normalizedRoute === (SEC.boxes),
      showFlags: normalizedRoute === (SEC.boxes),
      showTransferred: false,
      showOwnedOnly: false,
      summaryText: '',
      statItems: [],
    };
  }

  function selectProgress() {
    const preset = DataManager.getActivePreset();
    if (preset) {
      const completion = DataManager.getPresetCompletion();
      return {
        mode: 'preset',
        text: `${completion.matched} / ${completion.total}`,
        percent: completion.percent,
        matched: completion.matched,
        total: completion.total,
      };
    }

    const completion = DataManager.getSpeciesCompletion();
    return {
      mode: 'species',
      text: `${completion.owned} / ${completion.total}`,
      percent: completion.percent,
      matched: completion.owned,
      total: completion.total,
    };
  }

  return {
    typeMatches,
    generationMatches,
    gamesMatch,
    selectBrowserQuery,
    selectSearch,
    selectSelection,
    selectRouteRevision,
    selectDetail,
    selectInventoryBrowser,
    selectBrowserToolbarConfig,
    selectProgress,
  };
})();

if (typeof window !== 'undefined') {
  window.AppSelectors = AppSelectors;
}
