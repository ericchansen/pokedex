/**
 * data/storage-mappers.js - Storage/in-memory projection helpers for builds and instances.
 */
export const StorageMappers = (() => {
  const BUILD_STATE_FIELDS = DomainMappers.BUILD_STATE_FIELDS;
  const IDENTITY_EXCLUDE = new Set([
    ...BUILD_STATE_FIELDS,
    'id',
    'kind',
    'species',
    'slug',
    'ivs',
    'ev_system',
  ]);

  function createBuildId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `b-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  }

  function flattenStoredBuild(entry) {
    if (!entry) return entry;
    const inner = entry.build || {};
    const flat = DomainMappers.createEditableBuildDraft({
      id: entry.id,
      slug: entry.slug,
      kind: entry.kind || 'library',
      ...inner,
      egg_moves: entry.egg_moves,
      notes: entry.notes,
      source_url: entry.source_url,
    }, { kind: entry.kind || 'library' });
    if (entry.source != null) flat.source = entry.source;
    return flat;
  }

  function unflattenStoredBuild(flat) {
    if (!flat) return flat;
    const inner = {};
    if (flat.species != null) inner.species = flat.species;
    for (const key of BUILD_STATE_FIELDS) {
      if (flat[key] !== undefined) inner[key] = flat[key];
    }

    const out = {
      id: flat.id,
      slug: flat.slug,
      kind: flat.kind || 'library',
      build: inner,
    };
    if (flat.egg_moves?.length) out.egg_moves = flat.egg_moves;
    if (flat.notes !== undefined) out.notes = flat.notes;
    if (flat.source_url !== undefined) out.source_url = flat.source_url;
    if (flat.source !== undefined) out.source = flat.source;
    return out;
  }

  function slotStateFromStorage(slot) {
    if (!slot || !slot.build) return slot;
    const build = slot.build || {};
    const identity = slot.identity || {};
    return DomainMappers.createEditableBuildDraft({
      ...build,
      ...identity,
      id: build.id || createBuildId(),
      kind: build.kind || 'instance',
    }, { kind: 'instance', evSystem: build.ev_system });
  }

  function slotViewFromStorage(slot, options = {}) {
    if (!slot || !slot.build) return slot;
    const build = slot.build || {};
    // Form-preserving: use normalizeHyphenSlug to keep form suffixes intact
    // (e.g. "Floette-Yellow" → "floette-yellow", not collapsed to "floette").
    // Fall back to speciesNameToId only for pokedex data lookups elsewhere.
    const normalizeHyphenSlug = typeof options.normalizeHyphenSlug === 'function'
      ? options.normalizeHyphenSlug
      : null;
    const speciesId = normalizeHyphenSlug
      ? (normalizeHyphenSlug(build.species) || build.species)
      : build.species;
    return {
      species_id: speciesId,
      target_build_id: typeof slot.target_build_id === 'string' ? slot.target_build_id : null,
      state: slotStateFromStorage(slot),
    };
  }

  function storageSlotFromState(speciesId, targetBuildId, stateInput, options = {}) {
    const state = stateInput || {};
    const speciesNameFromKey = typeof options.speciesNameFromKey === 'function'
      ? options.speciesNameFromKey
      : () => null;
    const build = {};
    const speciesName = speciesNameFromKey(speciesId);
    if (speciesName) build.species = speciesName;
    for (const key of BUILD_STATE_FIELDS) {
      if (state[key] !== undefined) build[key] = state[key];
    }
    if (state.id) build.id = state.id;
    build.kind = state.kind || 'instance';

    const identity = {};
    for (const key of Object.keys(state)) {
      if (IDENTITY_EXCLUDE.has(key)) continue;
      if (key === 'egg_moves' && Array.isArray(state[key]) && state[key].length === 0) continue;
      if (state[key] !== undefined) identity[key] = state[key];
    }

    return {
      build,
      identity,
      target_build_id: typeof targetBuildId === 'string' ? targetBuildId : null,
    };
  }

  return {
    createBuildId,
    flattenStoredBuild,
    unflattenStoredBuild,
    slotStateFromStorage,
    slotViewFromStorage,
    storageSlotFromState,
  };
})();

if (typeof window !== 'undefined') {
  window.StorageMappers = StorageMappers;
}
