/**
 * form-metadata.js — Single registry for all form-variant metadata dimensions.
 *
 * Each key in FORM_METADATA represents a metadata dimension that:
 *   - Persists in instance state/identity (via FORM_EXTRA_FIELDS)
 *   - Is compared during preset matching (via normalize)
 *   - May appear in tooltips (via tooltip)
 *   - May affect sprite selection (via sprite)
 *   - May render a placement-UI control (via placement)
 *
 * ADDING A NEW DIMENSION:
 *   1. Add an entry here.
 *   2. Add preset JSON entries with `requires: { newKey: value }`.
 *   That's it. Storage roundtrip, matching, tooltips, sprites, and
 *   placement UI all derive from this registry.
 */
import { GENDER_SPRITE_SPECIES } from './species-constants.js';

export const FormMetadata = (() => {
  /** @param {import('./types/contracts.js').InputValue} v */
  function formatValue(v) {
    return String(v).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * The registry. Each entry:
   *   normalize(v)         — returns comparison key for matchValue
   *   tooltip(v, slug)     — returns display string or null to hide
   *   sprite?(v, slug)     — returns sprite candidate slug(s) or null
   *   placement?(slug)     — returns { type, options, labels? } or null if not applicable
   */
  /** @type {Record<import('./types/contracts.js').FormMetadataKey, import('./types/contracts.js').FormMetadataDefinition>} */
  const registry = {
    gender: {
      normalize: (v) => String(v).toUpperCase().charAt(0),
      tooltip: (v) => {
        if (!v) return null;
        const g = String(v).toUpperCase().charAt(0);
        if (g === 'F') return 'Female';
        if (g === 'M') return 'Male';
        return null;
      },
      sprite: (v, slug) => v === 'F' && GENDER_SPRITE_SPECIES.has(slug) ? [`${slug}-f`] : null,
      lock: (_slug, context = {}) => {
        const g = context.speciesGender || null;
        if (g === 'M') return { value: 'M', display: '♂', reason: 'This species is always male' };
        if (g === 'F') return { value: 'F', display: '♀', reason: 'This species is always female' };
        if (g === 'N') return { value: 'N', display: '—', reason: 'This species is genderless' };
        return null;
      },
      placement: () => {
        return { type: 'toggle', options: ['M', 'F'], labels: ['♂', '♀'] };
      },
    },
    gigantamax: {
      normalize: (v) => !!v,
      tooltip: (v) => v ? 'Gmax' : null,
      sprite: (v, slug) => v ? [`${slug}-gmax`] : null,
    },
    alpha: {
      normalize: (v) => !!v,
      tooltip: (v) => v ? 'Alpha' : null,
    },
    ability: {
      normalize: (v) => String(v).toLowerCase().replace(/[\s'-]+/g, ''),
      tooltip: (v) => v ? formatValue(v) : null,
    },
    cream: {
      normalize: (v) => String(v).toLowerCase().replace(/\s+/g, '-'),
      tooltip: (v) => v ? formatValue(v) : null,
      sprite: (v, slug) => {
        if (slug !== 'alcremie' || !v) return null;
        return [`alcremie-${String(v).toLowerCase().replace(/\s+/g, '-')}`];
      },
      placement: (slug) => slug === 'alcremie' ? {
        type: 'select',
        options: ['Vanilla Cream', 'Ruby Cream', 'Matcha Cream', 'Mint Cream',
          'Lemon Cream', 'Salted Cream', 'Ruby Swirl', 'Caramel Swirl', 'Rainbow Swirl'],
      } : null,
    },
    sweet: {
      normalize: (v) => String(v).toLowerCase().replace(/\s+/g, '-'),
      tooltip: (v) => v ? formatValue(v) : null,
      sprite: (v, slug) => {
        if (slug !== 'alcremie' || !v) return null;
        // Sweet alone doesn't produce a sprite candidate — cream+sweet combo handled externally
        return null;
      },
      placement: (slug) => slug === 'alcremie' ? {
        type: 'select',
        options: ['Strawberry', 'Berry', 'Love', 'Star', 'Clover', 'Flower', 'Ribbon'],
      } : null,
    },
  };
  const REGISTRY = Object.freeze(registry);

  /** All registry keys — used to derive FORM_EXTRA_FIELDS and copyFields. */
  const KEYS = /** @type {import('./types/contracts.js').FormMetadataKey[]} */ (Object.keys(REGISTRY));

  /** Build normalizer map for matchesPreset. */
  function getNormalizers() {
    /** @type {Record<string, (value: import('./types/contracts.js').InputValue) => string|boolean>} */
    const map = {};
    for (const [key, def] of Object.entries(REGISTRY)) {
      if (def.normalize) map[key] = def.normalize;
    }
    return map;
  }

  /** Build tooltip suffix from metadata. Shows whatever keys are present.
   *  Pass template requires/defaults for ghost slots. Pass instance state for occupied. */
  /**
   * @param {import('./types/contracts.js').BuildState|Partial<Record<import('./types/contracts.js').FormMetadataKey, import('./types/contracts.js').InputValue>>|null|undefined} state
   * @param {string} resolvedSlug
   */
  function buildTooltipSuffix(state, resolvedSlug) {
    if (!state) return '';
    const parts = [];
    for (const key of KEYS) {
      const def = REGISTRY[key];
      if (!def.tooltip) continue;
      const val = state[key];
      if (val == null || val === '' || val === false) continue;
      const label = def.tooltip(val, resolvedSlug);
      if (label) parts.push(label);
    }
    return parts.length ? ` (${parts.join(', ')})` : '';
  }

  /** Build sprite candidate slugs from state metadata. Returns array. */
  /**
   * @param {import('./types/contracts.js').BuildState|Partial<Record<import('./types/contracts.js').FormMetadataKey, import('./types/contracts.js').InputValue>>|null|undefined} state
   * @param {string} resolvedSlug
   */
  function buildSpriteCandidates(state, resolvedSlug) {
    if (!state) return [];
    const candidates = [];
    // Special: Alcremie cream+sweet combo (two-field sprite)
    if (resolvedSlug === 'alcremie' && state.cream && state.sweet) {
      const creamSlug = String(state.cream).toLowerCase().replace(/\s+/g, '-');
      const sweetSlug = String(state.sweet).toLowerCase().replace(/\s+/g, '-');
      candidates.push(`alcremie-${creamSlug}-${sweetSlug}`);
    }
    for (const key of KEYS) {
      const def = REGISTRY[key];
      if (!def.sprite) continue;
      const val = state[key];
      if (val == null || val === '' || val === false) continue;
      const slugs = def.sprite(val, resolvedSlug);
      if (slugs) candidates.push(...slugs);
    }
    return candidates;
  }

  /** Get placement UI controls needed for a species. Returns [{key, type, options, labels?}]. */
  /** @param {string} slug */
  function getPlacementControls(slug) {
    /** @type {import('./types/contracts.js').FormControl[]} */
    const controls = [];
    for (const key of KEYS) {
      const def = REGISTRY[key];
      if (!def.placement) continue;
      const config = def.placement(slug);
      if (config) controls.push({ key, ...config });
    }
    return controls;
  }

  /** Get locked fields for a species. Returns { key: { value, display, reason } } or empty. */
  /**
   * @param {string} slug
   * @param {{speciesGender?: string|null}} [context]
   */
  function getLock(slug, context = {}) {
    /** @type {Partial<Record<import('./types/contracts.js').FormMetadataKey, {value: string, display: string, reason: string}>>} */
    const locks = {};
    for (const key of KEYS) {
      const def = REGISTRY[key];
      if (!def.lock) continue;
      const lock = def.lock(slug, context);
      if (lock) locks[key] = lock;
    }
    return locks;
  }

  return {
    REGISTRY,
    KEYS,
    GENDER_SPRITE_SPECIES,
    getNormalizers,
    buildTooltipSuffix,
    buildSpriteCandidates,
    getPlacementControls,
    getLock,
  };
})();
