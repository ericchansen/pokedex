/**
 * views/inventory.js - Inventory and Builds route views.
 *
 * Uses explicit view instances instead of a shared mutable route mode.
 */

const {
  AppStore,
  AppSelectors,
  Selection,
  UIShared,
  BrowserSurface,
  DataManager,
  PokemonViewer,
} = globalThis;

const RESULTS_PAGE_SIZE = 120;

function createInventoryBrowser(dataMode) {
  let unsubscribeStore = null;
  let visibleLimit = RESULTS_PAGE_SIZE;
  // Instance selection is local to the inventory tab (keyed by entry._key).
  // The builds tab uses the global Selection module for build-keyed export.
  const instanceSelection = dataMode === 'inventory' ? new Map() : null;

  function mount(container) {
    container.innerHTML = `<div id="view-${dataMode}"></div>`;
    if (unsubscribeStore) unsubscribeStore();
    visibleLimit = RESULTS_PAGE_SIZE;
    let previousQuery = AppStore.getBrowserQuery(dataMode);
    let previousRevision = AppStore.getRouteRevision();
    unsubscribeStore = AppStore.subscribe(() => {
      const nextQuery = AppStore.getBrowserQuery(dataMode);
      const nextRevision = AppStore.getRouteRevision();
      if (nextRevision === previousRevision && AppStore.browserQueryEquals(previousQuery, nextQuery)) return;
      previousQuery = nextQuery;
      previousRevision = nextRevision;
      visibleLimit = RESULTS_PAGE_SIZE;
      render();
    });
    render();
  }

  function unmount() {
    if (unsubscribeStore) { unsubscribeStore(); unsubscribeStore = null; }
    UIShared.closePanel();
  }

  function toggleInstanceSelection(key, entry) {
    if (!instanceSelection) return;
    if (instanceSelection.has(key)) {
      instanceSelection.delete(key);
    } else {
      instanceSelection.set(key, entry);
    }
    syncInstanceActionBar();
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

    const browser = AppSelectors.selectInventoryBrowser(dataMode);
    root.innerHTML = '';
    BrowserSurface.mountToolbar(root, browser.toolbarModel);

    if (instanceSelection) {
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
      bar.querySelector('[data-act="clear"]').addEventListener('click', () => {
        instanceSelection.clear();
        render();
      });
      bar.querySelector('[data-act="export"]').addEventListener('click', () => {
        const entries = [...instanceSelection.values()];
        if (entries.length) ExportUI.openBulkExportModal(entries);
      });
      root.appendChild(bar);
      syncInstanceActionBar();
    }

    if (browser.emptyState) {
      root.appendChild(BrowserSurface.createEmptyState(browser.emptyState, browser.route));
      return;
    }

    const totalEntries = browser.visibleEntries.length;
    const renderedEntries = browser.visibleEntries.slice(0, visibleLimit);
    root.appendChild(browser.query.mode === 'card'
      ? renderCards(renderedEntries)
      : renderTable(renderedEntries, browser.query, browser.route));
    if (renderedEntries.length < totalEntries) {
      root.appendChild(renderMoreResults(renderedEntries.length, totalEntries));
    }
  }

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
        document.querySelector(`#view-${dataMode} .browser-results-more .btn`)?.focus();
      });
    });
    wrap.appendChild(button);
    return wrap;
  }

  function toggleSelection(buildId) {
    if (!buildId) return;
    Selection.toggle(buildId);
  }

  function renderTable(entries, query, route) {
    const wrapper = document.createElement('div');
    wrapper.className = 'inventory-table-wrap';

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

    const table = document.createElement('table');
    table.className = 'inventory-table';

    const thead = document.createElement('thead');
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
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const entry of entries) {
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
        // Inventory tab: select by instance key, works for all entries
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
        // Builds tab: select by build ID for Showdown export
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

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  }

  function renderCards(entries) {
    const grid = document.createElement('div');
    grid.className = 'inventory-card-grid';

    const openInstanceEditor = (entry) => {
      if (entry.boxId == null) return;
      PokemonViewer.openInstanceEditor(entry.boxId, entry.slotIdx, {
        onSaved: () => AppStore.markRouteDirty(),
      });
    };

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

    for (const entry of entries) {
      if (entry._kind === 'instance') {
        const hasData = entry.nature || entry.ability || (entry.moves && entry.moves.some(Boolean));
        const card = hasData
          ? PokemonViewer.createInstanceCard(entry, { onEdit: () => openInstanceEditor(entry) })
          : PokemonViewer.createEmptyCard(entry, { onEdit: () => openInstanceEditor(entry) });
        const selKey = instanceSelection ? entry._key : (entry.primary && entry.primary.id);
        if (selKey) attachSelectionCheckbox(card, selKey, entry);
        card.addEventListener('click', (e) => {
          if (e.target.closest('.inventory-card-copy-btn, .inventory-card-edit-btn, .inventory-card-select')) return;
          e.stopPropagation();
          if (entry.boxId != null) {
            PokemonViewer.openPokemonViewer({ slug: entry.slug, boxId: entry.boxId, slotIdx: entry.slotIdx });
          }
        }, { capture: true });
        grid.appendChild(card);
        continue;
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
        attachSelectionCheckbox(card, entry.primary.id, entry);
        grid.appendChild(card);
      } else {
        const card = PokemonViewer.createEmptyCard(entry, { subtitle: 'No build' });
        if (!entry.owned) card.classList.add('row-dimmed');
        card.addEventListener('click', () => {
          const species = DataManager.getPokedexEntry(entry.slug);
          if (species) PokemonViewer.openPokemonViewer({ species });
        });
        grid.appendChild(card);
      }
    }

    return grid;
  }

  return { mount, unmount };
}

const InventoryView = createInventoryBrowser('inventory');
const BuildsView = createInventoryBrowser('builds');

export { InventoryView, BuildsView };
