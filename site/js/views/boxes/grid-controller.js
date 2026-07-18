import { DataManager } from '../../data.js';
import { PokemonViewer } from '../../pokemon-viewer.js';
import { SlotSelection } from '../../slot-selection.js';
import { AppSelectors } from '../../state/app-selectors.js';
import { UIModels } from '../../ui-models.js';
import { Feedback } from '../../ui/feedback.js';

const SLOTS_PER_BOX = 30;

/** @param {{slotRenderer: ReturnType<import('./slot-renderer.js').createSlotRenderer>, slotActions: ReturnType<import('./slot-actions-controller.js').createSlotActionsController>, placement: ReturnType<import('./placement-controller.js').createPlacementController>, getBrowserQuery: () => import('../../types/contracts.js').BrowserQuery}} options */
export function createGridController({ slotRenderer, slotActions, placement, getBrowserQuery }) {
  /** @type {HTMLElement|null} */
  let containerEl = null;
  /** @type {IntersectionObserver|null} */
  let observer = null;
  /** @type {Set<number>} */
  const renderedBoxes = new Set();
  let rovingSlot = { boxId: 0, slotIdx: 0 };

  /** @param {MouseEvent} event */
  function handleBoxHeaderEvent(event) {
    const header = event.target instanceof Element ? event.target.closest('.box-header') : null;
    if (!header) return;
    const container = document.getElementById('boxes-container');
    if (!container || !container.contains(header)) return;
    const boxEl = header.closest('.box');
    if (!(boxEl instanceof HTMLElement) || !(header instanceof HTMLElement)) return;
    const boxId = Number.parseInt(boxEl.dataset.boxId ?? '', 10);
    if (Number.isNaN(boxId)) return;
    if (event.type === 'contextmenu') {
      event.preventDefault();
    }
    renameBox(boxId, header);
  }

  // ── Lazy rendering with IntersectionObserver ──────────

  /** @param {Element|null} boxEl @param {number} boxId */
  function ensureBoxRendered(boxEl, boxId) {
    if (!(boxEl instanceof HTMLElement) || renderedBoxes.has(boxId)) return;
    renderBoxContent(boxEl, boxId);
    renderedBoxes.add(boxId);
    observer?.unobserve(boxEl);
  }

  function renderAllBoxPlaceholders() {
    const container = document.getElementById('boxes-container');
    if (!container) return;
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
      boxEl.dataset.boxId = String(i);

      const header = document.createElement('div');
      header.className = 'box-header';
      header.id = `box-header-${i}`;
      header.textContent = box?.name || `HOME ${i + 1}`;
      if (presetBox) {
        const presetLabel = document.createElement('span');
        presetLabel.className = 'box-header-preset';
        presetLabel.textContent = ` — ${presetBox.title}`;
        header.appendChild(presetLabel);
      }
      boxEl.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'box-grid';
      grid.setAttribute('role', 'grid');
      grid.setAttribute('aria-labelledby', header.id);
      grid.setAttribute('aria-rowcount', '5');
      grid.setAttribute('aria-colcount', '6');
      boxEl.appendChild(grid);

      frag.appendChild(boxEl);
    }
    container.appendChild(frag);

    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (!(entry.target instanceof HTMLElement)) continue;
          const boxId = parseInt(entry.target.dataset.boxId || '', 10);
          ensureBoxRendered(entry.target, boxId);
          observer?.unobserve(entry.target);
        }
      }
    }, { rootMargin: '200px' });

    const rovingBoxEl = container.querySelector(`.box[data-box-id="${rovingSlot.boxId}"]`);
    ensureBoxRendered(rovingBoxEl, rovingSlot.boxId);

    // Delay observe to next frame so browser has a layout pass —
    // otherwise observer won't fire for already-visible elements on re-render
    requestAnimationFrame(() => {
      const currentObserver = observer;
      if (!currentObserver) return;
      for (const boxEl of container.querySelectorAll('.box')) {
        currentObserver.observe(boxEl);
      }
    });
  }

  /**
   * @param {HTMLElement} grid
   * @param {import('../../types/contracts.js').InventoryBoxView} box
   * @param {number} boxId
   * @param {{title: string, pokemon: import('../../types/contracts.js').PresetTarget[]}|null|undefined} presetBox
   */
  function populateBoxGrid(grid, box, boxId, presetBox) {
    const fragment = document.createDocumentFragment();
    let row = null;
    for (let i = 0; i < box.slots.length; i++) {
      if (i % 6 === 0) {
        row = document.createElement('div');
        row.className = 'box-grid-row';
        row.setAttribute('role', 'row');
        fragment.appendChild(row);
      }
      const occupant = box.slots[i];
      const target = presetBox && i < presetBox.pokemon.length ? presetBox.pokemon[i] : null;
      if (occupant && occupant.species_id) {
        row?.appendChild(slotRenderer.createOccupiedSlot(occupant, boxId, i, target));
      } else {
        row?.appendChild(slotRenderer.createEmptySlot(boxId, i, target));
      }
    }
    grid.appendChild(fragment);
  }

  /** @param {HTMLElement} boxEl @param {number} boxId */
  function renderBoxContent(boxEl, boxId) {
    const box = DataManager.getBox(boxId);
    if (!box) return;

    const preset = DataManager.getActivePreset();
    const presetBox = preset ? preset.boxes[boxId] : null;
    const grid = boxEl.querySelector('.box-grid');
    if (!(grid instanceof HTMLElement)) return;
    const query = getBrowserQuery();

    populateBoxGrid(grid, box, boxId, presetBox);

    attachGridDelegation(grid);
    applyFiltersToBox(boxEl, query);
  }

  function refreshAllRenderedBoxes() {
    for (const id of renderedBoxes) refreshBox(id);
  }

  /** @param {number} boxId */
  function refreshBox(boxId) {
    const container = document.getElementById('boxes-container');
    if (!container) return;
    const boxEl = container.querySelector(`.box[data-box-id="${boxId}"]`);
    if (!(boxEl instanceof HTMLElement)) return;

    const box = DataManager.getBox(boxId);
    if (!box) return;

    const header = boxEl.querySelector('.box-header');
    if (!(header instanceof HTMLElement)) return;
    const preset = DataManager.getActivePreset();
    const presetBox = preset ? preset.boxes[boxId] : null;
    header.textContent = box.name || `HOME ${boxId + 1}`;
    if (presetBox) {
      const presetLabel = document.createElement('span');
      presetLabel.className = 'box-header-preset';
      presetLabel.textContent = ` — ${presetBox.title}`;
      header.appendChild(presetLabel);
    }

    const grid = boxEl.querySelector('.box-grid');
    if (!(grid instanceof HTMLElement)) return;
    const query = getBrowserQuery();
    grid.innerHTML = '';
    populateBoxGrid(grid, box, boxId, presetBox);

    renderedBoxes.add(boxId);
    applyFiltersToBox(boxEl, query);
  }

  /** @param {number} boxId @param {HTMLElement} headerEl */
  async function renameBox(boxId, headerEl) {
    const box = DataManager.getBox(boxId);
    if (!box) return;
    const oldName = box.name || `HOME ${boxId + 1}`;
    const newName = await Feedback.showPrompt('Rename box:', oldName, { placeholder: 'Box name…' });
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
      Feedback.showToast('Rename failed — reverted');
    }
  }

  // ── Filter bar ──────────────────────────────────────────

  function applyFilters() {
    const query = getBrowserQuery();
    const container = document.getElementById('boxes-container');
    if (!container) return;
    for (const boxId of renderedBoxes) {
      const boxEl = container.querySelector(`.box[data-box-id="${boxId}"]`);
      if (!(boxEl instanceof HTMLElement)) continue;
      for (const slot of boxEl.querySelectorAll('.slot')) {
        if (!(slot instanceof HTMLElement)) continue;
        applyFilterToSlot(slot, query);
        applySearchToSlot(slot, query.search);
      }
    }
    updateHomeSearchEmptyState(query.search);
  }

  /** @param {HTMLElement} boxEl @param {import('../../types/contracts.js').BrowserQuery} [query] */
  function applyFiltersToBox(boxEl, query = getBrowserQuery()) {
    const slots = boxEl.querySelectorAll('.slot');
    for (const slot of slots) {
      if (!(slot instanceof HTMLElement)) continue;
      applyFilterToSlot(slot, query);
      applySearchToSlot(slot, query.search);
    }
    updateHomeSearchEmptyState(query.search);
  }

  function getSearchQuery() {
    return getBrowserQuery().search;
  }

  /** @param {HTMLElement} slot @param {string} search */
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

  /** @param {string} query */
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

  /**
   * @param {HTMLElement} slot
   * @param {import('../../types/contracts.js').BrowserQuery} activeFilters
   */
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
        if (!AppSelectors.typeMatches(entry.types || [], activeFilters.type)) shouldDim = true;
        if (!AppSelectors.generationMatches(entry.gen || DataManager.dexNumToGen(entry.num), activeFilters.generation)) shouldDim = true;
        if (activeFilters.games.length > 0) {
          // FR-039 / FR-054: multi-select game filter is AND (intersection). Live lookup via DataManager.
          if (!activeFilters.games.every(game => DataManager.isInGame(speciesId, game))) shouldDim = true;
        }
        if (!shouldDim && activeFilters.flags && activeFilters.flags.length > 0) {
          const liveSlot = DataManager.getSlot(Number(slot.dataset.boxId), Number(slot.dataset.slotIdx));
          const state = liveSlot?.state || {};
          /** @type {Record<string, keyof import('../../types/contracts.js').BuildState>} */
          const FLAG_STATE_KEYS = {
            shiny: 'shiny', genned: 'genned', gigantamax: 'gigantamax',
            alpha: 'alpha', event_origin: 'event_origin', from_go: 'from_go',
            transferred_to_champions: 'transferred_to_champions', ev_guesstimate: 'ev_guesstimate',
          };
          if (!activeFilters.flags.every(key => !!state[FLAG_STATE_KEYS[key] || 'shiny'])) shouldDim = true;
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

  /**
   * @param {HTMLElement} slot
   * @param {import('../../types/contracts.js').BrowserQuery} [activeFilters]
   */
  function matchesGhostFilters(slot, activeFilters = getBrowserQuery()) {
    const tooltipEl = slot.querySelector('.tooltip');
    if (!tooltipEl) return true;
    const name = tooltipEl.textContent || '';
    const resolved = DataManager.resolveSpecies(name);
    const entry = resolved.entry;
    if (!entry) return true;

    if (!AppSelectors.typeMatches(entry.types || [], activeFilters.type)) return false;
    if (!AppSelectors.generationMatches(entry.gen || DataManager.dexNumToGen(entry.num), activeFilters.generation)) return false;
    if (activeFilters.games.length > 0) {
      const targetSlug = resolved.slug || entry.slug;
      // FR-039 / FR-054: multi-select game filter is AND (intersection). Live lookup via DataManager.
      if (!activeFilters.games.every(game => DataManager.isInGame(targetSlug, game))) return false;
    }
    return true;
  }

  /** @param {number} boxId @param {number} slotIdx */
  function focusRovingSlot(boxId, slotIdx) {
    const boxCount = DataManager.getBoxCount();
    if (boxId < 0 || boxId >= boxCount || slotIdx < 0 || slotIdx >= SLOTS_PER_BOX) return;
    const container = document.getElementById('boxes-container');
    if (!container) return;
    const boxEl = container?.querySelector(`.box[data-box-id="${boxId}"]`);
    if (!(boxEl instanceof HTMLElement)) return;

    ensureBoxRendered(boxEl, boxId);

    container.querySelector('.slot[tabindex="0"]')?.setAttribute('tabindex', '-1');
    rovingSlot = { boxId, slotIdx };
    const target = boxEl.querySelector(`.slot[data-slot-idx="${slotIdx}"]`);
    if (!(target instanceof HTMLElement)) return;
    target.tabIndex = 0;
    target.focus();
  }

  /** @param {KeyboardEvent} event */
  function handleSlotKeydown(event) {
    const slot = event.target instanceof Element ? event.target.closest('.slot') : null;
    if (!(slot instanceof HTMLElement)) return;
    const boxId = Number(slot.dataset.boxId);
    const slotIdx = Number(slot.dataset.slotIdx);
    const currentIndex = boxId * SLOTS_PER_BOX + slotIdx;
    const lastIndex = DataManager.getBoxCount() * SLOTS_PER_BOX - 1;
    let nextIndex = null;

    if (event.key === 'ArrowLeft') nextIndex = currentIndex - 1;
    else if (event.key === 'ArrowRight') nextIndex = currentIndex + 1;
    else if (event.key === 'ArrowUp') nextIndex = currentIndex - 6;
    else if (event.key === 'ArrowDown') nextIndex = currentIndex + 6;

    if (nextIndex !== null) {
      event.preventDefault();
      nextIndex = Math.max(0, Math.min(lastIndex, nextIndex));
      focusRovingSlot(Math.floor(nextIndex / SLOTS_PER_BOX), nextIndex % SLOTS_PER_BOX);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      slot.click();
      return;
    }

    if (event.key === ' ' && slot.classList.contains('occupied')) {
      event.preventDefault();
      SlotSelection.toggle(boxId, slotIdx);
    }
  }

  // ── Delegated grid event handlers ─────────────────────

  /**
   * Attach click and contextmenu handlers via event delegation on a .box-grid.
   * Reads slot state from DataManager at event time (no stale closures).
   * Called once per grid; idempotent via data attribute guard.
   */
  /** @param {HTMLElement} grid */
  function attachGridDelegation(grid) {
    if (grid.dataset.delegated) return;
    grid.dataset.delegated = '1';
    grid.addEventListener('keydown', handleSlotKeydown);

    grid.addEventListener('click', async (e) => {
      const slot = e.target instanceof Element ? e.target.closest('.slot') : null;
      if (!(slot instanceof HTMLElement)) return;
      const boxId = Number(slot.dataset.boxId);
      const slotIdx = Number(slot.dataset.slotIdx);
      rovingSlot = { boxId, slotIdx };
      document.querySelector('#boxes-container .slot[tabindex="0"]')?.setAttribute('tabindex', '-1');
      slot.tabIndex = 0;

      // Selection mode (Ctrl/Meta/Shift click)
      const inSelectionMode = SlotSelection.size() > 0;
      const wantsSelection = e.ctrlKey || e.metaKey || e.shiftKey || inSelectionMode;
      if (wantsSelection && !slot.classList.contains('occupied')) return;
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
        if (!speciesId) return;
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
        try {
          await placement.placePreset({ boxId, slotIdx, speciesKey: cleanPid,
            requires: slot.dataset.presetRequires, defaults: slot.dataset.presetDefaults });
        } catch (err) {
          console.error('[Boxes] preset placement failed:', err);
          placement.closePlacement();
        }
        return;
      }

      // Empty slot without preset → open placement search
      placement.openPlacement(boxId, slotIdx, null);
    });

    grid.addEventListener('contextmenu', (e) => {
      const slot = e.target instanceof Element ? e.target.closest('.slot') : null;
      if (!(slot instanceof HTMLElement)) return;
      e.preventDefault();
      const boxId = Number(slot.dataset.boxId);
      const slotIdx = Number(slot.dataset.slotIdx);

      if (slot.classList.contains('occupied')) {
        const occupant = DataManager.getSlot(boxId, slotIdx);
        if (occupant) slotActions.showSlotActions(boxId, slotIdx, occupant, e);
        return;
      }

      // Empty slot right-click — use speciesKey for search, pass requires/defaults for placement
      const presetPid = slot.dataset.presetPid || null;
      const presetSpeciesKey = slot.dataset.presetSpeciesKey || presetPid;
      if (slotActions.hasClipboard()) {
        slotActions.showPasteMenu(boxId, slotIdx, e, presetSpeciesKey);
      } else if (presetPid) {
        placement.openPlacement(boxId, slotIdx, presetSpeciesKey);
      } else {
        placement.openPlacement(boxId, slotIdx, null);
      }
    });
  }

  /** @param {HTMLElement} container */
  function mount(container) {
    containerEl = container;
    rovingSlot = { boxId: 0, slotIdx: 0 };
    renderAllBoxPlaceholders();
    container.addEventListener('dblclick', handleBoxHeaderEvent);
    container.addEventListener('contextmenu', handleBoxHeaderEvent);
  }
  function destroy() {
    observer?.disconnect();
    observer = null;
    containerEl?.removeEventListener('dblclick', handleBoxHeaderEvent);
    containerEl?.removeEventListener('contextmenu', handleBoxHeaderEvent);
    renderedBoxes.clear();
    containerEl = null;
  }
  return { mount, destroy, getRovingSlot: () => rovingSlot, focusRovingSlot, refreshAllRenderedBoxes, refreshBox, renderAllBoxPlaceholders, applyFilters };
}
