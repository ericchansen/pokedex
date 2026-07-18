import { SpeciesResolver } from '../species-resolver.js';

/**
 * data/species-queries.js - Species lookup, compatibility, and sprite queries.
 */
export const SpeciesQueries = (() => {
  /** @type {Partial<import('../types/contracts.js').SpeciesQueriesContext>|null} */
  let _ctx = null;

  /** @param {import('../types/contracts.js').SpeciesQueriesContext} ctx */
  function init(ctx) {
    if (ctx && !Array.isArray(ctx.searchIndex)) {
      const resolver = ctx.SpeciesResolver || SpeciesResolver;
      if (typeof resolver.buildSearchIndex === 'function') {
        ctx.searchIndex = resolver.buildSearchIndex(ctx.pokedexEntries);
      }
    }
    _ctx = ctx || null;
  }

  function getContext() {
    return _ctx || {};
  }

  function getResolver() {
    return getContext().SpeciesResolver || SpeciesResolver;
  }

  /** @returns {import('../types/contracts.js').PokedexEntry[]} */
  function getPokedexEntries() {
    const entries = getContext().pokedexEntries;
    return Array.isArray(entries) ? entries : [];
  }

  /** @returns {Map<number, import('../types/contracts.js').PokedexEntry>} */
  function getPokedexByNum() {
    return getContext().pokedexByNum || new Map();
  }

  /** @returns {Map<string, import('../types/contracts.js').PokedexEntry>} */
  function getPokedexBySlug() {
    return getContext().pokedexBySlug || new Map();
  }

  /** @returns {Map<string, string>} */
  function getPokedexByAlias() {
    return getContext().pokedexByAlias || new Map();
  }

  /** @returns {Map<string|number, Array<{box: number, slot: number}>>} */
  function getSlotsBySpecies() {
    return getContext().slotsBySpecies || new Map();
  }

  /** @returns {Set<number>} */
  function getChampionsIds() {
    return getContext().championsFilter?.ids || new Set();
  }

  /** @returns {Set<string>} */
  function getChampionsSlugs() {
    return getContext().championsFilter?.slugs || new Set();
  }

  /** @returns {Set<string>} */
  function getSvFilter() {
    return getContext().svFilter || new Set();
  }

  /** @returns {Set<string>} */
  function getLegendsArceusFilter() {
    return getContext().legendsArceusFilter || new Set();
  }

  /** @returns {Set<string>} */
  function getLegendsZAFilter() {
    return getContext().legendsZAFilter || new Set();
  }

  function getSpriteBase() {
    return getContext().spriteBase || '';
  }

  /** @returns {import('../types/contracts.js').SpeciesResolverContext} */
  function getResolverContext() {
    return {
      entries: getPokedexEntries(),
      entryByNum: getPokedexByNum(),
      entryBySlug: getPokedexBySlug(),
      aliasToSlug: getPokedexByAlias(),
      searchIndex: getContext().searchIndex || [],
    };
  }

  /** @param {number} num */
  function dexNumToGen(num) {
    if (num <= 151) return 1;
    if (num <= 251) return 2;
    if (num <= 386) return 3;
    if (num <= 493) return 4;
    if (num <= 649) return 5;
    if (num <= 721) return 6;
    if (num <= 809) return 7;
    if (num <= 905) return 8;
    return 9;
  }

  /** @param {number} num */
  function dexNumToRegion(num) {
    if (num <= 151) return 'Kanto';
    if (num <= 251) return 'Johto';
    if (num <= 386) return 'Hoenn';
    if (num <= 493) return 'Sinnoh';
    if (num <= 649) return 'Unova';
    if (num <= 721) return 'Kalos';
    if (num <= 809) return 'Alola';
    if (num <= 905) return 'Galar/Hisui';
    return 'Paldea';
  }

  /**
   * @param {import('../types/contracts.js').PokedexEntry|null|undefined} entry
   * @returns {import('../types/contracts.js').PokedexEntry|null}
   */
  function toPublicPokedexEntry(entry) {
    if (!entry) return null;
    return {
      id: entry.num,
      num: entry.num,
      name: entry.name,
      types: entry.types,
      baseStats: entry.baseStats || {},
      abilities: entry.abilities || {},
      baseSpecies: entry.baseSpecies || null,
      forme: entry.forme || null,
      otherFormes: entry.otherFormes || null,
      formeOrder: entry.formeOrder || null,
      gender: entry.gender || null,
      sprite: entry.sprite,
      artwork: entry.artwork,
      slug: entry.slug,
      generation: dexNumToGen(entry.num),
      region: dexNumToRegion(entry.num),
    };
  }

  /** @param {import('../types/contracts.js').InputValue} species */
  function speciesSlug(species) {
    return getResolver().normalizeHyphenSlug(species);
  }

  /** @param {import('../types/contracts.js').SpeciesInput|import('../types/contracts.js').SpeciesResolution|null|undefined} speciesOrId */
  function getSpriteCandidates(speciesOrId) {
    if (speciesOrId && typeof speciesOrId === 'object'
      && 'spriteCandidates' in speciesOrId
      && Array.isArray(speciesOrId.spriteCandidates)) {
      return speciesOrId.spriteCandidates.filter(Boolean);
    }
    return getResolver().getSpriteCandidates(
      /** @type {import('../types/contracts.js').SpeciesInput|null|undefined} */ (speciesOrId),
      getResolverContext()
    );
  }

  /** @param {string|null|undefined} slug */
  function getSpriteUrl(slug) {
    const candidates = getSpriteCandidates(slug);
    const preferred = candidates.find(Boolean) || speciesSlug(String(slug || ''));
    return `${getSpriteBase()}/${preferred}.png`;
  }

  /** @param {import('../types/contracts.js').SpeciesInput|null|undefined} dexIdOrSlug */
  function getPokedexEntry(dexIdOrSlug) {
    const resolved = getResolver().resolve(dexIdOrSlug, getResolverContext());
    return toPublicPokedexEntry(resolved.entry);
  }

  /** @param {import('../types/contracts.js').SpeciesInput|null|undefined} speciesOrId */
  function resolveSpecies(speciesOrId) {
    const resolved = getResolver().resolve(speciesOrId, getResolverContext());
    return {
      ...resolved,
      id: resolved.entry?.num || 0,
      num: resolved.entry?.num || 0,
      name: resolved.displayName || resolved.entry?.name || '',
      entry: toPublicPokedexEntry(resolved.entry),
      baseEntry: toPublicPokedexEntry(resolved.baseEntry),
    };
  }

  function getTotalCount() {
    return getPokedexByNum().size;
  }

  function getOwnedCount() {
    return getSlotsBySpecies().size;
  }

  function getSpeciesCompletion() {
    const total = getTotalCount();
    const owned = getOwnedCount();
    return {
      total,
      owned,
      pending: total - owned,
      blocked: 0,
      percent: total > 0 ? (owned / total) * 100 : 0,
    };
  }

  /** @param {number} dexId */
  function isInChampions(dexId) {
    if (getChampionsIds().has(dexId)) return true;
    const entry = getPokedexByNum().get(dexId);
    return entry ? getChampionsSlugs().has(entry.slug) : false;
  }

  /** @param {string|number} slugOrDexId */
  function isInSV(slugOrDexId) {
    if (typeof slugOrDexId === 'string') return getSvFilter().has(slugOrDexId);
    const entry = getPokedexByNum().get(slugOrDexId);
    return entry ? getSvFilter().has(entry.slug) : false;
  }

  /** @param {string|number} slugOrDexId */
  function slugFor(slugOrDexId) {
    if (typeof slugOrDexId === 'string') return slugOrDexId;
    const entry = getPokedexByNum().get(slugOrDexId);
    return entry ? entry.slug : null;
  }

  /** @param {string|number} slugOrDexId */
  function isInLegendsArceus(slugOrDexId) {
    const slug = slugFor(slugOrDexId);
    return slug ? getLegendsArceusFilter().has(slug) : false;
  }

  /** @param {string|number} slugOrDexId */
  function isInLegendsZA(slugOrDexId) {
    const slug = slugFor(slugOrDexId);
    return slug ? getLegendsZAFilter().has(slug) : false;
  }

  /** @param {string|number} slugOrDexId @param {string} game */
  function isInGame(slugOrDexId, game) {
    const value = (typeof slugOrDexId === 'string' && /^\d+$/.test(slugOrDexId))
      ? Number(slugOrDexId)
      : slugOrDexId;
    if (game === 'champions') return isInChampions(typeof value === 'string' ? (getPokedexBySlug().get(value)?.num || 0) : value);
    if (game === 'sv') return isInSV(value);
    if (game === 'legends-arceus' || game === 'pla') return isInLegendsArceus(value);
    if (game === 'legends-za' || game === 'lza') return isInLegendsZA(value);
    return false;
  }

  /** @param {string} query */
  function searchSpecies(query) {
    if (!query || query.length < 1) return [];
    return getResolver().search(query, getResolverContext())
      .slice(0, 20)
      .map((entry) => toPublicPokedexEntry(entry));
  }

  /**
   * Get available forms for a species slug. Returns array of
   * { slug, name, forme } for each alternate form (excludes megas, totems, gmax).
   */
  /** @param {import('../types/contracts.js').SpeciesInput} slugOrName */
  function getFormsForSpecies(slugOrName) {
    const resolved = getResolver().resolve(slugOrName, getResolverContext());
    const entry = resolved.entry;
    if (!entry) return [];
    // Use base species entry if this is already a form
    const baseSlug = entry.baseSpecies
      ? getResolver().normalizeCollapsedSlug(entry.baseSpecies)
      : entry.slug;
    const baseEntry = getPokedexBySlug().get(baseSlug) || entry;
    // Gather forms from otherFormes or formeOrder
    const formNames = baseEntry.otherFormes || [];
    if (!formNames.length && (!baseEntry.formeOrder || baseEntry.formeOrder.length <= 1)) return [];
    /** @type {Array<{slug: string, name: string, forme: string|null}>} */
    const forms = [];
    // Include base form first
    forms.push({ slug: baseSlug, name: baseEntry.name, forme: null });
    // Add other forms, filtering out megas, totems, and gmax
    for (const formName of formNames) {
      const formSlug = getResolver().normalizeCollapsedSlug(formName);
      const formEntry = getPokedexBySlug().get(formSlug);
      if (!formEntry) continue;
      const forme = formEntry.forme || formName.replace(baseEntry.name + '-', '');
      const formeLower = forme.toLowerCase();
      if (formeLower.includes('mega') || formeLower.includes('totem') || formeLower === 'gmax') continue;
      forms.push({ slug: formSlug, name: formEntry.name, forme });
    }
    // Also check formeOrder for entries not in otherFormes (like Alcremie creams)
    if (baseEntry.formeOrder) {
      for (const formName of baseEntry.formeOrder) {
        const formSlug = getResolver().normalizeCollapsedSlug(formName);
        if (forms.some(f => f.slug === formSlug)) continue;
        const formEntry = getPokedexBySlug().get(formSlug);
        if (!formEntry) continue;
        const forme = formEntry.forme || formName.replace(baseEntry.name + '-', '');
        const formeLower = forme.toLowerCase();
        if (formeLower.includes('mega') || formeLower.includes('totem') || formeLower === 'gmax') continue;
        forms.push({ slug: formSlug, name: formEntry.name, forme });
      }
    }
    return forms.length > 1 ? forms : [];
  }

  /** Check if a species is Gigantamax-eligible (has a -Gmax form in pokedex). */
  /** @param {import('../types/contracts.js').SpeciesInput} slugOrName */
  function isGmaxEligible(slugOrName) {
    const resolved = getResolver().resolve(slugOrName, getResolverContext());
    const entry = resolved.entry;
    if (!entry) return false;
    const baseSlug = entry.baseSpecies
      ? getResolver().normalizeCollapsedSlug(entry.baseSpecies)
      : entry.slug;
    return getPokedexBySlug().has(baseSlug + 'gmax');
  }

  return {
    init,
    getResolverContext,
    getPokedexEntry,
    resolveSpecies,
    getSpriteCandidates,
    getTotalCount,
    getOwnedCount,
    getSpeciesCompletion,
    isInChampions,
    isInSV,
    isInLegendsArceus,
    isInLegendsZA,
    isInGame,
    searchSpecies,
    getFormsForSpecies,
    isGmaxEligible,
    getSpriteUrl,
    speciesSlug,
    dexNumToGen,
    dexNumToRegion,
  };
})();
