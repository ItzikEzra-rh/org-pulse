import { describe, it, expect, vi, beforeEach } from 'vitest'

const registerCiDigestRoutes = require('../../../server/ci-digest/routes')

function makeStorage(data = {}) {
  const store = { ...data }
  return {
    readFromStorage(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    }
  }
}

function makeRouter() {
  const routes = { get: {} }
  return {
    get: vi.fn(function (path, ...handlers) {
      routes.get[path] = handlers
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

function makeEnvelope(overrides = {}) {
  return {
    source: {
      repo: 'osac-project/osac-test-infra',
      workflow: 'ci-daily-digest.yml',
      runId: 34495310704,
      runUrl: 'https://github.com/osac-project/osac-test-infra/actions/runs/34495310704',
      runConclusion: 'success',
      artifactId: 10159505017,
      artifactCreatedAt: '2026-09-10T15:23:35Z'
    },
    fetchedAt: '2026-09-10T15:24:02Z',
    digest: { now: '2026-09-10 15:23 UTC', flake_rate: 0.0783, top_failing: null },
    ...overrides
  }
}

describe('ci-digest routes', () => {
  let router, storage, context

  beforeEach(() => {
    vi.clearAllMocks()
    storage = makeStorage()
    router = makeRouter()
    context = {
      storage,
      requireAuth: vi.fn(),
      requireScope: () => (req, res, next) => next()
    }
    registerCiDigestRoutes(router, context)
  })

  it('registers a GET /ci-digest route', () => {
    expect(Object.keys(router._routes.get)).toContain('/ci-digest')
  })

  it('returns the stored envelope as-is (pure passthrough), including nulls', () => {
    const envelope = makeEnvelope()
    storage = makeStorage({ 'ci-digest-data.json': envelope })
    const r = makeRouter()
    registerCiDigestRoutes(r, { ...context, storage })

    const handler = r._routes.get['/ci-digest'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._json).toEqual(envelope)
    expect(res._json.digest.top_failing).toBeNull()
  })

  it('reads from the shared data-volume root, not a module-namespaced path', () => {
    const envelope = makeEnvelope()
    const readFromStorage = vi.fn((key) => (key === 'ci-digest-data.json' ? envelope : null))
    const r = makeRouter()
    registerCiDigestRoutes(r, { ...context, storage: { readFromStorage } })

    const handler = r._routes.get['/ci-digest'].at(-1)
    handler({}, makeRes())

    expect(readFromStorage).toHaveBeenCalledWith('ci-digest-data.json')
  })

  it('returns 404 when no report has been delivered yet', () => {
    const handler = router._routes.get['/ci-digest'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._status).toBe(404)
    expect(res._json).toEqual({ error: 'No CI digest report available yet' })
  })

  it('does not treat a failing workflow runConclusion as a reason to reject the report', () => {
    // runConclusion may be "failure" even for a report the producer wrote
    // successfully (e.g. a downstream Slack-post step failed) -- the route
    // must still serve it.
    const envelope = makeEnvelope({ source: { ...makeEnvelope().source, runConclusion: 'failure' } })
    storage = makeStorage({ 'ci-digest-data.json': envelope })
    const r = makeRouter()
    registerCiDigestRoutes(r, { ...context, storage })

    const handler = r._routes.get['/ci-digest'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._status).toBe(200)
    expect(res._json.source.runConclusion).toBe('failure')
  })
})
