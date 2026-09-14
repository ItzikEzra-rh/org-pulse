/**
 * OSAC CI Daily Digest routes.
 *
 * Pure readFromStorage passthrough — the envelope is fetched from
 * osac-project/osac-test-infra's daily digest workflow artifact by
 * org-pulse-data's fetch-ci-digest.py, delivered to the shared data-volume
 * root as ci-digest-data.json (not module-namespaced: it's produced by an
 * external collector before any org-pulse module claims it). No collection,
 * scheduling, or computation happens in the app itself.
 */

const DATA_KEY = 'ci-digest-data.json'

/**
 * @param {object} router - Express router mounted at /api/modules/system-health/
 * @param {object} context - { storage, requireAuth, requireScope }
 */
module.exports = function registerCiDigestRoutes(router, context) {
  const { storage, requireAuth, requireScope } = context
  const { readFromStorage } = storage

  /**
   * @openapi
   * /api/modules/system-health/ci-digest:
   *   get:
   *     summary: Get the latest OSAC CI daily digest envelope
   *     tags: [system-health-ci-digest]
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200:
   *         description: CI digest envelope ({ source, fetchedAt, digest })
   *       404:
   *         description: No CI digest report has been delivered yet
   */
  router.get('/ci-digest', requireAuth, requireScope('system-health:read'), function(req, res) {
    const envelope = readFromStorage(DATA_KEY)
    if (!envelope) {
      return res.status(404).json({ error: 'No CI digest report available yet' })
    }
    res.json(envelope)
  })
}
