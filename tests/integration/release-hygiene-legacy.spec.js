const { test, expect } = require('@playwright/test');

test('legacy Release Hygiene loads mapped releases and displays published empty data @releases', async ({ page }) => {
  const requests = [];
  await page.addInitScript(() => localStorage.setItem('releases:hygiene:welcome_dismissed', 'true'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const version = url.searchParams.get('version');
    if (url.pathname === '/api/projects') {
      return route.fulfill({ json: { projects: [{ projectId: 'osac', displayName: 'OSAC' }] } });
    }
    if (url.pathname === '/api/modules/releases/hygiene/project-hygiene') {
      return route.fulfill({ json: { projectId: 'osac', state: 'supported', legacyMigration: true } });
    }
    if (url.pathname === '/api/modules/releases/registry') {
      return route.fulfill({ json: { releases: [
        { displayName: 'OSAC 0.4', fixVersions: ['0.4'] },
        { displayName: 'OSAC Backlog', fixVersions: ['Backlog'] }
      ] } });
    }
    if (url.pathname === '/api/modules/releases/hygiene/features') {
      requests.push({ endpoint: 'features', version, projectId: url.searchParams.get('projectId') });
      const features = version === '0.4'
        ? { 'OSAC-11': { key: 'OSAC-11', summary: 'Published feature', status: 'Backlog', violations: [] } }
        : {};
      return route.fulfill({ json: { features, fetchedAt: ['0.4', 'Backlog'].includes(version) ? '2026-10-29T08:00:00Z' : null } });
    }
    if (url.pathname === '/api/modules/releases/hygiene/summary') {
      requests.push({ endpoint: 'summary', version, projectId: url.searchParams.get('projectId') });
      return route.fulfill({ json: { totalFeatures: version === '0.4' ? 1 : 0, featuresWithViolations: 0, violationsByRule: {} } });
    }
    if (url.pathname === '/api/modules/releases/execution/features') {
      return route.fulfill({ json: { features: [] } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/#/releases/execute?tab=feature-status&projectId=osac');
  await expect(page.getByText('OSAC-11', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All Versions' })).toBeVisible();
  expect(requests).toEqual(expect.arrayContaining([
    { endpoint: 'features', version: '0.4', projectId: 'osac' },
    { endpoint: 'summary', version: '0.4', projectId: 'osac' },
    { endpoint: 'features', version: 'Backlog', projectId: 'osac' },
    { endpoint: 'summary', version: 'Backlog', projectId: 'osac' }
  ]));

  await page.getByRole('button', { name: 'All Versions' }).click();
  await page.getByLabel('OSAC 0.4', { exact: true }).check();
  await expect.poll(() => requests.filter(request => request.endpoint === 'features' && request.version === '0.4').length).toBe(2);
  await expect(page.getByText('OSAC-11', { exact: true })).toBeVisible();
  await page.getByLabel('OSAC 0.4', { exact: true }).uncheck();
  await page.getByLabel('OSAC Backlog', { exact: true }).check();
  await expect(page.getByText('No features found for the selected release.')).toBeVisible();
  await expect(page.getByText('Use the Manage page to trigger a hygiene data refresh.')).toHaveCount(0);
});
