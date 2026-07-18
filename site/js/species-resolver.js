/**
 * species-resolver.js - Canonical species identity, preset matching, and sprite fallback helpers.
 *
 * Pure helper layer. Callers pass the current pokedex indexes / entries.
 */
import { FormMetadata } from './form-metadata.js';
import { GENDER_SPRITE_SPECIES } from './species-constants.js';

export const SpeciesResolver = (() => {
  /** @param {import('./types/contracts.js').InputValue} value */
  function normalizeHyphenSlug(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[''.]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  }

  /** @param {import('./types/contracts.js').InputValue} value */
  function normalizeCollapsedSlug(value) {
    return normalizeHyphenSlug(value).replace(/-/g, '');
  }

  /** @param {Array<string|null|undefined|false>} values */
  function unique(values) {
    /** @type {string[]} */
    const present = [];
    for (const value of values || []) {
      if (value) present.push(value);
    }
    return [...new Set(present)];
  }

  /** @param {import('./types/contracts.js').InputValue} value */
  function prettifyName(value) {
    const parts = normalizeHyphenSlug(value).split('-').filter(Boolean);
    return parts.join(' ').replace(/\b\w/g, (match) => match.toUpperCase());
  }

  /** @param {string[]} out @param {import('./types/contracts.js').InputValue} value */
  function pushSlugVariants(out, value) {
    const hyphen = normalizeHyphenSlug(value);
    const collapsed = normalizeCollapsedSlug(value);
    if (hyphen) out.push(hyphen);
    if (collapsed && collapsed !== hyphen) out.push(collapsed);
  }

  /**
   * @param {string[]} out
   * @param {import('./types/contracts.js').PokedexEntry|null|undefined} entry
   * @param {import('./types/contracts.js').PokedexEntry|null|undefined} baseEntry
   */
  function pushFormSpriteVariants(out, entry, baseEntry) {
    if (!entry?.baseSpecies || !entry?.forme) return;
    const baseSlug = baseEntry?.slug || normalizeCollapsedSlug(entry.baseSpecies);
    const formeSlug = normalizeHyphenSlug(entry.forme);
    if (!baseSlug || !formeSlug) return;
    const collapsedForme = formeSlug.replace(/-/g, '');
    // Collapsed forme first — Showdown uses base-collapsedForme (e.g. toxtricity-lowkey)
    out.push(`${baseSlug}-${collapsedForme}`);
    out.push(`${baseSlug}-${formeSlug}`);
    out.push(`${baseSlug}${collapsedForme}`);
  }

  /**
   * @param {string} key
   * @param {import('./types/contracts.js').SpeciesResolverContext} ctx
   */
  function probeEntry(key, ctx) {
    if (!key) return null;
    if (ctx.entryBySlug?.has(key)) return ctx.entryBySlug.get(key);
    const aliasSlug = ctx.aliasToSlug?.get(key);
    if (aliasSlug && ctx.entryBySlug?.has(aliasSlug)) {
      return ctx.entryBySlug.get(aliasSlug);
    }
    return null;
  }

  /**
   * @param {import('./types/contracts.js').InputValue} raw
   * @param {import('./types/contracts.js').SpeciesResolverContext} ctx
   */
  function resolveStringEntry(raw, ctx) {
    /** @type {string[]} */
    const exactKeys = [];
    pushSlugVariants(exactKeys, raw);
    for (const key of unique([String(raw || '').toLowerCase(), ...exactKeys])) {
      const entry = probeEntry(key, ctx);
      if (entry) return { entry, matchedDirect: true };
    }

    const hyphen = normalizeHyphenSlug(raw);
    const parts = hyphen.split('-').filter(Boolean);
    for (let i = parts.length - 1; i >= 1; i -= 1) {
      const fallback = parts.slice(0, i).join('-');
      /** @type {string[]} */
      const fallbackKeys = [];
      pushSlugVariants(fallbackKeys, fallback);
      for (const key of unique([fallback, ...fallbackKeys])) {
        const entry = probeEntry(key, ctx);
        if (entry) return { entry, matchedDirect: false };
      }
    }

    return { entry: null, matchedDirect: false };
  }

  /**
   * @param {import('./types/contracts.js').SpeciesInput|null|undefined} input
   * @param {import('./types/contracts.js').SpeciesResolverContext} ctx
   * @returns {{entry: import('./types/contracts.js').PokedexEntry|null, matchedDirect: boolean}}
   */
  function resolveMatch(input, ctx) {
    if (input == null) return { entry: null, matchedDirect: false };
    if (typeof input === 'number') {
      return { entry: ctx.entryByNum?.get(input) || null, matchedDirect: true };
    }
    if (typeof input === 'object') {
      const preferred = input.slug || input.species || input.name || input.id;
      if (preferred != null && preferred !== '') {
        const preferredMatch = resolveMatch(preferred, ctx);
        if (preferredMatch.entry) return preferredMatch;
      }
      if (typeof input.num === 'number') {
        return { entry: ctx.entryByNum?.get(input.num) || null, matchedDirect: true };
      }
      return { entry: null, matchedDirect: false };
    }

    const raw = String(input).trim();
    if (!raw) return { entry: null, matchedDirect: false };
    if (/^\d+$/.test(raw)) {
      const byNum = ctx.entryByNum?.get(Number(raw));
      if (byNum) return { entry: byNum, matchedDirect: true };
    }

    return resolveStringEntry(raw, ctx);
  }

  /** @param {import('./types/contracts.js').PokedexEntry[]} entries */
  function buildAliasMap(entries) {
    const aliasToSlug = new Map();

    /** @param {string} alias @param {string} slug */
    function register(alias, slug) {
      for (const key of unique([alias, normalizeHyphenSlug(alias), normalizeCollapsedSlug(alias)])) {
        if (!key || aliasToSlug.has(key)) continue;
        aliasToSlug.set(key, slug);
      }
    }

    for (const entry of entries || []) {
      if (!entry?.slug) continue;
      register(entry.slug, entry.slug);
      register(entry.name, entry.slug);
      if (entry.baseSpecies) register(entry.baseSpecies, entry.slug);
      if (entry.forme && entry.baseSpecies) register(`${entry.baseSpecies}-${entry.forme}`, entry.slug);
    }

    return aliasToSlug;
  }

  /** @param {import('./types/contracts.js').PokedexEntry[]} entries */
  function buildSearchIndex(entries) {
    return (entries || [])
      .filter((entry) => !!entry?.slug)
      .map((entry) => ({
        entry,
        aliases: unique([
          entry.slug,
          normalizeHyphenSlug(entry.slug),
          normalizeCollapsedSlug(entry.slug),
          entry.name,
          normalizeHyphenSlug(entry.name),
          normalizeCollapsedSlug(entry.name),
        ]).map((alias) => String(alias || '').toLowerCase()).filter(Boolean),
      }));
  }

  /**
   * @param {import('./types/contracts.js').SpeciesInput|null|undefined} input
   * @param {import('./types/contracts.js').SpeciesResolverContext} ctx
   */
  function resolveEntry(input, ctx) {
    return resolveMatch(input, ctx).entry;
  }

  /**
   * @param {import('./types/contracts.js').SpeciesInput|null|undefined} input
   * @param {import('./types/contracts.js').SpeciesResolverContext} ctx
   * @returns {import('./types/contracts.js').SpeciesResolution}
   */
  function resolve(input, ctx) {
    const match = resolveMatch(input, ctx);
    const entry = match.entry;
    const matchedDirect = match.matchedDirect;
    const rawText = typeof input === 'string'
      ? input
      : (typeof input === 'number'
        ? String(input)
        : (input?.slug || input?.name || input?.species || input?.id || ''));
    const normalizedSlug = normalizeHyphenSlug(rawText);
    const collapsedSlug = normalizeCollapsedSlug(rawText);

    let baseEntry = null;
    if (entry?.baseSpecies) {
      baseEntry = resolveEntry(entry.baseSpecies, ctx);
    } else {
      const fallbackSlug = entry?.slug || normalizedSlug;
      const parts = fallbackSlug.split('-').filter(Boolean);
      for (let i = parts.length - 1; i >= 1 && !baseEntry; i -= 1) {
        baseEntry = resolveEntry(parts.slice(0, i).join('-'), ctx);
      }
    }

    /** @type {string[]} */
    const spriteCandidates = [];
    pushFormSpriteVariants(spriteCandidates, entry, baseEntry);
    pushSlugVariants(spriteCandidates, rawText);
    pushSlugVariants(spriteCandidates, entry?.slug || normalizedSlug || rawText);
    pushSlugVariants(spriteCandidates, entry?.name || rawText);
    if (baseEntry?.slug) pushSlugVariants(spriteCandidates, baseEntry.slug);
    if (baseEntry?.name) pushSlugVariants(spriteCandidates, baseEntry.name);

    const slug = entry?.slug || baseEntry?.slug || ctx.aliasToSlug?.get(normalizedSlug) || normalizedSlug || collapsedSlug;
    const displayName = (entry && matchedDirect)
      ? (entry.name || prettifyName(rawText || slug))
      : prettifyName(rawText || entry?.name || slug);

    return {
      entry: entry || null,
      baseEntry: baseEntry || null,
      matchedDirect,
      slug,
      normalizedSlug,
      collapsedSlug,
      displayName,
      spriteCandidates: unique(spriteCandidates),
    };
  }

  /**
   * @param {import('./types/contracts.js').SpeciesInput} presetSlug
   * @param {import('./types/contracts.js').SpeciesResolverContext} ctx
   */
  function normalizePresetSlug(presetSlug, ctx) {
    return resolve(presetSlug, ctx).slug || normalizeHyphenSlug(presetSlug);
  }

  // ── Match value normalizers ───────────────────────────────────────
  // Derived from FormMetadata registry. Unknown keys use DEFAULT_NORMALIZE.
  /** @param {import('./types/contracts.js').InputValue} v */
  const DEFAULT_NORMALIZE = (v) => String(v).toLowerCase().replace(/\s+/g, '-').trim();
  /** @type {Record<string, (value: import('./types/contracts.js').InputValue) => string|boolean>} */
  const NORMALIZERS = FormMetadata.getNormalizers();

  /**
   * Compare an instance state value against a preset requirement value.
   * @param {import('./types/contracts.js').InputValue} actual - instance state[key]
   * @param {import('./types/contracts.js').InputValue} expected - preset requires[key] or defaults[key]
   * @param {string} key - state field name (used for per-key normalizer)
   * @param {{strict: boolean}} opts
   *   strict=true: missing actual → no match (used for `requires`)
   *   strict=false: missing actual → match (used for `defaults`)
   * @returns {boolean}
   */
  function matchValue(actual, expected, key, { strict }) {
    if (typeof expected === 'boolean') return !!actual === expected;
    if (actual == null || actual === '') return !strict;
    const norm = NORMALIZERS[key] || DEFAULT_NORMALIZE;
    return norm(actual) === norm(expected);
  }

  /**
   * Test whether an inventory slot satisfies a preset target.
   *
   * The match runs in two phases:
   *   1. Species check (via resolver) — must be the same Pokémon
   *   2. Metadata check — pure key-value comparison against `requires` (strict)
   *      and `defaults` (lenient: missing actual passes).
   *
   * Adding a new metadata dimension is a DATA change: declare it in preset JSON
   * `requires` (and FORM_EXTRA_FIELDS in domain-mappers.js so it survives state
   * roundtrip). No code change to matchesPreset is needed.
   *
   * @param {import('./types/contracts.js').SpeciesInput} speciesInput - species_id, display name, or build.species
   * @param {string|import('./types/contracts.js').PresetTarget} presetInput - raw PID string or parsed target
   * @param {import('./types/contracts.js').SpeciesResolverContext} ctx - resolver context
   * @param {import('./types/contracts.js').BuildState} [instanceState] - slot state
   * @returns {boolean}
   */
  function matchesPreset(speciesInput, presetInput, ctx, instanceState) {
    if (!speciesInput || !presetInput) return false;

    // Normalize presetInput to a structured target with requires/defaults maps.
    // Legacy string PIDs and legacy { speciesKey, gender, gmax, abilitySlug }
    // objects are also accepted for backwards compatibility.
    let presetSpeciesKey;
    /** @type {Partial<Record<import('./types/contracts.js').FormMetadataKey, import('./types/contracts.js').InputValue>>} */
    let requires = {};
    /** @type {Partial<Record<import('./types/contracts.js').FormMetadataKey, import('./types/contracts.js').InputValue>>} */
    let defaults = {};
    if (typeof presetInput === 'object') {
      presetSpeciesKey = presetInput.speciesKey || '';
      if (presetInput.requires) Object.assign(requires, presetInput.requires);
      if (presetInput.defaults) Object.assign(defaults, presetInput.defaults);
    } else {
      presetSpeciesKey = typeof presetInput === 'string' ? presetInput.replace(/--.*$/, '') : String(presetInput);
    }

    const species = resolve(speciesInput, ctx);
    const preset = resolve(presetSpeciesKey, ctx);

    // 1. Species slug match
    const slugMatch = (species.entry && preset.entry && species.slug === preset.slug)
      || (species.slug && species.slug === preset.slug)
      || (species.normalizedSlug && species.normalizedSlug === preset.normalizedSlug)
      || (species.collapsedSlug && species.collapsedSlug === preset.collapsedSlug);
    if (!slugMatch) return false;

    // 2. Strict requirements (missing actual = no match)
    for (const key of /** @type {import('./types/contracts.js').FormMetadataKey[]} */ (Object.keys(requires))) {
      const expected = requires[key];
      if (!matchValue(instanceState?.[key], expected, key, { strict: true })) return false;
    }

    // 3. Lenient defaults (missing actual = OK; explicit non-equal = no match)
    for (const key of /** @type {import('./types/contracts.js').FormMetadataKey[]} */ (Object.keys(defaults))) {
      const expected = defaults[key];
      if (!matchValue(instanceState?.[key], expected, key, { strict: false })) return false;
    }

    return true;
  }

  /**
   * @param {import('./types/contracts.js').SpeciesInput|null|undefined} input
   * @param {import('./types/contracts.js').SpeciesResolverContext} ctx
   */
  function getSpriteCandidates(input, ctx) {
    return resolve(input, ctx).spriteCandidates;
  }

  /**
   * @param {string} query
   * @param {import('./types/contracts.js').SpeciesResolverContext} ctx
   */
  function search(query, ctx) {
    const raw = String(query || '').trim();
    if (!raw) return [];
    const rawLower = raw.toLowerCase();
    const normalized = normalizeHyphenSlug(raw);
    const collapsed = normalizeCollapsedSlug(raw);
    /** @type {Array<{entry: import('./types/contracts.js').PokedexEntry, score: number}>} */
    const scored = [];
    const searchIndex = Array.isArray(ctx.searchIndex) ? ctx.searchIndex : buildSearchIndex(ctx.entries || []);

    for (const { entry, aliases } of searchIndex) {
      let score = 0;
      for (const text of aliases) {
        if (text === rawLower || text === normalized || text === collapsed) {
          score = Math.max(score, 100);
        } else if (text.startsWith(normalized) || text.startsWith(collapsed)) {
          score = Math.max(score, 80);
        } else if (text.includes(normalized) || text.includes(collapsed)) {
          score = Math.max(score, 60);
        }
      }

      if (score > 0) scored.push({ entry, score });
    }

    return scored
      .sort((a, b) => b.score - a.score || a.entry.num - b.entry.num)
      .map((match) => match.entry);
  }

  return {
    GENDER_SPRITE_SPECIES,
    buildAliasMap,
    buildSearchIndex,
    normalizeHyphenSlug,
    normalizeCollapsedSlug,
    resolveEntry,
    resolve,
    normalizePresetSlug,
    matchesPreset,
    getSpriteCandidates,
    search,
  };
})();
