/**
 * data/species-queries.js - Species lookup, compatibility, and sprite queries.
 */
const SpeciesQueries = (() => {
  let _ctx = null;

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

  function getPokedexEntries() {
    return Array.isArray(getContext().pokedexEntries) ? getContext().pokedexEntries : [];
  }

  function getPokedexByNum() {
    return getContext().pokedexByNum || new Map();
  }

  function getPokedexBySlug() {
    return getContext().pokedexBySlug || new Map();
  }

  function getPokedexByAlias() {
    return getContext().pokedexByAlias || new Map();
  }

  function getSlotsBySpecies() {
    return getContext().slotsBySpecies || new Map();
  }

  function getChampionsIds() {
    return getContext().championsFilter?.ids || new Set();
  }

  function getChampionsSlugs() {
    return getContext().championsFilter?.slugs || new Set();
  }

  function getSvFilter() {
    return getContext().svFilter || new Set();
  }

  function getLegendsArceusFilter() {
    return getContext().legendsArceusFilter || new Set();
  }

  function getLegendsZAFilter() {
    return getContext().legendsZAFilter || new Set();
  }

  function getSpriteBase() {
    return getContext().spriteBase || '';
  }

  function getResolverContext() {
    return {
      entries: getPokedexEntries(),
      entryByNum: getPokedexByNum(),
      entryBySlug: getPokedexBySlug(),
      aliasToSlug: getPokedexByAlias(),
      searchIndex: getContext().searchIndex || [],
    };
  }

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

  function speciesSlug(species) {
    return getResolver().normalizeHyphenSlug(species);
  }

  function getSpriteCandidates(speciesOrId) {
    if (Array.isArray(speciesOrId?.spriteCandidates)) {
      return speciesOrId.spriteCandidates.filter(Boolean);
    }
    return getResolver().getSpriteCandidates(speciesOrId, getResolverContext());
  }

  function getSpriteUrl(slug) {
    const candidates = getSpriteCandidates(slug);
    const preferred = candidates.find(Boolean) || speciesSlug(String(slug || ''));
    return `${getSpriteBase()}/${preferred}.png`;
  }

  function getPokedexEntry(dexIdOrSlug) {
    const resolved = getResolver().resolve(dexIdOrSlug, getResolverContext());
    return toPublicPokedexEntry(resolved.entry);
  }

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

  function isInChampions(dexId) {
    if (getChampionsIds().has(dexId)) return true;
    const entry = getPokedexByNum().get(dexId);
    return entry ? getChampionsSlugs().has(entry.slug) : false;
  }

  function isInSV(slugOrDexId) {
    if (typeof slugOrDexId === 'string') return getSvFilter().has(slugOrDexId);
    const entry = getPokedexByNum().get(slugOrDexId);
    return entry ? getSvFilter().has(entry.slug) : false;
  }

  function slugFor(slugOrDexId) {
    if (typeof slugOrDexId === 'string') return slugOrDexId;
    const entry = getPokedexByNum().get(slugOrDexId);
    return entry ? entry.slug : null;
  }

  function isInLegendsArceus(slugOrDexId) {
    const slug = slugFor(slugOrDexId);
    return slug ? getLegendsArceusFilter().has(slug) : false;
  }

  function isInLegendsZA(slugOrDexId) {
    const slug = slugFor(slugOrDexId);
    return slug ? getLegendsZAFilter().has(slug) : false;
  }

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

if (typeof window !== 'undefined') {
  window.SpeciesQueries = SpeciesQueries;
}
