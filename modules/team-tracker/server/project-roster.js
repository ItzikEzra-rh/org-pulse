/**
 * Project-qualified roster reads for People and Teams.
 *
 * Reads one published project roster through the data-backed profile reader.
 * Team members are derived from person.teamIds; an unknown project never
 * falls back to the legacy OSAC roster file.
 */

const ARTIFACT_KEY = 'sources/roster/registry.json'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readProjectRoster(projects, projectId) {
  if (!projects || typeof projects.get !== 'function' || typeof projects.readArtifact !== 'function') {
    return { status: 503, error: 'Project publication reader is unavailable' };
  }

  let profile;
  try {
    profile = projects.get(projectId);
  } catch (error) {
    return { status: 400, error: error.message };
  }
  if (!profile) return { status: 404, error: 'Unknown project' };

  let artifact;
  try {
    artifact = projects.readArtifact(projectId, ARTIFACT_KEY);
  } catch (error) {
    return { status: 502, error: error.message };
  }
  if (!artifact || !isRecord(artifact.value)) {
    return { status: 404, error: 'Project roster publication is unavailable' };
  }

  const envelope = artifact.value;
  const generatedAt = typeof envelope.generatedAt === 'string' ? envelope.generatedAt : null;
  if (envelope.schemaVersion !== 1
      || envelope.projectId !== projectId
      || envelope.artifactKey !== ARTIFACT_KEY
      || !isRecord(envelope.data)
      || envelope.data.projectId !== projectId) {
    return { status: 502, error: 'Project roster publication identity mismatch' };
  }
  if (envelope.freshness !== 'fresh') {
    return {
      status: 200,
      roster: _unavailableRoster(projectId, 'publication-not-fresh', envelope.state, generatedAt),
    };
  }
  if (envelope.partial === true) {
    return {
      status: 200,
      roster: _unavailableRoster(projectId, 'publication-partial', envelope.state, generatedAt),
    };
  }
  if (!['supported', 'empty'].includes(envelope.state)) {
    return {
      status: 200,
      roster: _unavailableRoster(projectId, 'publication-not-supported', envelope.state, generatedAt),
    };
  }

  const { people, teams } = envelope.data;
  if (!Array.isArray(people) || !Array.isArray(teams)) {
    return { status: 502, error: 'Invalid project roster publication' };
  }

  const peopleByAccountId = new Map();
  for (const person of people) {
    if (!isRecord(person)
        || typeof person.accountId !== 'string' || !person.accountId
        || typeof person.displayName !== 'string' || !person.displayName.trim()
        || typeof person.active !== 'boolean'
        || !Array.isArray(person.teamIds)
        || person.teamIds.some(id => typeof id !== 'string' || !id)) {
      return { status: 502, error: 'Invalid project roster publication' };
    }
    if (peopleByAccountId.has(person.accountId)) {
      return { status: 502, error: 'Invalid project roster publication' };
    }
    peopleByAccountId.set(person.accountId, person);
  }

  const seenTeamIds = new Set();
  const teamMap = Object.create(null);
  for (const team of teams) {
    if (!isRecord(team)
        || typeof team.id !== 'string' || !team.id
        || typeof team.name !== 'string' || !team.name.trim()) {
      return { status: 502, error: 'Invalid project roster publication' };
    }
    if (seenTeamIds.has(team.id) || Object.hasOwn(teamMap, team.name)) {
      return { status: 502, error: 'Invalid project roster publication' };
    }
    seenTeamIds.add(team.id);
    teamMap[team.name] = {
      displayName: team.name,
      members: [],
      metadata: {}
    };
  }

  const membershipsByTeamId = new Map();
  for (const person of people) {
    if (new Set(person.teamIds).size !== person.teamIds.length) {
      return { status: 502, error: 'Invalid project roster publication' };
    }
    for (const teamId of person.teamIds) {
      if (!seenTeamIds.has(teamId)) {
        return { status: 502, error: 'Invalid project roster publication' };
      }
      const members = membershipsByTeamId.get(teamId) || new Map();
      if (members.has(person.accountId)) {
        return { status: 502, error: 'Invalid project roster publication' };
      }
      members.set(person.accountId, person);
      membershipsByTeamId.set(teamId, members);
    }
  }

  for (const [teamId, members] of membershipsByTeamId) {
    const team = teams.find(candidate => candidate.id === teamId);
    for (const person of members.values()) {
      if (!person.active) continue;
      teamMap[team.name].members.push({
        name: person.displayName.trim(),
        jiraDisplayName: person.displayName.trim(),
        customFields: {}
      });
    }
  }

  const available = Object.values(teamMap).some(team => team.members.length > 0);
  return {
    status: 200,
    roster: {
      projectId,
      state: 'supported',
      availability: available ? 'available' : 'empty',
      reason: available ? null : 'no-active-team-memberships',
      sourceArtifact: `projects/${projectId}/${ARTIFACT_KEY}`,
      publication: { state: envelope.state, generatedAt, partial: false },
      vp: null,
      orgs: [{
        key: projectId,
        displayName: profile.displayName || projectId,
        leader: null,
        teams: teamMap
      }],
      visibleFields: [],
      primaryDisplayField: null,
      mergedKeyMap: {},
      teamDataSource: 'project-publication',
      managerNames: {}
    }
  };
}

function _unavailableRoster(projectId, reason, publicationState, generatedAt) {
  return {
    projectId,
    state: 'unavailable',
    availability: 'unavailable',
    reason,
    sourceArtifact: `projects/${projectId}/${ARTIFACT_KEY}`,
    publication: { state: publicationState, generatedAt, partial: reason === 'publication-partial' },
    vp: null,
    orgs: [],
    visibleFields: [],
    primaryDisplayField: null,
    mergedKeyMap: {},
    teamDataSource: 'project-publication',
    managerNames: {}
  };
}

module.exports = { ARTIFACT_KEY, readProjectRoster };
