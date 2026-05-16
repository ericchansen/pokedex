import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadScript(relPath, sandbox) {
  const filePath = path.join(ROOT, relPath);
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(source, sandbox, { filename: filePath });
}

function createSandbox() {
  const sandbox = vm.createContext({
    console,
    window: {},
    module: { exports: {} },
    exports: {},
  });
  sandbox.window = sandbox;
  return sandbox;
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

function runShowdownFixtures() {
  const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'showdown-roundtrip.json'), 'utf8'));
  const sandbox = createSandbox();
  loadScript(path.join('site', 'js', 'domain-mappers.js'), sandbox);
  loadScript(path.join('site', 'js', 'team-export.js'), sandbox);
  loadScript(path.join('site', 'js', 'showdown-parser.js'), sandbox);
  vm.runInContext('window.__phase5Showdown = { DomainMappers, TeamExportFormatter, ShowdownParser };', sandbox);

  const { TeamExportFormatter, ShowdownParser, DomainMappers } = sandbox.window.__phase5Showdown || {};
  assert(TeamExportFormatter && ShowdownParser && DomainMappers, 'Showdown fixture sandbox did not load required modules');

  for (const fixture of fixtures.cases) {
    const text = TeamExportFormatter.formatMember(fixture.member, fixture.target);
    assert(text === fixture.expectedText, `Showdown export drift for ${fixture.name}`);
    const parsed = ShowdownParser.parseSet(text);
    assertSubset(parsed, fixture.expectedParsed, `parsed ${fixture.name}`);
  }
}

function runDomainContracts() {
  const sandbox = createSandbox();
  loadScript(path.join('site', 'js', 'domain-mappers.js'), sandbox);
  vm.runInContext('window.__phase5Domain = { DomainMappers };', sandbox);
  const { DomainMappers } = sandbox.window.__phase5Domain || {};
  assert(DomainMappers, 'DomainMappers did not load');

  const flatClassic = DomainMappers.getEvsForSystem({ evs: { hp: 252, atk: 4 } }, 'classic');
  assert(flatClassic === null, 'Flat EV objects should no longer be accepted as canonical runtime input');

  const team = DomainMappers.createTeamStorage({
    ev_system: 'classic',
    members: [{ slot: 1, build_id: 'build-1' }],
  });
  assert(!Object.prototype.hasOwnProperty.call(team, 'evs_migration_needed'), 'Team storage should not include evs_migration_needed');
  assert(team.members.length === 1, 'Canonical team refs should survive createTeamStorage');
  assert(team.members[0].build_id === 'build-1', 'Canonical team refs should preserve build_id');
  assert(Object.keys(team.members[0]).length === 2, 'Canonical team refs should only persist slot and build_id');
}

function runFingerprintFixtures() {
  const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'build-fingerprint.json'), 'utf8'));
  const sandbox = createSandbox();
  loadScript(path.join('site', 'js', 'buildFingerprint.js'), sandbox);
  vm.runInContext('window.__phase5Fingerprint = { BuildFingerprint };', sandbox);

  const jsFingerprint = sandbox.window.__phase5Fingerprint?.BuildFingerprint?.buildFingerprint || sandbox.module?.exports?.buildFingerprint;
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

function main() {
  runShowdownFixtures();
  runDomainContracts();
  runFingerprintFixtures();
  console.log('Phase 5 contract validation passed.');
}

main();
