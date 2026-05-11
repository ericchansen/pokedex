/**
 * Shared shim for build-focused UI helpers.
 * Keeps editor/viewer modules decoupled from BuildSummarySection and DomainMappers,
 * while exposing a stable surface for stat math and summary rendering.
 */

const BuildUIHelpers = (() => {
  const NATURE_BOOSTS = BuildSummarySection.NATURE_BOOSTS;

  function getEvSystems(build) {
    return DomainMappers.getEvSystems(build);
  }

  function getEvsForSystem(build, system) {
    return DomainMappers.getEvsForSystem(build, system);
  }

  function getIvsForSystem(build, system) {
    return DomainMappers.getIvsForSystem(build, system);
  }

  function calcFinalStats(baseStats, evs, ivs, nature) {
    return BuildSummarySection.calcFinalStats(baseStats, evs, ivs, nature);
  }

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

  function renderBaseStats(baseStats) {
    return BuildSummarySection.renderBaseStats(baseStats);
  }

  function renderBuildShowdownBlock(build, blockId, evSystemOverride) {
    return BuildSummarySection.renderBuildShowdownBlock(build, blockId, evSystemOverride);
  }

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

if (typeof window !== 'undefined') {
  window.BuildUIHelpers = BuildUIHelpers;
}
