import { DataManager } from '../../data.js';
import { DomainMappers } from '../../domain-mappers.js';
import { FormMetadata } from '../../form-metadata.js';
import { UIShared } from '../../ui-shared.js';
import { requireElement, requireInput } from '../../ui/dom.js';
import { Feedback } from '../../ui/feedback.js';

/** @param {{focusSlot: (boxId: number, slotIdx: number) => void, placementSearchDebounceMs?: number}} options */
export function createPlacementController({ focusSlot, placementSearchDebounceMs = 150 }) {
  // ── Placement flow ────────────────────────────────────

  /** @type {{boxId: number, slotIdx: number}|null} */
  let placementTarget = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let placementDebounce = null;

  /** @param {number} boxId @param {number} slotIdx @param {string|null} presetTarget */
  function openPlacement(boxId, slotIdx, presetTarget) {
    placementTarget = { boxId, slotIdx };
    const bar = requireElement(document, '#placement-bar');
    bar.hidden = false;
    const input = requireInput(document, '#placement-search');
    input.value = '';
    input.focus();
    requireElement(document, '#placement-results').innerHTML = '';

    if (presetTarget) {
      const resolved = DataManager.resolveSpecies(presetTarget);
      input.value = resolved.name || presetTarget.replace(/-/g, ' ');
      searchPlacement(input.value);
    }

    input.oninput = () => {
      if (placementDebounce !== null) clearTimeout(placementDebounce);
      placementDebounce = setTimeout(() => searchPlacement(input.value), placementSearchDebounceMs);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = document.querySelector('#placement-results .placement-result');
        if (first instanceof HTMLElement) first.click();
      } else if (e.key === 'Escape') {
        closePlacement();
      }
    };
    requireElement(document, '#placement-cancel').onclick = closePlacement;
  }

  function closePlacement() {
    const target = placementTarget;
    placementTarget = null;
    const bar = requireElement(document, '#placement-bar');
    bar.hidden = true;
    requireInput(document, '#placement-search').value = '';
    requireElement(document, '#placement-results').innerHTML = '';
    if (target) focusSlot(target.boxId, target.slotIdx);
  }

  /** @param {string} query */
  function searchPlacement(query) {
    const results = DataManager.searchSpecies(query).filter((result) => result !== null);
    const container = requireElement(document, '#placement-results');
    if (!results.length) {
      container.innerHTML = query.length > 0 ? '<div class="placement-empty">No matches</div>' : '';
      return;
    }
    container.innerHTML = results.map(r => `
      <div class="placement-result" data-slug="${r.slug}">
        ${UIShared.spriteImgHtml(r.slug, r.name, { width: 32, height: 32, loading: 'lazy' })}
        <span>${r.name}</span>
        <span class="placement-dex">#${String(r.num).padStart(4, '0')}</span>
      </div>
    `).join('');

    for (const el of container.querySelectorAll('.placement-result')) {
      if (!(el instanceof HTMLElement)) continue;
      el.addEventListener('click', async () => {
        if (!placementTarget) return;
        const slug = el.dataset.slug;
        if (!slug) return;
        const entry = DataManager.getPokedexEntry(slug);
        const templates = entry ? (DataManager.getCompetitiveSets(entry.id ?? entry.num) || []) : [];

        // Species that need extra metadata before placement — derived from FormMetadata registry
        const metaControls = FormMetadata.getPlacementControls(slug);

        if (metaControls.length > 0 || templates.length > 0) {
          showTemplatePicker(slug, templates, { metaControls });
        } else {
          await placeSlot(slug, null);
        }
      });
    }
  }

  /**
   * After a species is picked, show a picker of known competitive templates.
   * Picking a template seeds state + links template; "Blank" places an empty mon.
   * metaControls: [{key, type, options, labels?}] from FormMetadata.getPlacementControls
   */
  /**
   * @param {string} slug
   * @param {import('../../types/contracts.js').BuildState[]} templates
   * @param {{metaControls?: import('../../types/contracts.js').FormControl[]}} [opts]
   */
  function showTemplatePicker(slug, templates, opts = {}) {
    const existing = document.querySelector('.template-picker');
    if (existing) existing.remove();

    const { metaControls = [] } = opts;

    const STAT_ABBR = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
    /** @param {import('../../types/contracts.js').BuildState} t */
    function buildEvLine(t) {
      const system = DomainMappers.getPreferredEvSystem(t, t.ev_system || 'classic');
      const evs = DomainMappers.getEvsForSystem(t, system) || {};
      const parts = /** @type {Array<[import('../../types/contracts.js').StatKey, string]>} */ (Object.entries(STAT_ABBR))
        .filter(([k]) => Number(evs[k]) > 0)
        .map(([k]) => `${evs[k]} ${STAT_ABBR[k]}`);
      const isChampions = system === 'champions';
      const badge = isChampions
        ? '<span class="tp-ev-badge tp-ev-badge--sp">SP</span>'
        : '<span class="tp-ev-badge tp-ev-badge--ev">EV</span>';
      const spread = parts.length ? parts.join(' / ') : '—';
      return `${badge}<span class="template-picker-evs">${spread}</span>`;
    }

    const picker = document.createElement('div');
    picker.className = 'template-picker';

    // Form metadata selectors — generated from FormMetadata registry
    let formHtml = '';
    for (const ctrl of metaControls) {
      if (ctrl.type === 'toggle') {
        const label = ctrl.key.charAt(0).toUpperCase() + ctrl.key.slice(1);
        formHtml += `<div class="form-meta-row">
          <label>${label}:</label>
          ${ctrl.options.map((opt, i) => {
            const lbl = ctrl.labels ? ctrl.labels[i] : opt;
            const sel = i === 0 ? ' selected' : '';
            return `<button class="gender-btn${sel}" data-gender="${opt}">${lbl}</button>`;
          }).join('')}
        </div>`;
      } else if (ctrl.type === 'select') {
        const label = ctrl.key.charAt(0).toUpperCase() + ctrl.key.slice(1);
        formHtml += `<div class="form-meta-row">
          <label>${label}:</label>
          <select class="form-meta-select" data-key="${ctrl.key}">
            ${ctrl.options.map(o => `<option value="${o}">${o}</option>`).join('')}
          </select>
        </div>`;
      }
    }

    picker.innerHTML = `
      <div class="template-picker-title">${templates.length ? 'Seed with a known build?' : 'Place ' + (DataManager.resolveSpecies(slug).name || slug)}</div>
      ${formHtml}
      ${templates.map((t, i) => `
        <button class="template-picker-option" data-idx="${i}">
          <span class="template-picker-nature">${t.nature || '—'}</span>
          <span class="template-picker-ability">${t.ability || ''}</span>
          ${t.item ? `<span class="template-picker-item">@ ${t.item}</span>` : ''}
          <span class="template-picker-ev-line">${buildEvLine(t)}</span>
        </button>
      `).join('')}
      <button class="template-picker-option template-picker-blank" data-idx="-1">
        ${templates.length ? 'Blank (no build)' : 'Place'}
      </button>
    `;
    // Ensure a positioned ancestor for the absolute-positioned picker
    const bar = requireElement(document, '#placement-bar');
    if (getComputedStyle(bar).position === 'static') {
      bar.style.position = 'relative';
    }
    bar.appendChild(picker);

    // Gender toggle behavior
    for (const btn of picker.querySelectorAll('.gender-btn')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        picker.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    }

    /** Collect form metadata from the picker UI */
    function getFormMeta() {
      /** @type {import('../../types/contracts.js').BuildState} */
      const meta = {};
      const genderBtn = picker.querySelector('.gender-btn.selected');
      if (genderBtn instanceof HTMLElement) meta.gender = genderBtn.dataset.gender || null;
      for (const sel of picker.querySelectorAll('.form-meta-select')) {
        if (!(sel instanceof HTMLSelectElement)) continue;
        if (sel.dataset.key === 'cream') meta.cream = sel.value;
        if (sel.dataset.key === 'sweet') meta.sweet = sel.value;
      }
      return Object.keys(meta).length ? meta : null;
    }

    picker.addEventListener('click', async (e) => {
      const btn = e.target instanceof Element ? e.target.closest('.template-picker-option') : null;
      if (!(btn instanceof HTMLElement)) return;
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx || '', 10);
      const formMeta = getFormMeta();
      if (idx < 0) {
        await placeSlot(slug, null, formMeta);
      } else {
        const t = templates[idx];
        if (!t) return;
        const state = {
          nature: t.nature || null,
          ability: t.ability || null,
          item: t.item || null,
          tera_type: t.tera_type || null,
          moves: Array.isArray(t.moves) ? [...t.moves] : [],
          evs: t.evs ? { ...t.evs } : null,
          ivs: t.ivs ? { ...t.ivs } : null,
          ev_system: t.ev_system || null,
          ...formMeta,
        };
        await placeSlot(slug, t.id || null, state);
      }
      picker.remove();
    });
  }

  /**
   * @param {string} slug
   * @param {string|null} templateId
   * @param {import('../../types/contracts.js').BuildState|null} [state]
   */
  async function placeSlot(slug, templateId, state = null) {
    if (!placementTarget) return;
    const { boxId, slotIdx } = placementTarget;
    try {
      await DataManager.placeInSlot(boxId, slotIdx, slug, templateId, state);
    } catch (err) {
      console.error('[Boxes] placeSlot failed:', err);
      Feedback.showToast('Failed to place Pokémon');
    }
    closePlacement();
  }

  /** @param {{boxId: number, slotIdx: number, speciesKey: string, requires?: string, defaults?: string}} target */
  async function placePreset(target) {
    placementTarget = { boxId: target.boxId, slotIdx: target.slotIdx };
    const resolved = DataManager.resolveSpecies(target.speciesKey);
    const slug = resolved.matchedDirect ? resolved.slug : target.speciesKey;
    /** @type {import('../../types/contracts.js').BuildState} */
    const state = {};
    try {
      if (target.defaults) Object.assign(state, JSON.parse(target.defaults));
      if (target.requires) Object.assign(state, JSON.parse(target.requires));
    } catch (error) {
      console.warn('[Boxes] ignored malformed preset placement data', error);
    }
    const baseSlug = resolved.entry?.slug || resolved.entry?.baseSpecies?.toLowerCase();
    if ((resolved.entry?.formeOrder || resolved.entry?.otherFormes) && resolved.slug && baseSlug && resolved.slug !== baseSlug) state.species = resolved.slug;
    await placeSlot(slug, null, Object.keys(state).length ? state : null);
  }
  function destroy() {
    if (placementDebounce !== null) clearTimeout(placementDebounce);
    placementDebounce = null;
    document.querySelector('.template-picker')?.remove();
  }
  return { openPlacement, closePlacement, placePreset, destroy };
}
