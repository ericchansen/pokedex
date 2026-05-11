/**
 * showdown-parser.js — Parse Showdown importable text into structured data.
 * Inverse of team-export.js formatMember().
 */

const ShowdownParser = (() => {
  const STAT_KEYS = Object.fromEntries(
    Object.entries(DomainMappers.STAT_LABELS).map(([k, label]) => [label, k])
  );
  const {
    CHAMPIONS_PER_STAT_CAP = 32,
    CLASSIC_PER_STAT_CAP = 252,
  } = window.EvConvert || {};
  const DEFAULT_SPREAD_MAX = CLASSIC_PER_STAT_CAP;
  const IV_MAX = 31;

  function parseSpread(text, maxValue = DEFAULT_SPREAD_MAX) {
    const spread = {};
    const parts = text.split('/').map(p => p.trim());
    for (const part of parts) {
      const match = part.match(/^(\?|\d+)\s+(\w+)$/);
      if (match) {
        const raw = match[1] === '?' ? null : parseInt(match[1], 10);
        const key = STAT_KEYS[match[2]];
        if (key) spread[key] = raw === null ? null : Math.max(0, Math.min(maxValue, raw));
      }
    }
    return spread;
  }

  /**
   * Parse a single Showdown set text block into structured data.
   * @param {string} text - Raw Showdown text for one Pokémon
   * @returns {object|null} Parsed set or null if empty
   */
  function parseSet(text, opts = {}) {
    const {
      maxValue = DEFAULT_SPREAD_MAX,
      championsMaxValue = CHAMPIONS_PER_STAT_CAP,
    } = opts;
    const spreadMaxValue = maxValue === 'champions' ? championsMaxValue : maxValue;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return null;

    const result = {
      species: '', item: '', ability: '', nature: '',
      evs: {}, ivs: {}, moves: [], teraType: '', level: 50,
      ball: '', nickname: '', unparsedLines: [],
    };

    // Line 1: Species @ Item  (or  Nickname (Species) @ Item)
    const firstLine = lines[0];
    const atIdx = firstLine.indexOf(' @ ');
    let speciesPart;
    if (atIdx >= 0) {
      speciesPart = firstLine.slice(0, atIdx).trim();
      result.item = firstLine.slice(atIdx + 3).trim();
    } else {
      speciesPart = firstLine.trim();
    }

    // Handle nickname: "Nickname (Species)"
    const nickMatch = speciesPart.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (nickMatch) {
      result.nickname = nickMatch[1].trim();
      speciesPart = nickMatch[2].trim();
    }
    result.species = speciesPart;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Moves: - Move Name
      if (line.startsWith('- ')) {
        result.moves.push(line.slice(2).trim());
        continue;
      }

      // Ability: X
      const abilityMatch = line.match(/^Ability:\s*(.+)$/i);
      if (abilityMatch) { result.ability = abilityMatch[1].trim(); continue; }

      // Level: N
      const levelMatch = line.match(/^Level:\s*(\d+)$/i);
      if (levelMatch) { result.level = parseInt(levelMatch[1], 10); continue; }

      // Tera Type: X
      const teraMatch = line.match(/^Tera Type:\s*(.+)$/i);
      if (teraMatch) { result.teraType = teraMatch[1].trim(); continue; }

      // X Nature
      const natureMatch = line.match(/^(\w+)\s+Nature$/i);
      if (natureMatch) { result.nature = natureMatch[1].trim(); continue; }

      // EVs: N Stat / N Stat / ...
      const evMatch = line.match(/^EVs:\s*(.+)$/i);
      if (evMatch) { result.evs = parseSpread(evMatch[1], spreadMaxValue); continue; }

      // IVs: N Stat / N Stat / ...
      const ivMatch = line.match(/^IVs:\s*(.+)$/i);
      if (ivMatch) { result.ivs = parseSpread(ivMatch[1], IV_MAX); continue; }

      // Ball: X Ball  or  Ball: X
      const ballMatch = line.match(/^Ball:\s*(.+?)(?:\s+Ball)?$/i);
      if (ballMatch) { result.ball = ballMatch[1].trim(); continue; }

      // Shiny: Yes  (ignore but don't mark unparsed)
      if (/^Shiny:\s*(Yes|No)$/i.test(line)) continue;

      result.unparsedLines.push(line);
    }

    return result;
  }

  /**
   * Parse a full team (multiple sets separated by blank lines).
   * @param {string} text - Raw Showdown text for a full team
   * @returns {object[]} Array of parsed sets
   */
  function parseTeam(text, opts = {}) {
    const sets = text.split(/\n\s*\n/).filter(s => s.trim().length > 0);
    return sets.map((setText) => parseSet(setText, opts)).filter(Boolean);
  }

  return { parseSet, parseTeam };
})();
