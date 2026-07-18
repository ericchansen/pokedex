import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function importModule(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

function assertSubset(actual, expected, label) {
  if (Array.isArray(expected)) {
    assert(Array.isArray(actual), `${label} should be an array`);
    assert(actual.length === expected.length, `${label} length mismatch: expected ${expected.length}, got ${actual.length}`);
    expected.forEach((item, index) => assertSubset(actual[index], item, `${label}[${index}]`));
    return;
  }

  if (expected && typeof expected === 'object') {
    assert(actual && typeof actual === 'object', `${label} should be an object`);
    for (const [key, value] of Object.entries(expected)) {
      assertSubset(actual[key], value, `${label}.${key}`);
    }
    return;
  }

  assert(Object.is(actual, expected), `${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function runShowdownFixtures() {
  const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'showdown-roundtrip.json'), 'utf8'));
  const [{ TeamExportFormatter }, { ShowdownParser }, { DomainMappers }] = await Promise.all([
    importModule(path.join('site', 'js', 'team-export.js')),
    importModule(path.join('site', 'js', 'showdown-parser.js')),
    importModule(path.join('site', 'js', 'domain-mappers.js')),
  ]);
  assert(TeamExportFormatter && ShowdownParser && DomainMappers, 'Showdown fixture sandbox did not load required modules');

  for (const fixture of fixtures.cases) {
    const text = TeamExportFormatter.formatMember(fixture.member, fixture.target);
    assert(text === fixture.expectedText, `Showdown export drift for ${fixture.name}`);
    const parsed = ShowdownParser.parseSet(text);
    assertSubset(parsed, fixture.expectedParsed, `parsed ${fixture.name}`);
  }
}

async function runDomainContracts() {
  const { DomainMappers } = await importModule(path.join('site', 'js', 'domain-mappers.js'));
  assert(DomainMappers, 'DomainMappers did not load');

  const flatClassic = DomainMappers.getEvsForSystem({ evs: { hp: 252, atk: 4 } }, 'classic');
  assert(flatClassic === null, 'Flat EV objects should no longer be accepted as canonical runtime input');

  const importedTeamMember = DomainMappers.createTeamStorageMember({
    species: 'Iron Bundle',
    evs: { spa: 252, spe: 252 },
    ivs: { atk: 0 },
  }, 'classic');
  assert(
    JSON.stringify(importedTeamMember.evs) === JSON.stringify({
      classic: { spa: 252, spe: 252 },
      classic_ivs: { atk: 0 },
    }),
    'Team input boundaries must convert flat EV/IV spreads into canonical structured data'
  );

  const team = DomainMappers.createTeamStorage({
    ev_system: 'classic',
    members: [{ slot: 1, build_id: 'build-1' }],
  });
  assert(!Object.prototype.hasOwnProperty.call(team, 'evs_migration_needed'), 'Team storage should not include evs_migration_needed');
  assert(team.members.length === 1, 'Canonical team refs should survive createTeamStorage');
  assert(team.members[0].build_id === 'build-1', 'Canonical team refs should preserve build_id');
  assert(Object.keys(team.members[0]).length === 2, 'Canonical team refs should only persist slot and build_id');
}

async function runFingerprintFixtures() {
  const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'build-fingerprint.json'), 'utf8'));
  const { BuildFingerprint } = await importModule(path.join('site', 'js', 'buildFingerprint.js'));
  const jsFingerprint = BuildFingerprint?.buildFingerprint;
  assert(jsFingerprint, 'JS build fingerprint helper did not load');

  const pythonSource = `
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(root / "api"))
from domain.build_fingerprint import build_fingerprint

payload = json.loads(sys.stdin.read())
print(build_fingerprint(payload.get("build") or {}, payload.get("egg_moves") or []))
`.trim();

  for (const fixture of fixtures.cases) {
    assert(fixture.expectedHash && fixture.expectedHash !== '__TO_FILL__', `Fingerprint fixture ${fixture.name} is missing expectedHash`);
    const jsHash = jsFingerprint(fixture.build, fixture.egg_moves);
    assert(jsHash === fixture.expectedHash, `JS fingerprint drift for ${fixture.name}`);

    const pythonHash = execFileSync('python', ['-c', pythonSource, ROOT], {
      cwd: ROOT,
      input: JSON.stringify({
        build: fixture.build,
        egg_moves: fixture.egg_moves,
      }),
      encoding: 'utf8',
    }).trim();
    assert(pythonHash === fixture.expectedHash, `Python fingerprint drift for ${fixture.name}`);
  }
}

async function main() {
  await runShowdownFixtures();
  await runDomainContracts();
  await runFingerprintFixtures();
  console.log('Phase 5 contract validation passed.');
}

await main();
