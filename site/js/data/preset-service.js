const PresetService = (() => {
  let activePreset = null; // { gameSet, layoutId, name, boxes: [{title, pokemon: [slug]}] }
  let _ctx = null;

  function init(ctx) {
    _ctx = ctx || null;
  }

  function getContext() {
    return _ctx || {};
  }

  async function getPresetData(gameSet) {
    const { loadPresetData } = getContext();
    if (typeof loadPresetData === 'function') {
      return (await loadPresetData(gameSet)) || {};
    }
    return (await ReferenceData.loadPresetData(gameSet)) || {};
  }

  function getResolverContext() {
    return typeof getContext().getResolverContext === 'function'
      ? getContext().getResolverContext()
      : null;
  }

  function getBox(boxId) {
    return typeof getContext().getBox === 'function'
      ? getContext().getBox(boxId)
      : null;
  }

  async function loadPresetIndex(gameSet) {
    const data = await getPresetData(gameSet);
    return Object.entries(data).map(([id, layout]) => ({
      id,
      name: layout.name,
      boxCount: layout.boxes.length,
    }));
  }

  /**
   * Parse a raw preset PID into a structured target object. All PID anatomy
   * (gender, ability marker, gmax) is resolved exactly once here at load time.
   * Uses resolve() to distinguish species names ending in -f (nidoran-f) from
   * gender suffixes (sneasel-hisui-f).
   */
  function parsePid(rawPid, gmaxFlag, resolverCtx) {
    if (!rawPid) return { pid: null, speciesKey: null, gender: null, abilitySlug: null, gmax: false };

    // 1. Strip ability marker (double-hyphen)
    const abilityIdx = rawPid.indexOf('--');
    const abilitySlug = abilityIdx !== -1 ? rawPid.slice(abilityIdx + 2) : null;
    const withoutAbility = abilityIdx !== -1 ? rawPid.slice(0, abilityIdx) : rawPid;

    // 2. Detect gender suffix -(f|m) — only if the full string is NOT a direct dex entry
    let gender = null;
    let speciesKey = withoutAbility;

    const genderMatch = withoutAbility.match(/^(.+)-(f|m)$/i);
    if (genderMatch && resolverCtx) {
      const probe = SpeciesResolver.resolve(withoutAbility, resolverCtx);
      if (!probe.matchedDirect) {
        gender = genderMatch[2].toUpperCase();
        speciesKey = genderMatch[1];
      }
    }

    return { pid: rawPid, speciesKey, gender, abilitySlug, gmax: !!gmaxFlag };
  }

  async function loadPreset(gameSet, layoutId) {
    const data = await getPresetData(gameSet);
    const layout = data[layoutId];
    if (!layout) {
      activePreset = null;
      return null;
    }

    const resolverCtx = getResolverContext();

    const boxes = layout.boxes.map((box) => ({
      title: box.title,
      pokemon: box.pokemon.map((pokemon) => {
        if (pokemon === null || pokemon === undefined) {
          return { pid: null, speciesKey: null, gender: null, abilitySlug: null, gmax: false };
        }
        const rawPid = typeof pokemon === 'string' ? pokemon : (pokemon.pid || '');
        const gmaxFlag = typeof pokemon === 'object' ? !!pokemon.gmax : false;
        return parsePid(rawPid, gmaxFlag, resolverCtx);
      }),
    }));

    activePreset = { gameSet, layoutId, name: layout.name, boxes };
    return activePreset;
  }

  function clearPreset() {
    activePreset = null;
  }

  function getActivePreset() {
    return activePreset;
  }

  function normalizePresetSlug(presetSlug) {
    return SpeciesResolver.normalizePresetSlug(presetSlug, getResolverContext());
  }

  /**
   * Test whether an occupant slot satisfies a preset target.
   * @param {object|string} occupant — full slot { species_id, state } or plain species string
   * @param {string|object} presetTarget — raw PID or parsed PresetTarget { speciesKey, gender, gmax }
   * @returns {boolean}
   */
  function slotMatchesPreset(occupant, presetTarget) {
    const ctx = getResolverContext();
    const isObj = occupant !== null && typeof occupant === 'object';
    const speciesInput = isObj ? (occupant.state?.species || occupant.species_id) : occupant;
    const instanceState = isObj ? (occupant.state || null) : null;
    return SpeciesResolver.matchesPreset(speciesInput, presetTarget, ctx, instanceState);
  }

  function getPresetCompletion() {
    if (!activePreset) return { matched: 0, total: 0, percent: 0 };

    let matched = 0;
    let total = 0;
    for (let boxIndex = 0; boxIndex < activePreset.boxes.length && boxIndex < 200; boxIndex++) {
      const presetBox = activePreset.boxes[boxIndex];
      const inventoryBox = getBox(boxIndex);
      if (!presetBox || !inventoryBox) continue;

      for (let slotIndex = 0; slotIndex < presetBox.pokemon.length && slotIndex < 30; slotIndex++) {
        const target = presetBox.pokemon[slotIndex];
        if (!target?.pid) continue;
        total++;
        const occupant = inventoryBox.slots[slotIndex];
        if (occupant && slotMatchesPreset(occupant, target)) {
          matched++;
        }
      }
    }

    return { matched, total, percent: total > 0 ? (matched / total) * 100 : 0 };
  }

  return {
    init,
    loadPresetIndex,
    loadPreset,
    clearPreset,
    getActivePreset,
    getPresetCompletion,
    normalizePresetSlug,
    slotMatchesPreset,
  };
})();

if (typeof window !== 'undefined') {
  window.PresetService = PresetService;
}
