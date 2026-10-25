/**
 * OSAC falls through to the legacy global computation; other projects read
 * the project-qualified jira-person-metrics publication and never fall back
 * to OSAC data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../shared/server/jira', () => ({
  JIRA_HOST: 'https://test.atlassian.net',
  jiraRequest: vi.fn()
}))
vi.mock('../../server/jira/person-metrics', () => ({ fetchPersonMetrics: vi.fn() }))
vi.mock('../../server/github/contributions', () => ({ fetchGithubData: vi.fn() }))
vi.mock('../../server/gitlab/contributions', () => ({ fetchGitlabData: vi.fn() }))
vi.mock('../../../../shared/server/roster-sync', () => ({
  runSync: vi.fn(),
  scheduleSync: vi.fn()
}))
vi.mock('../../server/snapshots', () => ({
  getCompletedPeriods: vi.fn(() => []),
  getCurrentPeriod: vi.fn(() => null)
}))

const express = require('express')
const http = require('http')
const registerRoutes = require('../../server/index')
const rosterSyncConfig = require('../../../../shared/server/roster-sync/config')
const { ARTIFACT_KEY: JIRA_METRICS_ARTIFACT_KEY } = require('../../server/project-jira-metrics')
const { ARTIFACT_KEY: CONTRIBUTIONS_ARTIFACT_KEY } = require('../../server/project-contributions')

function makeStorage(data) {
  return {
    readFromStorage(key) {
      return data[key] !== undefined ? JSON.parse(JSON.stringify(data[key])) : null
    },
    writeToStorage() {},
    listStorageFiles() { return [] },
    deleteStorageDirectory() {}
  }
}

function makeProjectProfile(projectId) {
  return { projectId, displayName: projectId === 'flightctl' ? 'Flight Control' : 'OSAC', profileRevision: 'rev' }
}

function makeJiraMetricsEnvelope(projectId, overrides = {}) {
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: 'rev',
    artifactKey: JIRA_METRICS_ARTIFACT_KEY,
    source: { id: `${projectId}-jira-person-metrics`, kind: 'jira-person-metrics' },
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    error: null,
    lastKnownGood: null,
    generatedAt: '2026-10-14T00:00:00Z',
    data: {
      projectId,
      personCount: 1,
      people: [{
        accountId: `${projectId}-acct-1`,
        teamIds: ['team-1'],
        resolved: {
          count: 1,
          storyPoints: 5,
          issues: [{ key: `${projectId.toUpperCase()}-1`, resolutionDate: '2026-09-15T00:00:00Z', storyPoints: 5, cycleTimeDays: 2 }]
        },
        inProgress: { count: 0, storyPoints: 0, issues: [] },
        cycleTime: { avgDays: 2, medianDays: 2 }
      }],
      teams: [{
        id: 'team-1',
        name: `${projectId}-team`,
        memberCount: 1,
        membersIncluded: 1,
        membersMissing: [],
        resolved: { count: 1, storyPoints: 5 },
        inProgress: { count: 0, storyPoints: 0 },
        cycleTime: { avgDays: 2, medianDays: 2 },
        partial: false
      }],
      diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 1 }
    },
    ...overrides
  }
}

function makeContributionsEnvelope(projectId, overrides = {}) {
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: 'rev',
    artifactKey: CONTRIBUTIONS_ARTIFACT_KEY,
    source: { id: `${projectId}-contributions`, kind: 'github-contributions' },
    generatedAt: '2026-10-14T00:00:00Z',
    fetchedAt: '2026-10-14T00:00:00Z',
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    error: null,
    data: {
      projectId,
      personCount: 1,
      resolvedCount: 1,
      metric: { name: 'githubContributionCalendar', scope: 'github-wide', unit: 'contributionCount', buckets: 'month' },
      people: [{
        accountId: `${projectId}-acct-1`,
        displayName: 'Team Member',
        active: true,
        teamIds: ['team-1'],
        github: { username: 'member-gh', totalContributions: 42, months: { '2026-09': 42 }, fetchedAt: '2026-10-14T00:00:00Z' },
        gitlab: null
      }],
      diagnostics: { unresolvedIdentities: [], identityConflicts: [], carriedForward: [], failedFetch: [], gitlab: { state: 'unavailable' } }
    },
    ...overrides
  }
}

function makeProjectsReader({ knownProjectIds = [], jiraMetricsProjectIds = [], contributionsProjectIds = [] } = {}) {
  const profiles = {}
  for (const id of knownProjectIds) profiles[id] = makeProjectProfile(id)

  const publications = {}
  for (const id of jiraMetricsProjectIds) {
    publications[id] = { ...publications[id], [JIRA_METRICS_ARTIFACT_KEY]: { value: makeJiraMetricsEnvelope(id) } }
  }
  for (const id of contributionsProjectIds) {
    publications[id] = { ...publications[id], [CONTRIBUTIONS_ARTIFACT_KEY]: { value: makeContributionsEnvelope(id) } }
  }

  return {
    get: projectId => profiles[projectId] || null,
    readArtifact: (projectId, key) => publications[projectId]?.[key] || null
  }
}

function makeRegistryStorageData() {
  return {
    'team-data/registry.json': {
      meta: {
        generatedAt: '2026-01-15T00:00:00.000Z',
        provider: 'atlassian-teams',
        orgRoots: ['uid_lead'],
        vp: null
      },
      people: {
        uid_lead: {
          uid: 'uid_lead', name: 'Lead Person', status: 'active', orgRoot: 'uid_lead',
          email: 'lead@example.com', title: 'Engineering Manager', managerUid: null,
          geo: 'NA', location: 'Boston', miroTeam: 'Core'
        }
      }
    },
    'team-data/config.json': {
      orgRoots: [{ uid: 'uid_lead' }]
    }
  }
}

function createTestServer(storageData, projects) {
  const app = express()
  app.use(express.json())
  const router = express.Router()
  const storage = makeStorage(storageData)
  registerRoutes(router, {
    storage,
    projects,
    requireAdmin: (_req, _res, next) => next(),
    requireTeamAdmin: (_req, _res, next) => next(),
    requireScope: () => (_req, _res, next) => next(),
    registerScopes: vi.fn()
  })
  app.use(router)
  return app
}

function requestGet(app, path) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, () => {
      const port = server.address().port
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          server.close()
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) })
          } catch {
            resolve({ status: res.statusCode, body: data })
          }
        })
      }).on('error', (err) => {
        server.close()
        reject(err)
      })
    })
  })
}

describe('GET /trends project-selection dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rosterSyncConfig.clearDisplayNamesCache()
  })

  it('routes projectId=osac through the legacy global trends, not the project publication', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/trends?projectId=osac')

    expect(status).toBe(200)
    expect(body.projectId).toBeUndefined()
    expect(body.availability).toBeUndefined()
  })

  it('falls through to legacy trends when no projectId is given', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/trends')

    expect(status).toBe(200)
    expect(body.projectId).toBeUndefined()
  })

  it('routes projectId=flightctl through the project-qualified jira-person-metrics publication', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/trends?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.projectId).toBe('flightctl')
    expect(body.availability).toBe('available')
    expect(body.github).toBeNull()
    expect(body.gitlab).toBeNull()
    expect(JSON.stringify(body)).not.toContain('osac-acct')
  })

  it('merges in GitHub from the project contributions publication when available', async () => {
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      jiraMetricsProjectIds: ['flightctl'],
      contributionsProjectIds: ['flightctl']
    })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/trends?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.github.overall).toEqual({ '2026-09': 42 })
    expect(body.github.byTeam).toEqual({ 'flightctl::team-1': { '2026-09': 42 } })
    expect(body.gitlab).toBeNull()
  })

  it('never leaks OSAC data into a project response, even when OSAC also has a jira-person-metrics publication', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], jiraMetricsProjectIds: ['osac', 'flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { body } = await requestGet(app, '/trends?projectId=flightctl')

    expect(JSON.stringify(body)).not.toContain('osac-acct')
    expect(JSON.stringify(body)).not.toContain('osac-team')
  })

  it('returns 404 for an unknown project', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/trends?projectId=nonexistent')

    expect(status).toBe(404)
    expect(body.error).toBe('Unknown project')
  })
})

describe('GET /team/:teamKey/metrics project-selection dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rosterSyncConfig.clearDisplayNamesCache()
  })

  it('routes projectId=flightctl through the project-qualified publication', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/team/flightctl%3A%3Ateam-1/metrics?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.teamKey).toBe('flightctl::team-1')
    expect(body.available).toBe(true)
    expect(body.aggregate.resolvedCount).toBe(1)
  })

  it('merges in a GitHub aggregate from the project contributions publication when available', async () => {
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      jiraMetricsProjectIds: ['flightctl'],
      contributionsProjectIds: ['flightctl']
    })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/team/flightctl%3A%3Ateam-1/metrics?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.aggregate.github).toMatchObject({ total: 42, memberCount: 1, contributorCount: 1 })
  })

  it('reports aggregate.github as null, not a fabricated zero, when no contributions publication exists', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { body } = await requestGet(app, '/team/flightctl%3A%3Ateam-1/metrics?projectId=flightctl')

    expect(body.aggregate.github).toBeNull()
  })

  it('returns 404 for a team absent from the project publication, without falling back to OSAC team metrics', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status } = await requestGet(app, '/team/flightctl%3A%3Anonexistent/metrics?projectId=flightctl')

    expect(status).toBe(404)
  })

  it('returns 404 for an unknown project', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/team/nonexistent%3A%3Ateam-1/metrics?projectId=nonexistent')

    expect(status).toBe(404)
    expect(body.error).toBe('Unknown project')
  })

  it('rejects a teamKey qualified for a different project instead of reinterpreting it', async () => {
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl', 'other'],
      jiraMetricsProjectIds: ['flightctl', 'other']
    })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/team/other%3A%3Ateam-1/metrics?projectId=flightctl')

    expect(status).toBe(404)
    expect(body.error).toContain('other::team-1')
    expect(body.error).toContain('flightctl')
  })
})

describe('GET /project-person-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rosterSyncConfig.clearDisplayNamesCache()
  })

  it('returns the published metrics for the requested (projectId, accountId)', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/project-person-metrics?projectId=flightctl&accountId=flightctl-acct-1')

    expect(status).toBe(200)
    expect(body.projectId).toBe('flightctl')
    expect(body.accountId).toBe('flightctl-acct-1')
    expect(body.availability).toBe('available')
    expect(body.metrics.resolved.issues[0].key).toBe('FLIGHTCTL-1')
  })

  it('reports a person absent from a valid publication as missing-person, not a 404', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/project-person-metrics?projectId=flightctl&accountId=nonexistent')

    expect(status).toBe(200)
    expect(body.availability).toBe('unavailable')
    expect(body.reason).toBe('missing-person')
    expect(body.metrics).toBeNull()
  })

  it('reports a known project with no jira-person-metrics publication as unavailable, not a 404', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['flightctl'], jiraMetricsProjectIds: [] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/project-person-metrics?projectId=flightctl&accountId=flightctl-acct-1')

    expect(status).toBe(200)
    expect(body.availability).toBe('unavailable')
    expect(body.reason).toBe('missing-publication')
  })

  it('returns 404 for an unknown project', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/project-person-metrics?projectId=nonexistent&accountId=acct-1')

    expect(status).toBe(404)
    expect(body.error).toBe('Unknown project')
  })

  it('returns 400 when projectId is missing', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/project-person-metrics?accountId=acct-1')

    expect(status).toBe(400)
    expect(body.error).toBe('projectId is required')
  })

  it('returns 400 when accountId is missing', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['flightctl'], jiraMetricsProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/project-person-metrics?projectId=flightctl')

    expect(status).toBe(400)
    expect(body.error).toMatch(/Invalid account id/)
  })

  it('never leaks another project\'s person data (isolation)', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], jiraMetricsProjectIds: ['osac', 'flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { body } = await requestGet(app, '/project-person-metrics?projectId=flightctl&accountId=flightctl-acct-1')

    expect(JSON.stringify(body)).not.toContain('osac-acct')
  })
})
