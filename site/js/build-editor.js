/**
 * build-editor.js - Build creation/editing UI and build delete actions.
 */

const BuildEditor = (() => {
  const {
    ALL_TYPES,
    STAT_NAMES,
    renderNatureOptions,
    renderLanguageOptions,
    renderMovePills,
    getDefaultLanguageCode,
    getLanguageName,
    formatSpeciesItem,
    formatMoveItem,
    syncAbilitySelect,
    validateEvSpread,
    escapeHtml,
    createAutocomplete,
    openPanel,
    closePanel,
  } = UIShared;
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
  } = window.EvConvert || {};
  const MAX_MOVES = 4;
  const MOVE_SLOT_INDEXES = Array.from({ length: MAX_MOVES }, (_, index) => index);
  const EGG_MOVE_REFRESH_INPUT_DEBOUNCE_MS = 120;
  const AUTOSAVE_DEBOUNCE_MS = 600;
  const AUTOSAVE_POLL_INTERVAL_MS = 50;

  // ── Extracted: Form HTML generation (pure function) ──────
  function _renderFormHtml(build, { isLibrary, isEdit, defaultLanguageName, saveButtonLabel }) {
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
              ${renderNatureOptions(build.nature)}
            </select>
          </span>
        </div>
        <div class="comp-row comp-row--editable">
          <span class="comp-label">Ability</span>
          <span class="comp-value"><select id="bf-ability"></select></span>
        </div>
        <div class="comp-row comp-row--editable">
          <span class="comp-label">Ball</span>
          <span class="comp-value"><div id="bf-ball"></div></span>
        </div>
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

        <div class="editor-identity-section${isLibrary ? ' hidden' : ''}">
          <h3 class="stat-heading editor-section-heading">Identity &amp; Provenance</h3>
          <div class="comp-row comp-row--editable">
            <span class="comp-label">Gender</span>
            <span class="comp-value">
              <select id="bf-gender">
                <option value="">Unknown</option>
                <option value="M">Male ♂</option>
                <option value="F">Female ♀</option>
              </select>
            </span>
          </div>
          <div class="comp-row comp-row--editable">
            <span class="comp-label">Level</span>
            <span class="comp-value"><input type="number" id="bf-level" min="1" max="100" placeholder="?"></span>
          </div>
          <div class="comp-row comp-row--editable">
            <span class="comp-label">Nickname</span>
            <span class="comp-value"><input type="text" id="bf-nickname" placeholder="None"></span>
          </div>
          <div class="comp-row comp-row--editable">
            <span class="comp-label">OT</span>
            <span class="comp-value"><input type="text" id="bf-ot" placeholder="None"></span>
          </div>
          <div class="comp-row comp-row--editable">
            <span class="comp-label">Origin Game</span>
            <span class="comp-value">
              <select id="bf-origin-game">
                <option value="">Unknown</option>
                <option value="Scarlet">Scarlet</option>
                <option value="Violet">Violet</option>
                <option value="Legends: Arceus">Legends: Arceus</option>
                <option value="Legends: Z-A">Legends: Z-A</option>
                <option value="Sword">Sword</option>
                <option value="Shield">Shield</option>
                <option value="Champions">Champions</option>
              </select>
            </span>
          </div>
          <div class="comp-row comp-row--editable">
            <span class="comp-label">Language</span>
            <span class="comp-value">
              <select id="bf-language">
                ${renderLanguageOptions(build.language, { blankLabel: `Default (${defaultLanguageName})` })}
              </select>
            </span>
          </div>
          <div class="comp-row comp-row--editable">
            <span class="comp-label">Flags</span>
            <span class="comp-value checkbox-group">
              <label class="checkbox-label"><input type="checkbox" id="bf-shiny"> ✨ Shiny</label>
              <label class="checkbox-label"><input type="checkbox" id="bf-genned"> Genned</label>
              <label class="checkbox-label"><input type="checkbox" id="bf-gigantamax"> Gmax</label>
              <label class="checkbox-label"><input type="checkbox" id="bf-alpha"> Alpha</label>
              <label class="checkbox-label"><input type="checkbox" id="bf-event-origin"> Event</label>
              <label class="checkbox-label"><input type="checkbox" id="bf-from-go"> Pokémon GO</label>
              <label class="checkbox-label"><input type="checkbox" id="bf-ev-guesstimate"> EV Guesstimate</label>
              <label class="checkbox-label"><input type="checkbox" id="bf-transferred"> 🏆 Champions</label>
            </span>
          </div>
          <div id="bf-registry-fields"></div>
        </div>

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
  function _wireShowdownPaste(content, { build, populateFormFields, markDirty }) {
    content.querySelector('#bf-paste-showdown').addEventListener('click', () => {
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
      const textarea = overlay.querySelector('#bf-paste-textarea');
      textarea.focus();
      overlay.querySelector('#bf-paste-cancel').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) overlay.remove();
      });
      overlay.querySelector('#bf-paste-apply').addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) return;
        const parsed = ShowdownParser.parseSet(text);
        if (!parsed || !parsed.species) {
          UIShared.showToast('Could not parse Showdown text.');
          return;
        }
        content.querySelector('#bf-species').value = parsed.species;
        const matches = DataManager.searchSpecies(parsed.species);
        if (matches.length) build.slug = matches[0].slug;
        populateFormFields(parsed);
        overlay.remove();
        markDirty();
      });
    });
  }

  // ── Extracted: Stat editor wiring ──────────────────────
  function _wireStatEditor(content, { getCurrentSpeciesSlug }) {
    const statEditor = content.querySelector('#bf-stat-editor');
    const natureSelect = content.querySelector('#bf-nature');
    const statKeys = Object.keys(STAT_NAMES);
    const cevInputs = statKeys.map((key) => content.querySelector(`#bf-cev-${key}`));
    const xevInputs = statKeys.map((key) => content.querySelector(`#bf-xev-${key}`));
    const civInputs = statKeys.map((key) => content.querySelector(`#bf-civ-${key}`));

    statEditor.querySelectorAll('.stat-editor__tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        statEditor.querySelectorAll('.stat-editor__tab').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        const system = tab.dataset.system;
        statEditor.dataset.system = system;
        content.querySelector('#bf-panel-classic').classList.toggle('hidden', system !== 'classic');
        content.querySelector('#bf-panel-champions').classList.toggle('hidden', system !== 'champions');
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
        element.classList.remove('nature-plus', 'nature-minus');
        const stat = element.dataset.stat;
        if (boosts && boosts.plus === stat) element.classList.add('nature-plus');
        if (boosts && boosts.minus === stat) element.classList.add('nature-minus');
      });
    }

    const baseStatEls = Array.from(statEditor.querySelectorAll('.stat-editor__base'));
    const _statEls = {};
    for (const stat of statKeys) {
      _statEls[stat] = {
        cev: content.querySelector(`#bf-cev-${stat}`),
        civ: content.querySelector(`#bf-civ-${stat}`),
        calcClassic: content.querySelector(`#bf-calc-classic-${stat}`),
        xev: content.querySelector(`#bf-xev-${stat}`),
        calcChamp: content.querySelector(`#bf-calc-champ-${stat}`),
      };
    }

    function recalcAllStats() {
      const baseStats = getCurrentBaseStats();
      const nature = natureSelect.value;
      const classicEvs = {};
      const classicIvs = {};
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
        calcEl.textContent = base ? classicFinal[stat] : '–';
      }
      for (const stat of statKeys) {
        const els = _statEls[stat];
        const base = baseStats[stat] || 0;
        const sp = parseInt(els.xev.value, 10) || 0;
        const calcEl = els.calcChamp;
        if (!base) { calcEl.textContent = '–'; continue; }
        calcEl.textContent = calcChampionsStat(stat, base, sp, nature);
      }
      baseStatEls.forEach((element) => {
        const stat = element.dataset.stat;
        element.textContent = baseStats[stat] || '–';
      });
    }

    const updateClassicEvTotal = createBudgetUpdater(cevInputs, {
      maxPerStat: CLASSIC_PER_STAT_CAP,
      maxTotal: CLASSIC_TOTAL_CAP,
      remainingEl: content.querySelector('#bf-cev-remaining'),
      badgeEl: content.querySelector('#bf-cev-badge'),
      sliders: statKeys.map((key) => content.querySelector(`#bf-cev-slider-${key}`)),
      onUpdate: () => recalcAllStats(),
    });
    const updateChampEvTotal = createBudgetUpdater(xevInputs, {
      maxPerStat: CHAMPIONS_PER_STAT_CAP,
      maxTotal: CHAMPIONS_TOTAL_CAP,
      remainingEl: content.querySelector('#bf-xev-remaining'),
      badgeEl: content.querySelector('#bf-xev-badge'),
      sliders: statKeys.map((key) => content.querySelector(`#bf-xev-slider-${key}`)),
      onUpdate: () => recalcAllStats(),
    });
    cevInputs.forEach((input) => input.addEventListener('input', updateClassicEvTotal));
    xevInputs.forEach((input) => input.addEventListener('input', updateChampEvTotal));
    bindIvInputs(civInputs, { allowBlank: true, onChange: recalcAllStats });

    bindSliderPairs([
      ...statKeys.map((key) => ({
        slider: content.querySelector(`#bf-cev-slider-${key}`),
        input: content.querySelector(`#bf-cev-${key}`),
      })),
      ...statKeys.map((key) => ({
        slider: content.querySelector(`#bf-xev-slider-${key}`),
        input: content.querySelector(`#bf-xev-${key}`),
      })),
    ]);

    // EV ↔ SP conversion buttons
    const convertToChampBtn = content.querySelector('#bf-convert-classic-to-champ');
    const convertToClassicBtn = content.querySelector('#bf-convert-champ-to-classic');
    if (convertToChampBtn) {
      convertToChampBtn.addEventListener('click', () => {
        const classicEvs = {};
        for (const key of statKeys) classicEvs[key] = parseInt(content.querySelector(`#bf-cev-${key}`).value, 10) || 0;
        const champEvs = EvConvert.classicToChampions(classicEvs);
        for (const key of statKeys) {
          content.querySelector(`#bf-xev-${key}`).value = champEvs[key] || 0;
          const slider = content.querySelector(`#bf-xev-slider-${key}`);
          if (slider) slider.value = champEvs[key] || 0;
        }
        updateChampEvTotal();
        recalcAllStats();
      });
    }
    if (convertToClassicBtn) {
      convertToClassicBtn.addEventListener('click', () => {
        const champEvs = {};
        for (const key of statKeys) champEvs[key] = parseInt(content.querySelector(`#bf-xev-${key}`).value, 10) || 0;
        const classicEvs = EvConvert.championsToClassic(champEvs);
        for (const key of statKeys) {
          content.querySelector(`#bf-cev-${key}`).value = classicEvs[key] || 0;
          const slider = content.querySelector(`#bf-cev-slider-${key}`);
          if (slider) slider.value = classicEvs[key] || 0;
        }
        updateClassicEvTotal();
        recalcAllStats();
      });
    }

    return { statEditor, natureSelect, recalcAllStats, updateNatureLabels, updateClassicEvTotal, updateChampEvTotal };
  }

  function openBuildForm(existingBuild, speciesSlug, opts = {}) {
    const { target, onSaved, onCancel, onSubmit, saveButtonLabel, editContext, instanceLocation } = opts;
    const isInstance = editContext === 'instance';
    const isLibrary = editContext === 'library';
    const isEdit = !!(existingBuild && existingBuild.id);
    const isFullPage = !!target;
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

    const defaultLanguageName = getLanguageName(getDefaultLanguageCode());

    const bodyHtml = _renderFormHtml(build, { isLibrary, isEdit, defaultLanguageName, saveButtonLabel });

    const html = DetailEditorSurface.render({
      isFullPage,
      isEdit,
      noun: 'Build',
      backButtonId: 'bf-back',
      bodyHtml,
    });

    const panelCloseHandler = async () => {
      if (isEdit) await flushAutoSave();
      if (onSaved) onSaved();
      else if (onCancel) onCancel();
      else AppStore.markRouteDirty();
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

    const speciesInput = content.querySelector('#bf-species');
    const abilitySelect = content.querySelector('#bf-ability');
    const moveInputs = MOVE_SLOT_INDEXES.map((index) => content.querySelector(`#bf-move-${index}`));
    const eggMoveInputs = MOVE_SLOT_INDEXES.map((index) => content.querySelector(`#bf-egg-move-${index}`));
    const eggCountEl = content.querySelector('#bf-egg-count');
    const eggPreviewEl = content.querySelector('#bf-egg-preview');
    const eggAutoNoteEl = content.querySelector('#bf-egg-auto-note');
    let eggRefreshToken = 0;
    let eggRefreshTimer = null;
    let eggRemovedNote = '';

    function getCurrentSpeciesSlug() {
      const species = speciesInput.value.trim();
      if (!species) return '';
      const subject = DetailSubjectVM.resolveSpeciesSubject({ species });
      return subject.speciesEntry ? subject.slug : '';
    }

    const genderSelect = content.querySelector('#bf-gender');

    /** Lock or unlock the gender picker based on species gender data. */
    function syncGenderLock() {
      const slug = getCurrentSpeciesSlug();
      const locked = slug ? DataManager.getSpeciesGender(slug) : null;
      if (locked === 'M' || locked === 'F') {
        genderSelect.value = locked;
        genderSelect.disabled = true;
        genderSelect.title = 'This species is always ' + (locked === 'M' ? 'male' : 'female');
      } else if (locked === 'N') {
        // Show em dash for genderless — add temp option if needed
        let dashOpt = genderSelect.querySelector('option[value="N"]');
        if (!dashOpt) {
          dashOpt = document.createElement('option');
          dashOpt.value = 'N';
          dashOpt.textContent = '\u2014';
          genderSelect.appendChild(dashOpt);
        }
        genderSelect.value = 'N';
        genderSelect.disabled = true;
        genderSelect.title = 'This species is genderless';
      } else {
        // Remove genderless option if species is not genderless
        const dashOpt = genderSelect.querySelector('option[value="N"]');
        if (dashOpt) dashOpt.remove();
        genderSelect.disabled = false;
        genderSelect.title = '';
      }
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

    createAutocomplete(speciesInput, (query) => DataManager.searchSpecies(query), {
      onSelect: async (item) => {
        build.slug = item.slug;
        refreshAbilitySelect(abilitySelect.value);

        recalcAllStats();

        if (!isEdit) {
          try {
            const defaults = await DataManager.getDefaultSet(item.slug)
              || await DataManager.getDefaultSet(item.name);
            if (defaults) populateFormFields(defaults, { onlyIfEmpty: true });
          } catch (_) {
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
          } catch (_) { /* learnset unavailable */ }
        }

        scheduleEggMoveRefresh();
        syncGenderLock();
        refreshRegistryFields();
        markDirty();
      },
      formatItem: formatSpeciesItem,
    });

    createAutocomplete(content.querySelector('#bf-item'), (query) => DataManager.searchItems(query), {
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
      button.addEventListener('click', () => {
        const input = content.querySelector(`#${button.dataset.clear}`);
        if (input) {
          input.value = '';
          input.focus();
          if (button.dataset.clear.startsWith('bf-move-') || button.dataset.clear.startsWith('bf-egg-move-')) {
            scheduleEggMoveRefresh();
          }
          markDirty();
        }
      });
    });

    const ballDefault = build.ball || (isEdit ? '' : 'Poke');
    const ballPicker = BallPicker.createBallPicker(content.querySelector('#bf-ball'), ballDefault);

    if (build.gender) content.querySelector('#bf-gender').value = build.gender;
    syncGenderLock();
    if (build.level) content.querySelector('#bf-level').value = build.level;
    if (build.shiny) content.querySelector('#bf-shiny').checked = true;
    if (build.nickname) content.querySelector('#bf-nickname').value = build.nickname;
    if (build.ot) content.querySelector('#bf-ot').value = build.ot;
    if (build.origin_game) content.querySelector('#bf-origin-game').value = build.origin_game;
    if (build.language) content.querySelector('#bf-language').value = build.language;
    if (build.gigantamax) content.querySelector('#bf-gigantamax').checked = true;
    if (build.alpha) content.querySelector('#bf-alpha').checked = true;
    if (build.event_origin) content.querySelector('#bf-event-origin').checked = true;
    if (build.from_go) content.querySelector('#bf-from-go').checked = true;
    if (build.ev_guesstimate) content.querySelector('#bf-ev-guesstimate').checked = true;
    if (build.genned) content.querySelector('#bf-genned').checked = true;
    if (build.transferred_to_champions) content.querySelector('#bf-transferred').checked = true;

    // ── Registry-driven metadata fields (cream/sweet, future dimensions) ──
    function refreshRegistryFields() {
      const container = content.querySelector('#bf-registry-fields');
      if (!container) return;
      const slug = getCurrentSpeciesSlug();
      const controls = (typeof FormMetadata !== 'undefined') ? FormMetadata.getPlacementControls(slug) : [];
      // Filter out gender (already handled by #bf-gender)
      const filtered = controls.filter(c => c.key !== 'gender');
      if (!filtered.length) { container.innerHTML = ''; return; }
      container.innerHTML = filtered.map(ctrl => {
        const currentVal = build[ctrl.key] || '';
        const label = escapeHtml(ctrl.key.charAt(0).toUpperCase() + ctrl.key.slice(1));
        if (ctrl.type === 'select') {
          return `<div class="comp-row comp-row--editable">
            <span class="comp-label">${label}</span>
            <span class="comp-value">
              <select id="bf-meta-${ctrl.key}" data-meta-field="${ctrl.key}">
                <option value="">—</option>
                ${ctrl.options.map(o => `<option value="${escapeHtml(o)}"${o === currentVal ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}
              </select>
            </span>
          </div>`;
        }
        return '';
      }).join('');
      // Wire change events → markDirty
      for (const sel of container.querySelectorAll('[data-meta-field]')) {
        sel.addEventListener('change', () => markDirty());
      }
    }
    refreshRegistryFields();

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

    function populateFormFields(data, { onlyIfEmpty = false } = {}) {
      const isTextEmpty = (selector) => !String(content.querySelector(selector)?.value || '').trim();
      const isZeroOrBlank = (selector) => {
        const value = content.querySelector(selector)?.value;
        return value === '' || Number(value || 0) === 0;
      };
      const teraType = data.teraType ?? data.tera_type;

      if (data.nature && (!onlyIfEmpty || isTextEmpty('#bf-nature'))) content.querySelector('#bf-nature').value = data.nature;
      const currentAbility = abilitySelect.value.trim();
      refreshAbilitySelect(onlyIfEmpty && currentAbility ? currentAbility : (data.ability || ''));
      if (data.item && (!onlyIfEmpty || isTextEmpty('#bf-item'))) content.querySelector('#bf-item').value = data.item;
      if (teraType && (!onlyIfEmpty || isTextEmpty('#bf-tera'))) content.querySelector('#bf-tera').value = teraType;
      if (data.ball && (!onlyIfEmpty || !ballPicker.getValue())) ballPicker.setValue(data.ball);
      // Identity fields from paste: nickname, level, gender, shiny, gigantamax
      if (data.nickname && (!onlyIfEmpty || isTextEmpty('#bf-nickname'))) {
        const nickEl = content.querySelector('#bf-nickname');
        if (nickEl) nickEl.value = data.nickname;
      }
      if (data.level && (!onlyIfEmpty || isZeroOrBlank('#bf-level'))) {
        const levelEl = content.querySelector('#bf-level');
        if (levelEl) levelEl.value = data.level;
      }
      if (data.gender) {
        const genderEl = content.querySelector('#bf-gender');
        if (genderEl && (!onlyIfEmpty || !genderEl.value)) genderEl.value = data.gender;
      }
      if (data.shiny) {
        const shinyEl = content.querySelector('#bf-shiny');
        if (shinyEl && (!onlyIfEmpty || !shinyEl.checked)) shinyEl.checked = true;
      }
      if (data.gigantamax) {
        const gmaxEl = content.querySelector('#bf-gigantamax');
        if (gmaxEl && (!onlyIfEmpty || !gmaxEl.checked)) gmaxEl.checked = true;
      }
      // Registry-driven metadata fields (cream/sweet, future dimensions)
      if (typeof FormMetadata !== 'undefined') {
        for (const key of FormMetadata.KEYS) {
          if (key === 'gender' || key === 'gigantamax' || key === 'alpha') continue; // handled above
          if (data[key]) {
            const el = content.querySelector(`[data-meta-field="${key}"]`);
            if (el && (!onlyIfEmpty || !el.value)) el.value = data[key];
          }
        }
      }
      if (data.evs && Object.keys(data.evs).length) {
        for (const [key, value] of Object.entries(data.evs)) {
          const shouldPopulate = !onlyIfEmpty || isZeroOrBlank(`#bf-cev-${key}`);
          const evInput = content.querySelector(`#bf-cev-${key}`);
          if (evInput && shouldPopulate) evInput.value = value;
          const slider = content.querySelector(`#bf-cev-slider-${key}`);
          if (slider && shouldPopulate) slider.value = value;
        }
      }
      if (data.ivs && Object.keys(data.ivs).length) {
        for (const [key, value] of Object.entries(data.ivs)) {
          const ivInput = content.querySelector(`#bf-civ-${key}`);
          if (ivInput && (!onlyIfEmpty || !ivInput.value.trim())) ivInput.value = value;
        }
      }
      if (data.moves && data.moves.length) {
        data.moves.slice(0, MAX_MOVES).forEach((move, index) => {
          const moveInput = content.querySelector(`#bf-move-${index}`);
          if (moveInput && (!onlyIfEmpty || !moveInput.value.trim())) moveInput.value = move;
        });
      }
      if (data.egg_moves && data.egg_moves.length) {
        [...data.egg_moves].sort((a, b) => a.localeCompare(b)).slice(0, MAX_MOVES).forEach((move, index) => {
          const eggMoveInput = content.querySelector(`#bf-egg-move-${index}`);
          if (eggMoveInput && (!onlyIfEmpty || !eggMoveInput.value.trim())) eggMoveInput.value = move;
        });
      }
      refreshAllFormState();
    }

    _wireShowdownPaste(content, { build, populateFormFields, markDirty });

    if (build.slug && !isEdit) {
      (async () => {
        try {
          const defaults = await DataManager.getDefaultSet(build.slug)
            || await DataManager.getDefaultSet(build.species);
          if (defaults) populateFormFields(defaults, { onlyIfEmpty: true });
        } catch (_) {
          // factory sets unavailable
        }
      })();
    }

    // ── Payload collection (shared by auto-save and manual submit) ───
    async function buildPayloadFromForm() {
      const form = content.querySelector('#build-form');
      const speciesEl = content.querySelector('#bf-species');
      const speciesVal = speciesEl.value.trim();
      if (!speciesVal) return null; // species required — skip save

      const errors = [];
      const matchedSpecies = DataManager.searchSpecies(speciesVal);
      const slug = getCurrentSpeciesSlug() || matchedSpecies[0]?.slug || speciesVal.toLowerCase().replace(/\s+/g, '');

      const classicResult = validateEvSpread((key) => content.querySelector(`#bf-cev-${key}`), 'classic');
      const classicEvs = classicResult.evs;
      errors.push(...classicResult.errors);

      const classicIvs = {};
      let hasAnyIv = false;
      for (const key of Object.keys(STAT_NAMES)) {
        const ivEl = content.querySelector(`#bf-civ-${key}`);
        const raw = ivEl.value.trim();
        if (raw === '') continue;
        const ivVal = parseInt(raw, 10);
        if (isNaN(ivVal) || ivVal < 0 || ivVal > 31) {
          errors.push({ input: ivEl, message: 'Must be 0-31 or empty' });
          continue;
        }
        classicIvs[key] = ivVal;
        hasAnyIv = true;
      }

      const champResult = validateEvSpread((key) => content.querySelector(`#bf-xev-${key}`), 'champions');
      const champEvs = champResult.evs;
      errors.push(...champResult.errors);

      if (errors.length) return { errors };

      const hasClassic = Object.values(classicEvs).some((value) => value > 0);
      const hasChamp = Object.values(champEvs).some((value) => value > 0);
      const structuredEvs = {};
      if (hasClassic) structuredEvs.classic = classicEvs;
      if (hasChamp) structuredEvs.champions = champEvs;
      if (hasAnyIv) structuredEvs.classic_ivs = classicIvs;

      const evSystem = statEditor.dataset.system || 'classic';
      const moves = MOVE_SLOT_INDEXES.map((index) => content.querySelector(`#bf-move-${index}`).value.trim()).filter(Boolean);
      const moveDupKeys = moves.map(normalizeMoveKey);
      if (moveDupKeys.length !== new Set(moveDupKeys).size) {
        return { errors: [{ message: 'A Pokémon cannot know the same move twice.' }] };
      }
      const manualEggMoves = MOVE_SLOT_INDEXES.map((index) => content.querySelector(`#bf-egg-move-${index}`).value.trim()).filter(Boolean);

      let eggMoveState;
      try {
        eggMoveState = await DataManager.mergeKnownEggMoves(slug, manualEggMoves, moves);
      } catch (err) {
        return { errors: [{ message: err?.message || 'Unable to validate egg moves.' }] };
      }
      if (eggMoveState.invalidExplicit?.length) {
        return { errors: [{ message: `Not egg moves for ${speciesVal}: ${eggMoveState.invalidExplicit.join(', ')}` }] };
      }

      const payload = {
        species: speciesVal,
        slug,
        item: content.querySelector('#bf-item').value.trim(),
        ability: abilitySelect.value.trim(),
        nature: content.querySelector('#bf-nature').value,
        ball: ballPicker.getValue(),
        tera_type: content.querySelector('#bf-tera').value,
        ev_system: evSystem,
        evs: structuredEvs,
        ivs: hasAnyIv ? classicIvs : {},
        moves,
        egg_moves: eggMoveState.eggMoves || [],
        notes: content.querySelector('#bf-notes').value.trim(),
      };

      if (!isLibrary) {
        payload.gender = content.querySelector('#bf-gender').value || null;
        payload.shiny = content.querySelector('#bf-shiny').checked;
        payload.language = content.querySelector('#bf-language').value || null;
        payload.ot = content.querySelector('#bf-ot').value.trim() || null;
        payload.origin_game = content.querySelector('#bf-origin-game').value || null;
        const levelRaw = parseInt(content.querySelector('#bf-level').value, 10);
        payload.level = (Number.isFinite(levelRaw) && levelRaw > 0) ? levelRaw : null;
        payload.nickname = content.querySelector('#bf-nickname').value.trim() || null;
        payload.gigantamax = content.querySelector('#bf-gigantamax').checked;
        payload.alpha = content.querySelector('#bf-alpha').checked;
        payload.event_origin = content.querySelector('#bf-event-origin').checked;
        payload.from_go = content.querySelector('#bf-from-go').checked;
        payload.ev_guesstimate = content.querySelector('#bf-ev-guesstimate').checked;
        payload.genned = content.querySelector('#bf-genned').checked;
        payload.transferred_to_champions = content.querySelector('#bf-transferred').checked;
        // Registry-driven metadata fields (cream/sweet, future dimensions)
        for (const el of content.querySelectorAll('#bf-registry-fields [data-meta-field]')) {
          const key = el.dataset.metaField;
          payload[key] = el.value || null;
        }
      }

      return DomainMappers.createEditableBuildDraft(payload, {
        kind: isLibrary ? 'library' : 'instance',
        evSystem,
      });
    }

    // ── Auto-save machinery (edit mode only) ──────────────────────
    let autoSaveTimer = null;
    let saving = false;
    let dirty = false;
    const indicatorEl = content.querySelector('#bf-autosave');

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

    // Fields that affect box grid rendering (sprites, ghost matching, completion, badges)
    const GRID_FIELDS = ['species', 'form', 'gender', 'gigantamax', 'shiny', 'ability', 'nature', 'item', 'egg_moves'];
    let lastGridSnapshot = GRID_FIELDS.map(f => {
      const v = build[f];
      return Array.isArray(v) ? JSON.stringify(v) : (v ?? '');
    }).join('|');

    function gridSnapshot(payload) {
      return GRID_FIELDS.map(f => {
        const v = payload[f];
        return Array.isArray(v) ? JSON.stringify(v) : (v ?? '');
      }).join('|');
    }

    async function autoSave() {
      if (saving) { dirty = true; return; } // re-queue
      dirty = false;
      const result = await buildPayloadFromForm();
      if (!result) return; // no species yet
      if (result.errors) {
        setIndicator('Unsaved', 'error');
        return;
      }
      saving = true;
      setIndicator('Saving…', 'saving');
      try {
        if (onSubmit) {
          await onSubmit(result);
        } else {
          await DataManager.updateBuild(build.id, result);
        }
        setIndicator('', '');
        // Only refresh boxes when grid-relevant fields changed
        if (onSubmit) {
          const snap = gridSnapshot(result);
          if (snap !== lastGridSnapshot) {
            lastGridSnapshot = snap;
            document.dispatchEvent(new CustomEvent('instance-saved', {
              detail: instanceLocation?.boxId != null
                ? { boxId: instanceLocation.boxId, slotIdx: instanceLocation.slotIdx }
                : undefined,
            }));
          }
        }
      } catch (err) {
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
      const form = content.querySelector('#build-form');
      form.addEventListener('change', markDirty);
      form.addEventListener('input', (e) => {
        if (e.target.type === 'range' || e.target.type === 'number'
            || e.target.type === 'text' || e.target.tagName === 'TEXTAREA') {
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
    content.querySelector('#build-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (isEdit) return; // auto-save handles edits

      const form = content.querySelector('#build-form');
      const result = await buildPayloadFromForm();
      if (!result) {
        showFormErrors(form, [{ input: content.querySelector('#bf-species'), message: 'Species is required.' }]);
        return;
      }
      if (result.errors) {
        showFormErrors(form, result.errors);
        return;
      }

      try {
        if (onSubmit) {
          await onSubmit(result);
        } else {
          await DataManager.createBuild(result);
        }
        await DataManager.init();
        if (isFullPage) {
          if (onSaved) onSaved();
          else Router.navigate(AppRoutes.hashes.inventory);
        } else {
          await closePanel();
        }
      } catch (err) {
        showFormApiBanner(form, `Save failed: ${err.message}`);
      }
    });
  }

  async function deleteBuild(buildId) {
    if (!await UIShared.showConfirm('Delete this build? This cannot be undone.', { title: 'Delete Build', confirmLabel: 'Delete' })) return;
    try {
      await DataManager.deleteBuild(buildId);
      await closePanel({ skipBeforeClose: true });
      await DataManager.init();
      AppStore.markRouteDirty();
    } catch (err) {
      UIShared.showToast(`Delete failed: ${err.message}`);
    }
  }

  return { openBuildForm, deleteBuild };
})();

if (typeof window !== 'undefined') {
  window.BuildEditor = BuildEditor;
}
