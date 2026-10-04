const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors } = require('./helpers');

/**
 * Full UI validation (both projects) against a deployed candidate.
 *
 * Covers what the onboarding harness does not:
 * - Default Flight Control context and People-directory isolation when switching to OSAC
 * - OSAC project-qualified reads (?projectId=osac)
 * - OSAC autofix pipeline data (real rows) for the OSAC context
 * - OSAC AI screens never serve flightctl rows
 * - Documentation and release-plan surfaces for Flight Control
 *
 * Usage: BASE_URL=http://host:18081 npx playwright test tests/integration/full-ui-test.spec.js
 */

const FLIGHTCTL = 'flightctl';
const OSAC = 'osac';

test.describe('Full UI @full-ui', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('default project context shows Flight Control people and switching to OSAC stays isolated', async ({ page }) => {
    const rosterResponses = [];
    const legacyPeopleRequests = [];
    page.on('response', async (response) => {
      const url = new URL(response.url());
      if (url.pathname === '/api/roster' && url.searchParams.get('projectId') === FLIGHTCTL) {
        try { rosterResponses.push({ status: response.status(), body: await response.json() }); } catch { /* binary */ }
      }
    });
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/modules/team-tracker/registry/people') {
        legacyPeopleRequests.push(request.url());
      }
    });

    await page.goto('/#/team-tracker/people');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toContain(`projectId=${FLIGHTCTL}`);
    expect(await page.locator('#project-selector').inputValue()).toBe(FLIGHTCTL);
    expect(rosterResponses.at(-1)?.status).toBe(200);
    expect(rosterResponses.at(-1)?.body?.people).toHaveLength(23);
    await expect(page.locator('tbody tr')).toHaveCount(23);
    expect(legacyPeopleRequests).toHaveLength(0);

    await page.locator('#project-selector').selectOption(OSAC);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
    expect(page.url()).toContain(`projectId=${OSAC}`);
    await expect(page.locator('tbody tr')).toHaveCount(94);
    const osacLegacyRequestCount = legacyPeopleRequests.length;
    expect(osacLegacyRequestCount).toBeGreaterThan(0);

    await page.locator('#project-selector').selectOption(FLIGHTCTL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
    expect(page.url()).toContain(`projectId=${FLIGHTCTL}`);
    await expect(page.locator('tbody tr')).toHaveCount(23);
    expect(legacyPeopleRequests).toHaveLength(osacLegacyRequestCount);
  });

  test('OSAC project-qualified reads serve OSAC data', async ({ page }) => {
    let rosterStatus = null;
    let rosterBody = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/roster')) {
        rosterStatus = response.status();
        try { rosterBody = await response.json(); } catch { /* binary */ }
      }
    });

    await page.goto(`/#/team-tracker/people?projectId=${OSAC}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(rosterStatus).toBe(200);
    expect(rosterBody?.projectId).toBe(OSAC);
    expect(rosterBody?.availability).toBe('available');
  });

  test('OSAC registry shows OSAC releases, never flightctl releases', async ({ page }) => {
    let registryStatus = null;
    let registryBody = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/modules/releases/registry')) {
        registryStatus = response.status();
        try { registryBody = await response.json(); } catch { /* binary */ }
      }
    });

    await page.goto(`/#/releases/schedule?projectId=${OSAC}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(registryStatus).toBe(200);
    expect(registryBody?.projectId).toBe(OSAC);
    const releases = registryBody?.releases || [];
    expect(releases.length).toBeGreaterThan(0);
    expect(releases.some((r) => String(r.id || '').startsWith('osac-'))).toBe(true);
    expect(releases.some((r) => String(r.id || '').startsWith('flightctl-'))).toBe(false);
  });

  test('OSAC autofix pipeline serves real rows for the OSAC context', async ({ page }) => {
    let autofixStatus = null;
    let autofixBody = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/modules/ai-impact/autofix-data')) {
        autofixStatus = response.status();
        try { autofixBody = await response.json(); } catch { /* binary */ }
      }
    });

    await page.goto(`/#/ai-impact/autofix?projectId=${OSAC}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(autofixStatus).toBe(200);
    expect(autofixBody?.metrics).toBeTruthy();
    expect((autofixBody?.issues || []).length).toBeGreaterThan(0);
  });

  test('OSAC AI screens never render flightctl issue keys', async ({ page }) => {
    await page.goto(`/#/ai-impact/autofix?projectId=${OSAC}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const flightctlRows = await page.locator('text=/EDM-\\d+/').count();
    expect(flightctlRows).toBe(0);
  });

  test('Documentation surface fills for Flight Control from design-docs artifacts', async ({ page }) => {
    let docsStatus = null;
    let docsBody = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/modules/ai-impact/project-design-docs')) {
        docsStatus = response.status();
        try { docsBody = await response.json(); } catch { /* binary */ }
      }
    });

    await page.goto(`/#/ai-impact/documentation?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(docsStatus).toBe(200);
    expect(docsBody?.projectId).toBe(FLIGHTCTL);
    expect(docsBody?.state).toBe('supported');
  });

  test('switching OSAC -> flightctl re-fetches every screen with the right projectId', async ({ page }) => {
    const seen = {};
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/modules/releases/registry')) {
        try { seen.registry = await response.json(); } catch { /* binary */ }
      }
    });

    await page.goto(`/#/releases/schedule?projectId=${OSAC}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
    expect(seen.registry?.projectId).toBe(OSAC);

    const selector = page.locator('#project-selector');
    await selector.selectOption(FLIGHTCTL);
    await page.waitForTimeout(800);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toContain(`projectId=${FLIGHTCTL}`);
    expect(seen.registry?.projectId).toBe(FLIGHTCTL);
    expect((seen.registry?.releases || []).some((r) => String(r.id || '').startsWith('flightctl-'))).toBe(true);
  });
});
