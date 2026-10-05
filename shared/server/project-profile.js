/**
 * Project-qualified publication contracts.
 *
 * The data repository owns profile values. This module only validates the
 * published projection and resolves project artifacts through storage.
 */

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const JIRA_PROJECT_PATTERN = /^[A-Z][A-Z0-9_]*$/
const REPOSITORY_PATTERN = /^[^/\s]+\/[^/\s]+$/
const PROFILE_SCHEMA_VERSION = 1
const PUBLICATION_SCHEMA_VERSION = 1
const PROJECT_INDEX_SCHEMA_VERSION = 1
const CAPABILITY_STATES = Object.freeze([
  'supported', 'unavailable', 'inaccessible', 'empty', 'inapplicable',
  'disabled', 'source-only', 'error'
])
const FRESHNESS_STATES = Object.freeze(['fresh', 'stale', 'expired', 'unknown'])

function clone(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  Object.values(value).forEach(deepFreeze)
  return value
}

function normalizeString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string`)
  }
  return value.trim()
}

function normalizeProjectId(projectId) {
  const value = normalizeString(projectId, 'projectId')
  if (!PROJECT_ID_PATTERN.test(value)) {
    throw new Error(`projectId must be lowercase kebab-case: ${value}`)
  }
  return value
}

class ProjectProfileIndexError extends Error {
  constructor(message, code = 'PROJECT_INDEX_INVALID') {
    super(message)
    this.name = 'ProjectProfileIndexError'
    this.code = code
  }
}

/**
 * Resolve an optional projectId query parameter without allowing invalid or
 * unknown IDs to fall through to an unqualified (legacy) data source.
 */
function resolveProjectSelection(projects, query) {
  const params = query && typeof query === 'object' ? query : {}
  if (!Object.prototype.hasOwnProperty.call(params, 'projectId')) {
    return { provided: false }
  }

  let projectId
  try {
    projectId = normalizeProjectId(params.projectId)
  } catch (error) {
    return { provided: true, status: 400, error: error.message }
  }
  if (params.projectId !== projectId) {
    return { provided: true, status: 400, error: 'projectId must not contain surrounding whitespace' }
  }

  if (!projects || typeof projects.get !== 'function') {
    return { provided: true, status: 503, error: 'Project profile reader is unavailable' }
  }

  try {
    const profile = projects.get(projectId)
    if (!profile) return { provided: true, status: 404, error: 'Unknown project' }
    return { provided: true, projectId, profile }
  } catch (error) {
    return { provided: true, status: 500, error: error.message || 'Failed to read project profile' }
  }
}

function normalizeArtifactKey(key) {
  const value = normalizeString(key, 'artifactKey').replace(/\\/g, '/')
  const segments = value.split('/')
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)
      || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('artifactKey must be a relative path without empty, ".", or ".." segments')
  }
  return segments.join('/')
}

function normalizeGenerationId(value) {
  const generationId = normalizeString(value, 'generationId')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(generationId)) {
    throw new Error('generationId contains unsafe characters')
  }
  return generationId
}

function normalizeRepository(repository) {
  const value = typeof repository === 'string' ? { fullName: repository } : repository
  if (!value || typeof value !== 'object') {
    throw new TypeError('repository entries must be strings or objects')
  }
  const fullName = normalizeString(value.fullName, 'repository.fullName')
  if (!REPOSITORY_PATTERN.test(fullName)) {
    throw new Error(`repository.fullName must use the "org/name" form: ${fullName}`)
  }
  return {
    fullName,
    role: value.role || 'delivery',
    authority: value.authority || null
  }
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object') {
    throw new TypeError('source entries must be objects')
  }
  return {
    id: normalizeString(source.id, 'source.id'),
    kind: source.kind || 'repository',
    role: source.role || 'supporting',
    authority: source.authority || null,
    locator: source.locator || null
  }
}

/** Validate and freeze one published project profile. */
function normalizeProjectProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new TypeError('project profile must be an object')
  }
  if (profile.schemaVersion !== undefined && profile.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new Error(`unsupported project profile schemaVersion: ${profile.schemaVersion}`)
  }

  const projectId = normalizeProjectId(profile.projectId)
  const jiraProjectKey = normalizeString(
    profile.jiraProjectKey || profile.jira?.projectKey,
    'jiraProjectKey'
  )
  if (!JIRA_PROJECT_PATTERN.test(jiraProjectKey)) {
    throw new Error(`jiraProjectKey must be an uppercase Jira project key: ${jiraProjectKey}`)
  }

  const repositories = Array.isArray(profile.repositories)
    ? profile.repositories.map(normalizeRepository)
    : []
  const repositoryNames = repositories.map(repository => repository.fullName)
  if (new Set(repositoryNames).size !== repositoryNames.length) {
    throw new Error(`project profile contains duplicate repositories: ${projectId}`)
  }

  const sources = Array.isArray(profile.sources) ? profile.sources.map(normalizeSource) : []
  const sourceIds = sources.map(source => source.id)
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new Error(`project profile contains duplicate sources: ${projectId}`)
  }

  const teamIds = Array.isArray(profile.teamIds)
    ? profile.teamIds.map(teamId => normalizeString(teamId, 'teamIds[]'))
    : Array.isArray(profile.roster?.teamIds)
      ? profile.roster.teamIds.map(teamId => normalizeString(teamId, 'roster.teamIds[]'))
      : []
  if (new Set(teamIds).size !== teamIds.length) {
    throw new Error(`project profile contains duplicate team IDs: ${projectId}`)
  }

  const executeRevision = profile.executeRevision === undefined || profile.executeRevision === null
    ? null
    : normalizeString(profile.executeRevision, 'executeRevision')
  if (executeRevision !== null && !/^[0-9a-f]{16}$/.test(executeRevision)) {
    throw new Error(`executeRevision must be a 16-character lowercase hex digest: ${projectId}`)
  }
  const execution = profile.execution && typeof profile.execution === 'object'
    ? clone(profile.execution)
    : null
  if (execution && execution.schemaVersion !== undefined && execution.schemaVersion !== 1) {
    throw new Error(`unsupported Execute profile schemaVersion: ${execution.schemaVersion}`)
  }
  const executeCapability = profile.capabilities?.execute
  if (executeCapability !== undefined && (!executeCapability || typeof executeCapability !== 'object' || Array.isArray(executeCapability))) {
    throw new Error(`capabilities.execute must be an object: ${projectId}`)
  }
  if (executeCapability?.state === 'supported'
      && (executeCapability.artifactKey !== 'releases/execution/index.json' || !executeRevision)) {
    throw new Error(`supported Execute capability must declare its artifact and revision: ${projectId}`)
  }

  return deepFreeze({
    schemaVersion: profile.schemaVersion || PROFILE_SCHEMA_VERSION,
    profileRevision: normalizeString(profile.profileRevision || 'unversioned', 'profileRevision'),
    projectId,
    displayName: normalizeString(profile.displayName, 'displayName'),
    jiraProjectKey,
    jiraProjectName: normalizeString(
      profile.jiraProjectName || profile.jira?.projectName || profile.displayName,
      'jiraProjectName'
    ),
    jiraBaseUrl: profile.jiraBaseUrl || profile.jira?.baseUrl || null,
    repositories,
    sources,
    teamIds,
    capabilities: profile.capabilities && typeof profile.capabilities === 'object'
      ? clone(profile.capabilities)
      : {},
    execution,
    executeRevision,
    provenance: profile.provenance && typeof profile.provenance === 'object'
      ? clone(profile.provenance)
      : null
  })
}

function createPublicationEnvelope(profile, artifactKey, data, metadata = {}) {
  const normalizedProfile = normalizeProjectProfile(profile)
  const normalizedArtifactKey = normalizeArtifactKey(artifactKey)
  const state = metadata.state || 'supported'
  const freshness = metadata.freshness || 'unknown'
  if (!CAPABILITY_STATES.includes(state)) throw new Error(`Unsupported publication state: ${state}`)
  if (!FRESHNESS_STATES.includes(freshness)) throw new Error(`Unsupported freshness state: ${freshness}`)

  const now = new Date().toISOString()
  return {
    schemaVersion: PUBLICATION_SCHEMA_VERSION,
    projectId: normalizedProfile.projectId,
    profileRevision: normalizedProfile.profileRevision,
    artifactKey: normalizedArtifactKey,
    source: {
      id: metadata.sourceId || null,
      kind: metadata.sourceKind || null,
      endpoint: metadata.sourceEndpoint || null,
      revision: metadata.sourceRevision || null,
      runId: metadata.runId || null
    },
    generatedAt: metadata.generatedAt === undefined ? now : metadata.generatedAt,
    fetchedAt: metadata.fetchedAt === undefined ? now : metadata.fetchedAt,
    observedAt: metadata.observedAt || (
      state === 'supported' || state === 'empty' ? metadata.fetchedAt || null : null
    ),
    attemptedAt: metadata.attemptedAt || now,
    publishedAt: metadata.publishedAt || now,
    state,
    freshness,
    partial: metadata.partial === true,
    error: metadata.error || null,
    lastKnownGood: metadata.lastKnownGood || null,
    data
  }
}

function createProjectProfileReader(storage) {
  if (!storage || typeof storage.readFromStorage !== 'function') {
    throw new TypeError('storage must provide readFromStorage')
  }
  const { readFromStorage } = storage

  function resolve(projectId) {
    const normalizedId = normalizeProjectId(projectId)
    const pointerKey = `projects/${normalizedId}/current.json`
    const pointer = readFromStorage(pointerKey)
    if (pointer !== null && pointer !== undefined) {
      if (pointer.projectId !== normalizedId) throw new Error(`project pointer identity mismatch: ${normalizedId}`)
      const generationId = normalizeGenerationId(pointer.generationId)
      const rootKey = `projects/${normalizedId}/generations/${generationId}`
      const profileKey = `${rootKey}/profile.json`
      const profileData = readFromStorage(profileKey)
      if (!profileData) throw new Error(`published profile is missing: ${profileKey}`)
      const profile = normalizeProjectProfile(profileData)
      if (profile.projectId !== normalizedId) throw new Error(`profile identity mismatch: ${normalizedId}`)
      return { profile, rootKey, generationId, pointerKey }
    }

    // Local development may read a checked-out data repository directly before
    // the sidecar has materialized generations. This is still real published
    // data, not an app-owned profile fallback.
    const profileKey = `projects/${normalizedId}/profile.json`
    const profileData = readFromStorage(profileKey)
    if (!profileData) return null
    const profile = normalizeProjectProfile(profileData)
    if (profile.projectId !== normalizedId) throw new Error(`profile identity mismatch: ${normalizedId}`)
    return { profile, rootKey: `projects/${normalizedId}`, generationId: null, pointerKey: null }
  }

  function get(projectId) {
    const result = resolve(projectId)
    return result ? result.profile : null
  }

  function list() {
    let index
    try {
      index = readFromStorage('projects/index.json')
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ProjectProfileIndexError('Published project index is malformed JSON')
      }
      throw error
    }
    if (index === null || index === undefined) {
      throw new ProjectProfileIndexError('Published project index is missing: projects/index.json', 'PROJECT_INDEX_MISSING')
    }
    if (!index || typeof index !== 'object' || Array.isArray(index)) {
      throw new ProjectProfileIndexError('Published project index must be an object')
    }
    if (index.schemaVersion !== PROJECT_INDEX_SCHEMA_VERSION) {
      throw new ProjectProfileIndexError(`Published project index schemaVersion must be ${PROJECT_INDEX_SCHEMA_VERSION}`)
    }
    if (!Array.isArray(index.projects) || index.projects.length === 0) {
      throw new ProjectProfileIndexError('Published project index must contain at least one project')
    }

    const seenProjectIds = new Set()
    const entries = index.projects.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new ProjectProfileIndexError('Published project index entries must be objects')
      }

      let projectId
      try {
        projectId = normalizeProjectId(entry.projectId)
      } catch (error) {
        throw new ProjectProfileIndexError(`Invalid project ID in published project index: ${error.message}`)
      }
      if (entry.projectId !== projectId) {
        throw new ProjectProfileIndexError(`Project ID in published project index is not normalized: ${projectId}`)
      }
      if (typeof entry.displayName !== 'string' || entry.displayName.trim() === '' || entry.displayName !== entry.displayName.trim()) {
        throw new ProjectProfileIndexError(`Published project index displayName is missing or invalid: ${projectId}`)
      }
      if (typeof entry.profileRevision !== 'string' || !/^[0-9a-f]{16}$/.test(entry.profileRevision)) {
        throw new ProjectProfileIndexError(`Published project index profileRevision is missing or invalid: ${projectId}`)
      }
      if (entry.profileKey !== `projects/${projectId}/profile.json`) {
        throw new ProjectProfileIndexError(`Published project index profileKey is invalid: ${projectId}`)
      }
      if (entry.executeRevision !== undefined
          && (typeof entry.executeRevision !== 'string' || !/^[0-9a-f]{16}$/.test(entry.executeRevision))) {
        throw new ProjectProfileIndexError(`Published project index executeRevision is missing or invalid: ${projectId}`)
      }
      if (seenProjectIds.has(projectId)) {
        throw new ProjectProfileIndexError(`Duplicate project ID in published project index: ${projectId}`)
      }
      seenProjectIds.add(projectId)
      return { entry, projectId }
    })

    return entries.map(({ entry, projectId }) => {
      let profile
      try {
        profile = get(projectId)
      } catch (error) {
        throw new ProjectProfileIndexError(`Published project profile ${projectId} is invalid: ${error.message}`, 'PROJECT_PROFILE_INVALID')
      }
      if (!profile) {
        throw new ProjectProfileIndexError(`Published project profile is missing: ${projectId}`, 'PROJECT_PROFILE_MISSING')
      }
      if (entry.profileRevision !== profile.profileRevision) {
        throw new ProjectProfileIndexError(`Published project profile revision does not match the index: ${projectId}`, 'PROJECT_PROFILE_REVISION_MISMATCH')
      }
      if (entry.displayName !== profile.displayName) {
        throw new ProjectProfileIndexError(`Published project profile display name does not match the index: ${projectId}`, 'PROJECT_PROFILE_DISPLAY_NAME_MISMATCH')
      }
      if ((entry.executeRevision || null) !== (profile.executeRevision || null)) {
        throw new ProjectProfileIndexError(`Published project Execute revision does not match the index: ${projectId}`, 'PROJECT_EXECUTE_REVISION_MISMATCH')
      }
      return profile
    })
  }

  function readArtifact(projectId, artifactKey) {
    const result = resolve(projectId)
    if (!result) return null
    const normalizedArtifactKey = normalizeArtifactKey(artifactKey)
    const key = `${result.rootKey}/${normalizedArtifactKey}`
    const value = readFromStorage(key)
    if (value === null || value === undefined) return null
    if (value.projectId && value.projectId !== result.profile.projectId) {
      throw new Error(`artifact identity mismatch: ${key}`)
    }
    return {
      key,
      storageKey: key,
      generationId: result.generationId,
      profile: result.profile,
      value
    }
  }

  return Object.freeze({ get, list, readArtifact, resolve })
}

function getLastKnownGood(existing, storageKey) {
  if (!existing) return null
  return {
    available: true,
    key: storageKey,
    projectId: existing.projectId || null,
    generatedAt: existing.generatedAt || null,
    sourceRevision: existing.source?.revision || null,
    sourceRunId: existing.source?.runId || null
  }
}

/** Small in-memory helper retained for focused contract tests and callers that
 * already supply profiles. Production server code uses createProjectProfileReader. */
function createProjectProfileRegistry(profiles) {
  if (!Array.isArray(profiles) || profiles.length === 0) throw new TypeError('at least one project profile is required')
  const profileMap = new Map()
  profiles.forEach(profile => {
    const normalized = normalizeProjectProfile(profile)
    if (profileMap.has(normalized.projectId)) throw new Error(`duplicate project profile: ${normalized.projectId}`)
    profileMap.set(normalized.projectId, normalized)
  })

  function requireProfile(projectId) {
    const profile = profileMap.get(normalizeProjectId(projectId))
    if (!profile) throw new Error(`unknown project profile: ${projectId}`)
    return profile
  }

  function qualifyStorageKey(projectId, artifactKey) {
    return `projects/${requireProfile(projectId).projectId}/${normalizeArtifactKey(artifactKey)}`
  }

  function publicationStatusKey(projectId, artifactKey) {
    return `projects/${requireProfile(projectId).projectId}/_publication/${encodeURIComponent(normalizeArtifactKey(artifactKey))}.status.json`
  }

  function envelope(projectId, artifactKey, data, metadata) {
    return createPublicationEnvelope(requireProfile(projectId), artifactKey, data, metadata)
  }

  function publish(storage, projectId, artifactKey, data, metadata = {}) {
    if (!storage || typeof storage.readFromStorage !== 'function' || typeof storage.writeToStorageAtomic !== 'function') {
      throw new TypeError('storage must provide readFromStorage and writeToStorageAtomic')
    }
    const key = qualifyStorageKey(projectId, artifactKey)
    const previous = storage.readFromStorage(key)
    const next = envelope(projectId, artifactKey, data, metadata)
    try {
      storage.writeToStorageAtomic(key, next)
      return { ok: true, status: 'published', key, envelope: next }
    } catch (error) {
      const failure = envelope(projectId, artifactKey, previous?.data ?? null, {
        ...metadata,
        sourceId: previous?.source?.id ?? null,
        sourceKind: previous?.source?.kind ?? null,
        sourceEndpoint: previous?.source?.endpoint ?? null,
        sourceRevision: previous?.source?.revision ?? null,
        runId: previous?.source?.runId ?? null,
        generatedAt: previous?.generatedAt ?? null,
        fetchedAt: previous?.fetchedAt ?? null,
        observedAt: previous?.observedAt ?? null,
        state: 'error',
        freshness: 'stale',
        partial: true,
        error: { code: error.code || 'PUBLISH_FAILED', message: error.message },
        lastKnownGood: getLastKnownGood(previous, key)
      })
      const statusKey = publicationStatusKey(projectId, artifactKey)
      let statusWriteError = null
      try {
        storage.writeToStorageAtomic(statusKey, failure)
      } catch (statusError) {
        statusWriteError = { code: statusError.code || 'STATUS_PUBLISH_FAILED', message: statusError.message }
      }
      return { ok: false, status: 'error', key, statusKey, preserved: previous !== null, envelope: failure, statusWriteError }
    }
  }

  return Object.freeze({
    schemaVersion: PUBLICATION_SCHEMA_VERSION,
    get: projectId => profileMap.get(normalizeProjectId(projectId)) || null,
    list: () => Array.from(profileMap.values()),
    qualifyStorageKey,
    publicationStatusKey,
    envelope,
    publish
  })
}

module.exports = {
  PROJECT_ID_PATTERN,
  JIRA_PROJECT_PATTERN,
  PROFILE_SCHEMA_VERSION,
  PUBLICATION_SCHEMA_VERSION,
  CAPABILITY_STATES,
  FRESHNESS_STATES,
  ProjectProfileIndexError,
  normalizeArtifactKey,
  resolveProjectSelection,
  normalizeProjectProfile,
  createPublicationEnvelope,
  createProjectProfileReader,
  createProjectProfileRegistry
}
