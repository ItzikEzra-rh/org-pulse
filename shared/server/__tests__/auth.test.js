import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const { proxySecretGuard, resolveJiraIdentity } = require('../auth');

function createMockReq(overrides = {}) {
  return {
    method: 'GET',
    path: '/api/roster',
    ip: '127.0.0.1',
    headers: {},
    ...overrides
  };
}

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; }
  };
  return res;
}

describe('proxySecretGuard', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.PROXY_AUTH_SECRET;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PROXY_AUTH_SECRET;
    } else {
      process.env.PROXY_AUTH_SECRET = originalEnv;
    }
  });

  it('passes through when PROXY_AUTH_SECRET is not set', () => {
    delete process.env.PROXY_AUTH_SECRET;
    const req = createMockReq();
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('passes through when PROXY_AUTH_SECRET is empty string', () => {
    process.env.PROXY_AUTH_SECRET = '';
    const req = createMockReq();
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('passes through for OPTIONS requests even with secret set', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq({ method: 'OPTIONS' });
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('passes through for /healthz path', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq({ path: '/healthz' });
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('passes through for /api/healthz path', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq({ path: '/api/healthz' });
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('passes through when valid secret is provided', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq({ headers: { 'x-proxy-secret': 'test-secret' } });
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('returns 401 when secret is missing', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq();
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when secret is invalid', () => {
    process.env.PROXY_AUTH_SECRET = 'test-secret';
    const req = createMockReq({ headers: { 'x-proxy-secret': 'wrong-secret' } });
    const res = createMockRes();
    let called = false;
    proxySecretGuard(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });
});

describe('resolveJiraIdentity', () => {
  const UNRESOLVED = { jiraDisplayName: null, jiraAccountId: null };

  function makeStorage(files) {
    return (key) => files[key] ?? null;
  }

  it('returns null fields when uid is missing', () => {
    const readFromStorage = makeStorage({});
    expect(resolveJiraIdentity(readFromStorage, null)).toEqual(UNRESOLVED);
  });

  it('returns null fields when the uid has no registry person', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: {} }
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual(UNRESOLVED);
  });

  it('returns null fields when the person has no Jira metrics cache entry', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } }
      // people/jane_doe.json intentionally absent
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual(UNRESOLVED);
  });

  it('resolves identity when the roster name equals the verified Jira display name', () => {
    // team-tracker's writers always persist jiraDisplayName as the roster name — the
    // verified name only lives in jira-name-map.json, keyed by that same roster name.
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } },
      'people/jane_doe.json': { jiraDisplayName: 'Jane Doe', jiraAccountId: '5e41b8c0-abc123' },
      'jira-name-map.json': { 'Jane Doe': { accountId: '5e41b8c0-abc123', displayName: 'Jane Doe' } }
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual({
      jiraDisplayName: 'Jane Doe',
      jiraAccountId: '5e41b8c0-abc123'
    });
  });

  it('resolves the verified Jira display name when it differs from the roster name', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } },
      // Production writers strip _resolvedName before persisting — jiraDisplayName here
      // is still just the roster name, never the verified one.
      'people/jane_doe.json': { jiraDisplayName: 'Jane Doe', jiraAccountId: '5e41b8c0-abc123' },
      'jira-name-map.json': { 'Jane Doe': { accountId: '5e41b8c0-abc123', displayName: 'Jane D. Doe' } }
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual({
      jiraDisplayName: 'Jane D. Doe',
      jiraAccountId: '5e41b8c0-abc123'
    });
  });

  it('returns null identity — never the unverified roster name — when Jira resolution failed', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } },
      'people/jane_doe.json': {
        jiraDisplayName: 'Jane Doe',
        _nameNotFound: true,
        _error: 'Could not resolve Jira accountId for "Jane Doe"'
      },
      'jira-name-map.json': { 'Jane Doe': { accountId: 'stale-id', displayName: 'Jane Doe' } }
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual(UNRESOLVED);
  });

  it('returns null identity when the people cache entry has no account id', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } },
      'people/jane_doe.json': { jiraDisplayName: 'Jane Doe' },
      'jira-name-map.json': { 'Jane Doe': { accountId: '5e41b8c0-abc123', displayName: 'Jane Doe' } }
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual(UNRESOLVED);
  });

  it('fails safely instead of guessing from the roster name when jira-name-map.json has no entry', () => {
    // E.g. a roster-provided accountId (atlassian-teams) that skipped API resolution
    // entirely, or a cleared/never-populated name-map cache.
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } },
      'people/jane_doe.json': { jiraDisplayName: 'Jane Doe', jiraAccountId: '5e41b8c0-abc123' },
      'jira-name-map.json': {}
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual(UNRESOLVED);
  });

  it('fails safely instead of guessing from the roster name when jira-name-map.json is missing entirely', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } },
      'people/jane_doe.json': { jiraDisplayName: 'Jane Doe', jiraAccountId: '5e41b8c0-abc123' }
      // jira-name-map.json intentionally absent
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual(UNRESOLVED);
  });

  it('never combines identity fields from mismatched records (accountId disagreement)', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } },
      'people/jane_doe.json': { jiraDisplayName: 'Jane Doe', jiraAccountId: '5e41b8c0-abc123' },
      // Stale/rewritten cache entry for a different account than the one the metrics
      // file was actually fetched for.
      'jira-name-map.json': { 'Jane Doe': { accountId: 'someone-else-id', displayName: 'Someone Else' } }
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual(UNRESOLVED);
  });

  it('fails safely on legacy (pre-Cloud-migration) string-format name-map entries', () => {
    const readFromStorage = makeStorage({
      'team-data/registry.json': { people: { jdoe: { name: 'Jane Doe' } } },
      'people/jane_doe.json': { jiraDisplayName: 'Jane Doe', jiraAccountId: '5e41b8c0-abc123' },
      'jira-name-map.json': { 'Jane Doe': 'Jane Doe' }
    });
    expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual(UNRESOLVED);
  });

  describe('regression: real producer/refresh -> persisted storage -> resolver', () => {
    const { fetchPersonMetrics } = require('../../../modules/team-tracker/server/jira/person-metrics');

    function createMockJiraRequest(handlers = {}) {
      return async (url) => {
        if (url.startsWith('/rest/api/3/search/jql')) {
          return { issues: [], isLast: true };
        }
        if (url.includes('/rest/api/2/user/search')) {
          return handlers.userSearch ? handlers.userSearch(url) : [];
        }
        return { issues: [], isLast: true };
      };
    }

    // Mirrors modules/team-tracker/server/index.js's refresh write sites: run the real
    // resolver/fetcher against a shared nameCache, then persist people/<slug>.json with
    // _resolvedName stripped and jira-name-map.json from the (mutated) nameCache — exactly
    // what production does, and exactly what let the roster name leak through before.
    async function runRealRefreshAndPersist({ rosterName, jiraSearchResults }) {
      const nameCache = {};
      const jiraRequest = createMockJiraRequest({ userSearch: () => jiraSearchResults });
      const metrics = await fetchPersonMetrics(jiraRequest, rosterName, { nameCache });
      if (metrics._resolvedName) delete metrics._resolvedName;

      const slug = rosterName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const files = {
        'team-data/registry.json': { people: { jdoe: { name: rosterName } } },
        [`people/${slug}.json`]: metrics,
        'jira-name-map.json': nameCache
      };
      return makeStorage(files);
    }

    it('catches the exact bug: differing verified name survives via jira-name-map, not people/*.json', async () => {
      const readFromStorage = await runRealRefreshAndPersist({
        rosterName: 'Jane Doe',
        jiraSearchResults: [{ displayName: 'Jane D. Doe', accountId: 'acc-jdoe-verified' }]
      });

      // Confirm production's real strip-before-persist behavior actually happened.
      expect(readFromStorage('people/jane_doe.json')._resolvedName).toBeUndefined();
      expect(readFromStorage('people/jane_doe.json').jiraDisplayName).toBe('Jane Doe');

      expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual({
        jiraDisplayName: 'Jane D. Doe',
        jiraAccountId: 'acc-jdoe-verified'
      });
    });

    it('same-name successful resolution continues to work end-to-end', async () => {
      const readFromStorage = await runRealRefreshAndPersist({
        rosterName: 'Jane Doe',
        jiraSearchResults: [{ displayName: 'Jane Doe', accountId: 'acc-jdoe-verified' }]
      });

      expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual({
        jiraDisplayName: 'Jane Doe',
        jiraAccountId: 'acc-jdoe-verified'
      });
    });

    it('failed resolution end-to-end never falls back to the roster name', async () => {
      const readFromStorage = await runRealRefreshAndPersist({
        rosterName: 'Jane Doe',
        jiraSearchResults: []
      });

      expect(readFromStorage('people/jane_doe.json')._nameNotFound).toBe(true);
      expect(resolveJiraIdentity(readFromStorage, 'jdoe')).toEqual(UNRESOLVED);
    });
  });
});
