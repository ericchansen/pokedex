import { AppRoutes } from './app-routes.js';
import { AuthWidget } from './auth-widget.js';
import { DataManager } from './data.js';
import { ProgressIndicator } from './progress-indicator.js';
import { SearchState } from './search-state.js';
import { SelectionBar } from './selection-bar.js';
import { SettingsState } from './settings-state.js';
import { AppStore } from './state/app-store.js';
import { DetailPanel } from './ui/surfaces/detail-panel.js';

/**
 * app.js — Main application logic
 * Router-driven initialization, event binding, global state coordination
 */

import { Router } from './router.js';

// Apply saved theme immediately (before any render)
if (typeof SettingsState !== 'undefined') {
  document.documentElement.dataset.theme = SettingsState.get().theme || 'default';
}

(async function () {
  const container = document.getElementById('main-content');
  const searchInput = document.getElementById('search-input');
  if (!(container instanceof HTMLElement) || !(searchInput instanceof HTMLInputElement)) {
    throw new Error('Application shell is missing required elements');
  }
  const SEARCH_DEBOUNCE_MS = 150;
  /** @type {number|undefined} */
  let searchDebounce;

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
    const message = err instanceof Error ? err.message : 'Unknown error';
    container.innerHTML = `
      <div style="padding:2rem;text-align:center">
        <h2>Failed to load data</h2>
        <p style="color:var(--text-secondary)">${message}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>`;
    return;
  }

  // Auto-correct gender for gender-locked species (non-blocking)
  DataManager.enforceGenderLocks().catch(e => console.warn('[App] Gender lock enforcement failed:', e));

  // Register routes
  Router.register(AppRoutes.hashes.boxes, async () => (await import('./views/home.js')).BoxesView);
  Router.register(AppRoutes.hashes.inventory, async () => {
    await DataManager.ensureEditorData();
    return (await import('./views/inventory.js')).InventoryView;
  });
  Router.register(AppRoutes.hashes.builds, async () => {
    await DataManager.ensureEditorData();
    return (await import('./views/inventory.js')).BuildsView;
  });
  Router.register(AppRoutes.hashes.teams, async () => {
    await DataManager.ensureEditorData();
    return (await import('./views/teams.js')).TeamsView;
  });
  Router.register(AppRoutes.hashes.settings, async () => (await import('./views/settings.js')).SettingsView);

  // Detail panel close
  document.getElementById('detail-close')?.addEventListener('click', () => void DetailPanel.close());
  document.getElementById('detail-overlay')?.addEventListener('click', () => void DetailPanel.close());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // Clear active search from anywhere on the page
    if (searchInput.value || SearchState.getQuery()) {
      clearTimeout(searchDebounce);
      searchInput.value = '';
      SearchState.clear();
      searchInput.blur();
    }
    DetailPanel.close();
  });

  // Viewer layout toggle (FR-1.0a): side-panel ↔ overlay
  const layoutToggle = document.getElementById('detail-layout-toggle');
  /** @param {import('./types/contracts.js').DetailState['layout']} mode */
  function applyViewerLayout(mode) {
    const isOverlay = mode === 'overlay';
    document.body.classList.toggle('viewer-overlay', isOverlay);
    const detailPanel = document.getElementById('detail-panel');
    if (detailPanel) {
      if (isOverlay) detailPanel.setAttribute('aria-modal', 'true');
      else detailPanel.removeAttribute('aria-modal');
    }
    if (layoutToggle) {
      layoutToggle.textContent = isOverlay ? 'Side panel' : 'Overlay';
      layoutToggle.title = isOverlay
        ? 'Switch to side-panel layout'
        : 'Switch to overlay layout';
      layoutToggle.setAttribute('aria-pressed', String(isOverlay));
    }
  }
  applyViewerLayout(AppStore.getDetailState().layout);
  AppStore.subscribe(
    (state) => state.detail.layout,
    applyViewerLayout
  );
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
    if (!(tab instanceof HTMLElement)) continue;
    tab.addEventListener('click', () => {
      const section = /** @type {import('./types/contracts.js').RouteSection} */ (tab.dataset.view);
      Router.navigate(AppRoutes.hashForSection(section));
    });
  }

  // Start router (dispatches to initial view + wires hashchange)
  Router.init(container);
  Router.updateTabs();
  ProgressIndicator.init();
  SelectionBar.init();
  AuthWidget.init();

  console.debug('Pokémon HOME Tracker initialized!');
})();
