/**
 * ui/widgets/form-fields.js - Shared form-field widgets and validation helpers.
 */
const FormFields = (() => {
  function renderNatureOptions(selectedNature, deps = {}) {
    const escapeHtml = deps.escapeHtml || UIShared.escapeHtml;
    return '<option value="">-- Select --</option>' +
      DataManager.getNatures().map((nature) => {
        const info = nature.plus && nature.minus ? ` (+${nature.plus}, -${nature.minus})` : ' (Neutral)';
        return `<option value="${escapeHtml(nature.name)}" ${nature.name === selectedNature ? 'selected' : ''}>${escapeHtml(nature.name)}${info}</option>`;
      }).join('');
  }

  function formatSpeciesItem(item, deps = {}) {
    const escapeHtml = deps.escapeHtml || UIShared.escapeHtml;
    return `<span class="ac-type-dot type-${(item.types?.[0] || '').toLowerCase()}"></span>${escapeHtml(item.name)} <span class="autocomplete-hint">#${item.num}</span>`;
  }

  function formatMoveItem(item, deps = {}) {
    const escapeHtml = deps.escapeHtml || UIShared.escapeHtml;
    const eggHint = item?.isEggMove ? '<span class="autocomplete-hint">🥚 Egg</span>' : '';
    return `<span class="ac-type-dot type-${(item.type || '').toLowerCase()}"></span>${escapeHtml(item.name)}${eggHint}`;
  }

  function syncAbilitySelect(selectEl, speciesRef, selectedAbility = '', deps = {}) {
    const escapeHtml = deps.escapeHtml || UIShared.escapeHtml;
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
    const options = [`<option value="">${escapeHtml(placeholder)}</option>`];
    // "---" = no ability (games without abilities, e.g. Legends: Arceus)
    options.push('<option value="---">\u2014</option>');

    for (const ability of abilities) {
      const label = DataManager.isHiddenAbility(slug, ability) ? `${ability} (HA)` : ability;
      options.push(`<option value="${escapeHtml(ability)}">${escapeHtml(label)}</option>`);
    }

    if (value && !abilities.includes(value) && value !== '---') {
      options.push(`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
    }

    selectEl.innerHTML = options.join('');
    selectEl.value = value;
    selectEl.disabled = options.length === 1 && !value;

    return { abilities, value: selectEl.value, slug };
  }

  function validateEvSpread(statInputGetter, system, deps = {}) {
    const statNames = deps.statNames || { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
    const limits = system === 'champions'
      ? { perStat: 32, total: 66, label: 'Champions' }
      : { perStat: 252, total: 510, label: 'Classic' };
    const evs = {};
    const errors = [];

    for (const key of Object.keys(statNames)) {
      const input = statInputGetter(key);
      const value = Number(input.value) || 0;
      evs[key] = value;
      if (value > limits.perStat) {
        errors.push({ input, message: `Max ${limits.perStat}` });
      }
    }

    const total = Object.values(evs).reduce((sum, value) => sum + value, 0);
    if (total > limits.total) {
      const firstInput = Object.keys(statNames)
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

if (typeof window !== 'undefined') {
  window.FormFields = FormFields;
}
