import assert from 'node:assert/strict';
import test from 'node:test';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
globalThis.location = { hash: '#/boxes' };
globalThis.window = {
  addEventListener: () => {},
};

const { EntityStore } = await import('../../site/js/data/entity-store.js');
const { AppStore } = await import('../../site/js/state/app-store.js');
const { createSubscriptionSet } = await import('../../site/js/state/subscription-set.js');

test('SubscriptionSet unsubscribes cleanly and isolates listener failures', () => {
  const originalConsoleError = console.error;
  const errors = [];
  const delivered = [];
  console.error = (...args) => errors.push(args);
  const subscriptions = createSubscriptionSet('TestState');
  const unsubscribeFailing = subscriptions.subscribe(() => {
    throw new Error('listener failed');
  });
  const unsubscribeHealthy = subscriptions.subscribe(() => delivered.push('healthy'));

  try {
    subscriptions.notify();
    unsubscribeHealthy();
    subscriptions.notify();
    assert.deepEqual(delivered, ['healthy']);
    assert.equal(errors.length, 2);
  } finally {
    unsubscribeFailing();
    unsubscribeHealthy();
    console.error = originalConsoleError;
  }
});

test('EntityStore notifies only the changed slice with precise metadata', () => {
  const inventoryEvents = [];
  const buildEvents = [];
  const unsubscribeInventory = EntityStore.subscribe('inventory', (event) => inventoryEvents.push(event));
  const unsubscribeBuilds = EntityStore.subscribe('builds', (event) => buildEvents.push(event));

  const inventory = { boxes: [] };
  EntityStore.replace('inventory', inventory);
  EntityStore.replace('inventory', inventory, {
    kind: 'upsert',
    boxes: [2],
    slots: [{ boxId: 2, slotIdx: 4 }],
  });

  assert.equal(inventoryEvents.length, 2);
  assert.equal(buildEvents.length, 0);
  assert.equal(inventoryEvents[1].value, inventory);
  assert.deepEqual(inventoryEvents[1].change.slots, [{ boxId: 2, slotIdx: 4 }]);
  assert.equal(EntityStore.getVersion('inventory'), inventoryEvents[1].version);

  unsubscribeInventory();
  unsubscribeBuilds();
});

test('EntityStore queues nested events until current delivery completes', () => {
  const order = [];
  const unsubscribeFirst = EntityStore.subscribe('teams', (event) => {
    order.push(`first:${event.version}`);
    if (event.change.kind === 'outer') {
      EntityStore.replace('teams', teams, { kind: 'nested' });
    }
  });
  const unsubscribeSecond = EntityStore.subscribe('teams', (event) => {
    order.push(`second:${event.version}`);
  });

  const teams = [];
  EntityStore.replace('teams', teams, { kind: 'outer' });

  assert.deepEqual(order, ['first:1', 'second:1', 'first:2', 'second:2']);
  unsubscribeFirst();
  unsubscribeSecond();
});

test('EntityStore isolates listener failures after a committed mutation', () => {
  const originalConsoleError = console.error;
  const errors = [];
  let delivered = false;
  console.error = (...args) => errors.push(args);
  const unsubscribeFailing = EntityStore.subscribe('builds', () => {
    throw new Error('listener failed');
  });
  const unsubscribeHealthy = EntityStore.subscribe('builds', () => {
    delivered = true;
  });

  try {
    assert.doesNotThrow(() => EntityStore.replace('builds', [], { kind: 'upsert' }));
    assert.equal(delivered, true);
    assert.equal(errors.length, 1);
  } finally {
    unsubscribeFailing();
    unsubscribeHealthy();
    console.error = originalConsoleError;
  }
});

test('AppStore selector subscriptions ignore unrelated state changes', () => {
  const searchValues = [];
  const unsubscribe = AppStore.subscribe(
    (state) => state.query.byRoute.boxes.search,
    (value) => searchValues.push(value)
  );

  AppStore.setDetailOpen(true);
  AppStore.setBrowserSearchQuery('boxes', 'Pikachu');
  AppStore.setDetailOpen(false);
  AppStore.setBrowserSearchQuery('boxes', 'Pikachu');
  AppStore.setBrowserSearchQuery('teams', 'Rain');

  assert.deepEqual(searchValues, ['Pikachu']);
  unsubscribe();
});
