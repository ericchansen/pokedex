/**
 * selection.js — Cross-tab build selection registry.
 *
 * Single source of truth for "which builds has the user selected for export?".
 * Selection is keyed by build_id. Teams just visualize which of their 6
 * sprites are in this set — there is no separate per-team selection state.
 */

const Selection = (() => {
  function has(buildId) {
    return AppStore.hasSelectedBuildId(buildId);
  }

  function add(buildId) {
    return AppStore.addSelectedBuildId(buildId);
  }

  function remove(buildId) {
    return AppStore.removeSelectedBuildId(buildId);
  }

  function toggle(buildId) {
    return AppStore.toggleSelectedBuildId(buildId);
  }

  function addMany(buildIds) {
    const next = AppStore.getSelectedBuildIds();
    let mutated = false;
    for (const id of buildIds || []) {
      if (typeof id !== 'string' || !id || next.includes(id)) continue;
      next.push(id);
      mutated = true;
    }
    if (!mutated) return false;
    AppStore.replaceSelectionIds(next);
    return true;
  }

  function removeMany(buildIds) {
    const removeSet = new Set((buildIds || []).filter(Boolean));
    const next = AppStore.getSelectedBuildIds().filter((id) => !removeSet.has(id));
    return AppStore.replaceSelectionIds(next);
  }

  function clear() {
    return AppStore.clearSelectedBuildIds();
  }

  function size() {
    return AppStore.getSelectedBuildCount();
  }

  function ids() {
    return AppStore.getSelectedBuildIds();
  }

  /**
   * Resolve to current build objects via DataManager. Silently drops
   * orphaned ids (build was deleted in another window).
   */
  function getBuilds() {
    const selectedIds = AppStore.getSelectedBuildIds();
    if (!selectedIds.length) return [];
    const out = [];
    for (const id of selectedIds) {
      const b = (typeof DataManager !== 'undefined' && DataManager.getBuild)
        ? DataManager.getBuild(id) : null;
      if (b) out.push(b);
    }
    return out;
  }

  /**
   * Subscribe to selection changes. Returns an unsubscribe function.
   * Subscribers are called after every mutation (no diff payload — recompute).
   */
  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    let previousSignature = AppStore.getSelectedBuildIds().join('\u0000');
    return AppStore.subscribe((state) => {
      const currentIds = typeof AppSelectors !== 'undefined'
        ? AppSelectors.selectSelection(state).ids
        : (state.selection?.ids || []);
      const signature = currentIds.join('\u0000');
      if (signature === previousSignature) return;
      previousSignature = signature;
      try { fn(); } catch (error) { console.error('[Selection] subscriber threw', error); }
    });
  }

  return {
    has, add, remove, toggle,
    addMany, removeMany, clear,
    size, ids, getBuilds, subscribe,
  };
})();

if (typeof window !== 'undefined') window.Selection = Selection;
