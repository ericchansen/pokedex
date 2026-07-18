import { DataManager } from '../../data.js';
import { SpeciesQueries } from '../../data/species-queries.js';
import { FormMetadata } from '../../form-metadata.js';
import { SpeciesResolver } from '../../species-resolver.js';
import { UIShared } from '../../ui-shared.js';
import { BallPicker } from '../widgets/ball-picker.js';

/**
 * ui/sections/instance-metadata-section.js
 *
 * Data-driven metadata editor for inventory instances.
 * Fields appear/hide based on species capabilities from pokedex data.
 *
 * Modes:
 *   'inline' — saves on change via DataManager (viewer quick-edit UX)
 *   'edit'   — fires onChange callback; no DataManager calls (build editor UX)
 *
 * Usage (inline, viewer):
 *   container.innerHTML = InstanceMetadataSection.render({ state, speciesSlug, boxId, slotIdx });
 *   InstanceMetadataSection.mount(container);
 *
 * Usage (edit, build editor):
 *   container.innerHTML = InstanceMetadataSection.render({ state, speciesSlug, mode: 'edit' });
 *   const handle = InstanceMetadataSection.mount(container, { mode: 'edit', onChange: () => markDirty() });
 *   // handle.collectValues(speciesSlug) → { gender, level, nickname, ot, origin_game, language, shiny, ... }
 *   // handle.populate(state, { onlyIfEmpty }) → sets field values
 */
