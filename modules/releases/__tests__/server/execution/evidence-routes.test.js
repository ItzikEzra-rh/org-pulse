import { describe, it, expect, vi } from 'vitest'
const register = require('../../../server/execution/evidence-routes')

function setup(envelope) {
  const handlers = {}
  const profiles = ['osac', 'flightctl', 'microshift'].map(projectId => ({ projectId, displayName: projectId === 'flightctl' ? 'Flight Control' : projectId, capabilities: { releaseExecution: projectId === 'osac' ? { state: 'supported', view: 'feature-execution' } : { state: 'supported', view: 'release-evidence', artifactKey: 'sources/release-execution/registry.json' } } }))
  const projects = { get: id => profiles.find(row => row.projectId === id), list: () => profiles, readArtifact: vi.fn(() => envelope ? { value: envelope } : null) }
  register({ get: (path, ...routeHandlers) => { handlers[path] = routeHandlers.at(-1) } }, { projects, requireAuth: () => {}, requireScope: () => () => {} })
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
  return { projects, handlers, res, request: (query, path = '/evidence') => handlers[path]?.({ query }, res) }
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
  it('does not expose an Execute presentation switch endpoint', () => {
    const t = setup(null)
    expect(t.handlers['/presentation']).toBeUndefined()
    expect(t.handlers['/evidence']).toBeDefined()
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
