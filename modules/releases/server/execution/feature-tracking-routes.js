/**
 * Project-qualified Feature Tracking routes.
 *
 * The data repository owns baseline collection and scope classification. These
 * routes read the Execute index and each tracker from one pinned project
 * generation; they do not recompute baselines in the app.
 */

const { readRegistry } = require('../registry')
const { resolveReleaseProject, sendProjectScopeError } = require('../project-scope')
const {
  resolveExecutionScope,
  readExecutionIndex,
  readTrackingArtifact
} = require('./project-artifacts')

const TRACKING_DIR = 'releases/execution'
const TRACKING_PREFIX = 'tracking-data-'
const VALID_RELEASE_ID = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,255}$/

function encodeReleaseId(releaseId) {
  return encodeURIComponent(releaseId).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function trackingFileKey(releaseId) {
  return `${TRACKING_DIR}/${TRACKING_PREFIX}${encodeReleaseId(releaseId)}.json`
}

function decodeReleaseId(value) {
  try { return decodeURIComponent(value) } catch { return value }
}

function listTrackingReleaseIds(storage) {
  const fileNames = storage.listStorageFiles ? storage.listStorageFiles(TRACKING_DIR) : []
  const ids = []
  for (let i = 0; i < fileNames.length; i++) {
    const name = fileNames[i]
    if (name.indexOf(TRACKING_PREFIX) === 0 && name.endsWith('.json')) {
      ids.push(decodeReleaseId(name.slice(TRACKING_PREFIX.length, -'.json'.length)))
    }
  }
  return [...new Set(ids)]
}

function orderReleaseIds(releaseIds, registry) {
  const registryOrder = {}
  const releases = registry.releases || []
  for (let i = 0; i < releases.length; i++) registryOrder[releases[i].id] = i
  return releaseIds.slice().sort((a, b) => {
    const aIdx = registryOrder[a]
    const bIdx = registryOrder[b]
    if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx
    if (aIdx !== undefined) return -1
    if (bIdx !== undefined) return 1
    return a.localeCompare(b)
  })
}

module.exports = function registerFeatureTrackingRoutes(router, context) {
  const { storage, requireAuth, requireScope, projects = null } = context

  function selectedExecution(req, res) {
    const selection = resolveReleaseProject(projects, req.query)
    if (sendProjectScopeError(res, selection)) return null
    try {
      const scope = resolveExecutionScope(storage, projects, selection)
      return { selection, scope, publication: readExecutionIndex(scope) }
    } catch (error) {
      const status = error.code === 'PROJECT_NOT_FOUND' ? 404 : error.code === 'PROJECT_SELECTION_REQUIRED' ? 400 : 503
      res.status(status).json({
        projectId: selection.projectId,
        state: 'unavailable',
        freshness: 'unknown',
        partial: true,
        reason: error.code || 'project-publication-unavailable',
        error: error.message
      })
      return null
    }
  }

  function legacySummaries(scope) {
    if (!scope.legacyAdapter) return []
    const ids = orderReleaseIds(
      listTrackingReleaseIds(storage),
      readRegistry(storage.readFromStorage)
    )
    return ids.map(releaseId => ({
      releaseId,
      artifactKey: trackingFileKey(releaseId),
      displayName: releaseId,
      fixVersions: [],
      baselineDate: null,
      baselineSource: 'unknown',
      scopePolicyState: 'legacy',
      historyCoverage: 'unknown',
      featureCount: null,
      counts: null
    }))
  }

  /**
   * @openapi
   * /api/modules/releases/execution/tracking/releases:
   *   get:
   *     summary: List release tracking summaries for the selected project
   *     tags: [Releases - Feature Tracking]
   *     parameters:
   *       - in: query
   *         name: projectId
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Project-qualified release tracking summaries
   *       404:
   *         description: Unknown project
   */
  router.get('/tracking/releases', requireAuth, requireScope('releases:read'), function(req, res) {
    const selected = selectedExecution(req, res)
    if (!selected) return
    const { scope, publication } = selected
    if (!publication.ok) return res.json({ ...publication.meta, releases: [] })

    const summaries = Array.isArray(publication.data.trackingReleases)
      ? publication.data.trackingReleases
      : legacySummaries(scope)
    const releases = []
    let partial = publication.meta.partial
    for (const summary of summaries) {
      const result = readTrackingArtifact(scope, summary, publication)
      if (!result.ok) {
        partial = true
        releases.push({
          ...summary,
          featureCount: null,
          counts: { committed: null, added: null, dropped: null, moved: null, unknown: null, blockerPriority: null },
          state: 'unavailable',
          reason: result.reason || 'tracking-artifact-unavailable'
        })
        continue
      }
      const data = result.data
      releases.push({
        releaseId: data.releaseId,
        displayName: data.displayName || summary.displayName || data.releaseId,
        fixVersions: data.fixVersions || summary.fixVersions || [],
        baselineDate: data.baselineDate ?? summary.baselineDate ?? null,
        baselineSource: data.baselineSource || summary.baselineSource || 'unknown',
        scopePolicyState: data.scopePolicyState || summary.scopePolicyState || 'unknown',
        historyCoverage: data.historyCoverage || summary.historyCoverage || 'unknown',
        fetchedAt: data.fetchedAt || summary.fetchedAt || null,
        featureCount: data.featureCount ?? summary.featureCount ?? null,
        counts: data.counts ?? summary.counts ?? null,
        wasQueryFailed: data.wasQueryFailed === true,
        state: result.envelope.state || 'supported',
        freshness: result.envelope.freshness || publication.meta.freshness,
        partial: result.envelope.partial === true
      })
      if (result.envelope.partial || result.envelope.state === 'error') partial = true
    }

    res.json({
      ...publication.meta,
      partial,
      baselinePolicy: publication.data.coverage?.scopeBaseline || 'unknown',
      releases
    })
  })

  /**
   * @openapi
   * /api/modules/releases/execution/tracking/data:
   *   get:
   *     summary: Get scope tracking data for one selected-project release
   *     tags: [Releases - Feature Tracking]
   *     parameters:
   *       - in: query
   *         name: projectId
   *         schema: { type: string }
   *       - in: query
   *         name: releaseId
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Project-qualified release scope tracking data
   *       400:
   *         description: Invalid or missing releaseId parameter
   *       404:
   *         description: Project or release tracking data not found
   */
  router.get('/tracking/data', requireAuth, requireScope('releases:read'), function(req, res) {
    const selected = selectedExecution(req, res)
    if (!selected) return
    const { scope, publication } = selected
    const releaseId = req.query.releaseId
    if (typeof releaseId !== 'string' || !VALID_RELEASE_ID.test(releaseId)) {
      return res.status(400).json({ error: 'releaseId query parameter must be a non-empty release ID' })
    }
    if (!publication.ok) return res.json({ ...publication.meta, releaseId, features: [] })

    let summary = (publication.data.trackingReleases || []).find(item => item.releaseId === releaseId)
    if (!summary && scope.legacyAdapter && listTrackingReleaseIds(storage).includes(releaseId)) {
      summary = { releaseId, artifactKey: trackingFileKey(releaseId) }
    }
    if (!summary) {
      return res.status(404).json({
        ...publication.meta,
        error: `No feature tracking data found for ${releaseId}`
      })
    }

    const result = readTrackingArtifact(scope, summary, publication)
    if (!result.ok) {
      return res.json({
        ...publication.meta,
        releaseId,
        state: 'unavailable',
        partial: true,
        reason: result.reason || 'tracking-artifact-unavailable',
        features: []
      })
    }
    res.json({
      ...result.data,
      ...publication.meta,
      state: result.envelope.state || publication.meta.state,
      freshness: result.envelope.freshness || publication.meta.freshness,
      partial: publication.meta.partial || result.envelope.partial === true,
      releaseId,
      artifactKey: summary.artifactKey
    })
  })
}

module.exports.trackingFileKey = trackingFileKey
module.exports.listTrackingReleaseIds = listTrackingReleaseIds
module.exports.orderReleaseIds = orderReleaseIds
module.exports.encodeReleaseId = encodeReleaseId
