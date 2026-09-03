const STORAGE_KEY = 'system-health/component-maturity/maturity-report.json'

function isValidReport(report) {
  return !!(
    report &&
    report.schemaVersion === 1 &&
    typeof report.generatedAt === 'string' &&
    Array.isArray(report.rules) &&
    Array.isArray(report.components) &&
    Array.isArray(report.evaluations) &&
    Array.isArray(report.mappingProblems)
  )
}

module.exports = function registerComponentMaturityRoutes(router, context) {
  const { storage, requireAuth, requireScope } = context

  /**
   * @openapi
   * /api/modules/system-health/component-maturity/report:
   *   get:
   *     summary: Get the precomputed OSAC Component Maturity report
   *     tags: [System Health - Component Maturity]
   *     security: [{ bearerToken: [] }]
   *     responses:
   *       200:
   *         description: Schema-versioned Component Maturity report
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Missing system-health read scope
   *       503:
   *         description: Component Maturity data is missing or invalid
   */
  router.get('/report', requireAuth, requireScope('system-health:read'), function (req, res) {
    const report = storage.readFromStorage(STORAGE_KEY)
    if (!isValidReport(report)) {
      return res.status(503).json({
        error: 'Component Maturity data is unavailable',
        code: 'COMPONENT_MATURITY_DATA_UNAVAILABLE'
      })
    }
    return res.json(report)
  })
}

module.exports.STORAGE_KEY = STORAGE_KEY
module.exports.isValidReport = isValidReport
