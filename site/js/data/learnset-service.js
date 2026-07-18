import { DomainMappers } from '../domain-mappers.js';
import { SpeciesResolver } from '../species-resolver.js';
import { ReferenceData } from './reference-data.js';

/**
 * data/learnset-service.js - Learnset and factory-set queries shared via DataManager.
 */
export const LearnsetService = (() => {
  /** @typedef {{
   * movesData: import('../types/contracts.js').ReferenceDataMap,
   * pokedexBySlug: Map<string, import('../types/contracts.js').PokedexEntry>,
   * abilitiesList: import('../types/contracts.js').ReferenceItem[],
   * getAbilitiesForSpecies?: (slug: string) => string[]
   * }} LearnsetContext
   */
  /** @type {import('../types/contracts.js').LearnsetsData|null} */
  let learnsetsData = null;
  /** @type {import('../types/contracts.js').FactorySetsData|null} */
  let factorySetsData = null;
  /** @type {Map<string, import('../types/contracts.js').LearnsetMove[]>} */
  const learnsetDetailsCache = new Map();
  /** @type {Map<string, Map<string, import('../types/contracts.js').LearnsetMove>>} */
  const eggMoveLookupCache = new Map();

  /** @type {LearnsetContext|null} */
  let _ctx = null;

  /** @param {LearnsetContext} ctx */
  function init(ctx) {
    _ctx = ctx || null;
    learnsetDetailsCache.clear();
    eggMoveLookupCache.clear();
  }

  function getMovesData() {
    return _ctx?.movesData || {};
  }

  function getPokedexBySlug() {
    return _ctx?.pokedexBySlug || new Map();
  }

  function getAbilitiesList() {
    return Array.isArray(_ctx?.abilitiesList) ? _ctx.abilitiesList : [];
  }

  /** @param {string} slug */
  function getSpeciesAbilities(slug) {
    if (typeof _ctx?.getAbilitiesForSpecies === 'function') {
      return _ctx.getAbilitiesForSpecies(slug);
    }
    const entry = getPokedexBySlug().get(slug);
    if (!entry || !entry.abilities) return [];
    return Object.values(entry.abilities).filter((ability) => typeof ability === 'string');
  }

  async function ensureLearnsets() {
    if (!learnsetsData) learnsetsData = await ReferenceData.loadLearnsets();
    return learnsetsData;
  }

  async function ensureFactorySets() {
    if (!factorySetsData) factorySetsData = await ReferenceData.loadFactorySets();
    return factorySetsData;
  }

  /** @param {string|null|undefined} speciesSlugOrName */
  function toLearnsetSlug(speciesSlugOrName) {
    return String(speciesSlugOrName || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\s'-]+/g, '');
  }

  /** @param {import('../types/contracts.js').InputValue} moveRef */
  function normalizeMoveLookupKey(moveRef) {
    return DomainMappers.normalizeMoveToken(moveRef);
  }

  /** @param {string[]} moves @param {number} [limit] */
  function dedupeMoveNames(moves, limit = Infinity) {
    /** @type {string[]} */
    const out = [];
    /** @type {Set<string>} */
    const seen = new Set();
    for (const rawMove of moves || []) {
      const move = String(rawMove || '').trim();
      const key = normalizeMoveLookupKey(move);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(move);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** @param {string} source */
  function isEggLearnsetSource(source) {
    return /^\d+E/.test(String(source || '').trim());
  }

  /** Walk prevo chain to find the baby/base form (the one that hatches from an egg).
   *  Only follows prevo, NOT baseSpecies — regional forms (Vulpix-Alola) have their
   *  own egg move pools and must not fall back to the Kantonian base. */
  /** @param {string} speciesSlugOrName */
  function getBaseBabySlug(speciesSlugOrName) {
    const pokedex = getPokedexBySlug();
    let slug = toLearnsetSlug(speciesSlugOrName);
    const visited = new Set();
    while (slug && !visited.has(slug)) {
      visited.add(slug);
      const entry = pokedex.get(slug);
      if (!entry?.prevo) break;
      slug = toLearnsetSlug(entry.prevo);
    }
    return slug;
  }

  /**
   * @param {string} moveSlug
   * @param {string[]} sources
   * @returns {import('../types/contracts.js').LearnsetMove|null}
   */
  function projectLearnsetMove(moveSlug, sources) {
    const move = getMovesData()[moveSlug];
    if (!move) return null;
    const sourceList = Array.isArray(sources) ? [...sources] : [];
    return {
      slug: moveSlug,
      name: move.name,
      type: move.type,
      category: move.category,
      basePower: move.basePower,
      sources: sourceList,
      isEggMove: sourceList.some(isEggLearnsetSource),
    };
  }

  /**
   * @param {string} speciesSlugOrName
   * @param {import('../types/contracts.js').LearnsetsData} data
   * @param {Record<string, string[]>} merged
   * @param {Set<string>} [seen]
   */
  function mergeLearnsetChain(speciesSlugOrName, data, merged, seen = new Set()) {
    const slug = toLearnsetSlug(speciesSlugOrName);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const entry = data[slug];
    if (entry?.learnset) {
      for (const moveSlug of Object.keys(entry.learnset)) {
        if (!merged[moveSlug]) merged[moveSlug] = entry.learnset[moveSlug];
      }
    }

    const dexEntry = getPokedexBySlug().get(slug);
    if (!dexEntry) return;
    if (dexEntry.baseSpecies) mergeLearnsetChain(dexEntry.baseSpecies, data, merged, seen);
    if (dexEntry.prevo) mergeLearnsetChain(dexEntry.prevo, data, merged, seen);
  }

  /** @param {string} speciesSlugOrName */
  async function getLearnsetDetails(speciesSlugOrName) {
    const slug = toLearnsetSlug(speciesSlugOrName);
    if (!slug) return [];
    const cached = learnsetDetailsCache.get(slug);
    if (cached) return cached;

    const data = await ensureLearnsets();
    /** @type {Record<string, string[]>} */
    const merged = {};
    mergeLearnsetChain(slug, data, merged);
    const details = Object.keys(merged)
      .map((moveSlug) => projectLearnsetMove(moveSlug, merged[moveSlug]))
      .filter((move) => move !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    learnsetDetailsCache.set(slug, details);
    return details;
  }

  /** @param {string} speciesSlugOrName */
  async function getLearnset(speciesSlugOrName) {
    const details = await getLearnsetDetails(speciesSlugOrName);
    return details.map(({ slug, name, type, category, basePower }) => ({
      slug,
      name,
      type,
      category,
      basePower,
    }));
  }

  /** @param {string} speciesSlugOrName */
  async function getEggMovesForSpecies(speciesSlugOrName) {
    // Always resolve egg moves from the baby/base form — evolved forms may
    // learn the same moves by level-up, hiding them from the egg move list.
    // For breeding, the full egg move pool of the base form is what matters.
    const babySlug = getBaseBabySlug(speciesSlugOrName);
    const details = await getLearnsetDetails(babySlug || speciesSlugOrName);
    return details.filter((move) => move.isEggMove);
  }

  /** @param {string} speciesSlugOrName */
  async function getEggMoveLookup(speciesSlugOrName) {
    const slug = toLearnsetSlug(speciesSlugOrName);
    if (!slug) return new Map();
    const cached = eggMoveLookupCache.get(slug);
    if (cached) return cached;

    /** @type {Map<string, import('../types/contracts.js').LearnsetMove>} */
    const lookup = new Map();
    for (const move of await getEggMovesForSpecies(slug)) {
      const moveNameKey = normalizeMoveLookupKey(move.name);
      const moveSlugKey = normalizeMoveLookupKey(move.slug);
      if (moveNameKey) lookup.set(moveNameKey, move);
      if (moveSlugKey) lookup.set(moveSlugKey, move);
    }
    eggMoveLookupCache.set(slug, lookup);
    return lookup;
  }

  /** @param {string} speciesSlugOrName @param {import('../types/contracts.js').InputValue} moveRef */
  async function isEggMoveForSpecies(speciesSlugOrName, moveRef) {
    const key = normalizeMoveLookupKey(moveRef);
    if (!key) return null;
    const lookup = await getEggMoveLookup(speciesSlugOrName);
    return lookup.get(key) || null;
  }

  /** @param {string} speciesSlugOrName @param {string[]} [explicitEggMoves] @param {string[]} [currentMoves] */
  async function mergeKnownEggMoves(speciesSlugOrName, explicitEggMoves = [], currentMoves = []) {
    /** @type {string[]} */
    const eggMoves = [];
    /** @type {string[]} */
    const autoDetected = [];
    /** @type {string[]} */
    const invalidExplicit = [];
    /** @param {string[]} target @param {string} moveName */
    const addUnique = (target, moveName) => {
      const key = normalizeMoveLookupKey(moveName);
      if (!key || target.some((move) => normalizeMoveLookupKey(move) === key)) return;
      target.push(moveName);
    };

    const explicit = dedupeMoveNames(explicitEggMoves, 4);
    const current = dedupeMoveNames(currentMoves, 4);
    const slug = toLearnsetSlug(speciesSlugOrName);
    if (!slug) {
      return {
        eggMoves: explicit,
        autoDetected,
        invalidExplicit,
      };
    }

    const lookup = await getEggMoveLookup(slug);
    for (const moveName of explicit) {
      const resolved = lookup.get(normalizeMoveLookupKey(moveName));
      if (!resolved) {
        invalidExplicit.push(moveName);
        continue;
      }
      addUnique(eggMoves, resolved.name);
    }

    for (const moveName of current) {
      if (eggMoves.length >= 4) break;
      const resolved = lookup.get(normalizeMoveLookupKey(moveName));
      if (!resolved) continue;
      addUnique(autoDetected, resolved.name);
      addUnique(eggMoves, resolved.name);
    }

    eggMoves.sort((a, b) => a.localeCompare(b));

    return {
      eggMoves,
      autoDetected,
      invalidExplicit,
    };
  }

  /** @param {string} speciesSlug @param {string} query */
  async function searchMovesForSpecies(speciesSlug, query) {
    const legal = await getLearnsetDetails(speciesSlug);
    if (!query || query.length < 1) return legal.slice(0, 20);
    const q = query.toLowerCase();
    return legal.filter((move) => move.name.toLowerCase().includes(q)).slice(0, 20);
  }

  /** @param {string} speciesSlug @param {string} query */
  async function searchEggMovesForSpecies(speciesSlug, query) {
    const legal = await getEggMovesForSpecies(speciesSlug);
    if (!query || query.length < 1) return legal.slice(0, 20);
    const q = query.toLowerCase();
    return legal.filter((move) => move.name.toLowerCase().includes(q)).slice(0, 20);
  }

  /** @param {string} speciesName */
  async function listFactorySets(speciesName) {
    const data = await ensureFactorySets();
    const key = SpeciesResolver.normalizeCollapsedSlug(speciesName);
    const entry = data[key] || data[speciesName];
    if (!entry || !entry.sets || entry.sets.length === 0) return [];
    const sorted = [...entry.sets].sort((a, b) => (b.weight || 0) - (a.weight || 0));
    return sorted.map((set, idx) => ({
      label: set.name || set.label || `Set ${idx + 1}`,
      weight: set.weight || 0,
      build: factorySetToBuildShape(set, speciesName),
    }));
  }

  /**
   * @param {import('../types/contracts.js').FactorySet|null|undefined} set
   * @param {string} fallbackSpecies
   * @returns {import('../types/contracts.js').BuildState|null}
   */
  function factorySetToBuildShape(set, fallbackSpecies) {
    if (!set) return null;
    /** @param {string|string[]|undefined} value */
    const first = (value) => (Array.isArray(value) ? value[0] : value);
    const moves = (set.moves || []).map((move) => (Array.isArray(move) ? move[0] : move)).filter(Boolean);
    /** @type {import('../types/contracts.js').BuildState} */
    const out = {
      species: first(set.species) || fallbackSpecies,
      level: (typeof set.level === 'number' && set.level !== 50) ? set.level : null,
      nature: first(set.nature) || '',
      ability: first(set.ability) || '',
      item: first(set.item) || '',
      tera_type: first(set.teraType) || '',
      moves,
      evs: { classic: set.evs || {} },
    };
    if (set.ivs && typeof set.ivs === 'object') out.ivs = { ...set.ivs };
    return out;
  }

  /** @param {string} speciesName */
  async function getDefaultSet(speciesName) {
    const sets = await listFactorySets(speciesName);
    if (sets.length === 0) return null;
    const build = sets[0].build;
    if (!build) return null;
    return {
      species: build.species,
      item: build.item || null,
      ability: build.ability || null,
      nature: build.nature || null,
      evs: build.evs?.classic || build.evs || {},
      moves: build.moves || [],
      teraType: build.tera_type || null,
    };
  }

  /** @param {string} slug */
  function searchAbilitiesForSpecies(slug) {
    const abilities = getSpeciesAbilities(slug);
    if (!abilities.length) return getAbilitiesList();
    return abilities.map((name) => ({
      slug: name.toLowerCase().replace(/[\s'-]+/g, ''),
      name,
    }));
  }

  return {
    init,
    getLearnset,
    getEggMovesForSpecies,
    isEggMoveForSpecies,
    mergeKnownEggMoves,
    searchMovesForSpecies,
    searchEggMovesForSpecies,
    getDefaultSet,
    listFactorySets,
    factorySetToBuildShape,
    searchAbilitiesForSpecies,
  };
})();
