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
      revision: metadata.sourceRevision || null,
      runId: metadata.runId || null
    },
    generatedAt: metadata.generatedAt || now,
    fetchedAt: metadata.fetchedAt || now,
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
    const index = readFromStorage('projects/index.json')
    const entries = Array.isArray(index?.projects) ? index.projects : []
    return entries.map(entry => {
      try {
        return get(entry.projectId)
      } catch (error) {
        console.warn(`[projects] ignoring invalid published profile ${entry.projectId}: ${error.message}`)
        return null
      }
    }).filter(Boolean)
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
    get: projectId => profileMap.get(projectId) || null,
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
  normalizeArtifactKey,
  normalizeProjectProfile,
  createPublicationEnvelope,
  createProjectProfileReader,
  createProjectProfileRegistry
}
