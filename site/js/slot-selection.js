/**
 * slot-selection.js — Multi-select state for box slots.
 *
 * Tracks which {boxId, slotIdx} pairs the user has selected in the Boxes view.
 * Purely in-memory — clears on tab change or page reload.
 * Separate from the build Selection module (which is for export).
 */
const SlotSelection = (() => {
  const selected = new Map(); // key "boxId:slotIdx" → {boxId, slotIdx}
  const subscribers = [];
  let lastClicked = null; // {boxId, slotIdx} for Shift+Click range

  function key(boxId, slotIdx) {
    return `${boxId}:${slotIdx}`;
  }

  function notify() {
    for (const fn of subscribers) {
      try { fn(); } catch (e) { console.error('[SlotSelection] subscriber threw', e); }
    }
  }

  function has(boxId, slotIdx) {
    return selected.has(key(boxId, slotIdx));
  }

  function add(boxId, slotIdx) {
    const k = key(boxId, slotIdx);
    if (selected.has(k)) return false;
    selected.set(k, { boxId, slotIdx });
    lastClicked = { boxId, slotIdx };
    notify();
    return true;
  }

  function remove(boxId, slotIdx) {
    const k = key(boxId, slotIdx);
    if (!selected.has(k)) return false;
    selected.delete(k);
    notify();
    return true;
  }

  function toggle(boxId, slotIdx) {
    if (has(boxId, slotIdx)) {
      remove(boxId, slotIdx);
    } else {
      add(boxId, slotIdx);
    }
    lastClicked = { boxId, slotIdx };
  }

  /**
   * Select a contiguous range of occupied slots between two endpoints.
   * Walks box-by-box, slot-by-slot in grid order.
   */
  function addRange(toBoxId, toSlotIdx) {
    if (!lastClicked) {
      add(toBoxId, toSlotIdx);
      return;
    }
    const from = lastClicked;
    let startBox = from.boxId, startSlot = from.slotIdx;
    let endBox = toBoxId, endSlot = toSlotIdx;

    // Normalize direction
    if (startBox > endBox || (startBox === endBox && startSlot > endSlot)) {
      [startBox, startSlot, endBox, endSlot] = [endBox, endSlot, startBox, startSlot];
    }

    const slotsPerBox = 30;
    let mutated = false;
    for (let b = startBox; b <= endBox; b++) {
      const slotStart = (b === startBox) ? startSlot : 0;
      const slotEnd = (b === endBox) ? endSlot : slotsPerBox - 1;
      for (let s = slotStart; s <= slotEnd; s++) {
        const k = key(b, s);
        if (!selected.has(k)) {
          // Only select occupied slots
          if (typeof DataManager !== 'undefined') {
            const box = DataManager.getBox(b);
            if (box && box.slots[s]) {
              selected.set(k, { boxId: b, slotIdx: s });
              mutated = true;
            }
          }
        }
      }
    }
    lastClicked = { boxId: toBoxId, slotIdx: toSlotIdx };
    if (mutated) notify();
  }

  function clear() {
    if (selected.size === 0) return;
    selected.clear();
    lastClicked = null;
    notify();
  }

  function size() {
    return selected.size;
  }

  /** Returns array of {boxId, slotIdx} sorted by box then slot. */
  function entries() {
    const arr = Array.from(selected.values());
    arr.sort((a, b) => a.boxId - b.boxId || a.slotIdx - b.slotIdx);
    return arr;
  }

  function getLastClicked() {
    return lastClicked;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    subscribers.push(fn);
    return () => {
      const idx = subscribers.indexOf(fn);
      if (idx >= 0) subscribers.splice(idx, 1);
    };
  }

  return { has, add, remove, toggle, addRange, clear, size, entries, getLastClicked, subscribe };
})();

if (typeof window !== 'undefined') window.SlotSelection = SlotSelection;
