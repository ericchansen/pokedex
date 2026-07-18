/**
 * ui/widgets/form-fields.js - Shared form-field widgets and validation helpers.
 */
import { DataManager } from '../../data.js';
import { escapeHtml } from '../dom.js';

export const FormFields = (() => {
  /** @typedef {{escapeHtml?: (value: string) => string}} EscapeDependency */
  /** @param {string} selectedNature @param {EscapeDependency} [deps] */
  function renderNatureOptions(selectedNature, deps = {}) {
    const escape = deps.escapeHtml || escapeHtml;
    return '<option value="">-- Select --</option>' +
      DataManager.getNatures().map((nature) => {
        const info = nature.plus && nature.minus ? ` (+${nature.plus}, -${nature.minus})` : ' (Neutral)';
        return `<option value="${escape(nature.name)}" ${nature.name === selectedNature ? 'selected' : ''}>${escape(nature.name)}${info}</option>`;
      }).join('');
  }

  /** @param {import('../../types/contracts.js').PokedexEntry} item @param {EscapeDependency} [deps] */
  function formatSpeciesItem(item, deps = {}) {
    const escape = deps.escapeHtml || escapeHtml;
    return `<span class="ac-type-dot type-${(item.types?.[0] || '').toLowerCase()}"></span>${escape(item.name)} <span class="autocomplete-hint">#${item.num}</span>`;
  }

  /** @param {import('../../types/contracts.js').ReferenceItem} item @param {EscapeDependency} [deps] */
  function formatMoveItem(item, deps = {}) {
    const escape = deps.escapeHtml || escapeHtml;
    const eggHint = item?.isEggMove ? '<span class="autocomplete-hint">🥚 Egg</span>' : '';
    return `<span class="ac-type-dot type-${(item.type || '').toLowerCase()}"></span>${escape(item.name)}${eggHint}`;
  }

  /**
   * @param {HTMLSelectElement|null} selectEl
   * @param {import('../../types/contracts.js').InputValue} speciesRef
   * @param {string} [selectedAbility]
   * @param {EscapeDependency} [deps]
   */
  function syncAbilitySelect(selectEl, speciesRef, selectedAbility = '', deps = {}) {
    const escape = deps.escapeHtml || escapeHtml;
    if (!selectEl) {
      return { abilities: [], value: '', slug: '' };
    }

    const rawSpecies = String(speciesRef || '').trim();
    const resolved = rawSpecies ? DataManager.resolveSpecies(rawSpecies) : null;
    const slug = resolved?.entry ? resolved.slug : '';
    const abilities = slug ? DataManager.getAbilitiesForSpecies(slug) : [];

    let value = String(selectedAbility || '').trim();
    if (!value && abilities.length === 1) value = abilities[0];
    if (abilities.length === 1 && value && !abilities.includes(value)) value = abilities[0];

    const placeholder = abilities.length
      ? '-- Select --'
      : (rawSpecies ? '-- No abilities found --' : '-- Select species first --');
    const options = [`<option value="">${escape(placeholder)}</option>`];
    // "---" = no ability (games without abilities, e.g. Legends: Arceus)
    options.push('<option value="---">\u2014</option>');

    for (const ability of abilities) {
      const label = DataManager.isHiddenAbility(slug, ability) ? `${ability} (HA)` : ability;
      options.push(`<option value="${escape(ability)}">${escape(label)}</option>`);
    }

    if (value && !abilities.includes(value) && value !== '---') {
      options.push(`<option value="${escape(value)}">${escape(value)}</option>`);
    }

    selectEl.innerHTML = options.join('');
    selectEl.value = value;
    selectEl.disabled = options.length === 1 && !value;

    return { abilities, value: selectEl.value, slug };
  }

  /**
   * @param {(key: import('../../types/contracts.js').StatKey) => HTMLInputElement} statInputGetter
   * @param {import('../../types/contracts.js').EvSystem} system
   * @param {{statNames?: Record<import('../../types/contracts.js').StatKey, string>}} [deps]
   */
  function validateEvSpread(statInputGetter, system, deps = {}) {
    const statNames = deps.statNames || { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
    const limits = system === 'champions'
      ? { perStat: 32, total: 66, label: 'Champions' }
      : { perStat: 252, total: 510, label: 'Classic' };
    /** @type {import('../../types/contracts.js').StatSpread} */
    const evs = {};
    /** @type {Array<{input: HTMLInputElement, message: string}>} */
    const errors = [];

    for (const key of /** @type {import('../../types/contracts.js').StatKey[]} */ (Object.keys(statNames))) {
      const input = statInputGetter(key);
      if (input.value.trim() === '') continue;
      const value = Number(input.value) || 0;
      evs[key] = value;
      if (value > limits.perStat) {
        errors.push({ input, message: `Max ${limits.perStat}` });
      }
    }

    let total = 0;
    for (const value of Object.values(evs)) total += Number(value || 0);
    if (total > limits.total) {
      const firstInput = /** @type {import('../../types/contracts.js').StatKey[]} */ (Object.keys(statNames))
        .map((key) => statInputGetter(key))
        .find((input) => Number(input.value) > 0);
      if (firstInput && !errors.some((error) => error.input === firstInput)) {
        errors.push({ input: firstInput, message: `${limits.label} EV total ${total} exceeds max ${limits.total}` });
      }
    }

    return { evs, total, errors };
  }

  return {
    renderNatureOptions,
    formatSpeciesItem,
    formatMoveItem,
    syncAbilitySelect,
    validateEvSpread,
  };
})();
