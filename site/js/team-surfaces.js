import { AppRoutes } from './app-routes.js';
import { BuildUIHelpers } from './build-ui-helpers.js';
import { DataManager } from './data.js';
import { DomainMappers } from './domain-mappers.js';
import { EvConvert } from './ev-convert.js';
import { ExportUI } from './export-ui.js';
import { PokemonViewer } from './pokemon-viewer.js';
import { Router } from './router.js';
import { Selection } from './selection.js';
import { ShowdownParser } from './showdown-parser.js';
import { TeamExportFormatter } from './team-export.js';
import { UIShared } from './ui-shared.js';
import {
  requireElement,
  requireFormField as requireField,
  requireInput,
  requireSelect,
} from './ui/dom.js';
import { Feedback } from './ui/feedback.js';
import { KeyedList } from './ui/keyed-list.js';
import { DetailHeroSection } from './ui/sections/detail-hero-section.js';
import { DetailEditorSurface } from './ui/surfaces/detail-editor-surface.js';
import { DetailPanel } from './ui/surfaces/detail-panel.js';
import { DetailViewerSurface } from './ui/surfaces/detail-viewer-surface.js';
import { FormErrors } from './ui/widgets/form-errors.js';
import { MoveEditorWidget } from './ui/widgets/move-editor-widget.js';
import { StatEditorWidget } from './ui/widgets/stat-editor-widget.js';

/**
 * team-surfaces.js - Team list, detail, import, and editor surfaces.
 */

