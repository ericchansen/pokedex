import { DetailPanel } from './detail-panel.js';

/**
 * ui/surfaces/detail-editor-surface.js - Shared page/panel shell for editors.
 */
export const DetailEditorSurface = (() => {
  /** @param {{isFullPage?: boolean, isEdit?: boolean, noun?: string, bodyHtml?: string, backButtonId?: string}} options */
  function render(options) {
    const {
      isFullPage = false,
      isEdit = false,
      noun = 'Detail',
      bodyHtml = '',
      backButtonId = 'detail-back',
    } = options;

    const title = `${isEdit ? 'Edit' : 'New'} ${noun}`;
    if (isFullPage) {
      return `
        <div class="editor-page">
          <div class="editor-page-header">
            <button type="button" class="btn btn-sm btn-secondary" id="${backButtonId}">← Back</button>
            <h2>${title}</h2>
          </div>
          ${bodyHtml}
        </div>
      `;
    }

    return `<div class="detail-context-badge">${title}</div>${bodyHtml}`;
  }

  /**
   * @param {string} html
   * @param {{
   * target?: HTMLElement|null,
   * panelOptions?: {onBeforeClose?: ((context: {reason: 'user'|'route-dispose'}) => void|Promise<void>)|null}|null
   * }} [options]
   */
  function mount(html, options = {}) {
    const { target = null, panelOptions = null } = options;
    if (target) {
      target.innerHTML = html;
      return target;
    }
    return DetailPanel.open(html, panelOptions || undefined);
  }

  /** @param {HTMLElement|null} container @param {string} backSelector @param {EventListener|null} onBack */
  function bindBack(container, backSelector, onBack) {
    if (!container || !backSelector || typeof onBack !== 'function') return;
    container.querySelector(backSelector)?.addEventListener('click', onBack);
  }

  return {
    render,
    mount,
    bindBack,
  };
})();
