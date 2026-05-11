/**
 * progress-indicator.js - Shared progress meter updates.
 */

const ProgressIndicator = (() => {
  let unsubscribe = null;
  let lastSignature = '';

  function applyProgressSnapshot(progress) {
    const textEl = document.getElementById('progress-text');
    const fillEl = document.getElementById('progress-fill');
    if (!textEl || !fillEl) return;
    textEl.textContent = progress.text;
    fillEl.style.width = `${progress.percent}%`;
  }

  function updateProgress() {
    applyProgressSnapshot(AppSelectors.selectProgress());
  }

  function init() {
    updateProgress();
    if (unsubscribe) unsubscribe();
    lastSignature = '';
    unsubscribe = AppStore.subscribe((state) => {
      const progress = AppSelectors.selectProgress(state);
      const signature = `${progress.mode}|${progress.text}|${progress.percent}`;
      if (signature === lastSignature) return;
      lastSignature = signature;
      applyProgressSnapshot(progress);
    });
  }

  return { init, updateProgress };
})();

if (typeof window !== 'undefined') {
  window.ProgressIndicator = ProgressIndicator;
}
