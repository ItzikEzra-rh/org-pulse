const crypto = require('crypto')
const { normalizeArtifactKey } = require('../../../../shared/server/project-profile')

const EXECUTION_PREFIX = 'releases/execution'
const INDEX_KEY = `${EXECUTION_PREFIX}/index.json`
const PUBLICATION_STATES = new Set(['supported', 'empty', 'error', 'unavailable', 'inaccessible', 'source-only'])
const FRESHNESS_STATES = new Set(['fresh', 'stale', 'expired', 'unknown'])

function identityError(message, code = 'EXECUTE_PUBLICATION_INVALID') {
  const error = new Error(message)
  error.code = code
  return error
}

function legacyGenerationId(data) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 24)
  return `legacy-osac-${digest}`
}

function legacyFreshness(fetchedAt) {
  if (typeof fetchedAt !== 'string' || !Number.isFinite(Date.parse(fetchedAt))) return 'unknown'
  return Date.now() - Date.parse(fetchedAt) > 48 * 60 * 60 * 1000 ? 'stale' : 'fresh'
}

function buildMeta(scope, envelope, data, overrides = {}) {
  const freshness = FRESHNESS_STATES.has(envelope?.freshness) ? envelope.freshness : 'unknown'
  return {
    projectId: scope.projectId,
    profileRevision: scope.profile?.profileRevision || envelope?.profileRevision || 'legacy',
    executeRevision: scope.profile?.executeRevision || envelope?.executeRevision || 'legacy',
    generationId: envelope?.generationId || null,
    state: PUBLICATION_STATES.has(envelope?.state) ? envelope.state : 'unavailable',
    freshness,
    partial: envelope?.partial === true,
    generatedAt: envelope?.generatedAt || null,
    fetchedAt: envelope?.fetchedAt || data?.fetchedAt || null,
    observedAt: envelope?.observedAt || data?.observedAt || data?.fetchedAt || null,
    sourceRefs: envelope?.sourceRefs || data?.sourceRefs || {},
    coverage: data?.coverage || {},
    error: envelope?.error || null,
    reason: overrides.reason || null,
    ...overrides
  }
}

/**
 * Resolve one stable project publication root for a request. All artifacts
 * read through the returned scope come from that root; callers never retry
 * against another project's namespace.
 */
function resolveExecutionScope(storage, projects, selection) {
  const projectId = selection?.projectId
  if (typeof projectId !== 'string' || !projectId) {
    throw identityError('projectId is required', 'PROJECT_SELECTION_REQUIRED')
  }

  if (!projects || selection.legacy) {
    if (projectId !== 'osac') throw identityError(`Unknown project: ${projectId}`, 'PROJECT_NOT_FOUND')
    return {
      projectId,
      profile: null,
      rootKey: null,
      legacyRoot: true,
      legacyAdapter: true,
      capability: { state: 'supported', artifactKey: INDEX_KEY },
      dataGenerationId: null,
      projects: null,
      storage
    }
  }

  let resolved = null
  let profile = selection.profile || null
  if (typeof projects.resolve === 'function') {
    resolved = projects.resolve(projectId)
    if (!resolved) throw identityError(`Unknown project: ${projectId}`, 'PROJECT_NOT_FOUND')
    profile = resolved.profile || profile
  } else if (typeof projects.get === 'function') {
    profile = projects.get(projectId) || profile
  }
  if (!profile || profile.projectId !== projectId) {
    throw identityError(`Unknown project: ${projectId}`, 'PROJECT_NOT_FOUND')
  }

  const execution = profile.execution || {}
  const capability = profile.capabilities?.execute || { state: 'unavailable' }
  const legacyAdapter = projectId === 'osac' && (
    execution.legacyFallback === true || execution.inventory?.source === 'legacy-feature-store'
  )
  return {
    projectId,
    profile,
    rootKey: resolved?.rootKey || null,
    legacyRoot: false,
    legacyAdapter,
    capability,
    dataGenerationId: resolved?.generationId || null,
    projects,
    storage,
    readArtifactGenerationId: undefined
  }
}

function createUnavailable(scope, reason, message) {
  return {
    ok: false,
    data: null,
    envelope: null,
    meta: buildMeta(scope, {
      state: 'unavailable',
      freshness: 'unknown',
      partial: true
    }, null, { reason, message })
  }
}

