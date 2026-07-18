import { DomainMappers } from './domain-mappers.js';
import { BuildSummarySection } from './ui/sections/build-summary-section.js';

/**
 * Shared shim for build-focused UI helpers.
 * Keeps editor/viewer modules decoupled from BuildSummarySection and DomainMappers,
 * while exposing a stable surface for stat math and summary rendering.
 */

export const BuildUIHelpers = (() => {
  const NATURE_BOOSTS = BuildSummarySection.NATURE_BOOSTS;

  /** @param {import('./types/contracts.js').BuildState} build */
  function getEvSystems(build) {
    return DomainMappers.getEvSystems(build);
  }

  /** @param {import('./types/contracts.js').BuildState} build @param {import('./types/contracts.js').EvSystem} system */
  function getEvsForSystem(build, system) {
    return DomainMappers.getEvsForSystem(build, system);
  }

  /** @param {import('./types/contracts.js').BuildState} build @param {import('./types/contracts.js').EvSystem} system */
  function getIvsForSystem(build, system) {
    return DomainMappers.getIvsForSystem(build, system);
  }

  /** @param {import('./types/contracts.js').StatSpread} baseStats @param {import('./types/contracts.js').StatSpread} evs @param {import('./types/contracts.js').IvSpread|null|undefined} ivs @param {string} nature */
  function calcFinalStats(baseStats, evs, ivs, nature) {
    return BuildSummarySection.calcFinalStats(baseStats, evs, ivs, nature);
  }

  /** @param {import('./types/contracts.js').StatKey} stat @param {number} base @param {number} sp @param {string} nature */
  function calcChampionsStat(stat, base, sp, nature) {
    if (stat === 'hp') {
      if (base === 1) return 1;
      return base + sp + 75;
    }
    let value = base + sp + 20;
    const boosts = NATURE_BOOSTS[nature];
    let modifier = 1.0;
    if (boosts) {
      if (boosts.plus === stat) modifier = 1.1;
      if (boosts.minus === stat) modifier = 0.9;
    }
    return Math.floor(value * modifier);
  }

  /** @param {import('./types/contracts.js').StatSpread|null|undefined} baseStats */
  function renderBaseStats(baseStats) {
    return BuildSummarySection.renderBaseStats(baseStats);
  }

  /** @param {import('./types/contracts.js').BuildState} build @param {string} blockId @param {import('./types/contracts.js').EvSystem|null|undefined} evSystemOverride */
  function renderBuildShowdownBlock(build, blockId, evSystemOverride) {
    return BuildSummarySection.renderBuildShowdownBlock(build, blockId, evSystemOverride);
  }

  /** @param {import('./types/contracts.js').BuildState} build @param {{instanceFields?: boolean, showEvBars?: boolean, compact?: boolean, showMoves?: boolean, showFinalStats?: boolean}} [opts] */
  function renderBuildSummary(build, opts = {}) {
    return BuildSummarySection.renderBuildSummary(build, opts);
  }

  return {
    NATURE_BOOSTS,
    getEvSystems,
    getEvsForSystem,
    getIvsForSystem,
    calcFinalStats,
    calcChampionsStat,
    renderBaseStats,
    renderBuildShowdownBlock,
    renderBuildSummary,
  };
})();
