import { describe, it, expect, beforeEach, vi } from 'vitest'

const registerFeatureTrackingRoutes = require('../../../server/execution/feature-tracking-routes')
const { trackingFileKey, listTrackingReleaseIds, orderReleaseIds } = registerFeatureTrackingRoutes

function makeStorage(data = {}, throwOnKeys = []) {
  const store = { ...data }
  return {
    readFromStorage(key) {
      if (throwOnKeys.includes(key)) {
        throw new SyntaxError('Unexpected token in JSON')
      }
      return Object.prototype.hasOwnProperty.call(store, key) ? JSON.parse(JSON.stringify(store[key])) : null
    },
    writeToStorage(key, value) {
      store[key] = value
    },
    listStorageFiles(dir) {
      const prefix = dir + '/'
      return Object.keys(store)
        .filter(k => k.startsWith(prefix) && k.slice(prefix.length).indexOf('/') === -1 && k.endsWith('.json'))
        .map(k => k.slice(prefix.length))
    },
    _store: store
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

function makeProjects() {
  const profiles = [
    { projectId: 'osac', displayName: 'OSAC' },
    { projectId: 'flightctl', displayName: 'Flight Control' }
  ]
  return {
    get: (projectId) => profiles.find(profile => profile.projectId === projectId) || null,
    list: () => profiles
  }
}

function makeTrackingData(overrides) {
  return Object.assign({
    schemaVersion: 1,
    releaseId: 'osac-0.2',
    displayName: 'OSAC 0.2',
    fixVersions: ['0.2'],
    baselineDate: '2026-07-08',
    baselineSource: 'releaseStart+7d',
    fetchedAt: '2026-08-13T07:56:10Z',
    featureCount: 2,
    counts: { committed: 1, added: 1, dropped: 0, moved: 0, unknown: 0, blockerPriority: 0 },
    wasQueryFailed: false,
    features: [
      { key: 'OSAC-1', summary: 'A', scopeChange: null },
      { key: 'OSAC-2', summary: 'B', scopeChange: 'added' }
    ]
  }, overrides)
}

const REGISTRY = {
  schemaVersion: 1,
  releases: [
    { id: 'osac-0.1', displayName: 'OSAC 0.1', state: 'active' },
    { id: 'osac-0.2', displayName: 'OSAC 0.2', state: 'active' },
    { id: 'osac-0.3', displayName: 'OSAC 0.3', state: 'active' }
  ]
}

describe('trackingFileKey', () => {
  it('builds the tracking-data storage key for a release id', () => {
    expect(trackingFileKey('osac-0.2-M1')).toBe('releases/execution/tracking-data-osac-0.2-M1.json')
  })
})

describe('listTrackingReleaseIds', () => {
  it('extracts release ids from tracking-data-*.json filenames', () => {
    const storage = makeStorage({
      'releases/execution/tracking-data-osac-0.1.json': makeTrackingData({ releaseId: 'osac-0.1' }),
      'releases/execution/tracking-data-osac-0.2-M1.json': makeTrackingData({ releaseId: 'osac-0.2-M1' }),
      'releases/execution/feature-tracking-config.json': { schemaVersion: 1 },
      'releases/execution/index.json': { schemaVersion: 1 }
    })
    const ids = listTrackingReleaseIds(storage)
    expect(ids.sort()).toEqual(['osac-0.1', 'osac-0.2-M1'])
  })

  it('returns an empty array when the directory has no tracking files', () => {
    const storage = makeStorage()
    expect(listTrackingReleaseIds(storage)).toEqual([])
  })
})

describe('orderReleaseIds', () => {
  it('orders by registry position', () => {
    const ordered = orderReleaseIds(['osac-0.3', 'osac-0.1', 'osac-0.2'], REGISTRY)
    expect(ordered).toEqual(['osac-0.1', 'osac-0.2', 'osac-0.3'])
  })

  it('sorts ids absent from the registry alphabetically after known ones', () => {
    const ordered = orderReleaseIds(['osac-9.9', 'osac-0.1'], REGISTRY)
    expect(ordered).toEqual(['osac-0.1', 'osac-9.9'])
  })
})

describe('registerFeatureTrackingRoutes', () => {
  let router, context

  beforeEach(() => {
    router = makeRouter()
    context = {
      storage: makeStorage(),
      requireAuth: (req, res, next) => next(),
      requireScope: () => (req, res, next) => next()
    }
  })

  it('only registers read-only GET routes', () => {
    registerFeatureTrackingRoutes(router, context)
    expect(Object.keys(router._routes.get)).toEqual(['/tracking/releases', '/tracking/data'])
  })

  describe('GET /tracking/releases', () => {
    it('returns a summary for every release with tracking data, ordered by the registry', () => {
      context.storage = makeStorage({
        'releases/registry.json': REGISTRY,
        'releases/execution/tracking-data-osac-0.2.json': makeTrackingData(),
        'releases/execution/tracking-data-osac-0.1.json': makeTrackingData({ releaseId: 'osac-0.1', displayName: 'OSAC 0.1' })
      })
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/releases'].at(-1)
      const res = makeRes()
      handler({}, res)

      expect(res._json.releases.map(r => r.releaseId)).toEqual(['osac-0.1', 'osac-0.2'])
      expect(res._json.releases[1]).toEqual({
        releaseId: 'osac-0.2',
        displayName: 'OSAC 0.2',
        fixVersions: ['0.2'],
        baselineDate: '2026-07-08',
        baselineSource: 'releaseStart+7d',
        fetchedAt: '2026-08-13T07:56:10Z',
        featureCount: 2,
        counts: { committed: 1, added: 1, dropped: 0, moved: 0, unknown: 0, blockerPriority: 0 },
        wasQueryFailed: false
      })
    })

    it('does not include the features array in the summary', () => {
      context.storage = makeStorage({
        'releases/execution/tracking-data-osac-0.2.json': makeTrackingData()
      })
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/releases'].at(-1)
      const res = makeRes()
      handler({}, res)
      expect(res._json.releases[0].features).toBeUndefined()
    })

    it('returns an empty list when no tracking data has been published', () => {
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/releases'].at(-1)
      const res = makeRes()
      handler({}, res)
      expect(res._json).toEqual({ releases: [] })
    })

    it('surfaces wasQueryFailed per release', () => {
      context.storage = makeStorage({
        'releases/execution/tracking-data-osac-0.2.json': makeTrackingData({ wasQueryFailed: true })
      })
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/releases'].at(-1)
      const res = makeRes()
      handler({}, res)
      expect(res._json.releases[0].wasQueryFailed).toBe(true)
    })

    it('skips a release whose tracking-data file is corrupt/unreadable, without failing the rest', () => {
      context.storage = makeStorage({
        'releases/execution/tracking-data-osac-0.1.json': makeTrackingData({ releaseId: 'osac-0.1' }),
        'releases/execution/tracking-data-osac-0.2.json': makeTrackingData({ releaseId: 'osac-0.2' })
      }, ['releases/execution/tracking-data-osac-0.2.json'])
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/releases'].at(-1)
      const res = makeRes()
      handler({}, res)
      expect(res._status).toBe(200)
      expect(res._json.releases.map(r => r.releaseId)).toEqual(['osac-0.1'])
    })

    it('does not list OSAC tracking releases for Flight Control', () => {
      context.storage = makeStorage({
        'releases/execution/tracking-data-osac-0.2.json': makeTrackingData()
      })
      context.projects = makeProjects()
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/releases'].at(-1)
      const res = makeRes()
      handler({ query: { projectId: 'flightctl' } }, res)

      expect(res._json).toMatchObject({
        projectId: 'flightctl',
        state: 'unavailable',
        reason: 'not-collected',
        releases: []
      })
    })

    it('requires project selection when multiple profiles exist', () => {
      context.projects = makeProjects()
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/releases'].at(-1)
      const res = makeRes()
      handler({ query: {} }, res)

      expect(res._status).toBe(400)
      expect(res._json.reason).toBe('project-selection-required')
      expect(res._json.releases).toBeUndefined()
    })
  })

  describe('GET /tracking/data', () => {
    it('returns the full tracking data file for the requested release', () => {
      context.storage = makeStorage({
        'releases/execution/tracking-data-osac-0.2.json': makeTrackingData()
      })
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/data'].at(-1)
      const res = makeRes()
      handler({ query: { releaseId: 'osac-0.2' } }, res)

      expect(res._status).toBe(200)
      expect(res._json.features).toHaveLength(2)
      expect(res._json.releaseId).toBe('osac-0.2')
    })

    it('rejects a missing releaseId with 400', () => {
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/data'].at(-1)
      const res = makeRes()
      handler({ query: {} }, res)
      expect(res._status).toBe(400)
    })

    it('returns 404 when no tracking data exists for the release', () => {
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/data'].at(-1)
      const res = makeRes()
      handler({ query: { releaseId: 'osac-9.9' } }, res)
      expect(res._status).toBe(404)
    })

    it('does not serve an OSAC tracking detail for Flight Control', () => {
      context.storage = makeStorage({
        'releases/execution/tracking-data-osac-0.2.json': makeTrackingData()
      })
      context.projects = makeProjects()
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/data'].at(-1)
      const res = makeRes()
      handler({ query: { releaseId: 'osac-0.2', projectId: 'flightctl' } }, res)

      expect(res._status).toBe(404)
      expect(res._json.projectId).toBe('flightctl')
      expect(res._json.state).toBe('unavailable')
      expect(res._json.features).toBeUndefined()
    })

    it('rejects a path-traversal releaseId with 400', () => {
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/data'].at(-1)
      const res = makeRes()
      handler({ query: { releaseId: '../../registry' } }, res)
      expect(res._status).toBe(400)
    })

    it('rejects a releaseId containing a path separator with 400', () => {
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/data'].at(-1)
      const res = makeRes()
      handler({ query: { releaseId: 'osac-0.2/../../registry' } }, res)
      expect(res._status).toBe(400)
    })

    it('returns a clean 500 and logs when the tracking file is corrupt', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      context.storage = makeStorage({
        'releases/execution/tracking-data-osac-0.2.json': makeTrackingData()
      }, ['releases/execution/tracking-data-osac-0.2.json'])
      registerFeatureTrackingRoutes(router, context)
      const handler = router._routes.get['/tracking/data'].at(-1)
      const res = makeRes()
      handler({ query: { releaseId: 'osac-0.2' } }, res)

      expect(res._status).toBe(500)
      expect(res._json).toEqual({ error: 'Feature tracking data for release is unreadable: osac-0.2' })
      expect(errorSpy).toHaveBeenCalledWith('[feature-tracking] Failed to read tracking data for', 'osac-0.2', expect.any(String))

      errorSpy.mockRestore()
    })
  })
})
