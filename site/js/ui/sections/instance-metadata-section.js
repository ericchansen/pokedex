/**
 * ui/sections/instance-metadata-section.js
 *
 * Data-driven inline metadata editor for inventory instances.
 * Fields appear/hide based on species capabilities from pokedex data.
 * Saves on change via DataManager.updateSlotIdentityField / updateSlotBuild.
 */
const InstanceMetadataSection = (() => {
  const { escapeHtml } = UIShared;

  const FLAG_DEFS = [
    { key: 'shiny',        label: 'Shiny' },
    { key: 'gigantamax',   label: 'G-Max',      visibleIf: 'gmax' },
    { key: 'alpha',        label: 'Alpha' },
    { key: 'genned',       label: 'Genned' },
    { key: 'event_origin', label: 'Event' },
    { key: 'from_go',      label: 'GO' },
    { key: 'ev_guesstimate', label: 'EV Guess' },
    { key: 'transferred_to_champions', label: 'Champions' },
  ];

  /**
   * Render the metadata section HTML.
   * @param {object} opts
   * @param {object} opts.state       Flat instance state (build+identity merged)
   * @param {string} opts.speciesSlug Species slug for pokedex lookup
   * @param {number} opts.boxId
   * @param {number} opts.slotIdx
   * @returns {string} HTML string
   */
  function render({ state, speciesSlug, boxId, slotIdx }) {
    if (!state) return '';
    const speciesEntry = SpeciesQueries.getPokedexEntry(speciesSlug);
    const forms = SpeciesQueries.getFormsForSpecies(speciesSlug);
    const gmaxEligible = SpeciesQueries.isGmaxEligible(speciesSlug);
    const genderInfo = speciesEntry?.gender || null;

    let html = '<div class="instance-metadata" data-box="' + boxId + '" data-slot="' + slotIdx + '">';
    html += '<h4 class="instance-metadata__title">Instance Details</h4>';
    html += '<div class="instance-metadata__grid">';

    // Form selector (only if species has alternate forms)
    if (forms.length > 0) {
      html += '<div class="instance-metadata__field">';
      html += '<label class="instance-metadata__label">Form</label>';
      html += '<select class="instance-metadata__select" data-field="form">';
      // Match current species by slug (collapsed) for reliable comparison
      const currentSlug = SpeciesResolver.normalizeCollapsedSlug(speciesSlug);
      for (const f of forms) {
        const selected = (f.slug === currentSlug) ? ' selected' : '';
        const displayName = f.forme ? f.forme : 'Base';
        html += '<option value="' + escapeHtml(f.name) + '"' + selected + '>' + escapeHtml(displayName) + '</option>';
      }
      html += '</select>';
      html += '</div>';
    }

    // Gender toggle
    if (genderInfo !== 'N') {
      const isLocked = (genderInfo === 'M' || genderInfo === 'F');
      const currentGender = state.gender || '';
      html += '<div class="instance-metadata__field">';
      html += '<label class="instance-metadata__label">Gender</label>';
      if (isLocked) {
        html += '<span class="instance-metadata__locked">' + escapeHtml(genderInfo === 'M' ? '♂' : '♀') + '</span>';
      } else {
        html += '<div class="instance-metadata__gender-toggle" data-field="gender">';
        html += '<button type="button" class="gender-btn' + (currentGender === 'M' ? ' active' : '') + '" data-value="M" title="Male">♂</button>';
        html += '<button type="button" class="gender-btn' + (currentGender === 'F' ? ' active' : '') + '" data-value="F" title="Female">♀</button>';
        html += '</div>';
      }
      html += '</div>';
    } else {
      // Genderless — show em dash
      html += '<div class="instance-metadata__field">';
      html += '<label class="instance-metadata__label">Gender</label>';
      html += '<span class="instance-metadata__locked">—</span>';
      html += '</div>';
    }

    // Ball picker placeholder (will be enhanced with BallPicker widget after mount)
    html += '<div class="instance-metadata__field">';
    html += '<label class="instance-metadata__label">Ball</label>';
    html += '<div class="instance-metadata__ball-slot" data-field="ball" data-current="' + escapeHtml(state.ball || 'Poke') + '"></div>';
    html += '</div>';

    // Flag toggles
    for (const flag of FLAG_DEFS) {
      if (flag.visibleIf === 'gmax' && !gmaxEligible) continue;
      const checked = !!state[flag.key];
      html += '<div class="instance-metadata__field instance-metadata__field--flag">';
      html += '<label class="instance-metadata__label">';
      html += '<input type="checkbox" class="instance-metadata__checkbox" data-field="' + flag.key + '"' + (checked ? ' checked' : '') + '>';
      html += ' ' + escapeHtml(flag.label);
      html += '</label>';
      html += '</div>';
    }

    html += '</div>'; // grid
    html += '</div>'; // instance-metadata
    return html;
  }

  /**
   * Mount event handlers on the rendered section.
   * Call after inserting render() HTML into the DOM.
   * @param {HTMLElement} container  Parent element containing .instance-metadata
   */
  function mount(container) {
    const section = container.querySelector('.instance-metadata');
    if (!section) return;
    const boxId = Number(section.dataset.box);
    const slotIdx = Number(section.dataset.slot);

    // Form change → re-place the slot with the new species
    const formSelect = section.querySelector('[data-field="form"]');
    if (formSelect) {
      formSelect.addEventListener('change', async () => {
        const newSlug = formSelect.value;
        const instance = DataManager.getInstance(boxId, slotIdx);
        if (!instance) return;
        // Re-place with new species slug, preserving state and target build
        await DataManager.placeInSlot(boxId, slotIdx, newSlug, instance.target_build_id || null, {
          ...(instance.state || {}),
        });
        _dispatchChange(boxId, slotIdx);
      });
    }

    // Gender toggle
    const genderToggle = section.querySelector('[data-field="gender"]');
    if (genderToggle) {
      for (const btn of genderToggle.querySelectorAll('.gender-btn')) {
        btn.addEventListener('click', async () => {
          const currentGender = (DataManager.getInstance(boxId, slotIdx)?.state?.gender) || '';
          const newGender = btn.dataset.value === currentGender ? '' : btn.dataset.value;
          await DataManager.updateSlotIdentityField(boxId, slotIdx, 'gender', newGender);
          // Update active state visually
          for (const b of genderToggle.querySelectorAll('.gender-btn')) {
            b.classList.toggle('active', b.dataset.value === newGender);
          }
          _dispatchChange(boxId, slotIdx);
        });
      }
    }

    // Ball picker widget
    const ballSlot = section.querySelector('[data-field="ball"]');
    if (ballSlot && typeof BallPicker !== 'undefined') {
      const current = ballSlot.dataset.current || 'Poke';
      BallPicker.createBallPicker(ballSlot, current, async (ball) => {
        await DataManager.updateSlotIdentityField(boxId, slotIdx, 'ball', ball);
        _dispatchChange(boxId, slotIdx);
      });
    }

    // Flag checkboxes
    for (const cb of section.querySelectorAll('.instance-metadata__checkbox')) {
      cb.addEventListener('change', async () => {
        const field = cb.dataset.field;
        await DataManager.updateSlotIdentityField(boxId, slotIdx, field, cb.checked);
        _dispatchChange(boxId, slotIdx);
      });
    }
  }

  function _dispatchChange(boxId, slotIdx) {
    document.dispatchEvent(new CustomEvent('instance-metadata-changed', {
      detail: { boxId, slotIdx },
    }));
  }

  return { render, mount };
})();

if (typeof window !== 'undefined') {
  window.InstanceMetadataSection = InstanceMetadataSection;
}
