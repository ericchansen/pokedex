/**
 * ui/widgets/move-editor-widget.js - Shared move editor rendering and wiring.
 */
const MoveEditorWidget = (() => {
  function renderClearableFields(values = [], options = {}) {
    const {
      count = 4,
      idPrefix,
      labelPrefix = 'Move',
      placeholder = 'Search moves...',
      flagsIdPrefix = '',
      escapeHtml = UIShared.escapeHtml,
    } = options;

    return Array.from({ length: count }, (_, index) => `
      <div class="comp-row comp-row--editable">
        <span class="comp-label">${labelPrefix} ${index + 1}</span>
        <span class="comp-value">
          <div class="input-clearable">
            <input type="text" id="${idPrefix}-${index}" value="${escapeHtml(values[index] || '')}" placeholder="${escapeHtml(placeholder)}" autocomplete="off">
            <button type="button" class="input-clear-btn" data-clear="${idPrefix}-${index}" title="Clear" tabindex="-1">×</button>
          </div>
          ${flagsIdPrefix ? `<div class="move-field-flags" id="${flagsIdPrefix}-${index}"></div>` : ''}
        </span>
      </div>
    `).join('');
  }

  function renderSimpleFields(values = [], options = {}) {
    const {
      count = 4,
      inputClassPrefix,
      labelPrefix = 'Move',
      placeholder = 'Search moves...',
      escapeHtml = UIShared.escapeHtml,
    } = options;

    return Array.from({ length: count }, (_, index) => `
      <div class="form-group">
        <label>${labelPrefix} ${index + 1}</label>
        <input type="text" class="${inputClassPrefix} ${inputClassPrefix}-${index}" value="${escapeHtml(values[index] || '')}" placeholder="${escapeHtml(placeholder)}" autocomplete="off">
      </div>
    `).join('');
  }

  function wireSpeciesMoveAutocomplete(inputs, getSpeciesSlug, searchFn, options = {}) {
    const { formatItem, onSelect, onInput, onBlur } = options;

    inputs.forEach((input, index) => {
      UIShared.createAutocomplete(input, (query) => searchFn(getSpeciesSlug(), query, index), {
        formatItem,
        onSelect: (item) => {
          if (onSelect) onSelect(item, index, input);
        },
      });
      if (onInput) input.addEventListener('input', () => onInput(index, input));
      if (onBlur) input.addEventListener('blur', () => onBlur(index, input));
    });
  }

  function collectValues(inputs) {
    return inputs.map((input) => input?.value.trim() || '').filter(Boolean);
  }

  return {
    renderClearableFields,
    renderSimpleFields,
    wireSpeciesMoveAutocomplete,
    collectValues,
  };
})();

if (typeof window !== 'undefined') {
  window.MoveEditorWidget = MoveEditorWidget;
}
