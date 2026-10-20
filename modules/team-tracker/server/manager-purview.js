const { getDirectReports, buildManagerMap, getManagedUids } = require('../../../shared/server/permissions');

/**
 * Compute the teams a manager has purview over based on their
 * direct reports' team assignments.
 * @param {string} managerUid
 * @param {object} registry - { people: { uid: { managerUid, teamIds, _appFields, ... } } }
 * @param {object} teamsData - { teams: { teamId: { id, name, orgKey, metadata, ... } } }
 * @param {object} [options]
 * @param {boolean} [options.includeIndirect=false] - Include indirect reports (transitive closure)
 * @returns {{ directReportUids: string[], indirectReportUids?: string[], teams: Array<{ id, name, orgKey, directReportUids: string[], totalMemberCount: number, metadata: object, boards: Array }> }}
 */
function getManagerPurview(managerUid, registry, teamsData, options = {}) {
  const directReportUidSet = getDirectReports(managerUid, registry);
  const directReportUids = [...directReportUidSet];

  let indirectReportUids;
  if (options.includeIndirect) {
    const managerMap = buildManagerMap(registry);
    const allManaged = getManagedUids(managerUid, managerMap);
    indirectReportUids = [...allManaged].filter(uid => !directReportUidSet.has(uid));
  }

  // All report UIDs to consider for team building
  const allReportUids = options.includeIndirect
    ? [...directReportUids, ...indirectReportUids]
    : directReportUids;

  if (!teamsData || !teamsData.teams) {
    const result = { directReportUids, teams: [] };
    if (options.includeIndirect) result.indirectReportUids = indirectReportUids;
    return result;
  }

  // Build a map: teamId -> list of direct report UIDs on that team
  const teamDirectReports = new Map();
  for (const uid of directReportUids) {
    const person = registry.people[uid];
    if (!person || !Array.isArray(person.teamIds)) continue;
    for (const teamId of person.teamIds) {
      if (!teamDirectReports.has(teamId)) {
        teamDirectReports.set(teamId, []);
      }
      teamDirectReports.get(teamId).push(uid);
    }
  }

  // Track which teams have any reports (direct or indirect) for team inclusion
  const teamsWithReports = new Set();
  for (const uid of allReportUids) {
    const person = registry.people[uid];
    if (!person || !Array.isArray(person.teamIds)) continue;
    for (const teamId of person.teamIds) {
      teamsWithReports.add(teamId);
    }
  }

  // Build a map: teamId -> total member count (all people assigned to the team)
  const teamMemberCounts = new Map();
  if (registry && registry.people) {
    for (const person of Object.values(registry.people)) {
      if (person.status !== 'active') continue;
      if (!Array.isArray(person.teamIds)) continue;
      for (const teamId of person.teamIds) {
        teamMemberCounts.set(teamId, (teamMemberCounts.get(teamId) || 0) + 1);
      }
    }
  }

  // Build the teams array from teams where at least one report is assigned
  const teams = [];
  for (const teamId of teamsWithReports) {
    const teamObj = teamsData.teams[teamId];
    if (!teamObj) continue;
    teams.push({
      id: teamObj.id,
      name: teamObj.name,
      orgKey: teamObj.orgKey,
      directReportUids: teamDirectReports.get(teamId) || [],
      totalMemberCount: teamMemberCounts.get(teamId) || 0,
      metadata: teamObj.metadata || {},
      boards: teamObj.boards || []
    });
  }

  const result = { directReportUids, teams };
  if (options.includeIndirect) result.indirectReportUids = indirectReportUids;
  return result;
}

/**
 * Adapts a project-qualified roster read model into the `{ registry, teamsData }`
 * shapes getManagerPurview consumes, so projects reuse the OSAC hierarchy engine.
 *
 * Identity is `accountId`. Only a `roster` managerRef whose target is present in
 * the model becomes a `managerUid` edge; `external`/`unresolved`/dangling refs
 * produce no edge (relationship kept on the record for display, never fabricated).
 */
function buildProjectManagerModel(model) {
  const people = {};
  const teams = {};
  if (!model || typeof model !== 'object') {
    return { registry: { people }, teamsData: { teams } };
  }

  // A missing/blank accountId can't be a registry key without colliding across records.
  const validPeople = (model.people || []).filter(p => p && typeof p.accountId === 'string' && p.accountId);
  const accountIds = new Set(validPeople.map(p => p.accountId));
  for (const person of validPeople) {
    const ref = person.managerRef;
    const managerUid = ref && ref.kind === 'roster' && accountIds.has(ref.accountId)
      ? ref.accountId
      : null;
    people[person.accountId] = {
      uid: person.accountId,
      accountId: person.accountId,
      projectId: model.projectId,
      name: person.displayName,
      email: person.email || null,
      title: person.title || null,
      status: person.active ? 'active' : 'inactive',
      managerUid,
      managerRef: ref || null,
      teamIds: Array.isArray(person.teamIds) ? [...person.teamIds] : []
    };
  }

  for (const team of model.teams || []) {
    teams[team.id] = {
      id: team.id,
      name: team.displayName,
      // In a project read model every team belongs to the one project, so the
      // projectId plays the org-scoping role that orgKey plays for OSAC.
      orgKey: model.projectId,
      metadata: {},
      boards: []
    };
  }

  return { registry: { people }, teamsData: { teams } };
}

/** Resolve the user's accountId by email (active people only, never by name); fails closed on an ambiguous match. */
function resolveProjectManagerAccountId(model, email) {
  if (!model || !email || typeof email !== 'string') return null;
  const target = email.toLowerCase();
  const matches = new Set();
  for (const person of model.people || []) {
    if (!person.active) continue;
    if (person.email && person.email.toLowerCase() === target) matches.add(person.accountId);
  }
  return matches.size === 1 ? [...matches][0] : null;
}

module.exports = {
  getManagerPurview,
  buildProjectManagerModel,
  resolveProjectManagerAccountId
};
