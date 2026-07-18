import { BuildUIHelpers } from './build-ui-helpers.js';
import { DataManager } from './data.js';
import { EntityStore } from './data/entity-store.js';
import { TeamExportFormatter } from './team-export.js';
import { UIModels } from './ui-models.js';
import { UIShared } from './ui-shared.js';
import { DetailSubjectVM } from './ui/detail/detail-subject-vm.js';
import { Feedback } from './ui/feedback.js';
import { DetailHeroSection } from './ui/sections/detail-hero-section.js';
import { InstanceMetadataSection } from './ui/sections/instance-metadata-section.js';
import { DetailViewerSurface } from './ui/surfaces/detail-viewer-surface.js';
import { DetailPanel } from './ui/surfaces/detail-panel.js';

/**
 * pokemon-viewer.js - Species/build detail viewer and inventory build card UI.
 */

export const PokemonViewer = (() => {
  /** @type {(() => void)|null} */
  let unsubscribeInstance = null;
  /** @typedef {{
   * saveButtonLabel?: string, onSaved?: (() => void)|null, onCancel?: (() => void)|null,
   * target?: HTMLElement|null, speciesName?: string, slug?: string
   * }} InstanceEditorOptions */
  /** @typedef {{
   * species?: import('./types/contracts.js').PokedexEntry|null,
   * slug?: string, build?: import('./types/contracts.js').BuildState|null,
   * member?: import('./types/contracts.js').TeamMember|null,
   * team?: import('./types/contracts.js').Team|null,
   * boxId?: number, slotIdx?: number
   * }} ViewerContext */
  /** @typedef {{
   * onEdit?: (() => void), status?: import('./types/contracts.js').BuildStatus,
   * badgeEntry?: Partial<import('./types/contracts.js').BrowserEntry>,
   * decoSource?: import('./types/contracts.js').BuildState,
   * searchText?: string, subtitle?: string
   * }} CardOptions */
  /** @typedef {{
   * displayName: string, resolved: import('./types/contracts.js').SpeciesResolution,
   * subtitle?: string, statusLabel: string, statusText?: string, empty?: boolean,
   * evSystems?: import('./types/contracts.js').EvSystem[], trainedBadges?: string, flagsHtml?: string,
   * badgeEntry?: import('./types/contracts.js').BuildState,
   * dotOpts?: {shiny?: boolean, transferredToChampions?: boolean, inChampions?: boolean,
   * eventOrigin?: boolean, fromGo?: boolean, language?: string|null, genned?: boolean,
   * gigantamax?: boolean, alpha?: boolean, slug?: string},
   * item?: string|null, nature?: string|null, abilityLabel?: string,
   * tera_type?: string, buildData?: import('./types/contracts.js').BuildState,
   * decoSource: import('./types/contracts.js').BuildState & {
   * status?: import('./types/contracts.js').BuildStatus,
   * decorations?: import('./types/contracts.js').EntryDecorations
   * },
   * exportSource?: import('./types/contracts.js').BuildState, searchText?: string
   * }} CardViewModel */
  /** @typedef {{label: string, weight: number, build: import('./types/contracts.js').BuildState|null}} FactoryBuildOption */

  /** @param {ParentNode} root @param {string} selector */
  function requireElement(root, selector) {
    const element = root.querySelector(selector);
    if (!(element instanceof HTMLElement)) throw new Error(`Missing element: ${selector}`);
    return element;
  }

  const {
    escapeHtml,
    titleCase,
  } = UIShared;
  const {
    getEvSystems,
    getEvsForSystem,
    renderBaseStats,
    renderBuildShowdownBlock,
    renderBuildSummary,
  } = BuildUIHelpers;

  /**
   * @param {import('./types/contracts.js').BuildState|null|undefined} build
   * @param {string|null|undefined} slug
   * @param {{
   * target?: HTMLElement|null, onSaved?: (() => void)|null, onCancel?: (() => void)|null,
   * onSubmit?: ((payload: import('./types/contracts.js').BuildState) => void|Promise<void>)|null,
   * saveButtonLabel?: string, editContext?: 'library'|'instance',
   * instanceLocation?: {boxId: number, slotIdx: number}
   * }} [options]
   */
  async function openBuildEditorForm(build, slug, options = {}) {
    const requestRevision = options.target ? null : DetailPanel.beginRequest();
    const { BuildEditor } = await import('./build-editor.js');
    if (requestRevision != null && !DetailPanel.isRequestCurrent(requestRevision)) return;
    unsubscribeInstance?.();
    unsubscribeInstance = null;
    return BuildEditor.openBuildForm(build, slug, {
      ...options,
      requestRevision,
    });
  }

  /** @param {string} buildId */
  async function deleteLibraryBuild(buildId) {
    const { BuildEditor } = await import('./build-editor.js');
    return BuildEditor.deleteBuild(buildId);
  }

  /** @param {number} boxId @param {number} slotIdx @param {InstanceEditorOptions} [opts] */
  async function openInstanceEditor(boxId, slotIdx, opts = {}) {
    const instance = DataManager.getInstance(boxId, slotIdx);
    if (!instance) return;

    const subject = DetailSubjectVM.resolveSpeciesSubject(
      {
        species: instance.state?.species || instance.species_slug,
        id: instance.species_id,
      },
      { species: opts.speciesName || '', slug: opts.slug || '' }
    );
    const slug = instance.state?.slug || instance.species_slug || subject.slug || opts.slug || '';
    const speciesName = instance.state?.species || subject.speciesName || opts.speciesName || '';
    const stateBuild = DetailSubjectVM.createInstanceEditDraft(instance, speciesName, slug);

    await openBuildEditorForm(stateBuild, slug, {
      saveButtonLabel: opts.saveButtonLabel || 'Save Current Build',
      editContext: 'instance',
      instanceLocation: { boxId, slotIdx },
      onSubmit: async (/** @type {import('./types/contracts.js').BuildState} */ payload) => {
        await DataManager.updateSlotBuild(boxId, slotIdx, payload);
      },
      onSaved: opts.onSaved,
      onCancel: opts.onCancel,
      target: opts.target,
    });
  }

  // ── Shared trained badge computation ──────────────────
  const EV_MAX = { classic: 510, champions: 66 };
  /** @param {import('./types/contracts.js').BuildState} data */
  function computeTrainedBadges(data) {
    const evSystems = getEvSystems(data);
    let html = '';
    for (const sys of evSystems) {
      const sysEvs = getEvsForSystem(data, sys);
      if (!sysEvs) continue;
      let total = 0;
      for (const value of Object.values(sysEvs)) total += Number(value || 0);
      if (total >= (EV_MAX[sys] || 510)) {
        const label = evSystems.length > 1 ? ` ${titleCase(sys)}` : '';
        html += `<span class="trained-badge">✓ Trained${escapeHtml(label)}</span>`;
      }
    }
    return html;
  }

  // ── Shared card renderer (ONE implementation) ─────────
  // Both createLibraryBuildCard and createInstanceCard delegate here.
  // vm = pre-normalized view model with all display-ready fields.
  /** @param {CardViewModel} vm @param {CardOptions} [opts] */
  function buildCardElement(vm, opts = {}) {
    const card = document.createElement('div');
    card.className = `inventory-card inventory-card--${vm.statusLabel}`;
    card.style.cursor = 'pointer';
    card.dataset.searchText = vm.searchText || '';

    if (vm.empty) {
      const onEdit = opts.onEdit;
      card.innerHTML = `
        <div class="inventory-card-top">
          ${UIShared.spriteImgHtml(vm.resolved, vm.displayName, { cls: 'inventory-card-sprite', shiny: vm.dotOpts?.shiny })}
          <div class="inventory-card-heading">
            <div class="inventory-card-name-row"><h3>${escapeHtml(vm.displayName)}</h3></div>
            <p class="inventory-card-location">${escapeHtml(vm.subtitle)}</p>
          </div>
          ${typeof onEdit === 'function' ? '<div class="inventory-card-actions"><button class="inventory-card-edit-btn" title="Edit current Pokemon" aria-label="Edit current Pokemon">Edit</button></div>' : ''}
        </div>`;
      UIShared.applyEntryDecorations(card, vm.decoSource);
      const editBtn = card.querySelector('.inventory-card-edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (event) => { event.stopPropagation(); onEdit?.(); });
      }
      return card;
    }

    const gameBadgesHtml = UIShared.renderEntryBadgesHtml(vm.badgeEntry || {});

    card.innerHTML = `
      <div class="inventory-card-top">
        ${UIShared.spriteImgHtml(vm.resolved, vm.displayName, { cls: 'inventory-card-sprite', shiny: vm.dotOpts?.shiny })}
        <div class="inventory-card-heading">
          <div class="inventory-card-name-row"><h3>${escapeHtml(vm.displayName)}</h3></div>
          <p class="inventory-card-location">${escapeHtml(vm.subtitle)}</p>
        </div>
        <div class="inventory-card-actions">
          ${typeof opts.onEdit === 'function' ? '<button class="inventory-card-edit-btn" title="Edit current Pokemon" aria-label="Edit current Pokemon">Edit</button>' : ''}
          <button class="inventory-card-copy-btn" title="Copy Showdown set" aria-label="Copy Showdown set">Copy</button>
        </div>
      </div>
      <div class="inventory-card-pills">
        <span class="status-badge status-${escapeHtml(vm.statusLabel)}">${escapeHtml(vm.statusText)}</span>
        ${vm.evSystems?.includes('champions') ? '<span class="ev-badge champions">Champions</span>' : ''}
        ${vm.evSystems?.includes('classic') && vm.evSystems.length > 1 ? '<span class="ev-badge classic">Classic</span>' : ''}
        ${vm.trainedBadges || ''}
        ${vm.flagsHtml || ''}
      </div>
      ${gameBadgesHtml ? `<div class="inventory-card-games">${gameBadgesHtml}</div>` : ''}
      <p class="inventory-card-meta">${vm.item ? escapeHtml(vm.item) : (vm.nature ? escapeHtml(vm.nature) : '')}${(vm.item || vm.nature) && vm.abilityLabel ? ' · ' : ''}${escapeHtml(vm.abilityLabel || 'Unknown ability')}</p>
      ${vm.tera_type ? `<p class="inventory-card-tera"><span class="type-badge type-${vm.tera_type.toLowerCase()}">${escapeHtml(vm.tera_type)}</span> Tera</p>` : ''}
      ${vm.buildData ? renderBuildSummary(vm.buildData, { compact: true, showEvBars: true, showMoves: true }) : ''}
    `;

    UIShared.applyEntryDecorations(card, vm.decoSource);

    // Copy button
    const copyBtn = requireElement(card, '.inventory-card-copy-btn');
    copyBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!vm.exportSource) return;
      const text = TeamExportFormatter.formatMember(vm.exportSource);
      await UIShared.flashCopyFeedback(text, copyBtn, { successText: '✓', cssClass: 'copied' });
    });

    // Edit button
    const editBtn = card.querySelector('.inventory-card-edit-btn');
    const onEdit = opts.onEdit;
    if (editBtn && onEdit) {
      editBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        onEdit();
      });
    }

    return card;
  }

  /** @param {import('./types/contracts.js').BuildState} build @param {CardOptions} [opts] */
  function createLibraryBuildCard(build, opts = {}) {
    const subject = DetailSubjectVM.resolveSpeciesSubject(build);
    const resolved = subject.resolved;
    const displayName = UIModels.formatDisplayName(build);
    const battleReady = DataManager.anyInstanceMatchesBuild(build);
    const owned = DataManager.isBuildOwned(build);
    const status = opts.status || UIModels.evaluateBuildStatus(build, { owned, battleReady: battleReady.ready });
    const usage = build.id
      ? DataManager.countLibraryBuildUsage(build.id)
      : { teams: 0, instances: 0 };
    const linked = usage.instances;
    const teamCount = usage.teams;

    // Smart subtitle: omit zero counts
    let subtitle;
    if (linked > 0 && teamCount > 0) {
      subtitle = `${linked} linked ${linked === 1 ? 'instance' : 'instances'} · ${teamCount} ${teamCount === 1 ? 'team' : 'teams'}`;
    } else if (linked > 0) {
      subtitle = linked === 1 ? '1 linked instance' : `${linked} linked instances`;
    } else if (teamCount > 0) {
      subtitle = `Used on ${teamCount} ${teamCount === 1 ? 'team' : 'teams'}`;
    } else {
      subtitle = 'No linked instances';
    }

    const badgeEntry = opts.badgeEntry || {};
    const decorations = UIModels.buildEntryDecorations({
      status,
      slug: badgeEntry.slug || subject.slug,
      inChampions: badgeEntry.inChampions,
      compatibleGames: badgeEntry.compatibleGames,
      transferredToChampions: badgeEntry.transferredToChampions,
      eventOrigin: badgeEntry.eventOrigin,
      fromGo: badgeEntry.fromGo,
      language: badgeEntry.language,
      shiny: badgeEntry.shiny,
      genned: badgeEntry.genned,
      gigantamax: badgeEntry.gigantamax,
      alpha: badgeEntry.alpha,
    }, {
      status,
      slug: badgeEntry.slug || subject.slug,
      inChampions: badgeEntry.inChampions,
      compatibleGames: badgeEntry.compatibleGames,
    });
    const card = buildCardElement({
      displayName: displayName || '',
      resolved,
      subtitle,
      statusLabel: status.badgeKey,
      statusText: status.badgeLabel,
      evSystems: getEvSystems(build),
      trainedBadges: computeTrainedBadges(build),
      flagsHtml: '',
      badgeEntry: decorations.badgeEntry,
      dotOpts: decorations.dotOptions,
      item: build.item,
      abilityLabel: DataManager.formatAbilityLabel(subject.slug, build.ability),
      tera_type: build.tera_type || undefined,
      buildData: build,
      decoSource: opts.decoSource || { slug: subject.slug, status, decorations },
      exportSource: build,
      searchText: opts.searchText || UIModels.buildSearchText([displayName, build.slug, build.item, build.ability, build.nature, build.moves || []]),
    }, opts);

    card.addEventListener('click', () => openPokemonViewer({ build }));
    return card;
  }

  // ── Instance card (renders actual instance data, not library build) ──
  /** @param {import('./types/contracts.js').BrowserEntry} entry @param {CardOptions} [opts] */
  function createInstanceCard(entry, opts = {}) {
    const subject = DetailSubjectVM.resolveSpeciesSubject({ slug: entry.slug, species: entry.species });
    const resolved = subject.resolved;
    const displayName = UIModels.formatDisplayName(entry);
    const status = entry.status || /** @type {Partial<import('./types/contracts.js').BuildStatus>} */ ({});

    const card = buildCardElement({
      displayName: displayName || '',
      resolved,
      subtitle: entry.location || '',
      statusLabel: status.badgeKey || 'build',
      statusText: status.badgeLabel || 'Build',
      evSystems: getEvSystems(entry),
      trainedBadges: computeTrainedBadges(entry),
      flagsHtml: UIShared.renderFlagBadgesHtml(entry),
      badgeEntry: entry.decorations?.badgeEntry || entry,
      dotOpts: entry.decorations?.dotOptions || { slug: entry.slug, transferredToChampions: entry.transferredToChampions, inChampions: entry.inChampions, eventOrigin: entry.eventOrigin, fromGo: entry.fromGo, language: entry.language, shiny: entry.shiny, genned: entry.genned, gigantamax: entry.gigantamax, alpha: entry.alpha },
      item: null,
      nature: entry.nature,
      abilityLabel: DataManager.formatAbilityLabel(subject.slug, entry.ability),
      tera_type: entry.tera_type || undefined,
      buildData: entry,
      decoSource: entry,
      exportSource: entry,
      searchText: entry.searchText || '',
    }, opts);

    return card;
  }

  // Empty card for instances with no build data or species with no build
  /** @param {import('./types/contracts.js').BrowserEntry} entry @param {CardOptions} [opts] */
  function createEmptyCard(entry, opts = {}) {
    const resolved = DetailSubjectVM.resolveSpeciesSubject({ slug: entry.slug, species: entry.species }).resolved;
    const displayName = UIModels.formatDisplayName(entry);
    return buildCardElement({
      displayName: displayName || '',
      resolved,
      subtitle: entry.location || opts.subtitle || '',
      statusLabel: 'empty',
      empty: true,
      dotOpts: entry.decorations?.dotOptions || { slug: entry.slug, transferredToChampions: entry.transferredToChampions, inChampions: entry.inChampions, eventOrigin: entry.eventOrigin, fromGo: entry.fromGo, language: entry.language, shiny: entry.shiny, genned: entry.genned, gigantamax: entry.gigantamax, alpha: entry.alpha },
      decoSource: entry,
      searchText: entry.searchText || '',
    }, opts);
  }

  /** @param {FactoryBuildOption} set @returns {set is FactoryBuildOption & {build: import('./types/contracts.js').BuildState}} */
  function hasFactoryBuild(set) {
    return !!set.build;
  }

  /**
   * @param {string} speciesName
   * @param {(build: import('./types/contracts.js').BuildState) => void|Promise<void>} onPick
   */
  async function openFactorySetPicker(speciesName, onPick) {
    /** @type {Array<FactoryBuildOption & {build: import('./types/contracts.js').BuildState}>} */
    let sets = [];
    try {
      sets = (await DataManager.listFactorySets(speciesName)).filter(hasFactoryBuild);
    } catch (err) {
      Feedback.showToast(`Could not load factory sets: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const speciesResolved = DataManager.resolveSpecies(speciesName);
    const speciesSlug = speciesResolved?.slug || '';
    const overlay = document.createElement('div');
    overlay.className = 'showdown-paste-overlay factory-picker-overlay';
    let body = '';
    if (!sets.length) {
      body = `<p class="muted">No BSS factory sets exist for <strong>${escapeHtml(speciesName)}</strong>.</p>`;
    } else {
      body = '<div class="factory-picker-list">' + sets.map((set, index) => `
        <div class="factory-picker-card" data-idx="${index}">
          <div class="factory-picker-card-head">
            <strong>${escapeHtml(set.label)}</strong>
            ${set.weight ? `<span class="muted">weight ${set.weight}</span>` : ''}
          </div>
          <div class="factory-picker-card-body">
            ${set.build.nature ? `<span class="pill">${escapeHtml(set.build.nature)}</span>` : ''}
            ${set.build.ability ? `<span class="pill">${escapeHtml(DataManager.formatAbilityLabel(speciesSlug, set.build.ability))}</span>` : ''}
            ${set.build.item ? `<span class="pill">@ ${escapeHtml(set.build.item)}</span>` : ''}
            ${set.build.tera_type ? `<span class="pill">Tera ${escapeHtml(set.build.tera_type)}</span>` : ''}
          </div>
          <div class="factory-picker-card-moves">${(set.build.moves || []).map((move) => `<span class="move-pill">${escapeHtml(move)}</span>`).join('')}</div>
          <button type="button" class="btn btn-sm btn-primary factory-picker-apply" data-idx="${index}">Use this set</button>
        </div>
      `).join('') + '</div>';
    }
    overlay.innerHTML = `
      <div class="showdown-paste-modal factory-picker-modal">
        <div class="bulk-export-header">
          <h3>Factory sets · ${escapeHtml(speciesName)}</h3>
          <button type="button" class="bulk-export-close" aria-label="Close">×</button>
        </div>
        <div class="factory-picker-body">${body}</div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.bulk-export-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    for (const button of overlay.querySelectorAll('.factory-picker-apply')) {
      if (!(button instanceof HTMLElement)) continue;
      button.addEventListener('click', async () => {
        const index = parseInt(button.dataset.idx || '', 10);
        const set = sets[index];
        if (!set) return;
        close();
        try {
          await onPick(set.build);
        } catch (err) {
          Feedback.showToast(`Apply failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    }
  }

  /** @param {string} speciesSlug @param {(buildId: string) => void|Promise<void>} onPick */
  async function openTargetBuildPicker(speciesSlug, onPick) {
    const candidates = (DataManager.getAllBuilds() || []).filter((build) => {
      if (!speciesSlug) return true;
      return (build.slug || '').toLowerCase() === speciesSlug.toLowerCase();
    });
    const overlay = document.createElement('div');
    overlay.className = 'showdown-paste-overlay target-picker-overlay';
    let body = '';
    if (!candidates.length) {
      body = '<p class="muted">No Library Builds exist for this species yet. Create one first, or promote this Pokémon\'s Current Build.</p>';
    } else {
      body = '<div class="target-picker-list">' + candidates.map((build) => `
        <div class="target-picker-card">
          <div class="target-picker-card-head">
            <strong>${escapeHtml(build.notes || build.species || '(unnamed)')}</strong>
            ${build.item ? `<span class="muted">@ ${escapeHtml(build.item)}</span>` : ''}
          </div>
          <div class="target-picker-card-body">
            ${build.nature ? `<span class="pill">${escapeHtml(build.nature)}</span>` : ''}
            ${build.ability ? `<span class="pill">${escapeHtml(DataManager.formatAbilityLabel(DataManager.resolveSpecies(build.species)?.slug || '', build.ability))}</span>` : ''}
            ${build.tera_type ? `<span class="pill">Tera ${escapeHtml(build.tera_type)}</span>` : ''}
          </div>
          <button type="button" class="btn btn-sm btn-primary target-picker-apply" data-id="${escapeHtml(build.id || '')}">Use this build</button>
        </div>
      `).join('') + '</div>';
    }
    overlay.innerHTML = `
      <div class="showdown-paste-modal target-picker-modal">
        <div class="bulk-export-header">
          <h3>Pick target build</h3>
          <button type="button" class="bulk-export-close" aria-label="Close">×</button>
        </div>
        <div class="target-picker-body">${body}</div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.bulk-export-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    for (const button of overlay.querySelectorAll('.target-picker-apply')) {
      if (!(button instanceof HTMLElement)) continue;
      button.addEventListener('click', async () => {
        const id = button.dataset.id;
        if (!id) return;
        close();
        try {
          await onPick(id);
        } catch (err) {
          Feedback.showToast(`Set target failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    }
  }

  /**
   * @param {import('./types/contracts.js').BuildState} member
   * @param {import('./types/contracts.js').BuildState} build
   * @param {import('./types/contracts.js').EvSystem} evSystem
   */
  function renderBuildGap(member, build, evSystem) {
    const fields = [];
    /** @param {string|null|undefined} a @param {string|null|undefined} b */
    const cmp = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();
    const gapSlug = DataManager.resolveSpecies(member.species || build.species)?.slug || '';
    if (member.nature || build.nature) {
      fields.push({ label: 'Nature', recipe: member.nature || '—', build: build.nature || '—', match: cmp(member.nature, build.nature) });
    }
    if (member.ability || build.ability) {
      const recipeAbility = member.ability ? DataManager.formatAbilityLabel(gapSlug, member.ability) : '—';
      const buildAbility = build.ability ? DataManager.formatAbilityLabel(gapSlug, build.ability) : '—';
      fields.push({ label: 'Ability', recipe: recipeAbility, build: buildAbility, match: cmp(member.ability, build.ability) });
    }
    if (member.item || build.item) {
      fields.push({ label: 'Item', recipe: member.item || '—', build: build.item || '—', match: cmp(member.item, build.item) });
    }
    if (member.tera_type || build.tera_type) {
      fields.push({ label: 'Tera Type', recipe: member.tera_type || '—', build: build.tera_type || '—', match: cmp(member.tera_type, build.tera_type) });
    }

    const memberEvs = getEvsForSystem(member, evSystem || 'classic') || {};
    const buildEvs = getEvsForSystem(build, evSystem || 'classic') || {};
    const evKeys = /** @type {import('./types/contracts.js').StatKey[]} */ (['hp', 'atk', 'def', 'spa', 'spd', 'spe']);
    /** @type {Array<{stat: string, recipe: string|number, build: string|number}>} */
    const evDiffs = [];
    for (const key of evKeys) {
      const memberValue = memberEvs[key] || 0;
      const buildValue = buildEvs[key] || 0;
      if (memberValue !== buildValue) {
        evDiffs.push({ stat: key.toUpperCase(), recipe: memberValue, build: buildValue });
      }
    }
    const evsMatch = evDiffs.length === 0;

    const recipeMoves = (member.moves || []).map((move) => move.toLowerCase()).sort();
    const buildMoves = (build.moves || []).map((move) => move.toLowerCase()).sort();
    const missingFromBuild = recipeMoves.filter((move) => move && !buildMoves.includes(move));
    const extraInBuild = buildMoves.filter((move) => move && !recipeMoves.includes(move));
    const movesMatch = missingFromBuild.length === 0 && extraInBuild.length === 0;

    let html = '<div class="build-gap">';
    html += '<h4 class="build-gap-heading">Gap to target</h4>';
    for (const field of fields) {
      const cls = field.match ? 'build-gap-match' : 'build-gap-mismatch';
      html += `<div class="build-gap-row ${cls}">`;
      html += `<span class="build-gap-label">${escapeHtml(field.label)}</span>`;
      if (field.match) {
        html += `<span class="build-gap-value">${escapeHtml(field.recipe)}</span>`;
      } else {
        html += `<span class="build-gap-value">${escapeHtml(field.recipe)} <span class="build-gap-arrow">→</span> ${escapeHtml(field.build)}</span>`;
      }
      html += '</div>';
    }

    const evCls = evsMatch ? 'build-gap-match' : 'build-gap-mismatch';
    html += `<div class="build-gap-row ${evCls}">`;
    html += '<span class="build-gap-label">EVs</span>';
    if (evsMatch) {
      html += `<span class="build-gap-value">${escapeHtml(UIShared.formatCompactStatSpread(memberEvs, 'None'))}</span>`;
    } else {
      const diffParts = evDiffs.map((diff) => `${diff.stat}: ${diff.recipe}→${diff.build}`);
      html += `<span class="build-gap-value">${escapeHtml(diffParts.join(', '))}</span>`;
    }
    html += '</div>';

    const moveCls = movesMatch ? 'build-gap-match' : 'build-gap-mismatch';
    html += `<div class="build-gap-row ${moveCls}">`;
    html += '<span class="build-gap-label">Moves</span>';
    if (movesMatch) {
      html += '<span class="build-gap-value">All match</span>';
    } else {
      const parts = [];
      if (missingFromBuild.length) parts.push(`Have: ${missingFromBuild.map((move) => titleCase(move)).join(', ')}`);
      if (extraInBuild.length) parts.push(`Need: ${extraInBuild.map((move) => titleCase(move)).join(', ')}`);
      html += `<span class="build-gap-value">${escapeHtml(parts.join(' · '))}</span>`;
    }
    html += '</div>';
    html += '</div>';
    return html;
  }

  /** @param {import('./types/contracts.js').BuildState} build @param {number} index @param {number} total */
  function renderViewerBuild(build, index, total) {
    const displayName = UIModels.formatDisplayName(build);
    let html = `<div class="comp-section viewer-build-section viewer-build-card" data-build-id="${build.id || ''}">`;
    html += '<div class="viewer-build-card-header">';
    html += `<h3>${total > 1 ? `Build ${index + 1}` : 'Competitive Set'}</h3>`;
    if (build.item) {
      html += `<span class="viewer-build-card-item">@ ${escapeHtml(build.item)}</span>`;
    }
    html += '</div>';
    if (total > 1) {
      html += `<p class="comp-subtitle">${escapeHtml(displayName)}</p>`;
    }

    const evSystems = getEvSystems(build);
    const summaryParts = [];
    if (build.nature) summaryParts.push(`<span>${escapeHtml(build.nature)}</span>`);
    if (build.ability) {
      const buildSlug = DataManager.resolveSpecies(build.species)?.slug || '';
      summaryParts.push(`<span>${escapeHtml(DataManager.formatAbilityLabel(buildSlug, build.ability))}</span>`);
    }
    const primaryEvs = getEvsForSystem(build, evSystems[0] || 'classic');
    if (primaryEvs) summaryParts.push(`<span>${escapeHtml(UIShared.formatCompactStatSpread(primaryEvs, ''))}</span>`);
    if (summaryParts.length) {
      html += `<div class="viewer-build-card-summary">${summaryParts.join(' · ')}</div>`;
    }

    const battleReady = DataManager.anyInstanceMatchesBuild(build);
    const owned = DataManager.isBuildOwned(build);
    const badgeLabel = battleReady.ready ? 'battle-ready' : (owned ? 'owned' : 'build');
    const badgeText = battleReady.ready ? 'Battle Ready' : (owned ? 'Owned' : 'Build');
    html += '<div class="comp-badges-row">';
    html += `<span class="status-badge status-${badgeLabel}">${badgeText}</span>`;
    if (!battleReady.ready && battleReady.reason && owned) {
      html += ` <span class="status-reason muted" title="${escapeHtml(battleReady.reason)}">${escapeHtml(battleReady.reason)}</span>`;
    }
    if (build.id) {
      html += ` <button class="btn btn-xs btn-secondary viewer-build-edit" data-build-id="${build.id}">Edit</button>`;
      html += ` <button class="btn btn-xs btn-secondary viewer-build-clone" data-build-id="${build.id}">Clone</button>`;
      html += ` <button class="btn btn-xs btn-danger viewer-build-delete" data-build-id="${build.id}">Delete</button>`;
    }
    html += '</div>';

    if (build.form) {
      html += `<div class="comp-row"><span class="comp-label">Form</span><span class="comp-value">${escapeHtml(build.form)}</span></div>`;
    }

    html += renderBuildSummary(build, {
      showEvBars: true,
      showFinalStats: true,
      showMoves: true,
    });

    const blockId = `sd-${build.id || index}`;
    if (evSystems.length > 1) {
      const defaultSystem = 'classic';
      const altSystem = defaultSystem === 'classic' ? 'champions' : 'classic';
      html += '<h3 class="stat-heading">Showdown Export</h3>';
      html += `<div class="viewer-ev-toggle" data-block-id="${blockId}">
        <button class="btn btn-xs viewer-ev-sys-btn active" data-sys="${defaultSystem}">${defaultSystem}</button>
        <button class="btn btn-xs viewer-ev-sys-btn" data-sys="${altSystem}">${altSystem}</button>
      </div>`;
      html += `<div class="viewer-showdown-panels" data-block-id="${blockId}">`;
      html += `<div class="viewer-showdown-panel" data-sys="${defaultSystem}">${renderBuildShowdownBlock(build, `${blockId}-${defaultSystem}`, defaultSystem)}</div>`;
      html += `<div class="viewer-showdown-panel" data-sys="${altSystem}" hidden>${renderBuildShowdownBlock(build, `${blockId}-${altSystem}`, altSystem)}</div>`;
      html += '</div>';
    } else {
      html += '<h3 class="stat-heading">Showdown Export</h3>';
      html += renderBuildShowdownBlock(build, blockId, evSystems[0] || null);
    }

    html += '</div>';
    return html;
  }

  /** @param {ViewerContext} ctx */
  async function openPokemonViewer(ctx) {
    unsubscribeInstance?.();
    unsubscribeInstance = null;
    const requestRevision = DetailPanel.beginRequest();
    try {
      await DataManager.ensureEditorData();
    } catch (error) {
      if (!DetailPanel.isRequestCurrent(requestRevision)) return;
      console.error('[PokemonViewer] failed to load reference data', error);
      Feedback.showToast('Pokemon details could not be loaded.');
      return;
    }
    if (!DetailPanel.isRequestCurrent(requestRevision)) return;
    const subject = DetailSubjectVM.resolveSpeciesSubject(
      ctx.species || ctx.build || ctx.member || (ctx.slug ? { slug: ctx.slug } : null),
      { species: ctx.build?.species || ctx.member?.species || '', slug: ctx.species?.slug || '' }
    );
    const { speciesEntry, slug, dexId, speciesName } = subject;
    const teamSubmetaHtml = ctx.team && ctx.member
      ? `<p class="detail-submeta">${escapeHtml(ctx.team.archetype || '')}${ctx.team.team_id && ctx.team.ev_system === 'champions' ? ` · ID ${escapeHtml(ctx.team.team_id)}` : ''}</p>`
      : '';
    const teamPillsHtml = ctx.team?.ev_system
      ? `<div class="team-card-pills"><span class="ev-badge ${escapeHtml(ctx.team.ev_system)}">${escapeHtml(ctx.team.ev_system)}</span></div>`
      : '';

    let html = DetailViewerSurface.render({
      contextBadgeHtml: DetailSubjectVM.createViewerContextBadge(ctx),
      heroHtml: DetailHeroSection.renderPokemon(subject, {
        submetaHtml: teamSubmetaHtml,
        pillsHtml: teamPillsHtml,
      }),
    });

    /** @type {import('./types/contracts.js').InstanceModel|null} */
    let instance = null;
    /** @type {import('./types/contracts.js').BuildState|null} */
    let instanceStateFlat = null;
    if (ctx.boxId !== undefined && ctx.slotIdx !== undefined && DataManager.getInstance) {
      instance = DataManager.getInstance(ctx.boxId, ctx.slotIdx);
    }
    if (instance && instance.state) {
      const state = instance.state || {};
      instanceStateFlat = {
        nature: state.nature || undefined,
        ability: state.ability || undefined,
        item: state.item || undefined,
        tera_type: state.tera_type || undefined,
        moves: state.moves || [],
        evs: { classic: getEvsForSystem(state, 'classic') || {} },
      };

      html += '<div class="comp-section viewer-build-section viewer-build-card current-build-card">';
      html += '<div class="viewer-build-card-header">';
      html += '<h3>Current Build</h3>';
      html += `<span class="viewer-build-card-item">Box ${(ctx.boxId ?? 0) + 1} · Slot ${(ctx.slotIdx ?? 0) + 1}</span>`;
      html += '</div>';
      html += '<p class="muted current-build-help">The actual stats on this Pokémon. Edit anytime as you train it.</p>';
      const badgeEntry = {
        slug,
        transferredToChampions: !!state.transferred_to_champions,
        language: state.language,
        eventOrigin: !!state.event_origin,
        fromGo: !!state.from_go,
        shiny: !!state.shiny,
        genned: !!state.genned,
        gigantamax: !!state.gigantamax,
        alpha: !!state.alpha,
      };
      const currentBuildBadges = UIShared.renderEntryBadgesHtml(badgeEntry);
      if (currentBuildBadges) {
        html += `<div class="viewer-identity-badges">${currentBuildBadges}</div>`;
      }
      // Instance metadata editor (form, gender, ball, flags)
      html += InstanceMetadataSection.render({
        state,
        speciesSlug: slug,
        boxId: ctx.boxId,
        slotIdx: ctx.slotIdx,
      });
      html += renderBuildSummary(state, {
        instanceFields: true,
        showEvBars: true,
        showMoves: true,
      });
      html += '<div class="current-build-actions">';
      html += `<button type="button" class="btn btn-sm btn-primary" id="cb-edit-btn" data-box="${ctx.boxId}" data-slot="${ctx.slotIdx}">Edit</button>`;
      html += `<button type="button" class="btn btn-sm btn-secondary" id="cb-factory-btn" data-box="${ctx.boxId}" data-slot="${ctx.slotIdx}" data-species="${escapeHtml(state.species || speciesName || '')}">Pick from factory sets</button>`;
      const fullySpecified = state.nature && state.ability && Array.isArray(state.moves) && state.moves.filter(Boolean).length > 0;
      if (fullySpecified) {
        html += `<button type="button" class="btn btn-sm btn-secondary" id="cb-promote-btn" data-box="${ctx.boxId}" data-slot="${ctx.slotIdx}">Promote to Library Build</button>`;
      }
      html += '</div>';

      const targetBuild = instance.target_build_id ? DataManager.getBuild(instance.target_build_id) : null;
      html += '<div class="current-build-target">';
      if (targetBuild) {
        const targetName = targetBuild.notes ? targetBuild.notes : (targetBuild.species + (targetBuild.item ? ` @ ${targetBuild.item}` : ''));
        html += `<span class="muted">Target Build:</span> <strong>${escapeHtml(targetName)}</strong> `;
        html += `<button type="button" class="btn btn-xs btn-link" id="cb-change-target-btn" data-box="${ctx.boxId}" data-slot="${ctx.slotIdx}">change</button>`;
        html += ` · <button type="button" class="btn btn-xs btn-link" id="cb-clear-target-btn" data-box="${ctx.boxId}" data-slot="${ctx.slotIdx}">clear</button>`;
      } else {
        html += '<span class="muted">No target build set.</span> ';
        html += `<button type="button" class="btn btn-xs btn-link" id="cb-set-target-btn" data-box="${ctx.boxId}" data-slot="${ctx.slotIdx}" data-slug="${escapeHtml(slug || '')}">Set a target build…</button>`;
      }
      html += '</div>';
      html += '</div>';
    }

    /** @type {import('./types/contracts.js').BuildState[]} */
    let allBuilds;
    if (ctx.build?.id && !ctx.species) {
      allBuilds = [ctx.build];
    } else if (ctx.member?.build_id) {
      const build = DataManager.getBuild(ctx.member.build_id);
      allBuilds = build ? [build] : [];
    } else if (instance?.target_build_id) {
      const build = DataManager.getBuild(instance.target_build_id);
      allBuilds = build ? [build] : [];
    } else {
      allBuilds = dexId ? DataManager.getCompetitiveSets(Number(dexId)) : (slug ? DataManager.getAllBuilds().filter((build) => build.slug === slug) : []);
    }

    if (allBuilds.length) {
      const ownedCount = allBuilds.filter((build) => DataManager.isBuildOwned(build)).length;
      const readyCount = instance && instanceStateFlat
        ? allBuilds.filter((build) => DataManager.buildsMatch(instance.state, build).match).length
        : allBuilds.filter((build) => DataManager.anyInstanceMatchesBuild(build).ready).length;
      const toBuildCount = allBuilds.length - ownedCount;
      const isLinkedView = !!(ctx.build?.id && !ctx.species) || !!(ctx.member?.build_id || instance?.target_build_id);
      const heading = isLinkedView ? (instance?.target_build_id ? 'Target Build' : 'Library Build') : 'Library Builds';
      const buildLabel = UIShared.pluralize(allBuilds.length, 'build');
      html += `
        <div class="build-summary">
          <h3>${escapeHtml(heading)}</h3>
          <div class="summary-pills">
            <span class="summary-pill">${allBuilds.length} ${buildLabel}</span>
            <span class="summary-pill">${readyCount} battle-ready</span>
            ${isLinkedView ? '' : `<span class="summary-pill">${toBuildCount} to build</span>`}
          </div>
        </div>`;

      html += allBuilds.map((build, index) => {
        let buildHtml = renderViewerBuild(build, index, allBuilds.length);
        if (instance && instanceStateFlat && instance.target_build_id === build.id) {
          buildHtml += renderBuildGap(instanceStateFlat, build, build.ev_system || 'classic');
        }
        return buildHtml;
      }).join('');
    } else if (instance) {
      const candidates = dexId ? DataManager.getCompetitiveSets(Number(dexId)) : (slug ? DataManager.getAllBuilds().filter((build) => build.slug === slug) : []);
      if (candidates.length) {
        html += `<p class="muted pokemon-viewer-empty-note">No target build set. <button type="button" class="btn btn-xs btn-link" id="cb-set-target-btn-2" data-box="${ctx.boxId}" data-slot="${ctx.slotIdx}" data-slug="${escapeHtml(slug || '')}">Pick one of the ${candidates.length} ${UIShared.pluralize(candidates.length, 'Library Build')} for this species</button>.</p>`;
      } else {
        html += '<p class="muted pokemon-viewer-empty-note">No Library Builds exist for this species yet — promote this Pokémon\'s Current Build, or create one with the button below.</p>';
      }
    }

    const showNewBuildBtn = slug && !(instance?.target_build_id || ctx.member?.build_id);
    if (showNewBuildBtn) {
      html += `<button class="btn btn-primary btn-block" id="new-build-species-btn">+ New Library Build for ${escapeHtml(speciesName)}</button>`;
    }

    if (speciesEntry?.baseStats) {
      html += renderBaseStats(speciesEntry.baseStats);
    }

    const content = DetailViewerSurface.mount(html, {
      onBeforeClose: () => {
        unsubscribeInstance?.();
        unsubscribeInstance = null;
      },
    });

    // Mount instance metadata editor (ball picker, gender toggle, flag checkboxes)
    InstanceMetadataSection.mount(content);

    const contextBoxId = ctx.boxId;
    const contextSlotIdx = ctx.slotIdx;
    if (typeof contextBoxId === 'number' && typeof contextSlotIdx === 'number'
      && Number.isInteger(contextBoxId) && Number.isInteger(contextSlotIdx)) {
      unsubscribeInstance = EntityStore.subscribe('inventory', (event) => {
        const changed = event.change.slots?.some(
          (slot) => slot.boxId === contextBoxId && slot.slotIdx === contextSlotIdx
        );
        if (!changed) return;
        unsubscribeInstance?.();
        unsubscribeInstance = null;
        const freshOccupant = DataManager.getSlot(contextBoxId, contextSlotIdx);
        const freshSpeciesId = freshOccupant?.species_id || ctx.slug;
        const freshResolved = DataManager.resolveSpecies(freshSpeciesId);
        const linkedBuildId = typeof freshOccupant?.target_build_id === 'string' ? freshOccupant.target_build_id : null;
        openPokemonViewer({
          slug: String(freshResolved.slug || freshSpeciesId || ''),
          boxId: contextBoxId,
          slotIdx: contextSlotIdx,
          build: linkedBuildId ? DataManager.getBuild(linkedBuildId) : null,
        });
      });
    }

    const editBtn = content.querySelector('#cb-edit-btn');
    if (editBtn instanceof HTMLElement) {
      editBtn.addEventListener('click', () => {
        const boxId = parseInt(editBtn.dataset.box || '', 10);
        const slotIdx = parseInt(editBtn.dataset.slot || '', 10);
        openInstanceEditor(boxId, slotIdx, {
          onSaved: () => openPokemonViewer(ctx),
          onCancel: () => openPokemonViewer(ctx),
        });
      });
    }

    const factoryBtn = content.querySelector('#cb-factory-btn');
    if (factoryBtn instanceof HTMLElement) {
      factoryBtn.addEventListener('click', async () => {
        const boxId = parseInt(factoryBtn.dataset.box || '', 10);
        const slotIdx = parseInt(factoryBtn.dataset.slot || '', 10);
        const speciesNameForPicker = factoryBtn.dataset.species || speciesName;
        await openFactorySetPicker(speciesNameForPicker, async (build) => {
          await DataManager.updateSlotBuild(boxId, slotIdx, build);
          openPokemonViewer(ctx);
        });
      });
    }

    const promoteBtn = content.querySelector('#cb-promote-btn');
    if (promoteBtn instanceof HTMLElement) {
      promoteBtn.addEventListener('click', async () => {
        const boxId = parseInt(promoteBtn.dataset.box || '', 10);
        const slotIdx = parseInt(promoteBtn.dataset.slot || '', 10);
        if (!await Feedback.showConfirm(
          'Promote this Pokémon\'s Current Build to a new Library Build?',
          { title: 'Promote Build', detail: 'If an identical Library Build already exists, it will be reused instead of duplicated.', confirmLabel: 'Promote' }
        )) return;
        try {
          const libraryBuild = await DataManager.promoteInstanceBuildToLibrary(boxId, slotIdx);
          if (libraryBuild) openPokemonViewer(ctx);
        } catch (err) {
          Feedback.showToast(`Promote failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    }

    /** @param {HTMLElement} button */
    const setTargetHandler = async (button) => {
      const boxId = parseInt(button.dataset.box || '', 10);
      const slotIdx = parseInt(button.dataset.slot || '', 10);
      const speciesSlugAttr = button.dataset.slug || slug;
      await openTargetBuildPicker(speciesSlugAttr, async (buildId) => {
        await DataManager.setTargetBuild(boxId, slotIdx, buildId);
        openPokemonViewer(ctx);
      });
    };
    const setTargetBtn = content.querySelector('#cb-set-target-btn');
    if (setTargetBtn instanceof HTMLElement) setTargetBtn.addEventListener('click', () => setTargetHandler(setTargetBtn));
    const changeTargetBtn = content.querySelector('#cb-change-target-btn');
    if (changeTargetBtn instanceof HTMLElement) changeTargetBtn.addEventListener('click', () => setTargetHandler(changeTargetBtn));
    const setTargetBtn2 = content.querySelector('#cb-set-target-btn-2');
    if (setTargetBtn2 instanceof HTMLElement) setTargetBtn2.addEventListener('click', () => setTargetHandler(setTargetBtn2));
    const clearTargetBtn = content.querySelector('#cb-clear-target-btn');
    if (clearTargetBtn instanceof HTMLElement) {
      clearTargetBtn.addEventListener('click', async () => {
        const boxId = parseInt(clearTargetBtn.dataset.box || '', 10);
        const slotIdx = parseInt(clearTargetBtn.dataset.slot || '', 10);
        try {
          await DataManager.clearTargetBuild(boxId, slotIdx);
          openPokemonViewer(ctx);
        } catch (err) {
          Feedback.showToast(`Clear failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    }

    const newBuildBtn = content.querySelector('#new-build-species-btn');
    if (newBuildBtn) {
      newBuildBtn.addEventListener('click', () => {
        void openBuildEditorForm(null, slug, {
          editContext: 'library',
          onSaved: () => openPokemonViewer(ctx),
          onCancel: () => openPokemonViewer(ctx),
        });
      });
    }

    for (const button of content.querySelectorAll('.viewer-build-edit')) {
      if (!(button instanceof HTMLElement)) continue;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const buildId = button.dataset.buildId;
        if (!buildId) return;
        const build = DataManager.getBuild(buildId);
        if (!build) return;
        void openBuildEditorForm(build, build.slug, {
          editContext: 'library',
          onSaved: () => openPokemonViewer(ctx),
          onCancel: () => openPokemonViewer(ctx),
        });
      });
    }

    for (const button of content.querySelectorAll('.viewer-build-clone')) {
      if (!(button instanceof HTMLElement)) continue;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const buildId = button.dataset.buildId;
        if (!buildId) return;
        const source = DataManager.getBuild(buildId);
        if (!source) return;
        const clone = { ...source, id: undefined, owned: false, notes: `Cloned from ${source.species}` };
        void openBuildEditorForm(clone, clone.slug, {
          editContext: 'library',
          onSaved: () => openPokemonViewer(ctx),
          onCancel: () => openPokemonViewer(ctx),
        });
      });
    }

    for (const button of content.querySelectorAll('.viewer-build-delete')) {
      if (!(button instanceof HTMLElement)) continue;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (button.dataset.buildId) void deleteLibraryBuild(button.dataset.buildId);
      });
    }

    for (const button of content.querySelectorAll('.viewer-copy-btn')) {
      if (!(button instanceof HTMLElement)) continue;
      button.addEventListener('click', () => {
        const blockEl = button.closest('.viewer-showdown-block');
        const pre = blockEl?.querySelector('.pokepaste-preview');
        if (!pre) return;
        UIShared.flashCopyFeedback(pre.textContent || '', button, { successText: 'Copied!', cssClass: 'is-copied' });
      });
    }

    for (const toggle of content.querySelectorAll('.viewer-ev-toggle')) {
      if (!(toggle instanceof HTMLElement)) continue;
      const blockId = toggle.dataset.blockId;
      const panels = content.querySelector(`.viewer-showdown-panels[data-block-id="${blockId}"]`);
      for (const button of toggle.querySelectorAll('.viewer-ev-sys-btn')) {
        if (!(button instanceof HTMLElement)) continue;
        button.addEventListener('click', () => {
          const system = button.dataset.sys;
          toggle.querySelectorAll('.viewer-ev-sys-btn').forEach((candidate) => candidate.classList.remove('active'));
          button.classList.add('active');
          panels?.querySelectorAll('.viewer-showdown-panel').forEach((panel) => {
            if (!(panel instanceof HTMLElement)) return;
            panel.hidden = panel.dataset.sys !== system;
          });
        });
      }
    }
  }

  return { openPokemonViewer, createLibraryBuildCard, createInstanceCard, createEmptyCard, openInstanceEditor };
})();
