import { DetailPanel } from './detail-panel.js';

/**
 * ui/surfaces/detail-viewer-surface.js - Shared viewer shell for detail panels.
 */
export const DetailViewerSurface = (() => {
  /** @param {{contextBadgeHtml?: string, heroHtml?: string, bodyHtml?: string}} [options] */
  function render(options = {}) {
    const {
      contextBadgeHtml = '',
      heroHtml = '',
      bodyHtml = '',
    } = options;
    return `${contextBadgeHtml}${heroHtml}${bodyHtml}`;
  }

  /** @param {string} html @param {{onBeforeClose?: (() => void|Promise<void>)|null}|null} [panelOptions] */
  function mount(html, panelOptions = null) {
    return DetailPanel.open(html, panelOptions || undefined);
  }

  return {
    render,
    mount,
  };
})();
