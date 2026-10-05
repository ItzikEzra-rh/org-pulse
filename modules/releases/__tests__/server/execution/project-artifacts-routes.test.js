import { describe, it, expect, vi } from 'vitest'

const registerExecutionRoutes = require('../../../server/execution/routes')
const registerTrackingRoutes = require('../../../server/execution/feature-tracking-routes')

function makeStorage(initial = {}) {
  const data = { ...initial }
  return {
    readFromStorage(key) {
      return data[key] === undefined ? null : JSON.parse(JSON.stringify(data[key]))
    },
    writeToStorage(key, value) { data[key] = JSON.parse(JSON.stringify(value)) },
    listStorageFiles(prefix) {
      return Object.keys(data).filter(key => key.startsWith(`${prefix}/`)).map(key => key.slice(prefix.length + 1))
    },
    snapshot() { return JSON.parse(JSON.stringify(data)) }
  }
}

function makeRouter() {
  const routes = { get: {}, post: {}, delete: {} }
  return {
    get(path, ...handlers) { routes.get[path] = handlers },
    post(path, ...handlers) { routes.post[path] = handlers },
    delete(path, ...handlers) { routes.delete[path] = handlers },
    _routes: routes
  }
}

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(value) { this.body = value; return this }
  }
}

function makeProfile(projectId, jiraProjectKey) {
  const isOsac = projectId === 'osac'
  return {
    projectId,
    displayName: isOsac ? 'OSAC' : projectId === 'flightctl' ? 'Flight Control' : 'Bluebird',
    jiraProjectKey,
    profileRevision: 'aaaaaaaaaaaaaaaa',
    executeRevision: 'bbbbbbbbbbbbbbbb',
    execution: {
      inventory: { source: isOsac ? 'legacy-feature-store' : 'jira-issues' }
    },
    capabilities: {
      execute: { state: 'supported', artifactKey: 'releases/execution/index.json' }
    }
  }
}

function makeProjects(profiles, generationByProject = {}) {
  const byId = new Map(profiles.map(profile => [profile.projectId, profile]))
  return {
    get: projectId => byId.get(projectId) || null,
    list: () => profiles,
    resolve(projectId) {
      const profile = byId.get(projectId)
      if (!profile) return null
      const generationId = generationByProject[projectId] || 'g1'
      return {
        profile,
        generationId,
        rootKey: `projects/${projectId}/generations/${generationId}`
      }
    }
  }
}

function envelope(profile, generationId, artifactKey, data, overrides = {}) {
  return {
    schemaVersion: 1,
    projectId: profile.projectId,
    profileRevision: profile.profileRevision,
    executeRevision: profile.executeRevision,
    generationId,
    artifactKey,
    state: overrides.state || 'supported',
    freshness: overrides.freshness || 'fresh',
    partial: overrides.partial === true,
    generatedAt: '2026-10-05T10:00:00Z',
    fetchedAt: '2026-10-05T09:55:00Z',
    observedAt: '2026-10-05T09:55:00Z',
    sourceRefs: {},
    error: overrides.error || null,
    data
  }
}

function flightctlPublication(options = {}) {
  const project = makeProfile(options.projectId || 'flightctl', options.jiraProjectKey || 'EDM')
  const generationId = options.generationId || 'fc-generation-1'
  const root = `projects/${project.projectId}/generations/${generationId}`
  const feature = {
    key: 'EDM-100',
    summary: 'Jira inventory item without pipeline metrics',
    status: 'Closed',
    statusCategory: 'Done',
    fixVersions: ['MVP Q1CY25'],
    epicCount: 1,
    issueCount: null,
    blockerCount: null,
    completionPct: null,
    health: null,
    executionState: 'unavailable',
    executionCoverage: 'unavailable',
    executionCoverageReason: 'no-compatible-feature-producer',
    preparationReadiness: 'unknown',
    team: null,
    coverage: { team: 'unknown', pipelineMetrics: 'unavailable', featureReadiness: 'unconfigured' }
  }
  const epic = {
    key: 'EDM-200',
    summary: 'Linked Jira epic',
    status: 'Closed',
    statusCategory: 'Done',
    fixVersions: ['MVP Q1CY25'],
    fixVersionSource: 'direct',
    parentFeatureKey: 'EDM-100',
    components: ['FlightCtl-Core'],
    componentSource: 'direct',
    issues: [{ key: 'EDM-201', summary: 'Jira child', status: 'Closed', statusCategory: 'Done' }],
    executionIssueCount: null,
    doneExecutionIssueCount: null,
    issueStatusCoverage: 'complete',
    jiraStatusProgress: true,
    blockedCoverage: 'unavailable',
    producerMetricsState: 'unavailable',
    producerMetricsReason: 'no-compatible-feature-producer',
    completedViaStatus: null
  }
  const detail = {
    ...feature,
    metrics: null,
    epics: [epic],
    topology: { repos: [] },
    pullRequests: []
  }
  const releaseId = 'MVP Q1CY25'
  const trackingKey = 'releases/execution/tracking-data-MVP%20Q1CY25.json'
  const tracking = {
    projectId: project.projectId,
    releaseId,
    displayName: releaseId,
    featureCount: 1,
    baselineDate: null,
    baselineSource: 'unknown',
    scopePolicyState: 'unconfigured',
    counts: { committed: null, added: null, dropped: null, moved: null, unknown: 1, blockerPriority: 0 },
    features: [{ ...feature, scopeChange: 'unknown', isBlockerPriority: false }]
  }
  const indexData = {
    projectId: project.projectId,
    featureCount: 1,
    features: [feature],
    versionOptions: { feature: [releaseId], epics: [releaseId] },
    trackingReleases: [{ releaseId, artifactKey: trackingKey, displayName: releaseId, featureCount: 1, counts: tracking.counts }],
    coverage: { inventory: 'complete', team: 'unknown', pipelineMetrics: 'unavailable', readiness: 'unconfigured', scopeBaseline: 'unconfigured' }
  }
  const storage = makeStorage({
    [`${root}/releases/execution/index.json`]: envelope(project, generationId, 'releases/execution/index.json', indexData, options.index || {}),
    [`${root}/releases/execution/features/EDM-100.json`]: envelope(project, options.detailGenerationId || generationId, 'releases/execution/features/EDM-100.json', detail),
    [`${root}/${trackingKey}`]: envelope(project, generationId, trackingKey, tracking)
  })
  return { profile: project, projects: makeProjects([project], { [project.projectId]: generationId }), generationId, root, storage, feature, detail, releaseId, trackingKey }
}

