/**
 * views/home.js — Boxes view.
 * 200-box dense continuous-scroll grid with lazy rendering.
 */

const {
  AppStore,
  AppSelectors,
  DataManager,
  UIShared,
  BrowserSurface,
  ProgressIndicator,
  PokemonViewer,
  AppRoutes,
} = globalThis;

const BoxesView = (() => {
  let containerEl = null;
  let observer = null;
  const renderedBoxes = new Set();
  let unsubscribeStore = null;

  // ── Clipboard for copy/paste/cut ─────────────────────────
  // Unified clipboard: { items: [snapshots], isCut: bool, sources: [{boxId,slotIdx,instanceId}] | null }
  let clipboard = null;

  // ── Drag auto-scroll ──────────────────────────────────────
  let dragScrollRAF = null;
  let dragScrollDir = 0; // -1 = up, 1 = down, 0 = none
  const EDGE_ZONE = 60; // px from viewport edge that triggers scroll
  const MAX_SPEED = 14; // px per frame at the very edge
  const SLOTS_PER_BOX = 30;
  const PLACEMENT_SEARCH_DEBOUNCE_MS = 150;

  function snapshotOccupant(occupant) {
    if (!occupant) return null;
    return {
      species_id: occupant.species_id,
      target_build_id: occupant.target_build_id || null,
      state: occupant.state ? structuredClone(occupant.state) : {},
    };
  }

  function handleDragOver(e) {
    const y = e.clientY;
    const vh = window.innerHeight;
    if (y < EDGE_ZONE) {
      dragScrollDir = -1 * (1 - y / EDGE_ZONE); // stronger closer to edge
      startDragScroll();
    } else if (y > vh - EDGE_ZONE) {
      dragScrollDir = (1 - (vh - y) / EDGE_ZONE);
      startDragScroll();
    } else {
      stopDragScroll();
    }
  }

  function startDragScroll() {
    if (dragScrollRAF) return;
    function tick() {
      if (dragScrollDir === 0) { dragScrollRAF = null; return; }
      window.scrollBy(0, dragScrollDir * MAX_SPEED);
      dragScrollRAF = requestAnimationFrame(tick);
    }
    dragScrollRAF = requestAnimationFrame(tick);
  }

  function stopDragScroll() {
    dragScrollDir = 0;
    if (dragScrollRAF) { cancelAnimationFrame(dragScrollRAF); dragScrollRAF = null; }
  }

  // ── Slot selection action bar ──────────────────────────────
  let slotActionBar = null;
  let unsubSlotSelection = null;

  function ensureSlotActionBar() {
    if (slotActionBar) return slotActionBar;
    slotActionBar = document.createElement('div');
    slotActionBar.className = 'floating-action-bar slot-action-bar hidden';
    slotActionBar.innerHTML = `
      <span class="slot-action-bar-count">0 selected</span>
      <div class="slot-action-bar-buttons">
        <button class="btn btn-sm btn-secondary" id="slot-bar-copy">Copy</button>
        <button class="btn btn-sm btn-secondary" id="slot-bar-cut">Cut</button>
        <button class="btn btn-sm btn-danger" id="slot-bar-remove">Remove</button>
        <button class="btn btn-sm btn-secondary" id="slot-bar-clear">Clear</button>
      </div>
    `;
    document.body.appendChild(slotActionBar);

    slotActionBar.querySelector('#slot-bar-copy').addEventListener('click', () => {
      const entries = SlotSelection.entries();
      const items = entries.map(({ boxId, slotIdx }) => {
        const box = DataManager.getBox(boxId);
        return snapshotOccupant(box?.slots[slotIdx]);
      }).filter(Boolean);
      clipboard = { items, isCut: false, sources: null };
      SlotSelection.clear();
      UIShared.showToast(`Copied ${items.length} Pokémon`);
    });

    slotActionBar.querySelector('#slot-bar-cut').addEventListener('click', () => {
      const entries = SlotSelection.entries();
      const paired = entries.map(({ boxId, slotIdx }) => {
        const box = DataManager.getBox(boxId);
        const occupant = box?.slots[slotIdx];
        if (!occupant) return null;
        return {
          source: { boxId, slotIdx, instanceId: occupant.state?.id || null },
          clip: snapshotOccupant(occupant),
        };
      }).filter(Boolean);
      clipboard = { items: paired.map(p => p.clip), isCut: true, sources: paired.map(p => p.source) };
      SlotSelection.clear();
      UIShared.showToast(`Cut ${clipboard.items.length} Pokémon`);
    });

    slotActionBar.querySelector('#slot-bar-remove').addEventListener('click', async () => {
      const entries = SlotSelection.entries();
      const count = entries.length;
      const confirmed = await UIShared.showConfirm(`Remove ${count} Pokémon from their slots?`);
      if (!confirmed) return;
      try {
        const affected = await DataManager.batchRemoveSlots(entries);
        SlotSelection.clear();
        for (const boxId of affected) refreshBox(boxId);
        ProgressIndicator.updateProgress();
        UIShared.showToast(`Removed ${count} Pokémon`);
      } catch (err) {
        console.error('[Boxes] batchRemoveSlots failed:', err);
        UIShared.showToast('Failed to remove — check console');
      }
    });

    slotActionBar.querySelector('#slot-bar-clear').addEventListener('click', () => {
      SlotSelection.clear();
    });

    return slotActionBar;
  }

  function refreshSlotActionBar() {
    if (!slotActionBar) return;
    const n = SlotSelection.size();
    slotActionBar.classList.toggle('hidden', n === 0);
    const countEl = slotActionBar.querySelector('.slot-action-bar-count');
    if (countEl) countEl.textContent = `${n} Pokémon selected`;
    // Toggle selection-mode class on container for CSS dimming
    const container = document.getElementById('boxes-container');
    if (container) container.classList.toggle('selecting', n > 0);
  }

  function refreshSlotSelectionVisuals() {
    const container = document.getElementById('boxes-container');
    if (!container) return;
    container.querySelectorAll('.slot.occupied').forEach((slot) => {
      const boxId = parseInt(slot.dataset.boxId, 10);
      const slotIdx = parseInt(slot.dataset.slotIdx, 10);
      slot.classList.toggle('selected', SlotSelection.has(boxId, slotIdx));
    });
    refreshSlotActionBar();
  }

  function handleSelectionKeydown(e) {
    if (e.key === 'Escape' && SlotSelection.size() > 0) {
      SlotSelection.clear();
      e.preventDefault();
    }
  }

  function mount(container) {
    containerEl = container;
    container.innerHTML = `
      <div id="view-boxes">
        <div class="preset-selector" id="preset-selector">
          <label title="Auto-arrange your boxes into a Living Dex layout for a specific game">Preset:</label>
          <select id="preset-gameset" class="preset-select" title="Choose a Living Dex preset to organize boxes by game">
            <option value="">None</option>
            <option value="home" title="National Dex order (Bulbasaur → Pecharunt)">HOME Living Dex</option>
            <option value="sv" title="Paldean Pokédex order (SV-only species)">Scarlet / Violet</option>
          </select>
          <select id="preset-layout" class="preset-select" hidden></select>
        </div>
        <div id="boxes-browser-toolbar"></div>
        <div id="boxes-search-empty-anchor"></div>
        <div class="boxes-container" id="boxes-container"></div>
        <div class="inventory-placement-bar" id="placement-bar" hidden>
          <label>Place Pokémon: </label>
          <input type="text" id="placement-search" class="placement-search" placeholder="Search species..." autocomplete="off">
          <div class="placement-results" id="placement-results"></div>
          <button class="btn btn-sm btn-secondary" id="placement-cancel">Cancel</button>
        </div>
      </div>`;

    renderAllBoxPlaceholders();
    const boxesContainer = container.querySelector('#boxes-container');
    if (boxesContainer) {
      boxesContainer.addEventListener('dblclick', handleBoxHeaderEvent);
      boxesContainer.addEventListener('contextmenu', handleBoxHeaderEvent);
    }
    wirePresetSelector();
    renderToolbar();
    ProgressIndicator.updateProgress();

    // Slot selection
    SlotSelection.clear();
    ensureSlotActionBar();
    if (unsubSlotSelection) unsubSlotSelection();
    unsubSlotSelection = SlotSelection.subscribe(refreshSlotSelectionVisuals);

    // ESC key to clear selection
    document.addEventListener('keydown', handleSelectionKeydown);

    // Auto-scroll when dragging near viewport edges
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragend', stopDragScroll);
    document.addEventListener('drop', stopDragScroll);

    if (unsubscribeStore) unsubscribeStore();
    let previousQuery = cloneBrowserQuery(getBrowserQuery());
    unsubscribeStore = AppStore.subscribe(() => {
      const nextQuery = cloneBrowserQuery(getBrowserQuery());
      if (sameBrowserQuery(previousQuery, nextQuery)) return;
      renderToolbar();
      applyFilters();
      previousQuery = nextQuery;
    });

    // Default to HOME Living Dex preset
    const gamesetSelect = document.getElementById('preset-gameset');
    if (gamesetSelect && !DataManager.getActivePreset()) {
      gamesetSelect.value = 'home';
      gamesetSelect.dispatchEvent(new Event('change'));
    }

    // Refresh all boxes when any instance is edited (gender/gmax changes affect ghosts elsewhere)
    document.addEventListener('instance-saved', handleInstanceSaved);
    document.addEventListener('instance-metadata-changed', handleMetadataChanged);
  }

  function handleInstanceSaved(e) {
    const { boxId } = e?.detail || {};
    if (boxId != null) refreshBox(boxId);
    else refreshAllRenderedBoxes();
    ProgressIndicator.updateProgress();
  }

  function handleMetadataChanged(e) {
    const { boxId } = e.detail || {};
    if (boxId != null) refreshBox(boxId);
    ProgressIndicator.updateProgress();
  }

  function unmount() {
    if (observer) { observer.disconnect(); observer = null; }
    if (unsubscribeStore) { unsubscribeStore(); unsubscribeStore = null; }
    if (unsubSlotSelection) { unsubSlotSelection(); unsubSlotSelection = null; }
    const boxesContainer = containerEl?.querySelector('#boxes-container');
    if (boxesContainer) {
      boxesContainer.removeEventListener('dblclick', handleBoxHeaderEvent);
      boxesContainer.removeEventListener('contextmenu', handleBoxHeaderEvent);
    }
    document.removeEventListener('keydown', handleSelectionKeydown);
    document.removeEventListener('dragover', handleDragOver);
    document.removeEventListener('dragend', stopDragScroll);
    document.removeEventListener('drop', stopDragScroll);
    document.removeEventListener('instance-saved', handleInstanceSaved);
    document.removeEventListener('instance-metadata-changed', handleMetadataChanged);
    stopDragScroll();
    SlotSelection.clear();
    if (slotActionBar) { slotActionBar.remove(); slotActionBar = null; }
    renderedBoxes.clear();
    UIShared.closePanel();
    containerEl = null;
  }

  function getBrowserQuery() {
    return AppSelectors.selectBrowserQuery(AppRoutes.sections.boxes);
  }

  function cloneBrowserQuery(query) {
    return {
      ...query,
      games: Array.isArray(query?.games) ? [...query.games] : [],
      flags: Array.isArray(query?.flags) ? [...query.flags] : [],
    };
  }

  function sameBrowserQuery(a, b) {
    return !!a && !!b && AppStore.browserQueryEquals(a, b);
  }

  function renderToolbar() {
    const mount = document.getElementById('boxes-browser-toolbar');
    if (!mount) return;
    BrowserSurface.mountToolbar(
      mount,
      AppSelectors.selectBrowserToolbarConfig(AppRoutes.sections.boxes)
    );
  }

  function handleBoxHeaderEvent(event) {
    const header = event.target.closest('.box-header');
    if (!header) return;
    const container = document.getElementById('boxes-container');
    if (!container || !container.contains(header)) return;
    const boxEl = header.closest('.box');
    const boxId = Number.parseInt(boxEl?.dataset.boxId ?? '', 10);
    if (Number.isNaN(boxId)) return;
    if (event.type === 'contextmenu') {
      event.preventDefault();
    }
    renameBox(boxId, header);
  }

  // ── Lazy rendering with IntersectionObserver ──────────

  function renderAllBoxPlaceholders() {
    const container = document.getElementById('boxes-container');
    container.innerHTML = '';
    renderedBoxes.clear();
    if (observer) observer.disconnect();

    const boxCount = DataManager.getBoxCount();
    const preset = DataManager.getActivePreset();

    const frag = document.createDocumentFragment();
    for (let i = 0; i < boxCount; i++) {
      const box = DataManager.getBox(i);
      const presetBox = preset ? preset.boxes[i] : null;

      const boxEl = document.createElement('div');
      boxEl.className = 'box';
      boxEl.dataset.boxId = i;

      const header = document.createElement('div');
      header.className = 'box-header';
      header.textContent = box ? box.name : `HOME ${i + 1}`;
      if (presetBox) {
        const presetLabel = document.createElement('span');
        presetLabel.className = 'box-header-preset';
        presetLabel.textContent = ` — ${presetBox.title}`;
        header.appendChild(presetLabel);
      }
      boxEl.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'box-grid';
      boxEl.appendChild(grid);

      frag.appendChild(boxEl);
    }
    container.appendChild(frag);

    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const boxId = parseInt(entry.target.dataset.boxId, 10);
          if (!renderedBoxes.has(boxId)) {
            renderBoxContent(entry.target, boxId);
            renderedBoxes.add(boxId);
          }
          observer.unobserve(entry.target);
        }
      }
    }, { rootMargin: '200px' });

    // Delay observe to next frame so browser has a layout pass —
    // otherwise observer won't fire for already-visible elements on re-render
    requestAnimationFrame(() => {
      for (const boxEl of container.querySelectorAll('.box')) {
        observer.observe(boxEl);
      }
    });
  }

  function populateBoxGrid(grid, box, boxId, presetBox) {
    if (!grid || !box) return;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < box.slots.length; i++) {
      const occupant = box.slots[i];
      const target = presetBox && i < presetBox.pokemon.length ? presetBox.pokemon[i] : null;
      if (occupant && occupant.species_id) {
        fragment.appendChild(createOccupiedSlot(occupant, boxId, i, target));
      } else {
        fragment.appendChild(createEmptySlot(boxId, i, target));
      }
    }
    grid.appendChild(fragment);
  }

  function renderBoxContent(boxEl, boxId) {
    const box = DataManager.getBox(boxId);
    if (!box) return;

    const preset = DataManager.getActivePreset();
    const presetBox = preset ? preset.boxes[boxId] : null;
    const grid = boxEl.querySelector('.box-grid');
    const query = getBrowserQuery();

    populateBoxGrid(grid, box, boxId, presetBox);

    attachGridDelegation(grid);
    applyFiltersToBox(boxEl, query);
  }

  function refreshAllRenderedBoxes() {
    for (const id of renderedBoxes) refreshBox(id);
  }

  function refreshBox(boxId) {
    const container = document.getElementById('boxes-container');
    const boxEl = container.querySelector(`.box[data-box-id="${boxId}"]`);
    if (!boxEl) return;

    const box = DataManager.getBox(boxId);
    if (!box) return;

    const header = boxEl.querySelector('.box-header');
    const preset = DataManager.getActivePreset();
    const presetBox = preset ? preset.boxes[boxId] : null;
    header.textContent = box.name;
    if (presetBox) {
      const presetLabel = document.createElement('span');
      presetLabel.className = 'box-header-preset';
      presetLabel.textContent = ` — ${presetBox.title}`;
      header.appendChild(presetLabel);
    }

    const grid = boxEl.querySelector('.box-grid');
    const query = getBrowserQuery();
    grid.innerHTML = '';
    populateBoxGrid(grid, box, boxId, presetBox);

    renderedBoxes.add(boxId);
    applyFiltersToBox(boxEl, query);
  }

  async function renameBox(boxId, headerEl) {
    const box = DataManager.getBox(boxId);
    const oldName = box.name;
    const newName = await UIShared.showPrompt('Rename box:', oldName, { placeholder: 'Box name…' });
    if (!newName || newName === oldName) return;
    headerEl.textContent = newName;
    const preset = DataManager.getActivePreset();
    const presetBox = preset ? preset.boxes[boxId] : null;
    if (presetBox) {
      const presetLabel = document.createElement('span');
      presetLabel.className = 'box-header-preset';
      presetLabel.textContent = ` — ${presetBox.title}`;
      headerEl.appendChild(presetLabel);
    }
    try {
      await DataManager.renameBox(boxId, newName);
    } catch (err) {
      console.error('[Boxes] renameBox failed:', err);
      headerEl.textContent = oldName;
      if (presetBox) {
        const presetLabel = document.createElement('span');
        presetLabel.className = 'box-header-preset';
        presetLabel.textContent = ` — ${presetBox.title}`;
        headerEl.appendChild(presetLabel);
      }
      UIShared.showToast('Rename failed — reverted');
    }
  }

  // ── Preset selector ──────────────────────────────────

  function wirePresetSelector() {
    const gamesetSelect = document.getElementById('preset-gameset');
    const layoutSelect = document.getElementById('preset-layout');

    gamesetSelect.addEventListener('change', async () => {
      const gameSet = gamesetSelect.value;
      if (!gameSet) {
        DataManager.clearPreset();
        layoutSelect.hidden = true;
        renderAllBoxPlaceholders();
        ProgressIndicator.updateProgress();
        return;
      }
      const layouts = await DataManager.loadPresetIndex(gameSet);
      layoutSelect.innerHTML = layouts.map(l =>
        `<option value="${l.id}">${l.name} (${l.boxCount} boxes)</option>`
      ).join('');
      layoutSelect.hidden = false;
      await activatePreset(gameSet, layouts[0].id);
    });

    layoutSelect.addEventListener('change', async () => {
      const gameSet = gamesetSelect.value;
      if (gameSet) await activatePreset(gameSet, layoutSelect.value);
    });
  }

  async function activatePreset(gameSet, layoutId) {
    try {
      await DataManager.loadPreset(gameSet, layoutId);
      renderAllBoxPlaceholders();
      ProgressIndicator.updateProgress();
    } catch (err) {
      console.error('[Boxes] activatePreset failed:', err);
      UIShared.showToast('Failed to load preset');
    }
  }

  // ── Filter bar ──────────────────────────────────────────

  function applyFilters() {
    const query = getBrowserQuery();
    const container = document.getElementById('boxes-container');
    if (!container) return;
    for (const boxId of renderedBoxes) {
      const boxEl = container.querySelector(`.box[data-box-id="${boxId}"]`);
      if (!boxEl) continue;
      for (const slot of boxEl.querySelectorAll('.slot')) {
        applyFilterToSlot(slot, query);
        applySearchToSlot(slot, query.search);
      }
    }
    updateHomeSearchEmptyState(query.search);
  }

  function applyFiltersToBox(boxEl, query = getBrowserQuery()) {
    const slots = boxEl.querySelectorAll('.slot');
    for (const slot of slots) {
      applyFilterToSlot(slot, query);
      applySearchToSlot(slot, query.search);
    }
    updateHomeSearchEmptyState(query.search);
  }

  function getSearchQuery() {
    return getBrowserQuery().search;
  }

  function applySearchToSlot(slot, search) {
    search = (search || '').toLowerCase().trim();
    const isPresetGhost = slot.classList.contains('preset-ghost');
    const isOccupied = slot.classList.contains('occupied');
    const isPlainEmpty = slot.classList.contains('empty') && !isPresetGhost;

    if (!search) {
      slot.classList.remove('dimmed');
      delete slot.dataset.glow;
      return;
    }

    if (isPlainEmpty) {
      slot.classList.add('dimmed');
      delete slot.dataset.glow;
      return;
    }

    const match = UIModels.matchesSearch(slot.dataset.searchText || '', search);
    slot.classList.toggle('dimmed', !match);
    if (!match) delete slot.dataset.glow;
    else slot.dataset.glow = isOccupied ? 'search-owned' : 'search-unowned';
  }

  function updateHomeSearchEmptyState(query) {
    const anchor = document.getElementById('boxes-search-empty-anchor');
    if (!anchor) return;
    query = (query || getSearchQuery()).trim();
    const slots = [...document.querySelectorAll('#boxes-container .slot.occupied, #boxes-container .slot.preset-ghost')];
    const hasVisibleMatch = query
      ? slots.some((slot) => !slot.classList.contains('dimmed'))
      : true;
    anchor.innerHTML = '';
    if (!query || hasVisibleMatch) return;
    const message = document.createElement('div');
    message.className = 'search-empty-state';
    message.textContent = `No Pokemon match "${query}".`;
    anchor.appendChild(message);
  }

  function applyFilterToSlot(slot, activeFilters) {
    if (!activeFilters) activeFilters = getBrowserQuery();
    const speciesId = slot.dataset.speciesId;
    const isEmpty = slot.classList.contains('empty');
    let shouldDim = false;

    if (isEmpty) {
      if (slot.classList.contains('preset-ghost') && !shouldDim) {
        shouldDim = !matchesGhostFilters(slot, activeFilters);
      }
    } else if (speciesId) {
      const entry = DataManager.resolveSpecies(speciesId).entry;
      if (!entry) { shouldDim = true; }
      else {
        if (!AppSelectors.typeMatches(entry.types, activeFilters.type)) shouldDim = true;
        if (!AppSelectors.generationMatches(entry.gen || DataManager.dexNumToGen(entry.num), activeFilters.generation)) shouldDim = true;
        if (activeFilters.games.length > 0) {
          // FR-039 / FR-054: multi-select game filter is AND (intersection). Live lookup via DataManager.
          if (!activeFilters.games.every(game => DataManager.isInGame(speciesId, game))) shouldDim = true;
        }
        if (!shouldDim && activeFilters.flags && activeFilters.flags.length > 0) {
          const liveSlot = DataManager.getSlot(slot.dataset.boxId, parseInt(slot.dataset.slotIdx));
          const state = liveSlot?.state || {};
          const FLAG_STATE_KEYS = {
            shiny: 'shiny', genned: 'genned', gigantamax: 'gigantamax',
            alpha: 'alpha', event_origin: 'event_origin', from_go: 'from_go',
            transferred_to_champions: 'transferred_to_champions', ev_guesstimate: 'ev_guesstimate',
          };
          if (!activeFilters.flags.every(key => !!state[FLAG_STATE_KEYS[key] ?? key])) shouldDim = true;
        }
      }
    } else {
      if (activeFilters.type) shouldDim = true;
      if (activeFilters.generation) shouldDim = true;
      if (activeFilters.games.length > 0) shouldDim = true;
      if (activeFilters.flags && activeFilters.flags.length > 0) shouldDim = true;
    }

    slot.classList.toggle('slot-dimmed', shouldDim);
  }

  function matchesGhostFilters(slot, activeFilters = getBrowserQuery()) {
    const tooltipEl = slot.querySelector('.tooltip');
    if (!tooltipEl) return true;
    const name = tooltipEl.textContent;
    const resolved = DataManager.resolveSpecies(name);
    const entry = resolved.entry;
    if (!entry) return true;

    if (!AppSelectors.typeMatches(entry.types, activeFilters.type)) return false;
    if (!AppSelectors.generationMatches(entry.gen || DataManager.dexNumToGen(entry.num), activeFilters.generation)) return false;
    if (activeFilters.games.length > 0) {
      const targetSlug = resolved.slug || entry.slug;
      // FR-039 / FR-054: multi-select game filter is AND (intersection). Live lookup via DataManager.
      if (!activeFilters.games.every(game => DataManager.isInGame(targetSlug, game))) return false;
    }
    return true;
  }

  // ── IV badge helper ───────────────────────────────────
  const IV_STAT_KEYS = DomainMappers.STAT_KEYS;

  function getIvBadgeLabel(ivs, nature) {
    if (!ivs || typeof ivs !== 'object') return null;
    const defined = IV_STAT_KEYS.filter(k => typeof ivs[k] === 'number');
    if (defined.length === 0) return null;

    const perfect = defined.filter(k => ivs[k] === 31 || ivs[k] === 0);
    const imperfect = defined.filter(k => ivs[k] !== 31 && ivs[k] !== 0);

    // 6 IV: all 6 stats defined and each is 31 or 0
    if (defined.length === 6 && perfect.length === 6) return '6';

    // 5P: exactly 5 perfect, the imperfect stat is the nature's minus stat
    if (perfect.length === 5 && imperfect.length === 1) {
      const effect = DataManager.getNatureEffect(nature);
      if (effect?.minus && imperfect[0] === effect.minus) return '5P';
    }
    // 5P alt: only 5 IVs defined (6th omitted = don't care), the missing stat is nature's minus
    if (defined.length === 5 && perfect.length === 5) {
      const missing = IV_STAT_KEYS.find(k => typeof ivs[k] !== 'number');
      const effect = DataManager.getNatureEffect(nature);
      if (effect?.minus && missing === effect.minus) return '5P';
    }

    // 1–5: count of good IVs (not already covered by 5P)
    if (perfect.length >= 1) return String(perfect.length);

    return null;
  }

  // ── State-aware sprite resolution ─────────────────────
  const GENDER_SPRITE_SPECIES = SpeciesResolver.GENDER_SPRITE_SPECIES;

  /**
   * Prepend state-aware sprite slugs to a resolved object's candidates.
   * Driven by FormMetadata registry — no per-dimension if-blocks.
   */
  function applyStatefulSprites(resolved, state) {
    if (!state || !resolved) return resolved;
    const base = resolved.spriteCandidates || [resolved.slug];
    const prepend = FormMetadata.buildSpriteCandidates(state, resolved.slug);
    if (prepend.length) {
      resolved.spriteCandidates = [...new Set([...prepend, ...base])];
    }
    return resolved;
  }

  /**
   * Build tooltip suffix from state metadata.
   * Driven by FormMetadata registry — no hardcoded keys or special cases.
   */
  function buildMetadataSuffix(state, resolvedSlug) {
    return FormMetadata.buildTooltipSuffix(state, resolvedSlug);
  }

  // ── Delegated grid event handlers ─────────────────────

  /**
   * Attach click and contextmenu handlers via event delegation on a .box-grid.
   * Reads slot state from DataManager at event time (no stale closures).
   * Called once per grid; idempotent via data attribute guard.
   */
  function attachGridDelegation(grid) {
    if (grid.dataset.delegated) return;
    grid.dataset.delegated = '1';

    grid.addEventListener('click', async (e) => {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      const boxId = Number(slot.dataset.boxId);
      const slotIdx = Number(slot.dataset.slotIdx);

      // Selection mode (Ctrl/Meta/Shift click)
      const inSelectionMode = SlotSelection.size() > 0;
      if (e.ctrlKey || e.metaKey || inSelectionMode) {
        if (e.shiftKey && SlotSelection.getLastClicked()) {
          SlotSelection.addRange(boxId, slotIdx);
        } else {
          SlotSelection.toggle(boxId, slotIdx);
        }
        return;
      }
      if (e.shiftKey) {
        SlotSelection.toggle(boxId, slotIdx);
        return;
      }

      // Occupied slot → open viewer
      if (slot.classList.contains('occupied')) {
        const occupant = DataManager.getSlot(boxId, slotIdx);
        if (!occupant) return;
        const speciesId = slot.dataset.speciesId;
        const resolved = DataManager.resolveSpecies(speciesId);
        const linkedBuildId = typeof occupant.target_build_id === 'string' ? occupant.target_build_id : null;
        PokemonViewer.openPokemonViewer({
          slug: resolved.slug || speciesId,
          boxId,
          slotIdx,
          build: linkedBuildId ? DataManager.getBuild(linkedBuildId) : null,
        });
        return;
      }

      // Empty slot with preset → place preset species
      if (slot.dataset.presetPid) {
        // Read pre-parsed preset attributes (set at render time by createEmptySlot)
        const cleanPid = slot.dataset.presetSpeciesKey || slot.dataset.presetPid;
        const resolved = DataManager.resolveSpecies(cleanPid);
        const slug = resolved.matchedDirect ? resolved.slug : cleanPid;
        placementTarget = { boxId, slotIdx };

        // Build initial state from preset requires + defaults (data-driven, no per-field if's)
        const placementState = {};
        try {
          if (slot.dataset.presetDefaults) Object.assign(placementState, JSON.parse(slot.dataset.presetDefaults));
          if (slot.dataset.presetRequires) Object.assign(placementState, JSON.parse(slot.dataset.presetRequires));
        } catch (_) { /* corrupted dataset, ignore */ }

        // Extract form from preset PID (e.g., "vivillon-icy-snow" → species "vivillon", form info in slug)
        if (resolved.entry?.formeOrder || resolved.entry?.otherFormes) {
          const resolvedForm = resolved.slug;
          const baseSlug = resolved.entry?.slug || resolved.entry?.baseSpecies?.toLowerCase();
          if (resolvedForm && baseSlug && resolvedForm !== baseSlug) {
            placementState.species = resolvedForm;
          }
        }
        try {
          await placeSlot(slug, null, Object.keys(placementState).length ? placementState : null);
        } catch (err) {
          console.error('[Boxes] preset placement failed:', err);
          closePlacement();
        }
        return;
      }

      // Empty slot without preset → open placement search
      openPlacement(boxId, slotIdx, null);
    });

    grid.addEventListener('contextmenu', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      e.preventDefault();
      const boxId = Number(slot.dataset.boxId);
      const slotIdx = Number(slot.dataset.slotIdx);

      if (slot.classList.contains('occupied')) {
        const occupant = DataManager.getSlot(boxId, slotIdx);
        if (occupant) showSlotActions(boxId, slotIdx, occupant, e);
        return;
      }

      // Empty slot right-click — use speciesKey for search, pass requires/defaults for placement
      const presetPid = slot.dataset.presetPid || null;
      const presetSpeciesKey = slot.dataset.presetSpeciesKey || presetPid;
      if (clipboard?.items?.length) {
        showPasteMenu(boxId, slotIdx, e, presetSpeciesKey);
      } else if (presetPid) {
        openPlacement(boxId, slotIdx, presetSpeciesKey);
      } else {
        openPlacement(boxId, slotIdx, null);
      }
    });
  }

  // ── Slot creation ─────────────────────────────────────

  function createOccupiedSlot(occupant, boxId, slotIdx, presetTarget) {
    const rawId = occupant.species_id;
    const presetPid = presetTarget?.pid || presetTarget || null;

    // species_id is now form-preserving (e.g. "floette-yellow" not "floette").
    // Legacy fallback: old data may have collapsed species_id — use preset to recover form.
    let resolved = DataManager.resolveSpecies(rawId);
    if (presetPid && resolved.spriteCandidates?.[0] === resolved.slug) {
      const cleanPid = presetPid.replace(/--.*$/, '');
      const presetResolved = DataManager.resolveSpecies(cleanPid);
      if (presetResolved.slug === resolved.slug) {
        resolved = presetResolved;
      }
    }

    const entry = resolved.entry;
    const slug = resolved.slug || String(rawId);
    const name = resolved.name || slug;

    const slot = document.createElement('div');
    slot.className = 'slot occupied';
    slot.dataset.boxId = boxId;
    slot.dataset.slotIdx = slotIdx;
    slot.dataset.speciesId = slug;
    // Search text: include display name, slug, and entry name for broad matching
    slot.dataset.searchText = [name, slug, entry?.name].filter(Boolean).join(' ').toLowerCase();

    const builds = entry ? DataManager.getCompetitiveSets(entry.num) : [];
    if (builds.length) slot.classList.add('has-builds');

    if (presetTarget) {
      const presetResult = DataManager.slotMatchesPreset(occupant, presetTarget);
      slot.dataset.preset = presetResult ? 'match' : 'mismatch';
    }

    const state = occupant.state || {};
    if (state.genned) {
      slot.classList.add('is-genned');
      const scanlines = document.createElement('div');
      scanlines.className = 'genned-scanlines';
      slot.appendChild(scanlines);
    }
    applyStatefulSprites(resolved, state);
    const dotOpts = UIModels.buildEntryDecorations({
      slug,
      inChampions: !!state.transferred_to_champions,
      transferredToChampions: !!state.transferred_to_champions,
      eventOrigin: !!state.event_origin,
      fromGo: !!state.from_go,
      language: state.language,
      shiny: !!state.shiny,
      genned: !!state.genned,
      gigantamax: !!state.gigantamax,
      alpha: !!state.alpha,
    }, { slug, inChampions: !!state.transferred_to_champions }).dotOptions;
    const spriteFragment = document.createElement('div');
    spriteFragment.innerHTML = UIShared.spriteWithDotsHtml(resolved, name, { width: 40, height: 40, loading: 'lazy' }, dotOpts);
    while (spriteFragment.firstChild) slot.appendChild(spriteFragment.firstChild);

    // IV badge (upper-left): "6", "5P", or count of good IVs (1-5)
    const ivLabel = getIvBadgeLabel(state.ivs, state.nature);
    if (ivLabel) {
      const ivBadge = document.createElement('span');
      ivBadge.className = 'slot-iv-badge';
      ivBadge.textContent = ivLabel;
      const ivTitle = ivLabel === '6' ? '6 Perfect IVs'
        : ivLabel === '5P' ? '5 Perfect IVs (optimized)'
        : `${ivLabel} Good IV${ivLabel === '1' ? '' : 's'}`;
      ivBadge.title = ivTitle;
      slot.appendChild(ivBadge);
    }

    // Egg move badge (upper-right): count with egg emoji
    const linkedBuild = occupant.target_build_id ? DataManager.getBuild(occupant.target_build_id) : null;
    const rawEggMoves = linkedBuild?.egg_moves?.length ? linkedBuild.egg_moves : state.egg_moves;
    const eggMoves = (rawEggMoves || []).filter(Boolean);
    if (eggMoves.length > 0) {
      const eggBadge = document.createElement('span');
      eggBadge.className = 'slot-egg-badge';
      eggBadge.textContent = `${eggMoves.length}`;
      eggBadge.title = `${eggMoves.length} Egg Move${eggMoves.length > 1 ? 's' : ''}`;
      slot.appendChild(eggBadge);
    }

    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip';
    // Tooltip shows the template's spec if present, not the instance's full state.
    // This keeps ghost and occupied tooltips consistent — both show what the template defines.
    const tooltipState = presetTarget?.requires || presetTarget?.defaults
      ? { ...(presetTarget.defaults || {}), ...(presetTarget.requires || {}) }
      : null;
    tooltip.textContent = name + (tooltipState ? FormMetadata.buildTooltipSuffix(tooltipState, resolved.slug) : '');
    slot.appendChild(tooltip);

    // FR-2.4: drag & drop between slots
    attachDragSource(slot, boxId, slotIdx);
    attachDropTarget(slot, boxId, slotIdx);

    UIShared.applyEntryDecorations(slot, state);

    return slot;
  }

  function createEmptySlot(boxId, slotIdx, presetTarget) {
    const slot = document.createElement('div');
    slot.className = 'slot empty';
    slot.dataset.boxId = boxId;
    slot.dataset.slotIdx = slotIdx;

    const presetPid = presetTarget?.pid || presetTarget || null;

    // FR-2.3a/b empty-slot semantics:
    //   • Templated (preset ghost): click → open reference viewer for the expected species.
    //     Right-click / long-press still opens placement so users can actually place a mon.
    //   • Untemplated: click → open placement search (current behaviour preserved).
    // Store parsed preset info as data attributes for delegated event handlers.
    // requires + defaults are serialized as JSON so the click handler can seed
    // placementState generically — no per-dimension if checks.
    if (presetTarget?.pid) {
      slot.dataset.presetPid = presetTarget.pid;
      slot.dataset.presetSpeciesKey = presetTarget.speciesKey || '';
      if (presetTarget.requires && Object.keys(presetTarget.requires).length) {
        slot.dataset.presetRequires = JSON.stringify(presetTarget.requires);
      }
      if (presetTarget.defaults && Object.keys(presetTarget.defaults).length) {
        slot.dataset.presetDefaults = JSON.stringify(presetTarget.defaults);
      }
    }

    if (presetTarget?.pid) {
      const resolved = DataManager.resolveSpecies(presetTarget.speciesKey || presetTarget.pid);
      const slug = resolved.slug || DataManager.normalizePresetSlug(presetTarget.speciesKey || presetTarget.pid);
      const name = presetTarget.species || resolved.name || (presetTarget.pid).replace(/-/g, ' ');

      // Ghost sprite state: union of requires + defaults (data-driven, no per-field if's)
      const ghostState = { ...(presetTarget.defaults || {}), ...(presetTarget.requires || {}) };
      applyStatefulSprites(resolved, ghostState);

      slot.classList.add('preset-ghost');
      slot.dataset.speciesId = slug;
      slot.dataset.searchText = [name, slug, presetTarget.pid].filter(Boolean).join(' ').toLowerCase();

      // Owned-elsewhere: yellow if a matching Pokémon exists in inventory but in a different slot.
      // Uses the same slotMatchesPreset function as occupied-slot matching — one source of truth.
      const ownedCheckSlug = resolved.matchedDirect
        ? slug
        : SpeciesResolver.normalizeHyphenSlug(presetTarget.speciesKey || presetTarget.pid);
      const candidates = DataManager.getSlotsBySpecies(ownedCheckSlug);
      const ownedCount = candidates.filter(pos => {
        const inv = DataManager.getSlot(pos.box, pos.slot);
        return inv && DataManager.slotMatchesPreset(inv, presetTarget);
      }).length;
      if (ownedCount > 0) {
        slot.dataset.preset = 'owned-elsewhere';
      }

      const spriteFragment = document.createElement('div');
      spriteFragment.innerHTML = UIShared.spriteWithDotsHtml(resolved, name,
        { cls: 'ghost-sprite', width: 40, height: 40, loading: 'lazy' },
        { slug });
      while (spriteFragment.firstChild) slot.appendChild(spriteFragment.firstChild);

      const tooltip = document.createElement('span');
      tooltip.className = 'tooltip';
      tooltip.textContent = name + FormMetadata.buildTooltipSuffix(ghostState, slug);
      slot.appendChild(tooltip);
    }

    // FR-2.4: empty slot is also a valid drop target
    attachDropTarget(slot, boxId, slotIdx);

    return slot;
  }

  // ── Drag & drop (FR-2.4) ──────────────────────────────

  function attachDragSource(slot, boxId, slotIdx) {
    slot.draggable = true;
    slot.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      // If this slot is part of a multi-selection, carry the whole selection
      if (SlotSelection.has(boxId, slotIdx) && SlotSelection.size() > 1) {
        const entries = SlotSelection.entries();
        e.dataTransfer.setData('application/x-pc-slots', JSON.stringify(entries));
        e.dataTransfer.setData('text/plain', `${entries.length} Pokémon`);
      } else {
        e.dataTransfer.setData('application/x-pc-slot', JSON.stringify({ boxId, slotIdx }));
        e.dataTransfer.setData('text/plain', `box ${boxId + 1} slot ${slotIdx + 1}`);
      }
      slot.classList.add('dragging');
    });
    slot.addEventListener('dragend', () => {
      slot.classList.remove('dragging');
      document.querySelectorAll('.slot.drop-target').forEach(el => el.classList.remove('drop-target'));
    });
  }

  function attachDropTarget(slot, boxId, slotIdx) {
    slot.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('application/x-pc-slot') &&
          !e.dataTransfer.types.includes('application/x-pc-slots')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      slot.classList.add('drop-target');
    });
    slot.addEventListener('dragleave', () => {
      slot.classList.remove('drop-target');
    });
    slot.addEventListener('drop', (e) => {
      slot.classList.remove('drop-target');
      e.preventDefault();

      // Batch move (multi-select drag)
      const rawMulti = e.dataTransfer.getData('application/x-pc-slots');
      if (rawMulti) {
        let entries;
        try { entries = JSON.parse(rawMulti); } catch { return; }
        DataManager.batchMoveSlots(entries, boxId, slotIdx).then((affected) => {
          SlotSelection.clear();
          for (const id of affected) refreshBox(id);
          refreshBox(boxId);
          ProgressIndicator.updateProgress();
        }).catch((err) => {
          console.error('batchMoveSlots failed', err);
          UIShared.showToast('Batch move failed: ' + (err.message || err));
        });
        return;
      }

      // Single move
      const raw = e.dataTransfer.getData('application/x-pc-slot');
      if (!raw) return;
      let src;
      try { src = JSON.parse(raw); } catch { return; }
      if (src.boxId === boxId && src.slotIdx === slotIdx) return;
      DataManager.moveSlot(src.boxId, src.slotIdx, boxId, slotIdx).then(() => {
        refreshBox(src.boxId);
        refreshBox(boxId);
        ProgressIndicator.updateProgress();
      }).catch((err) => {
        console.error('moveSlot failed', err);
        UIShared.showToast('Move failed: ' + (err.message || err));
      });
    });
  }

  // ── Placement flow ────────────────────────────────────

  let placementTarget = null;
  let placementDebounce = null;

  function openPlacement(boxId, slotIdx, presetTarget) {
    placementTarget = { boxId, slotIdx };
    const bar = document.getElementById('placement-bar');
    bar.hidden = false;
    const input = document.getElementById('placement-search');
    input.value = '';
    input.focus();
    document.getElementById('placement-results').innerHTML = '';

    if (presetTarget) {
      const resolved = DataManager.resolveSpecies(presetTarget);
      input.value = resolved.name || presetTarget.replace(/-/g, ' ');
      searchPlacement(input.value);
    }

    input.oninput = () => {
      clearTimeout(placementDebounce);
      placementDebounce = setTimeout(() => searchPlacement(input.value), PLACEMENT_SEARCH_DEBOUNCE_MS);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = document.querySelector('#placement-results .placement-result');
        if (first) first.click();
      } else if (e.key === 'Escape') {
        closePlacement();
      }
    };
    document.getElementById('placement-cancel').onclick = closePlacement;
  }

  function closePlacement() {
    placementTarget = null;
    const bar = document.getElementById('placement-bar');
    bar.hidden = true;
    document.getElementById('placement-search').value = '';
    document.getElementById('placement-results').innerHTML = '';
  }

  function searchPlacement(query) {
    const results = DataManager.searchSpecies(query);
    const container = document.getElementById('placement-results');
    if (!results.length) {
      container.innerHTML = query.length > 0 ? '<div class="placement-empty">No matches</div>' : '';
      return;
    }
    container.innerHTML = results.map(r => `
      <div class="placement-result" data-slug="${r.slug}">
        ${UIShared.spriteImgHtml(r.slug, r.name, { width: 32, height: 32, loading: 'lazy' })}
        <span>${r.name}</span>
        <span class="placement-dex">#${String(r.num).padStart(4, '0')}</span>
      </div>
    `).join('');

    for (const el of container.querySelectorAll('.placement-result')) {
      el.addEventListener('click', async () => {
        if (!placementTarget) return;
        const slug = el.dataset.slug;
        const entry = DataManager.getPokedexEntry(slug);
        const templates = entry ? (DataManager.getCompetitiveSets(entry.id) || []) : [];

        // Species that need extra metadata before placement — derived from FormMetadata registry
        const metaControls = FormMetadata.getPlacementControls(slug);

        if (metaControls.length > 0 || templates.length > 0) {
          showTemplatePicker(slug, templates, { metaControls });
        } else {
          await placeSlot(slug, null);
        }
      });
    }
  }

  /**
   * After a species is picked, show a picker of known competitive templates.
   * Picking a template seeds state + links template; "Blank" places an empty mon.
   * metaControls: [{key, type, options, labels?}] from FormMetadata.getPlacementControls
   */
  function showTemplatePicker(slug, templates, opts = {}) {
    const existing = document.querySelector('.template-picker');
    if (existing) existing.remove();

    const { metaControls = [] } = opts;

    const STAT_ABBR = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
    function buildEvLine(t) {
      const system = DomainMappers.getPreferredEvSystem(t, t.ev_system || 'classic');
      const evs = DomainMappers.getEvsForSystem(t, system) || {};
      const parts = Object.entries(STAT_ABBR)
        .filter(([k]) => Number(evs[k]) > 0)
        .map(([k]) => `${evs[k]} ${STAT_ABBR[k]}`);
      const isChampions = system === 'champions';
      const badge = isChampions
        ? '<span class="tp-ev-badge tp-ev-badge--sp">SP</span>'
        : '<span class="tp-ev-badge tp-ev-badge--ev">EV</span>';
      const spread = parts.length ? parts.join(' / ') : '—';
      return `${badge}<span class="template-picker-evs">${spread}</span>`;
    }

    const picker = document.createElement('div');
    picker.className = 'template-picker';

    // Form metadata selectors — generated from FormMetadata registry
    let formHtml = '';
    for (const ctrl of metaControls) {
      if (ctrl.type === 'toggle') {
        const label = ctrl.key.charAt(0).toUpperCase() + ctrl.key.slice(1);
        formHtml += `<div class="form-meta-row">
          <label>${label}:</label>
          ${ctrl.options.map((opt, i) => {
            const lbl = ctrl.labels ? ctrl.labels[i] : opt;
            const sel = i === 0 ? ' selected' : '';
            return `<button class="gender-btn${sel}" data-gender="${opt}">${lbl}</button>`;
          }).join('')}
        </div>`;
      } else if (ctrl.type === 'select') {
        const label = ctrl.key.charAt(0).toUpperCase() + ctrl.key.slice(1);
        formHtml += `<div class="form-meta-row">
          <label>${label}:</label>
          <select class="form-meta-select" data-key="${ctrl.key}">
            ${ctrl.options.map(o => `<option value="${o}">${o}</option>`).join('')}
          </select>
        </div>`;
      }
    }

    picker.innerHTML = `
      <div class="template-picker-title">${templates.length ? 'Seed with a known build?' : 'Place ' + (DataManager.resolveSpecies(slug).name || slug)}</div>
      ${formHtml}
      ${templates.map((t, i) => `
        <button class="template-picker-option" data-idx="${i}">
          <span class="template-picker-nature">${t.nature || '—'}</span>
          <span class="template-picker-ability">${t.ability || ''}</span>
          ${t.item ? `<span class="template-picker-item">@ ${t.item}</span>` : ''}
          <span class="template-picker-ev-line">${buildEvLine(t)}</span>
        </button>
      `).join('')}
      <button class="template-picker-option template-picker-blank" data-idx="-1">
        ${templates.length ? 'Blank (no build)' : 'Place'}
      </button>
    `;
    // Ensure a positioned ancestor for the absolute-positioned picker
    const bar = document.getElementById('placement-bar');
    if (bar && getComputedStyle(bar).position === 'static') {
      bar.style.position = 'relative';
    }
    bar.appendChild(picker);

    // Gender toggle behavior
    for (const btn of picker.querySelectorAll('.gender-btn')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        picker.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    }

    /** Collect form metadata from the picker UI */
    function getFormMeta() {
      const meta = {};
      const genderBtn = picker.querySelector('.gender-btn.selected');
      if (genderBtn) meta.gender = genderBtn.dataset.gender;
      for (const sel of picker.querySelectorAll('.form-meta-select')) {
        meta[sel.dataset.key] = sel.value;
      }
      return Object.keys(meta).length ? meta : null;
    }

    picker.addEventListener('click', async (e) => {
      const btn = e.target.closest('.template-picker-option');
      if (!btn) return;
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      const formMeta = getFormMeta();
      if (idx < 0) {
        await placeSlot(slug, null, formMeta);
      } else {
        const t = templates[idx];
        const state = {
          nature: t.nature || null,
          ability: t.ability || null,
          item: t.item || null,
          tera_type: t.tera_type || null,
          moves: Array.isArray(t.moves) ? [...t.moves] : [],
          evs: t.evs ? { ...t.evs } : null,
          ivs: t.ivs ? { ...t.ivs } : null,
          ev_system: t.ev_system || null,
          ...formMeta,
        };
        await placeSlot(slug, t.id, state);
      }
      picker.remove();
    });
  }

  async function placeSlot(slug, templateId, state = null) {
    if (!placementTarget) return;
    const { boxId, slotIdx } = placementTarget;
    try {
      await DataManager.placeInSlot(boxId, slotIdx, slug, templateId, state);
    } catch (err) {
      console.error('[Boxes] placeSlot failed:', err);
      UIShared.showToast('Failed to place Pokémon');
    }
    closePlacement();
    refreshBox(boxId);
    ProgressIndicator.updateProgress();
  }

  // ── Slot actions (remove/move) ────────────────────────

  function showSlotActions(boxId, slotIdx, occupant, event) {
    const existing = document.querySelector('.slot-action-menu');
    if (existing) existing.remove();

    const name = DataManager.resolveSpecies(occupant.species_id).name || occupant.species_id;

    const isTransferred = !!(occupant.state?.transferred_to_champions);
    const isEventPokemon = !!(occupant.state?.event_origin);
    const isFromGo = !!(occupant.state?.from_go);
    const transferLabel = isTransferred ? 'Unmark transfer to Champions' : 'Mark as transferred to Champions';
    const eventLabel = isEventPokemon ? 'Unmark event / giveaway' : 'Mark as event / giveaway';
    const goLabel = isFromGo ? 'Unmark Pokémon GO origin' : 'Mark as from Pokémon GO';

    const menu = document.createElement('div');
    menu.className = 'slot-action-menu';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.innerHTML = `
      <div class="slot-action-title">${name}</div>
      <button class="slot-action-btn" data-action="edit">Edit details...</button>
      <button class="slot-action-btn" data-action="copy">Copy</button>
      <button class="slot-action-btn" data-action="cut">Cut</button>
      <button class="slot-action-btn" data-action="transfer">${transferLabel}</button>
      <button class="slot-action-btn" data-action="event">${eventLabel}</button>
      <button class="slot-action-btn" data-action="go">${goLabel}</button>
      <button class="slot-action-btn" data-action="remove">Remove from slot</button>
      <button class="slot-action-btn" data-action="move">Move to another slot...</button>
    `;

    document.body.appendChild(menu);

    menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
      menu.remove();
      PokemonViewer.openInstanceEditor(boxId, slotIdx, {
        onSaved: () => {
          refreshAllRenderedBoxes();
          ProgressIndicator.updateProgress();
        },
      });
    });

    menu.querySelector('[data-action="copy"]').addEventListener('click', () => {
      clipboard = { items: [snapshotOccupant(occupant)], isCut: false, sources: null };
      menu.remove();
    });

    menu.querySelector('[data-action="cut"]').addEventListener('click', () => {
      clipboard = { items: [snapshotOccupant(occupant)], isCut: true, sources: [{ boxId, slotIdx, instanceId: occupant.state?.id || null }] };
      menu.remove();
    });

    menu.querySelector('[data-action="transfer"]').addEventListener('click', async () => {
      await DataManager.updateSlotIdentityField(boxId, slotIdx, 'transferred_to_champions', !isTransferred);
      menu.remove();
      refreshBox(boxId);
    });

    menu.querySelector('[data-action="event"]').addEventListener('click', async () => {
      await DataManager.updateSlotIdentityField(boxId, slotIdx, 'event_origin', !isEventPokemon);
      menu.remove();
      refreshBox(boxId);
    });

    menu.querySelector('[data-action="go"]').addEventListener('click', async () => {
      await DataManager.updateSlotIdentityField(boxId, slotIdx, 'from_go', !isFromGo);
      menu.remove();
      refreshBox(boxId);
    });

    menu.querySelector('[data-action="remove"]').addEventListener('click', async () => {
      await DataManager.removeFromSlot(boxId, slotIdx);
      menu.remove();
      refreshBox(boxId);
      ProgressIndicator.updateProgress();
    });

    menu.querySelector('[data-action="move"]').addEventListener('click', () => {
      menu.remove();
      promptMoveSlot(boxId, slotIdx, occupant);
    });

    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  function showPasteMenu(boxId, slotIdx, event, presetTarget) {
    const existing = document.querySelector('.slot-action-menu');
    if (existing) existing.remove();
    if (!clipboard?.items?.length) return;

    const menu = document.createElement('div');
    menu.className = 'slot-action-menu';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';

    let buttonsHtml = `<div class="slot-action-title">Slot Actions</div>`;
    const cutLabel = clipboard.isCut ? ' (move)' : '';
    if (clipboard.items.length === 1) {
      const name = DataManager.resolveSpecies(clipboard.items[0].species_id).name || clipboard.items[0].species_id;
      buttonsHtml += `<button class="slot-action-btn" data-action="paste">📋 Paste ${name}${cutLabel}</button>`;
    } else {
      buttonsHtml += `<button class="slot-action-btn" data-action="paste-multi">📋 Paste ${clipboard.items.length} Pokémon here${cutLabel}</button>`;
    }
    buttonsHtml += `<button class="slot-action-btn" data-action="place">${presetTarget ? '👻 Place from template' : '🔍 Search & place...'}</button>`;
    buttonsHtml += `<button class="slot-action-btn" data-action="clear-clipboard">✕ Clear clipboard</button>`;
    menu.innerHTML = buttonsHtml;

    document.body.appendChild(menu);

    if (clipboard.items.length === 1) {
      menu.querySelector('[data-action="paste"]').addEventListener('click', async () => {
        menu.remove();
        const item = clipboard.items[0];
        const newState = structuredClone(item.state);
        newState.id = undefined;
        newState.kind = 'instance';
        await DataManager.placeInSlot(boxId, slotIdx, item.species_id, item.target_build_id, newState);
        if (clipboard.isCut && clipboard.sources?.length) {
          const src = clipboard.sources[0];
          if (src.boxId !== boxId || src.slotIdx !== slotIdx) {
            const current = DataManager.getSlot(src.boxId, src.slotIdx);
            if (current && (!src.instanceId || current.state?.id === src.instanceId)) {
              await DataManager.removeFromSlot(src.boxId, src.slotIdx);
              refreshBox(src.boxId);
            }
          }
          clipboard = null;
        }
        refreshBox(boxId);
        ProgressIndicator.updateProgress();
      });
    }

    if (clipboard.items.length > 1) {
      menu.querySelector('[data-action="paste-multi"]').addEventListener('click', async () => {
        menu.remove();
        const slotsPerBox = SLOTS_PER_BOX;
        const boxCount = DataManager.getBoxCount();
        let b = boxId, s = slotIdx;
        const batchEntries = [];
        const placedIndices = new Set();
        for (let i = 0; i < clipboard.items.length; i++) {
          if (b >= boxCount) break;
          const slot = DataManager.getSlot(b, s);
          if (!slot || !slot.species_id) {
            const item = clipboard.items[i];
            const newState = structuredClone(item.state);
            newState.id = undefined;
            newState.kind = 'instance';
            batchEntries.push({ boxId: b, slotIdx: s, speciesId: item.species_id, buildId: item.target_build_id, state: newState });
            placedIndices.add(i);
          }
          s++;
          if (s >= slotsPerBox) { s = 0; b++; }
        }
        const affectedBoxes = new Set();
        if (batchEntries.length) {
          const boxes = await DataManager.batchPlaceSlots(batchEntries);
          for (const id of boxes) affectedBoxes.add(id);
        }
        if (clipboard.isCut && clipboard.sources?.length) {
          const cutEntries = [];
          for (let i = 0; i < clipboard.sources.length; i++) {
            if (!placedIndices.has(i)) continue;
            const src = clipboard.sources[i];
            const current = DataManager.getSlot(src.boxId, src.slotIdx);
            if (current && (!src.instanceId || current.state?.id === src.instanceId)) {
              cutEntries.push({ boxId: src.boxId, slotIdx: src.slotIdx });
            }
          }
          if (cutEntries.length) {
            const cutBoxes = await DataManager.batchClearSlots(cutEntries);
            for (const id of cutBoxes) affectedBoxes.add(id);
          }
          if (clipboard.sources.length > placedIndices.size) {
            UIShared.showToast(`${clipboard.sources.length - placedIndices.size} Pokémon not moved (destination occupied)`, 'warning');
          }
        }
        clipboard = null;
        for (const id of affectedBoxes) refreshBox(id);
        ProgressIndicator.updateProgress();
        UIShared.showToast(`Pasted ${batchEntries.length} Pokémon`);
      });
    }

    menu.querySelector('[data-action="place"]').addEventListener('click', async () => {
      menu.remove();
      if (presetTarget) {
        const resolved = DataManager.resolveSpecies(presetTarget);
        const slug = resolved.slug || DataManager.normalizePresetSlug(presetTarget);
        placementTarget = { boxId, slotIdx };
        // Seed placement state from ghost slot's requires/defaults if available
        const slotEl = document.querySelector(`.slot[data-box-id='${boxId}'][data-slot-idx='${slotIdx}']`);
        let placementState = null;
        if (slotEl) {
          try {
            const req = slotEl.dataset.presetRequires ? JSON.parse(slotEl.dataset.presetRequires) : {};
            const def = slotEl.dataset.presetDefaults ? JSON.parse(slotEl.dataset.presetDefaults) : {};
            placementState = { ...def, ...req };
            if (!Object.keys(placementState).length) placementState = null;
          } catch (_) { /* ignore malformed JSON */ }
        }
        await placeSlot(slug, null, placementState);
      } else {
        openPlacement(boxId, slotIdx, null);
      }
    });

    menu.querySelector('[data-action="clear-clipboard"]').addEventListener('click', () => {
      clipboard = null;
      menu.remove();
    });

    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  async function promptMoveSlot(fromBox, fromSlot, occupant) {
    const name = DataManager.resolveSpecies(occupant.species_id).name || occupant.species_id;
    const toBox = await UIShared.showPrompt(`Move ${name} to which box? (1-200)`, String(fromBox + 1), { placeholder: '1–200' });
    if (!toBox) return;
    const toSlot = await UIShared.showPrompt(`Which slot in Box ${toBox}? (1-${SLOTS_PER_BOX})`, '1', { placeholder: `1–${SLOTS_PER_BOX}` });
    if (!toSlot) return;

    const targetBox = parseInt(toBox, 10) - 1;
    const targetSlot = parseInt(toSlot, 10) - 1;
    if (isNaN(targetBox) || isNaN(targetSlot) || targetBox < 0 || targetBox >= 200 || targetSlot < 0 || targetSlot >= SLOTS_PER_BOX) {
      UIShared.showToast('Invalid box or slot number.');
      return;
    }

    DataManager.moveSlot(fromBox, fromSlot, targetBox, targetSlot).then(() => {
      refreshBox(fromBox);
      refreshBox(targetBox);
      ProgressIndicator.updateProgress();
    }).catch(err => {
      console.error('[Boxes] moveSlot failed:', err);
      UIShared.showToast('Move failed — check console');
    });
  }

  return { mount, unmount };
})();

export { BoxesView };
