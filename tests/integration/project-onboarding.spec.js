const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors } = require('./helpers');

/**
 * Project onboarding validation harness (OSAC-5487).
 *
 * Verifies the project-aware dashboard contract against a deployed candidate:
 * - The shell project selector is the only visible UI addition
 * - Switching projects re-fetches every screen with the projectId param
 * - Unknown projects never fall back to OSAC data
 * - OSAC-only pipelines serve truthful unavailable envelopes per project
 * - Project evidence surfaces (build registry, release execution, design
 *   docs, release plans) fill from collected artifacts
 *
 * Usage: BASE_URL=http://host:18081 npx playwright test tests/integration/project-onboarding.spec.js
 */

const FLIGHTCTL = 'flightctl';

test.describe('Project onboarding @project-onboarding', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('renders the project selector for a multi-project deployment', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const selector = page.locator('#project-selector');
    await expect(selector).toBeVisible();

    const options = await selector.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1);
  });

  test('switching projects sets the projectId hash param', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Flight Control is the default first project on this deployment, so an
    // actual switch means selecting OSAC first, then back to Flight Control
    const selector = page.locator('#project-selector');
    await selector.selectOption('osac');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('projectId=osac');

    await selector.selectOption(FLIGHTCTL);
    await page.waitForTimeout(500);
    expect(page.url()).toContain(`projectId=${FLIGHTCTL}`);
  });

  test('People & Teams fetches the project roster for Flight Control', async ({ page }) => {
    let rosterStatus = null;
    let rosterBody = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/roster')) {
        rosterStatus = response.status();
        try { rosterBody = await response.json(); } catch { /* binary */ }
      }
    });

    await page.goto(`/#/team-tracker/people?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(rosterStatus).toBe(200);
    expect(rosterBody?.projectId).toBe(FLIGHTCTL);
    expect(rosterBody?.availability).toBe('available');
  });

  test('Registry shows project-qualified releases for Flight Control', async ({ page }) => {
    let registryStatus = null;
    let registryBody = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/modules/releases/registry')) {
        registryStatus = response.status();
        try { registryBody = await response.json(); } catch { /* binary */ }
      }
    });

    await page.goto(`/#/releases/schedule?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(registryStatus).toBe(200);
    expect(registryBody?.projectId).toBe(FLIGHTCTL);
    expect((registryBody?.releases || []).some((release) => String(release.id || '').startsWith('flightctl-'))).toBe(true);
  });

  test('Releases Execute displays project-qualified Flight Control evidence', async ({ page }) => {
    const response = page.waitForResponse(response => response.url().includes('/api/modules/releases/execution/evidence?projectId=flightctl'));
    await page.goto(`/#/releases/execute?projectId=${FLIGHTCTL}`);
    const result = await response;
    expect(result.status()).toBe(200);
    const body = await result.json();
    expect(body.projectId).toBe(FLIGHTCTL);
    await expect(page.getByTestId('project-execution-evidence')).toBeVisible();
    if (['supported', 'empty'].includes(body.state)) {
      expect(body.data.projectId).toBe(FLIGHTCTL);
      await expect(page.getByTestId('execution-release-filter')).toBeVisible();
      if (body.partial) await expect(page.getByText(/Partial coverage:/)).toBeVisible();
    } else {
      await expect(page.getByTestId('execution-release-filter')).toHaveCount(0);
    }
    expect(await page.locator('text=/OSAC-\\d+/').count()).toBe(0);
  });

  test('Jira Hygiene reports unavailable for Flight Control instead of showing OSAC data', async ({ page }) => {
    let responseBody = null;
    let responseStatus = null;
    page.on('response', async (response) => {
      const url = new URL(response.url());
      if (url.pathname.endsWith('/api/modules/releases/hygiene/project-hygiene')) {
        responseStatus = response.status();
        responseBody = await response.json();
        expect(url.searchParams.get('projectId')).toBe(FLIGHTCTL);
      }
    });

    await page.goto(`/#/releases/jira-hygiene?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(responseStatus).toBe(404);
    expect(responseBody).toMatchObject({ projectId: FLIGHTCTL, state: 'unavailable' });
    await expect(page.getByText(/Jira Hygiene results have not been collected for Flight Control/)).toBeVisible();
    expect(await page.locator('text=/OSAC-\\d+/').count()).toBe(0);
  });

  test('AI pipeline screens serve the project-qualified envelope for Flight Control, never OSAC rows', async ({ page }) => {
    let rfeStatus = null;
    let rfeBody = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/modules/ai-impact/rfe-data')) {
        rfeStatus = response.status();
        try { rfeBody = await response.json(); } catch { /* binary */ }
      }
    });

    await page.goto(`/#/ai-impact/autofix?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(rfeStatus).toBe(200);
    expect(rfeBody?.projectId).toBe(FLIGHTCTL);
    // The profile-driven EP-review collector published the rfe-data artifact,
    // so the route serves it project-qualified — honest empty until marker
    // reviews exist — rather than the osac-only unavailable envelope.
    expect(rfeBody?.state).toBe('empty');
    expect(rfeBody?.reason).toBeUndefined();
    expect(rfeBody?.issues).toEqual([]);

    // No OSAC issue keys may render for the flightctl context
    const osacRows = await page.locator('text=/OSAC-\\d+/').count();
    expect(osacRows).toBe(0);
  });

  test('module navigation preserves the projectId param', async ({ page }) => {
    await page.goto(`/#/ai-impact/autofix?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'People & Teams' }).first();
    await moduleHeader.scrollIntoViewIfNeeded();
    await moduleHeader.dispatchEvent('click');
    await page.waitForTimeout(800);

    // View entries render inside the expanded section with aria-labels
    const viewLink = page.locator('aside nav button[aria-label="People"]').first();
    await viewLink.waitFor({ state: 'visible', timeout: 10_000 });
    await viewLink.click({ force: true });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
    expect(page.url()).toContain(`projectId=${FLIGHTCTL}`);
  });

  test('Flight Control Product Builds uses a project-neutral sidebar label', async ({ page }) => {
    await page.goto(`/#/product-builds/osac?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.locator('#project-selector')).toHaveValue(FLIGHTCTL);
    await expect(page.getByRole('heading', { name: 'Build Registry' })).toBeVisible();
    await expect(page.locator('aside nav button[aria-label="Build Registry"]')).toBeVisible();
    await expect(page.locator('aside nav button[aria-label="OSAC"]')).toHaveCount(0);
  });

  test('AI Commits proxies the selected Flight Control scanner', async ({ page }) => {
    let scannerResponse = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/modules/ai-impact/ai-commits-proxy')) {
        scannerResponse = {
          status: response.status(),
          url: response.url(),
          projectId: response.headers()['x-orgpulse-project-id']
        };
      }
    });

    await page.goto(`/#/ai-impact/ai-commits?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(scannerResponse?.status).toBe(200);
    expect(new URL(scannerResponse.url).searchParams.get('projectId')).toBe(FLIGHTCTL);
    expect(scannerResponse.projectId).toBe(FLIGHTCTL);
  });

  test('CI Duty shows its Flight Control disposition instead of the OSAC roster', async ({ page }) => {
    let dutyResponse = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/modules/system-health/ci-duty')) {
        dutyResponse = { status: response.status(), body: await response.json() };
      }
    });

    await page.goto(`/#/system-health/ci-duty?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(dutyResponse).toMatchObject({
      status: 200,
      body: {
        projectId: FLIGHTCTL,
        state: 'inapplicable',
        reason: 'user-approved-osac-only',
        data: null
      }
    });
    await expect(page.getByRole('heading', { name: 'CI Duty is not applicable' })).toBeVisible();
  });

  test('project evidence surfaces fill from collected artifacts', async ({ page }) => {
    const surfaces = [
      {
        hash: `/#/system-health/release-execution?projectId=${FLIGHTCTL}`,
        urlPart: '/api/modules/system-health/release-execution',
        expectKey: 'artifactKey',
        expectValue: 'sources/release-execution/registry.json'
      },
      {
        hash: `/#/product-builds/osac?projectId=${FLIGHTCTL}`,
        urlPart: '/api/modules/product-builds/project-publication',
        expectKey: 'state',
        expectValue: 'supported'
      }
    ];

    for (const surface of surfaces) {
      let status = null;
      let body = null;
      page.on('response', async (response) => {
        if (response.url().includes(surface.urlPart)) {
          status = response.status();
          try { body = await response.json(); } catch { /* binary */ }
        }
      });

      await page.goto(surface.hash);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

      expect(status, surface.urlPart).toBe(200);
      expect(body?.[surface.expectKey], surface.urlPart).toBe(surface.expectValue);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });
});
