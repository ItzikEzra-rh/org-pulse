/**
 * Project-qualified roster reads for People and Teams.
 *
 * Canonical person identity is (projectId, accountId); an unknown project
 * never falls back to the legacy OSAC roster. Optional fields (title, geo,
 * identities, managerRef) are joined from the roster-enrichment publication
 * by accountId when available, and are otherwise always null, never
 * fabricated. `manager` stays a static null field for response compatibility
 * with the pre-enrichment contract.
 */

const ARTIFACT_KEY = 'sources/roster/registry.json'

// Person records carry `matchStatus` and no displayName/ldapUid (roster stays
// the sole identity/display-name source); auxiliaryManagers is a map keyed by
// ldapUid, not an array.
const ENRICHMENT_ARTIFACT_KEY = 'sources/roster-enrichment/registry.json'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// An unrecognized kind or missing kind-specific field degrades to null
// instead of rejecting the record that carries it.
function _validManagerRef(ref) {
  if (!isRecord(ref)) return false;
  if (ref.kind === 'roster') return typeof ref.accountId === 'string' && !!ref.accountId;
  if (ref.kind === 'external') return typeof ref.ldapUid === 'string' && !!ref.ldapUid;
  if (ref.kind === 'unresolved') {
    return typeof ref.reason === 'string' && !!ref.reason
      && (ref.ldapUid === undefined || (typeof ref.ldapUid === 'string' && !!ref.ldapUid));
  }
  return false;
}

function _loadProjectRosterData(projects, projectId) {
  if (typeof projectId !== 'string' || !projectId.trim()) {
    return { kind: 'error', status: 400, error: 'Invalid project id' };
  }
  if (!projects || typeof projects.get !== 'function' || typeof projects.readArtifact !== 'function') {
    return { kind: 'error', status: 503, error: 'Project publication reader is unavailable' };
  }

  let profile;
  try {
    profile = projects.get(projectId);
  } catch (error) {
    return { kind: 'error', status: 500, error: error.message };
  }
  if (!profile) return { kind: 'error', status: 404, error: 'Unknown project' };

  let artifact;
  try {
    artifact = projects.readArtifact(projectId, ARTIFACT_KEY);
  } catch (error) {
    return { kind: 'error', status: 502, error: error.message };
  }
  if (!artifact || !isRecord(artifact.value)) {
    return { kind: 'missing-artifact' };
  }

  const envelope = artifact.value;
  const generatedAt = typeof envelope.generatedAt === 'string' ? envelope.generatedAt : null;
  if (envelope.schemaVersion !== 1
      || envelope.projectId !== projectId
      || envelope.artifactKey !== ARTIFACT_KEY
      || !isRecord(envelope.data)
      || envelope.data.projectId !== projectId) {
    return { kind: 'error', status: 502, error: 'Project roster publication identity mismatch' };
  }
  if (envelope.freshness !== 'fresh') {
    return { kind: 'unavailable', reason: 'publication-not-fresh', publicationState: envelope.state, generatedAt };
  }
  if (envelope.partial === true) {
    return { kind: 'unavailable', reason: 'publication-partial', publicationState: envelope.state, generatedAt };
  }
  if (!['supported', 'empty'].includes(envelope.state)) {
    return { kind: 'unavailable', reason: 'publication-not-supported', publicationState: envelope.state, generatedAt };
  }

  const { people, teams } = envelope.data;
  if (!Array.isArray(people) || !Array.isArray(teams)) {
    return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
  }

  const seenAccountIds = new Set();
  for (const person of people) {
    if (!isRecord(person)
        || typeof person.accountId !== 'string' || !person.accountId
        || typeof person.displayName !== 'string' || !person.displayName.trim()
        || typeof person.active !== 'boolean'
        || !Array.isArray(person.teamIds)
        || person.teamIds.some(id => typeof id !== 'string' || !id)
        || new Set(person.teamIds).size !== person.teamIds.length) {
      return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
    }
    if (seenAccountIds.has(person.accountId)) {
      return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
    }
    seenAccountIds.add(person.accountId);
  }

  const seenTeamIds = new Set();
  for (const team of teams) {
    if (!isRecord(team)
        || typeof team.id !== 'string' || !team.id
        || typeof team.name !== 'string' || !team.name.trim()) {
      return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
    }
    if (seenTeamIds.has(team.id)) {
      return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
    }
    seenTeamIds.add(team.id);
  }

  for (const person of people) {
    if (person.teamIds.some(teamId => !seenTeamIds.has(teamId))) {
      return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
    }
  }

  return { kind: 'ok', envelope, generatedAt, people, teams };
}

