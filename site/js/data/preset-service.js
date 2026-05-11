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
   * Species whose unsuffixed sprite is conventionally male — used to auto-imply
   * `defaults.gender = "M"` for unsuffixed preset entries.
   * This is a LENIENT default: instances with no gender set still match.
   */
  const GENDER_SPRITE_SPECIES = (typeof SpeciesResolver !== 'undefined' && SpeciesResolver.GENDER_SPRITE_SPECIES)
    || new Set();

  /**
   * Slug-ify ability marker text: "battle-bond" → "Battle Bond" for storage.
   * The reverse is handled by NORMALIZERS in matchesPreset.
   */
  function abilitySlugToName(slug) {
    if (!slug) return null;
    return String(slug)
      .replace(/-/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Build a stable synthetic pid for structured preset entries.
   * Used to keep `target.pid` truthy throughout the codebase.
   *   parseSyntheticPid("alcremie", { cream: "Vanilla Cream", sweet: "Strawberry" })
   *   → "alcremie|cream=Vanilla Cream|sweet=Strawberry"
   */
  function syntheticPid(speciesKey, requires) {
    const parts = [speciesKey || ''];
    if (requires && typeof requires === 'object') {
      const keys = Object.keys(requires).sort();
      for (const k of keys) parts.push(`${k}=${requires[k]}`);
    }
    return parts.join('|');
  }

  /**
   * Parse a preset entry into a structured PresetTarget. Accepts:
   *   - Plain string PIDs ("pikachu", "butterfree-f", "rockruff--own-tempo")
   *   - Legacy gmax objects ({ pid, gmax: true })
   *   - New structured objects ({ species, speciesKey, requires })
   *   - null/undefined (empty slot — alignment placeholder)
   *
   * Returns a PresetTarget:
   *   {
   *     pid: string,        // always truthy unless input is null
   *     species: string,    // display name for tooltip/sprite
   *     speciesKey: string, // resolver-friendly slug
   *     requires: {},       // STRICT match requirements
   *     defaults: {}        // LENIENT defaults (unset OK)
   *   }
   */
  function parsePid(rawInput, gmaxFlag, resolverCtx) {
    if (rawInput === null || rawInput === undefined) {
      return { pid: null, species: null, speciesKey: null, requires: {}, defaults: {} };
    }

    // ── Structured object input ─────────────────────────────────
    if (typeof rawInput === 'object') {
      // Form 1: structured target with requires (preferred new form)
      //   { species: "Alcremie", requires: { cream: "Vanilla Cream", sweet: "Strawberry" } }
      if (rawInput.species || rawInput.speciesKey || rawInput.requires) {
        const requires = { ...(rawInput.requires || {}) };
        const defaults = { ...(rawInput.defaults || {}) };
        // Legacy fields → requires (backwards compat in structured form)
        if (rawInput.gmax) requires.gigantamax = true;
        if (rawInput.gender) requires.gender = rawInput.gender;
        const species = rawInput.species
          || (rawInput.speciesKey ? rawInput.speciesKey.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '');
        let speciesKey = rawInput.speciesKey || '';
        if (!speciesKey && species && resolverCtx) {
          const probe = SpeciesResolver.resolve(species, resolverCtx);
          speciesKey = probe.slug || species.toLowerCase().replace(/[\s'-]+/g, '');
        }
        return {
          pid: rawInput.pid || syntheticPid(speciesKey || species, requires),
          species,
          speciesKey,
          requires,
          defaults,
        };
      }
      // Form 2: legacy gmax object — { pid: "venusaur", gmax: true, ... }
      const rawPid = rawInput.pid || '';
      const inheritedGmax = !!rawInput.gmax;
      return parsePid(rawPid, inheritedGmax, resolverCtx);
    }

    // ── String input — legacy PID format ────────────────────────
    if (typeof rawInput !== 'string' || !rawInput) {
      return { pid: null, species: null, speciesKey: null, requires: {}, defaults: {} };
    }

    const rawPid = rawInput;
    const requires = {};
    const defaults = {};

    // 1. Strip ability marker (double-hyphen): "rockruff--own-tempo"
    const abilityIdx = rawPid.indexOf('--');
    const abilitySlug = abilityIdx !== -1 ? rawPid.slice(abilityIdx + 2) : null;
    const withoutAbility = abilityIdx !== -1 ? rawPid.slice(0, abilityIdx) : rawPid;
    if (abilitySlug) {
      requires.ability = abilitySlugToName(abilitySlug);
    }

    // 2. Detect gender suffix -(f|m) — only if NOT a direct dex entry
    //    (nidoran-f is a real species; sneasel-hisui-f is a gender suffix)
    let speciesKey = withoutAbility;
    if (resolverCtx) {
      const genderMatch = withoutAbility.match(/^(.+)-(f|m)$/i);
      if (genderMatch) {
        const probe = SpeciesResolver.resolve(withoutAbility, resolverCtx);
        if (!probe.matchedDirect) {
          requires.gender = genderMatch[2].toUpperCase();
          speciesKey = genderMatch[1];
        }
      }
    }

    // 3. Gmax flag (from object wrapper or explicit) → strict requirement
    if (gmaxFlag) requires.gigantamax = true;

    // 4. Resolve species once for display name + gender default
    const resolved = resolverCtx ? SpeciesResolver.resolve(speciesKey, resolverCtx) : null;
    const species = resolved?.entry?.name || resolved?.displayName || speciesKey;

    // 5. Auto-imply lenient gender:"M" default for unsuffixed dimorphic species
    if (!requires.gender && resolved) {
      const baseSlug = resolved.baseEntry?.slug || resolved.slug || speciesKey;
      if (baseSlug && GENDER_SPRITE_SPECIES.has(baseSlug)) {
        defaults.gender = 'M';
      }
    }

    return {
      pid: rawPid,
      species,
      speciesKey,
      requires,
      defaults,
    };
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
      pokemon: box.pokemon.map((entry) => parsePid(entry, false, resolverCtx)),
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