function readRawArtifact(scope, artifactKey) {
  const key = normalizeArtifactKey(artifactKey)
  if (scope.rootKey) {
    const value = scope.storage.readFromStorage(`${scope.rootKey}/${key}`)
    return value === undefined ? null : value
  }

  if (scope.projects && typeof scope.projects.readArtifact === 'function' && !scope.legacyRoot) {
    const artifact = scope.projects.readArtifact(scope.projectId, key)
    if (!artifact) return null
    const generationId = artifact.generationId || null
    if (scope.readArtifactGenerationId !== undefined && generationId !== scope.readArtifactGenerationId) {
      throw identityError('Project pointer changed while reading Execute artifacts', 'EXECUTE_GENERATION_CHANGED')
    }
    if (scope.readArtifactGenerationId === null) scope.readArtifactGenerationId = generationId
    return artifact.value
  }

  const storageKey = scope.legacyRoot ? key : `projects/${scope.projectId}/${key}`
  const value = scope.storage.readFromStorage(storageKey)
  return value === undefined ? null : value
}

function readLegacyRoot(scope, artifactKey) {
  if (!scope.legacyAdapter) return null
  const value = scope.storage.readFromStorage(normalizeArtifactKey(artifactKey))
  return value === undefined ? null : value
}

function validateEnvelope(scope, artifactKey, envelope, expectedGenerationId = null) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw identityError(`Execute artifact is not an object: ${artifactKey}`)
  }
  if (envelope.projectId !== scope.projectId) {
    throw identityError(`Execute artifact project identity mismatch: ${artifactKey}`)
  }
  if (envelope.artifactKey !== artifactKey) {
    throw identityError(`Execute artifact key mismatch: ${artifactKey}`)
  }
  if (scope.profile?.profileRevision && envelope.profileRevision !== scope.profile.profileRevision) {
    throw identityError(`Execute artifact profile revision mismatch: ${artifactKey}`)
  }
  if (scope.profile?.executeRevision && envelope.executeRevision !== scope.profile.executeRevision) {
    throw identityError(`Execute artifact configuration revision mismatch: ${artifactKey}`)
  }
  if (typeof envelope.generationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(envelope.generationId)) {
    throw identityError(`Execute artifact generation ID is missing or invalid: ${artifactKey}`)
  }
  if (expectedGenerationId && envelope.generationId !== expectedGenerationId) {
    throw identityError(`Execute artifacts belong to different generations: ${artifactKey}`, 'EXECUTE_GENERATION_MISMATCH')
  }
  if (!PUBLICATION_STATES.has(envelope.state)) {
    throw identityError(`Execute artifact state is invalid: ${artifactKey}`)
  }
  if (envelope.data !== undefined && envelope.data !== null && (typeof envelope.data !== 'object' || Array.isArray(envelope.data))) {
    throw identityError(`Execute artifact payload is invalid: ${artifactKey}`)
  }
  const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : null
  if (data?.projectId && data.projectId !== scope.projectId) {
    throw identityError(`Execute payload project identity mismatch: ${artifactKey}`)
  }
  if (data?.profileRevision && data.profileRevision !== envelope.profileRevision) {
    throw identityError(`Execute payload profile revision mismatch: ${artifactKey}`)
  }
  if (data?.executeRevision && data.executeRevision !== envelope.executeRevision) {
    throw identityError(`Execute payload configuration revision mismatch: ${artifactKey}`)
  }
  if (data?.generationId && data.generationId !== envelope.generationId) {
    throw identityError(`Execute payload generation mismatch: ${artifactKey}`)
  }
  return data
}

function wrapLegacy(scope, artifactKey, data, index) {
  const generatedAt = data?.fetchedAt || index?.fetchedAt || null
  return {
    schemaVersion: 1,
    projectId: scope.projectId,
    profileRevision: scope.profile?.profileRevision || 'legacy',
    executeRevision: scope.profile?.executeRevision || 'legacy',
    generationId: legacyGenerationId(index || data),
    artifactKey,
    state: Array.isArray(data?.features) && data.features.length === 0 ? 'empty' : 'supported',
    freshness: legacyFreshness(generatedAt),
    partial: false,
    generatedAt,
    fetchedAt: generatedAt,
    observedAt: generatedAt,
    sourceRefs: index?.sourceRefs || {
      legacyFeatureStore: {
        state: 'supported',
        freshness: legacyFreshness(generatedAt),
        artifactKey: 'releases/execution/index.json'
      }
    },
    data
  }
}

