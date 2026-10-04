/**
 * CI Duty routes. Pure readFromStorage passthrough, same pattern as ci-digest.
 */

const DATA_KEY = 'ci-duty-data.json'
const { resolveProjectSelection } = require('../../../../shared/server/project-profile')

/**
 * @param {object} router - Express router mounted at /api/modules/system-health/
 * @param {object} context - { storage, requireAuth, requireScope, projects }
 */
module.exports = function registerCiDutyRoutes(router, context) {
  const { storage, requireAuth, requireScope } = context
  const { readFromStorage } = storage

  /**
   * @openapi
   * /api/modules/system-health/ci-duty:
   *   get:
   *     summary: Get the CI Duty rotation roster
   *     tags: [system-health-ci-duty]
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - in: query
   *         name: projectId
   *         required: false
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: CI Duty roster ({ generatedAt, entries })
   *       404:
   *         description: No CI Duty roster has been delivered yet
   */
  router.get('/ci-duty', requireAuth, requireScope('system-health:read'), function(req, res) {
    const selection = resolveProjectSelection(context.projects, req.query)
    if (selection.status) return res.status(selection.status).json({ error: selection.error })
    // CI Duty is user-approved OSAC-only (inapplicable for Flightctl): a
    // non-OSAC project never receives OSAC duty data.
    if (selection.provided && selection.projectId !== 'osac') {
      return res.status(200).json({
        projectId: selection.projectId,
        state: 'inapplicable',
        reason: 'user-approved-osac-only',
        data: null
      })
    }
    const roster = readFromStorage(DATA_KEY)
    if (!roster) {
      return res.status(404).json({ error: 'No CI Duty roster available yet' })
    }
    res.json(roster)
  })
}
