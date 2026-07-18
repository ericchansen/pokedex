import { DataManager } from '../../data.js';
import { PokemonViewer } from '../../pokemon-viewer.js';
import { SlotSelection } from '../../slot-selection.js';
import { requireElement } from '../../ui/dom.js';
import { Feedback } from '../../ui/feedback.js';

// Clipboard contents intentionally survive route controller remounts.
/** @typedef {import('../../types/contracts.js').SlotView & {species_id: string|number}} ClipboardItem */
/** @type {{items: ClipboardItem[], isCut: boolean, sources: Array<{boxId: number, slotIdx: number, instanceId: string|null}>|null}|null} */
let clipboard = null;

/** @param {{focusSlot: (boxId: number, slotIdx: number) => void, openPlacement: (boxId: number, slotIdx: number, presetTarget: string|null) => void, placePreset: (target: {boxId: number, slotIdx: number, speciesKey: string, requires?: string, defaults?: string}) => Promise<void>}} options */
export function createSlotActionsController({ focusSlot, openPlacement, placePreset }) {
  const SLOTS_PER_BOX = 30;

  /**
   * @param {import('../../types/contracts.js').SlotView|null|undefined} occupant
   * @returns {ClipboardItem|null}
   */
  function snapshotOccupant(occupant) {
    if (!occupant?.species_id) return null;
    return {
      species_id: occupant.species_id,
      target_build_id: occupant.target_build_id || null,
      state: occupant.state ? structuredClone(occupant.state) : {},
    };
  }

  // ── Slot selection action bar ──────────────────────────────
  /** @type {HTMLElement|null} */
  let slotActionBar = null;
  /** @type {(() => void)|null} */
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

    requireElement(slotActionBar, '#slot-bar-copy').addEventListener('click', () => {
      const entries = SlotSelection.entries();
      const items = entries.map(({ boxId, slotIdx }) => {
        const box = DataManager.getBox(boxId);
        return snapshotOccupant(box?.slots[slotIdx]);
      }).filter((item) => item !== null);
      clipboard = { items, isCut: false, sources: null };
      SlotSelection.clear();
      Feedback.showToast(`Copied ${items.length} Pokémon`);
    });

    requireElement(slotActionBar, '#slot-bar-cut').addEventListener('click', () => {
      const entries = SlotSelection.entries();
      const paired = entries.map(({ boxId, slotIdx }) => {
        const box = DataManager.getBox(boxId);
        const occupant = box?.slots[slotIdx];
        if (!occupant) return null;
        const clip = snapshotOccupant(occupant);
        if (!clip) return null;
        return {
          source: { boxId, slotIdx, instanceId: occupant.state?.id || null },
          clip,
        };
      }).filter((pair) => pair !== null);
      clipboard = {
        items: paired.map((pair) => pair.clip),
        isCut: true,
        sources: paired.map((pair) => pair.source),
      };
      const cutCount = clipboard.items.length;
      SlotSelection.clear();
      Feedback.showToast(`Cut ${cutCount} Pokémon`);
    });

    requireElement(slotActionBar, '#slot-bar-remove').addEventListener('click', async () => {
      const entries = SlotSelection.entries();
      const count = entries.length;
      const confirmed = await Feedback.showConfirm(`Remove ${count} Pokémon from their slots?`, {
        title: 'Remove from Boxes',
        confirmLabel: 'Remove',
        detail: 'This removes the selected Pokémon from your HOME inventory. Linked Library Builds are kept.',
      });
      if (!confirmed) return;
      try {
        await DataManager.batchRemoveSlots(entries);
        SlotSelection.clear();
        Feedback.showToast(`Removed ${count} Pokémon`);
      } catch (err) {
        console.error('[Boxes] batchRemoveSlots failed:', err);
        Feedback.showToast('Failed to remove the selected Pokémon.');
      }
    });

    requireElement(slotActionBar, '#slot-bar-clear').addEventListener('click', () => {
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
      if (!(slot instanceof HTMLElement)) return;
      const boxId = parseInt(slot.dataset.boxId || '', 10);
      const slotIdx = parseInt(slot.dataset.slotIdx || '', 10);
      const selected = SlotSelection.has(boxId, slotIdx);
      slot.classList.toggle('selected', selected);
      slot.setAttribute('aria-selected', String(selected));
    });
    refreshSlotActionBar();
  }

  /** @param {KeyboardEvent} e */
  function handleSelectionKeydown(e) {
    if (e.key === 'Escape' && SlotSelection.size() > 0) {
      SlotSelection.clear();
      e.preventDefault();
    }
  }


  // ── Slot actions (remove/move) ────────────────────────

  /**
   * @param {number} boxId
   * @param {number} slotIdx
   * @param {import('../../types/contracts.js').SlotView} occupant
   * @param {MouseEvent} event
   */
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

    requireElement(menu, '[data-action="edit"]').addEventListener('click', () => {
      menu.remove();
      PokemonViewer.openInstanceEditor(boxId, slotIdx);
    });

    requireElement(menu, '[data-action="copy"]').addEventListener('click', () => {
      const item = snapshotOccupant(occupant);
      if (item) clipboard = { items: [item], isCut: false, sources: null };
      menu.remove();
    });

    requireElement(menu, '[data-action="cut"]').addEventListener('click', () => {
      const item = snapshotOccupant(occupant);
      if (item) clipboard = { items: [item], isCut: true, sources: [{ boxId, slotIdx, instanceId: occupant.state?.id || null }] };
      menu.remove();
    });

    requireElement(menu, '[data-action="transfer"]').addEventListener('click', async () => {
      await DataManager.updateSlotIdentityField(boxId, slotIdx, 'transferred_to_champions', !isTransferred);
      menu.remove();
    });

    requireElement(menu, '[data-action="event"]').addEventListener('click', async () => {
      await DataManager.updateSlotIdentityField(boxId, slotIdx, 'event_origin', !isEventPokemon);
      menu.remove();
    });

    requireElement(menu, '[data-action="go"]').addEventListener('click', async () => {
      await DataManager.updateSlotIdentityField(boxId, slotIdx, 'from_go', !isFromGo);
      menu.remove();
    });

    requireElement(menu, '[data-action="remove"]').addEventListener('click', async () => {
      const confirmed = await Feedback.showConfirm(`Remove ${name} from Box ${boxId + 1}, slot ${slotIdx + 1}?`, {
        title: 'Remove from Slot',
        confirmLabel: 'Remove',
        detail: 'This removes the Pokémon from your HOME inventory. Any linked Library Build is kept.',
      });
      if (!confirmed) return;
      try {
        await DataManager.removeFromSlot(boxId, slotIdx);
        menu.remove();
        focusSlot(boxId, slotIdx);
        Feedback.showToast(`${name} removed from Box ${boxId + 1}.`);
      } catch (err) {
        console.error('[Boxes] removeFromSlot failed:', err);
        Feedback.showToast(`Failed to remove ${name}.`);
      }
    });

    requireElement(menu, '[data-action="move"]').addEventListener('click', () => {
      menu.remove();
      promptMoveSlot(boxId, slotIdx, occupant);
    });

    /** @param {MouseEvent} e */
    const closeMenu = (e) => {
      if (!(e.target instanceof Node) || !menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  /**
   * @param {number} boxId
   * @param {number} slotIdx
   * @param {MouseEvent} event
   * @param {string|null} presetTarget
   */
  function showPasteMenu(boxId, slotIdx, event, presetTarget) {
    const existing = document.querySelector('.slot-action-menu');
    if (existing) existing.remove();
    if (!clipboard?.items?.length) return;
    const activeClipboard = clipboard;

    const menu = document.createElement('div');
    menu.className = 'slot-action-menu';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';

    let buttonsHtml = `<div class="slot-action-title">Slot Actions</div>`;
    const cutLabel = activeClipboard.isCut ? ' (move)' : '';
    if (activeClipboard.items.length === 1) {
      const name = DataManager.resolveSpecies(activeClipboard.items[0].species_id).name || activeClipboard.items[0].species_id;
      buttonsHtml += `<button class="slot-action-btn" data-action="paste">📋 Paste ${name}${cutLabel}</button>`;
    } else {
      buttonsHtml += `<button class="slot-action-btn" data-action="paste-multi">📋 Paste ${activeClipboard.items.length} Pokémon here${cutLabel}</button>`;
    }
    buttonsHtml += `<button class="slot-action-btn" data-action="place">${presetTarget ? '👻 Place from template' : '🔍 Search & place...'}</button>`;
    buttonsHtml += `<button class="slot-action-btn" data-action="clear-clipboard">✕ Clear clipboard</button>`;
    menu.innerHTML = buttonsHtml;

    document.body.appendChild(menu);

    if (activeClipboard.items.length === 1) {
      requireElement(menu, '[data-action="paste"]').addEventListener('click', async () => {
        menu.remove();
        const item = activeClipboard.items[0];
        if (!item.species_id) return;
        const newState = structuredClone(item.state);
        newState.id = undefined;
        newState.kind = 'instance';
        await DataManager.placeInSlot(boxId, slotIdx, item.species_id, item.target_build_id, newState);
        if (activeClipboard.isCut && activeClipboard.sources?.length) {
          const src = activeClipboard.sources[0];
          if (src.boxId !== boxId || src.slotIdx !== slotIdx) {
            const current = DataManager.getSlot(src.boxId, src.slotIdx);
            if (current && (!src.instanceId || current.state?.id === src.instanceId)) {
              await DataManager.removeFromSlot(src.boxId, src.slotIdx);
            }
          }
          clipboard = null;
        }
      });
    }

    if (activeClipboard.items.length > 1) {
      requireElement(menu, '[data-action="paste-multi"]').addEventListener('click', async () => {
        menu.remove();
        const slotsPerBox = SLOTS_PER_BOX;
        const boxCount = DataManager.getBoxCount();
        let b = boxId, s = slotIdx;
        const placedIndices = new Set();
        /** @type {Array<{boxId: number, slotIdx: number, speciesId: string|number, buildId?: string|null, state?: import('../../types/contracts.js').BuildState|null}>} */
        const batchEntries = [];
        for (let i = 0; i < activeClipboard.items.length; i++) {
          if (b >= boxCount) break;
          const slot = DataManager.getSlot(b, s);
          if (!slot || !slot.species_id) {
            const item = activeClipboard.items[i];
            if (!item.species_id) continue;
            const newState = structuredClone(item.state);
            newState.id = undefined;
            newState.kind = 'instance';
            batchEntries.push({ boxId: b, slotIdx: s, speciesId: item.species_id, buildId: item.target_build_id, state: newState });
            placedIndices.add(i);
          }
          s++;
          if (s >= slotsPerBox) { s = 0; b++; }
        }
        if (batchEntries.length) {
          await DataManager.batchPlaceSlots(batchEntries);
        }
        if (activeClipboard.isCut && activeClipboard.sources?.length) {
          const cutEntries = [];
          for (let i = 0; i < activeClipboard.sources.length; i++) {
            if (!placedIndices.has(i)) continue;
            const src = activeClipboard.sources[i];
            const current = DataManager.getSlot(src.boxId, src.slotIdx);
            if (current && (!src.instanceId || current.state?.id === src.instanceId)) {
              cutEntries.push({ boxId: src.boxId, slotIdx: src.slotIdx });
            }
          }
          if (cutEntries.length) {
            await DataManager.batchClearSlots(cutEntries);
          }
          if (activeClipboard.sources.length > placedIndices.size) {
            Feedback.showToast(`${activeClipboard.sources.length - placedIndices.size} Pokémon not moved (destination occupied)`, 4000);
          }
        }
        clipboard = null;
        Feedback.showToast(`Pasted ${batchEntries.length} Pokémon`);
      });
    }

    requireElement(menu, '[data-action="place"]').addEventListener('click', async () => {
      menu.remove();
      if (presetTarget) {
        const slot = document.querySelector(`.slot[data-box-id='${boxId}'][data-slot-idx='${slotIdx}']`);
        await placePreset({ boxId, slotIdx, speciesKey: presetTarget,
          requires: slot instanceof HTMLElement ? slot.dataset.presetRequires : undefined,
          defaults: slot instanceof HTMLElement ? slot.dataset.presetDefaults : undefined });
      } else {
        openPlacement(boxId, slotIdx, null);
      }
    });

    requireElement(menu, '[data-action="clear-clipboard"]').addEventListener('click', () => {
      clipboard = null;
      menu.remove();
    });

    /** @param {MouseEvent} e */
    const closeMenu = (e) => {
      if (!(e.target instanceof Node) || !menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  /**
   * @param {number} fromBox
   * @param {number} fromSlot
   * @param {import('../../types/contracts.js').SlotView} occupant
   */
  async function promptMoveSlot(fromBox, fromSlot, occupant) {
    const name = DataManager.resolveSpecies(occupant.species_id).name || occupant.species_id;
    const toBox = await Feedback.showPrompt(`Move ${name} to which box? (1-200)`, String(fromBox + 1), { placeholder: '1–200' });
    if (!toBox) return;
    const toSlot = await Feedback.showPrompt(`Which slot in Box ${toBox}? (1-${SLOTS_PER_BOX})`, '1', { placeholder: `1–${SLOTS_PER_BOX}` });
    if (!toSlot) return;

    const targetBox = parseInt(toBox, 10) - 1;
    const targetSlot = parseInt(toSlot, 10) - 1;
    if (isNaN(targetBox) || isNaN(targetSlot) || targetBox < 0 || targetBox >= 200 || targetSlot < 0 || targetSlot >= SLOTS_PER_BOX) {
      Feedback.showToast('Invalid box or slot number.');
      return;
    }

    DataManager.moveSlot(fromBox, fromSlot, targetBox, targetSlot).catch(err => {
      console.error('[Boxes] moveSlot failed:', err);
      Feedback.showToast('Move failed — check console');
    });
  }

  function mount() {
    SlotSelection.clear();
    ensureSlotActionBar();
    unsubSlotSelection = SlotSelection.subscribe(refreshSlotSelectionVisuals);
    document.addEventListener('keydown', handleSelectionKeydown);
  }
  function destroy() {
    unsubSlotSelection?.();
    unsubSlotSelection = null;
    document.removeEventListener('keydown', handleSelectionKeydown);
    SlotSelection.clear();
    slotActionBar?.remove();
    slotActionBar = null;
    document.querySelector('.slot-action-menu')?.remove();
  }
  return { mount, destroy, showSlotActions, showPasteMenu, hasClipboard: () => Boolean(clipboard?.items?.length) };
}
