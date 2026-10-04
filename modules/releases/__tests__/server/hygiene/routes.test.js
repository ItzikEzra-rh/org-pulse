import { describe, it, expect, vi } from 'vitest'

const registerHygieneRoutes = require('../../../server/hygiene/routes')

function makeStorage(data = {}) {
  const store = { ...data }
  return {
    readFromStorage(key) {
      if (!(key in store)) return null
      const value = store[key]
      if (value === '__MALFORMED__') {
        throw new SyntaxError('Unexpected token in JSON')
      }
      return value
    },
    writeToStorage(key, value) {
      store[key] = value
    },
    listStorageFiles() {
      return []
    },
    _store: store
  }
}

function makeRouter() {
  const routes = { get: {}, post: {} }
  return {
    get: vi.fn(function (path, ...handlers) {
      routes.get[path] = handlers
    }),
    post: vi.fn(function (path, ...handlers) {
      routes.post[path] = handlers
    }),
    _routes: routes
  }
}

function makeRes() {
  const res = {
    _status: 200,
    _json: null,
    status(code) { res._status = code; return res },
    json(data) { res._json = data; return res }
  }
  return res
}

function makeProjects(projectIds = ['osac', 'flightctl']) {
  const profiles = projectIds.map(projectId => ({
    projectId,
    displayName: projectId === 'flightctl' ? 'Flight Control' : 'OSAC'
  }))
  return {
    get: (projectId) => profiles.find(profile => profile.projectId === projectId) || null,
    list: () => profiles
  }
}

function makeContext(storage, projects = null) {
  return {
    storage,
    projects,
    requireAuth: (req, res, next) => next(),
    requirePlanningManager: (req, res, next) => next(),
    requireScope: () => (req, res, next) => next(),
    registerDiagnostics: vi.fn()
  }
}

const SAMPLE_CONFIG = {
  schemaVersion: 1,
  projects: {
    OSAC: {
      displayName: 'OSAC',
      jiraBaseUrl: 'https://redhat.atlassian.net',
      rules: [{ id: 'no-team', name: 'Open issue without Team', description: 'desc', category: 'ownership', jql: 'project = OSAC', fields: 'summary' }],
      fieldMappings: { team: 'customfield_10001' }
    }
  }
}

const SAMPLE_RESULTS = {
  schemaVersion: 1,
  generatedAt: '2026-08-06T13:36:34Z',
  source: 'jira-dashboard-26582',
  configVersion: 'abc123',
  results: {
    OSAC: {
      projectKey: 'OSAC',
      displayName: 'OSAC',
      jiraBaseUrl: 'https://redhat.atlassian.net',
      partial: false,
      errors: [],
      summary: { uniqueIssueCount: 1, totalRuleMatches: 1, affectedRuleCount: 1, failedRuleCount: 0, generatedAt: '2026-08-06T13:36:34Z' },
      rules: [{ id: 'no-team', name: 'Open issue without Team', description: 'desc', category: 'ownership', count: 1, issues: [] }]
    }
  }
}

describe('hygiene routes — GET /project-hygiene', () => {
  it('returns the published results as-is when present', () => {
    const storage = makeStorage({ 'releases/hygiene/project-hygiene-results.json': SAMPLE_RESULTS })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const handler = router._routes.get['/project-hygiene'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._status).toBe(200)
    expect(res._json).toEqual(SAMPLE_RESULTS)
  })

  it('returns 404 when no results have been published', () => {
    const storage = makeStorage()
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const handler = router._routes.get['/project-hygiene'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._status).toBe(404)
    expect(res._json.error).toBeTruthy()
  })

  it('returns 503 when the stored file is malformed', () => {
    const storage = makeStorage({ 'releases/hygiene/project-hygiene-results.json': '__MALFORMED__' })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const handler = router._routes.get['/project-hygiene'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._status).toBe(503)
    expect(res._json.error).toBeTruthy()
  })

  it('does not serve the OSAC report for Flight Control', () => {
    const storage = makeStorage({ 'releases/hygiene/project-hygiene-results.json': SAMPLE_RESULTS })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage, makeProjects()))

    const handler = router._routes.get['/project-hygiene'].at(-1)
    const res = makeRes()
    handler({ query: { projectId: 'flightctl' } }, res)

    expect(res._status).toBe(404)
    expect(res._json).toMatchObject({
      projectId: 'flightctl',
      state: 'unavailable',
      reason: 'not-collected'
    })
    expect(res._json.error).toContain('Flight Control')
    expect(res._json.results).toBeUndefined()
  })

  it('requires project selection when multiple project profiles exist', () => {
    const storage = makeStorage({ 'releases/hygiene/project-hygiene-results.json': SAMPLE_RESULTS })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage, makeProjects()))

    const handler = router._routes.get['/project-hygiene'].at(-1)
    const res = makeRes()
    handler({ query: {} }, res)

    expect(res._status).toBe(400)
    expect(res._json.reason).toBe('project-selection-required')
    expect(res._json.results).toBeUndefined()
  })
})

