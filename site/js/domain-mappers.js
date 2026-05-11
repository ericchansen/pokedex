/**
 * domain-mappers.js - Canonical domain-shape helpers for builds, instances, and teams.
 *
 * These helpers normalize EV/IV structure and named draft/view-model shapes
 * without owning persistence or DOM.
 */

const DomainMappers = (() => {
  const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const BUILD_STATE_FIELDS = Object.freeze([
    'form', 'level', 'nature', 'ability', 'item', 'tera_type', 'moves', 'evs',
  ]);
  const FORM_EXTRA_FIELDS = Object.freeze([
    'ivs', 'ev_system', 'ball', 'nickname', 'ot', 'gender', 'shiny',
    'language', 'origin_game', 'notes', 'gigantamax', 'alpha',
    'event_origin', 'genned', 'transferred_to_champions', 'from_go', 'ev_guesstimate',
    // Form-variant metadata (Alcremie cream/sweet, future cap-style, hat-color, etc.)
    // Any new metadata key declared in preset JSON `requires` should be added here
    // so it survives the state ↔ storage roundtrip via createEditableBuildDraft.
    'cream', 'sweet',
  ]);
  const BOOLEAN_FIELDS = new Set(['shiny', 'gigantamax', 'alpha', 'event_origin', 'genned', 'transferred_to_champions', 'from_go', 'ev_guesstimate']);

  function emptySpread() {
    return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  }

  function normalizeText(value) {
    return value == null ? '' : String(value);
  }

  function normalizeEvSystem(value) {
    if (!value || value === 'classic') return 'classic';
    if (value === 'champions' || value === 'sp' || value === 'stat_points') return 'champions';
    return 'classic';
  }

  /** Strip trailing " Ball" suffix — canonical form is short name (e.g. "Poke", not "Poke Ball"). */
  function normalizeBallName(value) {
    if (value == null || value === '') return null;
    return String(value).replace(/\s*ball$/i, '').trim() || null;
  }

  function normalizeBoolean(value) {
    return !!value;
  }

  function normalizeNullable(value) {
    return value == null || value === '' ? null : value;
  }

  function normalizeLevel(value, fallback = null) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed === 50 ? null : parsed;
  }

  function cloneMoves(moves) {
    return Array.isArray(moves)
      ? moves.map((move) => String(move || '').trim()).filter(Boolean).slice(0, 4)
      : [];
  }

  function cloneEggMoves(moves) {
    if (!Array.isArray(moves)) return [];
    const out = [];
    const seen = new Set();
    for (const rawMove of moves) {
      const move = String(rawMove || '').trim();
      const key = normalizeMoveToken(move);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(move);
      if (out.length >= 4) break;
    }
    return out;
  }

  function cloneSparseSpread(spread, { allowNull = false } = {}) {
    const out = {};
    for (const stat of STAT_KEYS) {
      const raw = spread?.[stat];
      if (raw === null) {
        if (allowNull) out[stat] = null;
        continue;
      }
      if (raw === undefined || raw === '') continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const normalized = Math.max(0, Math.trunc(value));
      out[stat] = normalized;
    }
    return out;
  }

  function hasPositiveSpread(spread) {
    return STAT_KEYS.some((stat) => Number(spread?.[stat] || 0) > 0);
  }

  function hasMeaningfulIvs(spread) {
    return STAT_KEYS.some((stat) => {
      const value = spread?.[stat];
      return value === null || (typeof value === 'number' && value !== 31);
    });
  }

  function normalizeStructuredEvs(evsInput, opts = {}) {
    const evSystem = normalizeEvSystem(opts.evSystem);
    const structured = {};

    if (evsInput && typeof evsInput === 'object') {
      const classic = cloneSparseSpread(evsInput.classic);
      if (hasPositiveSpread(classic)) structured.classic = classic;

      const champions = cloneSparseSpread(evsInput.champions);
      if (hasPositiveSpread(champions)) structured.champions = champions;

      const classicIvs = cloneSparseSpread(evsInput.classic_ivs, { allowNull: true });
      if (Object.keys(classicIvs).length) structured.classic_ivs = classicIvs;

    }

    const ivs = cloneSparseSpread(opts.ivs, { allowNull: true });
    if (Object.keys(ivs).length) {
      structured.classic_ivs = ivs;
    }

    return structured;
  }

  function getEvsForSystem(buildLike, system) {
    const targetSystem = normalizeEvSystem(system);
    const structured = normalizeStructuredEvs(buildLike?.evs, {
      evSystem: targetSystem,
      ivs: buildLike?.ivs,
    });
    return structured[targetSystem] ? { ...structured[targetSystem] } : null;
  }

  function getIvsForSystem(buildLike, system) {
    if (normalizeEvSystem(system) !== 'classic') return null;
    const structured = normalizeStructuredEvs(buildLike?.evs, {
      evSystem: buildLike?.ev_system,
      ivs: buildLike?.ivs,
    });
    if (structured.classic_ivs) return { ...structured.classic_ivs };
    const ivs = cloneSparseSpread(buildLike?.ivs, { allowNull: true });
    return Object.keys(ivs).length ? ivs : null;
  }

  function getEvSystems(buildLike) {
    const structured = normalizeStructuredEvs(buildLike?.evs, {
      evSystem: buildLike?.ev_system,
      ivs: buildLike?.ivs,
    });
    const systems = [];
    if (structured.classic) systems.push('classic');
    if (structured.champions) systems.push('champions');
    return systems;
  }

  function getPreferredEvSystem(buildLike, fallback = 'classic') {
    const desired = normalizeEvSystem(buildLike?.ev_system);
    const systems = getEvSystems(buildLike);
    if (systems.includes(desired)) return desired;
    return systems[0] || normalizeEvSystem(fallback);
  }

  function createEditableBuildDraft(buildLike, opts = {}) {
    const preferred = opts.evSystem != null
      ? normalizeEvSystem(opts.evSystem)
      : normalizeEvSystem(buildLike?.ev_system);
    const normalizedEvs = normalizeStructuredEvs(buildLike?.evs, {
      evSystem: preferred,
      ivs: buildLike?.ivs,
    });
    const evs = {
      ...(normalizedEvs.classic ? { classic: { ...normalizedEvs.classic } } : {}),
      ...(normalizedEvs.champions ? { champions: { ...normalizedEvs.champions } } : {}),
      ...(normalizedEvs.classic_ivs ? { classic_ivs: { ...normalizedEvs.classic_ivs } } : {}),
    };
    const availableSystems = [];
    if (evs.classic) availableSystems.push('classic');
    if (evs.champions) availableSystems.push('champions');
    const draft = {
      id: buildLike?.id,
      kind: opts.kind || buildLike?.kind || 'library',
      species: normalizeText(buildLike?.species).trim(),
      slug: normalizeText(buildLike?.slug).trim(),
      form: normalizeText(buildLike?.form).trim(),
      level: normalizeLevel(buildLike?.level),
      nature: normalizeText(buildLike?.nature).trim(),
      ability: normalizeText(buildLike?.ability).trim(),
      item: normalizeText(buildLike?.item).trim(),
      tera_type: normalizeText(buildLike?.tera_type).trim(),
      ev_system: availableSystems.includes(preferred) ? preferred : (availableSystems[0] || preferred),
      evs,
      ivs: evs.classic_ivs ? { ...evs.classic_ivs } : {},
      moves: cloneMoves(buildLike?.moves),
      notes: normalizeText(buildLike?.notes).trim(),
    };

    if (buildLike?.egg_moves !== undefined) draft.egg_moves = cloneEggMoves(buildLike.egg_moves);
    if (buildLike?.source_url !== undefined) draft.source_url = normalizeText(buildLike.source_url).trim();

    for (const field of FORM_EXTRA_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(buildLike || {}, field)) continue;
      if (field === 'ivs' || field === 'ev_system' || field === 'notes') continue;
      if (field === 'ball') {
        draft[field] = normalizeBallName(buildLike[field]);
      } else if (BOOLEAN_FIELDS.has(field)) {
        draft[field] = normalizeBoolean(buildLike[field]);
      } else {
        draft[field] = normalizeNullable(buildLike[field]);
      }
    }

    return draft;
  }

  function mergeBuildPayloadIntoState(existingState, buildPayload) {
    const current = createEditableBuildDraft(existingState, {
      kind: 'instance',
      evSystem: existingState?.ev_system,
    });
    const overlay = createEditableBuildDraft(buildPayload, {
      kind: 'instance',
      evSystem: buildPayload?.ev_system || current.ev_system,
    });
    const next = { ...current };
    const copyFields = [
      'species', 'slug', 'form', 'level', 'nature', 'ability', 'item',
      'tera_type', 'moves', 'ball', 'nickname', 'ot', 'gender', 'shiny',
      'language', 'origin_game', 'notes', 'gigantamax', 'alpha',
      'egg_moves', 'event_origin', 'genned', 'transferred_to_champions', 'from_go', 'ev_guesstimate',
      // Form-variant metadata — must match additions to FORM_EXTRA_FIELDS
      'cream', 'sweet',
    ];

    for (const field of copyFields) {
      if (Object.prototype.hasOwnProperty.call(buildPayload || {}, field)) {
        next[field] = overlay[field];
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(buildPayload || {}, 'evs')
      || Object.prototype.hasOwnProperty.call(buildPayload || {}, 'ivs')
      || Object.prototype.hasOwnProperty.call(buildPayload || {}, 'ev_system')
    ) {
      next.evs = overlay.evs;
      next.ivs = overlay.ivs;
      next.ev_system = overlay.ev_system;
    }

    next.id = current.id || existingState?.id;
    next.kind = existingState?.kind || 'instance';
    return next;
  }

  function createInstanceModel(slotView, opts = {}) {
    if (!slotView || !slotView.species_id) return null;
    return {
      box: opts.boxId,
      slot: opts.slotIdx,
      species_id: slotView.species_id,
      species_slug: opts.speciesSlug || '',
      target_build_id: typeof slotView.target_build_id === 'string' ? slotView.target_build_id : null,
      state: createEditableBuildDraft(slotView.state, { kind: 'instance', evSystem: slotView.state?.ev_system }),
      location: {
        kind: 'slot',
        box_id: opts.boxId,
        box_name: opts.boxName || `Box ${Number(opts.boxId) + 1}`,
        slot: opts.slotIdx,
      },
    };
  }

  function createLibraryBuildCandidateFromInstance(instance, opts = {}) {
    const state = createEditableBuildDraft(instance?.state, {
      kind: 'instance',
      evSystem: instance?.state?.ev_system,
    });
    return {
      species: normalizeText(state.species || opts.species).trim(),
      slug: normalizeText(state.slug || opts.slug).trim(),
      form: state.form || '',
      level: state.level ?? null,
      nature: state.nature || '',
      ability: state.ability || '',
      item: state.item || '',
      tera_type: state.tera_type || '',
      ev_system: state.ev_system || 'classic',
      evs: normalizeStructuredEvs(state.evs, {
        evSystem: state.ev_system,
        ivs: state.ivs,
      }),
      ivs: state.ivs || {},
      moves: cloneMoves(state.moves),
      egg_moves: cloneEggMoves(state.egg_moves),
      notes: opts.notes !== undefined ? normalizeText(opts.notes).trim() : state.notes || '',
    };
  }

  function createBuildCandidateFromTeamMember(member, teamEvSystem) {
    const evSystem = normalizeEvSystem(teamEvSystem);
    const draft = createEditableBuildDraft(member, {
      kind: 'library',
      evSystem,
    });
    const candidate = {
      species: draft.species,
      slug: draft.slug,
      form: draft.form,
      level: draft.level,
      nature: draft.nature,
      ability: draft.ability,
      item: draft.item,
      tera_type: draft.tera_type,
      ev_system: evSystem,
      evs: {},
      moves: cloneMoves(draft.moves),
      notes: draft.notes || '',
    };
    const spread = getEvsForSystem(draft, evSystem);
    if (spread && hasPositiveSpread(spread)) {
      candidate.evs[evSystem] = spread;
    }
    const ivs = getIvsForSystem(draft, 'classic');
    if (evSystem === 'classic' && ivs && hasMeaningfulIvs(ivs)) {
      candidate.evs.classic_ivs = ivs;
      candidate.ivs = { ...ivs };
    } else {
      candidate.ivs = {};
    }
    if (draft.ball) candidate.ball = draft.ball;
    return candidate;
  }

  function createTeamStorageMember(memberLike, teamEvSystem) {
    const evSystem = normalizeEvSystem(teamEvSystem);
    const buildId = normalizeNullable(memberLike?.build_id);
    const draft = createBuildCandidateFromTeamMember(memberLike, evSystem);
    const hasInlineDetails = !!(
      draft.species
      || draft.item
      || draft.ability
      || draft.nature
      || draft.form
      || draft.tera_type
      || draft.ball
      || cloneMoves(draft.moves).length
      || Object.keys(draft.evs || {}).length
    );

    if (!hasInlineDetails) {
      return buildId ? {
        slot: Number.parseInt(memberLike?.slot, 10) || null,
        build_id: buildId,
      } : {
        slot: Number.parseInt(memberLike?.slot, 10) || null,
      };
    }

    const member = {
      slot: Number.parseInt(memberLike?.slot, 10) || null,
      build_id: buildId,
      species: draft.species,
      item: draft.item || '',
      ability: draft.ability || '',
      nature: draft.nature || '',
      moves: cloneMoves(draft.moves),
    };

    if (draft.form) member.form = draft.form;
    if (draft.tera_type) member.tera_type = draft.tera_type;
    if (draft.level && draft.level !== 50) member.level = draft.level;
    if (draft.ball) member.ball = draft.ball;
    if (Object.keys(draft.evs || {}).length) member.evs = draft.evs;
    return member;
  }

  function createTeamStorage(teamLike) {
    const evSystem = normalizeEvSystem(teamLike?.ev_system);
    return {
      id: teamLike?.id,
      source: normalizeText(teamLike?.source).trim() || 'user',
      name: normalizeText(teamLike?.name).trim(),
      creator: normalizeText(teamLike?.creator).trim(),
      archetype: normalizeText(teamLike?.archetype).trim(),
      ev_system: evSystem,
      team_id: evSystem === 'champions' ? normalizeText(teamLike?.team_id).trim() : '',
      notes: normalizeText(teamLike?.notes).trim(),
      cloned_from: normalizeNullable(teamLike?.cloned_from),
      members: (teamLike?.members || [])
        .map((member, index) => createTeamStorageMember({ ...member, slot: member?.slot ?? index + 1 }, evSystem))
        .filter((member) => member.build_id || member.species),
    };
  }

  function createTeamMemberViewModel(member, opts = {}) {
    const teamEvSystem = normalizeEvSystem(opts.teamEvSystem);
    const linkedBuild = member?.build_id && opts.buildLookup
      ? opts.buildLookup(member.build_id)
      : null;
    const base = linkedBuild || {};
    const draft = createEditableBuildDraft({
      species: member?.species ?? base.species,
      slug: member?.slug ?? base.slug,
      form: member?.form ?? base.form,
      level: member?.level ?? base.level,
      nature: member?.nature ?? base.nature,
      ability: member?.ability ?? base.ability,
      item: member?.item ?? base.item,
      tera_type: member?.tera_type ?? base.tera_type,
      ball: member?.ball ?? base.ball,
      evs: member?.evs !== undefined ? member.evs : base.evs,
      ivs: member?.ivs ?? base.ivs,
      moves: member?.moves ?? base.moves,
      notes: member?.notes ?? base.notes,
      ev_system: teamEvSystem,
    }, {
      kind: 'library',
      evSystem: teamEvSystem,
    });

    return {
      ...member,
      build_id: normalizeNullable(member?.build_id),
      linked_build: linkedBuild || null,
      slot: Number.parseInt(member?.slot, 10) || opts.slot || null,
      species: draft.species,
      slug: draft.slug || '',
      form: draft.form,
      level: draft.level,
      nature: draft.nature,
      ability: draft.ability,
      item: draft.item,
      tera_type: draft.tera_type,
      ball: draft.ball || '',
      ev_system: teamEvSystem,
      evs: draft.evs,
      ivs: draft.ivs,
      moves: draft.moves,
      notes: draft.notes || '',
    };
  }

  function createTeamViewModel(team, opts = {}) {
    const evSystem = normalizeEvSystem(team?.ev_system);
    return {
      ...team,
      ev_system: evSystem,
      members: (team?.members || []).map((member, index) => createTeamMemberViewModel(member, {
        buildLookup: opts.buildLookup,
        teamEvSystem: evSystem,
        slot: index + 1,
      })),
    };
  }

  function toExportMember(buildLike, preferredSystem) {
    const evSystem = preferredSystem != null
      ? normalizeEvSystem(preferredSystem)
      : getPreferredEvSystem(buildLike, 'classic');
    return {
      ...buildLike,
      level: normalizeLevel(buildLike?.level),
      evs: getEvsForSystem(buildLike, evSystem) || emptySpread(),
      ivs: evSystem === 'classic' ? (getIvsForSystem(buildLike, 'classic') || null) : null,
    };
  }

  /** Canonical stat label map — use instead of redefining per-file. */
  const STAT_LABELS = Object.freeze({
    hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
  });

  /** Normalize a move name to a deduplication key (lowercase, alphanumeric only). */
  function normalizeMoveToken(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  return {
    STAT_KEYS,
    STAT_LABELS,
    BUILD_STATE_FIELDS,
    FORM_EXTRA_FIELDS,
    normalizeMoveToken,
    emptySpread,
    normalizeEvSystem,
    normalizeStructuredEvs,
    getEvSystems,
    getPreferredEvSystem,
    getEvsForSystem,
    getIvsForSystem,
    createEditableBuildDraft,
    mergeBuildPayloadIntoState,
    createInstanceModel,
    createLibraryBuildCandidateFromInstance,
    createBuildCandidateFromTeamMember,
    createTeamStorageMember,
    createTeamStorage,
    createTeamMemberViewModel,
    createTeamViewModel,
    toExportMember,
  };
})();

if (typeof window !== 'undefined') {
  window.DomainMappers = DomainMappers;
}
