/**
 * Project-qualified GitHub contribution reads, joined by (projectId, accountId).
 * Unknown projects never fall back to legacy OSAC caches; `github: null` means
 * missing (never zero); stale/carried-forward records are served but badged;
 * `gitlab` is always null (unpublished by this collector).
 */

const ARTIFACT_KEY = 'sources/contributions/registry.json'
// URL-encoded artifact key, matching the collector's publication-status convention.
const PUBLICATION_STATUS_KEY = '_publication/sources%2Fcontributions%2Fregistry.json.status.json'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function _normalizeGithub(github) {
  if (!isRecord(github)) return null
  if (typeof github.username !== 'string' || !github.username.trim()) return null
  return {
    username: github.username,
    // null = unavailable measurement; a genuine numeric zero is preserved.
    totalContributions: Number.isFinite(github.totalContributions) ? github.totalContributions : null,
    months: isRecord(github.months) ? github.months : {},
    fetchedAt: typeof github.fetchedAt === 'string' ? github.fetchedAt : null
  }
}

function _stringList(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item) : []
}

function _loadProjectContributionsData(projects, projectId) {
  if (typeof projectId !== 'string' || !projectId.trim()) {
    return { kind: 'error', status: 400, error: 'Invalid project id' }
  }
  if (!projects || typeof projects.get !== 'function' || typeof projects.readArtifact !== 'function') {
    return { kind: 'error', status: 503, error: 'Project publication reader is unavailable' }
  }

  let profile
  try {
    profile = projects.get(projectId)
  } catch (error) {
    return { kind: 'error', status: 500, error: error.message }
  }
  if (!profile) return { kind: 'error', status: 404, error: 'Unknown project' }

  let artifact
  try {
    artifact = projects.readArtifact(projectId, ARTIFACT_KEY)
  } catch (error) {
    return { kind: 'error', status: 502, error: error.message }
  }
  if (!artifact || !isRecord(artifact.value)) {
    return { kind: 'missing-artifact' }
  }

  const envelope = artifact.value
  if (envelope.schemaVersion !== 1
      || envelope.projectId !== projectId
      || envelope.artifactKey !== ARTIFACT_KEY
      || !isRecord(envelope.data)
      || envelope.data.projectId !== projectId) {
    return { kind: 'error', status: 502, error: 'Project contributions publication identity mismatch' }
  }
  if (!['supported', 'empty'].includes(envelope.state)) {
    const generatedAt = typeof envelope.generatedAt === 'string' ? envelope.generatedAt : null
    return { kind: 'unavailable', reason: 'publication-not-supported', publicationState: envelope.state, generatedAt }
  }

  const { people } = envelope.data
  if (!Array.isArray(people)) {
    return { kind: 'error', status: 502, error: 'Invalid project contributions publication' }
  }

  const seenAccountIds = new Set()
  for (const person of people) {
    if (!isRecord(person)
        || typeof person.accountId !== 'string' || !person.accountId
        || typeof person.displayName !== 'string' || !person.displayName.trim()
        || typeof person.active !== 'boolean'
        || !Array.isArray(person.teamIds)
        || person.teamIds.some(id => typeof id !== 'string' || !id)
        || (person.github !== null && !isRecord(person.github))
        || person.gitlab !== null) {
      return { kind: 'error', status: 502, error: 'Invalid project contributions publication' }
    }
    if (seenAccountIds.has(person.accountId)) {
      return { kind: 'error', status: 502, error: 'Invalid project contributions publication' }
    }
    seenAccountIds.add(person.accountId)
  }

  return { kind: 'ok', envelope, people }
}

// Success deletes this sidecar, so its presence means the registry is a stale last-good.
function _loadPublicationStatus(projects, projectId) {
  let artifact
  try {
    artifact = projects.readArtifact(projectId, PUBLICATION_STATUS_KEY)
  } catch {
    return null
  }
  if (!artifact || !isRecord(artifact.value)) return null
  const status = artifact.value
  if (status.projectId !== projectId || status.artifactKey !== ARTIFACT_KEY) return null
  return status
}

