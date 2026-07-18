import { AppRoutes } from '../../app-routes.js';
import { AppStore } from '../../state/app-store.js';
import { UIShared } from '../../ui-shared.js';
import { FilterToolbarSection } from '../sections/filter-toolbar.js';

export const BrowserSurface = (() => {


  /**
   * @param {HTMLElement|null} anchor
   * @param {import('../../types/contracts.js').BrowserToolbarModel|null} toolbarModel
   */
  function mountToolbar(anchor, toolbarModel) {
    if (!anchor || !toolbarModel) return null;
    anchor.innerHTML = '';
    const toolbar = UIShared.renderBrowserToolbar(toolbarModel);
    anchor.appendChild(toolbar);
    FilterToolbarSection.bindBrowserToolbar(toolbar, { route: toolbarModel.route });
    return toolbar;
  }

  /**
   * @param {import('../../types/contracts.js').BrowserEmptyState} emptyState
   * @param {import('../../types/contracts.js').RouteSection} route
   */
  function createEmptyState(emptyState, route) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <h3>${UIShared.escapeHtml(emptyState.title)}</h3>
      <p>${UIShared.escapeHtml(emptyState.message)}</p>
      ${emptyState.action ? `<button class="btn ${emptyState.action.kind === 'reset-query' ? 'btn-secondary' : 'btn-primary'}" data-empty-action="${UIShared.escapeHtml(emptyState.action.kind)}">${UIShared.escapeHtml(emptyState.action.label)}</button>` : ''}
    `;

    const actionButton = empty.querySelector('[data-empty-action]');
    const action = emptyState.action;
    if (!actionButton || !action) return empty;

    actionButton.addEventListener('click', async () => {
      switch (action.kind) {
        case 'goto-boxes':
          window.location.hash = AppRoutes.hashes.boxes;
          break;
        case 'new-build':
          {
            const { BuildEditor } = await import('../../build-editor.js');
            BuildEditor.openBuildForm(null, null, { editContext: 'library' });
          }
          break;
        case 'reset-query':
          AppStore.resetBrowserQuery(route);
          break;
        default:
          break;
      }
    });

    return empty;
  }

  return {
    mountToolbar,
    createEmptyState,
  };
})();
