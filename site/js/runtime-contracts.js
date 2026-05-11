/**
 * runtime-contracts.js - Canonical runtime vocabulary for the architecture refactor.
 *
 * These typedefs and enums document the flat in-memory contracts that route
 * surfaces and selectors should consume, regardless of how data is nested on disk.
 */

/**
 * @typedef {'library'|'instance'} RuntimeBuildKind
 * @typedef {'viewer'|'editor'} DetailMode
 * @typedef {'instance'|'library-build'|'team-member'|'reference'} DetailContext
 */

/**
 * @typedef {Object} LibraryBuildRecord
 * @property {string} id
 * @property {'library'} kind
 * @property {string} slug
 * @property {string} species
 * @property {string} form
 * @property {number|null} level
 * @property {string} nature
 * @property {string} ability
 * @property {string} item
 * @property {string} tera_type
 * @property {string} ev_system
 * @property {Object} evs
 * @property {Object} ivs
 * @property {string[]} moves
 * @property {string[]} egg_moves
 * @property {string} notes
 * @property {string} source_url
 */

/**
 * @typedef {Object} InstanceRecord
 * @property {number} box
 * @property {number} slot
 * @property {string|number} species_id
 * @property {string} species_slug
 * @property {string|null} target_build_id
 * @property {Object} state
 */

/**
 * @typedef {'boxes'|'inventory'|'builds'|'teams'|'settings'} QueryRouteKey
 */

/**
 * @typedef {Object} BrowserQueryState
 * @property {string} search Single canonical text-search channel for the route.
 * The shared header search writes to this field; browser surfaces must not own
 * a second independent text-search state.
 * @property {string[]} games
 * @property {string} type
 * @property {string} generation
 * @property {string} transferred
 * @property {boolean} ownedOnly
 * @property {string} mode
 * @property {string} sortKey
 * @property {boolean} sortAsc
 */

/**
 * @typedef {Object} BrowserRouteSpec
 * @property {QueryRouteKey} route
 * @property {boolean} supportsGames
 * @property {boolean} supportsType
 * @property {boolean} supportsGeneration
 * @property {boolean} supportsTransferred
 * @property {boolean} supportsOwnedOnly
 * @property {boolean} supportsModeToggle
 *
 * Route files may consume a shared browser-route spec, but must not own:
 * - shared toolbar labels,
 * - shared toolbar wrapper markup,
 * - mutable browser query state,
 * - shared event binding,
 * - or shared browser-shell chrome such as generic search-empty state handling.
 */

/**
 * @typedef {BrowserQueryState} QueryState
 */

/**
 * @typedef {Object} PanelState
 * @property {boolean} open
 * @property {'panel'|'overlay'} layout
 * @property {'viewer'|'editor'} mode
 * @property {'instance'|'library-build'|'team-member'|'reference'} context
 * @property {string|null} subjectId
 */

const RuntimeContracts = (() => {
  const buildKinds = Object.freeze({
    library: 'library',
    instance: 'instance',
  });

  const detailModes = Object.freeze({
    viewer: 'viewer',
    editor: 'editor',
  });

  const detailContexts = Object.freeze({
    instance: 'instance',
    libraryBuild: 'library-build',
    teamMember: 'team-member',
    reference: 'reference',
  });

  return {
    buildKinds,
    detailModes,
    detailContexts,
  };
})();

if (typeof window !== 'undefined') {
  window.RuntimeContracts = RuntimeContracts;
}
