/**
 * ui/detail/detail-subject-vm.js - Shared detail subject/view-model helpers.
 */
const DetailSubjectVM = (() => {
  function resolveSpeciesSubject(source, fallback = {}) {
    const resolved = DataManager.resolveSpecies(source || fallback.slug || fallback.species || null);
    const speciesEntry = source?.baseStats ? source : (resolved.entry || source || null);
    const slug = resolved.slug || source?.slug || fallback.slug || '';
    const dexId = speciesEntry?.id || speciesEntry?.num || 0;
    const speciesName = speciesEntry?.name || resolved.name || source?.species || fallback.species || 'Unknown';
    const inChampions = dexId ? DataManager.isInChampions(dexId) : false;

    return {
      resolved,
      speciesEntry,
      slug,
      dexId,
      speciesName,
      inChampions,
    };
  }

  function createViewerContextBadge(ctx) {
    if (ctx.team && ctx.member) {
      return `<div class="detail-context-badge">Team Member · ${UIShared.escapeHtml(ctx.team.name || ctx.team.creator || ctx.team.id)} · Slot ${UIShared.escapeHtml(String(ctx.member.slot || ''))}</div>`;
    }
    if (ctx.boxId !== undefined && ctx.slotIdx !== undefined) {
      return `<div class="detail-context-badge">HOME Box ${ctx.boxId + 1} · Slot ${ctx.slotIdx + 1}</div>`;
    }
    if (ctx.build && !ctx.species) {
      return '<div class="detail-context-badge">Build</div>';
    }
    return '';
  }

  function createInstanceEditDraft(instance, fallbackSpecies = '', fallbackSlug = '') {
    const state = instance?.state || {};
    return {
      id: state.id,
      kind: state.kind || 'instance',
      species: state.species || fallbackSpecies || '',
      slug: state.slug || instance?.species_slug || fallbackSlug || '',
      form: state.form || '',
      level: state.level ?? null,
      nature: state.nature || '',
      ability: state.ability || '',
      item: state.item || '',
      tera_type: state.tera_type || '',
      moves: Array.isArray(state.moves) ? [...state.moves] : ['', '', '', ''],
      egg_moves: Array.isArray(state.egg_moves) ? [...state.egg_moves] : [],
      evs: state.evs || {},
      ev_system: state.ev_system || 'classic',
      notes: state.notes || '',
      ball: state.ball || '',
      nickname: state.nickname || '',
      ot: state.ot || '',
      gender: state.gender || '',
      shiny: !!state.shiny,
      ivs: state.ivs || {},
      origin_game: state.origin_game || '',
      language: state.language || '',
      gigantamax: !!state.gigantamax,
      alpha: !!state.alpha,
      event_origin: !!state.event_origin,
      from_go: !!state.from_go,
      genned: state.genned,
      transferred_to_champions: !!state.transferred_to_champions,
    };
  }

  return {
    resolveSpeciesSubject,
    createViewerContextBadge,
    createInstanceEditDraft,
  };
})();

if (typeof window !== 'undefined') {
  window.DetailSubjectVM = DetailSubjectVM;
}
