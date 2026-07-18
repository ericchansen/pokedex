/**
 * Reconcile keyed children while preserving unchanged DOM nodes and listeners.
 */
export const KeyedList = {
  /**
   * @template T
   * @param {HTMLElement} container
   * @param {T[]} items
   * @param {{key: (item: T) => string|number, signature?: (item: T) => string|number, render: (item: T) => HTMLElement}} options
   */
  reconcile(container, items, options) {
    const activeElement = document.activeElement instanceof HTMLElement
      && container.contains(document.activeElement)
      ? document.activeElement
      : null;
    let activeKey = '';
    let activeIndex = -1;
    if (activeElement) {
      let activeRoot = activeElement;
      while (activeRoot.parentElement && activeRoot.parentElement !== container) {
        activeRoot = activeRoot.parentElement;
      }
      activeKey = activeRoot.dataset.key || '';
      const focusable = [activeRoot, ...activeRoot.querySelectorAll(
        'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'
      )];
      activeIndex = focusable.indexOf(activeElement);
    }

    /** @type {Map<string, HTMLElement>} */
    const existing = new Map();
    for (const element of container.children) {
      if (element instanceof HTMLElement && element.dataset.key) {
        existing.set(element.dataset.key, element);
      }
    }
    const stale = new Set(existing.values());

    items.forEach((item, index) => {
      const key = String(options.key(item));
      const signature = String(options.signature?.(item) ?? '');
      const current = existing.get(key);
      const element = (!current || current.dataset.signature !== signature)
        ? options.render(item)
        : current;
      if (!current || current.dataset.signature !== signature) {
        element.dataset.key = key;
        element.dataset.signature = signature;
      }
      if (element === current) stale.delete(element);
      const elementAtIndex = container.children[index] || null;
      if (elementAtIndex !== element) container.insertBefore(element, elementAtIndex);
    });

    for (const element of stale) element.remove();

    if (activeElement && !activeElement.isConnected && activeKey && activeIndex >= 0) {
      const activeRoot = [...container.children].find(
        (element) => element instanceof HTMLElement && element.dataset.key === activeKey
      );
      if (activeRoot instanceof HTMLElement) {
        const focusable = [activeRoot, ...activeRoot.querySelectorAll(
          'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'
        )];
        const focusTarget = focusable[activeIndex];
        if (focusTarget instanceof HTMLElement) focusTarget.focus();
      }
    }
  },
};
