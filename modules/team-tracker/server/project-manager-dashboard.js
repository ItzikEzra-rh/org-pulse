/**
 * Builds the OSAC `/manager/dashboard` downward-purview contract from a
 * project-qualified roster read model, reusing the shared hierarchy engine via
 * manager-purview's adapter (no second hierarchy implementation).
 *
 * Read-only: field/team writes belong to Admin/RBAC's project write model, so
 * field definitions, exceptions and reference-people maps stay empty rather than
 * being fabricated.
 */

const {
  getManagerPurview,
  buildProjectManagerModel,
  resolveProjectManagerAccountId
} = require('./manager-purview');

function emptyPurviewPayload(extra = {}) {
  return {
    mode: 'project',
    manager: null,
    directReports: [],
    indirectReports: [],
    teams: [],
    allOrgTeams: [],
    allPeople: [],
    referencedPeople: {},
    fieldDefinitions: { person: [], team: [] },
    fieldExceptions: [],
    ...extra
  };
}

/**
 * Identity-independent view of whether this project's published manager/report
 * hierarchy can be trusted, derived purely from the roster read model's
 * enrichment join. Mirrors the enrichment semantics used to resolve direct-report
 * purview, so a read-only UI can explain an absent/partial/expired hierarchy
 * without ever being granted a manager privilege. Expired/unknown enrichment
 * freshness is collapsed to 'absent' upstream (project-roster 'distrust'); a
 * missing enrichment publication has no `model.enrichment` and is also 'absent'.
 *
 * @param {object} model - Normalized project read model from readProjectPeopleTeams
 * @returns {'available'|'stale'|'partial'|'absent'|'unavailable'}
 */
function projectHierarchyStatus(model) {
  if (!model || !['available', 'empty'].includes(model.availability)) return 'unavailable';
  const enrichment = model.enrichment;
  if (!enrichment || enrichment.state === 'absent') return 'absent';
  if (enrichment.partial === true) return 'partial';
  if (enrichment.state === 'stale') return 'stale';
  return 'available';
}

/**
 * Whether the hierarchy is trustworthy enough that a zero-direct-reports result
 * is a real signal. 'stale' is a complete join that is merely not fresh, so it
 * still counts; 'partial'/'absent'/'unavailable' do not.
 */
function isProjectHierarchyAvailable(model) {
  const status = projectHierarchyStatus(model);
  return status === 'available' || status === 'stale';
}

function toReport(person, { indirect = false } = {}) {
  return {
    accountId: person.accountId,
    name: person.name,
    title: person.title || null,
    teamIds: Array.isArray(person.teamIds) ? [...person.teamIds] : [],
    managerRef: person.managerRef || null,
    indirect
  };
}

/**
 * Build the project Manager Dashboard response.
 *
 * @param {object} model - Normalized project read model from readProjectPeopleTeams
 * @param {object} options
 * @param {string|null} options.email - Authenticated user email (for identity resolution)
 * @param {boolean} [options.includeIndirect=false]
 * @param {boolean} [options.isPrivileged=false] - Admin or team-admin; controls
 *   whether a non-manager identity returns 200 no-direct-reports vs 403.
 * @returns {{ status: number, body: object }}
 */
function buildProjectManagerDashboard(model, options = {}) {
  const { email = null, includeIndirect = false, isPrivileged = false } = options;

  const projectId = model && typeof model === 'object' ? (model.projectId || null) : null;
  const base = { projectId, generatedAt: model?.generatedAt || null };

  // An unavailable/empty publication is represented honestly, never as a manager
  // with zero reports.
  if (!model || !['available', 'empty'].includes(model.availability)) {
    return {
      status: 200,
      body: emptyPurviewPayload({
        ...base,
        availability: model?.availability || 'unavailable',
        reason: model?.reason || 'project-roster-unavailable'
      })
    };
  }

  const accountId = resolveProjectManagerAccountId(model, email);
  if (!accountId) {
    return {
      status: 200,
      body: emptyPurviewPayload({ ...base, availability: model.availability, reason: 'no-registry-identity' })
    };
  }

  const { registry, teamsData } = buildProjectManagerModel(model);
  const managerPerson = registry.people[accountId];
  const manager = {
    accountId,
    name: managerPerson?.name || null,
    email: managerPerson?.email || null
  };

  const purview = getManagerPurview(accountId, registry, teamsData, { includeIndirect });

  if (purview.directReportUids.length === 0) {
    // A partial join can be missing managerRefs too — zero reports isn't trustworthy.
    const hierarchyAvailable = isProjectHierarchyAvailable(model);
    if (!hierarchyAvailable) {
      return {
        status: 200,
        body: emptyPurviewPayload({ ...base, manager, availability: model.availability, reason: 'hierarchy-unavailable' })
      };
    }
    if (isPrivileged) {
      return {
        status: 200,
        body: emptyPurviewPayload({ ...base, manager, availability: model.availability, reason: 'no-direct-reports' })
      };
    }
    return { status: 403, body: { error: 'You are not a manager' } };
  }

  const directReports = purview.directReportUids
    .map(uid => registry.people[uid])
    .filter(Boolean)
    .map(person => toReport(person));

  let indirectReports = [];
  if (includeIndirect && Array.isArray(purview.indirectReportUids)) {
    indirectReports = purview.indirectReportUids
      .map(uid => registry.people[uid])
      .filter(Boolean)
      .map(person => toReport(person, { indirect: true }));
  }

  const teams = purview.teams.map(team => ({
    id: team.id,
    name: team.name,
    orgKey: team.orgKey,
    orgDisplayName: projectId,
    totalMemberCount: team.totalMemberCount,
    directReportAccountIds: team.directReportUids,
    directReportCount: team.directReportUids.length
  }));

  const allOrgTeams = Object.values(teamsData.teams)
    .map(t => ({ id: t.id, name: t.name, orgKey: t.orgKey }));

  const body = emptyPurviewPayload({
    ...base,
    availability: model.availability,
    manager,
    directReports,
    teams,
    allOrgTeams,
    enrichment: model.enrichment || null,
    reason: null
  });
  if (includeIndirect) body.indirectReports = indirectReports;

  return { status: 200, body };
}

module.exports = { buildProjectManagerDashboard, projectHierarchyStatus, isProjectHierarchyAvailable };