function readProjectContributions(projects, projectId) {
  const loaded = _loadProjectContributionsData(projects, projectId)
  if (loaded.kind === 'error') return { status: loaded.status, error: loaded.error }

  if (loaded.kind === 'missing-artifact') {
    return { status: 404, error: 'Project contributions publication is unavailable' }
  }

  if (loaded.kind === 'unavailable') {
    return {
      status: 200,
      model: _unavailableReadModel(projectId, loaded.reason, loaded.publicationState, loaded.generatedAt)
    }
  }

  const status = _loadPublicationStatus(projects, projectId)
  return { status: 200, model: _buildReadModel(projectId, loaded, status) }
}

function _buildReadModel(projectId, loaded, status) {
  const { envelope, people } = loaded
  const data = envelope.data
  const generatedAt = typeof envelope.generatedAt === 'string' ? envelope.generatedAt : null
  const fetchedAt = typeof envelope.fetchedAt === 'string' ? envelope.fetchedAt : null

  const rawDiagnostics = isRecord(data.diagnostics) ? data.diagnostics : {}
  const unresolved = new Set(_stringList(rawDiagnostics.unresolvedIdentities))
  const carriedForward = new Set(_stringList(rawDiagnostics.carriedForward))
  const failedFetch = new Set(_stringList(rawDiagnostics.failedFetch))
  const identityConflicts = Array.isArray(rawDiagnostics.identityConflicts)
    ? rawDiagnostics.identityConflicts.filter(isRecord)
    : []
  const conflicted = new Set()
  for (const conflict of identityConflicts) {
    for (const accountId of _stringList(conflict.accountIds)) conflicted.add(accountId)
  }

  function contributionStatus(accountId, github) {
    if (conflicted.has(accountId)) return 'conflicted'
    if (github) return carriedForward.has(accountId) ? 'carried-forward' : 'collected'
    if (failedFetch.has(accountId)) return 'failed'
    return 'unresolved'
  }

  const normalizedPeople = people.map(person => {
    // A contested login resolves to no one: conflicted identities never receive
    // attribution, even if the publication still carries a github object.
    const github = conflicted.has(person.accountId) ? null : _normalizeGithub(person.github)
    return {
      key: `${projectId}::${person.accountId}`,
      projectId,
      accountId: person.accountId,
      displayName: person.displayName.trim(),
      active: person.active,
      teamIds: [...person.teamIds],
      github,
      // GitLab is unpublished by this collector; never fabricated.
      gitlab: null,
      contributionStatus: contributionStatus(person.accountId, github)
    }
  })

  // Stale when partial, non-fresh, or a failed re-collection is pending.
  const partial = envelope.partial === true
  const publicationError = status && isRecord(status.error) ? status.error : null
  const freshness = (envelope.freshness === 'fresh' && !partial && !status) ? 'fresh' : 'stale'

  return {
    projectId,
    availability: envelope.state === 'empty' ? 'empty' : 'available',
    reason: envelope.state === 'empty' ? 'no-roster-people' : null,
    publicationState: envelope.state,
    freshness,
    partial,
    generatedAt,
    fetchedAt,
    metric: isRecord(data.metric) ? data.metric : null,
    people: normalizedPeople,
    diagnostics: {
      unresolvedIdentities: [...unresolved].sort(),
      identityConflicts,
      carriedForward: [...carriedForward].sort(),
      failedFetch: [...failedFetch].sort(),
      gitlab: isRecord(rawDiagnostics.gitlab) ? rawDiagnostics.gitlab : { state: 'unavailable' }
    },
    publicationError
  }
}

function _unavailableReadModel(projectId, reason, publicationState, generatedAt) {
  return {
    projectId,
    availability: 'unavailable',
    reason,
    publicationState,
    freshness: 'unknown',
    partial: false,
    generatedAt,
    fetchedAt: null,
    metric: null,
    people: [],
    diagnostics: null,
    publicationError: null
  }
}

module.exports = { ARTIFACT_KEY, PUBLICATION_STATUS_KEY, readProjectContributions }
