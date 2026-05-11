/**
 * data.js — Data layer for Pokémon HOME Tracker v2.
 *
 * Loads:
 *   /data/builds.json              — user builds (competitive sets)
 *   /data/teams.json               — imported/user teams
 *   /data/inventory.json           — 200-box HOME inventory
 *   /data/reference/pokedex.json   — Smogon species reference
 *   /data/champions_filter.json    — Champions-legal dex IDs
 *   /data/sv_filter.json           — SV-legal slugs
 *
 * Provides a DataManager facade over focused repositories, storage mappers,
 * and reference-data services.
 */

const DataManager = (() => {
  // ── State ──────────────────────────────────────────────
  let pokedexEntries = [];
  let builds = [];
  let teamStorage = [];
  let teams = [];
  let championsIds = new Set();
  let championsSlugs = new Set();
  let svSlugs = new Set();
  let plaSlugs = new Set();
  let lzaSlugs = new Set();

  // Reference data (loaded once, read-only)
  let movesData = {};
  let itemsData = {};
  let abilitiesData = {};
  let naturesData = {};

  // Inventory state
  let inventory = null; // { boxes: [...], box_count, slots_per_box, columns, rows }
  let slotsBySpecies = new Map(); // species_id → [{box, slot}]
  let slotsByBaseSpecies = new Map(); // base species (no form suffix) → [{box, slot}]
  let instancesByTargetBuildId = new Map(); // build_id → instance[] (inverse index for O(1) getInstancesTargeting)

  // Indexes
  let pokedexByNum = new Map();
  let pokedexBySlug = new Map();
  let pokedexByAlias = new Map();
  let buildsById = new Map();
  let buildsBySlug = new Map();
  // Reverse index keyed by build fingerprint (battle identity hash). Used to
  // detect and prevent duplicate builds at create-time.
  let buildsByFingerprint = new Map();
  let teamsById = new Map();
  let teamsByBuildId = new Map(); // build_id → Set of team IDs
  let movesList = [];    // [{slug, name, type, category, basePower}]
  let itemsList = [];    // [{slug, name}]
  let abilitiesList = []; // [{slug, name}]
  let naturesList = [];  // [{slug, name, plus, minus}]

  const SPRITE_BASE = 'https://play.pokemonshowdown.com/sprites/gen5';
  const MAX_MOVES = 4;
  const SLOTS_PER_BOX = 30;

  // ── Build storage and inventory view models ────────────
  // A "Build" is one data shape (species/form/level/nature/ability/item/tera/EVs/moves)
  // played in two roles:
  //   • Library Build  (kind: 'library')  — shared, deduped, lives in builds.json
  //   • Instance Build (kind: 'instance') — 1:1 with one real Pokémon, embedded as
  //                                          slot.build, never shared
  // Every Build has an `id` and a `kind`. An Instance also has an optional
  // `target_build_id` (FK to a Library Build) — the goal it's working toward.
  //
  // Storage shape:
  //   builds.json entry:  { id, slug, kind:'library', build:{...}, egg_moves, notes, source_url }
  //   inventory.json slot: { build:{id, kind:'instance', species, ...}, identity:{...}, target_build_id }
  // View model shape:
  //   library build:   flat object with id, kind:'library', species, ...
  //   inventory slot:  { species_id, target_build_id, state:{id, kind:'instance', ...flat build + identity} }



  function slotViewFromStorage(slot) {
    return StorageMappers.slotViewFromStorage(slot, {
      normalizeHyphenSlug: SpeciesResolver.normalizeHyphenSlug,
    });
  }

  function speciesNameFromKey(speciesId) {
    if (typeof speciesId === 'number') {
      const e = pokedexByNum.get(speciesId);
      return e ? e.name : `#${speciesId}`;
    }
    if (typeof speciesId === 'string') {
      const e = pokedexBySlug.get(speciesId);
      if (e) return e.name;
      // Capitalize unknown form slugs: floette-yellow → Floette-Yellow
      return speciesId.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
    }
    return null;
  }

  function storageSlotFromState(speciesId, targetBuildId, stateInput) {
    return StorageMappers.storageSlotFromState(speciesId, targetBuildId, stateInput, {
      speciesNameFromKey,
    });
  }

  function _speciesNameToId(name) {
    if (name == null) return null;
    if (typeof name === 'number') return name;
    // Try hyphen-preserving slug first (matches form variants like rotom-wash)
    const hyphenSlug = String(name).toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-|-$/g, '');
    const eHyphen = pokedexBySlug.get(hyphenSlug);
    if (eHyphen) return hyphenSlug;
    // Try collapsed slug (matches base species like mrmime, hooh)
    const slug = SpeciesResolver.normalizeCollapsedSlug(name);
    const e = pokedexBySlug.get(slug);
    if (e) return slug;
    // Form fallback: strip form suffixes progressively to find base species
    const parts = hyphenSlug.split('-');
    for (let i = parts.length - 1; i >= 1; i--) {
      const baseSlug = parts.slice(0, i).join('');
      const base = pokedexBySlug.get(baseSlug);
      if (base) return baseSlug;
    }
    return null;
  }

  // ── Init ───────────────────────────────────────────────

  async function init() {
    const {
      buildsData,
      teamsData,
      pokedexData,
      championsData,
      svFilterData,
      plaFilterData,
      lzaFilterData,
      movesData: loadedMoves,
      itemsData: loadedItems,
      abilitiesData: loadedAbilities,
      naturesData: loadedNatures,
      inventoryData,
    } = await ReferenceData.loadCoreData();

    // Storage shape (schema v3): builds[] with nested .build.{...}.
    // Project to legacy flat shape so render/views can still read build.species etc.
    const rawBuilds = buildsData.builds || buildsData.pokemon || [];
    builds = rawBuilds.map(StorageMappers.flattenStoredBuild);
    teamStorage = teamsData.teams || [];
    teams = [];
    inventory = inventoryData;

    championsIds = new Set(championsData.dex_ids || []);
    championsSlugs = new Set(championsData.mega_slugs || []);
    svSlugs = new Set(svFilterData.slugs || []);
    plaSlugs = new Set((plaFilterData && plaFilterData.pokemon) || []);
    lzaSlugs = new Set((lzaFilterData && lzaFilterData.pokemon) || []);

    movesData = loadedMoves;
    itemsData = loadedItems;
    abilitiesData = loadedAbilities;
    naturesData = loadedNatures;

    pokedexEntries = ReferenceData.buildPokedexEntries(pokedexData, {
      spriteBase: SPRITE_BASE,
    });
    ({
      movesList,
      itemsList,
      abilitiesList,
      naturesList,
    } = ReferenceData.buildReferenceLists({
      movesData,
      itemsData,
      abilitiesData,
      naturesData,
    }));
    hydrateIndexes();
    SpeciesQueries.init({
      pokedexEntries,
      pokedexByNum,
      pokedexBySlug,
      pokedexByAlias,
      championsFilter: { ids: championsIds, slugs: championsSlugs },
      svFilter: svSlugs,
      legendsArceusFilter: plaSlugs,
      legendsZAFilter: lzaSlugs,
      slotsBySpecies,
      spriteBase: SPRITE_BASE,
      SpeciesResolver,
    });
    LearnsetService.init({
      pokedexBySlug,
      movesData,
      abilitiesData,
      abilitiesList,
      getAbilitiesForSpecies,
    });
    PresetService.init({
      getBox,
      getResolverContext: () => SpeciesQueries.getResolverContext(),
      loadPresetData: (gameSet) => ReferenceData.loadPresetData(gameSet),
    });
  }

  function hydratePokedexIndex() {
    pokedexByNum.clear();
    pokedexBySlug.clear();
    pokedexByAlias.clear();

    for (const entry of pokedexEntries) {
      if (!entry.baseSpecies && !pokedexByNum.has(entry.num)) {
        pokedexByNum.set(entry.num, entry);
      }
      pokedexBySlug.set(entry.slug, entry);
    }

    pokedexByAlias = SpeciesResolver.buildAliasMap(pokedexEntries);
  }

  function hydrateBuildIndex() {
    buildsById.clear();
    buildsBySlug.clear();
    buildsByFingerprint.clear();

    for (const build of builds) {
      buildsById.set(build.id, build);
      const slug = build.slug || '';
      if (!buildsBySlug.has(slug)) buildsBySlug.set(slug, []);
      buildsBySlug.get(slug).push(build);
      // Flat builds shape mirrors the helper's expected `build` arg (species,
      // moves, evs, item, ability, nature, form all live at the top level
      // after flattenStoredBuild). egg_moves is also flat.
      try {
        const fp = window.BuildFingerprint?.buildFingerprint(build, build.egg_moves);
        if (fp) {
          // First write wins — keeps the canonical build stable when dupes
          // exist (shouldn't happen post-refactor, but defensive).
          if (!buildsByFingerprint.has(fp)) buildsByFingerprint.set(fp, build);
        }
      } catch (e) {
        console.warn('Failed to fingerprint build', build.id, e);
      }
    }
  }

  function hydrateTeamIndex() {
    teamsById.clear();
    teamsByBuildId.clear();
    teams = [];

    for (const team of teamStorage) {
      const mapped = DomainMappers.createTeamViewModel(team, {
        buildLookup: (buildId) => buildsById.get(buildId) || null,
      });
      teams.push(mapped);
      teamsById.set(mapped.id, mapped);
      for (const m of mapped.members || []) {
        if (m.build_id) {
          let s = teamsByBuildId.get(m.build_id);
          if (!s) { s = new Set(); teamsByBuildId.set(m.build_id, s); }
          s.add(mapped.id);
        }
      }
    }
  }

  function hydrateIndexes() {
    hydratePokedexIndex();
    hydrateBuildIndex();
    hydrateTeamIndex();
    hydrateSlotIndex();
  }

  function rebuildBuildIndexes() {
    hydrateBuildIndex();
    // Team view models embed linked build data, so build mutations must refresh both.
    hydrateTeamIndex();
  }

  function rebuildTeamIndexes() {
    hydrateTeamIndex();
  }

  // ── Species queries (delegated) ──────────────────────

  function getResolverContext() {
    return SpeciesQueries.getResolverContext();
  }

  function speciesSlug(species) {
    return SpeciesQueries.speciesSlug(species);
  }

  function getSpriteUrl(slug) {
    return SpeciesQueries.getSpriteUrl(slug);
  }

  function getSpriteBase() {
    return SPRITE_BASE;
  }

  function getPokedexEntry(dexIdOrSlug) {
    return SpeciesQueries.getPokedexEntry(dexIdOrSlug);
  }

  function resolveSpecies(speciesOrId) {
    return SpeciesQueries.resolveSpecies(speciesOrId);
  }

  function getSpriteCandidates(speciesOrId) {
    return SpeciesQueries.getSpriteCandidates(speciesOrId);
  }

  function getTotalCount() {
    return SpeciesQueries.getTotalCount();
  }

  /**
   * Get the locked gender for a species, if any.
   * Returns "M", "F", "N" (genderless), or null (variable gender).
   * Checks the species entry first, then falls back to baseSpecies.
   */
  function getSpeciesGender(speciesOrId) {
    const entry = getPokedexEntry(speciesOrId);
    if (!entry) return null;
    if (entry.gender) return entry.gender;
    // Forms inherit gender from base species
    if (entry.baseSpecies) {
      const baseKey = SpeciesResolver.normalizeCollapsedSlug(entry.baseSpecies);
      const baseEntry = getPokedexEntry(baseKey);
      if (baseEntry && baseEntry.gender) return baseEntry.gender;
    }
    return null;
  }

  // ── Ownership (spec §6.3 — derived from slot linkage, not build flags) ──


  /** True if at least one slot's target_build_id == build.id. */
  function isBuildOwned(build) {
    if (!build || !build.id) return false;
    return getInstancesTargeting(build.id).length > 0;
  }


  /**
   * Is a build "complete" — has all the fields needed to be a valid target?
   * Per spec §6.1: nature, ability, 4 moves, and a valid EV total
   * (510 classic or 66 champions). Item is optional.
   */
  function isBuildComplete(build) {
    if (!build) return false;
    if (!build.nature || !build.ability) return false;
    const moves = (build.moves || []).filter(m => m && String(m).trim());
    if (moves.length !== MAX_MOVES) return false;
    const evs = build.evs || {};
    const STAT_KEYS = DomainMappers.STAT_KEYS;
    const totals = { classic: 0, champions: 0 };
    for (const sys of ['classic', 'champions']) {
      const spread = evs[sys];
      if (!spread || typeof spread !== 'object') continue;
      for (const k of STAT_KEYS) {
        const v = spread[k];
        if (typeof v === 'number' && v > 0) totals[sys] += v;
      }
    }
    return totals.classic >= 508 || totals.champions >= 66;
  }

  /** Compare an instance state object against a build template's target fields. */
  function fieldsMatchBuild(state, build) {
    if (!state || !build) return { match: false, reasons: ['no state'] };
    const reasons = [];
    const eq = (a, b) => (a == null && b == null) || String(a || '') === String(b || '');
    if (!eq(state.nature, build.nature)) reasons.push('nature');
    if (!eq(state.ability, build.ability)) reasons.push('ability');
    if (!eq(state.item, build.item)) reasons.push('item');
    if (build.tera_type && !eq(state.tera_type, build.tera_type)) reasons.push('tera_type');
    // Moves: order-insensitive set comparison
    const am = new Set((state.moves || []).map(m => String(m || '').toLowerCase()));
    const bm = new Set((build.moves || []).map(m => String(m || '').toLowerCase()));
    if (am.size !== bm.size || ![...bm].every(m => am.has(m))) reasons.push('moves');
    // EVs per-stat per-system
    const ae = state.evs || {};
    const be = build.evs || {};
    for (const sys of ['classic', 'champions']) {
      const aSpread = ae[sys];
      const bSpread = be[sys];
      if (!aSpread && !bSpread) continue;
      if (!aSpread || !bSpread) { reasons.push(`${sys} EVs`); continue; }
      for (const stat of ['hp','atk','def','spa','spd','spe']) {
        if ((aSpread[stat] || 0) !== (bSpread[stat] || 0)) { reasons.push(`${sys} EVs`); break; }
      }
    }
    return { match: reasons.length === 0, reasons };
  }

  /**
   * Per-pair match check: is `state` (or any Build) field-equivalent to `target`?
   * Both args are Build-shaped (flat). Used to decide if an Instance's Current
   * Build matches its Target Build, or to compare two Library Builds.
   */
  function buildsMatch(state, target) {
    if (!target) return { match: false, reasons: ['no target'] };
    if (!state || Object.keys(state).length === 0) {
      return { match: false, reasons: ['state not recorded'] };
    }
    return fieldsMatchBuild(state, target);
  }

  /**
   * True if any Instance currently exists whose Current Build matches the
   * given Library Build's fields. Used to display "battle-ready" badges on
   * Library Builds.
   */
  function anyInstanceMatchesBuild(build) {
    if (!isBuildComplete(build)) return { ready: false, reason: 'Incomplete build' };
    const instances = getInstancesTargeting(build.id);
    if (instances.length === 0) return { ready: false, reason: 'Not owned' };
    for (const inst of instances) {
      const state = inst.state;
      if (!state || Object.keys(state).length === 0) continue;
      const m = fieldsMatchBuild(state, build);
      if (m.match) return { ready: true, reason: null };
    }
    const firstState = instances[0].state;
    if (!firstState || Object.keys(firstState).length === 0) {
      return { ready: false, reason: 'State not recorded' };
    }
    const m = fieldsMatchBuild(firstState, build);
    return { ready: false, reason: `Mismatch: ${m.reasons.join(', ')}` };
  }

  function getOwnedCount() {
    return SpeciesQueries.getOwnedCount();
  }

  function getSpeciesCompletion() {
    return SpeciesQueries.getSpeciesCompletion();
  }

  // ── Game compatibility ──────────────────────────────────

  function isInChampions(dexId) {
    return SpeciesQueries.isInChampions(dexId);
  }

  function isInSV(slugOrDexId) {
    return SpeciesQueries.isInSV(slugOrDexId);
  }

  function isInLegendsArceus(slugOrDexId) {
    return SpeciesQueries.isInLegendsArceus(slugOrDexId);
  }

  function isInLegendsZA(slugOrDexId) {
    return SpeciesQueries.isInLegendsZA(slugOrDexId);
  }

  function isInGame(slugOrDexId, game) {
    return SpeciesQueries.isInGame(slugOrDexId, game);
  }


  // ── Builds ─────────────────────────────────────────────

  function getBuild(buildId) {
    return buildsById.get(buildId) || null;
  }

  function getAllBuilds() {
    return builds;
  }

  function getCompetitiveSets(dexId) {
    const entry = pokedexByNum.get(dexId);
    if (!entry) return [];
    return buildsBySlug.get(entry.slug) || [];
  }


  // ── Teams ──────────────────────────────────────────────

  function getBattleTeams() {
    return teams;
  }


  // ── Inventory ─────────────────────────────────────────

  function hydrateSlotIndex() {
    slotsBySpecies.clear();
    slotsByBaseSpecies.clear();
    instancesByTargetBuildId.clear();
    if (!inventory || !inventory.boxes) return;
    for (let b = 0; b < inventory.boxes.length; b++) {
      const box = inventory.boxes[b];
      for (let s = 0; s < box.slots.length; s++) {
        const occupant = box.slots[s];
        if (!occupant) continue;
        // Form-preserving key (e.g. "floette-yellow", not collapsed to "floette")
        const key = SpeciesResolver.normalizeHyphenSlug(occupant.build?.species) || occupant.build?.species;
        if (key) {
          if (!slotsBySpecies.has(key)) slotsBySpecies.set(key, []);
          slotsBySpecies.get(key).push({ box: b, slot: s });
          // Also index under canonical (collapsed) slug for ghost lookups that resolve via pokedex
          const canonical = _speciesNameToId(occupant.build?.species);
          if (canonical && canonical !== key) {
            if (!slotsBySpecies.has(canonical)) slotsBySpecies.set(canonical, []);
            slotsBySpecies.get(canonical).push({ box: b, slot: s });
          }
          // Base species for cross-form lookups: pokedex baseSpecies or fallback collapse
          const entry = pokedexBySlug.get(key) || (canonical ? pokedexBySlug.get(canonical) : null);
          const base = entry?.baseSpecies
            ? _speciesNameToId(entry.baseSpecies)
            : (canonical || key);
          if (!slotsByBaseSpecies.has(base)) slotsByBaseSpecies.set(base, []);
          slotsByBaseSpecies.get(base).push({ box: b, slot: s });
        }
        const tbid = occupant.target_build_id;
        if (tbid) {
          const inst = getInstance(b, s);
          if (inst) {
            if (!instancesByTargetBuildId.has(tbid)) instancesByTargetBuildId.set(tbid, []);
            instancesByTargetBuildId.get(tbid).push(inst);
          }
        }
      }
    }
  }

  function getBoxCount() {
    return inventory ? inventory.box_count : 200;
  }

  function getBox(boxId) {
    if (!inventory) return null;
    const box = inventory.boxes[boxId];
    if (!box) return null;
    return {
      ...box,
      slots: (box.slots || []).map(slot => slot ? slotViewFromStorage(slot) : null),
    };
  }

  function getSlot(boxId, slotIdx) {
    if (!inventory) return null;
    const box = inventory.boxes[boxId];
    const slot = box?.slots?.[slotIdx] ?? null;
    return slot ? slotViewFromStorage(slot) : null;
  }

  function getSlotsBySpecies(speciesId) {
    return slotsBySpecies.get(speciesId) || [];
  }

  function getSlotsByBaseSpecies(speciesId) {
    const entry = pokedexBySlug.get(speciesId);
    const base = entry?.baseSpecies ? _speciesNameToId(entry.baseSpecies) : speciesId;
    return slotsByBaseSpecies.get(base) || [];
  }


  // ── Shared instance helpers ──────────────────────────────

  /** Stamp Instance Build identity (id, kind) onto a state object. */
  function _stampInstance(state, existing) {
    const s = { ...(state || {}) };
    if (!s.id) s.id = existing?.state?.id || StorageMappers.createBuildId();
    if (!s.kind) s.kind = existing?.state?.kind || 'instance';
    return s;
  }

  /** Apply gender lock for species if applicable. */
  function _applyGenderLock(state, speciesId) {
    const lockedGender = getSpeciesGender(speciesId);
    if (lockedGender === 'M' || lockedGender === 'F') {
      state.gender = lockedGender;
    } else if (lockedGender === 'N') {
      state.gender = '';
    }
  }


  async function placeInSlot(boxId, slotIdx, speciesId, buildId, state = null) {
    const target = typeof buildId === 'string' && buildId ? buildId : null;
    const stampedState = _stampInstance(state);
    _applyGenderLock(stampedState, speciesId);
    const result = await DataRepositories.inventory.putSlot(
      boxId,
      slotIdx,
      storageSlotFromState(speciesId, target, stampedState)
    );
    if (inventory && inventory.boxes[boxId]) {
      inventory.boxes[boxId].slots[slotIdx] = result;
      hydrateSlotIndex();
    }
    return getSlot(boxId, slotIdx);
  }

  /**
   * Place multiple Pokémon in a single API call (one disk write).
   * Each entry: { boxId, slotIdx, speciesId, buildId?, state? }
   * Returns array of affected box IDs.
   */
  async function batchPlaceSlots(entries) {
    const operations = entries.map(e => {
      const stampedState = _stampInstance(e.state);
      _applyGenderLock(stampedState, e.speciesId);
      const slotData = storageSlotFromState(e.speciesId, e.buildId || null, stampedState);
      return {
        op: 'set',
        box: e.boxId,
        slot: e.slotIdx,
        ...slotData,
      };
    });
    const result = await DataRepositories.inventory.batchOps(operations);
    // Update in-memory inventory
    const affectedBoxes = new Set();
    if (result.results) {
      for (const r of result.results) {
        if (inventory && inventory.boxes[r.box]) {
          inventory.boxes[r.box].slots[r.slot] = r.occupant;
          affectedBoxes.add(r.box);
        }
      }
    }
    if (affectedBoxes.size) hydrateSlotIndex();
    return [...affectedBoxes];
  }

  /**
   * Clear multiple slots in a single API call (one disk write).
   * Each entry: { boxId, slotIdx }
   */
  async function batchClearSlots(entries) {
    const operations = entries.map(e => ({
      op: 'clear',
      box: e.boxId,
      slot: e.slotIdx,
    }));
    const result = await DataRepositories.inventory.batchOps(operations);
    const affectedBoxes = new Set();
    if (result.results) {
      for (const r of result.results) {
        if (inventory && inventory.boxes[r.box]) {
          inventory.boxes[r.box].slots[r.slot] = null;
          affectedBoxes.add(r.box);
        }
      }
    }
    if (affectedBoxes.size) hydrateSlotIndex();
    return [...affectedBoxes];
  }

  /**
   * Scan all inventory slots and fix gender for gender-locked species.
   * Returns count of corrected slots. Uses batch endpoint for efficiency.
   */
  async function enforceGenderLocks() {
    if (!inventory || !inventory.boxes) return 0;
    const fixes = [];
    for (const [boxId, box] of Object.entries(inventory.boxes)) {
      if (!box || !box.slots) continue;
      for (let i = 0; i < box.slots.length; i++) {
        const rawSlot = box.slots[i];
        if (!rawSlot || !rawSlot.build) continue;
        const viewSlot = getSlot(boxId, i);
        if (!viewSlot || !viewSlot.species_id) continue;
        const locked = getSpeciesGender(viewSlot.species_id);
        if (!locked) continue;
        const currentGender = viewSlot.state?.gender || '';
        const expectedGender = (locked === 'N') ? '' : locked;
        if (currentGender !== expectedGender) {
          fixes.push({ boxId, slotIdx: i, viewSlot, expectedGender });
        }
      }
    }
    if (!fixes.length) return 0;
    const operations = fixes.map(f => {
      const newState = { ...(f.viewSlot.state || {}), gender: f.expectedGender };
      return {
        op: 'set',
        box: Number(f.boxId),
        slot: f.slotIdx,
        ...storageSlotFromState(f.viewSlot.species_id, f.viewSlot.target_build_id || null, newState),
      };
    });
    const result = await DataRepositories.inventory.batchOps(operations);
    if (result.results) {
      for (const r of result.results) {
        if (inventory.boxes[r.box]) {
          inventory.boxes[r.box].slots[r.slot] = r.occupant;
        }
      }
      hydrateSlotIndex();
    }
    console.debug(`[Gender] Auto-corrected ${fixes.length} slot(s)`);
    return fixes.length;
  }

  /** Update the `state` (Current Build + identity fields) on a slot. */
  async function updateSlotState(boxId, slotIdx, state) {
    const existing = getSlot(boxId, slotIdx);
    if (!existing || !existing.species_id) return null;
    const stampedState = _stampInstance(state, existing);
    const result = await DataRepositories.inventory.putSlot(
      boxId,
      slotIdx,
      storageSlotFromState(existing.species_id, existing.target_build_id || null, stampedState)
    );
    if (inventory && inventory.boxes[boxId]) {
      inventory.boxes[boxId].slots[slotIdx] = result;
      hydrateSlotIndex();
    }
    return getSlot(boxId, slotIdx);
  }

  // Fields the build form can set beyond DomainMappers.BUILD_STATE_FIELDS. These land in
  // the identity bucket on disk but live in `state` in memory.
  const _FORM_EXTRA_FIELDS = DomainMappers.FORM_EXTRA_FIELDS;

  /**
   * Update only the Current Build (the Build-scoped fields) on an Instance.
   * Preserves identity-scoped fields like genned, ot, language. The build payload
   * can be a flat Build shape from `openBuildForm` or any subset of
   * DomainMappers.BUILD_STATE_FIELDS.
   */
  async function updateSlotBuild(boxId, slotIdx, buildPayload) {
    const existing = getSlot(boxId, slotIdx);
    if (!existing || !existing.species_id) return null;
    const nextState = DomainMappers.mergeBuildPayloadIntoState(existing.state || {}, buildPayload || {});
    if (!nextState.id) nextState.id = existing.state?.id || StorageMappers.createBuildId();

    // Detect species change (mutation) — update species_id and clear stale target
    const newSpeciesId = SpeciesResolver.normalizeHyphenSlug(nextState.slug || nextState.species) || existing.species_id;
    const speciesChanged = newSpeciesId !== existing.species_id;
    const speciesId = speciesChanged ? newSpeciesId : existing.species_id;
    const targetBuildId = speciesChanged ? null : (existing.target_build_id || null);

    const stampedState = _stampInstance(nextState, existing);
    const result = await DataRepositories.inventory.putSlot(
      boxId,
      slotIdx,
      storageSlotFromState(speciesId, targetBuildId, stampedState)
    );
    if (inventory && inventory.boxes[boxId]) {
      inventory.boxes[boxId].slots[slotIdx] = result;
      hydrateSlotIndex();
    }
    return getSlot(boxId, slotIdx);
  }

  /** Update a single identity-scoped field on an Instance (e.g. transferred_to_champions). */
  async function updateSlotIdentityField(boxId, slotIdx, field, value) {
    const existing = getSlot(boxId, slotIdx);
    if (!existing || !existing.species_id) return null;
    const nextState = _stampInstance({ ...(existing.state || {}), [field]: value }, existing);
    return updateSlotState(boxId, slotIdx, nextState);
  }

  /** Set the Target Library Build for an Instance. */
  async function setTargetBuild(boxId, slotIdx, buildId) {
    const existing = getSlot(boxId, slotIdx);
    if (!existing || !existing.species_id || !buildId) return null;
    if (existing.target_build_id === buildId) return existing;
    const result = await DataRepositories.inventory.putSlot(
      boxId,
      slotIdx,
      storageSlotFromState(existing.species_id, buildId, existing.state || {})
    );
    if (inventory && inventory.boxes[boxId]) {
      inventory.boxes[boxId].slots[slotIdx] = result;
      hydrateSlotIndex();
    }
    return getSlot(boxId, slotIdx);
  }

  /** Clear the Target Library Build pointer on an Instance. */
  async function clearTargetBuild(boxId, slotIdx) {
    const existing = getSlot(boxId, slotIdx);
    if (!existing || !existing.species_id) return null;
    const result = await DataRepositories.inventory.putSlot(
      boxId,
      slotIdx,
      storageSlotFromState(existing.species_id, null, existing.state || {})
    );
    if (inventory && inventory.boxes[boxId]) {
      inventory.boxes[boxId].slots[slotIdx] = result;
      hydrateSlotIndex();
    }
    return getSlot(boxId, slotIdx);
  }

  /**
   * Promote an Instance's Current Build to a new Library Build. If a Library
   * Build with the same fingerprint already exists, that one is reused (no
   * duplicate row). Sets the Instance's target_build_id to the resulting
   * Library Build. Returns the Library Build.
   */
  async function promoteInstanceBuildToLibrary(boxId, slotIdx, opts = {}) {
    const existing = getSlot(boxId, slotIdx);
    if (!existing || !existing.species_id) return null;
    const state = existing.state || {};
    if (!state.species && !state.nature) return null;
    // Resolve species name from species_id if not on state.
    let speciesName = state.species;
    if (!speciesName) {
      if (typeof existing.species_id === 'number') {
        const e = pokedexByNum.get(existing.species_id);
        if (e) speciesName = e.name;
      } else if (typeof existing.species_id === 'string') {
        const e = pokedexBySlug.get(existing.species_id);
        if (e) speciesName = e.name;
      }
    }
    const slug = state.slug || speciesSlug(speciesName);
    const candidate = DomainMappers.createLibraryBuildCandidateFromInstance(existing, {
      species: speciesName,
      slug,
      notes: opts.notes || `Promoted from Instance (Box ${boxId + 1} · Slot ${slotIdx + 1})`,
    });
    // Fingerprint dedupe before POST — if an identical Library Build exists,
    // reuse it instead of creating a duplicate row (rubber-duck concern #1).
    let library = null;
    try {
      const fp = window.BuildFingerprint?.buildFingerprint(candidate, candidate.egg_moves);
      if (fp) library = buildsByFingerprint.get(fp) || null;
    } catch (err) {
      console.warn('Fingerprint failed, skipping dedup:', err);
    }
    if (!library) {
      library = await createBuild(candidate);
    }
    await setTargetBuild(boxId, slotIdx, library.id);
    return library;
  }

  /**
   * Get a normalized instance view for a slot.
   * Returns { box, slot, species_id, species_slug, target_build_id, state, location } or null.
   */
  function getInstance(boxId, slotIdx) {
    const slot = getSlot(boxId, slotIdx);
    if (!slot || !slot.species_id) return null;
    let speciesSlugValue = null;
    const key = slot.species_id;
    if (typeof key === 'number') {
      const entry = pokedexByNum.get(key);
      if (entry) speciesSlugValue = entry.slug;
    } else if (typeof key === 'string') {
      speciesSlugValue = key;
    }
    const box = inventory && inventory.boxes[boxId];
    return DomainMappers.createInstanceModel(slot, {
      boxId,
      slotIdx,
      boxName: box?.name || `Box ${boxId + 1}`,
      speciesSlug: speciesSlugValue,
    });
  }

  /** Iterate every owned Pokémon instance from placed box slots. */
  function getAllInstances() {
    const out = [];
    if (!inventory) return out;
    for (let b = 0; b < inventory.boxes.length; b++) {
      const box = inventory.boxes[b];
      for (let s = 0; s < box.slots.length; s++) {
        if (box.slots[s]) {
          const inst = getInstance(b, s);
          if (inst) out.push(inst);
        }
      }
    }
    return out;
  }


  /** All Instances whose target_build_id matches the given Library Build id. */
  function getInstancesTargeting(buildId) {
    if (!buildId) return [];
    return instancesByTargetBuildId.get(buildId) || [];
  }

  /**
   * Count how many Library Builds in `builds` use a given target build as their
   * basis — currently always 0 (Library Builds don't reference each other), but
   * exposed so callers can show "X teams use this" without separate queries.
   * Returns { teams: number, instances: number }.
   */
  function countLibraryBuildUsage(buildId) {
    if (!buildId) return { teams: 0, instances: 0 };
    const teamCount = teamsByBuildId.get(buildId)?.size || 0;
    const instanceCount = getInstancesTargeting(buildId).length;
    return { teams: teamCount, instances: instanceCount };
  }

  async function removeFromSlot(boxId, slotIdx) {
    await DataRepositories.inventory.deleteSlot(boxId, slotIdx);
    if (inventory && inventory.boxes[boxId]) {
      inventory.boxes[boxId].slots[slotIdx] = null;
      hydrateSlotIndex();
    }
  }

  async function moveSlot(fromBox, fromSlot, toBox, toSlot) {
    if (!inventory?.boxes[fromBox]?.slots || !inventory?.boxes[toBox]?.slots) {
      console.warn(`[Data] moveSlot skipped for invalid box indices: from=${fromBox}, to=${toBox}`);
      return null;
    }
    const result = await DataRepositories.inventory.moveSlot(fromBox, fromSlot, toBox, toSlot);
    const fromResult = result?.from;
    const toResult = result?.to;
    if (!fromResult || !toResult) {
      throw new Error('Move response missing slot payloads');
    }
    if (inventory) {
      if (inventory.boxes[fromResult.box]) inventory.boxes[fromResult.box].slots[fromResult.slot] = fromResult.occupant ?? null;
      if (inventory.boxes[toResult.box]) inventory.boxes[toResult.box].slots[toResult.slot] = toResult.occupant ?? null;
      hydrateSlotIndex();
    }
    return result;
  }

  /**
   * Move multiple slots to consecutive positions starting at a target slot.
   * entries: [{boxId, slotIdx}, ...] — sources to move (sorted by box/slot).
   * Returns set of box IDs that were affected (for refreshing).
   */
  async function batchMoveSlots(entries, targetBoxId, targetSlotIdx) {
    const slotsPerBox = SLOTS_PER_BOX;
    const affectedBoxes = new Set();
    const targets = [];
    let b = targetBoxId, s = targetSlotIdx;
    const boxCount = getBoxCount();
    for (let i = 0; i < entries.length; i++) {
      if (b >= boxCount) break;
      targets.push({ boxId: b, slotIdx: s });
      s++;
      if (s >= slotsPerBox) { s = 0; b++; }
    }

    // Simulate swaps in a virtual grid to compute final state in one pass
    const grid = new Map(); // "box:slot" → raw occupant
    const getKey = (bx, sl) => `${bx}:${sl}`;
    const getOccupant = (bx, sl) => {
      const k = getKey(bx, sl);
      return grid.has(k) ? grid.get(k) : (inventory?.boxes[bx]?.slots?.[sl] ?? null);
    };

    for (let i = 0; i < Math.min(entries.length, targets.length); i++) {
      const src = entries[i];
      const dst = targets[i];
      if (src.boxId === dst.boxId && src.slotIdx === dst.slotIdx) continue;
      const srcOccupant = getOccupant(src.boxId, src.slotIdx);
      const dstOccupant = getOccupant(dst.boxId, dst.slotIdx);
      grid.set(getKey(src.boxId, src.slotIdx), dstOccupant);
      grid.set(getKey(dst.boxId, dst.slotIdx), srcOccupant);
      affectedBoxes.add(src.boxId);
      affectedBoxes.add(dst.boxId);
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[j].boxId === dst.boxId && entries[j].slotIdx === dst.slotIdx) {
          entries[j] = { boxId: src.boxId, slotIdx: src.slotIdx };
        }
      }
    }

    // Build batch operations from virtual grid
    const ops = [];
    for (const [key, occupant] of grid) {
      const [bx, sl] = key.split(':').map(Number);
      if (occupant) {
        ops.push({ op: 'set', box: bx, slot: sl, ...occupant });
      } else {
        ops.push({ op: 'clear', box: bx, slot: sl });
      }
    }
    if (ops.length) {
      const result = await DataRepositories.inventory.batchOps(ops);
      if (result.results) {
        for (const r of result.results) {
          if (inventory?.boxes[r.box]) {
            inventory.boxes[r.box].slots[r.slot] = r.occupant ?? null;
          }
        }
        hydrateSlotIndex();
      }
    }
    return affectedBoxes;
  }

  async function batchRemoveSlots(entries) {
    return new Set(await batchClearSlots(entries.map(e => ({ boxId: e.boxId, slotIdx: e.slotIdx }))));
  }

  async function renameBox(boxId, name) {
    const result = await DataRepositories.inventory.renameBox(boxId, name);
    if (inventory && inventory.boxes[boxId]) {
      inventory.boxes[boxId].name = result.name;
    }
    return result;
  }

  async function createBuild(buildData) {
    const draft = DomainMappers.createEditableBuildDraft(buildData, {
      kind: 'library',
      evSystem: buildData?.ev_system,
    });
    // Dedupe guard: if a build with the same battle identity already exists,
    // return it instead of POSTing a duplicate. This keeps callers (auto-import
    // flows, manual create) from generating semantic dupes in builds.json.
    try {
      const fp = window.BuildFingerprint?.buildFingerprint(draft, draft?.egg_moves);
      if (fp) {
        const existing = buildsByFingerprint.get(fp);
        if (existing) return existing;
      }
    } catch (err) {
      console.warn('Fingerprint failed, skipping dedup:', err);
    }
    const result = await DataRepositories.builds.create(draft);
    builds.push(result);
    rebuildBuildIndexes();
    return builds[builds.length - 1];
  }

  function hasInlineTeamMemberData(member) {
    return !!(
      String(member?.species || '').trim()
      || String(member?.item || '').trim()
      || String(member?.ability || '').trim()
      || String(member?.nature || '').trim()
      || String(member?.form || '').trim()
      || String(member?.tera_type || '').trim()
      || String(member?.ball || '').trim()
      || (Array.isArray(member?.moves) && member.moves.some((move) => String(move || '').trim()))
      || (member?.evs && typeof member.evs === 'object' && Object.keys(member.evs).length > 0)
    );
  }

  async function canonicalizeTeamMembers(teamData) {
    const evSystem = DomainMappers.normalizeEvSystem(teamData?.ev_system);
    const members = [];

    for (const [index, member] of (teamData?.members || []).entries()) {
      const slot = Number.parseInt(member?.slot, 10) || index + 1;
      const buildId = typeof member?.build_id === 'string' && member.build_id.trim()
        ? member.build_id.trim()
        : null;

      if (!hasInlineTeamMemberData(member)) {
        if (buildId) members.push({ slot, build_id: buildId });
        continue;
      }

      try {
        const candidate = DomainMappers.createBuildCandidateFromTeamMember(member, evSystem);
        if (!candidate?.species) {
          if (buildId) members.push({ slot, build_id: buildId });
          continue;
        }

        const linked = findBuildByFingerprint(candidate) || await createBuild({ ...candidate, owned: false });
        members.push({ slot, build_id: linked.id });
      } catch (err) {
        console.warn(`[Data] canonicalizeTeamMembers: slot ${slot} failed:`, err);
        if (buildId) members.push({ slot, build_id: buildId });
      }
    }

    return members;
  }

  function findBuildByFingerprint(buildData, eggMoves) {
    try {
      const fp = window.BuildFingerprint?.buildFingerprint(buildData, eggMoves ?? buildData?.egg_moves);
      return fp ? (buildsByFingerprint.get(fp) || null) : null;
    } catch (err) {
      console.warn('Fingerprint failed, skipping dedup:', err);
      return null;
    }
  }

  async function updateBuild(id, buildData) {
    const draft = DomainMappers.createEditableBuildDraft(buildData, {
      kind: 'library',
      evSystem: buildData?.ev_system,
    });
    const flat = await DataRepositories.builds.update(id, draft);
    const idx = builds.findIndex(b => b.id === id);
    if (idx >= 0) builds[idx] = flat;
    rebuildBuildIndexes();
    return flat;
  }

  async function deleteBuild(id) {
    const orphans = getInstancesTargeting(id);
    await DataRepositories.builds.delete(id);
    builds = builds.filter(b => b.id !== id);
    rebuildBuildIndexes();
    if (orphans.length > 0) {
      const ops = orphans.map(inst => {
        const slot = getSlot(inst.box, inst.slot);
        if (!slot || !slot.species_id) return null;
        return {
          op: 'set', box: inst.box, slot: inst.slot,
          ...storageSlotFromState(slot.species_id, null, slot.state || {}),
        };
      }).filter(Boolean);
      if (ops.length) {
        const result = await DataRepositories.inventory.batchOps(ops);
        if (result.results) {
          for (const r of result.results) {
            if (inventory?.boxes[r.box]) inventory.boxes[r.box].slots[r.slot] = r.occupant;
          }
          hydrateSlotIndex();
        }
      }
    }
  }

  async function createTeam(teamData) {
    const payload = DomainMappers.createTeamStorage({
      ...teamData,
      members: await canonicalizeTeamMembers(teamData),
    });
    const result = await DataRepositories.teams.create(payload);
    teamStorage.push(result);
    rebuildTeamIndexes();
    return teamsById.get(result.id) || DomainMappers.createTeamViewModel(result, {
      buildLookup: (buildId) => buildsById.get(buildId) || null,
    });
  }

  async function updateTeam(id, teamData) {
    const payload = DomainMappers.createTeamStorage({
      ...teamData,
      members: await canonicalizeTeamMembers(teamData),
    });
    const result = await DataRepositories.teams.update(id, payload);
    const idx = teamStorage.findIndex(t => t.id === id);
    if (idx >= 0) teamStorage[idx] = result;
    rebuildTeamIndexes();
    return teamsById.get(result.id) || DomainMappers.createTeamViewModel(result, {
      buildLookup: (buildId) => buildsById.get(buildId) || null,
    });
  }

  async function deleteTeam(id) {
    await DataRepositories.teams.delete(id);
    teamStorage = teamStorage.filter(t => t.id !== id);
    rebuildTeamIndexes();
  }

  // ── Reference data queries ────────────────────────────

  function dexNumToGen(num) {
    return SpeciesQueries.dexNumToGen(num);
  }

  function searchSpecies(query) {
    return SpeciesQueries.searchSpecies(query);
  }

  function _searchByName(list, query, limit = 20) {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    return list.filter(item => (item.nameLower || item.name.toLowerCase()).includes(q)).slice(0, limit);
  }

  function searchMoves(query) { return _searchByName(movesList, query); }
  function searchItems(query) { return _searchByName(itemsList, query); }
  function searchAbilities(query) { return _searchByName(abilitiesList, query); }

  function getAbilitiesForSpecies(slug) {
    const entry = pokedexBySlug.get(slug);
    if (!entry || !entry.abilities) return [];
    return Object.values(entry.abilities).filter(Boolean);
  }

  function isHiddenAbility(slug, abilityName) {
    if (!slug || !abilityName) return false;
    const entry = pokedexBySlug.get(slug);
    return !!(entry?.abilities?.H && entry.abilities.H === abilityName);
  }

  function formatAbilityLabel(slug, abilityName) {
    if (!abilityName) return '';
    if (abilityName === '---') return '\u2014';
    return isHiddenAbility(slug, abilityName) ? `${abilityName} (HA)` : abilityName;
  }

  function getNatures() { return naturesList; }
  function getMoves() { return movesList; }
  function getItems() { return itemsList; }
  function getAbilities() { return abilitiesList; }

  function getMoveType(moveName) {
    if (!moveName) return null;
    const slug = moveName.toLowerCase().replace(/[\s,'-]+/g, '');
    const entry = movesData[slug];
    return entry ? entry.type : null;
  }

  function getNatureEffect(natureName) {
    if (!natureName) return null;
    const slug = natureName.toLowerCase();
    const entry = naturesData[slug];
    return entry ? { plus: entry.plus || null, minus: entry.minus || null } : null;
  }

  // ── Learnsets + factory sets (delegated) ───────────────

  function getLearnset(speciesSlugOrName) {
    return LearnsetService.getLearnset(speciesSlugOrName);
  }

  function getEggMovesForSpecies(speciesSlugOrName) {
    return LearnsetService.getEggMovesForSpecies(speciesSlugOrName);
  }

  function isEggMoveForSpecies(speciesSlugOrName, moveRef) {
    return LearnsetService.isEggMoveForSpecies(speciesSlugOrName, moveRef);
  }

  function mergeKnownEggMoves(speciesSlugOrName, explicitEggMoves = [], currentMoves = []) {
    return LearnsetService.mergeKnownEggMoves(speciesSlugOrName, explicitEggMoves, currentMoves);
  }

  function searchMovesForSpecies(speciesSlug, query) {
    return LearnsetService.searchMovesForSpecies(speciesSlug, query);
  }

  function searchEggMovesForSpecies(speciesSlug, query) {
    return LearnsetService.searchEggMovesForSpecies(speciesSlug, query);
  }

  function listFactorySets(speciesName) {
    return LearnsetService.listFactorySets(speciesName);
  }

  function factorySetToBuildShape(set, fallbackSpecies) {
    return LearnsetService.factorySetToBuildShape(set, fallbackSpecies);
  }

  function getDefaultSet(speciesName) {
    return LearnsetService.getDefaultSet(speciesName);
  }

  function searchAbilitiesForSpecies(slug) {
    return LearnsetService.searchAbilitiesForSpecies(slug);
  }

  // ── Public API ─────────────────────────────────────────

  return {
    init,
    getPokedexEntry, resolveSpecies, getSpriteCandidates,
    getTotalCount, getSpeciesGender,
    isBuildOwned,
    isBuildComplete, anyInstanceMatchesBuild, fieldsMatchBuild, buildsMatch,
    getOwnedCount, getSpeciesCompletion,
    isInChampions, isInSV, isInLegendsArceus, isInLegendsZA, isInGame,
    getBuild, getAllBuilds,
    getCompetitiveSets,
    getBattleTeams,
    createBuild, updateBuild, deleteBuild, findBuildByFingerprint,
    createTeam, updateTeam, deleteTeam,
    getSpriteUrl, getSpriteBase, speciesSlug,
    // Inventory
    getBoxCount, getBox, getSlot, getSlotsBySpecies, getSlotsByBaseSpecies,
    placeInSlot, batchPlaceSlots, batchClearSlots, removeFromSlot, moveSlot, batchMoveSlots, batchRemoveSlots, renameBox,
    updateSlotState, updateSlotBuild, updateSlotIdentityField,
    enforceGenderLocks,
    // Instance ↔ Library Build (Build unification)
    getInstance, getAllInstances,
    getInstancesTargeting, setTargetBuild, clearTargetBuild,
    promoteInstanceBuildToLibrary, countLibraryBuildUsage,
    // Reference data
    searchSpecies, searchMoves, searchItems, searchAbilities,
    getAbilitiesForSpecies, isHiddenAbility, formatAbilityLabel,
    getNatures, getMoves, getItems, getAbilities,
    getMoveType, getNatureEffect, dexNumToGen,
    // Learnset + factory set queries (lazy-loaded)
    getLearnset, getEggMovesForSpecies, isEggMoveForSpecies, mergeKnownEggMoves,
    searchMovesForSpecies, searchEggMovesForSpecies, getDefaultSet, listFactorySets,
    factorySetToBuildShape, searchAbilitiesForSpecies,
    // Presets
    loadPresetIndex: (...args) => PresetService.loadPresetIndex(...args),
    loadPreset: (...args) => PresetService.loadPreset(...args),
    clearPreset: () => PresetService.clearPreset(),
    getActivePreset: () => PresetService.getActivePreset(),
    getPresetCompletion: () => PresetService.getPresetCompletion(),
    normalizePresetSlug: (...args) => PresetService.normalizePresetSlug(...args),
    slotMatchesPreset: (...args) => PresetService.slotMatchesPreset(...args),
  };
})();

if (typeof window !== 'undefined') {
  window.DataManager = DataManager;
}
