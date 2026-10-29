const { test, expect } = require('@playwright/test');

async function installLegacyApi(page, { displayData = false } = {}) {
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
      const feature = version === '0.4'
        ? { key: 'OSAC-11', summary: 'Pipeline feature', status: 'Backlog', violations: [] }
        : displayData && version === 'OSAC 0.4'
          ? { key: 'OSAC-12', summary: 'Refreshed feature', status: 'Backlog', violations: [] }
          : null;
      const features = feature ? { [feature.key]: feature } : {};
      const exists = feature || version === 'Backlog';
      return route.fulfill({ json: { features, fetchedAt: exists ? '2026-10-29T08:00:00Z' : null } });
    }
    if (url.pathname === '/api/modules/releases/hygiene/summary') {
      requests.push({ endpoint: 'summary', version, projectId: url.searchParams.get('projectId') });
      const exists = version === '0.4' || version === 'Backlog' || (displayData && version === 'OSAC 0.4');
      return route.fulfill({ json: { fetchedAt: exists ? '2026-10-29T08:00:00Z' : null, totalFeatures: exists && version !== 'Backlog' ? 1 : 0, featuresWithViolations: 0, violationsByRule: {} } });
    }
    if (url.pathname === '/api/modules/releases/execution/features') {
      return route.fulfill({ json: { features: [] } });
    }
    return route.fulfill({ json: {} });
  });
  return requests;
}

test('legacy Release Hygiene loads mapped releases and displays published empty data @releases', async ({ page }) => {
  const requests = await installLegacyApi(page);
  await page.goto('/#/releases/execute?tab=feature-status&projectId=osac');
  await expect(page.getByText('OSAC-11', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All Versions' })).toBeVisible();
  expect(requests).toEqual(expect.arrayContaining([
    { endpoint: 'features', version: 'OSAC 0.4', projectId: 'osac' },
    { endpoint: 'summary', version: 'OSAC 0.4', projectId: 'osac' },
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

test('legacy Release Hygiene prefers refreshed display-name data when both sources exist @releases', async ({ page }) => {
  const requests = await installLegacyApi(page, { displayData: true });
  await page.goto('/#/releases/execute?tab=feature-status&version=OSAC%200.4&projectId=osac');

  await expect(page.getByText('OSAC-12', { exact: true })).toBeVisible();
  await expect(page.getByText('OSAC-11', { exact: true })).toHaveCount(0);
  expect(requests).toEqual(expect.arrayContaining([
    { endpoint: 'features', version: 'OSAC 0.4', projectId: 'osac' },
    { endpoint: 'summary', version: 'OSAC 0.4', projectId: 'osac' }
  ]));
  expect(requests).not.toContainEqual({ endpoint: 'features', version: '0.4', projectId: 'osac' });
  expect(requests).not.toContainEqual({ endpoint: 'summary', version: '0.4', projectId: 'osac' });
});
