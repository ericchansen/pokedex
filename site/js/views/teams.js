import { DataManager } from '../data.js';
import { EntityStore } from '../data/entity-store.js';
import { SearchState } from '../search-state.js';
import { Selection } from '../selection.js';
import { TeamSurfaces } from '../team-surfaces.js';
import { UIModels } from '../ui-models.js';
import { UIShared } from '../ui-shared.js';
import { DetailPanel } from '../ui/surfaces/detail-panel.js';

/**
 * views/teams.js — Teams listing view.
 * Renders team cards with member sprites, search, and team detail sidebar.
 */



const TeamsView = (() => {
  /** @type {(() => void)|null} */
  let unsubscribeSelection = null;
  /** @type {(() => void)|null} */
  let unsubscribeSearch = null;
  /** @type {Array<() => void>} */
  let unsubscribeEntities = [];

  /** @param {import('../types/contracts.js').Team} team */
  function buildTeamSearchText(team) {
    return UIModels.buildSearchText([
      team.name,
      team.creator,
      team.archetype,
      team.team_id,
      team.mega,
      (team.members || []).map((member) => member.species).filter((species) => typeof species === 'string'),
    ]);
  }

  function render() {
    const allTeams = DataManager.getBattleTeams();
    const query = SearchState.getQuery();
    const filteredTeams = query
      ? allTeams.filter((team) => UIModels.matchesSearch(buildTeamSearchText(team), query))
      : allTeams;
    const queryText = query.trim();
    const showingCustomSearchEmpty = queryText && allTeams.length > 0 && filteredTeams.length === 0;
    if (showingCustomSearchEmpty) {
      const container = document.getElementById('teams-container');
      if (container) {
        container.innerHTML = `
          <div class="empty-state">
            <h3>No teams match your search</h3>
            <p>Try a different team, creator, archetype, or member name.</p>
          </div>`;
      }
    } else {
      TeamSurfaces.renderTeams(filteredTeams);
    }
    UIShared.updateSearchEmptyState(
      'view-teams',
      queryText,
      showingCustomSearchEmpty || allTeams.length === 0 || filteredTeams.length > 0,
      `No teams match "${queryText}".`
    );
  }

  /** @param {HTMLElement} container */
  function mount(container) {
    container.innerHTML = '<div id="view-teams"><div class="teams-container" id="teams-container"></div></div>';
    if (unsubscribeSelection) unsubscribeSelection();
    unsubscribeSelection = Selection.subscribe(() => render());
    if (unsubscribeSearch) unsubscribeSearch();
    unsubscribeSearch = SearchState.subscribe(() => render());
    for (const unsubscribe of unsubscribeEntities) unsubscribe();
    const slices = /** @type {Array<'teams'|'builds'|'inventory'>} */ (['teams', 'builds', 'inventory']);
    unsubscribeEntities = slices.map((slice) => EntityStore.subscribe(slice, render));
    render();
  }

  function unmount() {
    if (unsubscribeSelection) { unsubscribeSelection(); unsubscribeSelection = null; }
    if (unsubscribeSearch) { unsubscribeSearch(); unsubscribeSearch = null; }
    for (const unsubscribe of unsubscribeEntities) unsubscribe();
    unsubscribeEntities = [];
    DetailPanel.close();
  }

  return { mount, unmount };
})();

export { TeamsView };
