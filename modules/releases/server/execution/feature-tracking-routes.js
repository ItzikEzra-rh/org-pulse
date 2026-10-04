/**
 * Feature Tracking routes for the releases module.
 *
 * Read-only consumer of org-pulse-data's tracking-data-<releaseId>.json
 * files (produced by fetch-releases-feature-tracking.py). This app does no
 * Jira querying, no Product Pages lookups, and no writes here — baseline
 * configuration is owned entirely by org-pulse-data.
 */

const { readRegistry } = require('../registry')
const {
  resolveReleaseProject,
  sendProjectScopeError,
  unavailableProjectData
} = require('../project-scope')

const TRACKING_DIR = 'releases/execution'
const TRACKING_PREFIX = 'tracking-data-'
const VALID_RELEASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function trackingFileKey(releaseId) {
  return TRACKING_DIR + '/' + TRACKING_PREFIX + releaseId + '.json'
}

function listTrackingReleaseIds(storage) {
  var fileNames = storage.listStorageFiles ? storage.listStorageFiles(TRACKING_DIR) : []
  var ids = []
  for (var i = 0; i < fileNames.length; i++) {
    var name = fileNames[i]
    if (name.indexOf(TRACKING_PREFIX) === 0 && name.endsWith('.json')) {
      ids.push(name.slice(TRACKING_PREFIX.length, -'.json'.length))
    }
  }
  return ids
}

/**
 * Order release IDs by their position in the registry (registry.json is
 * maintained in a sensible release sequence); anything present in tracking
 * data but absent from the registry sorts after, alphabetically.
 */
function orderReleaseIds(releaseIds, registry) {
  var registryOrder = {}
  var releases = registry.releases || []
  for (var i = 0; i < releases.length; i++) {
    registryOrder[releases[i].id] = i
  }
  return releaseIds.slice().sort(function (a, b) {
    var aIdx = registryOrder[a]
    var bIdx = registryOrder[b]
    if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx
    if (aIdx !== undefined) return -1
    if (bIdx !== undefined) return 1
    return a.localeCompare(b)
  })
}

module.exports = function registerFeatureTrackingRoutes(router, context) {
  const storage = context.storage
  const requireAuth = context.requireAuth
  const requireScope = context.requireScope
  const projects = context.projects || null

  function selectedProject(req, res) {
    const selection = resolveReleaseProject(projects, req.query)
    if (sendProjectScopeError(res, selection)) return null
    return selection
  }

  /**
   * @openapi
   * /api/modules/releases/execution/tracking/releases:
   *   get:
   *     summary: List releases with feature tracking data, with summary counts
   *     tags: [Releases - Feature Tracking]
   *     responses:
   *       200:
   *         description: Array of release tracking summaries
  */
  router.get('/tracking/releases', requireAuth, requireScope('releases:read'), function (req, res) {
    const selection = selectedProject(req, res)
    if (!selection) return
    if (selection.projectId !== 'osac') {
      return res.json({
        ...unavailableProjectData(
          selection.projectId,
          'feature-tracking',
          'Feature tracking has not been collected for this project.'
        ),
        releases: []
      })
    }
    const registry = readRegistry(storage.readFromStorage)
    const releaseIds = orderReleaseIds(listTrackingReleaseIds(storage), registry)

    const releases = []
    for (let i = 0; i < releaseIds.length; i++) {
      let data
      try {
        data = storage.readFromStorage(trackingFileKey(releaseIds[i]))
      } catch (err) {
        console.error('[feature-tracking] Failed to read tracking data for', releaseIds[i], err.message)
        continue
      }
      if (!data) continue
      releases.push({
        releaseId: data.releaseId,
        displayName: data.displayName || data.releaseId,
        fixVersions: data.fixVersions || [],
        baselineDate: data.baselineDate || null,
        baselineSource: data.baselineSource || 'unknown',
        fetchedAt: data.fetchedAt || null,
        featureCount: data.featureCount || 0,
        counts: data.counts || null,
        wasQueryFailed: !!data.wasQueryFailed
      })
    }

    res.json({ releases: releases })
  })

  /**
   * @openapi
   * /api/modules/releases/execution/tracking/data:
   *   get:
   *     summary: Get feature tracking data for a release
   *     tags: [Releases - Feature Tracking]
   *     parameters:
   *       - in: query
   *         name: releaseId
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Feature tracking data for the release
   *       400:
   *         description: Missing releaseId parameter
   *       404:
   *         description: No tracking data found for this release
  */
  router.get('/tracking/data', requireAuth, requireScope('releases:read'), function (req, res) {
    const selection = selectedProject(req, res)
    if (!selection) return
    if (selection.projectId !== 'osac') {
      return res.status(404).json({
        ...unavailableProjectData(
          selection.projectId,
          'feature-tracking',
          'Feature tracking has not been collected for this project.'
        ),
        error: `No project-qualified feature tracking data for ${selection.projectId}`
      })
    }
    const releaseId = req.query.releaseId
    if (typeof releaseId !== 'string' || !VALID_RELEASE_ID.test(releaseId)) {
      return res.status(400).json({ error: 'releaseId query parameter must be a non-empty string' })
    }

    let data
    try {
      data = storage.readFromStorage(trackingFileKey(releaseId))
    } catch (err) {
      console.error('[feature-tracking] Failed to read tracking data for', releaseId, err.message)
      return res.status(500).json({ error: 'Feature tracking data for release is unreadable: ' + releaseId })
    }
    if (!data) {
      return res.status(404).json({ error: 'No feature tracking data found for release: ' + releaseId })
    }

    res.json(data)
  })
}

module.exports.trackingFileKey = trackingFileKey
module.exports.listTrackingReleaseIds = listTrackingReleaseIds
module.exports.orderReleaseIds = orderReleaseIds
