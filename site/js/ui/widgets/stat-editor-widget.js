import { EvConvert } from '../../ev-convert.js';

/**
 * ui/widgets/stat-editor-widget.js - Shared stat editor rendering and input wiring.
 */
export const StatEditorWidget = (() => {
  const {
    CHAMPIONS_PER_STAT_CAP = 32,
    CHAMPIONS_TOTAL_CAP = 66,
    CLASSIC_PER_STAT_CAP = 252,
    CLASSIC_TOTAL_CAP = 510,
  } = EvConvert || {};

  /** @param {import('../../types/contracts.js').EvSystem} system */
  function getSpreadConfig(system) {
    return system === 'champions'
      ? { maxEv: CHAMPIONS_PER_STAT_CAP, stepEv: 1, totalEv: CHAMPIONS_TOTAL_CAP }
      : { maxEv: CLASSIC_PER_STAT_CAP, stepEv: 4, totalEv: CLASSIC_TOTAL_CAP };
  }

  /** @param {{
   * activeSystem: import('../../types/contracts.js').EvSystem,
   * baseStats: import('../../types/contracts.js').StatSpread,
   * classicEvs: import('../../types/contracts.js').StatSpread,
   * classicIvs: import('../../types/contracts.js').IvSpread,
   * championsEvs: import('../../types/contracts.js').StatSpread,
   * statNames: Record<import('../../types/contracts.js').StatKey, string>
   * }} model */
  function renderBuildEditor({ activeSystem, baseStats, classicEvs, classicIvs, championsEvs, statNames }) {
    const classicEvsUnknown = Object.values(classicEvs).every((value) => !value);
    const championsEvsUnknown = Object.values(championsEvs).every((value) => !value);
    /** @param {import('../../types/contracts.js').StatKey} key */
    const classicValue = (key) => classicEvsUnknown ? '' : (classicEvs[key] ?? 0);
    /** @param {import('../../types/contracts.js').StatKey} key */
    const classicIvValue = (key) => {
      const value = classicIvs[key];
      return value !== undefined ? value : '';
    };
    /** @param {import('../../types/contracts.js').StatKey} key */
    const championsValue = (key) => championsEvsUnknown ? '' : (championsEvs[key] ?? 0);
    const { maxEv: classicMaxEv, stepEv: classicStepEv, totalEv: classicTotalEv } = getSpreadConfig('classic');
    const { maxEv: championsMaxEv, stepEv: championsStepEv, totalEv: championsTotalEv } = getSpreadConfig('champions');
    const statEntries = /** @type {Array<[import('../../types/contracts.js').StatKey, string]>} */ (Object.entries(statNames));

    return `
      <h3 class="stat-heading">Stats</h3>
      <div class="stat-editor" id="bf-stat-editor" data-system="${activeSystem}">
        <div class="stat-editor__tabs">
          <button type="button" class="stat-editor__tab ${activeSystem === 'classic' ? 'active' : ''}" data-system="classic">Classic</button>
          <button type="button" class="stat-editor__tab ${activeSystem === 'champions' ? 'active' : ''}" data-system="champions">Champions</button>
        </div>
        <div class="stat-editor__panel${activeSystem !== 'classic' ? ' hidden' : ''}" id="bf-panel-classic">
          <div class="stat-editor__header stat-editor__header--classic">
            <span></span><span>Base</span><span></span><span>EVs</span><span>IVs</span><span>Lv50</span>
          </div>
          ${statEntries.map(([key, label]) => `
            <div class="stat-editor__row stat-editor__row--classic">
              <span class="stat-editor__name" data-stat="${key}">${label}</span>
              <span class="stat-editor__base" data-stat="${key}">${baseStats[key] || '–'}</span>
              <input type="range" class="stat-editor__slider" id="bf-cev-slider-${key}" value="${classicValue(key)}" min="0" max="${classicMaxEv}" step="${classicStepEv}" tabindex="-1">
              <input type="number" class="stat-editor__ev" id="bf-cev-${key}" value="${classicValue(key)}" min="0" max="${classicMaxEv}" step="${classicStepEv}" placeholder="?">
              <input type="text" class="stat-editor__iv" id="bf-civ-${key}" value="${classicIvValue(key)}" inputmode="numeric" pattern="[0-9]*" placeholder="?">
              <span class="stat-editor__calc" id="bf-calc-classic-${key}">–</span>
            </div>
          `).join('')}
          <div class="stat-editor__footer" id="bf-cev-footer">
            <span>Remaining: <strong id="bf-cev-remaining">${classicTotalEv}</strong></span>
            <span id="bf-cev-badge"></span>
            <button type="button" class="stat-editor__convert-btn" id="bf-convert-classic-to-champ" title="Convert Classic EVs → Champions SP">→ SP</button>
          </div>
        </div>
        <div class="stat-editor__panel${activeSystem !== 'champions' ? ' hidden' : ''}" id="bf-panel-champions">
          <div class="stat-editor__header stat-editor__header--champions">
            <span></span><span>Base</span><span></span><span>SPs</span><span>Lv50</span>
          </div>
          ${statEntries.map(([key, label]) => `
            <div class="stat-editor__row stat-editor__row--champions">
              <span class="stat-editor__name" data-stat="${key}">${label}</span>
              <span class="stat-editor__base" data-stat="${key}">${baseStats[key] || '–'}</span>
              <input type="range" class="stat-editor__slider" id="bf-xev-slider-${key}" value="${championsValue(key)}" min="0" max="${championsMaxEv}" step="${championsStepEv}" tabindex="-1">
              <input type="number" class="stat-editor__ev" id="bf-xev-${key}" value="${championsValue(key)}" min="0" max="${championsMaxEv}" step="${championsStepEv}" placeholder="?">
              <span class="stat-editor__calc" id="bf-calc-champ-${key}">–</span>
            </div>
          `).join('')}
          <div class="stat-editor__footer" id="bf-xev-footer">
            <span>Remaining: <strong id="bf-xev-remaining">${championsTotalEv}</strong></span>
            <span id="bf-xev-badge"></span>
            <button type="button" class="stat-editor__convert-btn" id="bf-convert-champ-to-classic" title="Convert Champions SP → Classic EVs">→ EVs</button>
          </div>
        </div>
      </div>`;
  }

  /** @param {{
   * prefix: string,
   * system: import('../../types/contracts.js').EvSystem,
   * evs: import('../../types/contracts.js').StatSpread,
   * ivs: import('../../types/contracts.js').IvSpread,
   * statNames: Record<import('../../types/contracts.js').StatKey, string>
   * }} model */
  function renderSpreadFields({ prefix, system, evs, ivs, statNames }) {
    const { maxEv, stepEv, totalEv } = getSpreadConfig(system);
    const statEntries = /** @type {Array<[import('../../types/contracts.js').StatKey, string]>} */ (Object.entries(statNames));
    return `
      <h5 class="stat-heading stat-heading--ev">EVs <span class="form-hint">(0-${maxEv}, total ≤ ${totalEv})</span></h5>
      <div class="form-stat-grid">
        ${statEntries.map(([key, label]) => `
          <div class="form-stat">
            <label>${label}</label>
            <input type="number" class="${prefix}-ev ${prefix}-ev-${key}" value="${evs[key] === '' ? '' : (evs[key] ?? 0)}" min="0" max="${maxEv}" step="${stepEv}">
          </div>
        `).join('')}
      </div>
      <div class="${prefix}-ev-total form-hint"></div>
      ${system === 'classic' ? `
        <h5 class="stat-heading">IVs <span class="form-hint">(0-31)</span></h5>
        <div class="form-stat-grid ${prefix}-ivs-grid">
          ${statEntries.map(([key, label]) => `
            <div class="form-stat">
              <label>${label}</label>
              <input type="number" class="${prefix}-iv ${prefix}-iv-${key}" value="${ivs[key] ?? 31}" min="0" max="31">
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  /**
   * @param {number} total
   * @param {number} maxTotal
   * @param {{totalEl: HTMLElement|null, remainingEl: HTMLElement|null, badgeEl: HTMLElement|null}} elements
   */
  function updateBudgetIndicators(total, maxTotal, { totalEl, remainingEl, badgeEl }) {
    const remaining = Math.max(0, maxTotal - total);
    if (totalEl) {
      totalEl.textContent = `Total: ${total}/${maxTotal}`;
      totalEl.style.color = total > maxTotal ? 'var(--accent-red)' : '';
    }
    if (remainingEl) remainingEl.textContent = String(remaining);
    if (badgeEl) {
      if (total > maxTotal) {
        badgeEl.textContent = `Over by ${total - maxTotal}`;
        badgeEl.className = 'stat-editor__badge stat-editor__badge--bad';
      } else if (remaining === 0) {
        badgeEl.textContent = 'Maxed';
        badgeEl.className = 'stat-editor__badge stat-editor__badge--good';
      } else {
        badgeEl.textContent = '';
        badgeEl.className = 'stat-editor__badge';
      }
    }
    return remaining;
  }

  /**
   * @param {HTMLInputElement[]} inputs
   * @param {{
   * maxPerStat: number,
   * maxTotal: number,
   * totalEl?: HTMLElement|null,
   * remainingEl?: HTMLElement|null,
   * badgeEl?: HTMLElement|null,
   * sliders?: HTMLInputElement[],
   * onUpdate?: ((value: {total: number, remaining: number}) => void)|null
   * }} options
   */
  function createBudgetUpdater(inputs, options) {
    const {
      maxPerStat,
      maxTotal,
      totalEl = null,
      remainingEl = null,
      badgeEl = null,
      sliders = [],
      onUpdate = null,
    } = options;

    return () => {
      let total = 0;
      for (const input of inputs) {
        if (input.value === '') continue;
        let value = parseInt(input.value, 10);
        if (Number.isNaN(value)) value = 0;
        if (value < 0) value = 0;
        if (value > maxPerStat) value = maxPerStat;
        input.value = String(value);
        total += value;
      }

      inputs.forEach((input, index) => {
        const slider = sliders[index];
        if (!slider) return;
        const currentVal = parseInt(input.value, 10) || 0;
        const otherTotal = total - currentVal;
        const maxAllowed = Math.max(0, Math.min(maxPerStat, maxTotal - otherTotal));
        slider.max = String(maxPerStat);
        slider.value = String(Math.min(currentVal, maxAllowed));
        if (currentVal > maxAllowed) {
          input.value = String(maxAllowed);
          total = total - currentVal + maxAllowed;
        }
      });

      const remaining = updateBudgetIndicators(total, maxTotal, { totalEl, remainingEl, badgeEl });
      if (onUpdate) onUpdate({ total, remaining });
    };
  }

  /** @param {HTMLInputElement[]} inputs @param {{allowBlank?: boolean, onChange?: (() => void)|null}} options */
  function bindIvInputs(inputs, { allowBlank = false, onChange = null }) {
    inputs.forEach((input) => {
      input.addEventListener('input', () => {
        const raw = input.value.replace(/[^0-9]/g, '');
        if (raw === '' && allowBlank) {
          input.value = '';
          if (onChange) onChange();
          return;
        }
        let value = parseInt(raw || '0', 10);
        if (Number.isNaN(value)) value = 0;
        if (value > 31) value = 31;
        if (value < 0) value = 0;
        input.value = String(value);
        if (onChange) onChange();
      });
    });
  }

  /** @param {Array<{slider: HTMLInputElement|null, input: HTMLInputElement|null}>} pairs */
  function bindSliderPairs(pairs) {
    pairs.forEach(({ slider, input }) => {
      if (!slider || !input) return;
      slider.addEventListener('input', () => {
        input.value = slider.value;
        input.dispatchEvent(new Event('input'));
      });
      input.addEventListener('input', () => {
        slider.value = input.value;
      });
    });
  }

  return {
    getSpreadConfig,
    renderBuildEditor,
    renderSpreadFields,
    createBudgetUpdater,
    bindIvInputs,
    bindSliderPairs,
  };
})();
