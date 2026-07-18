import { DomainMappers } from './domain-mappers.js';
import { EvConvert } from './ev-convert.js';

/**
 * showdown-parser.js — Parse Showdown importable text into structured data.
 * Inverse of team-export.js formatMember().
 */

export const ShowdownParser = (() => {
  const STAT_KEYS = /** @type {Record<string, import('./types/contracts.js').StatKey>} */ (Object.fromEntries(
    Object.entries(DomainMappers.STAT_LABELS).map(([k, label]) => [label, k])
  ));
  const {
    CHAMPIONS_PER_STAT_CAP = 32,
    CLASSIC_PER_STAT_CAP = 252,
  } = EvConvert || {};
  const DEFAULT_SPREAD_MAX = CLASSIC_PER_STAT_CAP;
  const IV_MAX = 31;

  /** @param {string} text @param {number} [maxValue] */
  function parseSpread(text, maxValue = DEFAULT_SPREAD_MAX) {
    /** @type {import('./types/contracts.js').StatSpread} */
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
   * @param {{maxValue?: number|'champions', championsMaxValue?: number}} [opts]
   * @returns {import('./types/contracts.js').ParsedShowdownSet|null} Parsed set or null if empty
   */
  function parseSet(text, opts = {}) {
    const {
      maxValue = DEFAULT_SPREAD_MAX,
      championsMaxValue = CHAMPIONS_PER_STAT_CAP,
    } = opts;
    const spreadMaxValue = maxValue === 'champions' ? championsMaxValue : maxValue;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return null;

    /** @type {import('./types/contracts.js').ParsedShowdownSet} */
    const result = {
      species: '', item: '', ability: '', nature: '',
      evs: {}, ivs: {}, moves: [], teraType: '', level: 50,
      ball: '', nickname: '', gender: '', shiny: false,
      gigantamax: false, unparsedLines: [],
    };

    // Line 1: Species @ Item  (or  Nickname (Species) @ Item)
    // If line 1 looks like a field line (Ability:, EVs:, etc.), the species line
    // was omitted — start parsing fields from line 0 instead.
    const FIELD_LINE = /^(Ability|Trait|EVs|IVs|Tera Type|Level|Ball|Shiny|Happiness|Gigantamax|Dynamax Level)\s*:/i;
    const NATURE_LINE = /^\w+\s+Nature$/i;
    const MOVE_LINE = /^- /;
    const firstIsField = FIELD_LINE.test(lines[0]) || NATURE_LINE.test(lines[0]) || MOVE_LINE.test(lines[0]);
    let fieldStart = 1;

    if (!firstIsField) {
      const firstLine = lines[0];
      const atIdx = firstLine.indexOf(' @ ');
      let speciesPart;
      if (atIdx >= 0) {
        speciesPart = firstLine.slice(0, atIdx).trim();
        result.item = firstLine.slice(atIdx + 3).trim();
      } else {
        speciesPart = firstLine.trim();
      }

      // Gender suffix: strip (M)/(F) BEFORE nickname/species split (matches Smogon behavior)
      if (speciesPart.endsWith(' (M)')) { result.gender = 'M'; speciesPart = speciesPart.slice(0, -4); }
      else if (speciesPart.endsWith(' (F)')) { result.gender = 'F'; speciesPart = speciesPart.slice(0, -4); }

      // Handle nickname: "Nickname (Species)"
      const nickMatch = speciesPart.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (nickMatch) {
        result.nickname = nickMatch[1].trim();
        speciesPart = nickMatch[2].trim();
      }
      result.species = speciesPart;
    } else {
      fieldStart = 0;
    }

    for (let i = fieldStart; i < lines.length; i++) {
      const line = lines[i];

      // Moves: - Move Name (also ~ prefix per Smogon convention)
      if (line.startsWith('- ') || line.startsWith('~ ')) {
        let moveName = line.slice(2).trim();
        // Strip Hidden Power bracket notation: "Hidden Power [Fire]" → "Hidden Power Fire"
        const hpMatch = moveName.match(/^Hidden Power \[(\w+)\]$/);
        if (hpMatch) moveName = 'Hidden Power ' + hpMatch[1];
        result.moves.push(moveName);
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

      // Shiny: Yes
      const shinyMatch = line.match(/^Shiny:\s*(Yes|No)$/i);
      if (shinyMatch) { result.shiny = shinyMatch[1].toLowerCase() === 'yes'; continue; }

      // Gigantamax: Yes
      if (/^Gigantamax:\s*Yes$/i.test(line) || line === 'Gigantamax') { result.gigantamax = true; continue; }

      result.unparsedLines.push(line);
    }

    // Showdown convention: omitted IVs default to 31 (perfect).
    // Only fill defaults when at least one IV was explicitly set, OR when
    // no IVs line appeared at all (implying all perfect).
    const STAT_KEY_LIST = /** @type {import('./types/contracts.js').StatKey[]} */ (Object.keys(DomainMappers.STAT_LABELS));
    const hasAnyIv = Object.keys(result.ivs).length > 0;
    if (!hasAnyIv) {
      // No IVs line → all 31
      for (const k of STAT_KEY_LIST) result.ivs[k] = 31;
    } else {
      // Partial IVs line → fill unlisted stats with 31
      for (const k of STAT_KEY_LIST) {
        if (result.ivs[k] === undefined) result.ivs[k] = 31;
      }
    }

    return result;
  }

  /**
   * Parse a full team (multiple sets separated by blank lines).
   * @param {string} text - Raw Showdown text for a full team
   * @param {{maxValue?: number|'champions', championsMaxValue?: number}} [opts]
   * @returns {import('./types/contracts.js').ParsedShowdownSet[]} Array of parsed sets
   */
  function parseTeam(text, opts = {}) {
    const sets = text.split(/\n\s*\n/).filter(s => s.trim().length > 0);
    return sets.map((setText) => parseSet(setText, opts)).filter((set) => set !== null);
  }

  return { parseSet, parseTeam };
})();
