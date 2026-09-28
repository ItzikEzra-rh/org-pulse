/**
 * CI Duty routes. Pure readFromStorage passthrough, same pattern as ci-digest.
 */

const DATA_KEY = 'ci-duty-data.json'

/**
 * @param {object} router - Express router mounted at /api/modules/system-health/
 * @param {object} context - { storage, requireAuth, requireScope }
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
   *     responses:
   *       200:
   *         description: CI Duty roster ({ generatedAt, entries })
   *       404:
   *         description: No CI Duty roster has been delivered yet
   */
  router.get('/ci-duty', requireAuth, requireScope('system-health:read'), function(req, res) {
    // CI Duty is user-approved OSAC-only (inapplicable for Flightctl): a
    // non-OSAC project never receives OSAC duty data.
    if (req.query?.projectId && req.query.projectId !== 'osac') {
      return res.status(200).json({
        projectId: req.query.projectId,
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
