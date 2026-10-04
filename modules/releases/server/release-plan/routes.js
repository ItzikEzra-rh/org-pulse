/**
 * Release Plan sub-feature routes for the unified releases module.
 *
 * Pure readFromStorage passthrough — the release-plan JSON is generated
 * outside the app (agentic-ci job running the /release-plan skill, see
 * OSAC-4397/OSAC-4398) and delivered via the sidecar. No LLM call here.
 */

const DATA_PREFIX = 'releases/release-plans'
const VERSION_RE = /^[a-zA-Z0-9._-]{1,50}$/
const RESERVED_VERSIONS = ['__proto__', 'constructor', 'prototype']
const { resolveProjectSelection } = require('../../../../shared/server/project-profile')

function isValidVersion(version) {
  return typeof version === 'string' && VERSION_RE.test(version) && !RESERVED_VERSIONS.includes(version)
}

// OSAC keeps the legacy layout (its plans are still generated there); every
// other project reads its own project-qualified release-plans directory.
/**
 * Register release-plan routes on the provided Express router.
 *
 * @param {object} router - Express router mounted at /api/modules/releases/
 * @param {object} context - { storage, requireAuth, requireScope }
 */
module.exports = function registerRoutes(router, context) {
  const { storage, requireAuth, requireScope, projects } = context
  const { readFromStorage } = storage

  function resolvePlanPrefix(req, res) {
    const selection = resolveProjectSelection(projects, req.query)
    if (selection.status) {
      res.status(selection.status).json({ error: selection.error })
      return null
    }
    return selection.provided && selection.projectId !== 'osac'
      ? `projects/${selection.projectId}/releases/release-plans`
      : DATA_PREFIX
  }

  /**
   * @openapi
   * /api/modules/releases/release-plans:
   *   get:
   *     summary: List published release-plan versions
   *     tags: [releases-release-plan]
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - name: projectId
   *         in: query
   *         required: false
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Index of published release-plan versions
   */
  router.get('/release-plans', requireAuth, requireScope('releases:read'), function(req, res) {
    const prefix = resolvePlanPrefix(req, res)
    if (!prefix) return
    const index = readFromStorage(`${prefix}/index.json`)
    res.json(index || { versions: [] })
  })

  /**
   * @openapi
   * /api/modules/releases/release-plan:
   *   get:
   *     summary: Get the release plan for a version
   *     tags: [releases-release-plan]
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - name: version
   *         in: query
   *         required: true
   *         schema: { type: string }
   *       - name: projectId
   *         in: query
   *         required: false
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Release-plan JSON for the requested version
   *       400:
   *         description: Missing or invalid version parameter
   *       404:
   *         description: No release plan found for the requested version
   */
  router.get('/release-plan', requireAuth, requireScope('releases:read'), function(req, res) {
    const version = req.query.version
    if (!version) {
      return res.status(400).json({ error: 'version is required' })
    }
    if (!isValidVersion(version)) {
      return res.status(400).json({ error: 'Invalid version format' })
    }

    const prefix = resolvePlanPrefix(req, res)
    if (!prefix) return
    const plan = readFromStorage(`${prefix}/${version}.json`)
    if (!plan) {
      return res.status(404).json({ error: 'Release plan not found' })
    }
    res.json(plan)
  })
}
