import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadScript(relPath, sandbox) {
  const filePath = path.join(ROOT, relPath);
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(source, sandbox, { filename: filePath });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createSandbox() {
  const pokedex = {
    1: { id: 1, num: 1, name: 'Bulbasaur', types: ['Grass', 'Poison'], slug: 'bulbasaur' },
  };
  const build = {
    id: 'build-1',
    species: 'Bulbasaur',
    slug: 'bulbasaur',
    item: 'Miracle Seed',
    ability: 'Overgrow',
    nature: 'Modest',
    moves: ['Giga Drain', 'Protect', 'Sludge Bomb', 'Sleep Powder'],
    evs: {
      champions: { hp: 32, spa: 32, spe: 2 },
    },
  };

  const sandbox = vm.createContext({
    console,
    window: {},
    DataManager: {
      isInGame(slug, game) {
        return slug === 'bulbasaur' && ['champions', 'sv', 'legends-za'].includes(game);
      },
      isInChampions(id) {
        return id === 1;
      },
      getPokedexEntry(value) {
        if (value === 1 || value === 'bulbasaur') return pokedex[1];
        return null;
      },
      getSpriteUrl(slug) {
        return `sprite:${slug}`;
      },
      getBuild(id) {
        return id === build.id ? build : null;
      },
      getInstancesTargeting(id) {
        return id === build.id ? [{ box: 0, slot: 0, target_build_id: build.id }] : [];
      },
      anyInstanceMatchesBuild(candidate) {
        return { ready: candidate?.id === build.id, reason: null };
      },
    },
  });
  sandbox.window = sandbox;
  return sandbox;
}

function main() {
  const sandbox = createSandbox();
  loadScript(path.join('site', 'js', 'ui-models.js'), sandbox);
  loadScript(path.join('site', 'js', 'search-state.js'), sandbox);

  const { UIModels, SearchState } = sandbox;

  assert(UIModels, 'UIModels did not load');
  assert(SearchState, 'SearchState did not load');

  const games = UIModels.getGameCatalog();
  assert(games.length === 4, 'Expected exactly four games in the canonical catalog');
  assert(new Set(games.map((game) => game.key)).size === games.length, 'Game catalog keys must be unique');
  assert(games.map((game) => game.key).join(',') === 'champions,sv,legends-arceus,legends-za', 'Game catalog keys changed unexpectedly');

  const emptyStatus = UIModels.evaluateBuildStatus({});
  assert(emptyStatus.profileState === 'empty', 'Empty build should have empty profile state');
  assert(emptyStatus.targetReady === false, 'Empty build should not be target-ready');

  const partialStatus = UIModels.evaluateBuildStatus({
    nature: 'Modest',
    ability: 'Overgrow',
    moves: ['Giga Drain'],
  });
  assert(partialStatus.profileState === 'complete', 'Nature + ability + at least one move should be profile-complete');
  assert(partialStatus.targetReady === false, 'One-move build should not be target-ready');

  const readyStatus = UIModels.evaluateBuildStatus({
    nature: 'Modest',
    ability: 'Overgrow',
    moves: ['Giga Drain', 'Protect', 'Sludge Bomb', 'Sleep Powder'],
    evs: { champions: { hp: 32, spa: 32, spe: 2 } },
  }, { owned: true, battleReady: true });
  assert(readyStatus.targetReady === true, 'Full Champions spread should be target-ready');
  assert(readyStatus.badgeKey === 'battle-ready', 'Battle-ready status should win the status badge');

  const instanceEntry = UIModels.buildInventoryEntryView({
    box: 0,
    slot: 0,
    species_id: 1,
    species_slug: 'bulbasaur',
    target_build_id: 'build-1',
    state: {
      nature: 'Modest',
      ability: 'Overgrow',
      item: 'Miracle Seed',
      moves: ['Giga Drain'],
      transferred_to_champions: true,
    },
    location: { box_name: 'Box 1', slot: 0 },
  });
  assert(instanceEntry.compatibleGames.includes('champions'), 'Inventory entry should include compatible games');
  assert(instanceEntry.status.transferredToChampions === true, 'Inventory entry should carry transfer state');

  const buildEntry = UIModels.buildLibraryBuildEntryView({
    id: 'build-1',
    species: 'Bulbasaur',
    slug: 'bulbasaur',
    item: 'Miracle Seed',
    ability: 'Overgrow',
    nature: 'Modest',
    moves: ['Giga Drain', 'Protect', 'Sludge Bomb', 'Sleep Powder'],
    evs: { champions: { hp: 32, spa: 32, spe: 2 } },
  });
  assert(buildEntry.status.badgeKey === 'battle-ready', 'Library build entry should inherit battle-ready status');
  assert(UIModels.matchesSearch(buildEntry.searchText, 'bulba'), 'Search helper should match normalized entry text');

  const events = [];
  const unsubscribe = SearchState.subscribe(({ query }) => events.push(query));
  SearchState.setQuery('Bulba');
  SearchState.setQuery('Bulba');
  SearchState.clear();
  unsubscribe();
  assert(events.length === 2, 'SearchState should emit on change and clear only');
  assert(events[0] === 'Bulba' && events[1] === '', 'SearchState emitted unexpected query transitions');

  console.log('Phase 1 contract validation passed.');
}

main();
