import { DataManager } from '../data.js';
import { EntityStore } from '../data/entity-store.js';
import { ExportUI } from '../export-ui.js';
import { PokemonViewer } from '../pokemon-viewer.js';
import { Selection } from '../selection.js';
import { AppSelectors } from '../state/app-selectors.js';
import { AppStore } from '../state/app-store.js';
import { UIShared } from '../ui-shared.js';
import { BrowserSurface } from '../ui/surfaces/browser-surface.js';
import { DetailPanel } from '../ui/surfaces/detail-panel.js';
import { KeyedList } from '../ui/keyed-list.js';
import { BallPicker } from '../ui/widgets/ball-picker.js';

/**
 * views/inventory.js - Inventory and Builds route views.
 *
 * Uses explicit view instances instead of a shared mutable route mode.
 */



const RESULTS_PAGE_SIZE = 120;

/** @param {'inventory'|'builds'} dataMode */
function createInventoryBrowser(dataMode) {
  /** @type {(() => void)|null} */
  let unsubscribeStore = null;
  /** @type {Array<() => void>} */
  let unsubscribeEntities = [];
  /** @type {(() => void)|null} */
  let unsubscribeSelection = null;
  let visibleLimit = RESULTS_PAGE_SIZE;
  // Instance selection is local to the inventory tab (keyed by entry._key).
  // The builds tab uses the global Selection module for build-keyed export.
  /** @type {Map<string, import('../types/contracts.js').BrowserEntry>|null} */
  const instanceSelection = dataMode === 'inventory' ? new Map() : null;

  /** @param {HTMLElement} container */
  function mount(container) {
    container.innerHTML = `
      <div id="view-${dataMode}">
        <div data-browser-toolbar></div>
        <div data-browser-actions></div>
        <div data-browser-results></div>
        <div data-browser-more></div>
      </div>`;
    if (unsubscribeStore) unsubscribeStore();
    visibleLimit = RESULTS_PAGE_SIZE;
    unsubscribeStore = AppStore.subscribe(
      (state) => AppSelectors.selectBrowserQuery(dataMode, state),
      () => {
        visibleLimit = RESULTS_PAGE_SIZE;
        render();
      },
      AppStore.browserQueryEquals
    );
    for (const unsubscribe of unsubscribeEntities) unsubscribe();
    const slices = /** @type {Array<'builds'|'inventory'>} */ (['builds', 'inventory']);
    unsubscribeEntities = slices.map((slice) => EntityStore.subscribe(slice, () => {
      visibleLimit = RESULTS_PAGE_SIZE;
      render();
    }));
    if (unsubscribeSelection) unsubscribeSelection();
    unsubscribeSelection = Selection.subscribe(() => render());
    render();
  }

  function unmount() {
    if (unsubscribeStore) { unsubscribeStore(); unsubscribeStore = null; }
    for (const unsubscribe of unsubscribeEntities) unsubscribe();
    unsubscribeEntities = [];
    if (unsubscribeSelection) { unsubscribeSelection(); unsubscribeSelection = null; }
    DetailPanel.close();
  }

  /** @param {string} key @param {import('../types/contracts.js').BrowserEntry} entry */
  function toggleInstanceSelection(key, entry) {
    if (!instanceSelection) return;
    if (instanceSelection.has(key)) {
      instanceSelection.delete(key);
    } else {
      instanceSelection.set(key, entry);
    }
    render();
  }

  function syncInstanceActionBar() {
    const bar = document.getElementById(`inv-action-bar-${dataMode}`);
    if (!bar) return;
    const n = instanceSelection ? instanceSelection.size : 0;
    bar.classList.toggle('hidden', n === 0);
    const countEl = bar.querySelector('.bulk-action-bar-count');
    if (countEl) countEl.textContent = `${n} selected`;
  }

  function render() {
    const root = document.getElementById(`view-${dataMode}`);
    if (!root) return;
    const toolbarHost = root.querySelector('[data-browser-toolbar]');
    const actionsHost = root.querySelector('[data-browser-actions]');
    const resultsHost = root.querySelector('[data-browser-results]');
    const moreHost = root.querySelector('[data-browser-more]');
    if (!(toolbarHost instanceof HTMLElement)
      || !(actionsHost instanceof HTMLElement)
      || !(resultsHost instanceof HTMLElement)
      || !(moreHost instanceof HTMLElement)) {
      throw new Error(`Missing ${dataMode} browser surface`);
    }

    const browser = AppSelectors.selectInventoryBrowser(dataMode);
    BrowserSurface.mountToolbar(toolbarHost, browser.toolbarModel);

    if (instanceSelection) {
      if (!actionsHost.firstElementChild) {
        const bar = document.createElement('div');
        bar.id = `inv-action-bar-${dataMode}`;
        bar.className = 'floating-action-bar bulk-action-bar hidden';
        bar.innerHTML = `
          <span class="bulk-action-bar-count">0 selected</span>
          <div class="bulk-action-bar-buttons">
            <button type="button" class="btn btn-sm btn-secondary" data-act="clear">Clear</button>
            <button type="button" class="btn btn-sm btn-primary" data-act="export">Export Selected</button>
          </div>
        `;
        bar.querySelector('[data-act="clear"]')?.addEventListener('click', () => {
          instanceSelection.clear();
          render();
        });
        bar.querySelector('[data-act="export"]')?.addEventListener('click', () => {
          const entries = [...instanceSelection.values()];
          if (entries.length) ExportUI.openBulkExportModal(entries);
        });
        actionsHost.appendChild(bar);
      }
      syncInstanceActionBar();
    } else {
      actionsHost.replaceChildren();
    }

    if (browser.emptyState) {
      resultsHost.replaceChildren(BrowserSurface.createEmptyState(browser.emptyState, browser.route));
      moreHost.replaceChildren();
      return;
    }

    const totalEntries = browser.visibleEntries.length;
    const renderedEntries = browser.visibleEntries.slice(0, visibleLimit);
    if (browser.query.mode === 'card') {
      renderCards(resultsHost, renderedEntries);
    } else {
      renderTable(resultsHost, renderedEntries, browser.query, browser.route);
    }
    if (renderedEntries.length < totalEntries) {
      moreHost.replaceChildren(renderMoreResults(renderedEntries.length, totalEntries));
    } else {
      moreHost.replaceChildren();
    }
  }

  /** @param {number} renderedCount @param {number} totalCount */
  function renderMoreResults(renderedCount, totalCount) {
    const wrap = document.createElement('div');
    wrap.className = 'browser-results-more';
    const nextCount = Math.min(RESULTS_PAGE_SIZE, totalCount - renderedCount);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.textContent = `Show ${nextCount.toLocaleString()} more (${renderedCount.toLocaleString()} of ${totalCount.toLocaleString()})`;
    button.addEventListener('click', () => {
      visibleLimit = Math.min(totalCount, visibleLimit + RESULTS_PAGE_SIZE);
      render();
      requestAnimationFrame(() => {
        const nextButton = document.querySelector(`#view-${dataMode} .browser-results-more .btn`);
        if (nextButton instanceof HTMLElement) nextButton.focus();
      });
    });
    wrap.appendChild(button);
    return wrap;
  }

  /** @param {string|null|undefined} buildId */
  function toggleSelection(buildId) {
    if (!buildId) return;
    Selection.toggle(buildId);
  }

  /**
   * @param {HTMLElement} host
   * @param {import('../types/contracts.js').BrowserEntry[]} entries
   * @param {import('../types/contracts.js').BrowserQuery} query
   * @param {import('../types/contracts.js').RouteSection} route
   */
  function renderTable(host, entries, query, route) {
    const columns = [
      { key: 'select', label: '', sortable: false },
      { key: 'sprite', label: '', sortable: true },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'num', label: 'Dex #', sortable: true },
      { key: 'type', label: 'Types', sortable: true },
      { key: 'ball', label: 'Ball', sortable: true },
      { key: 'location', label: 'Location', sortable: true },
      { key: 'nature', label: 'Nature', sortable: true },
      { key: 'ability', label: 'Ability', sortable: true },
    ];

    let wrapper = host.querySelector('.inventory-table-wrap');
    if (!(wrapper instanceof HTMLElement)) {
      wrapper = document.createElement('div');
      wrapper.className = 'inventory-table-wrap';
      const table = document.createElement('table');
      table.className = 'inventory-table';
      table.append(document.createElement('thead'), document.createElement('tbody'));
      wrapper.appendChild(table);
      host.replaceChildren(wrapper);
    }
    const table = wrapper.querySelector('.inventory-table');
    const thead = table?.querySelector('thead');
    const tbody = table?.querySelector('tbody');
    if (!(table instanceof HTMLTableElement)
      || !(thead instanceof HTMLTableSectionElement)
      || !(tbody instanceof HTMLTableSectionElement)) {
      throw new Error(`Invalid ${dataMode} table surface`);
    }
    const headerRow = document.createElement('tr');
    for (const col of columns) {
      const th = document.createElement('th');
      th.textContent = col.label;
      if (col.sortable) {
        th.classList.add('sortable');
        if (query.sortKey === col.key) th.classList.add(query.sortAsc ? 'sort-asc' : 'sort-desc');
        th.addEventListener('click', () => {
          AppStore.toggleBrowserSort(route, col.key);
        });
      }
      headerRow.appendChild(th);
    }
    thead.replaceChildren(headerRow);
    KeyedList.reconcile(tbody, entries, {
      key: (entry) => entry._key,
      signature: (entry) => JSON.stringify({
        entry,
        selected: instanceSelection
          ? instanceSelection.has(entry._key)
          : Boolean(entry.primary?.id && Selection.has(entry.primary.id)),
      }),
      render: createTableRow,
    });
  }

  /** @param {import('../types/contracts.js').BrowserEntry} entry */
  function createTableRow(entry) {
    const tr = document.createElement('tr');
    tr.className = 'inventory-row';
    tr.dataset.searchText = entry.searchText;
    if (!entry.owned) tr.classList.add('row-dimmed');
    UIShared.applyEntryDecorations(tr, entry);

    const buildId = entry.primary && entry.primary.id;
    if (instanceSelection) {
      if (instanceSelection.has(entry._key)) tr.classList.add('row-selected');
    } else if (buildId && Selection.has(buildId)) {
      tr.classList.add('row-selected');
    }

    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      if (entry._kind === 'instance' && entry.boxId != null) {
        PokemonViewer.openPokemonViewer({ slug: entry.slug, boxId: entry.boxId, slotIdx: entry.slotIdx });
      } else if (entry.primary) {
        PokemonViewer.openPokemonViewer({ build: entry.primary });
      } else {
        const species = DataManager.getPokedexEntry(entry.slug);
        if (species) PokemonViewer.openPokemonViewer({ species });
      }
    });

    const tdSel = document.createElement('td');
    tdSel.className = 'inv-cell-select';
    if (instanceSelection) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'inv-select-checkbox';
      cb.checked = instanceSelection.has(entry._key);
      cb.title = 'Select for export';
      cb.setAttribute('aria-label', `Select ${entry.name}`);
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => toggleInstanceSelection(entry._key, entry));
      tdSel.appendChild(cb);
    } else if (buildId) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'inv-select-checkbox';
      cb.checked = Selection.has(buildId);
      cb.title = 'Select for bulk export';
      cb.setAttribute('aria-label', `Select ${entry.name} for bulk export`);
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => toggleSelection(buildId));
      tdSel.appendChild(cb);
    }
    tr.appendChild(tdSel);

    const tdSprite = document.createElement('td');
    tdSprite.className = 'inv-cell-sprite';
    tdSprite.innerHTML = UIShared.spriteWithDotsHtml(entry.slug, entry.name,
      { cls: 'inv-sprite' },
      entry.decorations?.dotOptions || { slug: entry.slug, transferredToChampions: entry.transferredToChampions, inChampions: entry.inChampions, eventOrigin: entry.eventOrigin, fromGo: entry.fromGo, language: entry.language, shiny: entry.shiny, genned: entry.genned, gigantamax: entry.gigantamax, alpha: entry.alpha });
    tr.appendChild(tdSprite);

    const tdName = document.createElement('td');
    tdName.textContent = entry.name;
    if (entry.source) {
      const badge = document.createElement('span');
      badge.className = 'source-badge';
      badge.textContent = entry.source === 'smogon-bss' ? 'BSS' : 'Smogon';
      badge.title = entry.source === 'smogon-bss' ? 'Smogon Battle Stadium Singles template' : 'Smogon competitive template';
      tdName.appendChild(badge);
    }
    tr.appendChild(tdName);

    const tdNum = document.createElement('td');
    tdNum.className = 'inv-cell-num';
    tdNum.textContent = '#' + String(entry.num).padStart(4, '0');
    tr.appendChild(tdNum);

    const tdTypes = document.createElement('td');
    tdTypes.innerHTML = entry.types.map((type) =>
      `<span class="type-badge type-${type.toLowerCase()}">${type}</span>`
    ).join(' ');
    tr.appendChild(tdTypes);

    const tdBall = document.createElement('td');
    tdBall.className = 'inv-cell-ball';
    if (entry.ball) {
      const ballImg = document.createElement('img');
      ballImg.src = BallPicker.ballSpriteUrl(entry.ball);
      ballImg.alt = entry.ball + ' Ball';
      ballImg.title = entry.ball + ' Ball';
      ballImg.width = 24;
      ballImg.height = 24;
      ballImg.onerror = function () { this.replaceWith(document.createTextNode(entry.ball)); };
      tdBall.appendChild(ballImg);
    }
    tr.appendChild(tdBall);

    const tdLoc = document.createElement('td');
    tdLoc.className = 'inv-cell-meta';
    if (entry.location) tdLoc.textContent = entry.location;
    else tdLoc.innerHTML = '<span class="muted-unknown">?</span>';
    tr.appendChild(tdLoc);

    const tdNature = document.createElement('td');
    tdNature.className = 'inv-cell-meta';
    if (entry.nature) tdNature.textContent = entry.nature;
    else tdNature.innerHTML = '<span class="muted-unknown">?</span>';
    tr.appendChild(tdNature);

    const tdAbility = document.createElement('td');
    tdAbility.className = 'inv-cell-meta';
    if (entry.ability) tdAbility.textContent = DataManager.formatAbilityLabel(entry.slug, entry.ability);
    else tdAbility.innerHTML = '<span class="muted-unknown">?</span>';
    tr.appendChild(tdAbility);

    return tr;
  }

  /** @param {HTMLElement} host @param {import('../types/contracts.js').BrowserEntry[]} entries */
  function renderCards(host, entries) {
    let grid = host.querySelector('.inventory-card-grid');
    if (!(grid instanceof HTMLElement)) {
      grid = document.createElement('div');
      grid.className = 'inventory-card-grid';
      host.replaceChildren(grid);
    }
    if (!(grid instanceof HTMLElement)) throw new Error(`Invalid ${dataMode} card surface`);

    /** @param {import('../types/contracts.js').BrowserEntry} entry */
    const openInstanceEditor = (entry) => {
      if (entry.boxId == null || entry.slotIdx == null) return;
      PokemonViewer.openInstanceEditor(entry.boxId, entry.slotIdx);
    };

    /** @param {HTMLElement} card @param {string} key @param {import('../types/contracts.js').BrowserEntry} entry */
    const attachSelectionCheckbox = (card, key, entry) => {
      if (!card || card.querySelector('.inventory-card-select')) return;
      const isInstance = !!instanceSelection;
      const isSelected = isInstance ? instanceSelection.has(key) : Selection.has(key);
      if (isSelected) card.classList.add('card-selected');
      const wrap = document.createElement('label');
      wrap.className = 'inventory-card-select';
      wrap.title = 'Select for export';
      wrap.addEventListener('click', (e) => e.stopPropagation());
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isSelected;
      cb.setAttribute('aria-label', 'Select for export');
      if (isInstance) {
        cb.addEventListener('change', () => toggleInstanceSelection(key, entry));
      } else {
        cb.addEventListener('change', () => toggleSelection(key));
      }
      wrap.appendChild(cb);
      card.appendChild(wrap);
    };

    /** @param {import('../types/contracts.js').BrowserEntry} entry */
    function createCard(entry) {
      if (entry._kind === 'instance') {
        const hasData = entry.nature || entry.ability || (entry.moves && entry.moves.some(Boolean));
        const card = hasData
          ? PokemonViewer.createInstanceCard(entry, { onEdit: () => openInstanceEditor(entry) })
          : PokemonViewer.createEmptyCard(entry, { onEdit: () => openInstanceEditor(entry) });
        const selKey = instanceSelection ? entry._key : (entry.primary && entry.primary.id);
        if (selKey) attachSelectionCheckbox(card, selKey, entry);
        card.addEventListener('click', (e) => {
          if (e.target instanceof Element && e.target.closest('.inventory-card-copy-btn, .inventory-card-edit-btn, .inventory-card-select')) return;
          e.stopPropagation();
          if (entry.boxId != null) {
            PokemonViewer.openPokemonViewer({ slug: entry.slug, boxId: entry.boxId, slotIdx: entry.slotIdx });
          }
        }, { capture: true });
        return card;
      }

      if (entry.primary) {
        const card = PokemonViewer.createLibraryBuildCard(entry.primary, {
          status: entry.status,
          searchText: entry.searchText,
          badgeEntry: entry,
          decoSource: entry,
        });
        if (!entry.owned) card.classList.add('row-dimmed');
        if (entry.source) {
          const badge = document.createElement('span');
          badge.className = 'source-badge source-badge--card';
          badge.textContent = entry.source === 'smogon-bss' ? 'BSS' : 'Smogon';
          badge.title = entry.source === 'smogon-bss' ? 'Smogon Battle Stadium Singles template' : 'Smogon competitive template';
          card.appendChild(badge);
        }
        if (entry.primary.id) attachSelectionCheckbox(card, entry.primary.id, entry);
        return card;
      }

      const card = PokemonViewer.createEmptyCard(entry, { subtitle: 'No build' });
      if (!entry.owned) card.classList.add('row-dimmed');
      card.addEventListener('click', () => {
        const species = DataManager.getPokedexEntry(entry.slug);
        if (species) PokemonViewer.openPokemonViewer({ species });
      });
      return card;
    }

    KeyedList.reconcile(grid, entries, {
      key: (entry) => entry._key,
      signature: (entry) => JSON.stringify({
        entry,
        selected: instanceSelection
          ? instanceSelection.has(entry._key)
          : Boolean(entry.primary?.id && Selection.has(entry.primary.id)),
      }),
      render: createCard,
    });
  }

  return { mount, unmount };
}

const InventoryView = createInventoryBrowser('inventory');
const BuildsView = createInventoryBrowser('builds');

export { InventoryView, BuildsView };
