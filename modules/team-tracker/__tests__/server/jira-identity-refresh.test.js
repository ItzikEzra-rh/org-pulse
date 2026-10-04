import { describe, it, expect, vi, afterEach } from 'vitest'

function fetchResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body)
  }
}

// createJiraClient() is real; only the underlying fetch() call is stubbed, so
// index.js and person-metrics.js run their actual refresh/caching logic.
function installJiraFetch({ userSearch, accountLookup } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const { pathname } = new URL(url)
    if (pathname === '/rest/api/3/search/jql') return fetchResponse(200, { issues: [], isLast: true })
    if (pathname === '/rest/api/2/user/search') return fetchResponse(200, userSearch ? userSearch() : [])
    if (pathname === '/rest/api/2/user') {
      const result = accountLookup ? accountLookup() : null
      return result ? fetchResponse(200, result) : fetchResponse(404, { message: 'not found' })
    }
    return fetchResponse(200, { issues: [], isLast: true })
  }))
}

function makeStorage(initial = {}) {
  const data = { ...initial }
  return {
    readFromStorage(key) { return data[key] !== undefined ? JSON.parse(JSON.stringify(data[key])) : null },
    writeToStorage(key, val) { data[key] = JSON.parse(JSON.stringify(val)) },
    listStorageFiles() { return [] },
    deleteStorageDirectory: vi.fn(),
    _data: data
  }
}

function setupRoutes(storageData) {
  const handlers = {}
  const refreshHandlers = {}
  const mockRouter = {
    get(path, ...args) { handlers[`GET ${path}`] = args[args.length - 1] },
    post(path, ...args) { handlers[`POST ${path}`] = args[args.length - 1] },
    put(path, ...args) { handlers[`PUT ${path}`] = args[args.length - 1] },
    patch(path, ...args) { handlers[`PATCH ${path}`] = args[args.length - 1] },
    delete(path, ...args) { handlers[`DELETE ${path}`] = args[args.length - 1] }
  }

  const storage = makeStorage(storageData)
  const context = {
    storage,
    requireAdmin: (req, res, next) => next(),
    requireTeamAdmin: (req, res, next) => next(),
    requireScope: () => (req, res, next) => next(),
    registerScopes: vi.fn(),
    registerRefresh: (key, opts) => { refreshHandlers[key] = opts },
    isRefreshRunning: () => false
  }

  const registerRoutes = require('../../server/index.js')
  registerRoutes(mockRouter, context)

  return { handlers, refreshHandlers, storage }
}

function mockRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { res._status = code; return res },
    json(body) { res._body = body; return res }
  }
  return res
}

function registryData({ provider = 'test', jiraAccountId } = {}) {
  return {
    'team-data/registry.json': {
      meta: { generatedAt: '2026-01-01', provider },
      people: {
        jdoe: {
          uid: 'jdoe',
          name: 'Jane Doe',
          email: 'jane.doe@redhat.com',
          status: 'active',
          orgRoot: 'org1',
          ...(jiraAccountId ? { jiraAccountId } : {})
        }
      }
    }
  }
}

describe('Jira identity persistence through real refresh handlers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('individual refresh persists jira-name-map.json for a same-name resolution with an empty cache', async () => {
    installJiraFetch({ userSearch: () => [{ displayName: 'Jane Doe', accountId: 'acc-jdoe' }] })

    const { handlers, storage } = setupRoutes(registryData())
    const req = { body: { scope: 'person', name: 'Jane Doe', sources: { jira: true, github: false, gitlab: false } } }
    const res = mockRes()

    await handlers['POST /refresh'](req, res)

    expect(res._status).toBe(200)
    expect(storage._data['jira-name-map.json']).toEqual({
      'Jane Doe': { accountId: 'acc-jdoe', displayName: 'Jane Doe', resolvedViaEmail: 'jane.doe@redhat.com' }
    })
    expect(storage._data['people/jane_doe.json']._resolvedName).toBeUndefined()
  })

  it('pre-resolved accountId (atlassian-teams) is verified and cached via individual refresh', async () => {
    installJiraFetch({ accountLookup: () => ({ accountId: 'acc-jdoe-verified', displayName: 'Jane D. Doe' }) })

    const { handlers, storage } = setupRoutes(registryData({ provider: 'atlassian-teams', jiraAccountId: 'acc-jdoe-verified' }))
    const req = { body: { scope: 'person', name: 'Jane Doe', sources: { jira: true, github: false, gitlab: false } } }
    const res = mockRes()

    await handlers['POST /refresh'](req, res)

    expect(storage._data['jira-name-map.json']).toEqual({
      'Jane Doe': { accountId: 'acc-jdoe-verified', displayName: 'Jane D. Doe' }
    })
    expect(storage._data['people/jane_doe.json'].jiraAccountId).toBe('acc-jdoe-verified')

    const { resolveJiraIdentity } = require('../../../../shared/server/auth')
    expect(resolveJiraIdentity(storage.readFromStorage, 'jdoe')).toEqual({
      jiraDisplayName: 'Jane D. Doe',
      jiraAccountId: 'acc-jdoe-verified'
    })
  })

  it('pre-resolved accountId (atlassian-teams) is verified and cached via the registered metrics refresh', async () => {
    installJiraFetch({ accountLookup: () => ({ accountId: 'acc-jdoe-verified', displayName: 'Jane D. Doe' }) })

    const { refreshHandlers, storage } = setupRoutes(registryData({ provider: 'atlassian-teams', jiraAccountId: 'acc-jdoe-verified' }))

    await refreshHandlers['metrics'].handler()

    expect(storage._data['jira-name-map.json']).toEqual({
      'Jane Doe': { accountId: 'acc-jdoe-verified', displayName: 'Jane D. Doe' }
    })
    expect(storage._data['people/jane_doe.json'].jiraAccountId).toBe('acc-jdoe-verified')
  })

  it('retries a failed accountId lookup on a later refresh instead of caching it', async () => {
    installJiraFetch({ accountLookup: () => null })

    const { handlers, storage } = setupRoutes(registryData({ provider: 'atlassian-teams', jiraAccountId: 'acc-jdoe-verified' }))
    const req = () => ({ body: { scope: 'person', name: 'Jane Doe', sources: { jira: true, github: false, gitlab: false } } })

    await handlers['POST /refresh'](req(), mockRes())

    expect(storage._data['jira-name-map.json']).toEqual({})
    expect(storage._data['people/jane_doe.json'].jiraAccountId).toBe('acc-jdoe-verified')
    expect(storage._data['people/jane_doe.json']._nameNotFound).toBeUndefined()

    installJiraFetch({ accountLookup: () => ({ accountId: 'acc-jdoe-verified', displayName: 'Jane D. Doe' }) })

    await handlers['POST /refresh'](req(), mockRes())

    expect(storage._data['jira-name-map.json']).toEqual({
      'Jane Doe': { accountId: 'acc-jdoe-verified', displayName: 'Jane D. Doe' }
    })
  })
})
