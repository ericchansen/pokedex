/**
 * Create a small error-isolating signal for state modules that only need to
 * notify subscribers that their readable state changed.
 *
 * @param {string} label
 */
export function createSubscriptionSet(label) {
  /** @type {Set<() => void>} */
  const listeners = new Set();

  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        console.error(`[${label}] listener failed`, error);
      }
    }
  }

  /** @param {() => void} listener */
  function subscribe(listener) {
    if (typeof listener !== 'function') return () => false;
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { notify, subscribe };
}
