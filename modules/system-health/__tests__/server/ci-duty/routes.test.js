import { describe, it, expect, vi, beforeEach } from 'vitest'

const registerCiDutyRoutes = require('../../../server/ci-duty/routes')

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

function makeRoster(overrides = {}) {
  return {
    generatedAt: '2026-09-17T08:00:00Z',
    entries: [
      { lead: 'Riccardo Piccoli', workgroup: 'CaaS', startDate: '2026-09-16', endDate: '2026-09-22' }
    ],
    ...overrides
  }
}

describe('ci-duty routes', () => {
  let router, storage, context

  beforeEach(() => {
    vi.clearAllMocks()
    storage = makeStorage()
    router = makeRouter()
    context = {
      storage,
      requireAuth: vi.fn(),
      requireScope: () => (req, res, next) => next(),
      projects: {
        get: projectId => ['osac', 'flightctl'].includes(projectId) ? { projectId } : null
      }
    }
    registerCiDutyRoutes(router, context)
  })

  it('registers a GET /ci-duty route', () => {
    expect(Object.keys(router._routes.get)).toContain('/ci-duty')
  })

  it('returns the stored roster as-is', () => {
    const roster = makeRoster()
    storage = makeStorage({ 'ci-duty-data.json': roster })
    const r = makeRouter()
    registerCiDutyRoutes(r, { ...context, storage })

    const handler = r._routes.get['/ci-duty'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._json).toEqual(roster)
  })

  it('reads from the shared data-volume root, not a module-namespaced path', () => {
    const roster = makeRoster()
    const readFromStorage = vi.fn((key) => (key === 'ci-duty-data.json' ? roster : null))
    const r = makeRouter()
    registerCiDutyRoutes(r, { ...context, storage: { readFromStorage } })

    const handler = r._routes.get['/ci-duty'].at(-1)
    handler({}, makeRes())

    expect(readFromStorage).toHaveBeenCalledWith('ci-duty-data.json')
  })

  it('returns 404 when no roster has been delivered yet', () => {
    const handler = router._routes.get['/ci-duty'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._status).toBe(404)
    expect(res._json).toEqual({ error: 'No CI Duty roster available yet' })
  })

  it('returns 404 for unknown projects and inapplicable for known non-OSAC projects', () => {
    const handler = router._routes.get['/ci-duty'].at(-1)
    const unknownRes = makeRes()
    handler({ query: { projectId: 'unknown' } }, unknownRes)
    expect(unknownRes._status).toBe(404)
    expect(unknownRes._json).toEqual({ error: 'Unknown project' })

    const flightctlRes = makeRes()
    handler({ query: { projectId: 'flightctl' } }, flightctlRes)
    expect(flightctlRes._json).toEqual({
      projectId: 'flightctl',
      state: 'inapplicable',
      reason: 'user-approved-osac-only',
      data: null
    })
  })

  it('rejects an explicit empty project ID rather than serving the OSAC roster', () => {
    const handler = router._routes.get['/ci-duty'].at(-1)
    const res = makeRes()
    handler({ query: { projectId: '' } }, res)
    expect(res._status).toBe(400)
  })
})
