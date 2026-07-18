import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startDevServer } from './helpers/dev-server.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const consoleErrors = [];
const pageErrors = [];
const moduleRequests = new Set();
const referenceRequests = new Set();

let server;
let browser;
let page;

before(async () => {
  server = await startDevServer(repoRoot);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('.js')) moduleRequests.add(url.pathname);
    if (/\/data\/reference\/(?:moves|items|abilities)\.json$/.test(url.pathname)) {
      referenceRequests.add(url.pathname);
    }
  });
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

test('loads the application and navigates every top-level route', async (context) => {
  await page.goto(server.url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#view-boxes');
  const initialModuleCount = moduleRequests.size;
  assert.deepEqual([...referenceRequests], []);

  const routes = [
    ['inventory', '#view-inventory'],
    ['builds', '#view-builds'],
    ['teams', '#view-teams'],
    ['settings', '.settings-page'],
    ['boxes', '#view-boxes'],
  ];

  for (const [route, selector] of routes) {
    await page.locator(`[data-view="${route}"]`).click();
    await page.waitForSelector(selector);
    assert.equal(new URL(page.url()).hash, `#/${route}`);
  }

  context.diagnostic(`Boxes startup loaded ${initialModuleCount} JavaScript modules; all routes loaded ${moduleRequests.size}.`);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
});

test('keeps route search state isolated and restores it on navigation', async () => {
  await page.locator('[data-view="boxes"]').click();
  await page.waitForSelector('#view-boxes');
  const search = page.locator('#search-input');
  await search.fill('Pikachu');
  await page.waitForTimeout(200);

  await page.locator('[data-view="inventory"]').click();
  await page.waitForSelector('#view-inventory');
  assert.equal(await search.inputValue(), '');
  await search.fill('Eevee');
  await page.waitForTimeout(200);
  await page.evaluate(async () => {
    const { SearchState } = await import('/js/search-state.js');
    SearchState.clear();
  });
  assert.equal(await search.inputValue(), '');

  await page.locator('[data-view="boxes"]').click();
  await page.waitForSelector('#view-boxes');
  assert.equal(await search.inputValue(), 'Pikachu');
});

test('keeps team selection controls current without dropping focus', async () => {
  const result = await page.evaluate(async () => {
    const [{ Selection }, { TeamSurfaces }] = await Promise.all([
      import('/js/selection.js'),
      import('/js/team-surfaces.js'),
    ]);
    Selection.clear();
    const host = document.createElement('div');
    host.id = 'teams-container';
    document.body.appendChild(host);
    const team = {
      id: 'focus-team',
      source: 'user',
      name: 'Focus Team',
      members: [{ species: 'Pikachu', build_id: 'focus-build' }],
    };

    TeamSurfaces.renderTeams([team]);
    const firstButton = host.querySelector('.team-select-toggle');
    firstButton.focus();
    firstButton.click();
    TeamSurfaces.renderTeams([team]);
    const selectedButton = host.querySelector('.team-select-toggle');
    const selected = {
      label: selectedButton?.textContent,
      badgeCount: host.querySelectorAll('.sprite-select-badge').length,
      focused: document.activeElement === selectedButton,
    };

    selectedButton?.click();
    TeamSurfaces.renderTeams([team]);
    const clearedButton = host.querySelector('.team-select-toggle');
    const cleared = {
      label: clearedButton?.textContent,
      badgeCount: host.querySelectorAll('.sprite-select-badge').length,
      focused: document.activeElement === clearedButton,
    };
    host.remove();
    Selection.clear();
    return { selected, cleared };
  });

  assert.deepEqual(result.selected, {
    label: 'Deselect all',
    badgeCount: 1,
    focused: true,
  });
  assert.deepEqual(result.cleared, {
    label: 'Select all 1',
    badgeCount: 0,
    focused: true,
  });
});

test('updates Builds incrementally without reloading data or replacing unchanged rows', async () => {
  const reloadRequests = [];
  const trackReloads = (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/builds' && request.method() === 'GET') reloadRequests.push(url.pathname);
  };
  page.on('request', trackReloads);
  try {
    await page.locator('[data-view="builds"]').click();
    await page.waitForSelector('#view-builds');
    const firstId = await page.evaluate(async () => {
      const { DataManager } = await import('/js/data.js');
      const build = await DataManager.createBuild({
        species: 'Pikachu',
        slug: 'pikachu',
        nature: 'Timid',
        ability: 'Static',
        moves: ['Thunderbolt'],
        ev_system: 'classic',
        evs: { classic: { spa: 252, spe: 252 } },
      });
      return build.id;
    });
    const firstRow = page.locator('.inventory-row[data-search-text*="pikachu"]');
    await firstRow.waitFor();
    await firstRow.evaluate((row) => { row.dataset.nodeMarker = 'preserved'; });

    const secondId = await page.evaluate(async () => {
      const { DataManager } = await import('/js/data.js');
      const build = await DataManager.createBuild({
        species: 'Bulbasaur',
        slug: 'bulbasaur',
        nature: 'Timid',
        ability: 'Overgrow',
        moves: ['Thunderbolt'],
        ev_system: 'classic',
        evs: { classic: { hp: 252, spe: 252 } },
      });
      return build.id;
    });
    await page.waitForSelector('.inventory-row[data-search-text*="bulbasaur"]');

    assert.equal(await firstRow.getAttribute('data-node-marker'), 'preserved');
    assert.equal(await page.locator('.inventory-row').count(), 2);
    assert.deepEqual(reloadRequests, []);

    await page.evaluate(async ([firstBuildId, secondBuildId]) => {
      const { DataManager } = await import('/js/data.js');
      await DataManager.deleteBuild(firstBuildId);
      await DataManager.deleteBuild(secondBuildId);
    }, [firstId, secondId]);
  } finally {
    page.off('request', trackReloads);
  }
});

test('cancelling a confirmation leaves the underlying detail panel open', async () => {
  await page.evaluate(async () => {
    const [{ DetailPanel }, { Feedback }] = await Promise.all([
      import('/js/ui/surfaces/detail-panel.js'),
      import('/js/ui/feedback.js'),
    ]);
    DetailPanel.open('<button type="button">Panel action</button>');
    void Feedback.showConfirm('Cancel this confirmation?');
  });
  await page.waitForSelector('.dialog-modal');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.dialog-modal', { state: 'detached' });
  assert.equal(await page.locator('#detail-panel').getAttribute('aria-hidden'), 'false');
  await page.evaluate(async () => {
    const { DetailPanel } = await import('/js/ui/surfaces/detail-panel.js');
    await DetailPanel.close();
  });
});

test('does not reopen a delayed Pokemon viewer after navigation', async () => {
  const delayedPage = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const delayedErrors = [];
  delayedPage.on('pageerror', (error) => delayedErrors.push(error.message));
  await delayedPage.route('**/data/reference/moves.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  try {
    await delayedPage.goto(server.url, { waitUntil: 'domcontentloaded' });
    await delayedPage.waitForSelector('#view-boxes');
    await delayedPage.evaluate(() => {
      void import('/js/pokemon-viewer.js').then(({ PokemonViewer }) => {
        void PokemonViewer.openPokemonViewer({ slug: 'pikachu' });
      });
    });
    await delayedPage.waitForTimeout(100);
    await delayedPage.locator('[data-view="settings"]').click();
    await delayedPage.waitForSelector('.settings-page');
    await delayedPage.waitForTimeout(900);
    assert.equal(await delayedPage.locator('#detail-panel').getAttribute('aria-hidden'), 'true');
    assert.deepEqual(delayedErrors, []);
  } finally {
    await delayedPage.close();
  }
});

test('does not reopen a build editor closed during its lazy import', async () => {
  const delayedPage = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const delayedErrors = [];
  delayedPage.on('pageerror', (error) => delayedErrors.push(error.message));
  await delayedPage.route('**/js/build-editor.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  try {
    await delayedPage.goto(server.url, { waitUntil: 'domcontentloaded' });
    await delayedPage.waitForSelector('#view-boxes');
    await delayedPage.evaluate(async () => {
      const { PokemonViewer } = await import('/js/pokemon-viewer.js');
      await PokemonViewer.openPokemonViewer({ slug: 'pikachu' });
    });
    await delayedPage.locator('#new-build-species-btn').click();
    await delayedPage.waitForTimeout(100);
    await delayedPage.keyboard.press('Escape');
    await delayedPage.waitForTimeout(900);
    assert.equal(await delayedPage.locator('#detail-panel').getAttribute('aria-hidden'), 'true');
    assert.equal(await delayedPage.locator('#build-form').count(), 0);
    assert.deepEqual(delayedErrors, []);
  } finally {
    await delayedPage.close();
  }
});