export const TeamSurfaces = (() => {
  /** @typedef {{target?: HTMLElement|null, onSaved?: (() => void)|null, onCancel?: (() => void)|null}} TeamFormOptions */

  const {
    STAT_NAMES,
    renderNatureOptions,
    formatSpeciesItem,
    formatMoveItem,
    syncAbilitySelect,
    validateEvSpread,
    escapeHtml,
    pluralize,
    formatCompactStatSpread,
    renderStatBars,
    createAutocomplete,
    createTeamExportSurface,
    highlightShowdownText,
  } = UIShared;
  const { open: openPanel, close: closePanel } = DetailPanel;
  const { showToast } = Feedback;
  const { showFormErrors, showFormApiBanner } = FormErrors;
  const { getEvsForSystem, getIvsForSystem } = BuildUIHelpers;
  const { getSpreadConfig, renderSpreadFields, createBudgetUpdater } = StatEditorWidget;
  const { renderSimpleFields, wireSpeciesMoveAutocomplete } = MoveEditorWidget;
  const {
    CHAMPIONS_PER_STAT_CAP = 32,
    CHAMPIONS_TOTAL_CAP = 66,
    CLASSIC_PER_STAT_CAP = 252,
    CLASSIC_TOTAL_CAP = 510,
  } = EvConvert || {};
  const MAX_TEAM_MEMBERS = 6;
  const MAX_MOVES = 4;
  const MOVE_SLOT_INDEXES = Array.from({ length: MAX_MOVES }, (_, index) => index);

  /** @param {import('./types/contracts.js').ParsedShowdownSet[]} sets @returns {import('./types/contracts.js').EvSystem} */
  function detectImportedEvSystem(sets) {
    const spreads = sets
      .map((set) => set.evs)
      .filter((spread) => spread && Object.keys(spread).length);
    if (!spreads.length) return 'classic';
    const statKeys = /** @type {import('./types/contracts.js').StatKey[]} */ (Object.keys(STAT_NAMES));
    /** @param {import('./types/contracts.js').StatSpread} spread */
    const isChampionsSpread = (spread) => {
      const values = statKeys.map((key) => Number(spread[key] || 0));
      const total = values.reduce((sum, value) => sum + value, 0);
      return values.every((value) => value <= CHAMPIONS_PER_STAT_CAP) && total <= CHAMPIONS_TOTAL_CAP;
    };
    return spreads.every(isChampionsSpread) ? 'champions' : 'classic';
  }

  /** @param {import('./types/contracts.js').Team[]} teams */
  function renderTeams(teams) {
    const container = document.getElementById('teams-container');
    if (!container) return;

    if (teams.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <h3>No teams yet</h3>
        <p>Paste a Showdown export or build one from scratch.</p>
        <div class="empty-state-actions">
          <button class="btn btn-primary" id="teams-empty-import">📋 Paste from Showdown</button>
          <button class="btn btn-secondary" id="teams-empty-create">+ New Team</button>
        </div>`;
      container.replaceChildren(empty);
      empty.querySelector('#teams-empty-import')?.addEventListener('click', () => openTeamImportPanel());
      empty.querySelector('#teams-empty-create')?.addEventListener('click', () => openTeamForm(null));
      return;
    }

    let header = container.querySelector('.team-section-header');
    let grid = container.querySelector('.team-grid');
    if (!header || !grid) {
      header = document.createElement('div');
      header.className = 'team-section-header';
      header.innerHTML = `
        <h2 class="team-section-title">Teams</h2>
        <span class="team-section-count"></span>
        <button type="button" class="btn btn-secondary btn-sm" id="import-team-btn" title="Paste a Showdown team export">📋 Paste from Showdown</button>
        <button type="button" class="btn btn-primary btn-sm" id="new-team-btn">+ New Team</button>`;
      header.querySelector('#import-team-btn')?.addEventListener('click', () => openTeamImportPanel());
      header.querySelector('#new-team-btn')?.addEventListener('click', () => openTeamForm(null));
      grid = document.createElement('div');
      grid.className = 'team-grid';
      container.replaceChildren(header, grid);
    }
    const count = header.querySelector('.team-section-count');
    if (count) count.textContent = `${teams.length} ${pluralize(teams.length, 'team')}`;

    const sorted = [...teams].sort((a, b) => {
      const aUser = a.source === 'user' ? 0 : 1;
      const bUser = b.source === 'user' ? 0 : 1;
      return aUser - bUser;
    });

    const allBuilds = DataManager.getAllBuilds();
    if (!(grid instanceof HTMLElement)) return;
    KeyedList.reconcile(grid, sorted, {
      key: (team) => team.id || team.team_id || team.name || 'team',
      signature: (team) => JSON.stringify({
        team,
        selected: getTeamBuildIds(team).map((id) => Selection.has(id)),
        owned: getTeamOwnedMembers(team, allBuilds),
      }),
      render: (team) => createTeamCard(team, allBuilds),
    });
  }

  /** @param {import('./types/contracts.js').Team} team */
  function getTeamBuildIds(team) {
    return (team.members || []).flatMap((member) => member.build_id ? [member.build_id] : []);
  }

  /** @param {import('./types/contracts.js').Team} team @param {import('./types/contracts.js').BuildState[]} allBuilds */
  function getTeamOwnedMembers(team, allBuilds) {
    return (team.members || []).map((member) => {
      const slug = DataManager.resolveSpecies(member).slug;
      return allBuilds.some((build) => build.slug === slug && DataManager.isBuildOwned(build));
    });
  }

  /** @param {import('./types/contracts.js').Team} team @param {import('./types/contracts.js').BuildState[]} allBuilds */
  function createTeamCard(team, allBuilds) {
    const card = document.createElement('article');
    card.className = 'team-card team-card--compact team-card--clickable';
    card.dataset.searchText = [
      team.name,
      team.creator,
      team.archetype,
      team.team_id,
      team.mega,
      ...(team.members || []).map((member) => member.species),
    ].filter(Boolean).join(' ').toLowerCase();

    const evBadge = UIShared.renderEvSystemBadge(team.ev_system || 'classic');
    const isUser = team.source === 'user';

    const members = team.members || [];
    const ownedCount = getTeamOwnedMembers(team, allBuilds).filter(Boolean).length;
    const completenessLabel = `${ownedCount}/${members.length} owned`;
    const completenessClass = ownedCount === members.length && members.length > 0
      ? 'completeness-badge--full'
      : 'completeness-badge--partial';

    const memberSprites = members.map((member) => {
      const resolved = DataManager.resolveSpecies(member);
      const buildId = member.build_id || '';
      const isSelected = buildId && Selection.has(buildId);
      const badge = isSelected ? '<span class="sprite-select-badge" aria-hidden="true">✓</span>' : '';
      const name = resolved.name || member.species || '';
      return `<span class="team-sprite-icon-wrap"${buildId ? ` data-build-id="${escapeHtml(buildId)}"` : ''} title="${escapeHtml(name)}${buildId ? ' — click to select' : ''}">${badge}${UIShared.spriteImgHtml(resolved, name, { cls: 'team-sprite-icon' })}</span>`;
    }).join('');

    const teamBuildIds = getTeamBuildIds(team);
    const allTeamSelected = teamBuildIds.length > 0 && teamBuildIds.every((id) => Selection.has(id));
    const someTeamSelected = teamBuildIds.some((id) => Selection.has(id));
    const selectAllLabel = !someTeamSelected
      ? `Select all ${teamBuildIds.length}`
      : (allTeamSelected ? 'Deselect all' : 'Select remaining');
    const exportText = TeamExportFormatter.formatTeam(team);

    card.innerHTML = `
      <div class="team-card-header">
        <div class="team-card-info">
          <h2 class="team-card-title team-card-title--wrap">${escapeHtml(team.name || '—')}</h2>
          ${team.creator ? `<p class="team-card-creator">by ${escapeHtml(team.creator)}</p>` : ''}
          <p class="team-card-meta">${escapeHtml(team.archetype || '')}</p>
          ${team.team_id ? `<button class="team-id-badge" type="button" data-team-id="${escapeHtml(team.team_id)}" title="Copy team code">ID: ${escapeHtml(team.team_id)}</button>` : ''}
        </div>
        <div class="team-card-pills">
          ${evBadge}${!isUser ? '<span class="team-badge-imported">Imported</span>' : ''}
          <span class="completeness-badge ${completenessClass}">${completenessLabel}</span>
        </div>
      </div>
      <div class="team-card-bottom">
        <div class="team-sprite-strip">${memberSprites || '<span class="team-no-members">No members</span>'}</div>
        <div class="team-card-actions">
          ${teamBuildIds.length ? `<button class="team-select-toggle${allTeamSelected ? ' is-all' : ''}" type="button" title="Toggle selection for this team's builds">${escapeHtml(selectAllLabel)}</button>` : ''}
          ${teamBuildIds.length ? '<button class="btn-icon team-export-btn" title="Export team builds with target-game conversion">Export…</button>' : ''}
          <button class="btn-icon team-copy-btn" title="Copy Showdown text">Copy</button>
          ${isUser ? '<button class="btn-icon team-edit-btn" title="Edit">Edit</button><button class="btn-icon btn-icon--danger team-delete-btn" title="Delete">Del</button>' : ''}
          ${!isUser ? '<button class="btn-icon team-clone-btn" title="Clone">Clone</button>' : ''}
        </div>
      </div>
      <details class="team-card-export">
        <summary class="team-card-export-toggle">Showdown export</summary>
        <pre class="team-export-highlighted team-export-highlighted--compact">${highlightShowdownText(exportText)}</pre>
      </details>
    `;

    card.addEventListener('click', () => openTeamDetail(team));
    card.querySelector('.team-card-export')?.addEventListener('click', (event) => event.stopPropagation());

    card.querySelector('.team-copy-btn')?.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!(event.currentTarget instanceof HTMLElement)) return;
      await UIShared.flashCopyFeedback(
        TeamExportFormatter.formatTeam(team),
        event.currentTarget,
        { successText: 'Copied!', cssClass: 'is-copied', duration: 1800 }
      );
    });
    card.querySelector('.team-edit-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      openTeamForm(team);
    });
    card.querySelector('.team-delete-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteTeam(team.id);
    });
    card.querySelector('.team-clone-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      cloneTeam(team);
    });

    card.querySelectorAll('.team-sprite-icon-wrap[data-build-id]').forEach((wrap) => {
      wrap.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = wrap.getAttribute('data-build-id');
        if (id) Selection.toggle(id);
      });
    });

    card.querySelector('.team-select-toggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (allTeamSelected) Selection.removeMany(teamBuildIds);
      else Selection.addMany(teamBuildIds);
    });

    card.querySelector('.team-export-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const builds = members
        .map((member) => DomainMappers.createBuildCandidateFromTeamMember(member, team.ev_system || 'classic'))
        .filter(Boolean);
      if (!builds.length) return;
      const label = team.name || team.creator || team.team_id || 'Untitled';
      ExportUI.openBulkExportModal(builds, { title: `Export team: ${label}` });
    });

    card.querySelector('.team-id-badge')?.addEventListener('click', async (event) => {
      event.stopPropagation();
      const badge = event.currentTarget;
      if (!(badge instanceof HTMLElement)) return;
      await UIShared.flashCopyFeedback(badge.dataset.teamId || '', badge);
    });

    return card;
  }

  /** @param {import('./types/contracts.js').Team} team */
  function openTeamDetail(team) {
    const isUser = team.source === 'user';
    const evBadge = UIShared.renderEvSystemBadge(team.ev_system || 'classic');
    const heroHtml = DetailHeroSection.renderSimple({
      title: team.name || '—',
      subtitleHtml: `<p class="detail-dex">${escapeHtml(team.archetype || 'Unknown')}${team.creator ? ` · by ${escapeHtml(team.creator)}` : ''}</p>`,
      pillsHtml: `<div class="team-card-pills team-card-pills--centered">
        ${evBadge}
        ${team.team_id && team.ev_system === 'champions' ? `<span class="summary-pill">ID: ${escapeHtml(team.team_id)}</span>` : ''}
        ${team.cloned_from ? '<span class="summary-pill">Cloned</span>' : ''}
      </div>`,
    });
    const bodyHtml = `
      <div class="detail-actions">
        <button class="btn btn-sm btn-secondary" id="td-rename-btn">Rename</button>
        ${isUser ? '<button class="btn btn-sm btn-primary" id="td-edit-btn">Edit</button>' : ''}
        ${isUser ? '<button class="btn btn-sm btn-danger" id="td-delete-btn">Delete</button>' : ''}
        ${!isUser ? '<button class="btn btn-sm btn-secondary" id="td-clone-btn">Clone</button>' : ''}
      </div>
      ${team.notes ? `<div class="comp-section"><h3>Notes</h3><p>${escapeHtml(team.notes)}</p></div>` : ''}
      <div class="team-detail-export-anchor"></div>
      <div class="comp-section">
        <h3>Members (${(team.members || []).length})</h3>
        <div class="team-detail-members"></div>
      </div>
    `;

    const html = DetailViewerSurface.render({
      contextBadgeHtml: '<div class="detail-context-badge">Team</div>',
      heroHtml,
      bodyHtml,
    });

    const content = DetailViewerSurface.mount(html);
    content.querySelector('.team-detail-export-anchor')?.replaceWith(createTeamExportSurface(team));

    const membersContainer = requireElement(content, '.team-detail-members');
    const allBuilds = DataManager.getAllBuilds();
    for (const member of (team.members || [])) {
      const memberCard = document.createElement('div');
      memberCard.className = 'team-detail-member-card';
      const resolved = DataManager.resolveSpecies(member);
      const slug = resolved.slug || DataManager.speciesSlug(member.species);
      const speciesName = resolved.name || member.species || '';
      const matchingBuilds = allBuilds.filter((build) => build.slug === slug);
      const matchedOwnedCount = matchingBuilds.filter((build) => DataManager.isBuildOwned(build)).length;
      const buildBadge = matchingBuilds.length > 0
        ? `<span class="build-xref build-xref--tracked">✓ ${matchingBuilds.length} ${pluralize(matchingBuilds.length, 'build')}${matchedOwnedCount > 0 ? ` · ${matchedOwnedCount} owned` : ''}</span> <a href="#" class="build-xref-link" data-xref-species="${escapeHtml(slug)}">View builds →</a>`
        : '<span class="build-xref build-xref--none">No matching build</span>';

      const memberIvs = getIvsForSystem(member, 'classic');
      const memberEvs = getEvsForSystem(member, team.ev_system || 'classic') || {};
      const ivSection = team.ev_system === 'classic' && memberIvs
        ? `<div class="team-detail-member-ivs"><span class="comp-label">IVs</span>${renderStatBars(memberIvs, 'iv')}</div>`
        : '';

      memberCard.innerHTML = `
        <div class="team-detail-member-top">
          ${UIShared.spriteImgHtml(resolved, speciesName, { cls: 'team-member-sprite' })}
          <div>
            <strong>${escapeHtml(speciesName)}</strong>
            <span class="detail-submeta">${escapeHtml(member.item || '')}${member.nature ? ` · ${escapeHtml(member.nature)}` : ''}</span>
          </div>
        </div>
        <div class="team-detail-member-info">
          <span class="comp-label">Ability:</span> ${escapeHtml(DataManager.formatAbilityLabel(slug, member.ability) || 'None')}
          · <span class="comp-label">EVs:</span> ${escapeHtml(formatCompactStatSpread(memberEvs, 'None'))}
        </div>
        ${ivSection}
        <div class="team-member-moves">
          ${(member.moves || []).slice(0, MAX_MOVES).map((move) => `<span>${escapeHtml(move)}</span>`).join('')}
        </div>
        <div class="team-detail-member-xref">${buildBadge}</div>
      `;
      memberCard.style.cursor = 'pointer';
      memberCard.style.position = 'relative';

      const memberCopyBtn = document.createElement('button');
      memberCopyBtn.className = 'btn-icon member-copy-btn';
      memberCopyBtn.title = 'Copy Showdown text';
      memberCopyBtn.textContent = '📋';
      memberCopyBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const memberBuild = { ...member, slug, ev_system: team.ev_system };
        await UIShared.flashCopyFeedback(
          TeamExportFormatter.formatMember(memberBuild),
          memberCopyBtn,
          { successText: '✓', failText: '✗', duration: 1500 }
        );
      });
      memberCard.appendChild(memberCopyBtn);

      memberCard.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('.build-xref-link')) return;
        PokemonViewer.openPokemonViewer({ team, member });
      });
      memberCard.querySelector('.build-xref-link')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        PokemonViewer.openPokemonViewer({ slug });
      });
      membersContainer.appendChild(memberCard);
    }

    content.querySelector('#td-edit-btn')?.addEventListener('click', () => {
      closePanel();
      openTeamForm(team);
    });
    content.querySelector('#td-rename-btn')?.addEventListener('click', () => renameTeam(team));
    content.querySelector('#td-delete-btn')?.addEventListener('click', () => deleteTeam(team.id));
    content.querySelector('#td-clone-btn')?.addEventListener('click', () => cloneTeam(team));
  }

  /** @param {string|undefined} teamId */
  async function deleteTeam(teamId) {
    if (!teamId) return;
    if (!await Feedback.showConfirm('Delete this team? This cannot be undone.', { title: 'Delete Team', confirmLabel: 'Delete' })) return;
    try {
      await DataManager.deleteTeam(teamId);
      closePanel();
    } catch (err) {
      Feedback.showToast(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** @param {import('./types/contracts.js').Team} team */
  async function renameTeam(team) {
    const current = team.name || '';
    const next = await Feedback.showPrompt('Team name (leave blank for none):', current, { placeholder: 'Team name…' });
    if (next === null) return;
    const trimmed = next.trim();
    const newName = trimmed === '' ? null : trimmed;
    if (newName === (team.name || null)) return;
    const payload = DomainMappers.createTeamStorage({ ...team, name: newName || '' });
    if (!team.id) return;
    try {
      await DataManager.updateTeam(team.id, payload);
      closePanel();
      showToast(`Renamed team to "${newName ?? '—'}"`);
    } catch (err) {
      Feedback.showToast(`Rename failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** @param {import('./types/contracts.js').Team} team */
  function cloneTeam(team) {
    /** @type {import('./types/contracts.js').Team} */
    const clone = {
      ...team,
      id: undefined,
      source: 'user',
      cloned_from: team.id,
      name: `${team.name || team.creator || 'Team'} (Copy)`,
      members: (team.members || []).map((member) => ({
        ...member,
        evs: JSON.parse(JSON.stringify(member.evs || {})),
        ivs: { ...(member.ivs || {}) },
        moves: [...(member.moves || [])],
      })),
    };

    const cloneMembers = clone.members || (clone.members = []);
    while (cloneMembers.length < MAX_TEAM_MEMBERS) cloneMembers.push({ species: '', item: '', ability: '', nature: '', moves: [], evs: {} });
    openTeamForm(clone);
  }

  function openTeamImportPanel() {
    const html = `
      <div class="detail-context-badge">Import Team</div>
      <form id="team-import-form" class="build-form team-form" novalidate>
        <div class="form-group">
          <label for="ti-name">Team Name <span class="form-help">(optional — defaults to first member)</span></label>
          <input type="text" id="ti-name" placeholder="e.g. My Sun Team" autocomplete="off">
        </div>
        <div class="form-group">
          <label for="ti-paste">Paste Showdown export</label>
          <textarea id="ti-paste" rows="14" placeholder="Paste a Showdown team export here…
Example:
Charizard @ Charizardite Y
Ability: Blaze
Level: 50
Tera Type: Fire
EVs: 4 HP / 252 SpA / 252 Spe
Modest Nature
- Heat Wave
- Solar Beam
- Protect
- Tailwind" class="team-import-textarea" autocomplete="off" spellcheck="false"></textarea>
        </div>
        <div id="ti-preview" class="form-help team-import-preview"></div>
        <div id="ti-errors" class="form-error hidden"></div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="ti-submit" disabled>Import Team</button>
          <button type="button" class="btn btn-secondary" id="ti-cancel">Cancel</button>
        </div>
      </form>
    `;

    const content = openPanel(html);
    const nameInput = requireInput(content, '#ti-name');
    const pasteInput = /** @type {HTMLTextAreaElement} */ (requireField(content, '#ti-paste'));
    const preview = requireElement(content, '#ti-preview');
    const errorBox = requireElement(content, '#ti-errors');
    const submitBtn = /** @type {HTMLButtonElement} */ (requireElement(content, '#ti-submit'));

    function updatePreview() {
      const text = pasteInput.value.trim();
      errorBox.classList.add('hidden');
      errorBox.textContent = '';
      if (!text) {
        preview.textContent = '';
        submitBtn.disabled = true;
        return;
      }
      const sets = ShowdownParser.parseTeam(text);
      if (sets.length === 0) {
        preview.textContent = 'No Pokémon detected.';
        submitBtn.disabled = true;
        return;
      }
      preview.textContent = `Detected ${sets.length} Pokémon: ${sets.map((set) => set.species).filter(Boolean).join(', ')}`;
      submitBtn.disabled = false;
    }

    pasteInput.addEventListener('input', updatePreview);
    requireElement(content, '#ti-cancel').addEventListener('click', () => closePanel());

    requireElement(content, '#team-import-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.classList.add('hidden');
      const text = pasteInput.value.trim();
      const sets = ShowdownParser.parseTeam(text);
      if (sets.length === 0) {
        errorBox.textContent = 'Could not parse any Pokémon from the paste.';
        errorBox.classList.remove('hidden');
        return;
      }

      const detectedEvSystem = detectImportedEvSystem(sets);
      const members = sets.slice(0, MAX_TEAM_MEMBERS).map((set, index) => DomainMappers.createTeamStorageMember({
        slot: index + 1,
        species: set.species,
        item: set.item || '',
        ability: set.ability || '',
        nature: set.nature || '',
        moves: set.moves || [],
        evs: set.evs || {},
        ivs: set.ivs || {},
        tera_type: set.teraType || '',
        level: set.level,
        ball: set.ball || '',
        nickname: set.nickname || '',
        gender: set.gender || '',
        shiny: !!set.shiny,
        gigantamax: !!set.gigantamax,
      }, detectedEvSystem)).filter((member) => member.species);

      const teamName = nameInput.value.trim() || (sets[0].species ? `${sets[0].species} Team` : 'Imported Team');
      const teamData = DomainMappers.createTeamStorage({
        source: 'user',
        name: teamName,
        creator: '',
        archetype: '',
        ev_system: detectedEvSystem,
        team_id: '',
        notes: '',
        members,
      });

      submitBtn.disabled = true;
      submitBtn.textContent = 'Importing…';
      try {
        await DataManager.createTeam(teamData);
        closePanel();
        showToast(`Imported "${teamName}" (${members.length} ${pluralize(members.length, 'member')})`);
      } catch (err) {
        errorBox.textContent = `Import failed: ${err instanceof Error ? err.message : String(err)}`;
        errorBox.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Import Team';
      }
    });

    pasteInput.focus();
  }

  /**
   * @param {import('./types/contracts.js').Team|null|undefined} existingTeam
   * @param {TeamFormOptions} [opts]
   */
  function openTeamForm(existingTeam, opts = {}) {
    const { target, onSaved, onCancel } = opts;
    const isEdit = !!(existingTeam && existingTeam.id);
    const isFullPage = !!target;
    /** @type {import('./types/contracts.js').Team} */
    const team = existingTeam ? JSON.parse(JSON.stringify(existingTeam)) : {
      source: 'user',
      name: '',
      creator: '',
      archetype: '',
      ev_system: 'champions',
      team_id: '',
      notes: '',
      members: Array.from({ length: MAX_TEAM_MEMBERS }, (_, index) => ({ slot: index + 1 })),
    };
    if (!team.members) team.members = [];

    const evSys = team.ev_system || 'champions';
    const isChampions = evSys === 'champions';

    let bodyHtml = `
      <form id="team-form" class="build-form team-form" novalidate>
        <div class="form-group">
          <label>Team Name</label>
          <input type="text" id="tf-name" value="${escapeHtml(team.name || '')}" placeholder="e.g. My Sun Team" autocomplete="off" required>
        </div>
        <div class="form-row">
          <div class="form-group form-group--half">
            <label>Archetype</label>
            <input type="text" id="tf-archetype" value="${escapeHtml(team.archetype || '')}" placeholder="e.g. Sun, Trick Room" autocomplete="off">
          </div>
          <div class="form-group form-group--half">
            <label>Creator</label>
            <input type="text" id="tf-creator" value="${escapeHtml(team.creator || '')}" placeholder="Creator name" autocomplete="off">
          </div>
        </div>
        <div class="form-group">
          <label>EV System</label>
          <div class="form-radio-group">
            <label class="form-radio-label"><input type="radio" name="tf-ev-system" value="champions" ${isChampions ? 'checked' : ''}> Champions (0-${CHAMPIONS_PER_STAT_CAP}, total ${CHAMPIONS_TOTAL_CAP})</label>
            <label class="form-radio-label"><input type="radio" name="tf-ev-system" value="classic" ${!isChampions ? 'checked' : ''}> Classic (0-${CLASSIC_PER_STAT_CAP}, total ${CLASSIC_TOTAL_CAP})</label>
          </div>
        </div>
        <div class="form-group${!isChampions ? ' hidden' : ''}" id="tf-team-id-group">
          <label>Team ID</label>
          <input type="text" id="tf-team-id" value="${escapeHtml(team.team_id || '')}" placeholder="e.g. NFVS4SYCW2" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea id="tf-notes" rows="2" placeholder="Optional notes...">${escapeHtml(team.notes || '')}</textarea>
        </div>

        <div class="team-form-members-header">
          <h3>Members (${team.members.length}/${MAX_TEAM_MEMBERS})</h3>
          <button type="button" class="btn btn-sm btn-secondary" id="tf-add-member" ${team.members.length >= MAX_TEAM_MEMBERS ? 'disabled' : ''}>+ Add Member</button>
        </div>
        <div id="tf-members-container"></div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Team'}</button>
          <button type="button" class="btn btn-secondary" id="tf-cancel">Cancel</button>
        </div>
      </form>
    `;

    const html = DetailEditorSurface.render({
      isFullPage,
      isEdit,
      noun: 'Team',
      backButtonId: 'tf-back',
      bodyHtml,
    });

    const content = DetailEditorSurface.mount(html, {
      target: isFullPage ? target : null,
    });

    if (isFullPage) {
      DetailEditorSurface.bindBack(content, '#tf-back', () => {
        if (onCancel) onCancel();
        else Router.navigate(AppRoutes.hashes.teams);
      });
    }

    const evRadios = content.querySelectorAll('input[name="tf-ev-system"]');
    const teamIdGroup = requireElement(content, '#tf-team-id-group');
    evRadios.forEach((radio) => {
      if (!(radio instanceof HTMLInputElement)) return;
      radio.addEventListener('change', () => {
        const system = /** @type {import('./types/contracts.js').EvSystem} */ (
          requireInput(content, 'input[name="tf-ev-system"]:checked').value
        );
        teamIdGroup.classList.toggle('hidden', system !== 'champions');
        refreshMemberEvInputs(content, system);
      });
    });

    const membersContainer = requireElement(content, '#tf-members-container');

    /** @param {import('./types/contracts.js').TeamMember} member @param {number} index */
    function renderMemberSlot(member, index) {
      const system = /** @type {import('./types/contracts.js').EvSystem} */ (
        requireInput(content, 'input[name="tf-ev-system"]:checked').value
      );
      const { maxEv, totalEv } = getSpreadConfig(system);
      const memberEvs = getEvsForSystem(member, system) || {};
      const memberIvs = getIvsForSystem(member, 'classic') || {};

      const slot = document.createElement('div');
      slot.className = 'team-member-form';
      slot.innerHTML = `
        <div class="team-member-form-header">
          <h4>Slot ${index + 1}</h4>
          <div class="team-member-form-actions">
            <button type="button" class="btn btn-sm btn-secondary tf-move-up" title="Move up" ${index === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="btn btn-sm btn-secondary tf-move-down" title="Move down">▼</button>
            <button type="button" class="btn btn-sm btn-danger tf-remove-member" data-idx="${index}">Remove</button>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group form-group--half">
            <label>Species</label>
            <input type="text" class="tf-m-species" value="${escapeHtml(member.species || '')}" placeholder="Search species..." autocomplete="off">
          </div>
          <div class="form-group form-group--half">
            <label>Item</label>
            <input type="text" class="tf-m-item" value="${escapeHtml(member.item || '')}" placeholder="Search items..." autocomplete="off">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group form-group--half">
            <label>Ability</label>
            <select class="tf-m-ability"></select>
          </div>
          <div class="form-group form-group--half">
            <label>Nature</label>
            <select class="tf-m-nature">
              ${renderNatureOptions(member.nature || '')}
            </select>
          </div>
        </div>
        ${renderSpreadFields({
          prefix: 'tf-m',
          system,
          evs: memberEvs,
          ivs: memberIvs,
          statNames: STAT_NAMES,
        })}
        <h5 class="stat-heading">Moves</h5>
        ${renderSimpleFields(member.moves || [], {
          inputClassPrefix: 'tf-m-move',
          labelPrefix: 'Move',
          placeholder: 'Search moves...',
          escapeHtml,
        })}
      `;

      membersContainer.appendChild(slot);

      const speciesInput = requireInput(slot, '.tf-m-species');
      const abilitySelect = requireSelect(slot, '.tf-m-ability');

      function getMemberSpeciesSlug() {
        const species = speciesInput.value.trim();
        if (!species) return '';
        const resolved = DataManager.resolveSpecies(species);
        return resolved.entry ? resolved.slug : '';
      }

      function refreshAbilitySelect(selectedAbility = abilitySelect.value) {
        return syncAbilitySelect(abilitySelect, speciesInput.value.trim(), selectedAbility);
      }

      createAutocomplete(speciesInput, (query) => DataManager.searchSpecies(query)
        .filter((entry) => entry != null), {
        onSelect: (item) => {
          member.slug = item.slug;
          refreshAbilitySelect(abilitySelect.value);
        },
        formatItem: formatSpeciesItem,
      });
      createAutocomplete(requireInput(slot, '.tf-m-item'), (query) => DataManager.searchItems(query));
      refreshAbilitySelect(member.ability || '');
      speciesInput.addEventListener('input', () => {
        refreshAbilitySelect();
      });
      speciesInput.addEventListener('blur', () => {
        refreshAbilitySelect();
      });
      wireSpeciesMoveAutocomplete(
        MOVE_SLOT_INDEXES.map((moveIndex) => requireInput(slot, `.tf-m-move-${moveIndex}`)),
        getMemberSpeciesSlug,
        (slug, query) => DataManager.searchMovesForSpecies(slug, query),
        { formatItem: formatMoveItem }
      );

      const evInputs = Object.keys(STAT_NAMES).map((key) => requireInput(slot, `.tf-m-ev-${key}`));
      const updateEvTotal = createBudgetUpdater(evInputs, {
        maxPerStat: maxEv,
        maxTotal: totalEv,
        totalEl: requireElement(slot, '.tf-m-ev-total'),
      });
      evInputs.forEach((input) => input.addEventListener('input', updateEvTotal));
      updateEvTotal();

      requireElement(slot, '.tf-remove-member').addEventListener('click', () => {
        slot.remove();
        refreshMemberNumbers(content);
      });
      requireElement(slot, '.tf-move-up').addEventListener('click', () => {
        const slots = Array.from(membersContainer.querySelectorAll('.team-member-form'));
        const currentIndex = slots.indexOf(slot);
        if (currentIndex <= 0) return;
        membersContainer.insertBefore(slot, slots[currentIndex - 1]);
        refreshMemberNumbers(content);
      });
      requireElement(slot, '.tf-move-down').addEventListener('click', () => {
        const slots = Array.from(membersContainer.querySelectorAll('.team-member-form'));
        const currentIndex = slots.indexOf(slot);
        if (currentIndex >= slots.length - 1) return;
        membersContainer.insertBefore(slots[currentIndex + 1], slot);
        refreshMemberNumbers(content);
      });
    }

    for (let i = 0; i < team.members.length; i += 1) {
      renderMemberSlot(team.members[i], i);
    }

    requireElement(content, '#tf-add-member').addEventListener('click', () => {
      const currentCount = membersContainer.querySelectorAll('.team-member-form').length;
      if (currentCount >= MAX_TEAM_MEMBERS) return;
      renderMemberSlot({}, currentCount);
      refreshMemberNumbers(content);
    });

    requireElement(content, '#tf-cancel').addEventListener('click', () => {
      if (isFullPage) {
        if (onCancel) onCancel();
        else Router.navigate(AppRoutes.hashes.teams);
      } else {
        closePanel();
      }
    });

    requireElement(content, '#team-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = requireElement(content, '#team-form');
      /** @type {Array<{input?: HTMLElement|null, message: string}>} */
      const errors = [];

      const nameEl = requireInput(content, '#tf-name');
      const name = nameEl.value.trim();
      if (!name) {
        errors.push({ input: nameEl, message: 'Team name is required.' });
      }

      const system = /** @type {import('./types/contracts.js').EvSystem} */ (
        requireInput(content, 'input[name="tf-ev-system"]:checked').value
      );
      const memberSlots = membersContainer.querySelectorAll('.team-member-form');
      /** @type {import('./types/contracts.js').TeamMember[]} */
      const members = [];

      for (let i = 0; i < memberSlots.length; i += 1) {
        const slot = memberSlots[i];
        const species = requireInput(slot, '.tf-m-species').value.trim();
        if (!species) continue;

        const evResult = validateEvSpread((key) => requireInput(slot, `.tf-m-ev-${key}`), system);
        errors.push(...evResult.errors);

        /** @type {import('./types/contracts.js').IvSpread} */
        const ivs = {};
        if (system === 'classic') {
          for (const key of Object.keys(STAT_NAMES)) {
            const statKey = /** @type {import('./types/contracts.js').StatKey} */ (key);
            const ivEl = requireInput(slot, `.tf-m-iv-${statKey}`);
            const ivVal = ivEl.value.trim() !== '' ? Number(ivEl.value) : 31;
            ivs[statKey] = ivVal;
            if (ivVal < 0 || ivVal > 31) {
              errors.push({ input: ivEl, message: 'Must be 0-31' });
            }
          }
        }

        const existingMember = team.members?.[i];
        members.push(DomainMappers.createTeamStorageMember({
          slot: i + 1,
          build_id: existingMember?.build_id || null,
          species,
          item: requireInput(slot, '.tf-m-item').value.trim(),
          ability: requireSelect(slot, '.tf-m-ability').value.trim(),
          nature: requireSelect(slot, '.tf-m-nature').value,
          evs: evResult.evs,
          ...(system === 'classic' ? { ivs } : {}),
          moves: MOVE_SLOT_INDEXES.map((moveIndex) => requireInput(slot, `.tf-m-move-${moveIndex}`).value.trim()).filter(Boolean),
        }, system));
      }

      if (!showFormErrors(form, errors)) return;

      const payload = DomainMappers.createTeamStorage({
        ...team,
        name,
        source: 'user',
        creator: requireInput(content, '#tf-creator').value.trim(),
        archetype: requireInput(content, '#tf-archetype').value.trim(),
        ev_system: system,
        team_id: system === 'champions' ? requireInput(content, '#tf-team-id').value.trim() : '',
        notes: requireField(content, '#tf-notes').value.trim(),
        members,
        cloned_from: team.cloned_from || null,
      });

      try {
        if (isEdit) {
          if (team.id) await DataManager.updateTeam(team.id, payload);
        } else {
          await DataManager.createTeam(payload);
        }
        if (isFullPage) {
          if (onSaved) onSaved();
          else Router.navigate(AppRoutes.hashes.teams);
        } else {
          closePanel();
        }
      } catch (err) {
        showFormApiBanner(form, `Save failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  }

  /** @param {HTMLElement} content */
  function refreshMemberNumbers(content) {
    const members = content.querySelectorAll('.team-member-form');
    members.forEach((slot, index) => {
      const heading = slot.querySelector('h4');
      if (heading) heading.textContent = `Slot ${index + 1}`;
      const removeBtn = slot.querySelector('.tf-remove-member');
      if (removeBtn instanceof HTMLElement) removeBtn.dataset.idx = String(index);
      const upBtn = slot.querySelector('.tf-move-up');
      if (upBtn instanceof HTMLButtonElement) upBtn.disabled = index === 0;
      const downBtn = slot.querySelector('.tf-move-down');
      if (downBtn instanceof HTMLButtonElement) downBtn.disabled = index === members.length - 1;
    });
    const addBtn = content.querySelector('#tf-add-member');
    if (addBtn instanceof HTMLButtonElement) addBtn.disabled = members.length >= MAX_TEAM_MEMBERS;
    const header = content.querySelector('.team-form-members-header h3');
    if (header) header.textContent = `Members (${members.length}/${MAX_TEAM_MEMBERS})`;
  }

  /** @param {HTMLElement} content @param {import('./types/contracts.js').EvSystem} system */
  function refreshMemberEvInputs(content, system) {
    const { maxEv, stepEv, totalEv } = getSpreadConfig(system);

    const members = content.querySelectorAll('.team-member-form');
    members.forEach((slot) => {
      const evInputs = slot.querySelectorAll('.tf-m-ev');
      evInputs.forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        input.max = String(maxEv);
        input.step = String(stepEv);
      });
      const evHeading = slot.querySelector('.stat-heading--ev');
      if (evHeading) evHeading.innerHTML = `EVs <span class="form-hint">(0-${maxEv}, total ≤ ${totalEv})</span>`;

      let ivsGrid = slot.querySelector('.tf-m-ivs-grid');
      const ivsHeading = ivsGrid ? ivsGrid.previousElementSibling : null;
      if (system === 'champions') {
        if (ivsGrid instanceof HTMLElement) ivsGrid.style.display = 'none';
        if (ivsHeading instanceof HTMLElement && ivsHeading.textContent.includes('IV')) ivsHeading.style.display = 'none';
      } else {
        if (ivsGrid instanceof HTMLElement) {
          ivsGrid.style.display = '';
        } else {
          const movesHeading = Array.from(slot.querySelectorAll('.stat-heading')).find((heading) => heading.textContent.includes('Moves'));
          if (movesHeading) {
            movesHeading.insertAdjacentHTML('beforebegin', `
              <h5 class="stat-heading">IVs <span class="form-hint">(0-31)</span></h5>
              <div class="form-stat-grid tf-m-ivs-grid">
                ${Object.entries(STAT_NAMES).map(([key, label]) => `
                  <div class="form-stat">
                    <label>${label}</label>
                    <input type="number" class="tf-m-iv tf-m-iv-${key}" value="31" min="0" max="31">
                  </div>
                `).join('')}
              </div>
            `);
          }
          ivsGrid = slot.querySelector('.tf-m-ivs-grid');
        }
        if (ivsHeading instanceof HTMLElement && ivsHeading.textContent.includes('IV')) ivsHeading.style.display = '';
      }

      const totalEl = slot.querySelector('.tf-m-ev-total');
      if (totalEl instanceof HTMLElement) {
        const total = Array.from(evInputs).reduce(
          (sum, input) => sum + (input instanceof HTMLInputElement ? Number(input.value || 0) : 0),
          0
        );
        totalEl.textContent = `Total: ${total}/${totalEv}`;
        totalEl.style.color = total > totalEv ? 'var(--accent-red)' : '';
      }
    });
  }

  return {
    renderTeams,
    openTeamDetail,
    openTeamForm,
    openTeamImportPanel,
  };
})();
