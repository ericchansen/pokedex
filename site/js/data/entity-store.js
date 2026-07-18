/**
 * EntityStore owns the current data-slice references and precise change events.
 * Data services replace or mutate a slice, then publish the affected identities.
 */
export const EntityStore = (() => {
  /** @typedef {'reference'|'builds'|'teams'|'inventory'} EntitySlice */
  /** @typedef {{kind: string, ids?: string[], boxes?: number[], slots?: Array<{boxId: number, slotIdx: number}>}} EntityChange */
  /** @typedef {{slice: EntitySlice, version: number, change: EntityChange, value: object|null}} EntityEvent */
  /** @typedef {(event: EntityEvent) => void} EntityListener */
  /** @type {readonly EntitySlice[]} */
  const SLICE_NAMES = Object.freeze(['reference', 'builds', 'teams', 'inventory']);
  /** @type {Map<EntitySlice, Set<EntityListener>>} */
  const listeners = new Map(SLICE_NAMES.map((name) => [name, new Set()]));
  /** @type {Set<EntityListener>} */
  const wildcardListeners = new Set();
  /** @type {Record<EntitySlice, object|null>} */
  const slices = { reference: null, builds: null, teams: null, inventory: null };
  /** @type {Record<EntitySlice, number>} */
  const versions = { reference: 0, builds: 0, teams: 0, inventory: 0 };
  /** @type {Array<Readonly<EntityEvent>>} */
  const eventQueue = [];
  let dispatching = false;

  /** @param {EntitySlice} slice */
  function assertSlice(slice) {
    if (!Object.hasOwn(slices, slice)) {
      throw new Error(`Unknown entity slice: ${slice}`);
    }
  }

  function dispatchQueuedEvents() {
    if (dispatching) return;
    dispatching = true;
    try {
      while (eventQueue.length) {
        const event = eventQueue.shift();
        if (!event) continue;
        const sliceListeners = listeners.get(event.slice);
        if (!sliceListeners) throw new Error(`Missing listeners for entity slice: ${event.slice}`);
        for (const listener of [...sliceListeners, ...wildcardListeners]) {
          try {
            listener(event);
          } catch (error) {
            console.error(`[EntityStore] ${event.slice} listener failed`, error);
          }
        }
      }
    } finally {
      dispatching = false;
    }
  }

  /**
   * @param {EntitySlice} slice
   * @param {EntityChange} change
   * @returns {Readonly<EntityEvent>}
   */
  function notify(slice, change) {
    assertSlice(slice);
    versions[slice] += 1;
    const event = Object.freeze({
      slice,
      version: versions[slice],
      change: Object.freeze({ ...change }),
      value: slices[slice],
    });
    eventQueue.push(event);
    dispatchQueuedEvents();
    return event;
  }

  /**
   * @param {EntitySlice} slice
   * @param {object|null} value
   * @param {EntityChange} [change]
   */
  function replace(slice, value, change = { kind: 'reset' }) {
    assertSlice(slice);
    slices[slice] = value;
    return notify(slice, change);
  }

  /** @param {EntitySlice} slice @param {EntityChange} change */
  function publish(slice, change) {
    return notify(slice, change);
  }

  /** @param {EntitySlice} slice */
  function get(slice) {
    assertSlice(slice);
    return slices[slice];
  }

  /** @param {EntitySlice} slice */
  function getVersion(slice) {
    assertSlice(slice);
    return versions[slice];
  }

  /** @param {EntitySlice|'*'} slice @param {EntityListener} listener */
  function subscribe(slice, listener) {
    if (typeof listener !== 'function') return () => {};
    if (slice === '*') {
      wildcardListeners.add(listener);
      return () => wildcardListeners.delete(listener);
    }
    assertSlice(slice);
    const sliceListeners = listeners.get(slice);
    if (!sliceListeners) throw new Error(`Missing listeners for entity slice: ${slice}`);
    sliceListeners.add(listener);
    return () => sliceListeners.delete(listener);
  }

  return {
    get,
    getVersion,
    publish,
    replace,
    subscribe,
  };
})();
