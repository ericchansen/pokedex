/**
 * ui-shared.js — Shared UI utilities, components, and constants.
 * Used by all view modules (home, builds, teams, editor).
 * Must be loaded after data.js and team-export.js.
 */

export const UIShared = (() => {
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

  function normalizeLanguageCode(value) {
    return String(value || '').trim().toUpperCase();
  }

  function getDefaultLanguageCode() {
    const stored = SettingsState?.getDefaultLanguage?.();
    return normalizeLanguageCode(stored) || DEFAULT_LANGUAGE_CODE;
  }

  function getLanguageInfo(code) {
    const normalized = normalizeLanguageCode(code);
    return normalized ? (LANGUAGE_LOOKUP.get(normalized) || null) : null;
  }

  function getLanguageName(code) {
    const info = getLanguageInfo(code);
    return info ? info.label : (normalizeLanguageCode(code) || 'Unknown');
  }

  function getLanguageBadgeText(code) {
    const info = getLanguageInfo(code);
    return info ? info.badge : (normalizeLanguageCode(code) || '');
  }

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
  function renderNatureOptions(selectedNature) {
    return FormFields.renderNatureOptions(selectedNature, { escapeHtml });
  }

  // ── Autocomplete formatters (ONE implementation each) ─
  function formatSpeciesItem(item) {
    return FormFields.formatSpeciesItem(item, { escapeHtml });
  }

  function formatMoveItem(item) {
    return FormFields.formatMoveItem(item, { escapeHtml });
  }

  // ── Ability <select> sync (ONE implementation) ────────
  // Used by: build form, team member form.
  function syncAbilitySelect(selectEl, speciesRef, selectedAbility = '') {
    return FormFields.syncAbilitySelect(selectEl, speciesRef, selectedAbility, { escapeHtml });
  }

  // ── EV/SP validation (ONE implementation) ─────────────
  // system: 'classic' | 'champions'
  // statInputGetter: (statKey) => HTMLInputElement
  // Returns { evs: {hp:N,...}, total:N, errors: [{input, message}] }
  function validateEvSpread(statInputGetter, system) {
    return FormFields.validateEvSpread(statInputGetter, system, { statNames: STAT_NAMES });
  }

  // ── Sprite rendering (ONE implementation) ──────────────
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
  function spriteWithDotsHtml(speciesRef, alt, spriteOpts, dotOpts) {
    const effectiveOpts = { ...(spriteOpts || {}) };
    if (!('shiny' in effectiveOpts) && dotOpts?.shiny) effectiveOpts.shiny = true;
    const img = spriteImgHtml(speciesRef, alt, effectiveOpts);
    if (!dotOpts) return img;
    const dots = renderBadgeDotsHtml(dotOpts);
    if (!dots) return img;
    return `${img}<span class="slot-badge-grid">${dots}</span>`;
  }

  // ── Toast notification (ONE implementation) ───────────
  function showToast(message, durationMs = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }

  // ── Confirm dialog ────────────────────────────────────
  function showConfirm(message, opts = {}) {
    const { title = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', detail = '' } = opts;
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-backdrop';

      const modal = document.createElement('div');
      modal.className = 'dialog-modal';
      modal.setAttribute('role', 'alertdialog');
      modal.setAttribute('aria-modal', 'true');

      let html = '';
      if (title) html += `<div class="dialog-title">${escapeHtml(title)}</div>`;
      html += `<div class="dialog-body">`;
      html += `<p class="dialog-message">${escapeHtml(message)}</p>`;
      if (detail) html += `<p class="dialog-detail">${escapeHtml(detail)}</p>`;
      html += `</div>`;
      html += `<div class="dialog-actions">
        <button class="btn dialog-cancel">${escapeHtml(cancelLabel)}</button>
        <button class="btn btn-primary dialog-confirm">${escapeHtml(confirmLabel)}</button>
      </div>`;
      modal.innerHTML = html;
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => overlay.classList.add('dialog-backdrop--visible'));

      const confirmBtn = modal.querySelector('.dialog-confirm');
      const cancelBtn = modal.querySelector('.dialog-cancel');
      confirmBtn.focus();

      function close(result) {
        overlay.classList.remove('dialog-backdrop--visible');
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      }

      confirmBtn.addEventListener('click', () => close(true));
      cancelBtn.addEventListener('click', () => close(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { close(false); return; }
        if (e.key === 'Tab') {
          const focusable = [...modal.querySelectorAll('button')];
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
    });
  }

  // ── Prompt dialog ─────────────────────────────────────
  function showPrompt(message, defaultValue = '', opts = {}) {
    const { placeholder = '', label = '' } = opts;
    return new Promise((resolve) => {
      const inputId = `dialog-input-${Date.now()}`;
      const overlay = document.createElement('div');
      overlay.className = 'dialog-backdrop';

      const modal = document.createElement('div');
      modal.className = 'dialog-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      let html = `<div class="dialog-body">`;
      if (label) html += `<label for="${escapeHtml(inputId)}" class="dialog-label">${escapeHtml(label)}</label>`;
      else html += `<p class="dialog-message">${escapeHtml(message)}</p>`;
      html += `<input id="${escapeHtml(inputId)}" class="dialog-input" type="text" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off">`;
      html += `</div>`;
      html += `<div class="dialog-actions">
        <button class="btn dialog-cancel">Cancel</button>
        <button class="btn btn-primary dialog-confirm">OK</button>
      </div>`;
      modal.innerHTML = html;
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => overlay.classList.add('dialog-backdrop--visible'));

      const input = modal.querySelector('.dialog-input');
      const confirmBtn = modal.querySelector('.dialog-confirm');
      const cancelBtn = modal.querySelector('.dialog-cancel');
      input.focus();
      input.select();

      function close(result) {
        overlay.classList.remove('dialog-backdrop--visible');
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      }

      confirmBtn.addEventListener('click', () => close(input.value));
      cancelBtn.addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') close(input.value);
        if (e.key === 'Escape') close(null);
      });
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close(null);
      });
    });
  }

  // ── Ball picker wrappers ───────────────────────────────

  function ballSpriteUrl(ballName) {
    return BallPicker.ballSpriteUrl(ballName);
  }

  function createBallPicker(container, selectedBall, onChange) {
    return BallPicker.createBallPicker(container, selectedBall, onChange);
  }

  // ── Text utilities ─────────────────────────────────────

  function normalizeDisplayText(value) {
    return String(value ?? '')
      .replace(/\u00e2\u20ac\u201d/g, '\u2014')
      .replace(/\u00e2\u20ac\u201c/g, '\u2013')
      .replace(/\u00e2\u20ac\u0153/g, '\u201c')
      .replace(/\u00e2\u20ac\u009d/g, '\u201d')
      .replace(/\u00e2\u20ac\u2122/g, '\u2019');
  }

  function escapeHtml(value) {
    return normalizeDisplayText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function titleCase(value) {
    return String(value || '')
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function pluralize(count, singular, plural = `${singular}s`) {
    return count === 1 ? singular : plural;
  }

  // ── Stat formatting ────────────────────────────────────

  function formatCompactStatSpread(stats, fallback = 'Not provided') {
    const parts = Object.entries(STAT_NAMES)
      .map(([key, label]) => {
        const value = Number(stats?.[key] ?? 0);
        return value > 0 ? `${value} ${label}` : null;
      })
      .filter(Boolean);

    return parts.length ? parts.join(' / ') : fallback;
  }

  function renderStatBars(stats, kind = 'ev') {
    const cssClass = kind === 'champions-ev' ? 'ev' : kind;
    const maxValue = kind === 'iv' ? 31 : kind === 'base' ? 255 : kind === 'final' ? 300 : kind === 'champions-ev' ? 32 : 252;
    const isEvKind = kind === 'ev' || kind === 'champions-ev';
    // EVs use all-or-nothing unknown: if every stat is 0/null/undefined, the whole spread is unknown
    const allEvsUnknown = isEvKind && Object.keys(STAT_NAMES).every(k => {
      const v = stats?.[k];
      return v === null || v === undefined || v === 0;
    });
    let html = '<div class="stat-bars">';
    for (const [key, label] of Object.entries(STAT_NAMES)) {
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
      const bst = Object.values(stats || {}).reduce((s, v) => s + Number(v || 0), 0);
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
  let _statColorCache = null;

  function getStatColor(stat) {
    if (!_statColorCache) {
      const styles = getComputedStyle(document.documentElement);
      _statColorCache = {};
      for (const [key, fallback] of Object.entries(DEFAULT_STAT_COLORS)) {
        _statColorCache[key] = styles.getPropertyValue(`--stat-${key}`).trim() || fallback;
      }
    }
    return _statColorCache[stat] || DEFAULT_STAT_COLORS[stat];
  }

  function renderStatRadar(stats, kind = 'ev') {
    // In-game hexagon order: HP, Atk, Def, Spe, SpD, SpA (clockwise from top)
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

    const ang = i => (2 * Math.PI * i) / n - Math.PI / 2;
    const xy = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const pt = (a, r) => { const [x, y] = xy(a, r); return `${x.toFixed(1)},${y.toFixed(1)}`; };
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

  function renderShowdownPreview(build) {
    const text = TeamExportFormatter.formatMember(build);
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

  function createAutocomplete(input, searchFn, { onSelect, formatItem } = {}) {
    return AutocompleteWidget.create(input, searchFn, { onSelect, formatItem, escapeHtml });
  }

  // ── Clipboard utilities ────────────────────────────────

  async function copyText(text, textarea) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard copy failed');
    }
  }

  /**
   * Copy text to clipboard and flash feedback on a button.
   * @param {string} text - Text to copy.
   * @param {HTMLElement} button - Button element to flash.
   * @param {object} [opts] - Options: successText, failText, cssClass, errorClass, duration, textarea, onError, onSuccess.
   */
  async function flashCopyFeedback(text, button, opts = {}) {
    const {
      successText = 'Copied!',
      failText = 'Failed',
      cssClass = 'is-copied',
      errorClass = 'is-error',
      duration = 1500,
      textarea = document.createElement('textarea'),
      onError = null,
      onSuccess = null,
    } = opts;
    const original = button.textContent;
    button.classList.remove(cssClass, errorClass);
    try {
      await copyText(text, textarea);
      button.textContent = successText;
      button.classList.add(cssClass);
      if (typeof onSuccess === 'function') onSuccess();
    } catch (error) {
      button.textContent = failText;
      button.classList.add(errorClass);
      if (typeof onError === 'function') onError(error);
    }
    window.clearTimeout(button._resetTimer);
    button._resetTimer = setTimeout(() => {
      button.textContent = original;
      button.classList.remove(cssClass, errorClass);
    }, duration);
  }

  // ── Panel management ───────────────────────────────────

  let _panelBeforeClose = null;
  let _panelReturnFocus = null;

  function openPanel(html, opts = {}) {
    const panel = document.getElementById('detail-panel');
    const overlay = document.getElementById('detail-overlay');
    const content = document.getElementById('detail-content');

    if (!panel.classList.contains('open')) _panelReturnFocus = document.activeElement;
    _panelBeforeClose = opts.onBeforeClose || null;
    content.innerHTML = html;
    panel.classList.add('open');
    overlay.classList.add('open');
    if (typeof AppStore !== 'undefined') AppStore.setDetailOpen(true);
    return content;
  }

  async function closePanel({ skipBeforeClose = false } = {}) {
    if (!skipBeforeClose && _panelBeforeClose) {
      try { await _panelBeforeClose(); } catch (err) { console.error('Panel beforeClose error', err); }
    }
    const returnFocus = _panelReturnFocus;
    _panelBeforeClose = null;
    _panelReturnFocus = null;
    document.getElementById('detail-panel').classList.remove('open');
    document.getElementById('detail-overlay').classList.remove('open');
    document.getElementById('detail-content').innerHTML = '';
    if (typeof AppStore !== 'undefined') AppStore.setDetailOpen(false);
    if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
  }

  // ── Export surface utilities ────────────────────────────

  function summarizeImportable(exportText) {
    const blocks = exportText
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean);
    const firstLine = blocks[0]?.split('\n')[0]?.trim() || 'No importable text yet.';
    return blocks.length > 1 ? `${firstLine} + ${blocks.length - 1} more` : firstLine;
  }

  function setImportablePanelOpen(container, isOpen, closedLabel = 'View importable') {
    container.classList.toggle('is-open', isOpen);
    const panel = container.querySelector('.team-export-panel');
    const toggleButton = container.querySelector('.team-export-toggle');
    if (panel) {
      panel.hidden = !isOpen;
    }
    if (toggleButton) {
      toggleButton.textContent = isOpen ? 'Hide importable' : closedLabel;
    }
  }

  function wireImportableSurface(container, { exportText, copyLabel, toggleLabel }) {
    const textarea = container.querySelector('.team-export-text');
    const copyButton = container.querySelector('.team-export-copy');
    const toggleButton = container.querySelector('.team-export-toggle');
    if (!textarea || !copyButton) return;

    textarea.value = exportText;
    if (toggleButton) {
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

  function showFieldError(input, message) {
    clearFieldError(input);
    input.classList.add('field-error');
    const err = document.createElement('div');
    err.className = 'field-error-msg';
    err.textContent = message;
    input.parentElement.appendChild(err);
    // Auto-clear on next input/change
    const handler = () => { clearFieldError(input); input.removeEventListener('input', handler); input.removeEventListener('change', handler); };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  }

  function clearFieldError(input) {
    input.classList.remove('field-error');
    const existing = input.parentElement.querySelector('.field-error-msg');
    if (existing) existing.remove();
  }

  // ── Flag badges (ONE implementation) ───────────────────
  // Renders flag pill badges: shiny, genned, champions, gmax, alpha, event.
  // Used by: inventory cards, inventory table, build summary, detail viewer.
  // state = any object with shiny/genned/transferred_to_champions/gigantamax/alpha/event_origin flags.
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
  function renderEntryBadgesHtml(entry, opts = {}) {
    const compact = !!opts.compact;
    const badgeEntry = entry?.decorations?.badgeEntry || entry || {};
    const parts = [
      renderGameBadgesHtml(badgeEntry.slug, {
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
  function applyEntryDecorations(el, source) {
    const { status, transferred } = getDecorationState(source);
    if (status.isComplete) el.dataset.border = 'complete';
    else if (status.isPartial) el.dataset.border = 'partial';
    else delete el.dataset.border;
    if (status.fullTrainedSystems?.length > 0) el.dataset.trained = 'full';
    else if (status.readySystems?.length > 0) el.dataset.trained = 'partial';
    else delete el.dataset.trained;
    el.classList.toggle('transferred', transferred);
  }

  function renderBrowserToolbar(config = {}) {
    return FilterToolbarSection.renderBrowserToolbar(config, {
      escapeHtml,
      allTypes: ALL_TYPES,
    });
  }

  // ── EV system badge ────────────────────────────────────

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
    validateEvSpread, spriteImgHtml, spriteWithDotsHtml, showToast,
    normalizeDisplayText, escapeHtml, titleCase, pluralize,
    normalizeLanguageCode, getDefaultLanguageCode, getLanguageInfo, getLanguageName, getLanguageBadgeText,
    formatCompactStatSpread, renderStatBars, renderStatRadar, renderMovesList, renderMovePills, renderShowdownPreview,
    createAutocomplete, copyText, flashCopyFeedback,
    openPanel, closePanel,
    summarizeImportable, setImportablePanelOpen, wireImportableSurface, createTeamExportSurface,
    highlightShowdownText, updateSearchEmptyState,
    renderBrowserToolbar,
    showFieldError, clearFieldError,
    showConfirm, showPrompt,
  };
})();

if (typeof window !== 'undefined') {
  window.UIShared = UIShared;
}
