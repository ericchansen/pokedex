/**
 * ui/surfaces/detail-editor-surface.js - Shared page/panel shell for editors.
 */
export const DetailEditorSurface = (() => {
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

  function mount(html, options = {}) {
    const { target = null, panelOptions = null } = options;
    if (target) {
      target.innerHTML = html;
      return target;
    }
    return UIShared.openPanel(html, panelOptions || undefined);
  }

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

if (typeof window !== 'undefined') {
  window.DetailEditorSurface = DetailEditorSurface;
}
