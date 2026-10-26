import { describe, it, expect, vi } from 'vitest'
import { createTestContext } from '../../../../shared/server/module-context'
import registerRoutes from '../../server/index.js'
import report from '../fixtures/report.json'
function storageWith({ latest = null, history = {}, invalid = [] } = {}) {
  return {
    readFromStorage: vi.fn((key) => {
      if (invalid.includes(key)) throw new SyntaxError('bad JSON')
      if (key === 'coverage/latest.json') return latest
      return history[key.replace('coverage/history/', '')] ?? null
    }),
    listStorageFiles: vi.fn(() => Object.keys(history)),
    getFileMtime: vi.fn(() => null)
  }
}
function invokeRaw(storage, path, { query = {}, projects = null } = {}) {
  const handlers = {}
  registerRoutes({ get: (route, ...args) => { handlers[route] = args[args.length - 1] } }, createTestContext({ storage, projects }))
  const res = { statusCode: 200, json: vi.fn() }
  res.status = vi.fn((code) => { res.statusCode = code; return res })
  handlers[path]({ query }, res)
  return { status: res.statusCode, body: res.json.mock.calls[0][0] }
}
function invoke(storage, path, options) {
  return invokeRaw(storage, path, options).body
}
function projectsWith(ids = ['osac', 'flightctl']) {
  return {
    get: vi.fn((projectId) => ids.includes(projectId) ? { projectId } : null)
  }
}
function snapshot(date) {
  return { date, commit: 'abc123', overview: report.overview }
}
describe('test-coverage server', () => {
  it('serves the latest overview with merged feature detail', () => {
    const data = invoke(storageWith({
      latest: report,
      history: { '2026-10-25.json': snapshot('2026-10-25') }
    }), '/latest')
    expect(data).toMatchObject({ available: true, commit: report.commit, lastRunAt: '2026-10-25' })
    expect(data.overview[0]).toMatchObject({
      key: 'iam',
      name: 'Identity & Access Management',
      group: 'core',
      verdict: 'insufficient evidence',
      reason: '4 critical and 8 high gaps',
      unit: { state: 'value', display: '65.9% (2820/4278)' },
      integration: { state: 'blocked', detail: '12 tier-unassigned behavior(s)' },
      gaps: { critical: 4, high: 8, total: 20 }
    })
  })
  it('returns empty responses when the files are missing', () => {
    const storage = storageWith()
    expect(invoke(storage, '/latest')).toEqual({ available: false, commit: null, lastRunAt: null, groups: [], overview: [] })
    expect(invoke(storage, '/history')).toEqual({ snapshots: [] })
  })
  it('returns empty responses for invalid JSON', () => {
    expect(invoke(storageWith({ invalid: ['coverage/latest.json'] }), '/latest').available).toBe(false)
    expect(invoke(storageWith({
      history: { '2026-10-25.json': snapshot('2026-10-25') },
      invalid: ['coverage/history/2026-10-25.json']
    }), '/history')).toEqual({ snapshots: [] })
  })
  it('exposes sorted working groups, declared or computed', () => {
    const declared = invoke(storageWith({ latest: { ...report, groups: [{ key: 'zeta', name: 'Zeta' }, { key: 'alpha' }] } }), '/latest')
    expect(declared.groups).toEqual([{ key: 'alpha', name: 'alpha' }, { key: 'zeta', name: 'Zeta' }])
    expect(invoke(storageWith({ latest: report }), '/latest').groups).toEqual([{ key: 'core', name: 'core' }])
  })
  it('counts inferred mappings as pending per tier', () => {
    const data = invoke(storageWith({ latest: report }), '/latest')
    const tenancy = data.overview.find((row) => row.key === 'tenancy')
    expect(tenancy.e2e).toMatchObject({ state: 'zero', pending: 1 })
    expect(data.overview.find((row) => row.key === 'iam').e2e.pending).toBe(0)
  })
  it('drops overview rows whose key is unsafe', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const latest = { commit: report.commit, overview: [...report.overview, { ...report.overview[0], key: '../etc/passwd' }] }
    const data = invoke(storageWith({ latest }), '/latest')
    expect(data.overview.map((row) => row.key)).toEqual(['iam', 'tenancy'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('never serves OSAC coverage data to another project', () => {
    const storage = storageWith({
      latest: report,
      history: { '2026-10-25.json': snapshot('2026-10-25') }
    })
    const projects = projectsWith()
    const envelope = {
      projectId: 'flightctl',
      state: 'unavailable',
      reason: 'osac-only-data-source',
      data: null
    }

    expect(invoke(storage, '/latest', { query: { projectId: 'flightctl' }, projects })).toEqual(envelope)
    expect(invoke(storage, '/history', { query: { projectId: 'flightctl' }, projects })).toEqual(envelope)
    expect(storage.readFromStorage).not.toHaveBeenCalled()
  })

  it('serves coverage data when the selected project is OSAC', () => {
    const storage = storageWith({ latest: report })
    const data = invoke(storage, '/latest', { query: { projectId: 'osac' }, projects: projectsWith() })
    expect(data.available).toBe(true)
    expect(data.overview).toHaveLength(2)
  })

  it('keeps legacy unqualified requests working when no project is selected', () => {
    const storage = storageWith({ latest: report })
    expect(invoke(storage, '/latest', { projects: projectsWith() }).available).toBe(true)
  })

  it('rejects an unknown or invalid project ID', () => {
    const storage = storageWith({ latest: report })
    const projects = projectsWith()
    expect(invokeRaw(storage, '/latest', { query: { projectId: 'missing' }, projects })).toEqual({
      status: 404,
      body: { error: 'Unknown project' }
    })
    expect(invokeRaw(storage, '/latest', { query: { projectId: 'Not Valid' }, projects }).status).toBe(400)
  })

  it('sorts history newest first and caps it at 8', () => {
    const history = {}
    for (let day = 1; day <= 10; day++) {
      const date = `2026-10-${String(day).padStart(2, '0')}`
      history[`${date}.json`] = snapshot(date)
    }
    const { snapshots } = invoke(storageWith({ history }), '/history')
    expect(snapshots).toHaveLength(8)
    expect(snapshots[0].date).toBe('2026-10-10')
    expect(snapshots[7].date).toBe('2026-10-03')
  })
})
