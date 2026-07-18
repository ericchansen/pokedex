import { DataManager } from '../../data.js';
import { DomainMappers } from '../../domain-mappers.js';
import { FormMetadata } from '../../form-metadata.js';
import { SlotSelection } from '../../slot-selection.js';
import { SpeciesResolver } from '../../species-resolver.js';
import { UIModels } from '../../ui-models.js';
import { UIShared } from '../../ui-shared.js';

/** @param {{dragDrop: ReturnType<import('./drag-drop-controller.js').createDragDropController>, getRovingSlot: () => {boxId: number, slotIdx: number}}} options */
export function createSlotRenderer({ dragDrop, getRovingSlot }) {
  // ── IV badge helper ───────────────────────────────────
  const IV_STAT_KEYS = DomainMappers.STAT_KEYS;

  /**
   * @param {import('../../types/contracts.js').IvSpread|null|undefined} ivs
   * @param {string|null|undefined} nature
   */
  function getIvBadgeLabel(ivs, nature) {
    if (!ivs || typeof ivs !== 'object') return null;
    const defined = IV_STAT_KEYS.filter(k => typeof ivs[k] === 'number');
    if (defined.length === 0) return null;

    const perfect = defined.filter(k => ivs[k] === 31 || ivs[k] === 0);
    const imperfect = defined.filter(k => ivs[k] !== 31 && ivs[k] !== 0);

    // 6 IV: all 6 stats defined and each is 31 or 0
    if (defined.length === 6 && perfect.length === 6) return '6';

    // 5P: exactly 5 perfect, the imperfect stat is the nature's minus stat
    if (perfect.length === 5 && imperfect.length === 1) {
      const effect = DataManager.getNatureEffect(nature || '');
      if (effect?.minus && imperfect[0] === effect.minus) return '5P';
    }
    // 5P alt: only 5 IVs defined (6th omitted = don't care), the missing stat is nature's minus
    if (defined.length === 5 && perfect.length === 5) {
      const missing = IV_STAT_KEYS.find(k => typeof ivs[k] !== 'number');
      const effect = DataManager.getNatureEffect(nature || '');
      if (effect?.minus && missing === effect.minus) return '5P';
    }

    // 1–5: count of good IVs (not already covered by 5P)
    if (perfect.length >= 1) return String(perfect.length);

    return null;
  }

  // ── State-aware sprite resolution ─────────────────────
  /**
   * Prepend state-aware sprite slugs to a resolved object's candidates.
   * Driven by FormMetadata registry — no per-dimension if-blocks.
   */
  /**
   * @param {import('../../types/contracts.js').SpeciesResolution} resolved
   * @param {import('../../types/contracts.js').BuildState|Partial<Record<import('../../types/contracts.js').FormMetadataKey, import('../../types/contracts.js').InputValue>>|null|undefined} state
   */
  function applyStatefulSprites(resolved, state) {
    if (!state || !resolved) return resolved;
    const base = resolved.spriteCandidates || [resolved.slug];
    const prepend = FormMetadata.buildSpriteCandidates(state, resolved.slug);
    if (prepend.length) {
      resolved.spriteCandidates = [...new Set([...prepend, ...base])];
    }
    return resolved;
  }

  /** @param {HTMLElement} slot */
  function getSlotStateDetails(slot) {
    /** @type {string[]} */
    const states = [];
    /** @param {string} label */
    const add = (label) => states.push(label);

    switch (slot.dataset.preset) {
      case 'match':
        add('Correct preset placement');
        break;
      case 'mismatch':
        add('Wrong preset slot');
        break;
      case 'owned-elsewhere':
        add('Matching Pokémon is owned in another slot');
        break;
      default:
        if (slot.classList.contains('preset-ghost')) {
          add('Expected by the active preset');
        }
        break;
    }

    if (slot.dataset.border === 'complete') add('Documentation complete');
    else if (slot.dataset.border === 'partial') add('Documentation partial');

    if (slot.dataset.trained === 'full') add('Fully trained');
    else if (slot.dataset.trained === 'partial') add('Ready to train');

    return states;
  }

  /**
   * @param {HTMLElement} slot
   * @param {{boxId: number, slotIdx: number, name?: string, occupied?: boolean}} options
   */
  function finalizeSlotAccessibility(slot, { boxId, slotIdx, name = '', occupied = false }) {
    const states = getSlotStateDetails(slot);
    const location = `Box ${boxId + 1}, slot ${slotIdx + 1}`;
    const compactBadges = [
      slot.querySelector('.slot-iv-badge'),
      slot.querySelector('.slot-egg-badge'),
    ].filter((badge) => badge instanceof HTMLElement);
    const badgeDetails = compactBadges.map((badge) => badge.title).filter(Boolean);
    compactBadges.forEach((badge) => badge.setAttribute('aria-hidden', 'true'));
    slot.querySelectorAll('img').forEach((image) => {
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
    });
    let subject = occupied ? name : 'Empty';
    let action = 'Press Enter to place a Pokémon.';
    if (slot.classList.contains('preset-ghost')) {
      subject = `Expected ${name}`;
      action = 'Press Enter to place this Pokémon.';
    } else if (occupied) {
      action = 'Press Enter for details. Press Space to select.';
    }

    slot.setAttribute('role', 'gridcell');
    slot.setAttribute('aria-rowindex', String(Math.floor(slotIdx / 6) + 1));
    slot.setAttribute('aria-colindex', String((slotIdx % 6) + 1));
    slot.setAttribute('aria-label', subject);
    slot.setAttribute('aria-description', [location, ...badgeDetails, ...states, action].filter(Boolean).join('. '));
    if (occupied) slot.setAttribute('aria-selected', String(SlotSelection.has(boxId, slotIdx)));
    slot.tabIndex = getRovingSlot().boxId === boxId && getRovingSlot().slotIdx === slotIdx ? 0 : -1;

  }


  // ── Slot creation ─────────────────────────────────────

  /**
   * @param {import('../../types/contracts.js').SlotView} occupant
   * @param {number} boxId
   * @param {number} slotIdx
   * @param {import('../../types/contracts.js').PresetTarget|null|undefined} presetTarget
   */
  function createOccupiedSlot(occupant, boxId, slotIdx, presetTarget) {
    const rawId = occupant.species_id ?? '';
    const presetPid = presetTarget?.pid || null;
    // species_id is now form-preserving (e.g. "floette-yellow" not "floette").
    // Legacy fallback: old data may have collapsed species_id — use preset to recover form.
    let resolved = DataManager.resolveSpecies(rawId);
    if (presetPid && resolved.spriteCandidates?.[0] === resolved.slug) {
      const cleanPid = presetPid.replace(/--.*$/, '');
      const presetResolved = DataManager.resolveSpecies(cleanPid);
      if (presetResolved.slug === resolved.slug) {
        resolved = presetResolved;
      }
    }

    const entry = resolved.entry;
    const slug = resolved.slug || String(rawId);
    const name = resolved.name || slug;

    const slot = document.createElement('div');
    slot.className = 'slot occupied';
    slot.dataset.boxId = String(boxId);
    slot.dataset.slotIdx = String(slotIdx);
    slot.dataset.speciesId = slug;
    // Search text: include display name, slug, and entry name for broad matching
    slot.dataset.searchText = [name, slug, entry?.name].filter(Boolean).join(' ').toLowerCase();

    const builds = entry ? DataManager.getCompetitiveSets(entry.num) : [];
    if (builds.length) slot.classList.add('has-builds');

    if (presetTarget) {
      const presetResult = DataManager.slotMatchesPreset(occupant, presetTarget);
      slot.dataset.preset = presetResult ? 'match' : 'mismatch';
    }

    const state = occupant.state || {};
    if (state.genned) {
      slot.classList.add('is-genned');
      const scanlines = document.createElement('div');
      scanlines.className = 'genned-scanlines';
      slot.appendChild(scanlines);
    }
    applyStatefulSprites(resolved, state);
    const dotOpts = UIModels.buildEntryDecorations({
      slug,
      inChampions: !!state.transferred_to_champions,
      transferredToChampions: !!state.transferred_to_champions,
      eventOrigin: !!state.event_origin,
      fromGo: !!state.from_go,
      language: state.language,
      shiny: !!state.shiny,
      genned: !!state.genned,
      gigantamax: !!state.gigantamax,
      alpha: !!state.alpha,
    }, { slug, inChampions: !!state.transferred_to_champions }).dotOptions;
    const spriteFragment = document.createElement('div');
    spriteFragment.innerHTML = UIShared.spriteWithDotsHtml(resolved, name, { width: 40, height: 40, loading: 'lazy' }, dotOpts);
    while (spriteFragment.firstChild) slot.appendChild(spriteFragment.firstChild);

    // IV badge (upper-left): "6", "5P", or count of good IVs (1-5)
    const ivLabel = getIvBadgeLabel(state.ivs, state.nature);
    if (ivLabel) {
      const ivBadge = document.createElement('span');
      ivBadge.className = 'slot-iv-badge';
      ivBadge.textContent = ivLabel;
      const ivTitle = ivLabel === '6' ? '6 Perfect IVs'
        : ivLabel === '5P' ? '5 Perfect IVs (optimized)'
        : `${ivLabel} Good IV${ivLabel === '1' ? '' : 's'}`;
      ivBadge.title = ivTitle;
      slot.appendChild(ivBadge);
    }

    // Egg move badge (upper-right): count with egg emoji
    const linkedBuild = occupant.target_build_id ? DataManager.getBuild(occupant.target_build_id) : null;
    const rawEggMoves = linkedBuild?.egg_moves?.length ? linkedBuild.egg_moves : state.egg_moves;
    const eggMoves = (rawEggMoves || []).filter(Boolean);
    if (eggMoves.length > 0) {
      const eggBadge = document.createElement('span');
      eggBadge.className = 'slot-egg-badge';
      eggBadge.textContent = `${eggMoves.length}`;
      eggBadge.title = `${eggMoves.length} Egg Move${eggMoves.length > 1 ? 's' : ''}`;
      slot.appendChild(eggBadge);
    }

    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip';
    // Tooltip shows the template's spec if present, not the instance's full state.
    // This keeps ghost and occupied tooltips consistent — both show what the template defines.
    const tooltipState = presetTarget?.requires || presetTarget?.defaults
      ? { ...(presetTarget.defaults || {}), ...(presetTarget.requires || {}) }
      : null;
    tooltip.textContent = name + (tooltipState ? FormMetadata.buildTooltipSuffix(tooltipState, resolved.slug) : '');
    slot.appendChild(tooltip);

    // FR-2.4: drag & drop between slots
    dragDrop.attachDragSource(slot, boxId, slotIdx);
    dragDrop.attachDropTarget(slot, boxId, slotIdx);

    UIShared.applyEntryDecorations(slot, state);
    finalizeSlotAccessibility(slot, { boxId, slotIdx, name: tooltip.textContent, occupied: true });

    return slot;
  }

  /**
   * @param {number} boxId
   * @param {number} slotIdx
   * @param {import('../../types/contracts.js').PresetTarget|null|undefined} presetTarget
   */
  function createEmptySlot(boxId, slotIdx, presetTarget) {
    const slot = document.createElement('div');
    slot.className = 'slot empty';
    slot.dataset.boxId = String(boxId);
    slot.dataset.slotIdx = String(slotIdx);

    // FR-2.3a/b empty-slot semantics:
    //   • Templated (preset ghost): click → open reference viewer for the expected species.
    //     Right-click / long-press still opens placement so users can actually place a mon.
    //   • Untemplated: click → open placement search (current behaviour preserved).
    // Store parsed preset info as data attributes for delegated event handlers.
    // requires + defaults are serialized as JSON so the click handler can seed
    // placementState generically — no per-dimension if checks.
    if (presetTarget?.pid) {
      slot.dataset.presetPid = presetTarget.pid;
      slot.dataset.presetSpeciesKey = presetTarget.speciesKey || '';
      if (presetTarget.requires && Object.keys(presetTarget.requires).length) {
        slot.dataset.presetRequires = JSON.stringify(presetTarget.requires);
      }
      if (presetTarget.defaults && Object.keys(presetTarget.defaults).length) {
        slot.dataset.presetDefaults = JSON.stringify(presetTarget.defaults);
      }
    }

    if (presetTarget?.pid) {
      const resolved = DataManager.resolveSpecies(presetTarget.speciesKey || presetTarget.pid);
      const slug = resolved.slug || DataManager.normalizePresetSlug(presetTarget.speciesKey || presetTarget.pid);
      const name = presetTarget.species || resolved.name || (presetTarget.pid).replace(/-/g, ' ');

      // Ghost sprite state: union of requires + defaults (data-driven, no per-field if's)
      const ghostState = { ...(presetTarget.defaults || {}), ...(presetTarget.requires || {}) };
      applyStatefulSprites(resolved, ghostState);

      slot.classList.add('preset-ghost');
      slot.dataset.speciesId = slug;
      slot.dataset.searchText = [name, slug, presetTarget.pid].filter(Boolean).join(' ').toLowerCase();

      // Owned-elsewhere: yellow if a matching Pokémon exists in inventory but in a different slot.
      // Uses the same slotMatchesPreset function as occupied-slot matching — one source of truth.
      const ownedCheckSlug = resolved.matchedDirect
        ? slug
        : SpeciesResolver.normalizeHyphenSlug(presetTarget.speciesKey || presetTarget.pid);
      const candidates = DataManager.getSlotsBySpecies(ownedCheckSlug);
      const ownedCount = candidates.filter(pos => {
        const inv = DataManager.getSlot(pos.box, pos.slot);
        return inv && DataManager.slotMatchesPreset(inv, presetTarget);
      }).length;
      if (ownedCount > 0) {
        slot.dataset.preset = 'owned-elsewhere';
      }

      const spriteFragment = document.createElement('div');
      spriteFragment.innerHTML = UIShared.spriteWithDotsHtml(resolved, name,
        { cls: 'ghost-sprite', width: 40, height: 40, loading: 'lazy' },
        { slug });
      while (spriteFragment.firstChild) slot.appendChild(spriteFragment.firstChild);

      const tooltip = document.createElement('span');
      tooltip.className = 'tooltip';
      tooltip.textContent = name + FormMetadata.buildTooltipSuffix(ghostState, slug);
      slot.appendChild(tooltip);
    }

    // FR-2.4: empty slot is also a valid drop target
    dragDrop.attachDropTarget(slot, boxId, slotIdx);
    const emptyName = slot.querySelector('.tooltip')?.textContent || '';
    finalizeSlotAccessibility(slot, { boxId, slotIdx, name: emptyName, occupied: false });

    return slot;
  }

  return { createOccupiedSlot, createEmptySlot };
}
