/**
 * ui/widgets/autocomplete-widget.js - Shared autocomplete widget.
 */
import { escapeHtml } from '../dom.js';

export const AutocompleteWidget = (() => {
  /**
   * @template {string|{name?: string}} T
   * @param {HTMLInputElement} input
   * @param {(query: string) => T[]|Promise<T[]>} searchFn
   * @param {{onSelect?: (item: T) => void, formatItem?: (item: T) => string, escapeHtml?: (value: string) => string}} [options]
   */
  function create(input, searchFn, options = {}) {
    const { onSelect, formatItem } = options;
    const escape = options.escapeHtml || escapeHtml;

    const wrapper = document.createElement('div');
    wrapper.className = 'autocomplete-wrapper';
    input.parentNode?.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    wrapper.appendChild(dropdown);

    let activeIndex = -1;
    /** @type {T[]} */
    let items = [];

    function render() {
      dropdown.innerHTML = items.map((item, index) => {
        const text = formatItem
          ? formatItem(item)
          : escape(typeof item === 'string' ? item : (item.name || ''));
        return `<div class="autocomplete-item${index === activeIndex ? ' active' : ''}" data-index="${index}">${text}</div>`;
      }).join('');
      dropdown.style.display = items.length ? 'block' : 'none';
    }

    /** @param {T} item */
    function select(item) {
      input.value = typeof item === 'string' ? item : (item.name || '');
      dropdown.style.display = 'none';
      items = [];
      if (onSelect) onSelect(item);
    }

    /** @type {number|undefined} */
    let debounceTimer;
    input.addEventListener('input', () => {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const result = searchFn(input.value);
        items = result instanceof Promise ? await result : result;
        activeIndex = -1;
        render();
      }, 100);
    });

    input.addEventListener('keydown', (event) => {
      if (!items.length) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        render();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        render();
      } else if (event.key === 'Enter' && items.length) {
        event.preventDefault();
        select(items[Math.max(activeIndex, 0)]);
      } else if (event.key === 'Escape') {
        dropdown.style.display = 'none';
        items = [];
      }
    });

    dropdown.addEventListener('click', (event) => {
      const itemEl = event.target instanceof Element
        ? event.target.closest('.autocomplete-item')
        : null;
      if (itemEl instanceof HTMLElement) {
        const item = items[Number(itemEl.dataset.index)];
        if (item !== undefined) select(item);
      }
    });

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Node) || !wrapper.contains(event.target)) {
        dropdown.style.display = 'none';
      }
    });

    return {
      wrapper,
      /** @param {string} value */
      setValue(value) {
        input.value = value;
      },
    };
  }

  return { create };
})();