// Enrichment never downgrades roster availability: any missing/invalid/
// mismatched/expired condition degrades to 'omit' or 'distrust', never an
// error. 'distrust' means identity was verified but freshness isn't; 'join'
// means the join is safe to perform.
function _loadProjectEnrichmentData(projects, projectId) {
  let artifact;
  try {
    artifact = projects.readArtifact(projectId, ENRICHMENT_ARTIFACT_KEY);
  } catch (error) {
    console.warn(`[project-roster] enrichment publication rejected for ${projectId}: ${error.message}`);
    return { kind: 'omit' };
  }
  if (!artifact || !isRecord(artifact.value)) {
    return { kind: 'omit' };
  }

  const envelope = artifact.value;
  if (envelope.schemaVersion !== 1
      || envelope.projectId !== projectId
      || envelope.artifactKey !== ENRICHMENT_ARTIFACT_KEY
      || !isRecord(envelope.data)
      || envelope.data.projectId !== projectId) {
    console.warn(`[project-roster] enrichment publication identity/schema mismatch for ${projectId}`);
    return { kind: 'omit' };
  }

  const generatedAt = typeof envelope.generatedAt === 'string' ? envelope.generatedAt : null;

  if (!['fresh', 'stale', 'expired', 'unknown'].includes(envelope.freshness)) {
    console.warn(`[project-roster] enrichment publication has an invalid freshness value for ${projectId}`);
    return { kind: 'omit' };
  }
  if (envelope.freshness === 'expired' || envelope.freshness === 'unknown') {
    return { kind: 'distrust', generatedAt };
  }
  if (!['supported', 'empty'].includes(envelope.state)) {
    console.warn(`[project-roster] enrichment publication state is not supported for ${projectId}: ${envelope.state}`);
    return { kind: 'omit' };
  }

  const { people, auxiliaryManagers } = envelope.data;
  if (!Array.isArray(people) || !(auxiliaryManagers === undefined || isRecord(auxiliaryManagers))) {
    console.warn(`[project-roster] invalid enrichment publication shape for ${projectId}`);
    return { kind: 'omit' };
  }

  // Dropped individually so one bad entry doesn't blank the whole enrichment join.
  const sanitizedAuxiliaryManagers = {};
  for (const [ldapUid, record] of Object.entries(auxiliaryManagers || {})) {
    if (!isRecord(record)
        || typeof record.ldapUid !== 'string' || !record.ldapUid
        || record.ldapUid !== ldapUid
        || typeof record.displayName !== 'string' || !record.displayName.trim()) {
      console.warn(`[project-roster] dropping malformed auxiliary manager "${ldapUid}" for ${projectId}`);
      continue;
    }
    sanitizedAuxiliaryManagers[ldapUid] = {
      ...record,
      managerRef: _validManagerRef(record.managerRef) ? record.managerRef : null
    };
  }

  const byAccountId = new Map();
  for (const record of people) {
    if (!isRecord(record) || typeof record.accountId !== 'string' || !record.accountId) {
      console.warn(`[project-roster] invalid enrichment person record for ${projectId}`);
      return { kind: 'omit' };
    }
    if (byAccountId.has(record.accountId)) {
      console.warn(`[project-roster] duplicate enrichment accountId for ${projectId}`);
      return { kind: 'omit' };
    }
    byAccountId.set(record.accountId, record);
  }

  // `partial` is independent of `state`: a stale republish can also be missing records.
  const state = envelope.freshness === 'stale' ? 'stale' : (envelope.partial === true ? 'partial' : 'fresh');

  return {
    kind: 'join',
    state,
    partial: envelope.partial === true,
    generatedAt,
    byAccountId,
    auxiliaryManagers: sanitizedAuxiliaryManagers
  };
}

// `key` is the normalized projectId::teamId composite key, not a team name.
function readProjectPeopleTeams(projects, projectId) {
  const loaded = _loadProjectRosterData(projects, projectId);
  if (loaded.kind === 'error') return { status: loaded.status, error: loaded.error };

  if (loaded.kind === 'missing-artifact') {
    return { status: 404, error: 'Project roster publication is unavailable' };
  }

  if (loaded.kind === 'unavailable') {
    return {
      status: 200,
      model: _unavailableReadModel(projectId, loaded.reason, loaded.publicationState, loaded.generatedAt),
    };
  }

  const enrichment = _loadProjectEnrichmentData(projects, projectId);
  return { status: 200, model: _buildReadModel(projectId, loaded, enrichment) };
}

