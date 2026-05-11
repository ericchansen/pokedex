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
const FormMetadata = (() => {
  // Species whose sprites differ by gender (cosmetic dimorphism).
  // Exported from SpeciesResolver but also needed here for tooltip/sprite logic.
  const GENDER_SPRITE_SPECIES = (typeof SpeciesResolver !== 'undefined' && SpeciesResolver.GENDER_SPRITE_SPECIES)
    || new Set();

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
  const REGISTRY = Object.freeze({
    gender: {
      normalize: (v) => String(v).toUpperCase().charAt(0),
      tooltip: (v, slug) => {
        // Only show gender for dimorphic species where it's visually distinguishing
        if (!GENDER_SPRITE_SPECIES.has(slug)) return null;
        if (v === 'F' || v === 'Female') return 'Female';
        return null; // Male is the default for dimorphic — not worth showing
      },
      sprite: (v, slug) => v === 'F' && GENDER_SPRITE_SPECIES.has(slug) ? [`${slug}-f`] : null,
      placement: (slug) => {
        const locked = typeof DataManager !== 'undefined' ? DataManager.getSpeciesGender(slug) : null;
        if (locked) return null;
        return GENDER_SPRITE_SPECIES.has(slug) ? { type: 'toggle', options: ['M', 'F'], labels: ['♂', '♀'] } : null;
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
      normalize: (v) => String(v).toLowerCase().replace(/[\s''-]+/g, ''),
      // Ability shows in ghost tooltips (what's expected) but not occupied (every mon has one)
      tooltip: (v, _slug, mode) => (mode === 'ghost' && v) ? formatValue(v) : null,
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
  });

  /** All registry keys — used to derive FORM_EXTRA_FIELDS and copyFields. */
  const KEYS = Object.keys(REGISTRY);

  /** Build normalizer map for matchesPreset. */
  function getNormalizers() {
    const map = {};
    for (const [key, def] of Object.entries(REGISTRY)) {
      if (def.normalize) map[key] = def.normalize;
    }
    return map;
  }

  /** Build tooltip suffix: " (Gmax, Female, Vanilla Cream)" or "".
   *  @param {string} [mode] — 'ghost' shows all metadata; default hides noise like ability
   */
  function buildTooltipSuffix(state, resolvedSlug, mode) {
    if (!state) return '';
    const parts = [];
    for (const [key, def] of Object.entries(REGISTRY)) {
      if (!def.tooltip) continue;
      const val = state[key];
      if (val == null || val === '' || val === false) continue;
      const label = def.tooltip(val, resolvedSlug, mode);
      if (label) parts.push(label);
    }
    return parts.length ? ` (${parts.join(', ')})` : '';
  }

  /** Build sprite candidate slugs from state metadata. Returns array. */
  function buildSpriteCandidates(state, resolvedSlug) {
    if (!state) return [];
    const candidates = [];
    // Special: Alcremie cream+sweet combo (two-field sprite)
    if (resolvedSlug === 'alcremie' && state.cream && state.sweet) {
      const creamSlug = String(state.cream).toLowerCase().replace(/\s+/g, '-');
      const sweetSlug = String(state.sweet).toLowerCase().replace(/\s+/g, '-');
      candidates.push(`alcremie-${creamSlug}-${sweetSlug}`);
    }
    for (const [key, def] of Object.entries(REGISTRY)) {
      if (!def.sprite) continue;
      const val = state[key];
      if (val == null || val === '' || val === false) continue;
      const slugs = def.sprite(val, resolvedSlug);
      if (slugs) candidates.push(...slugs);
    }
    return candidates;
  }

  /** Get placement UI controls needed for a species. Returns [{key, type, options, labels?}]. */
  function getPlacementControls(slug) {
    const controls = [];
    for (const [key, def] of Object.entries(REGISTRY)) {
      if (!def.placement) continue;
      const config = def.placement(slug);
      if (config) controls.push({ key, ...config });
    }
    return controls;
  }

  return {
    REGISTRY,
    KEYS,
    GENDER_SPRITE_SPECIES,
    getNormalizers,
    buildTooltipSuffix,
    buildSpriteCandidates,
    getPlacementControls,
  };
})();

if (typeof window !== 'undefined') {
  window.FormMetadata = FormMetadata;
}
