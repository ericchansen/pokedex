/**
 * views/teams.js — Teams listing view.
 * Renders team cards with member sprites, search, and team detail sidebar.
 */

const {
  DataManager,
  SearchState,
  UIModels,
  TeamSurfaces,
  Selection,
  UIShared,
} = globalThis;

const TeamsView = (() => {
  let unsubscribeSelection = null;
  let unsubscribeSearch = null;

  function buildTeamSearchText(team) {
    return UIModels.buildSearchText([
      team.name,
      team.creator,
      team.archetype,
      team.team_id,
      team.mega,
      (team.members || []).map((member) => member.species),
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

  function mount(container) {
    container.innerHTML = '<div id="view-teams"><div class="teams-container" id="teams-container"></div></div>';
    if (unsubscribeSelection) unsubscribeSelection();
    unsubscribeSelection = Selection.subscribe(() => render());
    if (unsubscribeSearch) unsubscribeSearch();
    unsubscribeSearch = SearchState.subscribe(() => render());
    render();
  }

  function unmount() {
    if (unsubscribeSelection) { unsubscribeSelection(); unsubscribeSelection = null; }
    if (unsubscribeSearch) { unsubscribeSearch(); unsubscribeSearch = null; }
    UIShared.closePanel();
  }

  return { mount, unmount };
})();

export { TeamsView };
