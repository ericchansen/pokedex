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
  if (!condition) throw new Error(message);
}

function main() {
  const sandbox = vm.createContext({
    console,
    window: {},
  });
  sandbox.window = sandbox;

  loadScript(path.join('site', 'js', 'species-resolver.js'), sandbox);

  const { SpeciesResolver } = sandbox;
  assert(SpeciesResolver, 'SpeciesResolver did not load');

  const entries = [
    { num: 25, slug: 'pikachu', name: 'Pikachu', types: ['Electric'], baseStats: { spe: 90 } },
    { num: 25, slug: 'pikachu-original', name: 'Pikachu-Original', baseSpecies: 'Pikachu', forme: 'Original', types: ['Electric'] },
    { num: 122, slug: 'mrmime', name: 'Mr. Mime', types: ['Psychic', 'Fairy'] },
    { num: 396, slug: 'starly', name: 'Starly', types: ['Normal', 'Flying'] },
    { num: 666, slug: 'vivillon', name: 'Vivillon', types: ['Bug', 'Flying'] },
    { num: 666, slug: 'vivillonpolar', name: 'Vivillon-Polar', baseSpecies: 'Vivillon', forme: 'Polar', types: ['Bug', 'Flying'] },
    { num: 869, slug: 'alcremie', name: 'Alcremie', types: ['Fairy'] },
  ];

  const ctx = {
    entries,
    entryByNum: new Map(entries.filter((entry) => !entry.baseSpecies).map((entry) => [entry.num, entry])),
    entryBySlug: new Map(entries.map((entry) => [entry.slug, entry])),
    aliasToSlug: SpeciesResolver.buildAliasMap(entries),
  };

  const mime = SpeciesResolver.resolve('Mr Mime', ctx);
  assert(mime.slug === 'mrmime', 'Resolver should canonicalize base-species aliases to actual Showdown slug');

  const originalPikachu = SpeciesResolver.resolve('pikachuoriginal', ctx);
  assert(originalPikachu.slug === 'pikachu-original', 'Resolver should recover hyphenated form slugs from collapsed aliases');
  assert(SpeciesResolver.matchesPreset('pikachuoriginal', 'pikachu-original', ctx), 'Preset matching should use canonical form identity');

  const alcremie = SpeciesResolver.resolve('alcremie-vanilla-cream', ctx);
  assert(alcremie.slug === 'alcremie', 'Resolver should fall back to base species when a cosmetic form is missing');
  assert(alcremie.spriteCandidates[0] === 'alcremie-vanilla-cream', 'Missing cosmetic forms should preserve the requested raw sprite token first');
  assert(alcremie.spriteCandidates.includes('alcremie'), 'Sprite candidates should include the canonical base fallback');

  const femaleFallback = SpeciesResolver.resolve('starly-f', ctx);
  assert(femaleFallback.slug === 'starly', 'Cosmetic gender aliases should keep base-species identity');
  assert(femaleFallback.displayName === 'Starly Female', 'Cosmetic gender aliases should preserve a useful display label');
  assert(femaleFallback.spriteCandidates[0] === 'starly-f', 'Cosmetic gender aliases should prefer the requested female sprite before base fallback');

  const vivillonPolar = SpeciesResolver.resolve('vivillon-polar', ctx);
  assert(vivillonPolar.slug === 'vivillonpolar', 'Resolver should recover collapsed canonical slugs for explicit form aliases');
  assert(vivillonPolar.spriteCandidates[0] === 'vivillon-polar', 'Form sprite candidates should prefer the Showdown hyphenated asset slug');

  const searchResults = SpeciesResolver.search('mr mime', ctx);
  assert(searchResults[0]?.slug === 'mrmime', 'Search should rank canonical alias matches ahead of looser results');

  const spriteCandidates = SpeciesResolver.getSpriteCandidates('Pikachu-Original', ctx);
  assert(spriteCandidates[0] === 'pikachu-original', 'Sprite candidates should start with the canonical resolved slug');
  assert(spriteCandidates.includes('pikachu'), 'Sprite candidates should include the base-species fallback');

  const objectSpriteCandidates = SpeciesResolver.getSpriteCandidates({ slug: 'pikachu-original', num: 25 }, ctx);
  assert(objectSpriteCandidates[0] === 'pikachu-original', 'Object inputs should preserve form sprite candidates instead of collapsing through dex number');

  console.log('Phase 3 contract validation passed.');
}

main();
