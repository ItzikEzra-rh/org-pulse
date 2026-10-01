import { describe, it, expect, vi } from 'vitest';

// Mock fs before importing routes (for writeAssessmentsAtomic)
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn()
}));

import registerAssessmentRoutes from '../../server/assessments/routes.js';

const ARTIFACT_KEY = 'sources/ep-review/assessments.json';

function makeArtifactEnvelope(projectId, { state = 'supported', assessments = {} } = {}) {
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: '0123456789abcdef',
    artifactKey: ARTIFACT_KEY,
    generatedAt: '2026-10-01T00:00:00Z',
    state,
    freshness: 'fresh',
    partial: false,
    error: null,
    data: { projectId, totalAssessed: Object.keys(assessments).length, assessments }
  };
}

function makeContext({ storageData = null, artifact = undefined } = {}) {
  const projects = {
    get: vi.fn(() => ({ projectId: 'flightctl' })),
    readArtifact: vi.fn((_projectId, _key) => {
      if (artifact === undefined) return null;
      return { value: artifact };
    })
  };
  return {
    storage: {
      readFromStorage: vi.fn().mockReturnValue(storageData),
      writeToStorageAtomic: vi.fn()
    },
    requireAdmin: (req, res, next) => next(),
    requireScope: () => (req, res, next) => next(),
    projects
  };
}

function createRouter() {
  const routes = {};
  const router = {
    get: vi.fn((path, ...handlers) => { routes[`GET ${path}`] = handlers; }),
    post: vi.fn((path, ...handlers) => { routes[`POST ${path}`] = handlers; }),
    put: vi.fn((path, ...handlers) => { routes[`PUT ${path}`] = handlers; }),
    delete: vi.fn((path, ...handlers) => { routes[`DELETE ${path}`] = handlers; })
  };
  return { router, routes };
}

function mockReqRes(query = {}) {
  const res = {
    json: vi.fn(),
    status: vi.fn().mockReturnThis()
  };
  const req = { body: {}, params: {}, query };
  return { req, res };
}

async function callHandler(routes, method, path, query = {}, params = {}) {
  const key = `${method} ${path}`;
  const handlers = routes[key];
  if (!handlers) throw new Error(`No route for ${key}. Routes: ${Object.keys(routes).join(', ')}`);
  const { req, res } = mockReqRes(query);
  req.params = params;
  const handler = handlers[handlers.length - 1];
  await handler(req, res);
  return { req, res };
}

describe('assessment routes serve project-qualified EP-review artifacts', () => {
  it('serves the published artifact projection with state for a non-OSAC project', async () => {
    const artifact = makeArtifactEnvelope('flightctl', {
      state: 'empty',
      assessments: {}
    });
    const { router, routes } = createRouter();
    registerAssessmentRoutes(router, makeContext({ artifact }), () => {
      throw new Error('osac-only guard must not fire when the artifact exists');
    });

    const { res } = await callHandler(routes, 'GET', '/assessments', { projectId: 'flightctl' });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'flightctl',
        state: 'empty',
        freshness: 'fresh'
      })
    );
  });

  it('projects artifact assessments in the legacy shape', async () => {
    const artifact = makeArtifactEnvelope('flightctl', {
      assessments: {
        'EDM-1': {
          latest: {
            rubricVersion: 'v2',
            scores: { what: 2, why: 2, userFacing: 2, rightSized: 1, testability: 2 },
            total: 9,
            passFail: 'PASS',
            antiPatterns: [],
            assessedAt: '2026-10-01T00:00:00Z'
          },
          history: []
        }
      }
    });
    const { router, routes } = createRouter();
    registerAssessmentRoutes(router, makeContext({ artifact }));
    const { res } = await callHandler(routes, 'GET', '/assessments', { projectId: 'flightctl' });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAssessed: 1,
        assessments: {
          'EDM-1': expect.objectContaining({ total: 9, passFail: 'PASS' })
        },
        projectId: 'flightctl',
        state: 'supported'
      })
    );
  });

  it('serves a single artifact assessment by key', async () => {
    const artifact = makeArtifactEnvelope('flightctl', {
      assessments: {
        'EDM-1': {
          latest: { rubricVersion: 'v2', scores: {}, total: 9, passFail: 'PASS', antiPatterns: [], assessedAt: '2026-10-01T00:00:00Z' },
          history: [{ total: 8 }]
        }
      }
    });
    const { router, routes } = createRouter();
    registerAssessmentRoutes(router, makeContext({ artifact }));
    const { res } = await callHandler(routes, 'GET', '/assessments/:key', { projectId: 'flightctl' }, { key: 'EDM-1' });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'flightctl', latest: expect.objectContaining({ total: 9 }) })
    );
  });

  it('returns 404 for an unknown artifact key instead of falling back to OSAC', async () => {
    const artifact = makeArtifactEnvelope('flightctl', { assessments: {} });
    const { router, routes } = createRouter();
    registerAssessmentRoutes(router, makeContext({ artifact }));
    const { res } = await callHandler(routes, 'GET', '/assessments/:key', { projectId: 'flightctl' }, { key: 'EDM-999' });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
  });

  it('keeps the osac-only guard when no project artifact exists', async () => {
    const { router, routes } = createRouter();
    const osacOnlyDataGuard = (req, res) => {
      if (req.query?.projectId && req.query.projectId !== 'osac') {
        res.status(200).json({
          projectId: req.query.projectId,
          state: 'unavailable',
          reason: 'osac-only-data-source',
          data: null
        });
        return true;
      }
      return false;
    };
    registerAssessmentRoutes(router, makeContext({ artifact: null }), osacOnlyDataGuard);
    const { res } = await callHandler(routes, 'GET', '/assessments', { projectId: 'flightctl' });
    expect(res.json).toHaveBeenCalledWith({
      projectId: 'flightctl',
      state: 'unavailable',
      reason: 'osac-only-data-source',
      data: null
    });
  });

  it('never serves project artifacts to OSAC or unscoped requests', async () => {
    const artifact = makeArtifactEnvelope('flightctl', {});
    const context = makeContext({ artifact });
    const { router, routes } = createRouter();
    registerAssessmentRoutes(router, context);
    expect(context.projects.readArtifact).not.toHaveBeenCalled();

    await callHandler(routes, 'GET', '/assessments', {});
    await callHandler(routes, 'GET', '/assessments', { projectId: 'osac' });
    expect(context.projects.readArtifact).not.toHaveBeenCalled();
  });
});
