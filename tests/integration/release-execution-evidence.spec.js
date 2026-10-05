const { test, expect } = require('@playwright/test');
const evidence = require('../../fixtures/releases/project-execution-evidence.json');
const express = require('express');
const registerEvidenceRoutes = require('../../modules/releases/server/execution/evidence-routes');

test('execution presentation API reports unavailable for unsupported views @releases', async ({ request }) => {
  const profile = { projectId: 'flightctl', capabilities: {} };
  let profiles = [profile];
  const app = express();
  const router = express.Router();
  registerEvidenceRoutes(router, {
    projects: { get: id => profiles.find(row => row.projectId === id), list: () => profiles },
    requireAuth: (_req, _res, next) => next(),
    requireScope: () => (_req, _res, next) => next()
  });
  app.use('/api/modules/releases/execution', router);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/modules/releases/execution/presentation`;
  try {
    for (const [capability, state, view] of [
      [{ state: 'supported' }, 'unavailable', null],
      [{ state: 'supported', view: 'unknown' }, 'unavailable', null],
      [{ state: 'empty', view: 'feature-execution' }, 'empty', 'feature-execution'],
      [{ state: 'disabled', view: 'release-evidence' }, 'disabled', 'release-evidence'],
      [{ state: 'supported', artifactKey: 'sources/release-execution/registry.json' }, 'supported', 'release-evidence']
    ]) {
      profile.capabilities.releaseExecution = capability;
      const response = await request.get(url, { params: { projectId: 'flightctl' } });
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ projectId: 'flightctl', state, view });
    }
    profiles = [];
    const legacy = await request.get(url);
    expect(legacy.status()).toBe(200);
    expect(await legacy.json()).toMatchObject({ projectId: 'osac', state: 'supported', view: 'feature-execution' });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test.describe('Release execution evidence @releases', () => {
  test.setTimeout(60000);
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/roster?**', route => route.fulfill({ json: { projectId: new URL(route.request().url()).searchParams.get('projectId'), orgs: [], people: [] } }));
    await page.route('**/api/projects', route => route.fulfill({ json: { projects: [
      { projectId: 'osac', displayName: 'OSAC' },
      { projectId: 'flightctl', displayName: 'Flight Control' }
    ] } }));
    await page.route('**/api/modules/releases/execution/presentation?**', route => {
      const projectId = new URL(route.request().url()).searchParams.get('projectId');
      return route.fulfill({ json: { projectId, state: 'supported', view: projectId === 'osac' ? 'feature-execution' : 'release-evidence' } });
    });
    await page.route('**/api/modules/releases/execution/evidence?**', route => {
      const projectId = new URL(route.request().url()).searchParams.get('projectId');
      return projectId === 'flightctl'
        ? route.fulfill({ json: { ...evidence, projectDisplayName: 'Flight Control' } })
        : route.fulfill({ status: 404, json: { error: 'Unknown project' } });
    });
  });

  test('renders collected release evidence and restores OSAC execution tabs on switching', async ({ page }) => {
    const legacyRequests = [];
    page.on('request', request => {
      if (/\/api\/modules\/releases\/execution\/(features|versions)(\?|$)/.test(request.url())) legacyRequests.push(request.url());
    });
    await page.goto('/#/?projectId=flightctl');
    await expect(page.locator('#project-selector')).toHaveValue('flightctl');
    await page.getByRole('button', { name: 'Releases', exact: true }).click();
    await page.getByRole('button', { name: 'Execute', exact: true }).click();
    await expect(page.getByTestId('project-execution-evidence')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Flight Control — Release Execution' })).toBeVisible();
    await expect(page.getByText(/Partial coverage:/)).toBeVisible();
    expect(legacyRequests).toEqual([]);
    await page.getByTestId('execution-release-filter').selectOption(evidence.data.releases[0].releaseId);
    await expect(page.getByText('Readiness: unknown · Feature completion: unknown')).toBeVisible();
    await expect(page.getByText(/No evidence linked to this release/).first()).toBeVisible();
    await page.locator('#project-selector').selectOption('osac');
    await expect(page.getByTestId('project-execution-evidence')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Feature List', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Feature Tracking', exact: true })).toBeVisible();
    await page.locator('#project-selector').selectOption('flightctl');
    await expect(page.getByTestId('execution-release-filter')).toHaveValue('');
    await expect(page.getByTestId('project-execution-evidence')).toBeVisible();
  });

  test('unknown project shows an error and never renders OSAC tabs', async ({ page }) => {
    await page.goto('/#/releases/execute?projectId=unknown');
    await expect(page.getByRole('heading', { name: 'Project not found' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Feature List', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('execution-release-filter')).toHaveCount(0);
  });
});
