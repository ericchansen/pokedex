import { UIShared } from '../../ui-shared.js';

/**
 * ui/widgets/move-editor-widget.js - Shared move editor rendering and wiring.
 */
export const MoveEditorWidget = (() => {
  /**
   * @param {string[]} values
   * @param {{count?: number, idPrefix: string, labelPrefix?: string, placeholder?: string, flagsIdPrefix?: string, escapeHtml?: (value: string) => string}} options
   */
  function renderClearableFields(values, options) {
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

  /**
   * @param {string[]} values
   * @param {{count?: number, inputClassPrefix: string, labelPrefix?: string, placeholder?: string, escapeHtml?: (value: string) => string}} options
   */
  function renderSimpleFields(values, options) {
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

  /**
   * @template {string|{name?: string}} T
   * @param {HTMLInputElement[]} inputs
   * @param {() => string} getSpeciesSlug
   * @param {(speciesSlug: string, query: string, index: number) => T[]|Promise<T[]>} searchFn
   * @param {{
   * formatItem?: (item: T) => string,
   * onSelect?: (item: T, index: number, input: HTMLInputElement) => void,
   * onInput?: (index: number, input: HTMLInputElement) => void,
   * onBlur?: (index: number, input: HTMLInputElement) => void
   * }} [options]
   */
  function wireSpeciesMoveAutocomplete(inputs, getSpeciesSlug, searchFn, options = {}) {
    const { formatItem, onSelect, onInput, onBlur } = options;

    inputs.forEach((input, index) => {
      /** @param {string} query */
      const getItems = (query) => searchFn(getSpeciesSlug(), query, index);
      /** @param {T} item */
      const selectItem = (item) => {
        if (onSelect) onSelect(item, index, input);
      };
      UIShared.createAutocomplete(input, getItems, {
        formatItem,
        onSelect: selectItem,
      });
      if (onInput) input.addEventListener('input', () => onInput(index, input));
      if (onBlur) input.addEventListener('blur', () => onBlur(index, input));
    });
  }

  /** @param {HTMLInputElement[]} inputs */
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
