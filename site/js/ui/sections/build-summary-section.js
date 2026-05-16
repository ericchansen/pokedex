/**
 * ui/sections/build-summary-section.js - Shared build summary rendering section.
 */
export const BuildSummarySection = (() => {
  const STAT_KEYS = DomainMappers.STAT_KEYS;
  const NATURE_BOOSTS = {
    Adamant: { plus: 'atk', minus: 'spa' },
    Bold: { plus: 'def', minus: 'atk' },
    Brave: { plus: 'atk', minus: 'spe' },
    Calm: { plus: 'spd', minus: 'atk' },
    Careful: { plus: 'spd', minus: 'spa' },
    Gentle: { plus: 'spd', minus: 'def' },
    Hasty: { plus: 'spe', minus: 'def' },
    Impish: { plus: 'def', minus: 'spa' },
    Jolly: { plus: 'spe', minus: 'spa' },
    Lax: { plus: 'def', minus: 'spd' },
    Lonely: { plus: 'atk', minus: 'def' },
    Mild: { plus: 'spa', minus: 'def' },
    Modest: { plus: 'spa', minus: 'atk' },
    Naive: { plus: 'spe', minus: 'spd' },
    Naughty: { plus: 'atk', minus: 'spd' },
    Quiet: { plus: 'spa', minus: 'spe' },
    Rash: { plus: 'spa', minus: 'spd' },
    Relaxed: { plus: 'def', minus: 'spe' },
    Sassy: { plus: 'spd', minus: 'spe' },
    Timid: { plus: 'spe', minus: 'spa' },
  };

  function calcFinalStats(baseStats, evs, ivs, nature) {
    const result = {};
    const boost = NATURE_BOOSTS[nature];
    for (const stat of STAT_KEYS) {
      const base = baseStats[stat] || 0;
      const ev = evs[stat] || 0;
      const iv = ivs ? (ivs[stat] ?? 31) : 31;
      if (stat === 'hp') {
        if (base === 1) {
          result[stat] = 1;
          continue;
        }
        result[stat] = Math.floor((2 * base + iv + Math.floor(ev / 4)) * 50 / 100) + 50 + 10;
      } else {
        let value = Math.floor((2 * base + iv + Math.floor(ev / 4)) * 50 / 100) + 5;
        let modifier = 1.0;
        if (boost) {
          if (boost.plus === stat) modifier = 1.1;
          if (boost.minus === stat) modifier = 0.9;
        }
        result[stat] = Math.floor(value * modifier);
      }
    }
    return result;
  }

  function renderBaseStats(baseStats) {
    if (!baseStats || !Object.keys(baseStats).length) return '';
    return '<h3 class="stat-heading">Base Stats</h3>' + UIShared.renderStatBars(baseStats, 'base');
  }

  function renderBuildShowdownBlock(build, blockId, evSystemOverride) {
    const exportSystem = evSystemOverride || DomainMappers.getPreferredEvSystem(build, 'classic');
    return `
      <div class="viewer-showdown-block" data-block-id="${blockId}">
        ${UIShared.renderShowdownPreview(DomainMappers.toExportMember(build, exportSystem))}
        <button class="btn btn-sm btn-secondary viewer-copy-btn" data-block-id="${blockId}">Copy to Clipboard</button>
      </div>`;
  }

  function renderBuildSummary(build, opts = {}) {
    const {
      instanceFields = false,
      showEvBars = true,
      compact = false,
      showMoves = true,
      showFinalStats = false,
    } = opts;

    const row = (label, value) => {
      if (compact && (value == null || value === '')) return '';
      return `<div class="comp-row"><span class="comp-label">${UIShared.escapeHtml(label)}</span><span class="comp-value">${value == null || value === '' ? '<span class="muted">not set</span>' : UIShared.escapeHtml(String(value))}</span></div>`;
    };
    const rowHtml = (label, htmlValue) => `<div class="comp-row"><span class="comp-label">${UIShared.escapeHtml(label)}</span><span class="comp-value">${htmlValue}</span></div>`;

    let html = '';
    const eggMoves = Array.isArray(build.egg_moves) ? build.egg_moves.filter(Boolean) : [];
    const resolved = build.species ? DataManager.resolveSpecies(build.species) : null;
    const abilityLabel = DataManager.formatAbilityLabel(resolved?.slug || '', build.ability);

    html += row('Nature', build.nature);
    html += row('Ability', abilityLabel);
    html += row('Item', build.item);
    if (build.tera_type || !compact) html += row('Tera Type', build.tera_type);

    if (instanceFields) {
      if (build.ball || !compact) html += row('Ball', build.ball);
      html += row('Nickname', build.nickname);
      html += row('OT', build.ot);
      html += row('Language', build.language);
      html += row('Origin Game', build.origin_game);
      const genderLock = build.species ? DataManager.getSpeciesGender(build.species) : null;
      if (build.gender) {
        html += row('Gender', build.gender === 'M' ? 'Male ♂' : build.gender === 'F' ? 'Female ♀' : build.gender);
      } else if (genderLock === 'N') {
        html += row('Gender', '\u2014');
      }
      if (build.level && build.level !== 50) {
        html += row('Level', build.level);
      } else if (!build.level) {
        html += rowHtml('Level', '<span class="muted">?</span>');
      }

      const flagsHtml = UIShared.renderFlagBadgesHtml(build);
      if (flagsHtml) {
        html += `<div class="comp-row"><span class="comp-label">Flags</span><span class="comp-value flag-badges">${flagsHtml}</span></div>`;
      }
    } else if (build.ball || !compact) {
      html += row('Ball', build.ball);
    }

    const evSystems = DomainMappers.getEvSystems(build);
    const evMaxSummary = { classic: 510, champions: 66 };
    const evNearMax = { classic: 508, champions: 66 };
    if (showEvBars) {
      for (const system of evSystems) {
        const systemEvs = DomainMappers.getEvsForSystem(build, system);
        if (!systemEvs) continue;
        const evTotal = Object.values(systemEvs).reduce((sum, value) => sum + Number(value || 0), 0);
        const threshold = evNearMax[system] ?? evMaxSummary[system] ?? 510;
        const trainedLabel = evTotal >= threshold ? ' <span class="ev-trained-badge">EV Trained ✓</span>' : '';
        const systemLabel = evSystems.length > 1
          ? ` <span class="ev-badge ${system}">${UIShared.titleCase(system)}</span>`
          : (system !== 'classic' ? ` <span class="ev-badge ${system}">${UIShared.titleCase(system)}</span>` : '');
        html += `<h3 class="stat-heading stat-heading--ev">EVs${systemLabel}${trainedLabel}</h3>`;
        html += UIShared.renderStatRadar(systemEvs, system === 'champions' ? 'champions-ev' : 'ev');
      }

      const isChampionsOnly = evSystems.length === 1 && evSystems[0] === 'champions';
      if (!isChampionsOnly) {
        const ivs = DomainMappers.getIvsForSystem(build, evSystems[0] || 'classic');
        const hasRealIvs = ivs && Object.values(ivs).some((value) => value !== undefined && value !== null);
        if (hasRealIvs) {
          html += '<h3 class="stat-heading stat-heading--iv">IVs</h3>';
          html += UIShared.renderStatRadar(ivs, 'iv');
        }
      }
    } else {
      const primaryEvs = DomainMappers.getEvsForSystem(build, evSystems[0] || 'classic');
      const hasEvs = primaryEvs && Object.values(primaryEvs).some((value) => typeof value === 'number' && value > 0);
      html += `<div class="comp-row"><span class="comp-label">EVs</span><span class="comp-value">${hasEvs ? UIShared.escapeHtml(UIShared.formatCompactStatSpread(primaryEvs, 'None')) : '<span class="muted">not set</span>'}</span></div>`;
    }

    if (showFinalStats) {
      const speciesData = DataManager.resolveSpecies(build).entry;
      if (speciesData?.baseStats) {
        const evObj = DomainMappers.getEvsForSystem(build, evSystems[0] || 'classic') || {};
        const ivs = DomainMappers.getIvsForSystem(build, evSystems[0] || 'classic') || {};
        html += '<h3 class="stat-heading stat-heading--final">Final Stats</h3>';
        html += UIShared.renderStatBars(calcFinalStats(speciesData.baseStats, evObj, ivs, build.nature), 'final');
      }
    }

    if (showMoves) {
      const moveList = (build.moves || []).filter(Boolean);
      if (moveList.length) {
        if (showEvBars) {
          html += '<h3 class="stat-heading">Moves</h3>';
          html += UIShared.renderMovesList(moveList, 'No moves imported.', { eggMoves });
        } else {
          html += `<div class="viewer-build-card-moves">${UIShared.renderMovePills(moveList, { eggMoves })}</div>`;
        }
      } else if (!compact) {
        html += '<div class="comp-row"><span class="comp-label">Moves</span><span class="comp-value"><span class="muted">not set</span></span></div>';
      }
    }

    if (eggMoves.length) {
      if (showEvBars) {
        html += '<h3 class="stat-heading">Known Egg Moves</h3>';
        html += UIShared.renderMovesList(eggMoves, 'No egg moves tracked.', { eggMoves });
      } else {
        html += `<div class="comp-row"><span class="comp-label">Egg Moves</span><span class="comp-value comp-value--move-pills">${UIShared.renderMovePills(eggMoves, { eggMoves })}</span></div>`;
      }
    }

    return html;
  }

  return {
    NATURE_BOOSTS,
    calcFinalStats,
    renderBaseStats,
    renderBuildShowdownBlock,
    renderBuildSummary,
  };
})();

if (typeof window !== 'undefined') {
  window.BuildSummarySection = BuildSummarySection;
}
