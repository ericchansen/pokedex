/**
 * team-export.js - Showdown importable formatting + export trust metadata for battle teams.
 */

export const TeamExportFormatter = (() => {
  const STAT_ORDER = DomainMappers.STAT_KEYS;
  const STAT_LABELS = DomainMappers.STAT_LABELS;
  const DEFAULT_LEVEL = 50;

  function normalizeNature(nature) {
    return String(nature || '')
      .split('(')[0]
      .trim();
  }

  function formatBall(ball) {
    const value = String(ball || '').trim();
    if (!value) return null;
    const normalized = value.toLowerCase().replace(/[\s-]/g, '');
    if (normalized === 'poke' || normalized === 'pokeball' || normalized === 'pokéball') {
      return null;
    }
    return /ball$/i.test(value) ? value : `${value} Ball`;
  }

  function formatSpreadLine(label, spread, defaultValue, includeWhen) {
    if (!spread) return null;

    const parts = STAT_ORDER
      .map((stat) => {
        const rawValue = spread[stat];
        // Null/undefined IVs (defaultValue 31) → show ? for unknown
        if (rawValue === null && defaultValue === 31) {
          return `? ${STAT_LABELS[stat]}`;
        }
        const value = Number(rawValue ?? defaultValue);
        if (!includeWhen(value)) return null;
        return `${value} ${STAT_LABELS[stat]}`;
      })
      .filter(Boolean);

    return parts.length ? `${label}: ${parts.join(' / ')}` : null;
  }

  function formatMember(member, preferredSystem) {
    const system = preferredSystem === 'champions'
      ? 'champions'
      : (preferredSystem === 'classic' ? 'classic' : DomainMappers.getPreferredEvSystem(member, 'classic'));
    const exportMember = DomainMappers.toExportMember(member, preferredSystem);
    const lines = [];
    const nickname = String(exportMember.nickname || '').trim();
    const speciesLabel = nickname && nickname !== exportMember.species
      ? `${nickname} (${exportMember.species})`
      : exportMember.species;
    const speciesLine = exportMember.item ? `${speciesLabel} @ ${exportMember.item}` : speciesLabel;
    lines.push(speciesLine);

    const ballLine = formatBall(exportMember.ball);
    if (ballLine) lines.push(`Ball: ${ballLine}`);
    if (exportMember.ability) lines.push(`Ability: ${exportMember.ability}`);
    lines.push(`Level: ${exportMember.level || DEFAULT_LEVEL}`);
    if (system !== 'champions' && exportMember.tera_type) lines.push(`Tera Type: ${exportMember.tera_type}`);

    const nature = normalizeNature(exportMember.nature);
    if (nature) lines.push(`${nature} Nature`);

    const evLine = formatSpreadLine('EVs', exportMember.evs, 0, (value) => value > 0);
    if (evLine) lines.push(evLine);

    const ivLine = system === 'classic'
      ? formatSpreadLine('IVs', exportMember.ivs, 31, (value) => value !== 31)
      : null;
    if (ivLine) lines.push(ivLine);

    for (const move of exportMember.moves || []) {
      if (move) lines.push(`- ${move}`);
    }

    return lines.join('\n');
  }

  function formatTeam(team) {
    return (team.members || [])
      .map((member) => formatMember(member, team.ev_system || 'classic'))
      .filter(Boolean)
      .join('\n\n');
  }

  function getExportMeta(team) {
    const members = team.members || [];
    const evSystem = team.ev_system || 'classic';
    const note = `${members.length} members · ${evSystem} EV system.`;

    return {
      statusLabel: 'Export-ready',
      evSystem,
      note,
      tone: 'ok',
      totalMembers: members.length,
    };
  }

  return {
    formatMember,
    formatTeam,
    getExportMeta,
  };
})();
window.TeamExportFormatter = TeamExportFormatter;