describe('hygiene routes — GET /project-hygiene/config', () => {
  it('returns the published config as-is when present', () => {
    const storage = makeStorage({ 'releases/hygiene/project-hygiene-config.json': SAMPLE_CONFIG })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const handler = router._routes.get['/project-hygiene/config'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._status).toBe(200)
    expect(res._json).toEqual(SAMPLE_CONFIG)
  })

  it('returns 404 when no config has been published', () => {
    const storage = makeStorage()
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const handler = router._routes.get['/project-hygiene/config'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._status).toBe(404)
    expect(res._json.error).toBeTruthy()
  })

  it('returns 503 when the stored file is malformed', () => {
    const storage = makeStorage({ 'releases/hygiene/project-hygiene-config.json': '__MALFORMED__' })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const handler = router._routes.get['/project-hygiene/config'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._status).toBe(503)
    expect(res._json.error).toBeTruthy()
  })
})

describe('hygiene routes — release-scoped endpoints outside this migration remain intact', () => {
  it('still registers every route consumed outside this migration', () => {
    const storage = makeStorage()
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const getPaths = Object.keys(router._routes.get)
    const postPaths = Object.keys(router._routes.post)

    expect(getPaths).toEqual(expect.arrayContaining([
      '/features', '/summary', '/refresh/status', '/config', '/program-report',
      '/project-hygiene', '/project-hygiene/config'
    ]))
    expect(postPaths).toEqual(expect.arrayContaining(['/refresh-all']))
  })

  it('no longer registers the legacy version-scoped POST /refresh or POST /config routes (CP4: HygieneConfigView.vue rewired, orphaning them)', () => {
    const storage = makeStorage()
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const postPaths = Object.keys(router._routes.post)
    expect(postPaths).not.toContain('/refresh')
    expect(postPaths).not.toContain('/config')
  })

  it('GET /features still serves release-scoped feature data unaffected by the new routes', () => {
    const storage = makeStorage({
      'releases/hygiene/features-0.2.json': { version: '0.2', fetchedAt: '2026-08-01T00:00:00Z', features: { 'OSAC-1': { issueType: 'Feature' } } }
    })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const handler = router._routes.get['/features'].at(-1)
    const res = makeRes()
    handler({ query: { version: '0.2' } }, res)

    expect(res._json.features['OSAC-1']).toBeDefined()
    expect(res._json.version).toBe('0.2')
  })

  it('does not serve OSAC release hygiene features for Flight Control', () => {
    const storage = makeStorage({
      'releases/hygiene/features-0.2.json': {
        version: '0.2',
        fetchedAt: '2026-08-01T00:00:00Z',
        features: { 'OSAC-1': { issueType: 'Feature' } }
      }
    })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage, makeProjects()))

    const handler = router._routes.get['/features'].at(-1)
    const res = makeRes()
    handler({ query: { projectId: 'flightctl', version: '0.2' } }, res)

    expect(res._json).toMatchObject({
      projectId: 'flightctl',
      state: 'unavailable',
      reason: 'not-collected',
      features: {}
    })
    expect(res._json.message).toContain('Flight Control')
  })

  it('GET /config still serves the release-scoped RHAI rule config unaffected by the new routes', () => {
    const storage = makeStorage()
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const handler = router._routes.get['/config'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._json.config).toBeDefined()
    expect(res._json.ruleDefinitions).toBeDefined()
  })

  it('does not register a POST /project-hygiene or POST /project-hygiene/config route (new namespace stays read-only)', () => {
    const storage = makeStorage()
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const postPaths = Object.keys(router._routes.post)
    expect(postPaths).not.toContain('/project-hygiene')
    expect(postPaths).not.toContain('/project-hygiene/config')
  })
})
