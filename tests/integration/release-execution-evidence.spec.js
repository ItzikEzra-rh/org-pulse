const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const osacIndex = require('../../fixtures/releases/execution/index.json');
const osacFeatureDetail = require('../../fixtures/releases/execution/features/TEST1-52.json');
const osacTrackingData = require('../../fixtures/releases/execution/tracking-data-rhoai-2.14.json');
const flightctlIndexEnvelope = require('../../fixtures/projects/flightctl/releases/execution/index.json');
const flightctlFeatureOneEnvelope = require('../../fixtures/projects/flightctl/releases/execution/features/EDM-1001.json');
const flightctlFeatureTwoEnvelope = require('../../fixtures/projects/flightctl/releases/execution/features/EDM-1002.json');
const flightctlTrackingEnvelope = require('../../fixtures/projects/flightctl/releases/execution/tracking-data-flightctl-0.10.0.json');

const flightctlIndex = flightctlIndexEnvelope.data;
const flightctlFeatureDetails = {
  'EDM-1001': flightctlFeatureOneEnvelope.data,
  'EDM-1002': flightctlFeatureTwoEnvelope.data
};
const osacFeature = osacIndex.features.find(feature => feature.key === 'TEST1-52');
const osacRelease = 'rhoai-3.0';
const flightctlRelease = '0.10.0';
const screenshotDir = path.resolve(__dirname, '../../docs/onboarding/flightctl/shared-execute-verification-assets');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function captureSharedExecuteScreenshot(page, projectId, tabId) {
  if (process.env.CAPTURE_SHARED_EXECUTE_SCREENSHOTS !== '1') return;
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDir, `${projectId}-${tabId}.png`),
    fullPage: true
  });
}

function detailFor(projectId, key) {
  if (projectId === 'flightctl') return clone(flightctlFeatureDetails[key]);
  return clone(key === osacFeature.key ? osacFeatureDetail : null);
}

function getFeatureIndex(projectId) {
  if (projectId === 'flightctl') return flightctlIndex.features;
  return osacIndex.features;
}

function featureVersions(projectId, scope) {
  if (projectId === 'flightctl') {
    return scope === 'epics'
      ? flightctlIndex.versionOptions.epics
      : flightctlIndex.versionOptions.feature;
  }
  const versions = new Set(osacIndex.features.flatMap(feature => feature.fixVersions || []));
  return [osacRelease, ...[...versions].filter(version => version !== osacRelease).sort()];
}

function trackingReleases(projectId) {
  if (projectId === 'flightctl') return flightctlIndex.trackingReleases;
  return [{
    releaseId: osacTrackingData.releaseId,
    displayName: osacTrackingData.displayName,
    fixVersions: osacTrackingData.fixVersions,
    baselineDate: osacTrackingData.baselineDate,
    baselineSource: osacTrackingData.baselineSource,
    featureCount: osacTrackingData.featureCount,
    counts: osacTrackingData.counts,
    state: 'supported',
    partial: false
  }];
}