function _normalizeTeam(projectId, team, memberAccountIds) {
  return {
    key: `${projectId}::${team.id}`,
    projectId,
    id: team.id,
    displayName: team.name,
    description: typeof team.description === 'string' ? team.description : null,
    state: typeof team.state === 'string' ? team.state : null,
    teamType: typeof team.teamType === 'string' ? team.teamType : null,
    memberAccountIds: [...memberAccountIds].sort()
  };
}

function _trimmedOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

// Only a 'matched' record has usable LDAP data; 'unmatched'/'ambiguous'
// degrade the same as no join at all. Physical location (city/country/location)
// is distinct from Geo/Region and is passed through verbatim when published.
function _enrichedFields(enrichmentRecord) {
  if (!enrichmentRecord || enrichmentRecord.matchStatus !== 'matched') {
    return { title: null, geo: null, city: null, country: null, location: null, identities: {}, managerRef: null };
  }
  return {
    title: _trimmedOrNull(enrichmentRecord.title),
    geo: _trimmedOrNull(enrichmentRecord.geo),
    city: _trimmedOrNull(enrichmentRecord.city),
    country: _trimmedOrNull(enrichmentRecord.country),
    location: _trimmedOrNull(enrichmentRecord.location),
    identities: isRecord(enrichmentRecord.identities) ? enrichmentRecord.identities : {},
    // Opaque typed passthrough — never interpreted or resolved here.
    managerRef: _validManagerRef(enrichmentRecord.managerRef) ? enrichmentRecord.managerRef : null
  };
}

function _normalizePerson(projectId, person, enrichmentRecord) {
  return {
    key: `${projectId}::${person.accountId}`,
    projectId,
    accountId: person.accountId,
    displayName: person.displayName.trim(),
    active: person.active,
    email: typeof person.email === 'string' && person.email.trim() ? person.email : null,
    teamIds: [...person.teamIds],
    // `manager` is kept, unpopulated, for response compatibility with the
    // pre-enrichment contract; `managerRef` is the new additive field.
    manager: null,
    ..._enrichedFields(enrichmentRecord)
  };
}

function _buildReadModel(projectId, loaded, enrichment) {
  const { envelope, generatedAt, people, teams } = loaded;

  const memberAccountIdsByTeamId = new Map();
  for (const person of people) {
    if (!person.active) continue;
    for (const teamId of person.teamIds) {
      const members = memberAccountIdsByTeamId.get(teamId) || [];
      members.push(person.accountId);
      memberAccountIdsByTeamId.set(teamId, members);
    }
  }

  const normalizedTeams = teams.map(team =>
    _normalizeTeam(projectId, team, memberAccountIdsByTeamId.get(team.id) || [])
  );
  const normalizedPeople = people.map(person => _normalizePerson(
    projectId,
    person,
    enrichment.kind === 'join' ? enrichment.byAccountId.get(person.accountId) : null
  ));

  const hasActiveTeamMembership = normalizedTeams.some(team => team.memberAccountIds.length > 0);

  const model = {
    projectId,
    availability: hasActiveTeamMembership ? 'available' : 'empty',
    reason: hasActiveTeamMembership ? null : 'no-active-team-memberships',
    publicationState: envelope.state,
    generatedAt,
    teams: normalizedTeams,
    people: normalizedPeople
  };

  if (enrichment.kind === 'join') {
    model.enrichment = { state: enrichment.state, partial: enrichment.partial, generatedAt: enrichment.generatedAt };
    model.auxiliaryManagers = enrichment.auxiliaryManagers;
  } else if (enrichment.kind === 'distrust') {
    model.enrichment = { state: 'absent', generatedAt: enrichment.generatedAt };
  }

  return model;
}

function _unavailableReadModel(projectId, reason, publicationState, generatedAt) {
  return {
    projectId,
    availability: 'unavailable',
    reason,
    publicationState,
    generatedAt,
    teams: [],
    people: []
  };
}

module.exports = { ARTIFACT_KEY, ENRICHMENT_ARTIFACT_KEY, readProjectPeopleTeams };
