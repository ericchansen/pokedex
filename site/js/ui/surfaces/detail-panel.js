import { AppStore } from '../../state/app-store.js';

export const DetailPanel = (() => {
  /** @type {(() => void|Promise<void>)|null} */
  let beforeClose = null;
  /** @type {HTMLElement|null} */
  let returnFocus = null;
  let revision = 0;

  function beginRequest() {
    revision += 1;
    return revision;
  }

  /** @param {number} requestRevision */
  function isRequestCurrent(requestRevision) {
    return requestRevision === revision;
  }

  /** @param {string} html @param {{onBeforeClose?: (() => void|Promise<void>)|null}} [opts] */
  function open(html, opts = {}) {
    revision += 1;
    const panel = document.getElementById('detail-panel');
    const overlay = document.getElementById('detail-overlay');
    const content = document.getElementById('detail-content');
    if (!panel || !overlay || !content) {
      throw new Error('Detail panel shell is missing');
    }

    if (!panel.classList.contains('open')) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    beforeClose = opts.onBeforeClose || null;
    content.innerHTML = html;
    panel.classList.add('open');
    overlay.classList.add('open');
    panel.inert = false;
    panel.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
    AppStore.setDetailOpen(true);
    queueMicrotask(() => {
      const focusTarget = content.querySelector('[autofocus], input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])');
      if (focusTarget instanceof HTMLElement) focusTarget.focus();
      else panel.focus();
    });
    return content;
  }

  async function close({ skipBeforeClose = false } = {}) {
    const closeRevision = ++revision;
    const closeHandler = beforeClose;
    if (!skipBeforeClose && closeHandler) {
      try {
        await closeHandler();
      } catch (error) {
        console.error('[DetailPanel] before-close handler failed', error);
      }
    }
    if (closeRevision !== revision) return;
    const panel = document.getElementById('detail-panel');
    const overlay = document.getElementById('detail-overlay');
    const content = document.getElementById('detail-content');
    if (!panel || !overlay || !content) {
      throw new Error('Detail panel shell is missing');
    }

    const focusTarget = returnFocus;
    beforeClose = null;
    returnFocus = null;
    panel.classList.remove('open');
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    content.innerHTML = '';
    AppStore.setDetailOpen(false);
    if (focusTarget?.isConnected) focusTarget.focus();
  }

  return { beginRequest, close, isRequestCurrent, open };
})();
