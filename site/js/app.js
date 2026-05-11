/**
 * app.js — Main application logic
 * Router-driven initialization, event binding, global state coordination
 */

import { Router } from './router.js';
import { BoxesView } from './views/home.js';
import { InventoryView, BuildsView } from './views/inventory.js';
import { TeamsView } from './views/teams.js';
import { SettingsView } from './views/settings.js';

const {
  DataManager,
  AppRoutes,
  UIShared,
  SearchState,
  ProgressIndicator,
  AppStore,
  AppSelectors,
  SettingsState,
} = globalThis;

// Apply saved theme immediately (before any render)
if (typeof SettingsState !== 'undefined') {
  document.documentElement.dataset.theme = SettingsState.get().theme || 'default';
}

(async function () {
  const container = document.getElementById('main-content');
  const searchInput = document.getElementById('search-input');
  const SEARCH_DEBOUNCE_MS = 150;
  let searchDebounce = null;

  // Show skeleton placeholder while data loads
  container.innerHTML = `
    <div class="skeleton-loading">
      <div class="skeleton skeleton-toolbar"></div>
      <div class="skeleton-grid">
        ${Array(6).fill('<div class="skeleton skeleton-card"></div>').join('')}
      </div>
    </div>`;

  // Initialize data
  try {
    await DataManager.init();
  } catch (err) {
    console.error('[App] DataManager.init() failed:', err);
    container.innerHTML = `
      <div style="padding:2rem;text-align:center">
        <h2>Failed to load data</h2>
        <p style="color:var(--text-secondary)">${err.message || 'Unknown error'}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>`;
    return;
  }

  // Auto-correct gender for gender-locked species (non-blocking)
  DataManager.enforceGenderLocks().catch(e => console.warn('[App] Gender lock enforcement failed:', e));

  // Register routes
  Router.register(AppRoutes.hashes.boxes, BoxesView);
  Router.register(AppRoutes.hashes.inventory, InventoryView);
  Router.register(AppRoutes.hashes.builds, BuildsView);
  Router.register(AppRoutes.hashes.teams, TeamsView);
  Router.register(AppRoutes.hashes.settings, SettingsView);

  // Detail panel close
  document.getElementById('detail-close').addEventListener('click', UIShared.closePanel);
  document.getElementById('detail-overlay').addEventListener('click', UIShared.closePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Clear active search from anywhere on the page
    if (searchInput.value || SearchState.getQuery()) {
      clearTimeout(searchDebounce);
      searchInput.value = '';
      SearchState.clear();
      searchInput.blur();
    }
    UIShared.closePanel();
  });

  // Viewer layout toggle (FR-1.0a): side-panel ↔ overlay
  const layoutToggle = document.getElementById('detail-layout-toggle');
  function applyViewerLayout(mode) {
    document.body.classList.toggle('viewer-overlay', mode === 'overlay');
    if (layoutToggle) {
      layoutToggle.textContent = mode === 'overlay' ? 'Side panel' : 'Overlay';
      layoutToggle.title = mode === 'overlay'
        ? 'Switch to side-panel layout'
        : 'Switch to overlay layout';
    }
  }
  let currentViewerLayout = AppStore.getDetailState().layout;
  applyViewerLayout(currentViewerLayout);
  AppStore.subscribe((state) => {
    const { layout } = AppSelectors.selectDetail(state);
    if (layout === currentViewerLayout) return;
    currentViewerLayout = layout;
    applyViewerLayout(layout);
  });
  if (layoutToggle) {
    layoutToggle.addEventListener('click', () => {
      const next = document.body.classList.contains('viewer-overlay') ? 'panel' : 'overlay';
      AppStore.setDetailLayout(next);
    });
  }

  // Search input
  SearchState.subscribe(({ query }) => {
    if (searchInput.value !== query) {
      searchInput.value = query;
    }
  });
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      SearchState.setQuery(searchInput.value);
    }, SEARCH_DEBOUNCE_MS);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!searchInput.value && !SearchState.getQuery()) return;
    clearTimeout(searchDebounce);
    searchInput.value = '';
    SearchState.clear();
    e.preventDefault();
    e.stopPropagation();
  });

  // Tab click → hash navigation
  for (const tab of document.querySelectorAll('.view-tab')) {
    tab.addEventListener('click', () => Router.navigate(AppRoutes.hashForSection(tab.dataset.view)));
  }

  // Start router (dispatches to initial view + wires hashchange)
  Router.init(container);
  Router.updateTabs();
  ProgressIndicator.init();
  SelectionBar.init();

  console.debug('Pokémon HOME Tracker initialized!');
})();
