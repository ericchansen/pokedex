import { DataManager } from '../../data.js';
import { SlotSelection } from '../../slot-selection.js';
import { Feedback } from '../../ui/feedback.js';

export function createDragDropController() {
  // Drag auto-scroll ──────────────────────────────────────
  /** @type {number|null} */
  let dragScrollRAF = null;
  let dragScrollDir = 0; // -1 = up, 1 = down, 0 = none
  const EDGE_ZONE = 60; // px from viewport edge that triggers scroll
  const MAX_SPEED = 14; // px per frame at the very edge

  /** @param {DragEvent} e */
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

  // Drag and drop ──────────────────────────────

  /** @param {HTMLElement} slot @param {number} boxId @param {number} slotIdx */
  function attachDragSource(slot, boxId, slotIdx) {
    slot.draggable = true;
    slot.addEventListener('dragstart', (e) => {
      if (!e.dataTransfer) return;
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

  /** @param {HTMLElement} slot @param {number} boxId @param {number} slotIdx */
  function attachDropTarget(slot, boxId, slotIdx) {
    slot.addEventListener('dragover', (e) => {
      if (!e.dataTransfer ||
          (!e.dataTransfer.types.includes('application/x-pc-slot') &&
          !e.dataTransfer.types.includes('application/x-pc-slots'))) return;
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
      if (!e.dataTransfer) return;
      const rawMulti = e.dataTransfer.getData('application/x-pc-slots');
      if (rawMulti) {
        /** @type {unknown} */
        let parsed;
        try { parsed = JSON.parse(rawMulti); } catch { return; }
        if (!Array.isArray(parsed)) return;
        const entries = parsed.filter((entry) =>
          entry && typeof entry === 'object' &&
          typeof entry.boxId === 'number' && typeof entry.slotIdx === 'number');
        DataManager.batchMoveSlots(entries, boxId, slotIdx).then(() => {
          SlotSelection.clear();
        }).catch((err) => {
          console.error('batchMoveSlots failed', err);
          Feedback.showToast('Batch move failed: ' + (err instanceof Error ? err.message : String(err)));
        });
        return;
      }

      // Single move
      const raw = e.dataTransfer.getData('application/x-pc-slot');
      if (!raw) return;
      /** @type {unknown} */
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return; }
      if (!parsed || typeof parsed !== 'object' ||
          !('boxId' in parsed) || !('slotIdx' in parsed) ||
          typeof parsed.boxId !== 'number' || typeof parsed.slotIdx !== 'number') return;
      const fromBox = parsed.boxId;
      const fromSlot = parsed.slotIdx;
      if (fromBox === boxId && fromSlot === slotIdx) return;
      DataManager.moveSlot(fromBox, fromSlot, boxId, slotIdx).catch((err) => {
        console.error('moveSlot failed', err);
        Feedback.showToast('Move failed: ' + (err instanceof Error ? err.message : String(err)));
      });
    });
  }

  function mount() {
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragend', stopDragScroll);
    document.addEventListener('drop', stopDragScroll);
  }
  function destroy() {
    document.removeEventListener('dragover', handleDragOver);
    document.removeEventListener('dragend', stopDragScroll);
    document.removeEventListener('drop', stopDragScroll);
    stopDragScroll();
  }
  return { mount, destroy, attachDragSource, attachDropTarget };
}
