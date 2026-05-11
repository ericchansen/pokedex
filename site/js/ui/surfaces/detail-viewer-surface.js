/**
 * ui/surfaces/detail-viewer-surface.js - Shared viewer shell for detail panels.
 */
const DetailViewerSurface = (() => {
  function render(options = {}) {
    const {
      contextBadgeHtml = '',
      heroHtml = '',
      bodyHtml = '',
    } = options;
    return `${contextBadgeHtml}${heroHtml}${bodyHtml}`;
  }

  function mount(html, panelOptions = null) {
    return UIShared.openPanel(html, panelOptions || undefined);
  }

  return {
    render,
    mount,
  };
})();

if (typeof window !== 'undefined') {
  window.DetailViewerSurface = DetailViewerSurface;
}
