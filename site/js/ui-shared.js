import { DataManager } from './data.js';
import { DomainMappers } from './domain-mappers.js';
import { ExportUI } from './export-ui.js';
import { SettingsState } from './settings-state.js';
import { TeamExportFormatter } from './team-export.js';
import { UIModels } from './ui-models.js';
import { FilterToolbarSection } from './ui/sections/filter-toolbar.js';
import { AutocompleteWidget } from './ui/widgets/autocomplete-widget.js';
import { BallPicker } from './ui/widgets/ball-picker.js';
import { FormFields } from './ui/widgets/form-fields.js';

/**
 * ui-shared.js — Shared UI utilities, components, and constants.
 * Used by all view modules (home, builds, teams, editor).
 * Must be loaded after data.js and team-export.js.
 */
import { copyText, flashCopyFeedback } from './ui/clipboard.js';
import { escapeHtml, normalizeDisplayText, pluralize, titleCase } from './ui/dom.js';

export const UIShared = (() => {
  /** @typedef {{
   * compact?: boolean, transferredToChampions?: boolean, shiny?: boolean, genned?: boolean,
   * eventOrigin?: boolean, fromGo?: boolean, gigantamax?: boolean, alpha?: boolean,
   * language?: string|null, defaultLanguage?: string|null, slug?: string,
   * inChampions?: boolean, compatibleGames?: string[]
   * }} BadgeOptions */
  /** @typedef {{
   * status?: import('./types/contracts.js').BuildStatus,
   * transferredToChampions?: boolean, transferred_to_champions?: boolean,
   * decorations?: {
   * status?: import('./types/contracts.js').BuildStatus,
   * transferred?: boolean,
   * flags?: Array<{variant: string, label: string}>,
   * badgeEntry?: EntryBadgeSource
   * }
   * } & import('./types/contracts.js').BuildState} DecorationSource */
  /** @typedef {DecorationSource & {
   * slug?: string, compatibleGames?: string[], eventOrigin?: boolean, fromGo?: boolean,
   * language?: string|null
   * }} EntryBadgeSource */
  /** @typedef {{shiny?: boolean, cls?: string, width?: string|number, height?: string|number, loading?: string}} SpriteOptions */
  // ── Constants ──────────────────────────────────────────

  const STAT_NAMES = DomainMappers.STAT_LABELS;
  const normalizeMoveToken = DomainMappers.normalizeMoveToken;

  const ALL_TYPES = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground',
    'Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy','Stellar'];
  const ALL_BALLS = BallPicker.BALL_LIST;
  const DEFAULT_LANGUAGE_CODE = 'ENG';
  const LANGUAGE_OPTIONS = Object.freeze([
    { code: 'ENG', label: 'English', badge: 'EN', compactBadge: 'EN' },
    { code: 'JPN', label: 'Japanese', badge: 'JP', compactBadge: 'JP' },
    { code: 'KOR', label: 'Korean', badge: 'KR', compactBadge: 'KR' },
    { code: 'FRE', label: 'French', badge: 'FR', compactBadge: 'FR' },
    { code: 'GER', label: 'German', badge: 'DE', compactBadge: 'DE' },
    { code: 'SPA', label: 'Spanish', badge: 'ES', compactBadge: 'ES' },
    { code: 'ITA', label: 'Italian', badge: 'IT', compactBadge: 'IT' },
    { code: 'CHT', label: 'Chinese (Traditional)', badge: 'ZH-T', compactBadge: '繁' },
    { code: 'CHS', label: 'Chinese (Simplified)', badge: 'ZH-S', compactBadge: '简' },
  ]);
  const LANGUAGE_LOOKUP = new Map(LANGUAGE_OPTIONS.map((language) => [language.code, language]));

  // ── Normalize decoration state from any input shape ────
  // Accepts either an inventory entry VM (camelCase) or raw slot state (snake_case).
  /**
   * @param {DecorationSource|null|undefined} source
   * @returns {{status: Partial<import('./types/contracts.js').BuildStatus>, transferred: boolean}}
   */
  function getDecorationState(source) {
    if (!source) return { status: {}, transferred: false };
    const status = source.decorations?.status
      || (source.status && (source.status.isComplete !== undefined || source.status.isPartial !== undefined)
      ? source.status
      : UIModels.evaluateBuildStatus(source));
    const transferred = source.decorations?.transferred
      ?? !!(source.transferredToChampions || source.transferred_to_champions);
    return { status, transferred };
  }

  // ── Game compatibility badges (ONE implementation) ────
  // Used by: inventory cards, detail viewer.
  // opts.transferredToChampions → show 🏆 transferred badge
  /** @param {string} slug @param {BadgeOptions & {games?: string[]}} [opts] */
  function renderGameBadgesHtml(slug, opts = {}) {
    const compact = !!opts.compact;
    const sizeAttr = compact ? ' data-badge-size="compact"' : '';
    const badges = [];
    if (opts.transferredToChampions) {
      badges.push(`<span class="game-badge" data-badge-game="transferred"${sizeAttr} title="Transferred to Champions">${compact ? '🏆' : '🏆 In Game'}</span>`);
    }
    return badges.join('');
  }

  // ── Compact badge dots (HOME box grid only) ──────────
  // Renders identity + flag badges as uniform colored dots.
  // opts.transferredToChampions, opts.eventOrigin, opts.language,
  // opts.shiny, opts.genned, opts.gigantamax, opts.alpha
  /** @param {BadgeOptions} [opts] */
  function renderBadgeDotsHtml(opts = {}) {
    const dots = [];

    if (opts.shiny) dots.push('<span class="badge-dot" data-badge="shiny" title="Shiny"></span>');
    if (opts.genned) dots.push('<span class="badge-dot" data-badge="genned" title="Genned"></span>');

    if (opts.transferredToChampions) {
      dots.push('<span class="badge-dot" data-badge="transferred" title="Transferred to Champions"></span>');
    }

    if (opts.eventOrigin) dots.push('<span class="badge-dot" data-badge="event" title="Event / giveaway Pokémon"></span>');
    if (opts.fromGo) dots.push('<span class="badge-dot" data-badge="go" title="From Pokémon GO"></span>');
    if (opts.gigantamax) dots.push('<span class="badge-dot" data-badge="gmax" title="Gigantamax"></span>');
    if (opts.alpha) dots.push('<span class="badge-dot" data-badge="alpha" title="Alpha"></span>');

    const defaultLang = normalizeLanguageCode(opts.defaultLanguage || getDefaultLanguageCode()) || DEFAULT_LANGUAGE_CODE;
    const lang = getLanguageInfo(opts.language);
    if (lang && lang.code !== defaultLang) {
      dots.push(`<span class="badge-dot" data-badge="language" title="Language: ${escapeHtml(lang.label)}"></span>`);
    }

    return dots.join('');
  }

  /** @param {unknown} value */
  function normalizeLanguageCode(value) {
    return String(value || '').trim().toUpperCase();
  }

  function getDefaultLanguageCode() {
    const stored = SettingsState?.getDefaultLanguage?.();
    return normalizeLanguageCode(stored) || DEFAULT_LANGUAGE_CODE;
  }

  /** @param {unknown} code */
  function getLanguageInfo(code) {
    const normalized = normalizeLanguageCode(code);
    return normalized ? (LANGUAGE_LOOKUP.get(normalized) || null) : null;
  }

  /** @param {unknown} code */
  function getLanguageName(code) {
    const info = getLanguageInfo(code);
    return info ? info.label : (normalizeLanguageCode(code) || 'Unknown');
  }

  /** @param {unknown} code */
  function getLanguageBadgeText(code) {
    const info = getLanguageInfo(code);
    return info ? info.badge : (normalizeLanguageCode(code) || '');
  }

  /** @param {unknown} selectedLanguage @param {{includeBlank?: boolean, blankLabel?: string}} [opts] */
  function renderLanguageOptions(selectedLanguage, opts = {}) {
    const selected = normalizeLanguageCode(selectedLanguage);
    const includeBlank = opts.includeBlank !== false;
    const blankLabel = opts.blankLabel || 'Unknown';
    const options = [];

    if (includeBlank) {
      options.push(`<option value="">${escapeHtml(blankLabel)}</option>`);
    }

    for (const language of LANGUAGE_OPTIONS) {
      options.push(`<option value="${escapeHtml(language.code)}"${selected === language.code ? ' selected' : ''}>${escapeHtml(language.label)}</option>`);
    }

    return options.join('');
  }

  /** @param {BadgeOptions} [opts] */
  function renderIdentityBadgesHtml(opts = {}) {
    const compact = !!opts.compact;
    const sizeAttr = compact ? ' data-badge-size="compact"' : '';
    const badges = [];
    const defaultLanguage = normalizeLanguageCode(opts.defaultLanguage || getDefaultLanguageCode()) || DEFAULT_LANGUAGE_CODE;
    const language = getLanguageInfo(opts.language);

    if (opts.eventOrigin) {
      const cherishUrl = BallPicker.ballSpriteUrl('Cherish');
      const sz = compact ? 14 : 16;
      const icon = `<img src="${cherishUrl}" width="${sz}" height="${sz}" alt="Event" class="event-origin-icon">`;
      badges.push(`<span class="game-badge" data-badge-game="event"${sizeAttr} title="Event / giveaway Pokémon">${compact ? icon : icon + ' Event'}</span>`);
    }

    if (opts.fromGo) {
      badges.push(`<span class="game-badge" data-badge-game="go"${sizeAttr} title="From Pokémon GO">${compact ? 'GO' : 'GO'}</span>`);
    }

    if (language && language.code !== defaultLanguage) {
      const label = compact ? (language.compactBadge || language.badge) : language.badge;
      badges.push(`<span class="game-badge" data-badge-game="language"${sizeAttr} title="Language: ${escapeHtml(language.label)}">${escapeHtml(label)}</span>`);
    }

    return badges.join(compact ? '' : ' ');
  }

  // ── Nature <option> HTML (ONE implementation) ─────────
  // Used by: build form, team member form.
  /** @param {string} selectedNature */
  function renderNatureOptions(selectedNature) {
    return FormFields.renderNatureOptions(selectedNature, { escapeHtml });
  }

  // ── Autocomplete formatters (ONE implementation each) ─
  /** @param {import('./types/contracts.js').PokedexEntry} item */
  function formatSpeciesItem(item) {
    return FormFields.formatSpeciesItem(item, { escapeHtml });
  }

  /** @param {import('./types/contracts.js').ReferenceItem} item */
  function formatMoveItem(item) {
    return FormFields.formatMoveItem(item, { escapeHtml });
  }

  // ── Ability <select> sync (ONE implementation) ────────
  // Used by: build form, team member form.
  /** @param {HTMLSelectElement|null} selectEl @param {import('./types/contracts.js').InputValue} speciesRef @param {string} [selectedAbility] */
  function syncAbilitySelect(selectEl, speciesRef, selectedAbility = '') {
    return FormFields.syncAbilitySelect(selectEl, speciesRef, selectedAbility, { escapeHtml });
  }

  // ── EV/SP validation (ONE implementation) ─────────────
  // system: 'classic' | 'champions'
  // statInputGetter: (statKey) => HTMLInputElement
  // Returns { evs: {hp:N,...}, total:N, errors: [{input, message}] }
  /**
   * @param {(key: import('./types/contracts.js').StatKey) => HTMLInputElement} statInputGetter
   * @param {import('./types/contracts.js').EvSystem} system
   */
  function validateEvSpread(statInputGetter, system) {
    return FormFields.validateEvSpread(statInputGetter, system, { statNames: STAT_NAMES });
  }

  // ── Sprite rendering (ONE implementation) ──────────────
  /** @param {import('./types/contracts.js').SpeciesInput|null|undefined} speciesRef @param {string} alt @param {{shiny?: boolean}} [opts] */
  function getSpriteUrls(speciesRef, alt, opts = {}) {
    const candidates = (DataManager.getSpriteCandidates
      ? DataManager.getSpriteCandidates(speciesRef || alt)
      : [speciesRef || alt]
    ).filter(Boolean);
    // Build URLs directly from candidate slugs — do NOT re-resolve each through
    // getSpriteUrl, which collapses multi-hyphen form variants back to the same
    // (potentially wrong) first candidate (e.g. toxtricity-low-key vs toxtricity-lowkey).
    const base = (DataManager.getSpriteBase ? DataManager.getSpriteBase() : '') || '';
    const normalUrls = [...new Set(candidates.map((c) => `${base}/${c}.png`).filter(Boolean))];
    if (!opts.shiny) return normalUrls;
    // Interleave: for each normal URL, insert shiny variant before it
    const urls = [];
    for (const url of normalUrls) {
      const shinyUrl = url.replace('/sprites/gen5/', '/sprites/gen5-shiny/');
      if (shinyUrl !== url) urls.push(shinyUrl);
      urls.push(url);
    }
    return urls;
  }

  function buildSpriteFallbackHandler() {
    return "(function(img){const list=(img.dataset.fallbackSrcs||'').split('|').filter(Boolean);if(list.length){img.src=list.shift();img.dataset.fallbackSrcs=list.join('|');}else{img.style.display='none';}})(this)";
  }

  /** @param {import('./types/contracts.js').SpeciesInput|null|undefined} speciesRef @param {string} alt @param {SpriteOptions} [opts] */
  function spriteImgHtml(speciesRef, alt, opts = {}) {
    const urls = getSpriteUrls(speciesRef, alt, { shiny: opts.shiny });
    const src = urls[0] || DataManager.getSpriteUrl(String(speciesRef || ''));
    const cls = opts.cls ? ` class="${escapeHtml(opts.cls)}"` : '';
    const w = opts.width ? ` width="${opts.width}"` : '';
    const h = opts.height ? ` height="${opts.height}"` : '';
    const load = opts.loading ? ` loading="${opts.loading}"` : '';
    const fallbackUrls = urls.slice(1).join('|');
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${cls}${w}${h}${load} data-fallback-srcs="${escapeHtml(fallbackUrls)}" onerror="${buildSpriteFallbackHandler()}">`;
  }

  // Sprite + badge dots as siblings — no wrapper needed.
  // Dots use position:absolute, anchored to nearest positioned ancestor.
  // Callers in flex/grid contexts (slots, table cells) should have position:relative.
  /**
   * @param {import('./types/contracts.js').SpeciesInput|null|undefined} speciesRef
   * @param {string} alt
   * @param {SpriteOptions|null|undefined} spriteOpts
   * @param {BadgeOptions|null|undefined} dotOpts
   */
  function spriteWithDotsHtml(speciesRef, alt, spriteOpts, dotOpts) {
    const effectiveOpts = { ...(spriteOpts || {}) };
    if (!('shiny' in effectiveOpts) && dotOpts?.shiny) effectiveOpts.shiny = true;
    const img = spriteImgHtml(speciesRef, alt, effectiveOpts);
    if (!dotOpts) return img;
    const dots = renderBadgeDotsHtml(dotOpts);
    if (!dots) return img;
    return `${img}<span class="slot-badge-grid">${dots}</span>`;
  }

  // ── Ball picker wrappers ───────────────────────────────

  /** @param {string} ballName */
  function ballSpriteUrl(ballName) {
    return BallPicker.ballSpriteUrl(ballName);
  }

  /** @param {HTMLElement} container @param {string|null|undefined} selectedBall @param {((ball: string) => void)|null|undefined} onChange */
  function createBallPicker(container, selectedBall, onChange) {
    return BallPicker.createBallPicker(container, selectedBall, onChange);
  }

  // ── Stat formatting ────────────────────────────────────

  /** @param {import('./types/contracts.js').StatSpread|null|undefined} stats @param {string} [fallback] */
  function formatCompactStatSpread(stats, fallback = 'Not provided') {
    const statEntries = /** @type {Array<[import('./types/contracts.js').StatKey, string]>} */ (Object.entries(STAT_NAMES));
    const parts = statEntries
      .map(([key, label]) => {
        const value = Number(stats?.[key] ?? 0);
        return value > 0 ? `${value} ${label}` : null;
      })
      .filter(Boolean);

    return parts.length ? parts.join(' / ') : fallback;
  }

  /** @param {import('./types/contracts.js').StatSpread|null|undefined} stats @param {string} [kind] */
  function renderStatBars(stats, kind = 'ev') {
    const cssClass = kind === 'champions-ev' ? 'ev' : kind;
    const maxValue = kind === 'iv' ? 31 : kind === 'base' ? 255 : kind === 'final' ? 300 : kind === 'champions-ev' ? 32 : 252;
    const isEvKind = kind === 'ev' || kind === 'champions-ev';
    // EVs use all-or-nothing unknown: if every stat is 0/null/undefined, the whole spread is unknown
    const statKeys = /** @type {import('./types/contracts.js').StatKey[]} */ (Object.keys(STAT_NAMES));
    const statEntries = /** @type {Array<[import('./types/contracts.js').StatKey, string]>} */ (Object.entries(STAT_NAMES));
    const allEvsUnknown = isEvKind && statKeys.every(k => {
      const v = stats?.[k];
      return v === null || v === undefined || v === 0;
    });
    let html = '<div class="stat-bars">';
    for (const [key, label] of statEntries) {
      const rawValue = stats?.[key];
      const isUnknown = rawValue === null || rawValue === undefined;
      const perStatClass = `stat-bar-${key}`;
      if ((kind === 'iv' && isUnknown) || allEvsUnknown) {
        html += `
          <div class="stat-row">
            <span class="stat-label stat-${key}">${label}</span>
            <div class="stat-bar-bg"><div class="stat-bar-fill stat-bar-fill--empty ${cssClass} ${perStatClass}"></div></div>
            <span class="stat-value stat-unknown">?</span>
          </div>`;
      } else {
        const defaultValue = kind === 'iv' ? 31 : 0;
        const value = Number(isUnknown ? defaultValue : rawValue);
        const pct = (value / maxValue) * 100;
        html += `
          <div class="stat-row">
            <span class="stat-label stat-${key}">${label}</span>
            <div class="stat-bar-bg"><div class="stat-bar-fill ${cssClass} ${perStatClass}" style="width:${pct}%"></div></div>
            <span class="stat-value">${value}</span>
          </div>`;
      }
    }
    if (kind === 'base' || kind === 'final') {
      let bst = 0;
      for (const value of Object.values(stats || {})) bst += Number(value || 0);
      const totalLabel = kind === 'final' ? 'Total' : 'BST';
      html += `<div class="stat-row stat-row--total"><span class="stat-label">${totalLabel}</span><div class="stat-bar-bg"></div><span class="stat-value">${bst}</span></div>`;
    }
    html += '</div>';
    return html;
  }

  // ── Stat Radar (hexagon) chart ──────────────────────────

  const DEFAULT_STAT_COLORS = Object.freeze({
    hp: '#ff5959', atk: '#f5ac78', def: '#fae078',
    spa: '#9db7f5', spd: '#a7db8d', spe: '#fa92b2',
  });
  /** @type {Record<import('./types/contracts.js').StatKey, string>|null} */
  let _statColorCache = null;

  /** @param {import('./types/contracts.js').StatKey} stat */
  function getStatColor(stat) {
    if (!_statColorCache) {
      const styles = getComputedStyle(document.documentElement);
      _statColorCache = { ...DEFAULT_STAT_COLORS };
      for (const [key, fallback] of Object.entries(DEFAULT_STAT_COLORS)) {
        const statKey = /** @type {import('./types/contracts.js').StatKey} */ (key);
        _statColorCache[statKey] = styles.getPropertyValue(`--stat-${key}`).trim() || fallback;
      }
    }
    return _statColorCache[stat] || DEFAULT_STAT_COLORS[stat];
  }

  /** @param {import('./types/contracts.js').StatSpread|null|undefined} stats @param {string} [kind] */
  function renderStatRadar(stats, kind = 'ev') {
    // In-game hexagon order: HP, Atk, Def, Spe, SpD, SpA (clockwise from top)
    /** @type {import('./types/contracts.js').StatKey[]} */
    const keys = ['hp', 'atk', 'def', 'spe', 'spd', 'spa'];
    const labels = keys.map(k => STAT_NAMES[k]);
    const maxVal = kind === 'iv' ? 31 : kind === 'champions-ev' ? 32
      : kind === 'base' ? 255 : kind === 'final' ? 300 : 252;
    const isEvKind = kind === 'ev' || kind === 'champions-ev';

    const allUnknown = isEvKind
      ? keys.every(k => { const v = stats?.[k]; return v === null || v === undefined || v === 0; })
      : kind === 'iv'
        ? keys.every(k => stats?.[k] === null || stats?.[k] === undefined)
        : false;

    const W = 220, H = 220;
    const cx = W / 2, cy = H / 2;
    const R = 68;
    const n = 6;

    /** @param {number} i */
    const ang = i => (2 * Math.PI * i) / n - Math.PI / 2;
    /** @param {number} a @param {number} r @returns {[number, number]} */
    const xy = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    /** @param {number} a @param {number} r */
    const pt = (a, r) => { const [x, y] = xy(a, r); return `${x.toFixed(1)},${y.toFixed(1)}`; };
    /** @param {number} r */
    const hexPts = r => Array.from({ length: n }, (_, i) => pt(ang(i), r)).join(' ');

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="stat-radar stat-radar--${kind}">`;

    // Background fill
    svg += `<polygon points="${hexPts(R)}" class="radar-bg"/>`;

    // Grid hexagons
    for (const f of [1 / 3, 2 / 3, 1]) {
      svg += `<polygon points="${hexPts(R * f)}" class="radar-grid"/>`;
    }

    // Axis lines
    for (let i = 0; i < n; i++) {
      const [x2, y2] = xy(ang(i), R);
      svg += `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="radar-axis"/>`;
    }

    // Data polygon + vertex dots
    if (!allUnknown) {
      const dataPts = keys.map((k, i) => {
        const v = Math.min(Number(stats?.[k] || 0), maxVal);
        return pt(ang(i), (v / maxVal) * R);
      });
      svg += `<polygon points="${dataPts.join(' ')}" class="radar-fill radar-fill--${kind}"/>`;

      keys.forEach((k, i) => {
        const v = Math.min(Number(stats?.[k] || 0), maxVal);
        const [dx, dy] = xy(ang(i), (v / maxVal) * R);
        svg += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="3" class="radar-dot radar-dot--${kind}"/>`;
      });
    }

    // Stat labels + numeric values
    keys.forEach((k, i) => {
      const [lx, ly] = xy(ang(i), R + 20);
      const v = stats?.[k];
      const displayVal = allUnknown ? '?'
        : (v === null || v === undefined ? (isEvKind ? '0' : '?') : String(v));
      svg += `<text x="${lx.toFixed(1)}" y="${(ly - 5).toFixed(1)}" text-anchor="middle" dominant-baseline="auto" class="radar-stat-name" fill="${getStatColor(k)}">${labels[i]}</text>`;
      svg += `<text x="${lx.toFixed(1)}" y="${(ly + 8).toFixed(1)}" text-anchor="middle" dominant-baseline="auto" class="radar-stat-val">${displayVal}</text>`;
    });

    if (allUnknown) {
      svg += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="radar-unknown">?</text>`;
    }

    svg += '</svg>';
    return `<div class="stat-radar-wrap">${svg}</div>`;
  }

  // ── Move rendering ─────────────────────────────────────

  /** @param {string[]} moves @param {{eggMoves?: string[]}} [opts] */
  function renderMovePills(moves, opts = {}) {
    const eggMoveKeys = new Set((opts.eggMoves || []).map(normalizeMoveToken));
    return (moves || [])
      .filter(Boolean)
      .map((move) => {
        const isEggMove = eggMoveKeys.has(normalizeMoveToken(move));
        return `<span class="move-pill${isEggMove ? ' move-pill--egg' : ''}">${escapeHtml(move)}${isEggMove ? '<span class="move-egg-badge" title="Egg move">🥚</span>' : ''}</span>`;
      })
      .join('');
  }

  /** @param {string[]} moves @param {string} [emptyMessage] @param {{eggMoves?: string[]}} [opts] */
  function renderMovesList(moves, emptyMessage = 'No moves imported.', opts = {}) {
    if (!moves?.length) {
      return `<p class="detail-panel-note">${escapeHtml(emptyMessage)}</p>`;
    }

    const eggMoveKeys = new Set((opts.eggMoves || []).map(normalizeMoveToken));
    return `
      <div class="moves-list">
        ${moves.map((move) => {
          const moveType = DataManager.getMoveType(move);
          const typeClass = moveType ? `type-${moveType.toLowerCase()}` : '';
          const isEggMove = eggMoveKeys.has(normalizeMoveToken(move));
          return `<div class="move-slot ${typeClass}${isEggMove ? ' move-slot--egg' : ''}">${escapeHtml(move)}${isEggMove ? '<span class="move-slot-badge" title="Egg move">🥚</span>' : ''}</div>`;
        }).join('')}
      </div>
    `;
  }

  // ── Showdown Preview with PokePaste highlighting ───────

  /** @param {import('./types/contracts.js').BuildState|import('./types/contracts.js').ExportMember} build */
  function renderShowdownPreview(build) {
    const text = TeamExportFormatter.formatMember(
      /** @type {import('./types/contracts.js').BuildState} */ (build)
    );
    const lines = text.split('\n');
    const entry = DataManager.resolveSpecies(build).entry;
    const primaryType = entry?.types?.[0]?.toLowerCase() || '';

    const htmlLines = lines.map(line => {
      if (line === lines[0]) {
        return primaryType
          ? `<span class="pokepaste-species" style="color:var(--type-${primaryType})">${escapeHtml(line)}</span>`
          : escapeHtml(line);
      }
      if (line.startsWith('- ')) {
        const moveName = line.slice(2).trim();
        const moveType = DataManager.getMoveType(moveName);
        return moveType
          ? `<span style="color:var(--type-${moveType.toLowerCase()})">${escapeHtml(line)}</span>`
          : escapeHtml(line);
      }
      if (line.startsWith('EVs:') || line.startsWith('IVs:')) {
        const prefix = line.slice(0, line.indexOf(':') + 1);
        const rest = line.slice(line.indexOf(':') + 1);
        const colored = rest.replace(/(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)/g, (_, val, stat) =>
          `<span class="stat-${stat.toLowerCase()}">${val} ${stat}</span>`);
        return `${escapeHtml(prefix)}${colored}`;
      }
      return escapeHtml(line);
    });
    return `<pre class="pokepaste-preview">${htmlLines.join('\n')}</pre>`;
  }

  // ── Autocomplete widget ────────────────────────────────

  /**
   * @template {string|{name?: string}} T
   * @param {HTMLInputElement} input
   * @param {(query: string) => T[]|Promise<T[]>} searchFn
   * @param {{onSelect?: (item: T) => void, formatItem?: (item: T) => string}} [options]
   */
  function createAutocomplete(input, searchFn, { onSelect, formatItem } = {}) {
    return AutocompleteWidget.create(input, searchFn, { onSelect, formatItem, escapeHtml });
  }

  // ── Export surface utilities ────────────────────────────

  /** @param {string} exportText */
  function summarizeImportable(exportText) {
    const blocks = exportText
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean);
    const firstLine = blocks[0]?.split('\n')[0]?.trim() || 'No importable text yet.';
    return blocks.length > 1 ? `${firstLine} + ${blocks.length - 1} more` : firstLine;
  }

  /** @param {HTMLElement} container @param {boolean} isOpen @param {string} [closedLabel] */
  function setImportablePanelOpen(container, isOpen, closedLabel = 'View importable') {
    container.classList.toggle('is-open', isOpen);
    const panel = container.querySelector('.team-export-panel');
    const toggleButton = container.querySelector('.team-export-toggle');
    if (panel instanceof HTMLElement) {
      panel.hidden = !isOpen;
    }
    if (toggleButton) {
      toggleButton.textContent = isOpen ? 'Hide importable' : closedLabel;
    }
  }

  /** @param {HTMLElement} container @param {{exportText: string, copyLabel: string, toggleLabel: string}} options */
  function wireImportableSurface(container, { exportText, copyLabel, toggleLabel }) {
    const textarea = container.querySelector('.team-export-text');
    const copyButton = container.querySelector('.team-export-copy');
    const toggleButton = container.querySelector('.team-export-toggle');
    if (!(textarea instanceof HTMLTextAreaElement) || !(copyButton instanceof HTMLButtonElement)) return;

    textarea.value = exportText;
    copyButton.textContent = copyLabel;
    if (toggleButton instanceof HTMLButtonElement) {
      setImportablePanelOpen(container, false, toggleLabel);
      toggleButton.addEventListener('click', () => {
        setImportablePanelOpen(container, !container.classList.contains('is-open'), toggleLabel);
      });
    }

    copyButton.addEventListener('click', async () => {
      await flashCopyFeedback(exportText, copyButton, {
        successText: 'Copied!',
        failText: 'Select text',
        duration: 1800,
        textarea,
        onError: (error) => {
          console.warn('Copy failed:', error);
          setImportablePanelOpen(container, true, toggleLabel);
          textarea.focus();
          textarea.select();
        },
      });
    });
  }

  /** @param {string} exportText */
  function highlightShowdownText(exportText) {
    const lines = exportText.split('\n');
    return lines.map(line => {
      if (line.startsWith('- ')) {
        const moveName = line.slice(2).trim();
        const moveType = DataManager.getMoveType(moveName);
        const cls = moveType ? ` type-${moveType.toLowerCase()}` : '';
        return `<span class="showdown-move${cls}">${escapeHtml(line)}</span>`;
      }
      if (line.startsWith('Ability:') || line.startsWith('Level:') || line.startsWith('Tera Type:')) {
        return `<span class="showdown-attr">${escapeHtml(line)}</span>`;
      }
      if (line.startsWith('EVs:') || line.startsWith('IVs:')) {
        return `<span class="showdown-spread">${escapeHtml(line)}</span>`;
      }
      if (line.endsWith(' Nature')) {
        return `<span class="showdown-nature">${escapeHtml(line)}</span>`;
      }
      if (line.includes(' @ ') || (line.trim() && !line.startsWith(' ') && !line.startsWith('-') && !line.includes(':'))) {
        return `<span class="showdown-species">${escapeHtml(line)}</span>`;
      }
      return escapeHtml(line);
    }).join('\n');
  }

  /** @param {import('./types/contracts.js').Team} team */
  function createTeamExportSurface(team) {
    const exportText = TeamExportFormatter.formatTeam(team);
    const exportMeta = TeamExportFormatter.getExportMeta(team);
    const exportPreview = summarizeImportable(exportText);
    const highlightedHtml = highlightShowdownText(exportText);

    const section = document.createElement('section');
    section.className = 'team-export-surface';
    section.innerHTML = `
      <div class="team-export-header">
        <div>
          <h3 class="team-export-title">Showdown importable</h3>
          <p class="team-export-subtitle">Copy the fully trained team or expand the raw importable when you need it.</p>
          <p class="team-export-preview">${escapeHtml(exportPreview)}</p>
        </div>
        <div class="team-export-actions">
          <button type="button" class="team-export-bulk" title="Export with target-game conversion (cross-scale aware)">Export…</button>
          <button type="button" class="team-export-copy">Copy team</button>
          <button type="button" class="team-export-toggle">View importable</button>
        </div>
      </div>
      <div class="team-export-meta">
        <span class="summary-pill summary-pill--${escapeHtml(exportMeta.tone)}">${escapeHtml(exportMeta.statusLabel)}</span>
        <span class="summary-pill">${escapeHtml(exportMeta.evSystem)}</span>
      </div>
      <p class="team-export-note">${escapeHtml(exportMeta.note)}</p>
      <div class="team-export-panel" hidden>
        <pre class="team-export-highlighted">${highlightedHtml}</pre>
        <textarea class="team-export-text hidden" readonly spellcheck="false" aria-label="Showdown importable for ${escapeHtml(team.creator || team.team_id || 'team')}"></textarea>
      </div>
    `;

    wireImportableSurface(section, {
      exportText,
      copyLabel: 'Copy team',
      toggleLabel: 'View importable',
    });

    const bulkBtn = section.querySelector('.team-export-bulk');
    if (bulkBtn) bulkBtn.addEventListener('click', () => {
      const members = (team.members || []);
      const builds = members
        .map((member) => DomainMappers.createBuildCandidateFromTeamMember(member, team.ev_system || 'classic'))
        .filter(Boolean);
      if (!builds.length) return;
      ExportUI.openBulkExportModal(builds, {
        title: `Export team: ${team.name || team.creator || team.team_id || 'Untitled'}`,
      });
    });

    return section;
  }

  // ── Search empty state ─────────────────────────────────

  /** @param {string} containerId @param {string} search @param {boolean} isVisible @param {string} message */
  function updateSearchEmptyState(containerId, search, isVisible, message) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let emptyState = container.querySelector('.search-empty-state');
    if (!search || isVisible) {
      if (emptyState) {
        emptyState.remove();
      }
      return;
    }

    if (!emptyState) {
      emptyState = document.createElement('div');
      emptyState.className = 'search-empty-state';
      container.appendChild(emptyState);
    }

    emptyState.textContent = message;
  }

  // ── Form validation ─────────────────────────────────────

  /** @param {HTMLElement} input @param {string} message */
  function showFieldError(input, message) {
    clearFieldError(input);
    input.classList.add('field-error');
    const err = document.createElement('div');
    err.className = 'field-error-msg';
    err.textContent = message;
    input.parentElement?.appendChild(err);
    // Auto-clear on next input/change
    const handler = () => { clearFieldError(input); input.removeEventListener('input', handler); input.removeEventListener('change', handler); };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  }

  /** @param {HTMLElement} input */
  function clearFieldError(input) {
    input.classList.remove('field-error');
    const existing = input.parentElement?.querySelector('.field-error-msg');
    if (existing) existing.remove();
  }

  // ── Flag badges (ONE implementation) ───────────────────
  // Renders flag pill badges: shiny, genned, champions, gmax, alpha, event.
  // Used by: inventory cards, inventory table, build summary, detail viewer.
  // state = any object with shiny/genned/transferred_to_champions/gigantamax/alpha/event_origin flags.
  /** @param {DecorationSource|null|undefined} state */
  function renderFlagBadgesHtml(state) {
    if (!state) return '';
    if (Array.isArray(state.decorations?.flags)) {
      return state.decorations.flags
        .map((flag) => `<span class="flag-badge flag-${escapeHtml(flag.variant)}">${escapeHtml(flag.label)}</span>`)
        .join(' ');
    }
    const flags = [];
    if (state.shiny) flags.push('<span class="flag-badge flag-shiny">✨ Shiny</span>');
    if (state.genned) flags.push('<span class="flag-badge flag-genned">Genned</span>');
    if (state.transferred_to_champions) flags.push('<span class="flag-badge flag-champions">🏆 Champions</span>');
    if (state.from_go) flags.push('<span class="flag-badge flag-go">GO</span>');
    if (state.gigantamax) flags.push('<span class="flag-badge flag-misc">Gmax</span>');
    if (state.alpha) flags.push('<span class="flag-badge flag-misc">Alpha</span>');
    if (state.event_origin) flags.push('<span class="flag-badge flag-misc">Event</span>');
    return flags.join(' ');
  }

  // ── Entry badge composition (ONE implementation) ──────
  // Composes game + identity + flag badges for an entry view model.
  // Used by: inventory cards, detail viewer.
  /** @param {EntryBadgeSource|null|undefined} entry @param {{compact?: boolean}} [opts] */
  function renderEntryBadgesHtml(entry, opts = {}) {
    const compact = !!opts.compact;
    const badgeEntry = entry?.decorations?.badgeEntry || entry || {};
    const parts = [
      renderGameBadgesHtml(badgeEntry.slug || '', {
        compact,
        games: badgeEntry.compatibleGames,
        transferredToChampions: badgeEntry.transferredToChampions,
      }),
      renderIdentityBadgesHtml({
        compact,
        language: badgeEntry.language,
        eventOrigin: badgeEntry.eventOrigin,
        fromGo: badgeEntry.fromGo,
      }),
      renderFlagBadgesHtml(entry),
    ];
    return parts.filter(Boolean).join(compact ? '' : ' ');
  }

  // ── Unified entry decoration (ONE implementation) ─────
  // Applies all CSS-based decorations to a rendered element in one call.
  // Accepts any input shape: inventory entry VM or raw slot state.
  // Used by: inventory table rows, inventory cards, box slots.
  /** @param {HTMLElement} el @param {DecorationSource} source */
  function applyEntryDecorations(el, source) {
    const { status, transferred } = getDecorationState(source);
    if (status.isComplete) el.dataset.border = 'complete';
    else if (status.isPartial) el.dataset.border = 'partial';
    else delete el.dataset.border;
    if ((status.fullTrainedSystems?.length || 0) > 0) el.dataset.trained = 'full';
    else if ((status.readySystems?.length || 0) > 0) el.dataset.trained = 'partial';
    else delete el.dataset.trained;
    el.classList.toggle('transferred', transferred);
  }

  /** @param {Partial<import('./types/contracts.js').BrowserToolbarModel> & {secondaryOpen?: boolean}} [config] */
  function renderBrowserToolbar(config = {}) {
    return FilterToolbarSection.renderBrowserToolbar(config, {
      escapeHtml,
      allTypes: ALL_TYPES,
    });
  }

  // ── EV system badge ────────────────────────────────────

  /** @param {import('./types/contracts.js').EvSystem} evSystem */
  function renderEvSystemBadge(evSystem) {
    return evSystem === 'champions'
      ? '<span class="ev-badge champions">Champions</span>'
      : '<span class="ev-badge classic">Classic</span>';
  }

  // ── Public API ─────────────────────────────────────────

  return {
    STAT_NAMES, ALL_TYPES, ALL_BALLS, DEFAULT_LANGUAGE_CODE, LANGUAGE_OPTIONS,
    ballSpriteUrl, createBallPicker,
    renderEvSystemBadge,
    renderGameBadgesHtml, renderBadgeDotsHtml,
    renderFlagBadgesHtml, renderEntryBadgesHtml, applyEntryDecorations,
    renderNatureOptions, renderLanguageOptions,
    formatSpeciesItem, formatMoveItem, syncAbilitySelect,
    validateEvSpread, spriteImgHtml, spriteWithDotsHtml,
    normalizeDisplayText, escapeHtml, titleCase, pluralize,
    normalizeLanguageCode, getDefaultLanguageCode, getLanguageInfo, getLanguageName, getLanguageBadgeText,
    formatCompactStatSpread, renderStatBars, renderStatRadar, renderMovesList, renderMovePills, renderShowdownPreview,
    createAutocomplete, copyText, flashCopyFeedback,
    summarizeImportable, setImportablePanelOpen, wireImportableSurface, createTeamExportSurface,
    highlightShowdownText, updateSearchEmptyState,
    renderBrowserToolbar,
    showFieldError, clearFieldError,
  };
})();
