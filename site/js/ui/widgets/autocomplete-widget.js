/**
 * ui/widgets/autocomplete-widget.js - Shared autocomplete widget.
 */
export const AutocompleteWidget = (() => {
  function create(input, searchFn, options = {}) {
    const { onSelect, formatItem } = options;
    const escapeHtml = options.escapeHtml || UIShared.escapeHtml;

    const wrapper = document.createElement('div');
    wrapper.className = 'autocomplete-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    wrapper.appendChild(dropdown);

    let activeIndex = -1;
    let items = [];

    function render() {
      dropdown.innerHTML = items.map((item, index) => {
        const text = formatItem ? formatItem(item) : escapeHtml(item.name || item);
        return `<div class="autocomplete-item${index === activeIndex ? ' active' : ''}" data-index="${index}">${text}</div>`;
      }).join('');
      dropdown.style.display = items.length ? 'block' : 'none';
    }

    function select(item) {
      input.value = item.name || item;
      dropdown.style.display = 'none';
      items = [];
      if (onSelect) onSelect(item);
    }

    let debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
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
      const itemEl = event.target.closest('.autocomplete-item');
      if (itemEl) select(items[Number(itemEl.dataset.index)]);
    });

    document.addEventListener('click', (event) => {
      if (!wrapper.contains(event.target)) {
        dropdown.style.display = 'none';
      }
    });

    return {
      wrapper,
      setValue(value) {
        input.value = value;
      },
    };
  }

  return { create };
})();

if (typeof window !== 'undefined') {
  window.AutocompleteWidget = AutocompleteWidget;
}
