/**
 * ui-models.js - Canonical UI-facing contracts for status, search text, and game metadata.
 *
 * Pure helper layer for route views and renderer surfaces. This module centralizes
 * "what facts should the UI display?" without owning any DOM.
 */

export const UIModels = (() => {
  const STAT_KEYS = DomainMappers.STAT_KEYS;
  const EV_TOTALS = { classic: 510, champions: 66 };
  const EV_NEAR_MAX = { classic: 508, champions: 66 };
  const GAME_CATALOG = Object.freeze([
    {
      key: 'champions',
      shortLabel: 'C',
      badgeLabel: 'Champions',
      filterLabel: 'Champions',
      title: 'Champions',
    },
    {
      key: 'sv',
      shortLabel: 'SV',
      badgeLabel: 'SV',
      filterLabel: 'Scarlet/Violet',
      title: 'Scarlet/Violet',
    },
    {
      key: 'legends-arceus',
      shortLabel: 'LA',
      badgeLabel: 'PLA',
      filterLabel: 'Legends: Arceus',
      title: 'Legends: Arceus',
    },
    {
      key: 'legends-za',
      shortLabel: 'ZA',
      badgeLabel: 'Z-A',
      filterLabel: 'Legends: Z-A',
      title: 'Legends: Z-A',
    },
  ]);

  function getGameCatalog() {
    return GAME_CATALOG.slice();
  }

  function getGame(key) {
    return GAME_CATALOG.find((game) => game.key === key) || null;
  }

  function buildSearchText(parts) {
    return (parts || [])
      .flatMap((part) => Array.isArray(part) ? part : [part])
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function matchesSearch(text, query) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) return true;
    return String(text || '').toLowerCase().includes(normalizedQuery);
  }

  function countRecordedMoves(build) {
    return Array.isArray(build?.moves)
      ? build.moves.filter((move) => move && String(move).trim()).length
      : 0;
  }

  function collectEvTotals(build) {
    const totals = { classic: 0, champions: 0 };
    const evs = build?.evs || {};
    for (const system of Object.keys(EV_TOTALS)) {
      const spread = evs[system];
      if (!spread || typeof spread !== 'object') continue;
      for (const stat of STAT_KEYS) {
        const value = spread[stat];
        if (typeof value === 'number' && value > 0) {
          totals[system] += value;
        }
      }
    }
    return totals;
  }

  function evaluateBuildStatus(build, opts = {}) {
    const hasNature = !!build?.nature;
    const hasAbility = !!build?.ability;
    const moveCount = countRecordedMoves(build);
    const hasAnyMoves = moveCount > 0;
    const filled = [hasNature, hasAbility, hasAnyMoves].filter(Boolean).length;
    const profileState = filled === 3 ? 'complete' : (filled > 0 ? 'partial' : 'empty');
    const borderState = profileState === 'empty' ? null : profileState;
    const evTotals = collectEvTotals(build);
    const readySystems = Object.keys(EV_TOTALS).filter((system) => evTotals[system] >= EV_NEAR_MAX[system]);
    const fullTrainedSystems = Object.keys(EV_TOTALS).filter((system) => evTotals[system] === EV_TOTALS[system]);
    const targetReady = hasNature && hasAbility && moveCount === 4 && readySystems.length > 0;
    const owned = !!opts.owned;
    const transferredToChampions = !!opts.transferredToChampions;
    const battleReady = !!opts.battleReady;

    let badgeKey = 'build';
    let badgeLabel = 'Build';
    if (battleReady) {
      badgeKey = 'battle-ready';
      badgeLabel = 'Battle Ready';
    } else if (owned) {
      badgeKey = 'owned';
      badgeLabel = 'Owned';
    }

    return {
      hasNature,
      hasAbility,
      moveCount,
      hasAnyMoves,
      profileState,
      borderState,
      isComplete: profileState === 'complete',
      isPartial: profileState === 'partial',
      evTotals,
      readySystems,
      fullTrainedSystems,
      targetReady,
      owned,
      transferredToChampions,
      battleReady,
      badgeKey,
      badgeLabel,
    };
  }

  function isGameCompatible(gameKey, slug, opts = {}) {
    if (!slug) return false;
    if (gameKey === 'champions' && opts.inChampions !== undefined) {
      return !!opts.inChampions;
    }
    return !!DataManager.isInGame(slug, gameKey);
  }

  function getCompatibleGameKeys(slug, opts = {}) {
    return GAME_CATALOG
      .filter((game) => isGameCompatible(game.key, slug, opts))
      .map((game) => game.key);
  }

  function getLocationLabel(instance) {
    if (instance?.location?.box_name && typeof instance.location.slot === 'number') {
      return `${instance.location.box_name} · Slot ${instance.location.slot + 1}`;
    }
    if (typeof instance?.box === 'number' && typeof instance?.slot === 'number') {
      return `Box ${instance.box + 1}, Slot ${instance.slot + 1}`;
    }
    return '—';
  }

  function buildEntryDecorations(source, opts = {}) {
    const status = opts.status || source?.status || evaluateBuildStatus(source, opts.statusOptions || {});
    const slug = opts.slug || source?.slug || source?.species_slug || '';
    const inChampions = opts.inChampions !== undefined ? !!opts.inChampions : !!source?.inChampions;
    const compatibleGames = Array.isArray(opts.compatibleGames)
      ? opts.compatibleGames.slice()
      : (Array.isArray(source?.compatibleGames) ? source.compatibleGames.slice() : getCompatibleGameKeys(slug, { inChampions }));
    const transferredToChampions = !!(source?.transferredToChampions || source?.transferred_to_champions);
    const eventOrigin = !!(source?.eventOrigin || source?.event_origin);
    const fromGo = !!(source?.fromGo || source?.from_go);
    const language = source?.language || '';
    const shiny = !!source?.shiny;
    const genned = !!source?.genned;
    const gigantamax = !!source?.gigantamax;
    const alpha = !!source?.alpha;

    const flags = [];
    if (shiny) flags.push({ key: 'shiny', variant: 'shiny', label: '✨ Shiny' });
    if (genned) flags.push({ key: 'genned', variant: 'genned', label: 'Genned' });
    if (transferredToChampions) flags.push({ key: 'transferred', variant: 'champions', label: '🏆 Champions' });
    if (fromGo) flags.push({ key: 'go', variant: 'go', label: 'GO' });
    if (gigantamax) flags.push({ key: 'gigantamax', variant: 'misc', label: 'Gmax' });
    if (alpha) flags.push({ key: 'alpha', variant: 'misc', label: 'Alpha' });
    if (eventOrigin) flags.push({ key: 'event', variant: 'misc', label: 'Event' });

    const badgeEntry = {
      slug,
      inChampions,
      compatibleGames,
      transferredToChampions,
      eventOrigin,
      fromGo,
      language,
      shiny,
      genned,
      gigantamax,
      alpha,
    };

    return {
      status,
      transferred: transferredToChampions,
      compatibleGames,
      flags,
      badgeEntry,
      dotOptions: {
        ...badgeEntry,
        games: compatibleGames,
      },
    };
  }

  function buildInventoryEntryView(instance) {
    const species = DataManager.getPokedexEntry(instance?.species_id) || {};
    const state = instance?.state || {};
    const slug = species.slug || instance?.species_slug || (typeof instance?.species_id === 'string' ? instance.species_id : '');
    const linkedBuild = instance?.target_build_id ? DataManager.getBuild(instance.target_build_id) : null;
    const transferredToChampions = !!state.transferred_to_champions;
    const status = evaluateBuildStatus(state, {
      owned: true,
      transferredToChampions,
    });
    const compatibleGames = getCompatibleGameKeys(slug, { inChampions: transferredToChampions });
    const decorations = buildEntryDecorations({
      status,
      slug,
      compatibleGames,
      transferredToChampions,
      language: state.language,
      eventOrigin: !!state.event_origin,
      fromGo: !!state.from_go,
      shiny: !!state.shiny,
      genned: !!state.genned,
      gigantamax: !!state.gigantamax,
      alpha: !!state.alpha,
    }, { status, slug, compatibleGames });

    return {
      _kind: 'instance',
      _key: instance?.box != null ? `${instance.box}-${instance.slot}` : `instance-${slug}`,
      boxId: instance?.box,
      slotIdx: instance?.slot,
      num: species.id || instance?.species_id || 0,
      name: species.name || '',
      slug,
      types: species.types || [],
      sprite: DataManager.getSpriteUrl(slug),
      owned: true,
      compatibleGames,
      transferredToChampions,
      builds: linkedBuild ? [linkedBuild] : [],
      primary: linkedBuild,
      location: getLocationLabel(instance),
      nature: state.nature || '',
      ability: state.ability || '',
      item: state.item || '',
      ball: state.ball || '',
      language: state.language || '',
      eventOrigin: !!state.event_origin,
      fromGo: !!state.from_go,
      shiny: !!state.shiny,
      genned: !!state.genned,
      gigantamax: !!state.gigantamax,
      alpha: !!state.alpha,
      evGuesstimate: !!state.ev_guesstimate,
      moves: Array.isArray(state.moves) ? state.moves : [],
      egg_moves: Array.isArray(state.egg_moves) ? state.egg_moves : [],
      evs: state.evs || {},
      tera_type: state.tera_type || '',
      species: species.name || state.species || '',
      form: state.form || '',
      nickname: state.nickname || '',
      ot: state.ot || '',
      origin_game: state.origin_game || '',
      gender: state.gender || '',
      level: state.level ?? null,
      decorations,
      status,
      searchText: buildSearchText([
        species.name,
        slug,
        state.nature,
        state.ability,
        state.item,
        state.moves,
        state.egg_moves,
        getLocationLabel(instance),
      ]),
      ...status,
    };
  }

  function buildLibraryBuildEntryView(build) {
    const slug = build?.slug || '';
    const species = DataManager.getPokedexEntry(slug) || {};
    const linkedInstances = build?.id && DataManager.getInstancesTargeting
      ? DataManager.getInstancesTargeting(build.id)
      : [];
    const owned = linkedInstances.length > 0;
    const readyInfo = DataManager.anyInstanceMatchesBuild ? DataManager.anyInstanceMatchesBuild(build) : { ready: false };
    const inChampions = species.id ? DataManager.isInChampions(species.id) : false;
    const status = evaluateBuildStatus(build, {
      owned,
      battleReady: !!readyInfo.ready,
    });
    const firstInstance = linkedInstances[0];
    const location = firstInstance && firstInstance.box != null
      ? `Box ${firstInstance.box + 1}, Slot ${firstInstance.slot + 1}`
      : (linkedInstances.length > 0 ? `${linkedInstances.length} linked` : '');
    const compatibleGames = getCompatibleGameKeys(slug, { inChampions });
    const decorations = buildEntryDecorations({
      status,
      slug,
      inChampions,
      compatibleGames,
    }, { status, slug, inChampions, compatibleGames });

    return {
      _kind: 'build',
      _key: `lib-${build.id}`,
      num: species.id || 0,
      name: species.name || build.species || '',
      slug,
      types: species.types || [],
      sprite: DataManager.getSpriteUrl(slug),
      owned,
      inChampions,
      compatibleGames,
      transferredToChampions: false,  // builds are not instances; transfer status is N/A
      builds: [build],
      primary: build,
      location,
      nature: build.nature || '',
      ability: build.ability || '',
      item: build.item || '',
      ball: build.ball || '',
      language: '',
      eventOrigin: false,
      fromGo: false,
      moves: Array.isArray(build.moves) ? build.moves : [],
      battleReadyReason: readyInfo.reason || null,
      decorations,
      status,
      source: build.source || null,
      searchText: buildSearchText([
        species.name || build.species,
        slug,
        build.item,
        build.ability,
        build.nature,
        build.moves,
        build.egg_moves,
      ]),
      ...status,
    };
  }

  /** Canonical display name: "Species-Form" or species/entry name. */
  function formatDisplayName(obj) {
    return obj.form ? `${obj.species}-${obj.form}` : (obj.speciesName || obj.name || obj.species);
  }

  return {
    getGameCatalog,
    getGame,
    getCompatibleGameKeys,
    buildSearchText,
    matchesSearch,
    evaluateBuildStatus,
    buildEntryDecorations,
    buildInventoryEntryView,
    buildLibraryBuildEntryView,
    formatDisplayName,
  };
})();

if (typeof window !== 'undefined') {
  window.UIModels = UIModels;
}
