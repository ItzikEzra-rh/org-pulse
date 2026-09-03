import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerRoutes = require('../../server/component-maturity/routes')

function makeRouter() {
  const routes = { get: {} }
  return {
    get: vi.fn((path, ...handlers) => { routes.get[path] = handlers }),
    _routes: routes
  }
}

function makeResponse() {
  const response = {
    statusCode: 200,
    body: null,
    status(code) { response.statusCode = code; return response },
    json(body) { response.body = body; return response }
  }
  return response
}

function validReport() {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-02T12:00:00Z',
    rules: [],
    components: [],
    evaluations: [],
    mappingProblems: []
  }
}

describe('Component Maturity routes', () => {
  let router
  let requireAuth
  let requireScope

  beforeEach(() => {
    router = makeRouter()
    requireAuth = vi.fn()
    requireScope = vi.fn(() => vi.fn())
  })

  function register(stored) {
    registerRoutes(router, {
      storage: { readFromStorage: vi.fn(() => stored) },
      requireAuth,
      requireScope
    })
    return router._routes.get['/report']
  }

  it('registers an authenticated system-health read route', () => {
    const handlers = register(validReport())
    expect(router.get).toHaveBeenCalledWith('/report', requireAuth, expect.any(Function), expect.any(Function))
    expect(requireScope).toHaveBeenCalledWith('system-health:read')
    expect(handlers).toHaveLength(3)
  })

  it('returns the stored report unchanged', () => {
    const report = validReport()
    const handler = register(report).at(-1)
    const response = makeResponse()
    handler({}, response)
    expect(response.statusCode).toBe(200)
    expect(response.body).toBe(report)
  })

  it.each([
    ['missing', null],
    ['unsupported schema', { ...validReport(), schemaVersion: 2 }],
    ['malformed', { ...validReport(), evaluations: null }]
  ])('returns the unavailable response for %s data', (_label, stored) => {
    const handler = register(stored).at(-1)
    const response = makeResponse()
    handler({}, response)
    expect(response.statusCode).toBe(503)
    expect(response.body).toEqual({
      error: 'Component Maturity data is unavailable',
      code: 'COMPONENT_MATURITY_DATA_UNAVAILABLE'
    })
  })
})