function register(storage, projects) {
  const router = makeRouter()
  const requireAdmin = (req, res, next) => next()
  const requireScope = () => (req, res, next) => next()
  const context = {
    storage,
    projects,
    requireAuth: (req, res, next) => next(),
    requireAdmin,
    requireScope,
    registerDiagnostics: vi.fn(),
    secrets: {}
  }
  registerExecutionRoutes(router, context)
  registerTrackingRoutes(router, context)
  return router
}

describe('project-qualified Execute publication routes', () => {
  it('serves Flight Control inventory, hierarchy and release versions from one generation', () => {
    const fixture = flightctlPublication()
    const router = register(fixture.storage, fixture.projects)

    const list = makeResponse()
    router._routes.get['/features'].at(-1)({ query: { projectId: 'flightctl', status: 'Closed' } }, list)
    expect(list.body).toMatchObject({ projectId: 'flightctl', generationId: fixture.generationId, featureCount: 1 })
    expect(list.body.features[0]).toMatchObject({ key: 'EDM-100', issueCount: null, blockerCount: null, team: null })

    const detail = makeResponse()
    router._routes.get['/features/:key'].at(-1)({ params: { key: 'EDM-100' }, query: { projectId: 'flightctl' } }, detail)
    expect(detail.body).toMatchObject({ projectId: 'flightctl', key: 'EDM-100', detailState: 'supported' })
    expect(detail.body.epics[0]).toMatchObject({ key: 'EDM-200', parentFeatureKey: 'EDM-100', jiraStatusProgress: true, executionIssueCount: null })

    const versions = makeResponse()
    router._routes.get['/versions'].at(-1)({ query: { projectId: 'flightctl', scope: 'epics' } }, versions)
    expect(versions.body.versions).toEqual(['MVP Q1CY25'])

    const tree = makeResponse()
    router._routes.get['/epics'].at(-1)({ query: { projectId: 'flightctl', version: 'MVP Q1CY25' } }, tree)
    expect(tree.body.features).toHaveLength(1)
    expect(tree.body.features[0]).toMatchObject({ key: 'EDM-100', team: null, coverage: { team: 'unknown' } })
    expect(tree.body.features[0].epics[0].key).toBe('EDM-200')
  })

  it('reads Feature Tracking using encoded release IDs within the selected project generation', () => {
    const fixture = flightctlPublication()
    const router = register(fixture.storage, fixture.projects)

    const releases = makeResponse()
    router._routes.get['/tracking/releases'].at(-1)({ query: { projectId: 'flightctl' } }, releases)
    expect(releases.body.projectId).toBe('flightctl')
    expect(releases.body.releases[0]).toMatchObject({ releaseId: 'MVP Q1CY25', state: 'supported', counts: { committed: null, added: null, unknown: 1 } })

    const tracking = makeResponse()
    router._routes.get['/tracking/data'].at(-1)({ query: { projectId: 'flightctl', releaseId: 'MVP Q1CY25' } }, tracking)
    expect(tracking.body).toMatchObject({ projectId: 'flightctl', releaseId: 'MVP Q1CY25', state: 'supported' })
    expect(tracking.body.features[0]).toMatchObject({ key: 'EDM-100', scopeChange: 'unknown', team: null })
  })

  it('returns 404 for unknown projects and never uses root OSAC artifacts as a fallback', () => {
    const fixture = flightctlPublication()
    fixture.storage.writeToStorage('releases/execution/index.json', { features: [{ key: 'OSAC-1', summary: 'Root OSAC record' }] })
    const router = register(fixture.storage, fixture.projects)

    const unknown = makeResponse()
    router._routes.get['/features'].at(-1)({ query: { projectId: 'not-configured' } }, unknown)
    expect(unknown.statusCode).toBe(404)

    const flight = makeResponse()
    router._routes.get['/features'].at(-1)({ query: { projectId: 'flightctl' } }, flight)
    expect(flight.body.features.map(feature => feature.key)).toEqual(['EDM-100'])
  })

  it('returns partial detail when a feature artifact belongs to a different generation', () => {
    const fixture = flightctlPublication({ detailGenerationId: 'old-generation' })
    const router = register(fixture.storage, fixture.projects)

    const detail = makeResponse()
    router._routes.get['/features/:key'].at(-1)({ params: { key: 'EDM-100' }, query: { projectId: 'flightctl' } }, detail)
    expect(detail.body).toMatchObject({ projectId: 'flightctl', detailState: 'unavailable', partial: true, reason: 'EXECUTE_GENERATION_MISMATCH' })
    expect(detail.body.epics).toEqual([])
  })

  it('preserves publication failure state and reason when the inventory has no data', () => {
    const fixture = flightctlPublication({ index: { state: 'error', partial: true, error: { code: 'JIRA_TIMEOUT', message: 'Jira timed out' } } })
    const indexKey = `${fixture.root}/releases/execution/index.json`
    const failedIndex = fixture.storage.readFromStorage(indexKey)
    failedIndex.data = null
    fixture.storage.writeToStorage(indexKey, failedIndex)
    const router = register(fixture.storage, fixture.projects)
    const response = makeResponse()

    router._routes.get['/features'].at(-1)({ query: { projectId: 'flightctl' } }, response)
    expect(response.body).toMatchObject({ projectId: 'flightctl', state: 'error', partial: true, reason: 'JIRA_TIMEOUT', featureCount: 0 })
  })

  it('allows a third project through the same profile-driven route path', () => {
    const fixture = flightctlPublication({ projectId: 'bluebird', jiraProjectKey: 'BLUEBIRD' })
    const router = register(fixture.storage, fixture.projects)
    const response = makeResponse()

    router._routes.get['/features'].at(-1)({ query: { projectId: 'bluebird' } }, response)
    expect(response.body).toMatchObject({ projectId: 'bluebird', features: [{ key: 'EDM-100' }] })
  })

  it('rejects Flight Control refresh, config and edit actions before any OSAC mutation', async () => {
    const fixture = flightctlPublication()
    fixture.storage.writeToStorage('releases/execution/config.json', { enabled: false })
    fixture.storage.writeToStorage('releases/execution/features/EDM-100.json', { key: 'EDM-100', summary: 'OSAC root must stay untouched' })
    const before = fixture.storage.snapshot()
    const router = register(fixture.storage, fixture.projects)

    const calls = [
      ['/refresh', router._routes.post['/refresh'].at(-1), { query: { projectId: 'flightctl' }, body: {} }],
      ['/config GET', router._routes.get['/config'].at(-1), { query: { projectId: 'flightctl' }, body: {} }],
      ['/config POST', router._routes.post['/config'].at(-1), { query: { projectId: 'flightctl' }, body: { projectId: 'flightctl', enabled: true } }],
      ['/feature refresh', router._routes.post['/features/:key/refresh'].at(-1), { params: { key: 'EDM-100' }, query: { projectId: 'flightctl' }, body: {} }],
      ['/AI review bulk', router._routes.post['/ai-review/bulk'].at(-1), { query: { projectId: 'flightctl' }, body: { projectId: 'flightctl', features: [{ key: 'EDM-100', aiReview: { title: 'should not persist' } }] } }],
      ['/AI review delete', router._routes.delete['/ai-review'].at(-1), { query: { projectId: 'flightctl' }, body: {} }]
    ]
    for (const [name, handler, request] of calls) {
      const response = makeResponse()
      if (name.endsWith('GET')) handler(request, response)
      else await handler(request, response)
      expect(response.statusCode, name).toBe(409)
      expect(response.body.projectId, name).toBe('flightctl')
    }

    expect(fixture.storage.snapshot()).toEqual(before)
  })

  it('rejects conflicting project IDs in action query and body', async () => {
    const fixture = flightctlPublication()
    const router = register(fixture.storage, fixture.projects)
    const response = makeResponse()

    await router._routes.post['/config'].at(-1)({
      query: { projectId: 'flightctl' },
      body: { projectId: 'osac', enabled: true }
    }, response)

    expect(response.statusCode).toBe(400)
    expect(response.body.reason).toBe('project-context-mismatch')
  })
})
