import { ExportUI } from './export-ui.js';
import { Selection } from './selection.js';

/**
 * selection-bar.js — Global floating action bar driven by Selection module.
 *
 * Mounts once on document.body. Visible whenever Selection.size() > 0,
 * regardless of which tab/view is active.
 */

export const SelectionBar = (() => {
  /** @type {HTMLElement|null} */
  let barEl = null;
  let initialized = false;

  function ensureMounted() {
    if (barEl) return barEl;
    barEl = document.createElement('div');
    barEl.className = 'floating-action-bar selection-bar hidden';
    barEl.innerHTML = `
      <span class="selection-bar-count">0 selected</span>
      <div class="selection-bar-buttons">
        <button class="btn btn-sm btn-secondary" id="selection-bar-clear">Clear</button>
        <button class="btn btn-sm btn-primary" id="selection-bar-export">Export Selected</button>
      </div>
    `;
    document.body.appendChild(barEl);

    barEl.querySelector('#selection-bar-clear')?.addEventListener('click', () => {
      Selection.clear();
    });
    barEl.querySelector('#selection-bar-export')?.addEventListener('click', () => {
      const builds = Selection.getBuilds();
      if (!builds.length) return;
      ExportUI.openBulkExportModal(builds);
    });

    return barEl;
  }

  function refresh() {
    if (!barEl) return;
    const n = Selection.size();
    barEl.classList.toggle('hidden', n === 0);
    const countEl = barEl.querySelector('.selection-bar-count');
    if (countEl) countEl.textContent = `${n} selected`;
  }

  function init() {
    if (initialized) return;
    initialized = true;
    ensureMounted();
    refresh();
    Selection.subscribe(refresh);
  }

  return { init, refresh };
})();
