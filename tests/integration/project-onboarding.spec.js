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

  test('AI pipeline screens serve the truthful unavailable envelope for Flight Control, never OSAC rows', async ({ page }) => {
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
    expect(rfeBody?.state).toBe('unavailable');
    expect(rfeBody?.reason).toBe('osac-only-data-source');
    expect(rfeBody?.data).toBeNull();

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
    await moduleHeader.click({ force: true });
    await page.waitForTimeout(600);

    const viewLink = page.locator('aside nav button').filter({ hasText: /^People$/ }).first();
    if (await viewLink.count()) {
      await viewLink.click({ force: true });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
      expect(page.url()).toContain(`projectId=${FLIGHTCTL}`);
    } else {
      // Expanded nav renders links, not buttons
      const navLink = page.locator('aside nav a').filter({ hasText: /^People$/ }).first();
      await navLink.click({ force: true });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
      expect(page.url()).toContain(`projectId=${FLIGHTCTL}`);
    }
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
