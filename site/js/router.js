import { AppRoutes } from './app-routes.js';
import { SearchState } from './search-state.js';

/**
 * router.js — Lightweight hash-based SPA router.
 * Views register with mount/unmount interfaces; the router dispatches on hashchange.
 */



const Router = (() => {
  /** @typedef {{mount: (container: HTMLElement, ...params: string[]) => void|Promise<void>, unmount?: () => void}} RouteView */
  /** @typedef {{
   * pattern: string, regex: RegExp,
   * viewLoader: RouteView|(() => RouteView|Promise<RouteView>),
   * loadedView: RouteView|null, loadPromise: Promise<RouteView>|null
   * }} RouteDefinition */
  /** @type {RouteDefinition[]} */
  const routes = [];
  /** @type {RouteView|null} */
  let currentView = null;
  /** @type {HTMLElement|null} */
  let mainContainer = null;
  let dispatchVersion = 0;

  /**
   * Register a route pattern and its view handler.
   * @param {string} pattern - Hash pattern like '#/boxes' or '#/build/:id/edit'
   * @param {RouteView|(() => RouteView|Promise<RouteView>)} viewLoader - View object or async function that resolves one.
   */
  function register(pattern, viewLoader) {
    const regexStr = '^' + pattern
      .replace(/:[a-zA-Z]+/g, '([^/]+)')
      .replace(/\//g, '\\/') + '$';
    routes.push({
      pattern,
      regex: new RegExp(regexStr),
      viewLoader,
      loadedView: typeof viewLoader === 'function' ? null : viewLoader,
      loadPromise: null,
    });
  }

  /** Programmatic navigation. */
  /** @param {string} hash */
  function navigate(hash) {
    window.location.hash = hash;
  }

  /** Match a hash to a registered route. */
  /** @param {string} hash */
  function resolve(hash) {
    const path = hash || AppRoutes.DEFAULT_HASH;
    for (const route of routes) {
      const match = path.match(route.regex);
      if (match) {
        return { route, params: match.slice(1), pattern: route.pattern };
      }
    }
    return null;
  }

  /** @param {RouteDefinition} route */
  async function loadView(route) {
    if (route.loadedView) return route.loadedView;
    if (!route.loadPromise) {
      const loader = /** @type {() => RouteView|Promise<RouteView>} */ (route.viewLoader);
      route.loadPromise = Promise.resolve(loader())
        .then((view) => {
          if (!view?.mount) throw new Error(`Route "${route.pattern}" did not provide a mountable view`);
          route.loadedView = view;
          return view;
        })
        .catch((error) => {
          route.loadPromise = null;
          throw error;
        });
    }
    return route.loadPromise;
  }

  /** @param {unknown} error */
  function renderRouteError(error) {
    if (!mainContainer) return;
    const section = document.createElement('section');
    section.className = 'route-error';
    section.setAttribute('role', 'alert');
    const heading = document.createElement('h2');
    heading.textContent = 'Unable to open this page';
    const message = document.createElement('p');
    message.textContent = error instanceof Error ? error.message : 'The route could not be loaded.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-primary';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => {
      void dispatch();
    });
    section.append(heading, message, retry);
    mainContainer.replaceChildren(section);
  }

  /** Unmount current view and mount the matched route's view. */
  async function dispatch() {
    if (!mainContainer) return;
    const hash = window.location.hash || AppRoutes.DEFAULT_HASH;
    const resolved = resolve(hash);
    const version = ++dispatchVersion;

    if (currentView && currentView.unmount) {
      currentView.unmount();
    }
    currentView = null;

    if (resolved) {
      mainContainer?.setAttribute('aria-busy', 'true');
      try {
        const view = await loadView(resolved.route);
        if (version !== dispatchVersion) return;
        currentView = view;
        currentView.mount(mainContainer, ...resolved.params);
      } catch (error) {
        if (version !== dispatchVersion) return;
        console.error(`[Router] failed to load ${resolved.pattern}`, error);
        renderRouteError(error);
      } finally {
        if (version === dispatchVersion) mainContainer?.removeAttribute('aria-busy');
      }
    } else {
      navigate(AppRoutes.DEFAULT_HASH);
    }
  }

  /** Initialize the router. */
  /** @param {HTMLElement} container */
  function init(container) {
    mainContainer = container;
    window.addEventListener('hashchange', () => {
      updateTabs();
      void dispatch();
    });
    void dispatch();
  }

  /** Determine which top-level section the current hash belongs to. */
  function getSection() {
    return AppRoutes.sectionForHash();
  }

  /** Update header tab active states and search placeholder. */
  function updateTabs() {
    const section = getSection();
    for (const tab of document.querySelectorAll('.view-tab')) {
      if (!(tab instanceof HTMLElement)) continue;
      const isActive = tab.dataset.view === section;
      tab.classList.toggle('is-active', isActive);
      if (isActive) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    const searchInput = document.getElementById('search-input');
    if (searchInput instanceof HTMLInputElement) {
      searchInput.value = section === AppRoutes.sections.settings
        ? ''
        : (typeof SearchState !== 'undefined' && SearchState.getQuery
            ? SearchState.getQuery(section)
            : '');
      searchInput.disabled = section === 'settings';
      searchInput.placeholder = AppRoutes.searchPlaceholders[section] || 'Search...';
    }
  }

  return { register, navigate, init, getSection, resolve, updateTabs };
})();

export { Router };