export const InstanceMetadataSection = (() => {
  const { escapeHtml } = UIShared;

  const ORIGIN_GAMES = ['Scarlet', 'Violet', 'Legends: Arceus', 'Legends: Z-A', 'Sword', 'Shield', 'Champions'];

  /** @type {Array<{key: keyof import('../../types/contracts.js').BuildState, label: string, visibleIf?: string}>} */
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
   * @param {import('../../types/contracts.js').BuildState} opts.state Flat instance state (build+identity merged)
   * @param {string} opts.speciesSlug   Species slug for pokedex lookup
   * @param {number} [opts.boxId]       Required for inline mode
   * @param {number} [opts.slotIdx]     Required for inline mode
   * @param {'inline'|'edit'} [opts.mode='inline']  Wiring mode
   * @returns {string} HTML string
   */
  function render({ state, speciesSlug, boxId, slotIdx, mode = 'inline' }) {
    if (!state) return '';
    const speciesEntry = SpeciesQueries.getPokedexEntry(speciesSlug);
    const forms = SpeciesQueries.getFormsForSpecies(speciesSlug);
    const gmaxEligible = SpeciesQueries.isGmaxEligible(speciesSlug);
    const genderLock = FormMetadata.getLock(speciesSlug, {
      speciesGender: speciesEntry?.gender,
    }).gender || null;
    const genderInfo = genderLock?.value || speciesEntry?.gender || null;

    const dataAttrs = mode === 'inline'
      ? ` data-box="${boxId}" data-slot="${slotIdx}"`
      : '';

    let html = `<div class="instance-metadata" data-mode="${mode}"${dataAttrs}>`;
    html += '<h4 class="instance-metadata__title">Instance Details</h4>';
    html += '<div class="instance-metadata__grid">';

    // Form selector: inline mode only — edit mode uses the editor's species autocomplete
    if (mode === 'inline' && forms.length > 0) {
      html += '<div class="instance-metadata__field">';
      html += '<label class="instance-metadata__label">Form</label>';
      html += '<select class="instance-metadata__select" data-field="form">';
      const currentSlug = SpeciesResolver.normalizeCollapsedSlug(speciesSlug);
      for (const f of forms) {
        const selected = (f.slug === currentSlug) ? ' selected' : '';
        const displayName = f.forme ? f.forme : 'Base';
        html += `<option value="${escapeHtml(f.name)}"${selected}>${escapeHtml(displayName)}</option>`;
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
        html += `<span class="instance-metadata__locked"${genderLock?.reason ? ` title="${escapeHtml(genderLock.reason)}"` : ''}>${escapeHtml(genderLock?.display || (genderInfo === 'M' ? '♂' : '♀'))}</span>`;
      } else {
        html += `<div class="instance-metadata__gender-toggle" data-field="gender" data-value="${escapeHtml(currentGender)}">`;
        html += `<button type="button" class="gender-btn${currentGender === 'M' ? ' active' : ''}" data-value="M" title="Male">♂</button>`;
        html += `<button type="button" class="gender-btn${currentGender === 'F' ? ' active' : ''}" data-value="F" title="Female">♀</button>`;
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

    // Ball picker (shown in both modes)
    html += '<div class="instance-metadata__field">';
    html += '<label class="instance-metadata__label">Ball</label>';
    html += `<div class="instance-metadata__ball-slot" data-field="ball" data-current="${escapeHtml(state.ball || 'Poke')}"></div>`;
    html += '</div>';

    // Flag toggles
    for (const flag of FLAG_DEFS) {
      if (flag.visibleIf === 'gmax' && !gmaxEligible) continue;
      const checked = !!state[flag.key];
      html += '<div class="instance-metadata__field instance-metadata__field--flag">';
      html += '<label class="instance-metadata__label">';
      html += `<input type="checkbox" class="instance-metadata__checkbox" data-field="${flag.key}"${checked ? ' checked' : ''}>`;
      html += ` ${escapeHtml(flag.label)}`;
      html += '</label>';
      html += '</div>';
    }

    // Registry-driven metadata controls (cream/sweet for Alcremie, future species-specific fields)
    if (typeof FormMetadata !== 'undefined') {
      const metaControls = FormMetadata.getPlacementControls(speciesSlug);
      for (const ctrl of metaControls) {
        if (ctrl.key === 'gender') continue; // handled above with species-aware locking
        const currentVal = state[ctrl.key] || '';
        const label = escapeHtml(ctrl.key.charAt(0).toUpperCase() + ctrl.key.slice(1));
        html += '<div class="instance-metadata__field">';
        html += `<label class="instance-metadata__label">${label}</label>`;
        if (ctrl.type === 'select') {
          html += `<select class="instance-metadata__select" data-meta-field="${escapeHtml(ctrl.key)}">`;
          html += '<option value="">—</option>';
          for (const opt of ctrl.options) {
            const selected = (opt === currentVal) ? ' selected' : '';
            html += `<option value="${escapeHtml(opt)}"${selected}>${escapeHtml(opt)}</option>`;
          }
          html += '</select>';
        } else if (ctrl.type === 'toggle') {
          html += `<div class="instance-metadata__gender-toggle" data-meta-field="${escapeHtml(ctrl.key)}" data-value="${escapeHtml(currentVal)}">`;
          for (let i = 0; i < ctrl.options.length; i++) {
            const opt = ctrl.options[i];
            const lbl = ctrl.labels ? ctrl.labels[i] : opt;
            const active = (opt === currentVal) ? ' active' : '';
            html += `<button type="button" class="gender-btn${active}" data-value="${escapeHtml(opt)}">${escapeHtml(lbl)}</button>`;
          }
          html += '</div>';
        }
        html += '</div>';
      }
    }

    // Edit-mode fields: Level, Nickname, OT, Origin Game, Language
    if (mode === 'edit') {
      html += `<div class="instance-metadata__field">
        <label class="instance-metadata__label">Level</label>
        <input type="number" class="instance-metadata__input" data-field="level" min="1" max="100" placeholder="?" value="${escapeHtml(String(state.level || ''))}">
      </div>`;
      html += `<div class="instance-metadata__field">
        <label class="instance-metadata__label">Nickname</label>
        <input type="text" class="instance-metadata__input" data-field="nickname" placeholder="None" value="${escapeHtml(state.nickname || '')}">
      </div>`;
      html += `<div class="instance-metadata__field">
        <label class="instance-metadata__label">OT</label>
        <input type="text" class="instance-metadata__input" data-field="ot" placeholder="None" value="${escapeHtml(state.ot || '')}">
      </div>`;

      html += '<div class="instance-metadata__field">';
      html += '<label class="instance-metadata__label">Origin Game</label>';
      html += '<select class="instance-metadata__select" data-field="origin_game">';
      html += '<option value="">Unknown</option>';
      for (const game of ORIGIN_GAMES) {
        const selected = (state.origin_game === game) ? ' selected' : '';
        html += `<option value="${escapeHtml(game)}"${selected}>${escapeHtml(game)}</option>`;
      }
      html += '</select>';
      html += '</div>';

      html += '<div class="instance-metadata__field">';
      html += '<label class="instance-metadata__label">Language</label>';
      html += `<select class="instance-metadata__select" data-field="language">${UIShared.renderLanguageOptions(state.language, { blankLabel: 'Default' })}</select>`;
      html += '</div>';
    }

    html += '</div>'; // grid
    html += '</div>'; // instance-metadata
    return html;
  }

  /**
   * Mount event handlers on the rendered section.
   * @param {HTMLElement} container  Parent element containing .instance-metadata
   * @param {object} [opts]
   * @param {'inline'|'edit'} [opts.mode='inline']  Wiring mode
   * @param {(() => void)|null} [opts.onChange] Called on any change in edit mode (e.g. markDirty)
   * @returns {object|null}  Handle with populate/collectValues (edit mode), null (inline mode)
   */
  function mount(container, { mode = 'inline', onChange = null } = {}) {
    const section = container.querySelector('.instance-metadata');
    if (!(section instanceof HTMLElement)) return null;
    const boxId = Number(section.dataset.box);
    const slotIdx = Number(section.dataset.slot);

    // Unified save: DataManager in inline, onChange callback in edit
    /** @param {string} field @param {import('../../types/contracts.js').InputValue} value */
    const _save = async (field, value) => {
      if (mode === 'edit') {
        onChange?.();
      } else {
        await DataManager.updateSlotIdentityField(boxId, slotIdx, field, value);
      }
    };

    // Form change → re-place the slot with the new species (inline only)
    const formSelect = section.querySelector('[data-field="form"]');
    if (formSelect instanceof HTMLSelectElement) {
      formSelect.addEventListener('change', async () => {
        const newSlug = formSelect.value;
        const instance = DataManager.getInstance(boxId, slotIdx);
        if (!instance) return;
        await DataManager.placeInSlot(boxId, slotIdx, newSlug, instance.target_build_id || null, {
          ...(instance.state || {}),
        });
      });
    }

    // Gender toggle
    const genderToggle = section.querySelector('[data-field="gender"]');
    if (genderToggle instanceof HTMLElement) {
      for (const btn of genderToggle.querySelectorAll('.gender-btn')) {
        if (!(btn instanceof HTMLButtonElement)) continue;
        btn.addEventListener('click', async () => {
          const currentGender = mode === 'inline'
            ? (DataManager.getInstance(boxId, slotIdx)?.state?.gender || '')
            : (genderToggle.dataset.value || '');
          const newGender = btn.dataset.value === currentGender ? '' : btn.dataset.value;
          genderToggle.dataset.value = newGender;
          for (const b of genderToggle.querySelectorAll('.gender-btn')) {
            if (!(b instanceof HTMLButtonElement)) continue;
            b.classList.toggle('active', b.dataset.value === newGender);
          }
          await _save('gender', newGender || null);
        });
      }
    }

    // Ball picker widget (both modes — section owns ball in all contexts)
    /** @type {{getValue: () => string|undefined, setValue: (value: string) => void}|null} */
    let _ballPicker = null;
    const ballSlot = section.querySelector('[data-field="ball"]');
    if (ballSlot instanceof HTMLElement && typeof BallPicker !== 'undefined') {
      const current = ballSlot.dataset.current || 'Poke';
      _ballPicker = BallPicker.createBallPicker(ballSlot, current, async (ball) => {
        await _save('ball', ball);
      });
    }

    // Flag checkboxes
    for (const cb of section.querySelectorAll('.instance-metadata__checkbox')) {
      if (!(cb instanceof HTMLInputElement)) continue;
      cb.addEventListener('change', async () => {
        if (cb.dataset.field) await _save(cb.dataset.field, cb.checked);
      });
    }

    // Registry-driven metadata selects and toggles
    for (const metaEl of section.querySelectorAll('[data-meta-field]')) {
      if (!(metaEl instanceof HTMLElement)) continue;
      const field = /** @type {import('../../types/contracts.js').FormMetadataKey} */ (metaEl.dataset.metaField);
      if (metaEl instanceof HTMLSelectElement) {
        metaEl.addEventListener('change', async () => {
          await _save(field, metaEl.value || null);
        });
      } else {
        for (const btn of metaEl.querySelectorAll('.gender-btn')) {
          if (!(btn instanceof HTMLButtonElement)) continue;
          btn.addEventListener('click', async () => {
            const current = mode === 'inline'
              ? (DataManager.getInstance(boxId, slotIdx)?.state?.[field] || '')
              : (metaEl.dataset.value || '');
            const newVal = btn.dataset.value === current ? '' : btn.dataset.value;
            metaEl.dataset.value = newVal;
            for (const b of metaEl.querySelectorAll('.gender-btn')) {
              if (!(b instanceof HTMLButtonElement)) continue;
              b.classList.toggle('active', b.dataset.value === newVal);
            }
            await _save(field, newVal || null);
          });
        }
      }
    }

    // Edit-mode text/select fields: level, nickname, ot, origin_game, language
    if (mode === 'edit') {
      for (const input of section.querySelectorAll('input[data-field], select[data-field]')) {
        if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) continue;
        const field = input.dataset.field;
        if (field === 'gender' || field === 'form') continue;
        input.addEventListener('change', () => onChange?.());
        if (input.tagName === 'INPUT') input.addEventListener('input', () => onChange?.());
      }
    }

    if (mode !== 'edit') return null;

    return {
      /**
       * Collect current field values from the section DOM.
       * @param {string} [speciesSlug]  For gender-lock fallback on locked species
       * @returns {object} Field values including ball
       */
      collectValues(speciesSlug) {
        /** @type {Record<string, import('../../types/contracts.js').InputValue>} */
        const vals = {};

        // Ball
        if (_ballPicker) vals.ball = _ballPicker.getValue() || null;

        // Gender: toggle value, or locked fallback, or omit for genderless
        const gToggle = section.querySelector('[data-field="gender"]');
        if (gToggle instanceof HTMLElement) {
          vals.gender = gToggle.dataset.value || null;
        } else if (speciesSlug) {
          const lock = FormMetadata.getLock(speciesSlug, {
            speciesGender: SpeciesQueries.getPokedexEntry(speciesSlug)?.gender,
          });
          if (lock.gender) vals.gender = lock.gender.value;
          // No own property for genderless → merge preserves existing state
        }

        // Flag checkboxes
        for (const cb of section.querySelectorAll('.instance-metadata__checkbox')) {
          if (!(cb instanceof HTMLInputElement)) continue;
          if (cb.dataset.field) vals[cb.dataset.field] = cb.checked;
        }

        // Registry-driven fields (cream/sweet, etc.)
        for (const metaEl of section.querySelectorAll('[data-meta-field]')) {
          if (!(metaEl instanceof HTMLElement)) continue;
          const key = metaEl.dataset.metaField;
          if (!key) continue;
          if (key === 'gender') continue;
          vals[key] = metaEl instanceof HTMLSelectElement
            ? (metaEl.value || null)
            : (metaEl.dataset.value || null);
        }

        // Edit-mode identity fields
        for (const input of section.querySelectorAll('input[data-field], select[data-field]')) {
          if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) continue;
          const field = input.dataset.field;
          if (!field) continue;
          if (field === 'gender' || field === 'form') continue;
          if (input instanceof HTMLInputElement && input.type === 'number') {
            const raw = parseInt(input.value, 10);
            vals[field] = (Number.isFinite(raw) && raw > 0) ? raw : null;
          } else {
            vals[field] = (input instanceof HTMLSelectElement ? input.value : input.value.trim()) || null;
          }
        }

        return vals;
      },

      /**
       * Set field values from a state object.
       * @param {import('../../types/contracts.js').BuildState} state
       * @param {object} [opts]
       * @param {boolean} [opts.onlyIfEmpty=false]  Skip fields with existing non-empty values
       */
      populate(state, { onlyIfEmpty = false } = {}) {
        if (!state) return;

        // Gender toggle
        const gToggle = section.querySelector('[data-field="gender"]');
        if (gToggle instanceof HTMLElement && state.gender != null) {
          const current = gToggle.dataset.value || '';
          if (!onlyIfEmpty || !current) {
            const newGender = state.gender || '';
            gToggle.dataset.value = newGender;
            for (const btn of gToggle.querySelectorAll('.gender-btn')) {
              if (!(btn instanceof HTMLButtonElement)) continue;
              btn.classList.toggle('active', btn.dataset.value === newGender);
            }
          }
        }

        // Ball
        if (state.ball && _ballPicker) {
          if (!onlyIfEmpty || !_ballPicker.getValue()) _ballPicker.setValue(state.ball);
        }

        // Flag checkboxes
        for (const cb of section.querySelectorAll('.instance-metadata__checkbox')) {
          if (!(cb instanceof HTMLInputElement)) continue;
          const field = /** @type {keyof import('../../types/contracts.js').BuildState} */ (cb.dataset.field);
          if (state[field] == null) continue;
          if (!onlyIfEmpty || !cb.checked) cb.checked = !!state[field];
        }

        // Registry-driven fields
        for (const metaEl of section.querySelectorAll('[data-meta-field]')) {
          if (!(metaEl instanceof HTMLElement)) continue;
          const key = /** @type {import('../../types/contracts.js').FormMetadataKey} */ (metaEl.dataset.metaField);
          if (key === 'gender') continue;
          if (state[key] == null || state[key] === '') continue;
          const value = String(state[key]);
          if (metaEl instanceof HTMLSelectElement) {
            if (!onlyIfEmpty || !metaEl.value) metaEl.value = value;
          } else {
            const current = metaEl.dataset.value || '';
            if (!onlyIfEmpty || !current) {
              metaEl.dataset.value = value;
              for (const btn of metaEl.querySelectorAll('.gender-btn')) {
                if (!(btn instanceof HTMLButtonElement)) continue;
                btn.classList.toggle('active', btn.dataset.value === value);
              }
            }
          }
        }

        // Edit-mode identity inputs
        /** @param {HTMLInputElement|HTMLSelectElement} el */
        const isTextEmpty = (el) => !String(el.value || '').trim();
        /** @param {HTMLInputElement|HTMLSelectElement} el */
        const isZeroOrBlank = (el) => el.value === '' || Number(el.value || 0) === 0;
        for (const input of section.querySelectorAll('input[data-field], select[data-field]')) {
          if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) continue;
          const field = /** @type {keyof import('../../types/contracts.js').BuildState} */ (input.dataset.field);
          if (field === 'gender' || field === 'form') continue;
          if (state[field] == null || state[field] === '') continue;
          const value = String(state[field]);
          if (input instanceof HTMLInputElement && input.type === 'number') {
            if (!onlyIfEmpty || isZeroOrBlank(input)) input.value = value;
          } else if (input instanceof HTMLSelectElement) {
            if (!onlyIfEmpty || !input.value) input.value = value;
          } else {
            if (!onlyIfEmpty || isTextEmpty(input)) input.value = value;
          }
        }
      },
    };
  }

  return { render, mount };
})();
