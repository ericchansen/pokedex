/**
 * search-state.js - Shared header-search state for the active route.
 *
 * Views subscribe to this instead of routing search changes through a shared renderer hub.
 */

const SearchState = (() => {
  function resolveRoute(route) {
    if (route) return route;
    if (typeof AppStore.getActiveQueryRoute === 'function') {
      return AppStore.getActiveQueryRoute();
    }
    return globalThis.AppRoutes?.DEFAULT_SECTION || 'boxes';
  }

  function subscribe(listener, route) {
    if (typeof listener !== 'function') return () => {};
    const fixedRoute = route ? resolveRoute(route) : null;
    let previousRoute = fixedRoute || resolveRoute();
    let previousQuery = AppStore.getSearchQuery(previousRoute);
    return AppStore.subscribe((state) => {
      const activeRoute = fixedRoute || resolveRoute();
      const query = typeof AppSelectors !== 'undefined'
        ? AppSelectors.selectSearch(state, activeRoute).query
        : AppStore.getSearchQuery(activeRoute);
      if (activeRoute === previousRoute && query === previousQuery) return;
      previousRoute = activeRoute;
      previousQuery = query;
      listener({ query, route: activeRoute });
    });
  }

  function getQuery(route) {
    return AppStore.getSearchQuery(resolveRoute(route));
  }

  function setQuery(nextQuery, route) {
    AppStore.setBrowserSearchQuery(resolveRoute(route), nextQuery);
  }

  function clear(route) {
    AppStore.clearBrowserSearchQuery(resolveRoute(route));
  }

  return {
    subscribe,
    getQuery,
    setQuery,
    clear,
  };
})();

if (typeof window !== 'undefined') {
  window.SearchState = SearchState;
}
