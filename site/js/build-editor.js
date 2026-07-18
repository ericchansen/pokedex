import { AppRoutes } from './app-routes.js';
import { BuildUIHelpers } from './build-ui-helpers.js';
import { DataManager } from './data.js';
import { DomainMappers } from './domain-mappers.js';
import { EvConvert } from './ev-convert.js';
import { Router } from './router.js';
import { ShowdownParser } from './showdown-parser.js';
import { UIShared } from './ui-shared.js';
import { DetailSubjectVM } from './ui/detail/detail-subject-vm.js';
import {
  requireElement,
  requireFormField as requireField,
  requireInput,
  requireSelect,
} from './ui/dom.js';
import { Feedback } from './ui/feedback.js';
import { InstanceMetadataSection } from './ui/sections/instance-metadata-section.js';
import { DetailPanel } from './ui/surfaces/detail-panel.js';
import { DetailEditorSurface } from './ui/surfaces/detail-editor-surface.js';
import { BallPicker } from './ui/widgets/ball-picker.js';
import { FormErrors } from './ui/widgets/form-errors.js';
import { MoveEditorWidget } from './ui/widgets/move-editor-widget.js';
import { StatEditorWidget } from './ui/widgets/stat-editor-widget.js';

/**
 * build-editor.js - Build creation/editing UI and build delete actions.
 */

