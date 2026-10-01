import { describe, it, expect, vi } from 'vitest';

// Mock fs before importing routes (for writeAssessmentsAtomic in siblings)
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn()
}));

import registerFeatureRoutes from '../../server/features/routes.js';

const ARTIFACT_KEY = 'sources/ep-review/features.json';

function makeArtifactEnvelope(projectId, { state = 'supported', features = [] } = {}) {
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
    data: { projectId, totalFeatures: features.length, features, testPlanReviews: {} }
  };
}

function makeContext({ artifact = undefined } = {}) {
  const projects = {
    get: vi.fn(() => ({ projectId: 'flightctl' })),
    readArtifact: vi.fn(() => (artifact === undefined ? null : { value: artifact }))
  };
  return {
    storage: {
      readFromStorage: vi.fn().mockReturnValue(null),
      writeToStorageAtomic: vi.fn()
    },
    requireAdmin: (_req, res, next) => next(),
    requireScope: () => (_req, res, next) => next(),
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

async function callHandler(routes, path, query = {}) {
  const handlers = routes[`GET ${path}`];
  if (!handlers) throw new Error(`No route for ${path}`);
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
  const req = { body: {}, params: {}, query };
  await handlers[handlers.length - 1](req, res);
  return res;
}

describe('feature routes serve the project-qualified EP-review artifact', () => {
  it('projects artifact features into the legacy keyed shape for a non-OSAC project', async () => {
    const artifact = makeArtifactEnvelope('flightctl', {
      features: [
        {
          key: 'EDM-1',
          summary: 'Add streaming inference',
          status: 'In Progress',
          prNumber: 12,
          designScores: {
            scores: { feasibility: 2, testability: 1, scope: 2, architecture: 2 },
            total: 7,
            passFail: 'PASS',
            criterionNotes: {},
            verdict: 'PASS - feasible',
            assessedAt: '2026-09-20T00:00:00Z'
          },
          humanReview: 'APPROVED'
        }
      ]
    });
    const { router, routes } = createRouter();
    registerFeatureRoutes(router, makeContext({ artifact }));
    const res = await callHandler(routes, '/features', { projectId: 'flightctl' });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        'EDM-1': expect.objectContaining({
          key: 'EDM-1',
          title: 'Add streaming inference',
          total: 7,
          passFail: 'PASS',
          humanReviewStatus: 'APPROVED'
        }),
        projectId: 'flightctl',
        state: 'supported',
        freshness: 'fresh'
      })
    );
  });

  it('serves an honest empty state when the artifact has no features', async () => {
    const artifact = makeArtifactEnvelope('flightctl', { state: 'empty', features: [] });
    const { router, routes } = createRouter();
    registerFeatureRoutes(router, makeContext({ artifact }));
    const res = await callHandler(routes, '/features', { projectId: 'flightctl' });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'flightctl', state: 'empty' })
    );
  });

  it('keeps the osac-only guard when no artifact exists', async () => {
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
    registerFeatureRoutes(router, makeContext({ artifact: null }), osacOnlyDataGuard);
    const res = await callHandler(routes, '/features', { projectId: 'flightctl' });
    expect(res.json).toHaveBeenCalledWith({
      projectId: 'flightctl',
      state: 'unavailable',
      reason: 'osac-only-data-source',
      data: null
    });
  });

  it('never reads project artifacts for OSAC or unscoped requests', async () => {
    const context = makeContext({ artifact: makeArtifactEnvelope('flightctl', {}) });
    const { router, routes } = createRouter();
    registerFeatureRoutes(router, context);
    await callHandler(routes, '/features', {});
    await callHandler(routes, '/features', { projectId: 'osac' });
    expect(context.projects.readArtifact).not.toHaveBeenCalled();
  });
});
