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

function main() {
  const sandbox = vm.createContext({
    console,
    window: {},
  });
  sandbox.window = sandbox;

  loadScript(path.join('site', 'js', 'domain-mappers.js'), sandbox);

  const { DomainMappers } = sandbox;
  assert(DomainMappers, 'DomainMappers did not load');

  const structuredClassic = DomainMappers.normalizeStructuredEvs({
    classic: {
      hp: 4,
      spa: 252,
      spe: 252,
    },
  }, { evSystem: 'classic' });
  assert(structuredClassic.classic.hp === 4, 'Nested classic EVs should normalize into evs.classic');
  assert(!structuredClassic.champions, 'Classic normalization should not create champions EVs');

  const structuredChampions = DomainMappers.normalizeStructuredEvs({
    champions: {
      hp: 32,
      spa: 32,
      spe: 2,
    },
  }, { evSystem: 'champions' });
  assert(structuredChampions.champions.hp === 32, 'Nested champions EVs should normalize into evs.champions');

  const flatClassic = DomainMappers.normalizeStructuredEvs({
    hp: 4,
    spa: 252,
    spe: 252,
  }, { evSystem: 'classic' });
  assert(!flatClassic.classic, 'Flat classic EVs should no longer be treated as canonical runtime input');

  const buildDraft = DomainMappers.createEditableBuildDraft({
    species: 'Gardevoir',
    slug: 'gardevoir',
    nature: 'Timid',
    ability: 'Trace',
    item: 'Choice Scarf',
    ev_system: 'classic',
    evs: {
      classic: { spa: 252, spe: 252, hp: 4 },
      classic_ivs: { atk: 0 },
    },
    moves: ['Moonblast', 'Psychic', 'Trick', 'Dazzling Gleam'],
    egg_moves: ['Memento', 'Destiny Bond', 'Memento'],
  }, { kind: 'library' });
  assert(buildDraft.kind === 'library', 'Build draft should keep requested kind');
  assert(buildDraft.evs.classic.spa === 252, 'Build draft should preserve nested classic EVs');
  assert(buildDraft.ivs.atk === 0, 'Build draft should expose classic IVs at the top level');
  assert(buildDraft.egg_moves.length === 2, 'Build draft should normalize and dedupe egg moves');

  const mergedState = DomainMappers.mergeBuildPayloadIntoState({
    id: 'instance-1',
    kind: 'instance',
    species: 'Pikachu',
    slug: 'pikachu',
    nature: 'Jolly',
    ability: 'Static',
    ev_system: 'champions',
    evs: { champions: { atk: 32, spe: 32, hp: 2 } },
    moves: ['Volt Tackle'],
    egg_moves: ['Fake Out'],
    transferred_to_champions: false,
  }, {
    item: 'Light Ball',
    moves: ['Volt Tackle', 'Fake Out'],
    egg_moves: ['Fake Out', 'Present'],
    ev_system: 'classic',
    evs: {
      classic: { hp: 4, atk: 252, spe: 252 },
      classic_ivs: { spa: 0 },
    },
    ivs: { spa: 0 },
    transferred_to_champions: true,
  });
  assert(mergedState.id === 'instance-1', 'Merged instance state should preserve id');
  assert(mergedState.kind === 'instance', 'Merged instance state should preserve kind');
  assert(mergedState.item === 'Light Ball', 'Merged instance state should apply new scalar fields');
  assert(mergedState.evs.classic.atk === 252, 'Merged instance state should normalize incoming EVs');
  assert(mergedState.ivs.spa === 0, 'Merged instance state should carry incoming IVs');
  assert(mergedState.transferred_to_champions === true, 'Merged instance state should keep identity fields in state');
  assert(mergedState.egg_moves.length === 2, 'Merged instance state should normalize egg moves');

  const promotedCandidate = DomainMappers.createLibraryBuildCandidateFromInstance({
    species_id: 'pikachu',
    state: mergedState,
  });
  assert(promotedCandidate.egg_moves.length === 2, 'Promoted library candidate should carry instance egg moves');
  assert(promotedCandidate.egg_moves.includes('Present'), 'Promoted library candidate should preserve normalized egg moves');

  const teamMemberStorage = DomainMappers.createTeamStorageMember({
    slot: 1,
    build_id: 'build-1',
    species: 'Gardevoir',
    item: 'Choice Scarf',
    ability: 'Trace',
    nature: 'Timid',
    evs: {
      classic: { spa: 252, spe: 252, hp: 4 },
      classic_ivs: { atk: 0 },
    },
    ivs: { atk: 0 },
    moves: ['Moonblast', 'Psychic', 'Trick', 'Dazzling Gleam'],
  }, 'classic');
  assert(teamMemberStorage.build_id === 'build-1', 'Team storage member should preserve build_id');
  assert(teamMemberStorage.evs.classic.spa === 252, 'Team storage member should store active EVs under the team system');
  assert(teamMemberStorage.evs.classic_ivs.atk === 0, 'Team storage member should nest classic IVs inside evs.classic_ivs');

  const buildLookup = (id) => id === 'build-1' ? {
    id: 'build-1',
    slug: 'gardevoir',
    species: 'Gardevoir',
    nature: 'Timid',
    ability: 'Trace',
    item: 'Choice Scarf',
    evs: {
      classic: { hp: 4, spa: 252, spe: 252 },
      classic_ivs: { atk: 0 },
    },
    moves: ['Moonblast', 'Psychic', 'Trick', 'Dazzling Gleam'],
  } : null;

  const teamView = DomainMappers.createTeamViewModel({
    id: 'team-1',
    name: 'Scarf Gard Team',
    ev_system: 'classic',
    members: [
      {
        slot: 1,
        build_id: 'build-1',
      },
    ],
  }, { buildLookup });
  assert(teamView.members.length === 1, 'Team view model should preserve member count');
  assert(teamView.members[0].species === 'Gardevoir', 'Team view model should hydrate species from linked build');
  assert(teamView.members[0].evs.classic.spa === 252, 'Team view model should keep nested EVs on the member');
  assert(teamView.members[0].build_id === 'build-1', 'Team view model should preserve build linkage');

  const exportMember = DomainMappers.toExportMember(teamView.members[0], 'classic');
  assert(exportMember.evs.spa === 252, 'Export member should flatten the requested EV system');
  assert(exportMember.ivs.atk === 0, 'Export member should flatten IVs for classic exports');

  console.log('Phase 2 contract validation passed.');
}

main();
