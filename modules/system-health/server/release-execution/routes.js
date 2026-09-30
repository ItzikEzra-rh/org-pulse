/**
 * Project release-execution routes.
 *
 * Reads the project-qualified release-execution publication (bounded Actions
 * runs, jobs, artifacts) through the data-backed profile reader. Non-OSAC
 * CI evidence lives here; the OSAC CI daily digest keeps its own route.
 */

const ARTIFACT_KEY = 'sources/release-execution/registry.json'

/**
 * @param {object} router - Express router mounted at /api/modules/system-health/
 * @param {object} context - { requireAuth, requireScope, projects }
 */
module.exports = function registerReleaseExecutionRoutes(router, context) {
  const { requireAuth, requireScope, projects } = context

  router.get('/release-execution', requireAuth, requireScope('system-health:read'), function(req, res) {
    const projectId = req.query?.projectId
    if (!projectId) return res.status(400).json({ error: 'projectId is required' })
    if (!projects || typeof projects.readArtifact !== 'function') {
      return res.status(503).json({ error: 'Project publication reader is unavailable' })
    }
    try {
      const artifact = projects.readArtifact(projectId, ARTIFACT_KEY)
      if (!artifact || !artifact.value) {
        return res.status(404).json({ error: 'Release execution publication is unavailable' })
      }
      return res.json(artifact.value)
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }
  })
}
