/**
 * router.js — Lightweight hash-based SPA router.
 * Views register with mount/unmount interfaces; the router dispatches on hashchange.
 */

const {
  AppRoutes,
  AppStore,
  AppSelectors,
  SearchState,
} = globalThis;

const Router = (() => {
  const routes = [];
  let currentView = null;
  let mainContainer = null;

  /**
   * Register a route pattern and its view handler.
   * @param {string} pattern - Hash pattern like '#/boxes' or '#/build/:id/edit'
   * @param {object} view - View object with mount(container, ...params) and unmount()
   */
  function register(pattern, view) {
    const regexStr = '^' + pattern
      .replace(/:[a-zA-Z]+/g, '([^/]+)')
      .replace(/\//g, '\\/') + '$';
    routes.push({ pattern, regex: new RegExp(regexStr), handler: view });
  }

  /** Programmatic navigation. */
  function navigate(hash) {
    window.location.hash = hash;
  }

  /** Match a hash to a registered route. */
  function resolve(hash) {
    const path = hash || AppRoutes.DEFAULT_HASH;
    for (const route of routes) {
      const match = path.match(route.regex);
      if (match) {
        return { handler: route.handler, params: match.slice(1), pattern: route.pattern };
      }
    }
    return null;
  }

  /** Unmount current view and mount the matched route's view. */
  function dispatch() {
    const hash = window.location.hash || AppRoutes.DEFAULT_HASH;
    const resolved = resolve(hash);

    if (currentView && currentView.unmount) {
      currentView.unmount();
    }

    if (resolved) {
      currentView = resolved.handler;
      if (currentView.mount) {
        currentView.mount(mainContainer, ...resolved.params);
      }
    } else {
      navigate(AppRoutes.DEFAULT_HASH);
    }
  }

  /** Re-mount the current view (e.g., after CRUD operations). */
  function remount() {
    if (currentView && currentView.mount) {
      currentView.mount(mainContainer);
    }
  }

  /** Initialize the router. */
  function init(container) {
    mainContainer = container;
    window.addEventListener('hashchange', () => {
      updateTabs();
      dispatch();
    });
    let lastRouteRevision = AppStore.getRouteRevision();
    AppStore.subscribe((state) => {
      const revision = typeof AppSelectors !== 'undefined'
        ? AppSelectors.selectRouteRevision(state)
        : state.route?.revision;
      if (revision === lastRouteRevision) return;
      lastRouteRevision = revision;
      remount();
    });
    dispatch();
  }

  /** Determine which top-level section the current hash belongs to. */
  function getSection() {
    return AppRoutes.sectionForHash();
  }

  /** Update header tab active states and search placeholder. */
  function updateTabs() {
    const section = getSection();
    for (const tab of document.querySelectorAll('.view-tab')) {
      tab.classList.toggle('is-active', tab.dataset.view === section);
    }
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.value = section === AppRoutes.sections.settings
        ? ''
        : (typeof SearchState !== 'undefined' && SearchState.getQuery
            ? SearchState.getQuery(section)
            : '');
      searchInput.disabled = section === 'settings';
      searchInput.placeholder = AppRoutes.searchPlaceholders[section] || 'Search...';
    }
  }

  return { register, navigate, init, getSection, remount, resolve, updateTabs };
})();

export { Router };
