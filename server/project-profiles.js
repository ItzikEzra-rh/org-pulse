/**
 * Published project-profile access for the server.
 *
 * Profile values are supplied by org-pulse-data under storage/projects. The
 * server deliberately has no project list or source configuration of its own.
 */

const { createProjectProfileReader } = require('../shared/server/project-profile')

const OPERATIONAL_METRICS_STATES = new Set([
  'supported', 'unavailable', 'inaccessible', 'empty', 'inapplicable',
  'disabled', 'source-only', 'error'
])
const OPERATIONAL_METRICS_ORIGIN = 'https://devtools.pages.redhat.com'

function dashboardProductIds(url) {
  const productIds = url.searchParams.getAll('product')
  const fragmentQueryStart = url.hash.indexOf('?')
  if (fragmentQueryStart >= 0) {
    const fragmentParams = new URLSearchParams(url.hash.slice(fragmentQueryStart + 1))
    productIds.push(...fragmentParams.getAll('product'))
  }
  return productIds
}

function publicOperationalMetricsCapability(profile) {
  const capability = profile.capabilities?.operationalMetrics
  if (!capability || typeof capability !== 'object' || Array.isArray(capability)) return null

  const title = typeof capability.title === 'string' && capability.title.trim()
    ? capability.title.trim().slice(0, 100)
    : 'Operational Metrics'
  const reason = typeof capability.reason === 'string' && capability.reason.trim()
    ? capability.reason.trim().slice(0, 500)
    : undefined
  const state = OPERATIONAL_METRICS_STATES.has(capability.state)
    ? capability.state
    : 'unavailable'

  if (state !== 'supported') {
    return { state, title, ...(reason ? { reason } : {}) }
  }

  try {
    const url = new URL(capability.url)
    const approvedPath = url.pathname === '/n8n-pulumi-poc'
      || url.pathname.startsWith('/n8n-pulumi-poc/')
    const products = dashboardProductIds(url)
    if (url.protocol !== 'https:'
        || url.origin !== OPERATIONAL_METRICS_ORIGIN
        || url.username
        || url.password
        || !approvedPath
        || products.length !== 1
        || products[0] !== profile.projectId) {
      throw new Error('Operational Metrics URL is outside the approved dashboard origin')
    }
    return { state: 'supported', title, url: url.href, freshness: 'unknown' }
  } catch {
    return {
      state: 'unavailable',
      title,
      reason: 'The published Operational Metrics URL is missing or invalid.'
    }
  }
}

function createServerProjectProfiles(storage) {
  return createProjectProfileReader(storage)
}

function createProjectListHandler(projectProfiles) {
  return function listPublishedProjects(_req, res) {
    try {
      const projects = projectProfiles.list().map(profile => {
        const project = { projectId: profile.projectId, displayName: profile.displayName }
        const operationalMetrics = publicOperationalMetricsCapability(profile)
        if (operationalMetrics) project.capabilities = { operationalMetrics }
        return project
      })
      return res.json({ projects })
    } catch (error) {
      console.error('[projects] Failed to list published projects:', error.message)
      const discoveryUnavailable = error.name === 'ProjectProfileIndexError'
      return res.status(discoveryUnavailable ? 503 : 500).json({
        error: 'Failed to list published projects',
        code: discoveryUnavailable ? error.code : 'PROJECT_LIST_FAILED'
      })
    }
  }
}

module.exports = { createServerProjectProfiles, createProjectListHandler, publicOperationalMetricsCapability }