function readExecutionIndex(scope) {
  let envelope
  try {
    // Prefer the immutable project publication. The OSAC root store remains a
    // bounded compatibility source when the project publication is not yet
    // present during migration.
    envelope = readRawArtifact(scope, INDEX_KEY)
    if (!envelope && scope.legacyAdapter) {
      const legacy = readLegacyRoot(scope, INDEX_KEY)
      if (legacy && Array.isArray(legacy.features)) {
        envelope = wrapLegacy(scope, INDEX_KEY, legacy, legacy)
      }
    }
    if (!envelope && !['supported', 'empty'].includes(scope.capability?.state)) {
      const reason = scope.capability?.reason || 'not-collected'
      return createUnavailable(scope, reason, 'Execute data is not configured or has not been collected for this project.')
    }
    if (!envelope) return createUnavailable(scope, 'artifact-missing', 'Execute data has not been collected for this project.')
    const data = envelope.generationId
      ? validateEnvelope(scope, INDEX_KEY, envelope)
      : null
    if (!envelope.generationId && Array.isArray(envelope.features)) {
      // Bounded adapter for the pre-project OSAC store.
      const wrapped = wrapLegacy(scope, INDEX_KEY, envelope, envelope)
      return { ok: true, data: wrapped.data, envelope: wrapped, meta: buildMeta(scope, wrapped, wrapped.data) }
    }
    if (!data || !Array.isArray(data.features)) {
      const meta = buildMeta(scope, envelope, data, {
        reason: envelope.error?.code || (data ? 'invalid-index' : envelope.state),
        message: envelope.error?.message || 'Execute feature inventory is unavailable.'
      })
      return { ok: false, data, envelope, meta }
    }
    const meta = buildMeta(scope, envelope, data)
    if (['unavailable', 'inaccessible', 'source-only', 'error'].includes(meta.state) && !data.features.length) {
      return { ok: false, data, envelope, meta: { ...meta, reason: envelope.error?.code || meta.state } }
    }
    return { ok: true, data, envelope, meta }
  } catch (error) {
    return createUnavailable(scope, error.code || 'artifact-read-failed', error.message || 'Execute data is unavailable.')
  }
}

function readExecutionDetail(scope, key, indexResult) {
  const artifactKey = `${EXECUTION_PREFIX}/features/${key}.json`
  try {
    let envelope = readRawArtifact(scope, artifactKey)
    if (!envelope && scope.legacyAdapter) envelope = readLegacyRoot(scope, artifactKey)
    if (!envelope) return { ok: false, reason: 'detail-missing' }

    let data
    if (envelope.artifactKey === artifactKey && envelope.projectId === scope.projectId) {
      data = validateEnvelope(scope, artifactKey, envelope, indexResult.meta.generationId)
    } else {
      // Legacy root detail payloads are OSAC-only and are wrapped at the boundary.
      if (scope.projectId !== 'osac' || !scope.legacyAdapter || envelope.key !== key) {
        throw identityError(`Execute detail identity mismatch: ${artifactKey}`)
      }
      const wrapped = wrapLegacy(scope, artifactKey, envelope, indexResult.data)
      wrapped.generationId = indexResult.meta.generationId
      envelope = wrapped
      data = envelope.data
    }
    if (!data || data.key !== key) throw identityError(`Execute detail key mismatch: ${artifactKey}`)
    return { ok: true, data, envelope }
  } catch (error) {
    return { ok: false, reason: error.code || 'artifact-read-failed', error }
  }
}

function readTrackingArtifact(scope, tracking, indexResult) {
  const artifactKey = tracking?.artifactKey
  if (typeof artifactKey !== 'string' || !artifactKey.startsWith(`${EXECUTION_PREFIX}/tracking-data-`)) {
    return { ok: false, reason: 'tracking-artifact-unavailable' }
  }
  try {
    let envelope = readRawArtifact(scope, artifactKey)
    if (!envelope && scope.legacyAdapter) envelope = readLegacyRoot(scope, artifactKey)
    if (!envelope) return { ok: false, reason: 'tracking-artifact-missing' }
    let data
    if (envelope.artifactKey === artifactKey && envelope.projectId === scope.projectId) {
      data = validateEnvelope(scope, artifactKey, envelope, indexResult.meta.generationId)
    } else if (scope.projectId === 'osac' && scope.legacyAdapter) {
      const wrapped = wrapLegacy(scope, artifactKey, envelope, indexResult.data)
      wrapped.generationId = indexResult.meta.generationId
      envelope = wrapped
      data = envelope.data
    } else {
      throw identityError(`Tracking artifact identity mismatch: ${artifactKey}`)
    }
    if (!data || data.projectId && data.projectId !== scope.projectId
        || data.releaseId !== tracking.releaseId) {
      throw identityError(`Tracking release identity mismatch: ${artifactKey}`)
    }
    return { ok: true, data, envelope }
  } catch (error) {
    return { ok: false, reason: error.code || 'artifact-read-failed', error }
  }
}

function isLegacyInteractiveScope(scope) {
  return scope.projectId === 'osac' && scope.legacyAdapter
}

module.exports = {
  EXECUTION_PREFIX,
  INDEX_KEY,
  resolveExecutionScope,
  readExecutionIndex,
  readExecutionDetail,
  readTrackingArtifact,
  isLegacyInteractiveScope,
  buildMeta,
  createUnavailable
}
