/**
 * GET /roster: OSAC falls through to the enriched legacy roster; other projects use the project publication.
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

function makeProjectRosterEnvelope(projectId) {
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: 'rev',
    artifactKey: 'sources/roster/registry.json',
    source: { id: `${projectId}-roster`, kind: 'atlassian-teams' },
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    error: null,
    generatedAt: '2026-09-28T00:00:00Z',
    data: {
      projectId,
      teams: [{ id: 'team-1', name: 'RHEM-DEV', orgKey: projectId }],
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] }
      ]
    }
  }
}

function makeProjectsReader({ knownProjectIds = [], publishedProjectIds = [] } = {}) {
  const profiles = {}
  for (const id of knownProjectIds) profiles[id] = makeProjectProfile(id)

  const publications = {}
  for (const id of publishedProjectIds) {
    publications[id] = { 'sources/roster/registry.json': { value: makeProjectRosterEnvelope(id) } }
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
        },
        uid_member: {
          uid: 'uid_member', name: 'Enriched Person', status: 'active', orgRoot: 'uid_lead',
          email: 'member@example.com', title: 'Senior Engineer', managerUid: 'uid_lead',
          geo: 'EMEA', location: 'Dublin', miroTeam: 'Core'
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

describe('GET /roster project-selection dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rosterSyncConfig.clearDisplayNamesCache()
  })

  it('routes projectId=osac through the enriched legacy roster, not the project publication', async () => {
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      publishedProjectIds: ['flightctl'] // osac has no project publication on purpose
    })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster?projectId=osac')

    expect(status).toBe(200)
    expect(body.teamDataSource).not.toBe('project-publication')

    const members = Object.values(body.orgs[0].teams).flatMap(t => t.members)
    const enriched = members.find(m => m.uid === 'uid_member')
    expect(enriched).toBeTruthy()
    expect(enriched.manager).toBe('uid_lead')
    expect(enriched.title).toBe('Senior Engineer')
    expect(enriched.geo).toBe('EMEA')
    expect(enriched.location).toBe('Dublin')
  })

  it('routes projectId=osac through the enriched legacy roster even when OSAC has a project publication', async () => {
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      publishedProjectIds: ['osac', 'flightctl']
    })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster?projectId=osac')

    expect(status).toBe(200)
    expect(body.teamDataSource).not.toBe('project-publication')
    expect(body.orgs[0].key).toBe('uid_lead')
  })

  it('routes projectId=flightctl through the project publication, unaffected by the OSAC change', async () => {
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      publishedProjectIds: ['flightctl']
    })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.teamDataSource).toBe('project-publication')
    const org = body.orgs[0]
    expect(org.key).toBe('flightctl')
    const member = org.teams['RHEM-DEV'].members[0]
    expect(member).toEqual({ accountId: 'acct-1', name: 'Alice', jiraDisplayName: 'Alice', customFields: {} })
  })

  it('returns 404 for an unknown project', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['flightctl'], publishedProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster?projectId=nonexistent')

    expect(status).toBe(404)
    expect(body.error).toBe('Unknown project')
  })

  it('returns 400 for a malformed projectId', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], publishedProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster?projectId=Not_Valid!')

    expect(status).toBe(400)
    expect(body.error).toMatch(/lowercase kebab-case/)
  })

  it('falls through to the legacy roster when no projectId is given', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], publishedProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster')

    expect(status).toBe(200)
    expect(body.teamDataSource).not.toBe('project-publication')
    expect(body.orgs[0].key).toBe('uid_lead')
  })
})
