import { describe, it, expect, vi } from 'vitest'
const register = require('../../../server/execution/evidence-routes')

function setup(envelope) {
  const handlers = {}
  const profiles = ['osac', 'flightctl', 'microshift'].map(projectId => ({ projectId, displayName: projectId === 'flightctl' ? 'Flight Control' : projectId, capabilities: { releaseExecution: projectId === 'osac' ? { state: 'supported', view: 'feature-execution' } : { state: 'supported', view: 'release-evidence', artifactKey: 'sources/release-execution/registry.json' } } }))
  const projects = { get: id => profiles.find(row => row.projectId === id), list: () => profiles, readArtifact: vi.fn(() => envelope ? { value: envelope } : null) }
  register({ get: (path, ...routeHandlers) => { handlers[path] = routeHandlers.at(-1) } }, { projects, requireAuth: () => {}, requireScope: () => () => {} })
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
  return { projects, res, request: (query, path = '/evidence') => handlers[path]({ query }, res) }
}

describe('project release execution evidence', () => {
  it('serves the selected project envelope without inferring readiness', () => {
    const value = { projectId: 'flightctl', state: 'supported', freshness: 'stale', partial: true, data: { projectId: 'flightctl', workflowRuns: [{ id: 1, status: 'completed', conclusion: 'failure' }] } }
    const t = setup(value)
    t.request({ projectId: 'flightctl' })
    expect(t.projects.readArtifact).toHaveBeenCalledWith('flightctl', 'sources/release-execution/registry.json')
    expect(t.res.body).toEqual({ ...value, projectDisplayName: 'Flight Control' })
    expect(t.res.body).not.toHaveProperty('readiness')
  })
  it('rejects unknown or absent project selection without reading artifacts', () => {
    for (const [query, status] of [[{ projectId: 'unknown' }, 404], [{}, 400]]) {
      const t = setup(null)
      t.request(query)
      expect(t.res.statusCode).toBe(status)
      expect(t.projects.readArtifact).not.toHaveBeenCalled()
    }
  })
  it('never returns an envelope or nested data belonging to OSAC under Flight Control', () => {
    for (const value of [{ projectId: 'osac' }, { projectId: 'flightctl', data: { projectId: 'osac' } }]) {
      const t = setup(value)
      t.request({ projectId: 'flightctl' })
      expect(t.res.statusCode).toBe(503)
      expect(t.res.body).not.toHaveProperty('data')
    }
  })
  it('selects the renderer from profile capabilities for any configured project', () => {
    for (const [projectId, view] of [['osac', 'feature-execution'], ['flightctl', 'release-evidence'], ['microshift', 'release-evidence']]) {
      const t = setup(null)
      t.request({ projectId }, '/presentation')
      expect(t.res.body).toMatchObject({ projectId, state: 'supported', view })
      expect(t.projects.readArtifact).not.toHaveBeenCalled()
    }
  })
  it.each([
    { state: 'supported' },
    { state: 'empty', view: null },
    { state: 'supported', view: '' },
    { state: 'supported', view: 'unknown' },
    { state: 'supported', view: 'unknown', artifactKey: 'sources/release-execution/registry.json' },
  ])('reports unavailable for an unsupported presentation: %j', capability => {
    const t = setup(null)
    t.projects.get('flightctl').capabilities.releaseExecution = capability
    t.request({ projectId: 'flightctl' }, '/presentation')
    expect(t.res.body).toMatchObject({ projectId: 'flightctl', state: 'unavailable', view: null })
    expect(t.projects.readArtifact).not.toHaveBeenCalled()
  })
  it.each(['feature-execution', 'release-evidence'])('preserves capability states for %s', view => {
    for (const state of ['supported', 'empty', 'disabled', 'error', undefined]) {
      const t = setup(null)
      t.projects.get('flightctl').capabilities.releaseExecution = { state, view }
      t.request({ projectId: 'flightctl' }, '/presentation')
      expect(t.res.body).toMatchObject({ state: state || 'unavailable', view })
    }
  })
  it('preserves the artifact-key presentation fallback', () => {
    const t = setup(null)
    t.projects.get('flightctl').capabilities.releaseExecution = { state: 'empty', artifactKey: 'sources/release-execution/registry.json' }
    t.request({ projectId: 'flightctl' }, '/presentation')
    expect(t.res.body).toMatchObject({ state: 'empty', view: 'release-evidence' })
  })
  it('preserves supported legacy presentation without published profiles', () => {
    const t = setup(null)
    t.projects.list = () => []
    t.request({}, '/presentation')
    expect(t.res.body).toMatchObject({ projectId: 'osac', state: 'supported', view: 'feature-execution' })
  })
  it('reads the third project publication through the same configured evidence path', () => {
    const t = setup({ projectId: 'microshift', state: 'empty', data: { projectId: 'microshift', releases: [] } })
    t.request({ projectId: 'microshift' })
    expect(t.projects.readArtifact).toHaveBeenCalledWith('microshift', 'sources/release-execution/registry.json')
    expect(t.res.body.projectId).toBe('microshift')
  })
  it('reports missing project evidence honestly', () => {
    const t = setup(null)
    t.request({ projectId: 'flightctl' })
    expect(t.res.body).toMatchObject({ projectId: 'flightctl', state: 'unavailable', freshness: 'unknown' })
  })
})
