/**
 * app-routes.js - Canonical route and section vocabulary for the app shell.
 *
 * "boxes" is the canonical route/section name for the storage view. New code
 * should not introduce additional "home" route naming.
 */
export const AppRoutes = (() => {
  const sections = Object.freeze({
    boxes: 'boxes',
    inventory: 'inventory',
    builds: 'builds',
    teams: 'teams',
    settings: 'settings',
  });

  const hashes = Object.freeze({
    boxes: '#/boxes',
    inventory: '#/inventory',
    builds: '#/builds',
    teams: '#/teams',
    settings: '#/settings',
  });

  const searchPlaceholders = Object.freeze({
    [sections.boxes]: 'Search Pokémon...',
    [sections.inventory]: 'Search inventory...',
    [sections.builds]: 'Search builds...',
    [sections.teams]: 'Search teams, creators, archetypes, or members...',
    [sections.settings]: 'Search unavailable in Settings',
  });

  /** @param {import('./types/contracts.js').RouteSection} section */
  function hashForSection(section) {
    return hashes[section] || hashes.boxes;
  }

  /** @param {string|null|undefined} [hash] */
  function sectionForHash(hash) {
    const h = hash || (typeof window !== 'undefined' ? window.location.hash : '') || hashes.boxes;
    for (const section of /** @type {import('./types/contracts.js').RouteSection[]} */ (Object.keys(hashes))) {
      if (h.startsWith(hashes[section])) return sections[section];
    }
    return sections.boxes;
  }

  return {
    DEFAULT_SECTION: sections.boxes,
    DEFAULT_HASH: hashes.boxes,
    sections,
    hashes,
    searchPlaceholders,
    hashForSection,
    sectionForHash,
  };
})();