function installExecuteApi(page, { delayOsacFeatures = false } = {}) {
  const requests = [];
  let notifyOsacFeaturesRequested = () => {};
  let releaseOsacFeatures;
  const osacFeaturesRequested = new Promise(resolve => { notifyOsacFeaturesRequested = resolve; });
  const osacFeaturesGate = new Promise(resolve => { releaseOsacFeatures = resolve; });

  // The dev server runs Vite only. Return harmless empty responses for shell APIs
  // that are unrelated to this browser contract; specific routes below override it.
  page.route('**/api/**', route => route.fulfill({ json: {} }));
  page.route('**/api/projects', route => route.fulfill({ json: { projects: [
    { projectId: 'osac', displayName: 'OSAC' },
    { projectId: 'flightctl', displayName: 'Flight Control' }
  ] } }));
  page.route('**/api/roster?**', route => {
    const projectId = new URL(route.request().url()).searchParams.get('projectId');
    return route.fulfill({ json: { projectId, availability: 'available', orgs: [], people: [] } });
  });
  page.route('**/api/modules/releases/execution/**', async route => {
    const url = new URL(route.request().url());
    const projectId = url.searchParams.get('projectId');
    const pathname = url.pathname.replace('/api/modules/releases/execution', '');
    requests.push({ pathname, projectId, url: route.request().url() });

    if (delayOsacFeatures && pathname === '/features' && projectId === 'osac') {
      notifyOsacFeaturesRequested();
      await osacFeaturesGate;
    }

    if (pathname === '/features') {
      const features = clone(getFeatureIndex(projectId));
      const partial = projectId === 'flightctl' && flightctlIndexEnvelope.partial === true;
      return route.fulfill({ json: {
        projectId,
        state: 'supported',
        freshness: projectId === 'flightctl' ? flightctlIndexEnvelope.freshness : 'fresh',
        partial,
        fetchedAt: projectId === 'flightctl' ? flightctlIndex.fetchedAt : osacIndex.fetchedAt,
        featureCount: features.length,
        totalFeatureCount: features.length,
        features
      } });
    }

    const detailMatch = pathname.match(/^\/features\/([^/]+)$/);
    if (detailMatch) {
      const key = decodeURIComponent(detailMatch[1]);
      const detail = detailFor(projectId, key);
      return detail
        ? route.fulfill({ json: { ...detail, projectId, state: 'supported', detailState: 'supported' } })
        : route.fulfill({ status: 404, json: { error: `Feature ${key} not found` } });
    }

    if (pathname === '/versions') {
      return route.fulfill({ json: {
        projectId,
        state: 'supported',
        partial: false,
        versions: featureVersions(projectId, url.searchParams.get('scope'))
      } });
    }

    if (pathname === '/epics') {
      const version = url.searchParams.get('version');
      const features = getFeatureIndex(projectId)
        .filter(feature => (feature.fixVersions || []).includes(version))
        .map(feature => {
          const detail = detailFor(projectId, feature.key);
          const epics = detail?.epics || [];
          return {
            key: feature.key,
            summary: feature.summary,
            status: feature.status,
            statusCategory: feature.statusCategory,
            fixVersions: feature.fixVersions || [],
            components: feature.components || [],
            team: feature.team || null,
            coverage: feature.coverage || null,
            isContext: false,
            detailState: detail ? 'supported' : 'unavailable',
            totalEpicCount: detail ? epics.length : null,
            epics
          };
        });
      return route.fulfill({ json: {
        projectId,
        version,
        state: 'supported',
        partial: false,
        fetchedAt: projectId === 'flightctl' ? flightctlIndex.fetchedAt : osacIndex.fetchedAt,
        featureCount: features.length,
        hierarchyCoverage: 'complete',
        hierarchy: clone(projectId === 'flightctl' ? flightctlIndex.hierarchy : osacIndex.hierarchy || null),
        features
      } });
    }

    if (pathname === '/tracking/releases') {
      return route.fulfill({ json: {
        projectId,
        state: 'supported',
        freshness: 'fresh',
        partial: false,
        baselinePolicy: projectId === 'flightctl' ? 'unconfigured' : 'configured',
        releases: trackingReleases(projectId)
      } });
    }

    if (pathname === '/tracking/data') {
      const releaseId = url.searchParams.get('releaseId');
      const data = projectId === 'flightctl'
        ? clone(flightctlTrackingEnvelope.data)
        : clone(osacTrackingData);
      return route.fulfill({ json: {
        ...data,
        projectId,
        state: 'supported',
        freshness: projectId === 'flightctl' ? flightctlTrackingEnvelope.freshness : 'fresh',
        partial: projectId === 'flightctl' && flightctlTrackingEnvelope.partial === true,
        releaseId
      } });
    }

    return route.fulfill({ status: 404, json: { projectId, error: 'Unknown Execute test endpoint' } });
  });

  return {
    requests,
    osacFeaturesRequested,
    releaseOsacFeatures: () => releaseOsacFeatures()
  };
}

async function expectSharedTabs(page) {
  const tabs = page.locator('nav[aria-label="Execute sub-tabs"] button');
  await expect(tabs).toHaveText(['Feature List', 'Hygiene', 'Feature Tracking', 'Epics by Release']);
}

