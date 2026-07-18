import { EntityStore } from './data/entity-store.js';
import { AppSelectors } from './state/app-selectors.js';

/**
 * progress-indicator.js - Shared progress meter updates.
 */

export const ProgressIndicator = (() => {
  /** @type {(() => void)|null} */
  let unsubscribe = null;

  /** @param {{text: string, percent: number}} progress */
  function applyProgressSnapshot(progress) {
    const textEl = document.getElementById('progress-text');
    const fillEl = document.getElementById('progress-fill');
    if (!textEl || !fillEl) return;
    const progressEl = textEl.closest('[role="progressbar"]');
    textEl.textContent = progress.text;
    textEl.classList.toggle('on-progress-fill', progress.percent >= 55);
    fillEl.style.transform = `scaleX(${progress.percent / 100})`;
    progressEl?.setAttribute('aria-valuenow', String(Math.round(progress.percent)));
    progressEl?.setAttribute('aria-valuetext', progress.text);
  }

  function updateProgress() {
    applyProgressSnapshot(AppSelectors.selectProgress());
  }

  function init() {
    updateProgress();
    if (unsubscribe) unsubscribe();
    unsubscribe = EntityStore.subscribe('inventory', updateProgress);
  }

  return { init, updateProgress };
})();
