import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const registerHygieneRoutes = require('../../../server/hygiene/routes')

function makeStorage(data = {}) {
  const store = { ...data }
  return {
    readFromStorage(key) {
      if (!(key in store)) return null
      const value = store[key]
      if (value === '__MALFORMED__') {
        throw new SyntaxError('Unexpected token in JSON')
      }
      return value
    },
    writeToStorage(key, value) {
      store[key] = value
    },
    listStorageFiles() {
      return []
    },
    _store: store
  }
}

function makeRouter() {
  const routes = { get: {}, post: {} }
  return {
    get: vi.fn(function (path, ...handlers) {
      routes.get[path] = handlers
    }),
    post: vi.fn(function (path, ...handlers) {
      routes.post[path] = handlers
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

const fixtureJson = key => JSON.parse(readFileSync(join(process.cwd(), 'fixtures', key), 'utf8'))
const OSAC_PROFILE = fixtureJson('projects/osac/profile.json')
const FLIGHTCTL_PROFILE = fixtureJson('projects/flightctl/profile.json')
const OSAC_ENVELOPE = fixtureJson('projects/osac/sources/jira-hygiene/registry.json')
const FLIGHTCTL_ENVELOPE = fixtureJson('projects/flightctl/sources/jira-hygiene/registry.json')
const LEGACY_CONFIG = fixtureJson('releases/hygiene/project-hygiene-config.json')
const LEGACY_RESULTS = fixtureJson('releases/hygiene/project-hygiene-results.json')

function makeProjects({ profiles = [OSAC_PROFILE, FLIGHTCTL_PROFILE], artifacts = {} } = {}) {
  const profileMap = new Map(profiles.map(profile => [profile.projectId, profile]))
  return {
    get: projectId => profileMap.get(projectId) || null,
    list: () => [...profileMap.values()],
    resolve: projectId => {
      const profile = profileMap.get(projectId)
      return profile ? { profile, rootKey: `projects/${projectId}` } : null
    },
    readArtifact: (projectId, artifactKey) => {
      const value = artifacts[`${projectId}/${artifactKey}`]
      return value === undefined ? null : { value, profile: profileMap.get(projectId), key: `projects/${projectId}/${artifactKey}` }
    }
  }
}

function makeContext(storage, projects = null) {
  return {
    storage,
    projects,
    requireAuth: (req, res, next) => next(),
    requirePlanningManager: (req, res, next) => next(),
    requireScope: () => (req, res, next) => next(),
    registerDiagnostics: vi.fn()
  }
}

describe('hygiene routes — GET /project-hygiene', () => {
  it('returns OSAC results from its project-qualified envelope with five-rule parity', () => {
    const projects = makeProjects({ artifacts: { 'osac/sources/jira-hygiene/registry.json': OSAC_ENVELOPE } })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage(), projects))

    const handler = router._routes.get['/project-hygiene'].at(-1)
    const res = makeRes()
    handler({ query: { projectId: 'osac' } }, res)

    expect(res._status).toBe(200)
    expect(res._json.projectId).toBe('osac')
    expect(res._json.legacyMigration).toBe(true)
    expect(res._json.profileRevision).toBe(OSAC_PROFILE.profileRevision)
    expect(Object.keys(res._json.results)).toEqual(['OSAC'])
    expect(res._json.results.OSAC.rules.map(rule => rule.id)).toEqual(OSAC_ENVELOPE.data.configuredRuleIds)
    expect(res._json.results.OSAC.rules).toHaveLength(5)
    expect(res._json.results.OSAC.summary.uniqueIssueCount).toBe(4)
    expect(res._json.results.OSAC.summary.totalRuleMatches).toBe(5)
    expect(res._json.results.OSAC.rules.flatMap(rule => rule.issues).every(issue => issue.key.startsWith('OSAC-'))).toBe(true)
    const legacyRules = LEGACY_RESULTS.results.OSAC.rules
    expect(res._json.results.OSAC.rules.map(rule => [rule.id, rule.count, rule.issues.map(issue => issue.key)])).toEqual(
      legacyRules.map(rule => [rule.id, rule.count, rule.issues.map(issue => issue.key)])
    )
    expect(res._json.results.OSAC.summary).toMatchObject({
      uniqueIssueCount: LEGACY_RESULTS.results.OSAC.summary.uniqueIssueCount,
      totalRuleMatches: LEGACY_RESULTS.results.OSAC.summary.totalRuleMatches
    })
  })

  it('serves only EDM results and keeps disabled policy rules out of result totals', () => {
    const projects = makeProjects({ artifacts: { 'flightctl/sources/jira-hygiene/registry.json': FLIGHTCTL_ENVELOPE } })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage(), projects))

    const handler = router._routes.get['/project-hygiene'].at(-1)
    const res = makeRes()
    handler({ query: { projectId: 'flightctl' } }, res)

    expect(res._status).toBe(200)
    expect(res._json.projectId).toBe('flightctl')
    expect(res._json.legacyMigration).toBeUndefined()
    expect(Object.keys(res._json.results)).toEqual(['EDM'])
    expect(res._json.results.EDM.rules.map(rule => rule.id)).toEqual(['in-progress-no-assignee'])
    expect(res._json.results.EDM.rules.flatMap(rule => rule.issues).map(issue => issue.key)).toEqual(['EDM-101'])
    expect(res._json.results.EDM.rules[0].issues[0]).not.toHaveProperty('team')
    expect(res._json.configuration.enabledRuleIds).toEqual(['in-progress-no-assignee'])
    expect(res._json.configuration.fieldMappings).toEqual({})
    const disabled = res._json.configuration.rules.filter(rule => !rule.enabled)
    expect(disabled).toHaveLength(4)
    expect(disabled.every(rule => /pending/i.test(rule.disabledReason))).toBe(true)
  })

  it('distinguishes a successful empty result from an unavailable collection', () => {
    const envelope = structuredClone(FLIGHTCTL_ENVELOPE)
    envelope.state = 'empty'
    envelope.data.rules[0].count = 0
    envelope.data.rules[0].issues = []
    envelope.data.summary = { uniqueIssueCount: 0, totalRuleMatches: 0, affectedRuleCount: 0, failedRuleCount: 0, generatedAt: envelope.generatedAt }
    const projects = makeProjects({ artifacts: { 'flightctl/sources/jira-hygiene/registry.json': envelope } })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage(), projects))

    const handler = router._routes.get['/project-hygiene'].at(-1)
    const res = makeRes()
    handler({ query: { projectId: 'flightctl' } }, res)

    expect(res._status).toBe(200)
    expect(res._json.state).toBe('empty')
    expect(res._json.results.EDM.summary.totalRuleMatches).toBe(0)
  })

  it('rejects empty envelopes that contain failed rules', () => {
    const envelope = structuredClone(FLIGHTCTL_ENVELOPE)
    envelope.state = 'empty'
    envelope.data.rules[0].count = -1
    envelope.data.rules[0].issues = []
    envelope.data.successfulRuleIds = []
    envelope.data.errors = [{ ruleId: 'in-progress-no-assignee', message: 'EDM query failed' }]
    envelope.data.summary = { uniqueIssueCount: 0, totalRuleMatches: 0, affectedRuleCount: 0, failedRuleCount: 1, generatedAt: envelope.generatedAt }
    const projects = makeProjects({ artifacts: { 'flightctl/sources/jira-hygiene/registry.json': envelope } })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage(), projects))

    const handler = router._routes.get['/project-hygiene'].at(-1)
    const res = makeRes()
    handler({ query: { projectId: 'flightctl' } }, res)

    expect(res._status).toBe(503)
    expect(res._json.reason).toBe('invalid-publication')
  })

  it('returns 404 for an unknown project without reading OSAC data', () => {
    const projects = makeProjects({ artifacts: { 'osac/sources/jira-hygiene/registry.json': OSAC_ENVELOPE } })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage({
      'releases/hygiene/project-hygiene-results.json': LEGACY_RESULTS,
      'releases/hygiene/project-hygiene-config.json': LEGACY_CONFIG
    }), projects))

    const handler = router._routes.get['/project-hygiene'].at(-1)
    const res = makeRes()
    handler({ query: { projectId: 'unknown-project' } }, res)

    expect(res._status).toBe(404)
    expect(res._json.error).toBe('Unknown project')
    expect(res._json.results).toBeUndefined()
  })

  it('requires explicit project selection even when legacy OSAC data exists', () => {
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage({
      'releases/hygiene/project-hygiene-results.json': LEGACY_RESULTS
    }), makeProjects()))

    const handler = router._routes.get['/project-hygiene'].at(-1)
    const res = makeRes()
    handler({ query: {} }, res)

    expect(res._status).toBe(400)
    expect(res._json.reason).toBe('project-selection-required')
    expect(res._json.results).toBeUndefined()
  })

  it('returns selected-project unavailable when its artifact is missing, with no cross-project fallback', () => {
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage({
      'releases/hygiene/project-hygiene-results.json': LEGACY_RESULTS,
      'releases/hygiene/project-hygiene-config.json': LEGACY_CONFIG
    }), makeProjects()))
    const res = makeRes()
    router._routes.get['/project-hygiene'].at(-1)({ query: { projectId: 'flightctl' } }, res)

    expect(res._status).toBe(200)
    expect(res._json).toMatchObject({ projectId: 'flightctl', state: 'unavailable', reason: 'not-collected' })
    expect(res._json.results).toBeUndefined()
  })

  it('rejects an envelope whose project identity does not match the selected profile', () => {
    const projects = makeProjects({ artifacts: { 'flightctl/sources/jira-hygiene/registry.json': OSAC_ENVELOPE } })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage(), projects))
    const res = makeRes()
    router._routes.get['/project-hygiene'].at(-1)({ query: { projectId: 'flightctl' } }, res)

    expect(res._status).toBe(503)
    expect(res._json.reason).toBe('invalid-publication')
  })

  it('rejects disabled rules that omit an explicit policy reason', () => {
    const envelope = structuredClone(FLIGHTCTL_ENVELOPE)
    envelope.data.configuration.rules.find(rule => rule.id === 'no-component').disabledReason = ''
    const projects = makeProjects({ artifacts: { 'flightctl/sources/jira-hygiene/registry.json': envelope } })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage(), projects))
    const res = makeRes()
    router._routes.get['/project-hygiene'].at(-1)({ query: { projectId: 'flightctl' } }, res)

    expect(res._status).toBe(503)
    expect(res._json.reason).toBe('invalid-publication')
  })

  it('marks the last good snapshot stale when its latest collection failed', () => {
    const artifactKey = 'sources/jira-hygiene/registry.json'
    const statusKey = `projects/flightctl/_publication/${encodeURIComponent(artifactKey)}.status.json`
    const status = {
      projectId: 'flightctl', profileRevision: FLIGHTCTL_PROFILE.profileRevision,
      artifactKey, state: 'error', generatedAt: '2026-10-05T12:00:00Z',
      error: { code: 'JIRA_HYGIENE_COLLECTION_FAILED', message: 'EDM query failed' },
      lastKnownGood: { available: true, generatedAt: FLIGHTCTL_ENVELOPE.generatedAt }
    }
    const router = makeRouter()
    const projects = makeProjects({ artifacts: { 'flightctl/sources/jira-hygiene/registry.json': FLIGHTCTL_ENVELOPE } })
    registerHygieneRoutes(router, makeContext(makeStorage({ [statusKey]: status }), projects))
    const res = makeRes()
    router._routes.get['/project-hygiene'].at(-1)({ query: { projectId: 'flightctl' } }, res)

    expect(res._json.freshness).toBe('stale')
    expect(res._json.partial).toBe(true)
    expect(res._json.collectionFailure.message).toBe('EDM query failed')
    expect(res._json.results.EDM.collectionFailure.message).toBe('EDM query failed')
  })

  it('returns a failure diagnostic when there is no successful project snapshot', () => {
    const artifactKey = 'sources/jira-hygiene/registry.json'
    const statusKey = `projects/flightctl/_publication/${encodeURIComponent(artifactKey)}.status.json`
    const status = {
      projectId: 'flightctl', profileRevision: FLIGHTCTL_PROFILE.profileRevision,
      artifactKey, state: 'error', generatedAt: '2026-10-05T12:00:00Z',
      error: { code: 'JIRA_HYGIENE_COLLECTION_FAILED', message: 'No EDM snapshot' }, lastKnownGood: null
    }
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage({
      [statusKey]: status,
      'releases/hygiene/project-hygiene-results.json': LEGACY_RESULTS,
      'releases/hygiene/project-hygiene-config.json': LEGACY_CONFIG
    }), makeProjects()))
    const res = makeRes()
    router._routes.get['/project-hygiene'].at(-1)({ query: { projectId: 'flightctl' } }, res)

    expect(res._status).toBe(503)
    expect(res._json.reason).toBe('collection-failed')
    expect(res._json.collectionFailure.message).toBe('No EDM snapshot')
    expect(res._json.results).toBeUndefined()
  })

  it('uses legacy results only when the selected OSAC profile declares migration', () => {
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage({
      'releases/hygiene/project-hygiene-results.json': LEGACY_RESULTS,
      'releases/hygiene/project-hygiene-config.json': LEGACY_CONFIG
    }), makeProjects()))
    const res = makeRes()
    router._routes.get['/project-hygiene'].at(-1)({ query: { projectId: 'osac' } }, res)

    expect(res._status).toBe(200)
    expect(res._json.legacyMigration).toBe(true)
    expect(res._json.freshness).toBe('unknown')
    expect(Object.keys(res._json.results)).toEqual(['OSAC'])
  })

  it('marks legacy OSAC results partial when a failed rule count is negative', () => {
    const legacyResults = structuredClone(LEGACY_RESULTS)
    const project = legacyResults.results.OSAC
    project.partial = false
    project.summary.totalRuleMatches = 0
    project.rules.find(rule => rule.id === 'no-team').count = -2
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage({
      'releases/hygiene/project-hygiene-results.json': legacyResults,
      'releases/hygiene/project-hygiene-config.json': LEGACY_CONFIG
    }), makeProjects()))
    const res = makeRes()
    router._routes.get['/project-hygiene'].at(-1)({ query: { projectId: 'osac' } }, res)

    expect(res._status).toBe(200)
    expect(res._json.partial).toBe(true)
    expect(res._json.state).toBe('supported')
  })
})

