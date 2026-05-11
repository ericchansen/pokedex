const BrowserSurface = (() => {
  const {
    AppStore,
    AppRoutes,
    UIShared,
    FilterToolbarSection,
  } = globalThis;

  function mountToolbar(anchor, toolbarModel) {
    if (!anchor || !toolbarModel) return null;
    anchor.innerHTML = '';
    const toolbar = UIShared.renderBrowserToolbar(toolbarModel);
    anchor.appendChild(toolbar);
    FilterToolbarSection.bindBrowserToolbar(toolbar, { route: toolbarModel.route });
    return toolbar;
  }

  function createEmptyState(emptyState, route) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <h3>${UIShared.escapeHtml(emptyState.title)}</h3>
      <p>${UIShared.escapeHtml(emptyState.message)}</p>
      ${emptyState.action ? `<button class="btn ${emptyState.action.kind === 'reset-query' ? 'btn-secondary' : 'btn-primary'}" data-empty-action="${UIShared.escapeHtml(emptyState.action.kind)}">${UIShared.escapeHtml(emptyState.action.label)}</button>` : ''}
    `;

    const actionButton = empty.querySelector('[data-empty-action]');
    if (!actionButton || !emptyState.action) return empty;

    actionButton.addEventListener('click', () => {
      switch (emptyState.action.kind) {
        case 'goto-boxes':
          window.location.hash = AppRoutes.hashes.boxes;
          break;
        case 'new-build':
          globalThis.BuildEditor.openBuildForm(null, null, { editContext: 'library' });
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

window.BrowserSurface = BrowserSurface;
