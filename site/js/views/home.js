import { AppRoutes } from '../app-routes.js';
import { DataManager } from '../data.js';
import { EntityStore } from '../data/entity-store.js';
import { ProgressIndicator } from '../progress-indicator.js';
import { AppSelectors } from '../state/app-selectors.js';
import { AppStore } from '../state/app-store.js';
import { UIShared } from '../ui-shared.js';
import { requireSelect } from '../ui/dom.js';
import { Feedback } from '../ui/feedback.js';
import { DetailPanel } from '../ui/surfaces/detail-panel.js';
import { BrowserSurface } from '../ui/surfaces/browser-surface.js';
import { createDragDropController } from './boxes/drag-drop-controller.js';
import { createGridController } from './boxes/grid-controller.js';
import { createPlacementController } from './boxes/placement-controller.js';
import { createSlotActionsController } from './boxes/slot-actions-controller.js';
import { createSlotRenderer } from './boxes/slot-renderer.js';

/**
 * Route composition for the Boxes experience. Stateful behaviour lives in
 * focused controllers so this module owns only route lifecycle and shell UI.
 */
const BoxesView = (() => {
  /** @type {(() => void)|null} */
  let unsubscribeStore = null;
  /** @type {(() => void)|null} */
  let unsubscribeInventory = null;
  /** @type {MediaQueryList|null} */
  let toolbarMediaQuery = null;
  let secondaryFiltersOpen = false;
  /** @type {ReturnType<typeof createGridController>|null} */
  let gridController = null;
  /** @type {ReturnType<typeof createDragDropController>|null} */
  let dragDropController = null;
  /** @type {ReturnType<typeof createPlacementController>|null} */
  let placementController = null;
  /** @type {ReturnType<typeof createSlotActionsController>|null} */
  let slotActionsController = null;
  /** @type {(event: MediaQueryListEvent) => void} */
  let toolbarBreakpointHandler;

  function getBrowserQuery() {
    return AppSelectors.selectBrowserQuery(AppRoutes.sections.boxes);
  }

  /** @param {HTMLElement} container */
  function mount(container) {
    renderShell(container);
    composeControllers();

    const boxesContainer = container.querySelector('#boxes-container');
    if (!(boxesContainer instanceof HTMLElement)) throw new Error('Missing Boxes grid');
    gridController?.mount(boxesContainer);

    wirePresetSelector();
    toolbarMediaQuery = window.matchMedia('(max-width: 640px)');
    secondaryFiltersOpen = !toolbarMediaQuery.matches;
    toolbarBreakpointHandler = handleToolbarBreakpointChange;
    toolbarMediaQuery.addEventListener('change', toolbarBreakpointHandler);
    renderToolbar();
    ProgressIndicator.updateProgress();

    slotActionsController?.mount();
    dragDropController?.mount();
    subscribeToState();
    selectDefaultPreset();
  }

  function composeControllers() {
    dragDropController = createDragDropController();
    const slotRenderer = createSlotRenderer({
      dragDrop: dragDropController,
      getRovingSlot: () => gridController?.getRovingSlot() || { boxId: 0, slotIdx: 0 },
    });
    placementController = createPlacementController({
      focusSlot: (boxId, slotIdx) => gridController?.focusRovingSlot(boxId, slotIdx),
    });
    slotActionsController = createSlotActionsController({
      focusSlot: (boxId, slotIdx) => gridController?.focusRovingSlot(boxId, slotIdx),
      openPlacement: (boxId, slotIdx, presetTarget) =>
        placementController?.openPlacement(boxId, slotIdx, presetTarget),
      placePreset: (target) => placementController?.placePreset(target) || Promise.resolve(),
    });
    gridController = createGridController({
      slotRenderer,
      slotActions: slotActionsController,
      placement: placementController,
      getBrowserQuery,
    });
  }

  function subscribeToState() {
    unsubscribeStore = AppStore.subscribe(
      (state) => AppSelectors.selectBrowserQuery(AppRoutes.sections.boxes, state),
      () => {
        renderToolbar();
        gridController?.applyFilters();
      },
      AppStore.browserQueryEquals
    );
    unsubscribeInventory = EntityStore.subscribe('inventory', ({ change }) => {
      const boxes = change.boxes;
      if (!boxes?.length) {
        gridController?.refreshAllRenderedBoxes();
        return;
      }
      for (const boxId of new Set(boxes)) gridController?.refreshBox(boxId);
    });
  }

  function unmount() {
    unsubscribeStore?.();
    unsubscribeStore = null;
    unsubscribeInventory?.();
    unsubscribeInventory = null;
    if (toolbarMediaQuery && toolbarBreakpointHandler) {
      toolbarMediaQuery.removeEventListener('change', toolbarBreakpointHandler);
    }
    toolbarMediaQuery = null;
    gridController?.destroy();
    placementController?.destroy();
    slotActionsController?.destroy();
    dragDropController?.destroy();
    gridController = null;
    placementController = null;
    slotActionsController = null;
    dragDropController = null;
    void DetailPanel.close({ reason: 'route-dispose' });
  }

  /** @param {HTMLElement} container */
  function renderShell(container) {
    const keySpriteUrl = UIShared.escapeHtml(DataManager.getSpriteUrl('pikachu'));
    container.innerHTML = `
      <div id="view-boxes">
        <div class="boxes-control-strip">
          <div class="preset-selector" id="preset-selector">
            <label for="preset-gameset" title="Auto-arrange your boxes into a Living Dex layout for a specific game">Preset:</label>
            <select id="preset-gameset" class="preset-select" title="Choose a Living Dex preset to organize boxes by game">
              <option value="">None</option>
              <option value="home" title="National Dex order (Bulbasaur → Pecharunt)">HOME Living Dex</option>
              <option value="sv" title="Paldean Pokédex order (SV-only species)">Scarlet / Violet</option>
            </select>
            <select id="preset-layout" class="preset-select" aria-label="Preset layout" hidden></select>
          </div>
          <details class="boxes-state-key">
            <summary>Key <span>slot states</span></summary>
            <div class="boxes-state-key__content">
              <div class="boxes-state-key__group">
                <strong>Placement</strong>
                <span><i class="slot boxes-state-key__sample" data-preset="match" aria-hidden="true"></i> Correct</span>
                <span><i class="slot boxes-state-key__sample" data-preset="mismatch" aria-hidden="true"></i> Wrong slot</span>
                <span><i class="slot empty preset-ghost boxes-state-key__sample" data-preset="owned-elsewhere" aria-hidden="true"><img class="ghost-sprite" src="${keySpriteUrl}" alt=""></i> Owned elsewhere</span>
                <span><i class="slot empty preset-ghost boxes-state-key__sample" aria-hidden="true"><img class="ghost-sprite" src="${keySpriteUrl}" alt=""></i> Expected</span>
              </div>
              <div class="boxes-state-key__group">
                <strong>Documentation</strong>
                <span><i class="slot boxes-state-key__sample" data-border="complete" aria-hidden="true"></i> Complete</span>
                <span><i class="slot boxes-state-key__sample" data-border="partial" aria-hidden="true"></i> Partial</span>
              </div>
              <div class="boxes-state-key__group">
                <strong>Training</strong>
                <span><i class="slot boxes-state-key__sample" data-trained="full" aria-hidden="true"><img src="${keySpriteUrl}" alt=""></i> Fully trained</span>
                <span><i class="slot boxes-state-key__sample" data-trained="partial" aria-hidden="true"><img src="${keySpriteUrl}" alt=""></i> Ready to train</span>
              </div>
            </div>
          </details>
        </div>
        <div id="boxes-browser-toolbar"></div>
        <div id="boxes-search-empty-anchor"></div>
        <div class="boxes-container" id="boxes-container"></div>
        <div class="inventory-placement-bar" id="placement-bar" hidden>
          <label for="placement-search">Place Pokémon: </label>
          <input type="text" id="placement-search" class="placement-search" placeholder="Search species..." autocomplete="off">
          <div class="placement-results" id="placement-results"></div>
          <button class="btn btn-sm btn-secondary" id="placement-cancel">Cancel</button>
        </div>
      </div>`;
  }

  function wirePresetSelector() {
    const gamesetSelect = requireSelect(document, '#preset-gameset');
    const layoutSelect = requireSelect(document, '#preset-layout');
    gamesetSelect.addEventListener('change', async () => {
      const gameSet = gamesetSelect.value;
      if (!gameSet) {
        DataManager.clearPreset();
        layoutSelect.hidden = true;
        gridController?.renderAllBoxPlaceholders();
        ProgressIndicator.updateProgress();
        return;
      }
      const layouts = await DataManager.loadPresetIndex(gameSet);
      layoutSelect.innerHTML = layouts.map((layout) =>
        `<option value="${layout.id}">${layout.name} (${layout.boxCount} boxes)</option>`
      ).join('');
      layoutSelect.hidden = false;
      if (layouts[0]) await activatePreset(gameSet, layouts[0].id);
    });
    layoutSelect.addEventListener('change', async () => {
      if (gamesetSelect.value) await activatePreset(gamesetSelect.value, layoutSelect.value);
    });
  }

  /** @param {string} gameSet @param {string} layoutId */
  async function activatePreset(gameSet, layoutId) {
    try {
      await DataManager.loadPreset(gameSet, layoutId);
      gridController?.renderAllBoxPlaceholders();
      ProgressIndicator.updateProgress();
    } catch (err) {
      console.error('[Boxes] activatePreset failed:', err);
      Feedback.showToast('Failed to load preset');
    }
  }

  function selectDefaultPreset() {
    const gamesetSelect = document.getElementById('preset-gameset');
    if (gamesetSelect instanceof HTMLSelectElement && !DataManager.getActivePreset()) {
      gamesetSelect.value = 'home';
      gamesetSelect.dispatchEvent(new Event('change'));
    }
  }

  function renderToolbar() {
    const toolbar = document.getElementById('boxes-browser-toolbar');
    if (!toolbar) return;
    const disclosure = toolbar.querySelector('[data-browser-secondary]');
    if (disclosure instanceof HTMLDetailsElement) secondaryFiltersOpen = disclosure.open;
    const toolbarConfig = {
      ...AppSelectors.selectBrowserToolbarConfig(AppRoutes.sections.boxes),
      secondaryOpen: toolbarMediaQuery?.matches ? secondaryFiltersOpen : true,
    };
    BrowserSurface.mountToolbar(toolbar, toolbarConfig);
  }

  /** @param {MediaQueryListEvent} event */
  function handleToolbarBreakpointChange(event) {
    secondaryFiltersOpen = !event.matches;
    const disclosure = document.querySelector('#boxes-browser-toolbar [data-browser-secondary]');
    if (disclosure instanceof HTMLDetailsElement) disclosure.open = secondaryFiltersOpen;
    renderToolbar();
  }

  return { mount, unmount };
})();

export { BoxesView };
