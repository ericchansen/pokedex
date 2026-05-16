/**
 * data/reference-data.js - Loading and normalization helpers for reference datasets.
 */
export const ReferenceData = (() => {
  let learnsetsData = null;
  let factorySetsData = null;
  const presetDataByGameSet = new Map();

  async function loadCoreData() {
    // When hosted, verify authentication before fetching user data.
    // SWA's 401→302 redirect causes CORS failures on fetch, so we gate here.
    if (ApiClient.isHosted()) {
      const auth = await ApiClient.getAuthInfo();
      if (!auth) {
        window.location.href = '/.auth/login/github';
        throw new Error('Authentication required — redirecting to login');
      }
    }

    const [
      buildsData,
      teamsData,
      pokedexData,
      championsData,
      svFilterData,
      plaFilterData,
      lzaFilterData,
      movesData,
      itemsData,
      abilitiesData,
      naturesData,
      inventoryData,
    ] = await Promise.all([
      ApiClient.getJson('/api/builds'),
      ApiClient.getJson('/api/teams'),
      ApiClient.getJson('/data/reference/pokedex.json'),
      ApiClient.getJson('/data/champions_filter.json'),
      ApiClient.getJson('/data/sv_filter.json'),
      ApiClient.getJson('/data/reference/legends_arceus_pokemon.json'),
      ApiClient.getJson('/data/reference/legends_za_pokemon.json'),
      ApiClient.getJson('/data/reference/moves.json'),
      ApiClient.getJson('/data/reference/items.json'),
      ApiClient.getJson('/data/reference/abilities.json'),
      ApiClient.getJson('/data/reference/natures.json'),
      ApiClient.getJson('/api/inventory'),
    ]);

    return {
      buildsData,
      teamsData,
      pokedexData,
      championsData,
      svFilterData,
      plaFilterData,
      lzaFilterData,
      movesData,
      itemsData,
      abilitiesData,
      naturesData,
      inventoryData,
    };
  }

  function buildPokedexEntries(pokedexData, options = {}) {
    const spriteBase = options.spriteBase || '';
    const baseSlugByName = new Map();
    for (const [slug, entry] of Object.entries(pokedexData || {})) {
      if (entry?.baseSpecies || !entry?.num || entry.num <= 0) continue;
      const key = SpeciesResolver.normalizeCollapsedSlug(entry.name || slug);
      if (key && !baseSlugByName.has(key)) baseSlugByName.set(key, slug);
    }

    const entries = [];
    for (const [slug, entry] of Object.entries(pokedexData || {})) {
      const baseSlug = entry.baseSpecies
        ? (baseSlugByName.get(SpeciesResolver.normalizeCollapsedSlug(entry.baseSpecies)) || null)
        : null;
      const baseEntry = baseSlug ? pokedexData[baseSlug] : null;
      const num = entry.num || baseEntry?.num || null;
      if (!num || num <= 0) continue;

      const types = Array.isArray(entry.types) && entry.types.length
        ? entry.types
        : (baseEntry?.types || []);
      const baseStats = entry.baseStats && Object.keys(entry.baseStats).length
        ? entry.baseStats
        : (baseEntry?.baseStats || {});
      const abilities = entry.abilities && Object.keys(entry.abilities).length
        ? entry.abilities
        : (baseEntry?.abilities || {});
      const spriteSlug = entry.baseSpecies && entry.forme && baseSlug
        ? `${baseSlug}-${SpeciesResolver.normalizeHyphenSlug(entry.forme)}`
        : slug;

      entries.push({
        num,
        slug,
        name: entry.name || slug,
        types,
        baseStats,
        abilities,
        forme: entry.forme || null,
        baseSpecies: entry.baseSpecies || null,
        otherFormes: entry.otherFormes || null,
        formeOrder: entry.formeOrder || null,
        prevo: entry.prevo || null,
        gender: entry.gender || baseEntry?.gender || null,
        sprite: `${spriteBase}/${spriteSlug}.png`,
        artwork: `${spriteBase}/${spriteSlug}.png`,
      });
    }

    entries.sort((a, b) => a.num - b.num);
    return entries;
  }

  function buildReferenceLists({ movesData = {}, itemsData = {}, abilitiesData = {}, naturesData = {} }) {
    return {
      movesList: Object.entries(movesData)
        .filter(([, move]) => move.num > 0 && !move.isNonstandard)
        .map(([slug, move]) => ({
          slug,
          name: move.name,
          nameLower: move.name.toLowerCase(),
          type: move.type,
          category: move.category,
          basePower: move.basePower,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      itemsList: Object.entries(itemsData)
        .filter(([, item]) => item.num > 0 && !item.isNonstandard)
        .map(([slug, item]) => ({ slug, name: item.name, nameLower: item.name.toLowerCase() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      abilitiesList: Object.entries(abilitiesData)
        .filter(([, ability]) => ability.num > 0 && !ability.isNonstandard)
        .map(([slug, ability]) => ({ slug, name: ability.name, nameLower: ability.name.toLowerCase() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      naturesList: Object.entries(naturesData)
        .map(([slug, nature]) => ({
          slug,
          name: nature.name,
          plus: nature.plus || null,
          minus: nature.minus || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async function loadLearnsets() {
    if (!learnsetsData) {
      learnsetsData = await ApiClient.getJson('/data/reference/learnsets.json');
    }
    return learnsetsData;
  }

  async function loadFactorySets() {
    if (!factorySetsData) {
      factorySetsData = await ApiClient.getJson('/data/reference/bss-factory-sets.json');
    }
    return factorySetsData;
  }

  async function loadPresetData(gameSet) {
    const key = String(gameSet || '').trim();
    if (!key) return {};
    if (!presetDataByGameSet.has(key)) {
      presetDataByGameSet.set(key, await ApiClient.getJson(`/data/presets/${key}.json`));
    }
    return presetDataByGameSet.get(key);
  }

  return {
    loadCoreData,
    buildPokedexEntries,
    buildReferenceLists,
    loadLearnsets,
    loadFactorySets,
    loadPresetData,
  };
})();

if (typeof window !== 'undefined') {
  window.ReferenceData = ReferenceData;
}
