import { describe, it, expect, vi, beforeEach } from 'vitest'

const registerReleasePlanRoutes = require('../../../server/release-plan/routes')

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

describe('release-plan routes', () => {
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
    registerReleasePlanRoutes(router, context)
  })

  describe('route registration', () => {
    it('registers the expected GET routes', () => {
      const paths = Object.keys(router._routes.get)
      expect(paths).toContain('/release-plans')
      expect(paths).toContain('/release-plan')
    })
  })

  describe('GET /release-plans', () => {
    it('returns the index from storage', () => {
      storage = makeStorage({ 'releases/release-plans/index.json': { versions: ['0.3'] } })
      const r = makeRouter()
      registerReleasePlanRoutes(r, { ...context, storage })

      const handler = r._routes.get['/release-plans'].at(-1)
      const res = makeRes()
      handler({}, res)

      expect(res._json).toEqual({ versions: ['0.3'] })
    })

    it('returns an empty versions list when no index is stored', () => {
      const handler = router._routes.get['/release-plans'].at(-1)
      const res = makeRes()
      handler({}, res)

      expect(res._json).toEqual({ versions: [] })
    })
  })

  describe('GET /release-plan', () => {
    it('returns 400 when version is missing', () => {
      const handler = router._routes.get['/release-plan'].at(-1)
      const res = makeRes()
      handler({ query: {} }, res)

      expect(res._status).toBe(400)
      expect(res._json).toEqual({ error: 'version is required' })
    })

    it('returns 400 for an invalid version format', () => {
      const handler = router._routes.get['/release-plan'].at(-1)
      const res = makeRes()
      handler({ query: { version: '../../etc/passwd' } }, res)

      expect(res._status).toBe(400)
      expect(res._json).toEqual({ error: 'Invalid version format' })
    })

    it('returns 404 when no plan exists for the requested version', () => {
      const handler = router._routes.get['/release-plan'].at(-1)
      const res = makeRes()
      handler({ query: { version: '9.9' } }, res)

      expect(res._status).toBe(404)
      expect(res._json).toEqual({ error: 'Release plan not found' })
    })

    it('returns the stored plan for a valid version', () => {
      const plan = { metadata: { version: '0.3' } }
      storage = makeStorage({ 'releases/release-plans/0.3.json': plan })
      const r = makeRouter()
      registerReleasePlanRoutes(r, { ...context, storage })

      const handler = r._routes.get['/release-plan'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.3' } }, res)

      expect(res._json).toEqual(plan)
    })
  })
})