export const BuildEditor = (() => {
  /** @typedef {{input?: HTMLElement|null, message: string}} EditorFormError */
  /** @typedef {{
   * target?: HTMLElement|null, onSaved?: (() => void)|null, onCancel?: (() => void)|null,
   * onSubmit?: ((build: import('./types/contracts.js').BuildState) => void|Promise<void>)|null,
   * saveButtonLabel?: string, editContext?: 'library'|'instance', requestRevision?: number|null
   * }} BuildFormOptions */
  /** @typedef {{
   * nature?: string|null, ability?: string|null, item?: string|null, teraType?: string|null, tera_type?: string|null,
   * ball?: string|null, evs?: import('./types/contracts.js').StatSpread|import('./types/contracts.js').StructuredEvs,
   * ivs?: import('./types/contracts.js').IvSpread, moves?: string[], egg_moves?: string[]
   * }} FormPopulationData */
  /** @typedef {{errors: EditorFormError[]}|import('./types/contracts.js').BuildState|null} BuildFormResult */
  /** @typedef {{
   * collectValues: (speciesSlug?: string) => Record<string, import('./types/contracts.js').InputValue>,
   * populate: (state: object, options?: {onlyIfEmpty?: boolean}) => void
   * }} MetadataSectionHandle */

  const {
    ALL_TYPES,
    STAT_NAMES,
    renderNatureOptions,
    formatSpeciesItem,
    formatMoveItem,
    syncAbilitySelect,
    validateEvSpread,
    escapeHtml,
    createAutocomplete,
  } = UIShared;
  const { close: closePanel } = DetailPanel;
  const { showFormErrors, showFormApiBanner } = FormErrors;

  const { NATURE_BOOSTS, calcChampionsStat } = BuildUIHelpers;
  const {
    renderBuildEditor,
    createBudgetUpdater,
    bindIvInputs,
    bindSliderPairs,
  } = StatEditorWidget;
  const {
    renderClearableFields,
    wireSpeciesMoveAutocomplete,
    collectValues,
  } = MoveEditorWidget;
  const {
    CHAMPIONS_PER_STAT_CAP = 32,
    CHAMPIONS_TOTAL_CAP = 66,
    CLASSIC_PER_STAT_CAP = 252,
    CLASSIC_TOTAL_CAP = 510,
  } = EvConvert || {};
  const MAX_MOVES = 4;
  const MOVE_SLOT_INDEXES = Array.from({ length: MAX_MOVES }, (_, index) => index);
  const EGG_MOVE_REFRESH_INPUT_DEBOUNCE_MS = 120;
  const AUTOSAVE_DEBOUNCE_MS = 600;
  const AUTOSAVE_POLL_INTERVAL_MS = 50;

  // ── Extracted: Form HTML generation (pure function) ──────
  /**
   * @param {import('./types/contracts.js').BuildState} build
   * @param {{isLibrary: boolean, isEdit: boolean, saveButtonLabel?: string}} options
   */
  function _renderFormHtml(build, { isLibrary, isEdit, saveButtonLabel }) {
    return `
      <form id="build-form" class="build-form" novalidate>
        <div class="build-form-toolbar">
          <button type="button" class="btn btn-secondary" id="bf-paste-showdown">Paste Showdown</button>
        </div>
        <div class="comp-row comp-row--editable">
          <span class="comp-label">Species</span>
          <span class="comp-value"><input type="text" id="bf-species" value="${escapeHtml(build.species)}" placeholder="Search species..." autocomplete="off"></span>
        </div>
        <div class="comp-row comp-row--editable${isLibrary ? '' : ' hidden'}">
          <span class="comp-label">Item</span>
          <span class="comp-value">
            <div class="input-clearable">
              <input type="text" id="bf-item" value="${escapeHtml(build.item || '')}" placeholder="Search items..." autocomplete="off">
              <button type="button" class="input-clear-btn" data-clear="bf-item" title="Clear" tabindex="-1">×</button>
            </div>
          </span>
        </div>
        <div class="comp-row comp-row--editable">
          <span class="comp-label">Nature</span>
          <span class="comp-value">
            <select id="bf-nature">
              ${renderNatureOptions(build.nature || '')}
            </select>
          </span>
        </div>
        <div class="comp-row comp-row--editable">
          <span class="comp-label">Ability</span>
          <span class="comp-value"><select id="bf-ability"></select></span>
        </div>
        ${isLibrary ? `<div class="comp-row comp-row--editable">
          <span class="comp-label">Ball</span>
          <span class="comp-value"><div id="bf-ball"></div></span>
        </div>` : ''}
        <div class="comp-row comp-row--editable">
          <span class="comp-label">Tera Type</span>
          <span class="comp-value">
            <select id="bf-tera">
              <option value="">-- None --</option>
              ${ALL_TYPES.map((type) => `<option value="${type}" ${type === build.tera_type ? 'selected' : ''}>${type}</option>`).join('')}
            </select>
          </span>
        </div>

        ${renderBuildEditor({
          activeSystem: DomainMappers.getPreferredEvSystem(build, build.ev_system || 'classic'),
          baseStats: DetailSubjectVM.resolveSpeciesSubject(build).speciesEntry?.baseStats || {},
          classicEvs: DomainMappers.getEvsForSystem(build, 'classic') || {},
          classicIvs: DomainMappers.getIvsForSystem(build, 'classic') || {},
          championsEvs: DomainMappers.getEvsForSystem(build, 'champions') || {},
          statNames: STAT_NAMES,
        })}

        <h3 class="stat-heading">Moves</h3>
        ${renderClearableFields(build.moves || [], {
          idPrefix: 'bf-move',
          labelPrefix: 'Move',
          placeholder: 'Search moves...',
          flagsIdPrefix: 'bf-move-flags',
          escapeHtml,
        })}

        <h3 class="stat-heading editor-section-heading">Known Egg Moves <span class="form-details-summary-count" id="bf-egg-count"></span></h3>
        <div>
            <p class="detail-panel-note">Track inherited egg moves separately from the current 4-move set. Any current move that is also an egg move will be remembered automatically when you save.</p>
            <div class="egg-move-preview" id="bf-egg-preview">
              <p class="detail-panel-note">No egg moves tracked yet.</p>
            </div>
            <p class="egg-move-preview-note" id="bf-egg-auto-note"></p>
        </div>
          ${renderClearableFields(build.egg_moves || [], {
            idPrefix: 'bf-egg-move',
            labelPrefix: 'Egg',
            placeholder: 'Search egg moves...',
            escapeHtml,
          })}

        <div id="bf-identity-section-host"${isLibrary ? ' class="hidden"' : ''}></div>

        <div class="comp-row comp-row--editable">
          <span class="comp-label">Notes</span>
          <span class="comp-value"><textarea id="bf-notes" rows="2" placeholder="Optional notes...">${escapeHtml(build.notes || '')}</textarea></span>
        </div>

        <div class="form-actions">
          ${isEdit
            ? '<span class="autosave-indicator" id="bf-autosave"></span>'
            : `<button type="submit" class="btn btn-primary">${escapeHtml(saveButtonLabel || 'Create Build')}</button>
               <button type="button" class="btn btn-secondary" id="bf-cancel">Cancel</button>`}
        </div>
      </form>
    `;
  }

  // ── Extracted: Showdown paste overlay ───────────────────
  /**
   * @param {HTMLElement} content
   * @param {{
   * build: import('./types/contracts.js').BuildState,
   * populateFormFields: (data: FormPopulationData) => void,
   * markDirty: () => void
   * }} options
   */
  function _wireShowdownPaste(content, { build, populateFormFields, markDirty }) {
    requireElement(content, '#bf-paste-showdown').addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'showdown-paste-overlay';
      overlay.innerHTML = `
        <div class="showdown-paste-modal">
          <h3>Paste Showdown Set</h3>
          <textarea id="bf-paste-textarea" rows="10" placeholder="Paste a Showdown set below...&#10;&#10;Example:&#10;Garchomp @ Life Orb&#10;Ability: Rough Skin&#10;Tera Type: Steel&#10;EVs: 252 Atk / 4 SpD / 252 Spe&#10;Jolly Nature&#10;- Earthquake&#10;- Dragon Claw&#10;- Iron Head&#10;- Swords Dance"></textarea>
          <div class="showdown-paste-actions">
            <button type="button" class="btn btn-primary" id="bf-paste-apply">Import</button>
            <button type="button" class="btn btn-secondary" id="bf-paste-cancel">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const textarea = /** @type {HTMLTextAreaElement} */ (requireField(overlay, '#bf-paste-textarea'));
      textarea.focus();
      requireElement(overlay, '#bf-paste-cancel').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) overlay.remove();
      });
      requireElement(overlay, '#bf-paste-apply').addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) return;
        const parsed = ShowdownParser.parseSet(text);
        if (!parsed || !parsed.species) {
          Feedback.showToast('Could not parse Showdown text.');
          return;
        }
        requireInput(content, '#bf-species').value = parsed.species;
        const matches = DataManager.searchSpecies(parsed.species);
        if (matches[0]?.slug) build.slug = matches[0].slug;
        populateFormFields(parsed);
        overlay.remove();
        markDirty();
      });
    });
  }

  // ── Extracted: Stat editor wiring ──────────────────────
  /**
   * @param {HTMLElement} content
   * @param {{getCurrentSpeciesSlug: () => string}} options
   */
  function _wireStatEditor(content, { getCurrentSpeciesSlug }) {
    const statEditor = requireElement(content, '#bf-stat-editor');
    const natureSelect = requireSelect(content, '#bf-nature');
    const statKeys = /** @type {import('./types/contracts.js').StatKey[]} */ (Object.keys(STAT_NAMES));
    const cevInputs = statKeys.map((key) => requireInput(content, `#bf-cev-${key}`));
    const xevInputs = statKeys.map((key) => requireInput(content, `#bf-xev-${key}`));
    const civInputs = statKeys.map((key) => requireInput(content, `#bf-civ-${key}`));

    statEditor.querySelectorAll('.stat-editor__tab').forEach((tab) => {
      if (!(tab instanceof HTMLElement)) return;
      tab.addEventListener('click', () => {
        statEditor.querySelectorAll('.stat-editor__tab').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        const system = tab.dataset.system;
        statEditor.dataset.system = system;
        requireElement(content, '#bf-panel-classic').classList.toggle('hidden', system !== 'classic');
        requireElement(content, '#bf-panel-champions').classList.toggle('hidden', system !== 'champions');
      });
    });

    function getCurrentBaseStats() {
      const slug = getCurrentSpeciesSlug();
      if (!slug) return {};
      return DetailSubjectVM.resolveSpeciesSubject({ slug }).speciesEntry?.baseStats || {};
    }

    function updateNatureLabels() {
      const nature = natureSelect.value;
      const boosts = NATURE_BOOSTS[nature];
      statEditor.querySelectorAll('.stat-editor__name').forEach((element) => {
        if (!(element instanceof HTMLElement)) return;
        element.classList.remove('nature-plus', 'nature-minus');
        const stat = element.dataset.stat;
        if (boosts && boosts.plus === stat) element.classList.add('nature-plus');
        if (boosts && boosts.minus === stat) element.classList.add('nature-minus');
      });
    }

    const baseStatEls = Array.from(statEditor.querySelectorAll('.stat-editor__base'))
      .filter((element) => element instanceof HTMLElement);
    /** @type {Record<import('./types/contracts.js').StatKey, {
     * cev: HTMLInputElement, civ: HTMLInputElement, calcClassic: HTMLElement,
     * xev: HTMLInputElement, calcChamp: HTMLElement
     * }>} */
    const _statEls = /** @type {Record<import('./types/contracts.js').StatKey, {
     * cev: HTMLInputElement, civ: HTMLInputElement, calcClassic: HTMLElement,
     * xev: HTMLInputElement, calcChamp: HTMLElement
     * }>} */ ({});
    for (const stat of statKeys) {
      _statEls[stat] = {
        cev: requireInput(content, `#bf-cev-${stat}`),
        civ: requireInput(content, `#bf-civ-${stat}`),
        calcClassic: requireElement(content, `#bf-calc-classic-${stat}`),
        xev: requireInput(content, `#bf-xev-${stat}`),
        calcChamp: requireElement(content, `#bf-calc-champ-${stat}`),
      };
    }

    function recalcAllStats() {
      const baseStats = getCurrentBaseStats();
      const nature = natureSelect.value;
      /** @type {import('./types/contracts.js').NumericStatSpread} */
      const classicEvs = /** @type {import('./types/contracts.js').NumericStatSpread} */ ({});
      /** @type {import('./types/contracts.js').NumericStatSpread} */
      const classicIvs = /** @type {import('./types/contracts.js').NumericStatSpread} */ ({});
      for (const stat of statKeys) {
        const els = _statEls[stat];
        classicEvs[stat] = parseInt(els.cev.value, 10) || 0;
        const ivRaw = els.civ.value.trim();
        classicIvs[stat] = ivRaw === '' ? 31 : parseInt(ivRaw, 10);
      }
      const classicFinal = BuildUIHelpers.calcFinalStats(baseStats, classicEvs, classicIvs, nature);
      for (const stat of statKeys) {
        const calcEl = _statEls[stat].calcClassic;
        const base = baseStats[stat] || 0;
        calcEl.textContent = String(base ? classicFinal[stat] : '–');
      }
      for (const stat of statKeys) {
        const els = _statEls[stat];
        const base = baseStats[stat] || 0;
        const sp = parseInt(els.xev.value, 10) || 0;
        const calcEl = els.calcChamp;
        if (!base) { calcEl.textContent = '–'; continue; }
        calcEl.textContent = String(calcChampionsStat(stat, base, sp, nature));
      }
      baseStatEls.forEach((element) => {
        const stat = /** @type {import('./types/contracts.js').StatKey} */ (element.dataset.stat);
        element.textContent = String(baseStats[stat] || '–');
      });
    }

    const updateClassicEvTotal = createBudgetUpdater(cevInputs, {
      maxPerStat: CLASSIC_PER_STAT_CAP,
      maxTotal: CLASSIC_TOTAL_CAP,
      remainingEl: requireElement(content, '#bf-cev-remaining'),
      badgeEl: requireElement(content, '#bf-cev-badge'),
      sliders: statKeys.map((key) => requireInput(content, `#bf-cev-slider-${key}`)),
      onUpdate: () => recalcAllStats(),
    });
    const updateChampEvTotal = createBudgetUpdater(xevInputs, {
      maxPerStat: CHAMPIONS_PER_STAT_CAP,
      maxTotal: CHAMPIONS_TOTAL_CAP,
      remainingEl: requireElement(content, '#bf-xev-remaining'),
      badgeEl: requireElement(content, '#bf-xev-badge'),
      sliders: statKeys.map((key) => requireInput(content, `#bf-xev-slider-${key}`)),
      onUpdate: () => recalcAllStats(),
    });
    cevInputs.forEach((input) => input.addEventListener('input', updateClassicEvTotal));
    xevInputs.forEach((input) => input.addEventListener('input', updateChampEvTotal));
    bindIvInputs(civInputs, { allowBlank: true, onChange: recalcAllStats });

    bindSliderPairs([
      ...statKeys.map((key) => ({
        slider: requireInput(content, `#bf-cev-slider-${key}`),
        input: requireInput(content, `#bf-cev-${key}`),
      })),
      ...statKeys.map((key) => ({
        slider: requireInput(content, `#bf-xev-slider-${key}`),
        input: requireInput(content, `#bf-xev-${key}`),
      })),
    ]);

    // EV ↔ SP conversion buttons
    const convertToChampBtn = content.querySelector('#bf-convert-classic-to-champ');
    const convertToClassicBtn = content.querySelector('#bf-convert-champ-to-classic');
    if (convertToChampBtn) {
      convertToChampBtn.addEventListener('click', () => {
        /** @type {import('./types/contracts.js').NumericStatSpread} */
        const classicEvs = /** @type {import('./types/contracts.js').NumericStatSpread} */ ({});
        for (const key of statKeys) classicEvs[key] = parseInt(requireInput(content, `#bf-cev-${key}`).value, 10) || 0;
        const champEvs = EvConvert.classicToChampions(classicEvs);
        for (const key of statKeys) {
          requireInput(content, `#bf-xev-${key}`).value = String(champEvs[key] || 0);
          requireInput(content, `#bf-xev-slider-${key}`).value = String(champEvs[key] || 0);
        }
        updateChampEvTotal();
        recalcAllStats();
      });
    }
    if (convertToClassicBtn) {
      convertToClassicBtn.addEventListener('click', () => {
        /** @type {import('./types/contracts.js').NumericStatSpread} */
        const champEvs = /** @type {import('./types/contracts.js').NumericStatSpread} */ ({});
        for (const key of statKeys) champEvs[key] = parseInt(requireInput(content, `#bf-xev-${key}`).value, 10) || 0;
        const classicEvs = EvConvert.championsToClassic(champEvs);
        for (const key of statKeys) {
          requireInput(content, `#bf-cev-${key}`).value = String(classicEvs[key] || 0);
          requireInput(content, `#bf-cev-slider-${key}`).value = String(classicEvs[key] || 0);
        }
        updateClassicEvTotal();
        recalcAllStats();
      });
    }

    return { statEditor, natureSelect, recalcAllStats, updateNatureLabels, updateClassicEvTotal, updateChampEvTotal };
  }

  /**
   * @param {import('./types/contracts.js').BuildState|null|undefined} existingBuild
   * @param {string|null|undefined} speciesSlug
   * @param {BuildFormOptions} [opts]
   */
  async function openBuildForm(existingBuild, speciesSlug, opts = {}) {
    try {
      await DataManager.ensureEditorData();
    } catch (error) {
      if (opts.requestRevision != null && !DetailPanel.isRequestCurrent(opts.requestRevision)) return;
      console.error('[BuildEditor] failed to load editor data', error);
      Feedback.showToast('Build editor data could not be loaded.');
      return;
    }
    if (opts.requestRevision != null && !DetailPanel.isRequestCurrent(opts.requestRevision)) return;
    const { target, onSaved, onCancel, onSubmit, saveButtonLabel, editContext } = opts;
    const isLibrary = editContext === 'library';
    const isEdit = !!(existingBuild && existingBuild.id);
    const isFullPage = !!target;
    /** @type {import('./types/contracts.js').BuildState} */
    const build = existingBuild ? { ...existingBuild } : {
      species: '',
      form: '',
      item: '',
      ability: '',
      nature: '',
      ball: 'Poke',
      tera_type: '',
      evs: {},
      ivs: {},
      moves: ['', '', '', ''],
      egg_moves: [],
      ev_system: 'classic',
      notes: '',
      slug: speciesSlug || '',
    };

    if (speciesSlug && !isEdit) {
      const subject = DetailSubjectVM.resolveSpeciesSubject({ slug: speciesSlug });
      if (subject.speciesEntry) build.species = subject.speciesName;
    }

    const bodyHtml = _renderFormHtml(build, { isLibrary, isEdit, saveButtonLabel });

    const html = DetailEditorSurface.render({
      isFullPage,
      isEdit,
      noun: 'Build',
      backButtonId: 'bf-back',
      bodyHtml,
    });

    /** @param {{reason: 'user'|'route-dispose'}} context */
    const panelCloseHandler = async (context) => {
      if (isEdit) await flushAutoSave();
      if (context.reason === 'route-dispose') return;
      if (onSaved) onSaved();
      else if (onCancel) onCancel();
    };
    const content = DetailEditorSurface.mount(html, {
      target: isFullPage ? target : null,
      panelOptions: isFullPage ? null : { onBeforeClose: panelCloseHandler },
    });

    if (isFullPage) {
      DetailEditorSurface.bindBack(content, '#bf-back', () => {
        if (onCancel) onCancel();
        else Router.navigate(AppRoutes.hashes.inventory);
      });
    }

    const speciesInput = requireInput(content, '#bf-species');
    const abilitySelect = requireSelect(content, '#bf-ability');
    const moveInputs = MOVE_SLOT_INDEXES.map((index) => requireInput(content, `#bf-move-${index}`));
    const eggMoveInputs = MOVE_SLOT_INDEXES.map((index) => requireInput(content, `#bf-egg-move-${index}`));
    const eggCountEl = content.querySelector('#bf-egg-count');
    const eggPreviewEl = content.querySelector('#bf-egg-preview');
    const eggAutoNoteEl = content.querySelector('#bf-egg-auto-note');
    let eggRefreshToken = 0;
    /** @type {number|undefined} */
    let eggRefreshTimer;
    let eggRemovedNote = '';

    function getCurrentSpeciesSlug() {
      const species = speciesInput.value.trim();
      if (!species) return '';
      const subject = DetailSubjectVM.resolveSpeciesSubject({ species });
      return subject.speciesEntry ? subject.slug : '';
    }

    function refreshAbilitySelect(selectedAbility = abilitySelect.value) {
      return syncAbilitySelect(abilitySelect, speciesInput.value.trim(), selectedAbility);
    }

    const normalizeMoveKey = DomainMappers.normalizeMoveToken;

    function getCurrentMoves() {
      return collectValues(moveInputs);
    }

    function getManualEggMoves() {
      return collectValues(eggMoveInputs);
    }

    async function refreshEggMoveUi() {
      const refreshId = ++eggRefreshToken;
      const eggState = await DataManager.mergeKnownEggMoves(getCurrentSpeciesSlug(), getManualEggMoves(), getCurrentMoves());
      if (refreshId !== eggRefreshToken) return;

      const eggMoveKeys = new Set((eggState.eggMoves || []).map(normalizeMoveKey));
      const explicitEggKeys = new Set(getManualEggMoves().map(normalizeMoveKey));
      const autoRemembered = (eggState.autoDetected || []).filter((move) => !explicitEggKeys.has(normalizeMoveKey(move)));

      if (eggCountEl) {
        eggCountEl.textContent = eggState.eggMoves.length ? `(${eggState.eggMoves.length})` : '';
      }
      if (eggPreviewEl) {
        if (eggState.eggMoves.length) {
          const pillsHtml = eggState.eggMoves.map((move) => {
            const isExplicit = explicitEggKeys.has(normalizeMoveKey(move));
            if (isExplicit) {
              return `<span class="move-pill move-pill--egg move-pill--removable">${escapeHtml(move)}<span class="move-egg-badge" title="Egg move">🥚</span><button class="egg-move-remove-btn" data-remove-egg="${escapeHtml(move)}" title="Remove">×</button></span>`;
            }
            return `<span class="move-pill move-pill--egg move-pill--auto" title="Auto-detected from current moves">${escapeHtml(move)}<span class="move-egg-badge" title="Egg move">🥚</span><span class="egg-move-auto-label">auto</span></span>`;
          }).join('');
          eggPreviewEl.innerHTML = `<div class="viewer-build-card-moves">${pillsHtml}</div>`;
          eggPreviewEl.querySelectorAll('[data-remove-egg]').forEach((btn) => {
            if (!(btn instanceof HTMLElement)) return;
            btn.addEventListener('click', () => {
              const key = normalizeMoveKey(btn.dataset.removeEgg);
              eggMoveInputs.forEach((input) => {
                if (input && normalizeMoveKey(input.value) === key) input.value = '';
              });
              scheduleEggMoveRefresh();
              markDirty();
            });
          });
        } else {
          eggPreviewEl.innerHTML = '<p class="detail-panel-note">No egg moves tracked yet.</p>';
        }
      }
      if (eggAutoNoteEl) {
        const noteParts = [];
        if (eggRemovedNote) {
          noteParts.push(eggRemovedNote);
          eggRemovedNote = '';
        }
        if (autoRemembered.length) {
          noteParts.push(`${autoRemembered.join(', ')} will be remembered automatically from the current moves when you save.`);
        }
        if (eggState.invalidExplicit?.length) {
          noteParts.push(`Not an egg move for this species: ${eggState.invalidExplicit.join(', ')}.`);
        }
        eggAutoNoteEl.textContent = noteParts.join(' ');
      }

      moveInputs.forEach((input, index) => {
        const flagsEl = content.querySelector(`#bf-move-flags-${index}`);
        if (!flagsEl) return;
        const moveKey = normalizeMoveKey(input?.value);
        flagsEl.innerHTML = moveKey && eggMoveKeys.has(moveKey)
          ? '<span class="move-flag move-flag--egg" title="Known egg move">🥚 Egg move</span>'
          : '';
      });
    }

    function scheduleEggMoveRefresh(delay = 0) {
      clearTimeout(eggRefreshTimer);
      eggRefreshTimer = setTimeout(() => {
        refreshEggMoveUi().catch(() => {});
      }, delay);
    }

    createAutocomplete(speciesInput, (query) => DataManager.searchSpecies(query)
      .filter((entry) => entry != null), {
      onSelect: async (item) => {
        // Snapshot surviving fields before re-rendering section for new species
        const prevSlug = build.slug;
        const snapshot = metaSection ? metaSection.collectValues(prevSlug) : {};

        build.slug = item.slug;
        refreshAbilitySelect(abilitySelect.value);

        recalcAllStats();

        // Re-render section for new species (registry locks/controls may change)
        if (metaSection && !isLibrary) {
          const host = content.querySelector('#bf-identity-section-host');
          if (host instanceof HTMLElement) {
            host.innerHTML = InstanceMetadataSection.render({ state: build, speciesSlug: item.slug, mode: 'edit' });
            metaSection = /** @type {MetadataSectionHandle|null} */ (
              InstanceMetadataSection.mount(host, { mode: 'edit', onChange: () => markDirty() })
            );
            // Restore surviving fields (nickname, OT, level, language, shiny, flags)
            // Species-specific fields (form, cream, sweet) reset to new species defaults
            metaSection?.populate(snapshot, { onlyIfEmpty: false });
          }
        }

        if (!isEdit) {
          try {
            const defaults = await DataManager.getDefaultSet(item.slug)
              || await DataManager.getDefaultSet(item.name);
            if (defaults) populateFormFields(defaults, { onlyIfEmpty: true });
          } catch {
            // factory sets unavailable
          }
        }

        // Auto-clean egg moves that are no longer valid for the new species
        const manualEggs = getManualEggMoves();
        if (manualEggs.length) {
          try {
            const check = await DataManager.mergeKnownEggMoves(item.slug, manualEggs, getCurrentMoves());
            if (check.invalidExplicit?.length) {
              const invalidKeys = new Set(check.invalidExplicit.map(normalizeMoveKey));
              eggMoveInputs.forEach((input) => {
                if (invalidKeys.has(normalizeMoveKey(input?.value))) input.value = '';
              });
              eggRemovedNote = `Removed ${check.invalidExplicit.join(', ')} — not egg moves for ${item.name}.`;
            }
          } catch { /* learnset unavailable */ }
        }

        scheduleEggMoveRefresh();
        markDirty();
      },
      formatItem: formatSpeciesItem,
    });

    createAutocomplete(requireInput(content, '#bf-item'), (query) => DataManager.searchItems(query), {
      onSelect: () => markDirty(),
    });
    refreshAbilitySelect(build.ability || '');
    wireSpeciesMoveAutocomplete(moveInputs, getCurrentSpeciesSlug, (slug, query) => DataManager.searchMovesForSpecies(slug, query), {
      formatItem: formatMoveItem,
      onSelect: () => { scheduleEggMoveRefresh(); markDirty(); },
      onInput: () => scheduleEggMoveRefresh(EGG_MOVE_REFRESH_INPUT_DEBOUNCE_MS),
      onBlur: () => scheduleEggMoveRefresh(),
    });
    wireSpeciesMoveAutocomplete(eggMoveInputs, getCurrentSpeciesSlug, (slug, query) => DataManager.searchEggMovesForSpecies(slug, query), {
      formatItem: formatMoveItem,
      onSelect: () => { scheduleEggMoveRefresh(); markDirty(); },
      onInput: () => scheduleEggMoveRefresh(EGG_MOVE_REFRESH_INPUT_DEBOUNCE_MS),
      onBlur: () => scheduleEggMoveRefresh(),
    });

    content.querySelectorAll('.input-clear-btn').forEach((button) => {
      if (!(button instanceof HTMLElement)) return;
      button.addEventListener('click', () => {
        const clearId = button.dataset.clear;
        if (!clearId) return;
        const input = content.querySelector(`#${clearId}`);
        if (input instanceof HTMLInputElement) {
          input.value = '';
          input.focus();
          if (clearId.startsWith('bf-move-') || clearId.startsWith('bf-egg-move-')) {
            scheduleEggMoveRefresh();
          }
          markDirty();
        }
      });
    });

    const ballDefault = build.ball || 'Poke';
    const ballPicker = isLibrary
      ? BallPicker.createBallPicker(requireElement(content, '#bf-ball'), ballDefault, null)
      : null;

    // Render and mount the unified metadata section into the host div
    /** @type {MetadataSectionHandle|null} */
    let metaSection = null;
    if (!isLibrary) {
      const host = content.querySelector('#bf-identity-section-host');
      if (host instanceof HTMLElement) {
        const initSlug = speciesSlug || build.slug || '';
        host.innerHTML = InstanceMetadataSection.render({ state: build, speciesSlug: initSlug, mode: 'edit' });
        metaSection = /** @type {MetadataSectionHandle|null} */ (
          InstanceMetadataSection.mount(host, { mode: 'edit', onChange: () => markDirty() })
        );
      }
    }

    // ── Stat editor (sliders, nature labels, recalc, EV conversion) ──
    const { statEditor, natureSelect, recalcAllStats, updateNatureLabels, updateClassicEvTotal, updateChampEvTotal } =
      _wireStatEditor(content, { getCurrentSpeciesSlug });

    natureSelect.addEventListener('change', () => {
      updateNatureLabels();
      recalcAllStats();
    });
    speciesInput.addEventListener('input', () => {
      refreshAbilitySelect();
      recalcAllStats();
      scheduleEggMoveRefresh(EGG_MOVE_REFRESH_INPUT_DEBOUNCE_MS);
    });
    speciesInput.addEventListener('blur', () => {
      refreshAbilitySelect();
      recalcAllStats();
      scheduleEggMoveRefresh();
    });
    function refreshAllFormState() {
      updateClassicEvTotal();
      updateChampEvTotal();
      updateNatureLabels();
      recalcAllStats();
      scheduleEggMoveRefresh();
    }

    updateClassicEvTotal();
    updateChampEvTotal();
    updateNatureLabels();
    recalcAllStats();
    scheduleEggMoveRefresh();

    /**
     * @param {FormPopulationData} data
     * @param {{onlyIfEmpty?: boolean}} [options]
     */
    function populateFormFields(data, { onlyIfEmpty = false } = {}) {
      /** @param {string} selector */
      const isTextEmpty = (selector) => !String(requireField(content, selector).value || '').trim();
      /** @param {string} selector */
      const isZeroOrBlank = (selector) => {
        const value = requireField(content, selector).value;
        return value === '' || Number(value || 0) === 0;
      };
      const teraType = data.teraType ?? data.tera_type;

      if (data.nature && (!onlyIfEmpty || isTextEmpty('#bf-nature'))) requireSelect(content, '#bf-nature').value = data.nature;
      const currentAbility = abilitySelect.value.trim();
      refreshAbilitySelect(onlyIfEmpty && currentAbility ? currentAbility : (data.ability || ''));
      if (data.item && (!onlyIfEmpty || isTextEmpty('#bf-item'))) requireInput(content, '#bf-item').value = data.item;
      if (teraType && (!onlyIfEmpty || isTextEmpty('#bf-tera'))) requireSelect(content, '#bf-tera').value = teraType;
      if (data.ball && ballPicker && (!onlyIfEmpty || !ballPicker.getValue())) ballPicker.setValue(data.ball);
      // Instance identity + metadata fields delegated to section
      if (metaSection) metaSection.populate(data, { onlyIfEmpty });
      const formEvs = data.evs && ('classic' in data.evs || 'champions' in data.evs)
        ? data.evs.classic
        : data.evs;
      if (formEvs && Object.keys(formEvs).length) {
        for (const [key, value] of Object.entries(formEvs)) {
          const shouldPopulate = !onlyIfEmpty || isZeroOrBlank(`#bf-cev-${key}`);
          const evInput = requireInput(content, `#bf-cev-${key}`);
          if (shouldPopulate) evInput.value = String(value ?? '');
          const slider = requireInput(content, `#bf-cev-slider-${key}`);
          if (shouldPopulate) slider.value = String(value ?? '');
        }
      }
      if (data.ivs && Object.keys(data.ivs).length) {
        for (const [key, value] of Object.entries(data.ivs)) {
          const ivInput = requireInput(content, `#bf-civ-${key}`);
          if (!onlyIfEmpty || !ivInput.value.trim()) ivInput.value = String(value ?? '');
        }
      }
      if (data.moves && data.moves.length) {
        data.moves.slice(0, MAX_MOVES).forEach((move, index) => {
          const moveInput = requireInput(content, `#bf-move-${index}`);
          if (!onlyIfEmpty || !moveInput.value.trim()) moveInput.value = move;
        });
      }
      if (data.egg_moves && data.egg_moves.length) {
        [...data.egg_moves].sort((a, b) => a.localeCompare(b)).slice(0, MAX_MOVES).forEach((move, index) => {
          const eggMoveInput = requireInput(content, `#bf-egg-move-${index}`);
          if (!onlyIfEmpty || !eggMoveInput.value.trim()) eggMoveInput.value = move;
        });
      }
      refreshAllFormState();
    }

    _wireShowdownPaste(content, { build, populateFormFields, markDirty });

    const factorySlug = build.slug;
    if (factorySlug && !isEdit) {
      (async () => {
        try {
          const defaults = await DataManager.getDefaultSet(factorySlug)
            || await DataManager.getDefaultSet(build.species || factorySlug);
          if (defaults) populateFormFields(defaults, { onlyIfEmpty: true });
        } catch {
          // factory sets unavailable
        }
      })();
    }

    // ── Payload collection (shared by auto-save and manual submit) ───
    /** @returns {Promise<BuildFormResult>} */
    async function buildPayloadFromForm() {
      const speciesEl = requireInput(content, '#bf-species');
      const speciesVal = speciesEl.value.trim();
      if (!speciesVal) return null; // species required — skip save

      /** @type {EditorFormError[]} */
      const errors = [];
      const matchedSpecies = DataManager.searchSpecies(speciesVal);
      const slug = getCurrentSpeciesSlug() || matchedSpecies[0]?.slug || speciesVal.toLowerCase().replace(/\s+/g, '');

      const classicResult = validateEvSpread((key) => requireInput(content, `#bf-cev-${key}`), 'classic');
      const classicEvs = classicResult.evs;
      errors.push(...classicResult.errors);

      /** @type {import('./types/contracts.js').IvSpread} */
      const classicIvs = {};
      let hasAnyIv = false;
      for (const key of Object.keys(STAT_NAMES)) {
        const statKey = /** @type {import('./types/contracts.js').StatKey} */ (key);
        const ivEl = requireInput(content, `#bf-civ-${statKey}`);
        const raw = ivEl.value.trim();
        if (raw === '') continue;
        const ivVal = parseInt(raw, 10);
        if (isNaN(ivVal) || ivVal < 0 || ivVal > 31) {
          errors.push({ input: ivEl, message: 'Must be 0-31 or empty' });
          continue;
        }
        classicIvs[statKey] = ivVal;
        hasAnyIv = true;
      }

      const champResult = validateEvSpread((key) => requireInput(content, `#bf-xev-${key}`), 'champions');
      const champEvs = champResult.evs;
      errors.push(...champResult.errors);

      if (errors.length) return { errors };

      const hasClassic = Object.values(classicEvs).some((value) => Number(value) > 0);
      const hasChamp = Object.values(champEvs).some((value) => Number(value) > 0);
      /** @type {import('./types/contracts.js').StructuredEvs} */
      const structuredEvs = {};
      if (hasClassic) structuredEvs.classic = classicEvs;
      if (hasChamp) structuredEvs.champions = champEvs;
      if (hasAnyIv) structuredEvs.classic_ivs = classicIvs;

      const evSystem = /** @type {import('./types/contracts.js').EvSystem} */ (statEditor.dataset.system || 'classic');
      const moves = MOVE_SLOT_INDEXES.map((index) => requireInput(content, `#bf-move-${index}`).value.trim()).filter(Boolean);
      const moveDupKeys = moves.map(normalizeMoveKey);
      if (moveDupKeys.length !== new Set(moveDupKeys).size) {
        return { errors: [{ message: 'A Pokémon cannot know the same move twice.' }] };
      }
      const manualEggMoves = MOVE_SLOT_INDEXES.map((index) => requireInput(content, `#bf-egg-move-${index}`).value.trim()).filter(Boolean);

      let eggMoveState;
      try {
        eggMoveState = await DataManager.mergeKnownEggMoves(slug, manualEggMoves, moves);
      } catch (err) {
        return { errors: [{ message: err instanceof Error ? err.message : 'Unable to validate egg moves.' }] };
      }
      if (eggMoveState.invalidExplicit?.length) {
        return { errors: [{ message: `Not egg moves for ${speciesVal}: ${eggMoveState.invalidExplicit.join(', ')}` }] };
      }

      const payload = {
        species: speciesVal,
        slug,
        item: requireInput(content, '#bf-item').value.trim(),
        ability: abilitySelect.value.trim(),
        nature: requireSelect(content, '#bf-nature').value,
        ball: ballPicker?.getValue() || '',
        tera_type: requireSelect(content, '#bf-tera').value,
        ev_system: evSystem,
        evs: structuredEvs,
        ivs: hasAnyIv ? classicIvs : {},
        moves,
        egg_moves: eggMoveState.eggMoves || [],
        notes: requireField(content, '#bf-notes').value.trim(),
      };

      if (!isLibrary) {
        // Identity + metadata fields collected from the unified metadata section (includes ball)
        const identityVals = metaSection ? metaSection.collectValues(slug) : {};
        Object.assign(payload, identityVals);
      }

      return DomainMappers.createEditableBuildDraft(payload, {
        kind: isLibrary ? 'library' : 'instance',
        evSystem,
      });
    }

    // ── Auto-save machinery (edit mode only) ──────────────────────
    /** @type {number|undefined} */
    let autoSaveTimer;
    let saving = false;
    let dirty = false;
    const indicatorEl = content.querySelector('#bf-autosave');

    /** @param {string} text @param {string} cls */
    function setIndicator(text, cls) {
      if (!indicatorEl) return;
      indicatorEl.textContent = text;
      indicatorEl.className = 'autosave-indicator' + (cls ? ` autosave-${cls}` : '');
    }

    function markDirty() {
      if (!isEdit) return;
      dirty = true;
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(autoSave, AUTOSAVE_DEBOUNCE_MS);
    }

    async function autoSave() {
      if (saving) { dirty = true; return; } // re-queue
      dirty = false;
      const result = await buildPayloadFromForm();
      if (!result) return; // no species yet
      if ('errors' in result) {
        setIndicator('Unsaved', 'error');
        return;
      }
      saving = true;
      setIndicator('Saving…', 'saving');
      try {
        if (onSubmit) {
          await onSubmit(result);
        } else {
          if (build.id) await DataManager.updateBuild(build.id, result);
        }
        setIndicator('', '');
      } catch (err) {
        console.error('[BuildEditor] auto-save failed', err);
        setIndicator('Save failed', 'error');
      }
      saving = false;
      if (dirty) autoSave(); // field changed during save
    }

    async function flushAutoSave() {
      clearTimeout(autoSaveTimer);
      if (dirty) await autoSave();
      // Wait for in-flight save to finish
      while (saving) await new Promise((r) => setTimeout(r, AUTOSAVE_POLL_INTERVAL_MS));
    }

    if (isEdit) {
      const form = requireElement(content, '#build-form');
      form.addEventListener('change', markDirty);
      form.addEventListener('input', (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          markDirty();
        }
      });
    }

    // ── Cancel button (create mode only — edit mode uses panel close) ──
    const cancelBtn = content.querySelector('#bf-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        if (isFullPage) {
          if (onCancel) onCancel();
          else Router.navigate(AppRoutes.hashes.inventory);
        } else {
          await closePanel();
        }
      });
    }

    // ── Manual submit (create-only; edit mode auto-saves) ─────────
    requireElement(content, '#build-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (isEdit) return; // auto-save handles edits

      const form = requireElement(content, '#build-form');
      const result = await buildPayloadFromForm();
      if (!result) {
        showFormErrors(form, [{ input: requireInput(content, '#bf-species'), message: 'Species is required.' }]);
        return;
      }
      if ('errors' in result) {
        showFormErrors(form, result.errors);
        return;
      }

      try {
        if (onSubmit) {
          await onSubmit(result);
        } else {
          await DataManager.createBuild(result);
        }
        if (isFullPage) {
          if (onSaved) onSaved();
          else Router.navigate(AppRoutes.hashes.inventory);
        } else {
          await closePanel();
        }
      } catch (err) {
        showFormApiBanner(form, `Save failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  /** @param {string} buildId */
  async function deleteBuild(buildId) {
    if (!await Feedback.showConfirm('Delete this build? This cannot be undone.', { title: 'Delete Build', confirmLabel: 'Delete' })) return;
    try {
      await DataManager.deleteBuild(buildId);
      await closePanel({ skipBeforeClose: true });
    } catch (err) {
      Feedback.showToast(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { openBuildForm, deleteBuild };
})();