test.describe('Shared Releases Execute @releases', () => {
  test.setTimeout(60000);

  test('keeps the OSAC tabs and interactions for OSAC and Flight Control', async ({ page }) => {
    const api = installExecuteApi(page);
    await page.goto('/#/releases/execute?projectId=osac');
    await expect(page.locator('#project-selector')).toHaveValue('osac');
    await expectSharedTabs(page);

    for (const projectId of ['osac', 'flightctl']) {
      if (projectId === 'flightctl') {
        await page.locator('#project-selector').selectOption('flightctl');
        await expect(page).toHaveURL(/projectId=flightctl/);
      }

      await expectSharedTabs(page);
      await page.getByRole('button', { name: 'Feature List', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Feature Execution Overview' })).toBeVisible();
      await page.getByRole('button', { name: 'List', exact: true }).click();

      if (projectId === 'osac') {
        await page.getByLabel('Search').fill(osacFeature.key);
        const detailButton = page.getByRole('button', { name: `Open details for ${osacFeature.key}`, exact: true });
        await expect(detailButton).toBeVisible();
        await captureSharedExecuteScreenshot(page, projectId, 'feature-list');
        await detailButton.click();
        const drawer = page.getByRole('dialog', { name: `Feature details for ${osacFeature.key}` });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByText('Details', { exact: true })).toBeVisible();
        await drawer.getByRole('button', { name: 'Close detail panel' }).click();
      } else {
        await expect(page.getByText(/No compatible pipeline execution producer is configured/)).toBeVisible();
        await expect(page.getByText(/does not establish Feature completion, pipeline success, or release readiness/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Board', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Board', exact: true }).click();
        await expect(page.getByText(/With Jira child status progress:/)).toBeVisible();
        await expect(page.getByText(/Without complete Jira child status progress:/)).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Jira Children: Done' })).toBeVisible();
        await expect(page.getByText(/1\/1 Jira Done/)).toBeVisible();

        await page.getByRole('button', { name: 'List', exact: true }).click();
        await page.getByLabel('Search').fill('EDM-1002');
        const row = page.getByRole('row').filter({ hasText: 'EDM-1002' });
        await expect(row).toBeVisible();
        await expect(row.getByRole('cell').nth(3)).toContainText('No Eligible Jira Children');
        await expect(row.getByRole('cell').nth(7)).toHaveText('0');
        await captureSharedExecuteScreenshot(page, projectId, 'feature-list');
        await page.getByRole('button', { name: 'Open details for EDM-1002', exact: true }).click();
        const drawer = page.getByRole('dialog', { name: 'Feature details for EDM-1002' });
        await expect(drawer).toBeVisible();
        await expect(drawer.locator('dt:has-text("Team") + dd')).toHaveText('Unknown');
        await drawer.getByRole('button', { name: 'Close detail panel' }).click();

        await page.getByLabel('Search').fill('EDM-1001');
        await page.getByRole('button', { name: 'Open details for EDM-1001', exact: true }).click();
        const progressDrawer = page.getByRole('dialog', { name: 'Feature details for EDM-1001' });
        await expect(progressDrawer.getByText('Jira Child Status Progress', { exact: true })).toBeVisible();
        await expect(progressDrawer.getByText(/1 of 1 configured Jira child issues are Done/)).toBeVisible();
        await expect(progressDrawer.getByText(/does not establish Feature completion, pipeline success, or release readiness/)).toBeVisible();
        await progressDrawer.getByRole('button', { name: 'Close detail panel' }).click();
      }

      await page.getByRole('button', { name: 'Feature Tracking', exact: true }).click();
      await expect(page.getByText("Features committed to each release's baseline scope, and what changed since.")).toBeVisible();
      if (projectId === 'flightctl') {
        await expect(page.getByText(/scope-baseline policy is not configured/i)).toBeVisible();
        await expect(page.getByText('Team attribution is unknown for some features.')).toBeVisible();
      } else {
        await expect(page.getByRole('button', { name: 'RHOAI 2.14', exact: true })).toBeVisible();
      }
      await captureSharedExecuteScreenshot(page, projectId, 'feature-tracking');

      await page.getByRole('button', { name: 'Epics by Release', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Epics by Release' })).toBeVisible();
      await expect(page.locator('#epics-by-release-version')).toHaveValue(projectId === 'flightctl' ? flightctlRelease : osacRelease);
      if (projectId === 'flightctl') {
        await expect(page.getByRole('link', { name: 'EDM-1001' }).first()).toBeVisible();
        await expect(page.getByText('EDM-2001', { exact: true })).toBeVisible();
        await expect(page.getByText('Jira child status only; this does not measure pipeline execution or release readiness.')).toBeVisible();
        await expect(page.getByText(/2 Jira Epics observed;\s*Epics without a linked Feature:\s*1 \(not shown in the tree\)\./)).toBeVisible();
      } else {
        await expect(page.getByText(osacFeature.key, { exact: true })).toBeVisible();
        await expect(page.getByText('TEST2-33439', { exact: true })).toBeVisible();
      }
      await captureSharedExecuteScreenshot(page, projectId, 'epics-by-release');
    }

    expect(api.requests.length).toBeGreaterThan(0);
    expect(api.requests.every(request => ['osac', 'flightctl'].includes(request.projectId))).toBe(true);
    expect(api.requests.some(request => request.pathname === '/presentation')).toBe(false);
  });

  test('discards an OSAC response that arrives after switching to Flight Control', async ({ page }) => {
    const api = installExecuteApi(page, { delayOsacFeatures: true });
    await page.goto('/#/releases/execute?projectId=osac');
    await api.osacFeaturesRequested;

    try {
      await page.locator('#project-selector').selectOption('flightctl');
      await expect(page).toHaveURL(/projectId=flightctl/);
      await page.getByRole('button', { name: 'List', exact: true }).click();
      await expect(page.getByRole('row').filter({ hasText: 'EDM-1002' })).toBeVisible();
    } finally {
      api.releaseOsacFeatures();
    }

    await page.waitForResponse(response => response.url().includes('/execution/features?projectId=osac'));
    await expect(page.getByRole('row').filter({ hasText: 'EDM-1002' })).toBeVisible();
    await expect(page.getByText('TEST1-52', { exact: true })).toHaveCount(0);
    expect(api.requests.some(request => request.pathname === '/features' && request.projectId === 'flightctl')).toBe(true);
  });

  test('unknown project shows not found and does not load OSAC Execute data', async ({ page }) => {
    const api = installExecuteApi(page);
    await page.goto('/#/releases/execute?projectId=unknown');
    await expect(page.getByRole('heading', { name: 'Project not found' })).toBeVisible();
    await expect(page.locator('nav[aria-label="Execute sub-tabs"]')).toHaveCount(0);
    expect(api.requests).toEqual([]);
  });
});