describe('hygiene routes — GET /project-hygiene/config', () => {
  it('returns the selected project configuration, including disabled-rule reasons', () => {
    const projects = makeProjects({ artifacts: { 'flightctl/sources/jira-hygiene/registry.json': FLIGHTCTL_ENVELOPE } })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage(), projects))

    const handler = router._routes.get['/project-hygiene/config'].at(-1)
    const res = makeRes()
    handler({ query: { projectId: 'flightctl' } }, res)

    expect(res._status).toBe(200)
    expect(res._json.projectId).toBe('flightctl')
    expect(Object.keys(res._json.projects)).toEqual(['EDM'])
    expect(res._json.projects.EDM.enabledRuleIds).toEqual(['in-progress-no-assignee'])
    expect(res._json.projects.EDM.rules.filter(rule => !rule.enabled)).toHaveLength(4)
  })

  it('returns 404 for an unknown selected project', () => {
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(makeStorage(), makeProjects()))

    const handler = router._routes.get['/project-hygiene/config'].at(-1)
    const res = makeRes()
    handler({ query: { projectId: 'no-such-project' } }, res)

    expect(res._status).toBe(404)
    expect(res._json.error).toBe('Unknown project')
  })
})

describe('hygiene routes — release-scoped endpoints outside this migration remain intact', () => {
  it('still registers every route consumed outside this migration', () => {
    const storage = makeStorage()
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const getPaths = Object.keys(router._routes.get)
    const postPaths = Object.keys(router._routes.post)

    expect(getPaths).toEqual(expect.arrayContaining([
      '/features', '/summary', '/refresh/status', '/config', '/program-report',
      '/project-hygiene', '/project-hygiene/config'
    ]))
    expect(postPaths).toEqual(expect.arrayContaining(['/refresh-all']))
  })

  it('no longer registers the legacy version-scoped POST /refresh or POST /config routes (CP4: HygieneConfigView.vue rewired, orphaning them)', () => {
    const storage = makeStorage()
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const postPaths = Object.keys(router._routes.post)
    expect(postPaths).not.toContain('/refresh')
    expect(postPaths).not.toContain('/config')
  })

  it('GET /features still serves release-scoped feature data unaffected by the new routes', () => {
    const storage = makeStorage({
      'releases/hygiene/features-0.2.json': { version: '0.2', fetchedAt: '2026-08-01T00:00:00Z', features: { 'OSAC-1': { issueType: 'Feature' } } }
    })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const handler = router._routes.get['/features'].at(-1)
    const res = makeRes()
    handler({ query: { version: '0.2' } }, res)

    expect(res._json.features['OSAC-1']).toBeDefined()
    expect(res._json.version).toBe('0.2')
  })

  it('does not serve OSAC release hygiene features for Flight Control', () => {
    const storage = makeStorage({
      'releases/hygiene/features-0.2.json': {
        version: '0.2',
        fetchedAt: '2026-08-01T00:00:00Z',
        features: { 'OSAC-1': { issueType: 'Feature' } }
      }
    })
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage, makeProjects()))

    const handler = router._routes.get['/features'].at(-1)
    const res = makeRes()
    handler({ query: { projectId: 'flightctl', version: '0.2' } }, res)

    expect(res._json).toMatchObject({
      projectId: 'flightctl',
      state: 'unavailable',
      reason: 'not-collected',
      features: {}
    })
    expect(res._json.message).toContain('Flight Control')
  })

  it('GET /config still serves the release-scoped RHAI rule config unaffected by the new routes', () => {
    const storage = makeStorage()
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const handler = router._routes.get['/config'].at(-1)
    const res = makeRes()
    handler({}, res)

    expect(res._json.config).toBeDefined()
    expect(res._json.ruleDefinitions).toBeDefined()
  })

  it('does not register a POST /project-hygiene or POST /project-hygiene/config route (new namespace stays read-only)', () => {
    const storage = makeStorage()
    const router = makeRouter()
    registerHygieneRoutes(router, makeContext(storage))

    const postPaths = Object.keys(router._routes.post)
    expect(postPaths).not.toContain('/project-hygiene')
    expect(postPaths).not.toContain('/project-hygiene/config')
  })
})
