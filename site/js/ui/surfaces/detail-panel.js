import { AppStore } from '../../state/app-store.js';

export const DetailPanel = (() => {
  /** @typedef {'user'|'route-dispose'} DetailCloseReason */
  /** @typedef {{reason: DetailCloseReason}} DetailCloseContext */
  /** @type {((context: DetailCloseContext) => void|Promise<void>)|null} */
  let beforeClose = null;
  /** @type {HTMLElement|null} */
  let returnFocus = null;
  /** @type {{revision: number, context: DetailCloseContext, promise: Promise<void>}|null} */
  let activeClose = null;
  let revision = 0;

  function beginRequest() {
    revision += 1;
    return revision;
  }

  /** @param {number} requestRevision */
  function isRequestCurrent(requestRevision) {
    return requestRevision === revision;
  }

  /** @param {HTMLElement} panel @param {HTMLElement} overlay */
  function hidePanel(panel, overlay) {
    panel.classList.remove('open');
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    AppStore.setDetailOpen(false);
  }

  /**
   * @param {string} html
   * @param {{onBeforeClose?: ((context: DetailCloseContext) => void|Promise<void>)|null}} [opts]
   */
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

  /**
   * @param {{skipBeforeClose?: boolean, reason?: DetailCloseReason}} [options]
   */
  function close({ skipBeforeClose = false, reason = 'user' } = {}) {
    const panel = document.getElementById('detail-panel');
    const overlay = document.getElementById('detail-overlay');
    const content = document.getElementById('detail-content');
    if (!panel || !overlay || !content) {
      return Promise.reject(new Error('Detail panel shell is missing'));
    }

    if (activeClose?.revision === revision) {
      if (reason === 'route-dispose' && activeClose.context.reason !== 'route-dispose') {
        activeClose.context.reason = 'route-dispose';
        beforeClose = null;
        returnFocus = null;
        hidePanel(panel, overlay);
      }
      return activeClose.promise;
    }

    const closeRevision = ++revision;
    const closeHandler = beforeClose;
    const context = { reason };
    const focusTarget = returnFocus;
    if (context.reason === 'route-dispose') {
      beforeClose = null;
      returnFocus = null;
      hidePanel(panel, overlay);
    }

    const closeOperation = (async () => {
      if (!skipBeforeClose && closeHandler) {
        try {
          await closeHandler(context);
        } catch (error) {
          console.error('[DetailPanel] before-close handler failed', error);
        }
      }
      if (closeRevision !== revision) return;

      if (context.reason !== 'route-dispose') {
        hidePanel(panel, overlay);
        beforeClose = null;
        returnFocus = null;
      }
      content.innerHTML = '';
      if (context.reason !== 'route-dispose' && focusTarget?.isConnected) focusTarget.focus();
    })();
    const trackedClose = closeOperation.finally(() => {
      if (activeClose?.promise === trackedClose) activeClose = null;
    });
    activeClose = { revision: closeRevision, context, promise: trackedClose };
    return trackedClose;
  }

  return { beginRequest, close, isRequestCurrent, open };
})();
