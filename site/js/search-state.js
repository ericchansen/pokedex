import { AppRoutes } from './app-routes.js';
import { AppSelectors } from './state/app-selectors.js';
import { AppStore } from './state/app-store.js';

/**
 * search-state.js - Shared header-search state for the active route.
 *
 * Views subscribe to this instead of routing search changes through a shared renderer hub.
 */

export const SearchState = (() => {
  /** @param {string|null|undefined} route @returns {string} */
  function resolveRoute(route) {
    if (route) return route;
    if (typeof AppStore.getActiveQueryRoute === 'function') {
      return AppStore.getActiveQueryRoute();
    }
    return AppRoutes?.DEFAULT_SECTION || 'boxes';
  }

  /**
   * @param {(value: {query: string, route: string}) => void} listener
   * @param {string|null|undefined} [route]
   */
  function subscribe(listener, route) {
    if (typeof listener !== 'function') return () => {};
    return AppStore.subscribe(
      (state) => {
        const activeRoute = resolveRoute(route);
        return {
          query: AppSelectors.selectSearch(state, activeRoute).query,
          route: activeRoute,
        };
      },
      listener,
      (previous, next) => previous.query === next.query && previous.route === next.route
    );
  }

  /** @param {string|null|undefined} [route] */
  function getQuery(route) {
    return AppStore.getSearchQuery(resolveRoute(route));
  }

  /** @param {string} nextQuery @param {string|null|undefined} [route] */
  function setQuery(nextQuery, route) {
    AppStore.setBrowserSearchQuery(resolveRoute(route), nextQuery);
  }

  /** @param {string|null|undefined} [route] */
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
