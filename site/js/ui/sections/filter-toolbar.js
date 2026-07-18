import { AppStore } from '../../state/app-store.js';
import { UIModels } from '../../ui-models.js';

/**
 * ui/sections/filter-toolbar.js - Shared filter-toolbar section builders.
 */
export const FilterToolbarSection = (() => {
  /** @typedef {{escapeHtml?: (value: string) => string, allTypes?: string[]}} ToolbarDependencies */
  const GENERATIONS = [
    { value: '1', label: 'Gen 1 (Kanto)' },
    { value: '2', label: 'Gen 2 (Johto)' },
    { value: '3', label: 'Gen 3 (Hoenn)' },
    { value: '4', label: 'Gen 4 (Sinnoh)' },
    { value: '5', label: 'Gen 5 (Unova)' },
    { value: '6', label: 'Gen 6 (Kalos)' },
    { value: '7', label: 'Gen 7 (Alola)' },
    { value: '8', label: 'Gen 8 (Galar)' },
    { value: '9', label: 'Gen 9 (Paldea)' },
  ];

  const FLAG_FILTERS = [
    { key: 'shiny', label: '✨ Shiny' },
    { key: 'genned', label: 'Genned' },
    { key: 'gigantamax', label: 'Gmax' },
    { key: 'alpha', label: 'Alpha' },
    { key: 'event_origin', label: 'Event' },
    { key: 'from_go', label: 'GO' },
    { key: 'transferred_to_champions', label: '🏆 Champions' },
    { key: 'ev_guesstimate', label: 'EV ?' },
  ];

  /** @param {unknown} value */
  function fallbackEscapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** @param {string} label @param {string} controlHtml @param {ToolbarDependencies} [deps] */
  function renderToolbarGroup(label, controlHtml, deps = {}) {
    const escapeHtml = deps.escapeHtml || fallbackEscapeHtml;
    return `
      <div class="browser-toolbar__group">
        <span class="browser-toolbar__label">${escapeHtml(label)}</span>
        ${controlHtml}
      </div>`;
  }

  /** @param {string[]} [selectedKeys] @param {ToolbarDependencies} [deps] */
  function renderBrowserGameControls(selectedKeys = [], deps = {}) {
    const escapeHtml = deps.escapeHtml || fallbackEscapeHtml;
    return UIModels.getGameCatalog().map((game) => `
      <label class="browser-toolbar__check" title="Show only Pokémon available in ${escapeHtml(game.title)}">
        <input type="checkbox" data-browser-game="${escapeHtml(game.key)}" ${selectedKeys.includes(game.key) ? 'checked' : ''}>
        ${escapeHtml(game.filterLabel)}
      </label>
    `).join('');
  }

  /** @param {string} [selectedType] @param {ToolbarDependencies} [deps] */
  function renderBrowserTypeControl(selectedType = '', deps = {}) {
    const escapeHtml = deps.escapeHtml || fallbackEscapeHtml;
    const allTypes = deps.allTypes || [];
    return `<select data-browser-type class="browser-toolbar__select" aria-label="Type">
      <option value="">All Types</option>
      ${allTypes.filter((type) => type !== 'Stellar').map((type) =>
        `<option value="${escapeHtml(type)}" ${type === selectedType ? 'selected' : ''}>${escapeHtml(type)}</option>`
      ).join('')}
    </select>`;
  }

  /** @param {string} [selectedGen] @param {ToolbarDependencies} [deps] */
  function renderBrowserGenerationControl(selectedGen = '', deps = {}) {
    const escapeHtml = deps.escapeHtml || fallbackEscapeHtml;
    return `<select data-browser-generation class="browser-toolbar__select" aria-label="Generation">
      <option value="">All Gens</option>
      ${GENERATIONS.map((generation) =>
        `<option value="${generation.value}" ${generation.value === selectedGen ? 'selected' : ''}>${escapeHtml(generation.label)}</option>`
      ).join('')}
    </select>`;
  }

  /** @param {string} [value] */
  function renderBrowserTransferredControl(value = '') {
    return `<select data-browser-transferred class="browser-toolbar__select" aria-label="Transferred" title="Filter by transfer status to Champions">
      <option value=""${value === '' ? ' selected' : ''}>All</option>
      <option value="yes"${value === 'yes' ? ' selected' : ''}>Transferred</option>
      <option value="no"${value === 'no' ? ' selected' : ''}>Not transferred</option>
    </select>`;
  }

  /** @param {boolean} checked */
  function renderBrowserOwnedOnlyControl(checked) {
    return `<label class="browser-toolbar__check">
      <input type="checkbox" data-browser-owned-only ${checked ? 'checked' : ''}>
      Owned only
    </label>`;
  }

  /** @param {string} [value] */
  function renderBrowserSourceControl(value = '') {
    return `<select data-browser-source class="browser-toolbar__select" aria-label="Source" title="Filter by build source">
      <option value=""${value === '' ? ' selected' : ''}>All</option>
      <option value="mine"${value === 'mine' ? ' selected' : ''}>Mine</option>
      <option value="templates"${value === 'templates' ? ' selected' : ''}>Templates</option>
    </select>`;
  }

  /** @param {string[]} [selectedFlags] @param {ToolbarDependencies} [deps] */
  function renderBrowserFlagsControl(selectedFlags = [], deps = {}) {
    const escapeHtml = deps.escapeHtml || fallbackEscapeHtml;
    return FLAG_FILTERS.map(({ key, label }) => `
      <label class="browser-toolbar__check" title="Filter: ${escapeHtml(label)}">
        <input type="checkbox" data-browser-flag="${escapeHtml(key)}" ${selectedFlags.includes(key) ? 'checked' : ''}>
        ${escapeHtml(label)}
      </label>
    `).join('');
  }

  /** @param {import('../../types/contracts.js').BrowserQuery['mode']} mode @param {ToolbarDependencies} [deps] */
  function renderBrowserModeControl(mode, deps = {}) {
    const escapeHtml = deps.escapeHtml || fallbackEscapeHtml;
    return `
      <div class="browser-toolbar__mode-toggle">
        <button type="button" class="btn btn-sm ${mode === 'table' ? 'btn-primary' : 'btn-secondary'}" data-browser-mode="table" aria-pressed="${mode === 'table'}">${escapeHtml('Table')}</button>
        <button type="button" class="btn btn-sm ${mode === 'card' ? 'btn-primary' : 'btn-secondary'}" data-browser-mode="card" aria-pressed="${mode === 'card'}">${escapeHtml('Card')}</button>
      </div>`;
  }

  /** @param {Partial<import('../../types/contracts.js').BrowserQuery>} [query] */
  function countActiveFilters(query = {}) {
    return [
      query.type,
      query.generation,
      query.transferred,
      query.ownedOnly,
      query.source,
      ...(query.games || []),
      ...(query.flags || []),
    ].filter(Boolean).length;
  }

  /**
   * @param {Partial<import('../../types/contracts.js').BrowserToolbarModel> & {secondaryOpen?: boolean}} [config]
   * @param {ToolbarDependencies} [deps]
   */
  function renderBrowserToolbar(config = {}, deps = {}) {
    const escapeHtml = deps.escapeHtml || fallbackEscapeHtml;
    const query = /** @type {Partial<import('../../types/contracts.js').BrowserQuery>} */ (config.query || {});
    const toolbar = document.createElement('section');
    toolbar.className = 'browser-toolbar';
    toolbar.dataset.route = config.route || '';

    const rows = [];
    const primaryGroups = [];
    const filterGroups = [];
    const secondaryRows = [];

    if (config.showModeToggle) {
      primaryGroups.push(renderToolbarGroup('View', renderBrowserModeControl(query.mode || 'table', { escapeHtml }), { escapeHtml }));
    }

    if (config.showType) {
      filterGroups.push(renderToolbarGroup('Type', renderBrowserTypeControl(query.type || '', {
        escapeHtml,
        allTypes: deps.allTypes || [],
      }), { escapeHtml }));
    }

    if (config.showGeneration) {
      filterGroups.push(renderToolbarGroup('Generation', renderBrowserGenerationControl(query.generation || '', { escapeHtml }), { escapeHtml }));
    }

    if (config.showTransferred) {
      filterGroups.push(renderToolbarGroup('Transferred', renderBrowserTransferredControl(query.transferred || ''), { escapeHtml }));
    }

    if (config.showOwnedOnly) {
      filterGroups.push(renderToolbarGroup('Owned', renderBrowserOwnedOnlyControl(!!query.ownedOnly), { escapeHtml }));
    }

    if (config.showSource) {
      filterGroups.push(renderToolbarGroup('Source', renderBrowserSourceControl(query.source || ''), { escapeHtml }));
    }

    if (primaryGroups.length) {
      rows.push(`<div class="browser-toolbar__row">${primaryGroups.join('')}</div>`);
    }

    if (filterGroups.length) {
      rows.push(`<div class="browser-toolbar__row">${filterGroups.join('')}</div>`);
    }

    if (config.showGames) {
      const row = `<div class="browser-toolbar__row">${renderToolbarGroup('Games', renderBrowserGameControls(query.games || [], { escapeHtml }), { escapeHtml })}</div>`;
      if (config.collapseSecondary) secondaryRows.push(row);
      else rows.push(row);
    }

    if (config.showFlags) {
      const row = `<div class="browser-toolbar__row">${renderToolbarGroup('Flags', renderBrowserFlagsControl(query.flags || [], { escapeHtml }), { escapeHtml })}</div>`;
      if (config.collapseSecondary) secondaryRows.push(row);
      else rows.push(row);
    }

    if (secondaryRows.length) {
      const activeCount = countActiveFilters(query);
      const activeText = activeCount ? `<span class="browser-toolbar__active-count">${activeCount} active</span>` : '';
      rows.push(`
        <details class="browser-toolbar__secondary" data-browser-secondary ${config.secondaryOpen === false ? '' : 'open'}>
          <summary>Filters ${activeText}</summary>
          <div class="browser-toolbar__secondary-content">${secondaryRows.join('')}</div>
        </details>`);
    }

    if (config.summaryText) {
      rows.push(`<div class="browser-toolbar__summary">${escapeHtml(config.summaryText)}</div>`);
    }

    if (Array.isArray(config.statItems) && config.statItems.length) {
      rows.push(`<div class="browser-toolbar__stats">${config.statItems
        .map((item) => `<span class="browser-toolbar__stat">${escapeHtml(item)}</span>`)
        .join('')}</div>`);
    }

    toolbar.innerHTML = rows.join('');
    return toolbar;
  }

  /** @param {HTMLElement|null} container @param {{route?: import('../../types/contracts.js').RouteSection}} [opts] */
  function bindBrowserToolbar(container, opts = {}) {
    if (!container || typeof AppStore === 'undefined') return;
    const route = /** @type {import('../../types/contracts.js').RouteSection} */ (
      String(opts.route || container.dataset.route || AppStore.getActiveQueryRoute?.() || '').trim()
    );
    if (!route) return;

    container.querySelectorAll('[data-browser-mode]').forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.addEventListener('click', () => {
        const mode = /** @type {import('../../types/contracts.js').BrowserQuery['mode']} */ (button.dataset.browserMode);
        AppStore.setBrowserMode(route, mode);
      });
    });

    container.querySelectorAll('[data-browser-game]').forEach((checkbox) => {
      if (!(checkbox instanceof HTMLInputElement)) return;
      checkbox.addEventListener('change', () => {
        AppStore.toggleBrowserGame(route, checkbox.dataset.browserGame);
      });
    });

    container.querySelectorAll('[data-browser-type]').forEach((select) => {
      if (!(select instanceof HTMLSelectElement)) return;
      select.addEventListener('change', () => {
        AppStore.setBrowserTypeFilter(route, select.value);
      });
    });

    container.querySelectorAll('[data-browser-generation]').forEach((select) => {
      if (!(select instanceof HTMLSelectElement)) return;
      select.addEventListener('change', () => {
        AppStore.setBrowserGenerationFilter(route, select.value);
      });
    });

    container.querySelectorAll('[data-browser-transferred]').forEach((select) => {
      if (!(select instanceof HTMLSelectElement)) return;
      select.addEventListener('change', () => {
        AppStore.setBrowserTransferredFilter(route, select.value);
      });
    });

    container.querySelectorAll('[data-browser-owned-only]').forEach((checkbox) => {
      if (!(checkbox instanceof HTMLInputElement)) return;
      checkbox.addEventListener('change', () => {
        AppStore.setBrowserOwnedOnly(route, checkbox.checked);
      });
    });

    container.querySelectorAll('[data-browser-source]').forEach((select) => {
      if (!(select instanceof HTMLSelectElement)) return;
      select.addEventListener('change', () => {
        AppStore.setBrowserSourceFilter(route, select.value);
      });
    });

    container.querySelectorAll('[data-browser-flag]').forEach((checkbox) => {
      if (!(checkbox instanceof HTMLInputElement)) return;
      checkbox.addEventListener('change', () => {
        AppStore.toggleBrowserFlag(route, checkbox.dataset.browserFlag);
      });
    });
  }

  return {
    renderBrowserToolbar,
    bindBrowserToolbar,
  };
})();
