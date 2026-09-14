import { describe, it, expect, vi, beforeEach } from 'vitest'

const registerExecutionRoutes = require('../../../server/execution/routes')
const { _setFetchFn } = require('../../../server/execution/scheduler')

const mockFetchArtifacts = vi.fn()

function makeStorage(data = {}) {
  const store = { ...data }
  return {
    readFromStorage(key) {
      return store[key] ? JSON.parse(JSON.stringify(store[key])) : null
    },
    writeToStorage(key, value) {
      store[key] = value
    },
    listStorageFiles(prefix) {
      return Object.keys(store)
        .filter(k => k.startsWith(prefix + '/'))
        .map(k => k.slice(prefix.length + 1))
    }
  }
}

function makeRouter() {
  const routes = { get: {}, post: {}, delete: {} }
  return {
    get: vi.fn(function (path, ...handlers) {
      routes.get[path] = handlers
    }),
    post: vi.fn(function (path, ...handlers) {
      routes.post[path] = handlers
    }),
    delete: vi.fn(function (path, ...handlers) {
      routes.delete[path] = handlers
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

describe('execution routes', () => {
  let router, requireAdmin, context, storage

  beforeEach(() => {
    vi.clearAllMocks()
    _setFetchFn(mockFetchArtifacts)


    storage = makeStorage()
    router = makeRouter()
    requireAdmin = vi.fn()
    context = {
      storage,
      requireAdmin,
      requireScope: () => (req, res, next) => next(),
      registerDiagnostics: vi.fn(),
      secrets: {}
    }
    registerExecutionRoutes(router, context)
  })

  describe('route registration', () => {
    it('registers all expected GET routes', () => {
      const paths = Object.keys(router._routes.get)
      expect(paths).toContain('/features')
      expect(paths).toContain('/features/:key')
      expect(paths).toContain('/status')
      expect(paths).toContain('/versions')
      expect(paths).toContain('/epics')
      expect(paths).toContain('/config')
    })

    it('registers all expected POST routes', () => {
      const paths = Object.keys(router._routes.post)
      expect(paths).toContain('/refresh')
      expect(paths).toContain('/config')
    })
  })

  describe('requireAdmin middleware', () => {
    it('gates POST /refresh behind requireAdmin', () => {
      expect(router.post).toHaveBeenCalledWith('/refresh', requireAdmin, expect.any(Function), expect.any(Function))
    })

    it('gates GET /config behind requireAdmin', () => {
      expect(router.get).toHaveBeenCalledWith('/config', requireAdmin, expect.any(Function), expect.any(Function))
    })

    it('gates POST /config behind requireAdmin', () => {
      expect(router.post).toHaveBeenCalledWith('/config', requireAdmin, expect.any(Function), expect.any(Function))
    })
  })

  describe('GET /status', () => {
    it('returns expected shape when no data', () => {
      const handler = router._routes.get['/status'].at(-1)
      const res = makeRes()
      handler({}, res)

      expect(res._json).toMatchObject({
        dataAvailable: false,
        fetchedAt: null,
        schemaVersion: null,
        featureCount: 0,
        configured: false,
        tokenSource: null
      })
      expect(res._json.dataSource).toMatch(/gitlab-ci/)
    })

    it('includes lastFetch when present', () => {
      const storageWithData = makeStorage({
        'releases/execution/last-fetch.json': { status: 'success', timestamp: '2026-04-08T06:00:00Z' }
      })
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: storageWithData, requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const handler = r._routes.get['/status'].at(-1)
      const res = makeRes()
      handler({}, res)

      expect(res._json.lastFetch).toBeDefined()
      expect(res._json.lastFetch.status).toBe('success')
    })
  })

  describe('GET /features', () => {
    it('passes through execution/preparation fields verbatim, preserving null vs zero', () => {
      storage = makeStorage({
        'releases/execution/index.json': {
          fetchedAt: '2026-08-01T00:00:00Z',
          features: [
            {
              key: 'OSAC-1', summary: 'Available complete', status: 'Done', statusCategory: 'Done',
              executionIssueCount: 2, doneExecutionIssueCount: 2,
              executionState: 'complete', executionCoverage: 'available', executionCoverageReason: null,
              preparationReadiness: 'ready'
            },
            {
              key: 'OSAC-2', summary: 'Insufficient data', status: 'In Progress', statusCategory: 'In Progress',
              executionIssueCount: null, doneExecutionIssueCount: null,
              executionState: null, executionCoverage: 'insufficient-data',
              executionCoverageReason: 'epics-without-issue-detail', preparationReadiness: 'not-applicable'
            }
          ]
        }
      })
      router = makeRouter()
      registerExecutionRoutes(router, { ...context, storage })

      const handler = router._routes.get['/features'].at(-1)
      const res = makeRes()
      handler({ query: {} }, res)

      const byKey = Object.fromEntries(res._json.features.map(f => [f.key, f]))
      expect(byKey['OSAC-1']).toMatchObject({
        executionIssueCount: 2, doneExecutionIssueCount: 2,
        executionState: 'complete', executionCoverage: 'available', executionCoverageReason: null,
        preparationReadiness: 'ready'
      })
      expect(byKey['OSAC-2']).toMatchObject({
        executionIssueCount: null, doneExecutionIssueCount: null,
        executionState: null, executionCoverage: 'insufficient-data',
        executionCoverageReason: 'epics-without-issue-detail', preparationReadiness: 'not-applicable'
      })
    })

    it('leaves an old/missing payload feature visible without the new fields', () => {
      storage = makeStorage({
        'releases/execution/index.json': {
          fetchedAt: '2026-08-01T00:00:00Z',
          features: [
            { key: 'OSAC-9', summary: 'Pre-migration feature', status: 'New', statusCategory: 'To Do' }
          ]
        }
      })
      router = makeRouter()
      registerExecutionRoutes(router, { ...context, storage })

      const handler = router._routes.get['/features'].at(-1)
      const res = makeRes()
      handler({ query: {} }, res)

      expect(res._json.features).toHaveLength(1)
      expect(res._json.features[0].key).toBe('OSAC-9')
    })
  })

  describe('GET /features/:key', () => {
    // epics/issues generated by fetch-ep-review.py enrich_epics_with_provenance()
    // @ 077f7326da against controlled epic/issue input, not hand-authored, to
    // exercise the real per-Epic/per-issue producer shape.
    it('passes through per-Epic execution counts and per-issue isPreparation verbatim', () => {
      storage = makeStorage({
        'releases/execution/features/OSAC-100.json': {
          key: 'OSAC-100', summary: 'Add streaming inference endpoint', status: 'In Progress',
          statusCategory: 'In Progress',
          epics: [
            {
              key: 'OSAC-EP-1', summary: 'Streaming core', issueCount: 3,
              executionIssueCount: 2, doneExecutionIssueCount: 1,
              issues: [
                { key: 'OSAC-1', summary: 'Implement streaming handler', statusCategory: 'Done', isPreparation: false },
                { key: 'OSAC-2', summary: 'Wire up backpressure', statusCategory: 'In Progress', isPreparation: false },
                { key: 'OSAC-3', summary: 'PRD: Streaming inference', statusCategory: 'Done', isPreparation: true }
              ]
            },
            {
              key: 'OSAC-EP-6', summary: 'Drain sequencing', issueCount: 0,
              executionIssueCount: null, doneExecutionIssueCount: null,
              issues: []
            }
          ],
          metrics: {
            executionIssueCount: 2, doneExecutionIssueCount: 1,
            executionState: 'in-progress', executionCoverage: 'available',
            executionCoverageReason: null, preparationReadiness: 'not-applicable'
          }
        }
      })
      router = makeRouter()
      registerExecutionRoutes(router, { ...context, storage })

      const handler = router._routes.get['/features/:key'].at(-1)
      const res = makeRes()
      handler({ params: { key: 'OSAC-100' } }, res)

      const [epicWithIssues, epicWithoutIssues] = res._json.epics
      expect(epicWithIssues.executionIssueCount).toBe(2)
      expect(epicWithIssues.doneExecutionIssueCount).toBe(1)
      expect(epicWithIssues.issues.map(i => i.isPreparation)).toEqual([false, false, true])

      expect(epicWithoutIssues.executionIssueCount).toBeNull()
      expect(epicWithoutIssues.doneExecutionIssueCount).toBeNull()

      expect(res._json.metrics.executionCoverageReason).toBeNull()
    })

    it('leaves an old/missing payload feature detail visible without the new fields', () => {
      storage = makeStorage({
        'releases/execution/features/OSAC-9.json': {
          key: 'OSAC-9', summary: 'Pre-migration feature', status: 'New',
          epics: [{ key: 'OSAC-EP-9', summary: 'Legacy epic', issueCount: 1, issues: [{ key: 'OSAC-9-1', summary: 'Legacy issue', statusCategory: 'To Do' }] }],
          metrics: { completionPct: 0, totalEpics: 1, totalIssues: 1 }
        }
      })
      router = makeRouter()
      registerExecutionRoutes(router, { ...context, storage })

      const handler = router._routes.get['/features/:key'].at(-1)
      const res = makeRes()
      handler({ params: { key: 'OSAC-9' } }, res)

      expect(res._json.key).toBe('OSAC-9')
      expect(res._json.epics[0].issues[0].isPreparation).toBeUndefined()
      expect(res._json.metrics.executionCoverageReason).toBeUndefined()
    })
  })

  describe('POST /refresh', () => {
    it('returns 429 on cooldown', async () => {
      const { init } = require('../../../server/execution/scheduler')
      init({ GITLAB_TOKEN: 'token' })
      mockFetchArtifacts.mockResolvedValue({ status: 'success', timestamp: new Date().toISOString() })

      const storageWithConfig = makeStorage({
        'releases/execution/config.json': { enabled: true }
      })
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: storageWithConfig, requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn(), secrets: { GITLAB_TOKEN: 'token' } })

      const handler = r._routes.post['/refresh'].at(-1)

      // First refresh succeeds
      const res1 = makeRes()
      await handler({}, res1)
      expect(res1._json.status).toBe('success')

      // Second refresh hits cooldown
      const res2 = makeRes()
      await handler({}, res2)
      expect(res2._status).toBe(429)
      expect(res2._json.status).toBe('cooldown')
      expect(res2._json.retryAfter).toBeGreaterThan(0)

  
    })
  })

  describe('POST /config', () => {
    it('saves and loads config round-trip', async () => {
      process.env.GITLAB_TOKEN = 'token'

      const storageForConfig = makeStorage()
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: storageForConfig, requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const postHandler = r._routes.post['/config'].at(-1)
      const res1 = makeRes()
      await postHandler({
        body: {
          gitlabBaseUrl: 'https://custom.gitlab.com',
          projectPath: 'my/project',
          branch: 'develop',
          jobName: 'build',
          artifactPath: 'dist',
          refreshIntervalHours: 6,
          enabled: false
        }
      }, res1)
      expect(res1._json.status).toBe('saved')

      // Load it back
      const getHandler = r._routes.get['/config'].at(-1)
      const res2 = makeRes()
      getHandler({}, res2)
      expect(res2._json.gitlabBaseUrl).toBe('https://custom.gitlab.com')
      expect(res2._json.projectPath).toBe('my/project')
      expect(res2._json.branch).toBe('develop')
      expect(res2._json.refreshIntervalHours).toBe(6)

  
    })

    it('rejects http:// in gitlabBaseUrl', async () => {
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: makeStorage(), requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const handler = r._routes.post['/config'].at(-1)
      const res = makeRes()
      await handler({
        body: { gitlabBaseUrl: 'http://internal-service.svc.cluster.local' }
      }, res)

      expect(res._status).toBe(400)
      expect(res._json.message).toContain('https://')

  
    })

    it('rejects invalid refreshIntervalHours', async () => {
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: makeStorage(), requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const handler = r._routes.post['/config'].at(-1)

      const res1 = makeRes()
      await handler({ body: { refreshIntervalHours: 0 } }, res1)
      expect(res1._status).toBe(400)

      const res2 = makeRes()
      await handler({ body: { refreshIntervalHours: 999 } }, res2)
      expect(res2._status).toBe(400)

      const res3 = makeRes()
      await handler({ body: { refreshIntervalHours: 'abc' } }, res3)
      expect(res3._status).toBe(400)

  
    })

    it('rejects non-string fields', async () => {
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: makeStorage(), requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const handler = r._routes.post['/config'].at(-1)
      const res = makeRes()
      await handler({ body: { projectPath: 123 } }, res)
      expect(res._status).toBe(400)
      expect(res._json.message).toContain('projectPath')

  
    })

    it('rejects non-boolean enabled', async () => {
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: makeStorage(), requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const handler = r._routes.post['/config'].at(-1)
      const res = makeRes()
      await handler({ body: { enabled: 'yes' } }, res)
      expect(res._status).toBe(400)
      expect(res._json.message).toContain('enabled')

  
    })
  })

  describe('diagnostics', () => {
    it('registers diagnostics hook', () => {
      expect(context.registerDiagnostics).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('GET /versions', () => {
    function setupDirectEpicVersionData() {
      storage = makeStorage({
        'releases/execution/index.json': {
          fetchedAt: '2026-08-01T00:00:00Z',
          features: [
            { key: 'OSAC-1061', summary: 'Parent Feature', status: 'In Progress', statusCategory: 'In Progress', fixVersions: ['0.2'] }
          ]
        },
        'releases/execution/features/OSAC-1061.json': {
          key: 'OSAC-1061',
          epics: [
            {
              key: 'OSAC-2767', summary: 'Direct M1 epic', fixVersions: ['0.2-M1'], fixVersionSource: 'direct',
              components: [], componentSource: 'unknown', parentFeatureKey: 'OSAC-1061',
              blockerCount: 0, issueCount: 1, pct: 0, progress: 0
            }
          ]
        }
      })
      router = makeRouter()
      context = { ...context, storage }
      registerExecutionRoutes(router, context)
    }

    it('by default (no scope) omits a version that only appears on a direct Epic, since /features cannot filter on it', () => {
      setupDirectEpicVersionData()
      const handler = router._routes.get['/versions'].at(-1)
      const res = makeRes()
      handler({ query: {} }, res)

      expect(res._json.versions).toEqual(['0.2'])
      expect(res._json.versions).not.toContain('0.2-M1')
    })

    it('with scope=epics, includes a version that appears only on a direct Epic, alongside Feature-level versions', () => {
      setupDirectEpicVersionData()
      const handler = router._routes.get['/versions'].at(-1)
      const res = makeRes()
      handler({ query: { scope: 'epics' } }, res)

      expect(res._json.versions).toContain('0.2-M1')
      // Existing Feature-level version is preserved alongside it.
      expect(res._json.versions).toContain('0.2')
    })

    it('does not add a spurious version from an inherited (via-parent-feature) Epic even with scope=epics', () => {
      storage = makeStorage({
        'releases/execution/index.json': {
          fetchedAt: '2026-08-01T00:00:00Z',
          features: [
            { key: 'OSAC-400', summary: 'Feature', status: 'In Progress', statusCategory: 'In Progress', fixVersions: ['0.3'] }
          ]
        },
        'releases/execution/features/OSAC-400.json': {
          key: 'OSAC-400',
          epics: [
            {
              key: 'OSAC-401', summary: 'Inherited epic', fixVersions: ['0.9'], fixVersionSource: 'via-parent-feature',
              components: [], componentSource: 'unknown', parentFeatureKey: 'OSAC-400',
              blockerCount: 0, issueCount: 1, pct: 0, progress: 0
            }
          ]
        }
      })
      router = makeRouter()
      context = { ...context, storage }
      registerExecutionRoutes(router, context)

      const handler = router._routes.get['/versions'].at(-1)
      const res = makeRes()
      handler({ query: { scope: 'epics' } }, res)

      expect(res._json.versions).toEqual(['0.3'])
    })

    it('deduplicates a version that appears on both a Feature and a direct Epic', () => {
      storage = makeStorage({
        'releases/execution/index.json': {
          fetchedAt: '2026-08-01T00:00:00Z',
          features: [
            { key: 'OSAC-100', summary: 'Feature A', status: 'In Progress', statusCategory: 'In Progress', fixVersions: ['0.4'] }
          ]
        },
        'releases/execution/features/OSAC-100.json': {
          key: 'OSAC-100',
          epics: [
            {
              key: 'OSAC-101', summary: 'Epic 1', fixVersions: ['0.4'], fixVersionSource: 'direct',
              components: [], componentSource: 'unknown', parentFeatureKey: 'OSAC-100',
              blockerCount: 0, issueCount: 1, pct: 0, progress: 0
            }
          ]
        }
      })
      router = makeRouter()
      context = { ...context, storage }
      registerExecutionRoutes(router, context)

      const handler = router._routes.get['/versions'].at(-1)
      const res = makeRes()
      handler({ query: { scope: 'epics' } }, res)

      expect(res._json.versions).toEqual(['0.4'])
    })

    it('returns an empty list when no index data is available', () => {
      storage = makeStorage()
      router = makeRouter()
      context = { ...context, storage }
      registerExecutionRoutes(router, context)

      const handler = router._routes.get['/versions'].at(-1)
      const res = makeRes()
      handler({ query: {} }, res)

      expect(res._json).toEqual({ versions: [] })
    })
  })

  describe('GET /epics', () => {
    function setupData() {
      storage = makeStorage({
        'releases/execution/index.json': {
          fetchedAt: '2026-08-01T00:00:00Z',
          features: [
            { key: 'OSAC-100', summary: 'Feature A', status: 'In Progress', statusCategory: 'In Progress', fixVersions: ['0.4'], components: ['Storage'], team: 'OSAC-Core' },
            { key: 'OSAC-200', summary: 'Feature B', status: 'To Do', statusCategory: 'To Do', fixVersions: ['0.5'] }
          ]
        },
        'releases/execution/features/OSAC-100.json': {
          key: 'OSAC-100',
          epics: [
            {
              key: 'OSAC-101', summary: 'Epic 1', fixVersions: ['0.4'], fixVersionSource: 'direct',
              components: ['Comp A'], componentSource: 'direct', parentFeatureKey: 'OSAC-100',
              blockerCount: 1, issueCount: 5, pct: 40, progress: 40
            },
            {
              key: 'OSAC-102', summary: 'Epic 2', fixVersions: [], fixVersionSource: 'unknown',
              components: [], componentSource: 'unknown', parentFeatureKey: 'OSAC-100',
              blockerCount: 0, issueCount: 2, pct: 0, progress: 0
            }
          ]
        },
        'releases/execution/features/OSAC-200.json': {
          key: 'OSAC-200',
          epics: [
            {
              key: 'OSAC-201', summary: 'Epic 3', fixVersions: ['0.9'], fixVersionSource: 'via-parent-feature',
              components: ['Comp B'], componentSource: 'via-parent-feature', parentFeatureKey: 'OSAC-200',
              blockerCount: 0, issueCount: 1, pct: 100, progress: 100
            }
          ]
        }
      })
      router = makeRouter()
      context = { ...context, storage }
      registerExecutionRoutes(router, context)
    }

    it('requires a version query parameter', () => {
      setupData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: {} }, res)

      expect(res._status).toBe(400)
    })

    it('returns only Features whose Fix Version matches, each with its full epics array', () => {
      setupData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.4' } }, res)

      expect(res._json.featureCount).toBe(1)
      expect(res._json.features[0].key).toBe('OSAC-100')
      expect(res._json.features[0].isContext).toBe(false)
      expect(res._json.features[0].totalEpicCount).toBe(2)
      expect(res._json.features[0].epics).toHaveLength(2)
      expect(res._json.features[0].epics[0].fixVersionSource).toBe('direct')
      expect(res._json.features[0].epics[1].fixVersionSource).toBe('unknown')
    })

    it('surfaces the Feature-level Components from the index entry', () => {
      setupData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.4' } }, res)

      expect(res._json.features[0].components).toEqual(['Storage'])
    })

    it('defaults Components to an empty array when the index entry has none', () => {
      setupData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.5' } }, res)

      expect(res._json.features[0].key).toBe('OSAC-200')
      expect(res._json.features[0].components).toEqual([])
    })

    it('surfaces the Feature-level Team from the index entry', () => {
      setupData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.4' } }, res)

      expect(res._json.features[0].team).toBe('OSAC-Core')
    })

    it('defaults Team to null when the index entry has none', () => {
      setupData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.5' } }, res)

      expect(res._json.features[0].key).toBe('OSAC-200')
      expect(res._json.features[0].team).toBeNull()
    })

    it('includes an epic under its parent Feature even when the epic names a different Fix Version', () => {
      // OSAC-200's own fixVersions is 0.5, but its epic OSAC-201 names 0.9 — the tree is
      // built by Feature membership, so the epic must still appear, with its real value visible.
      setupData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.5' } }, res)

      expect(res._json.features[0].key).toBe('OSAC-200')
      expect(res._json.features[0].epics[0].fixVersions).toEqual(['0.9'])
    })

    it('returns empty result when no index data is available', () => {
      storage = makeStorage()
      router = makeRouter()
      context = { ...context, storage }
      registerExecutionRoutes(router, context)

      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.4' } }, res)

      expect(res._json).toEqual({ version: '0.4', fetchedAt: null, featureCount: 0, features: [] })
    })

    // Feature represents the overall release; its Epics may be spread across that
    // release's milestones (real example: Feature OSAC-1061 -> 0.2, child Epic
    // OSAC-2767 -> direct 0.2-M1). These cover the context-Feature membership path.
    function setupMilestoneData() {
      storage = makeStorage({
        'releases/execution/index.json': {
          fetchedAt: '2026-08-01T00:00:00Z',
          features: [
            { key: 'OSAC-1061', summary: 'Parent Feature', status: 'In Progress', statusCategory: 'In Progress', fixVersions: ['0.2'], components: ['Networking'] },
            { key: 'OSAC-400', summary: 'Unrelated Feature', status: 'In Progress', statusCategory: 'In Progress', fixVersions: ['0.3'] },
            { key: 'OSAC-9000', summary: 'No overlap Feature', status: 'To Do', statusCategory: 'To Do', fixVersions: ['0.5'] }
          ]
        },
        'releases/execution/features/OSAC-1061.json': {
          key: 'OSAC-1061',
          epics: [
            {
              key: 'OSAC-2767', summary: 'Direct M1 epic', fixVersions: ['0.2-M1'], fixVersionSource: 'direct',
              components: [], componentSource: 'unknown', parentFeatureKey: 'OSAC-1061',
              blockerCount: 0, issueCount: 1, pct: 0, progress: 0
            },
            {
              key: 'OSAC-2768', summary: 'Direct M2 sibling epic', fixVersions: ['0.2-M2'], fixVersionSource: 'direct',
              components: [], componentSource: 'unknown', parentFeatureKey: 'OSAC-1061',
              blockerCount: 0, issueCount: 1, pct: 0, progress: 0
            },
            {
              key: 'OSAC-2769', summary: 'Inherited epic', fixVersions: ['0.2'], fixVersionSource: 'via-parent-feature',
              components: [], componentSource: 'unknown', parentFeatureKey: 'OSAC-1061',
              blockerCount: 0, issueCount: 1, pct: 0, progress: 0
            }
          ]
        },
        'releases/execution/features/OSAC-400.json': {
          key: 'OSAC-400',
          epics: [
            {
              // Contrived: fixVersionSource is via-parent-feature, but its fixVersions value
              // happens to equal the queried milestone. Must NOT qualify — only a `direct`
              // Epic can pull an unmatched Feature in as context, regardless of value.
              key: 'OSAC-401', summary: 'Inherited value coincidentally matching', fixVersions: ['0.2-M1'], fixVersionSource: 'via-parent-feature',
              components: [], componentSource: 'unknown', parentFeatureKey: 'OSAC-400',
              blockerCount: 0, issueCount: 1, pct: 0, progress: 0
            }
          ]
        },
        'releases/execution/features/OSAC-9000.json': {
          key: 'OSAC-9000',
          epics: [
            {
              key: 'OSAC-9001', summary: 'Z-stream direct epic', fixVersions: ['0.2-M1.z'], fixVersionSource: 'direct',
              components: [], componentSource: 'unknown', parentFeatureKey: 'OSAC-9000',
              blockerCount: 0, issueCount: 1, pct: 0, progress: 0
            }
          ]
        }
      })
      router = makeRouter()
      context = { ...context, storage }
      registerExecutionRoutes(router, context)
    }

    it('surfaces a non-matching parent Feature as context when it has a directly-versioned Epic (OSAC-1061 -> 0.2-M1)', () => {
      setupMilestoneData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.2-M1' } }, res)

      const parent = res._json.features.find(f => f.key === 'OSAC-1061')
      expect(parent).toBeTruthy()
      // Preserves its true Fix Version — never relabeled to the queried milestone.
      expect(parent.fixVersions).toEqual(['0.2'])
      expect(parent.isContext).toBe(true)
      // Components surfaced for context Features too, not just direct-match ones.
      expect(parent.components).toEqual(['Networking'])
    })

    it('shows only the directly-matching Epic(s) under a context Feature, not its full sibling Epic list', () => {
      setupMilestoneData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.2-M1' } }, res)

      const parent = res._json.features.find(f => f.key === 'OSAC-1061')
      expect(parent.epics).toHaveLength(1)
      expect(parent.epics[0].key).toBe('OSAC-2767')
      // Sibling epics scoped to a different milestone, and the inherited (non-direct) epic,
      // must not leak in under the context Feature.
      expect(parent.epics.map(e => e.key)).not.toContain('OSAC-2768')
      expect(parent.epics.map(e => e.key)).not.toContain('OSAC-2769')
      // The full sibling count is still surfaced so the UI can indicate epics are hidden.
      expect(parent.totalEpicCount).toBe(3)
    })

    it('does not pull in a Feature via an inherited (via-parent-feature) Epic even if its value happens to match', () => {
      setupMilestoneData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.2-M1' } }, res)

      expect(res._json.features.find(f => f.key === 'OSAC-400')).toBeUndefined()
    })

    it('normalizes z-stream suffixes for direct Epic matching the same way Feature matching does', () => {
      setupMilestoneData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.2-M1' } }, res)

      const contextFeature = res._json.features.find(f => f.key === 'OSAC-9000')
      expect(contextFeature).toBeTruthy()
      expect(contextFeature.epics.map(e => e.key)).toEqual(['OSAC-9001'])
    })

    it('does not duplicate a Feature/Epic when the Feature itself already matches the selected version', () => {
      setupMilestoneData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.2' } }, res)

      const matches = res._json.features.filter(f => f.key === 'OSAC-1061')
      expect(matches).toHaveLength(1)
      // Feature-level match keeps its full, unfiltered Epic list — the context path must
      // not additionally re-add it or any of its Epics.
      expect(matches[0].epics).toHaveLength(3)
      const epicKeys = matches[0].epics.map(e => e.key)
      expect(new Set(epicKeys).size).toBe(epicKeys.length)
    })
  })
})
