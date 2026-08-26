const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors, pageHasContent, pageLoadComplete, mainContentIsVisible } = require('./helpers');

/**
 * Integration tests for AI Impact module
 *
 * These tests verify:
 * - Module loads and renders correctly
 * - Data fetching and display works
 * - Navigation within the module functions
 * - API integration is functional
 *
 * Tag: @ai-impact
 * Usage: npx playwright test --grep @ai-impact
 */

test.describe('AI Impact Module @ai-impact', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should fetch data from AI Impact API endpoints', async ({ page }) => {
    // Monitor network requests
    const apiRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/modules/ai-impact')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });

    // Navigate to PRD Review (a data-driven view that makes API calls)
    // The default landing page (AI Factory Guide) is static and has no API calls
    await page.goto('/#/ai-impact/prd-review');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Verify that API requests were made to the AI Impact endpoints
    // In demo mode, these should still be called and return fixture data
    expect(apiRequests.length).toBeGreaterThan(0);
    console.log(`AI Impact API requests: ${apiRequests.length}`);
    apiRequests.forEach(req => {
      console.log(`  ${req.method} ${req.url}`);
    });

    expect(page.errors).toHaveLength(0);
  });

});

/**
 * Disabled Menu Items
 * 
 * Verify that disabled components display as non-clickable, disabled (aka 
 * "greyed out") options.
 */
test.describe('AI Impact Disabled Menu Items @ai-impact', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  // Helper to test a disabled menu item
  async function testDisabledMenuItem(page, itemLabel) {
    await page.goto('/#/ai-impact/ai-factory-guide');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Find the disabled item in the navigation by its title (display text)
    // Navigation items are rendered as buttons in the sidebar
    const navItem = page.locator('aside nav button').filter({ hasText: itemLabel });
    const count = await navItem.count();
    expect(count).toBeGreaterThan(0);
    const disabledItem = navItem.first();

    // Verify it's disabled (check for disabled attribute, aria-disabled, or
    // opacity/cursor styling)
    const isAriaDisabled = await disabledItem.getAttribute('aria-disabled');
    const hasDisabledClass = await disabledItem.evaluate(el => {
      const classes = el.className || '';
      // Common patterns for disabled items: opacity, cursor, pointer-events
      return classes.includes('disabled') ||
             classes.includes('opacity-') ||
             window.getComputedStyle(el).cursor === 'not-allowed' ||
             window.getComputedStyle(el).pointerEvents === 'none';
    });

    // At least one disabled indicator should be present
    const isDisabled = isAriaDisabled === 'true' || hasDisabledClass;
    expect(isDisabled).toBe(true);

    // Verify it's truly non-interactive by attempting to click
    // and ensure navigation doesn't occur
    const urlBeforeClick = page.url();
    await disabledItem.click({ force: true }).catch(() => {
      // Click might fail if pointer-events: none, that's expected
    });
    await page.waitForTimeout(500);

    // Verify the URL hasn't changed (i.e., no navigation occurred)
    const urlAfterClick = page.url();
    expect(urlAfterClick).toBe(urlBeforeClick);

    expect(page.errors).toHaveLength(0);
  }

  test('Implementation menu item should be disabled', async ({ page }) => {
    await testDisabledMenuItem(page, 'Implementation');
  });

  test('Security Review menu item should be disabled', async ({ page }) => {
    await testDisabledMenuItem(page, 'Security Review');
  });

  test('Documentation menu item should be disabled', async ({ page }) => {
    await testDisabledMenuItem(page, 'Documentation');
  });

  test('Build & Release menu item should be disabled', async ({ page }) => {
    await testDisabledMenuItem(page, 'Build & Release');
  });

});

/**
 * Active Components
 * 
 * Verify each major view (aka menu item) in the AI Impact module loads with
 * meaningful content
 */
test.describe('AI Impact Views @ai-impact', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  // Helper to navigate and verify a view loads with content
  async function testView(page, viewId, viewName) {
    await page.goto(`/#/ai-impact/${viewId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Before we verify content, we need to verify the overall view loads
    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    // Verify the view has rendered some meaningful content by checking for
    // data-bearing elements (not just empty containers or placeholders)
    const hasContent = await pageHasContent(page);
    expect(hasContent).toBe(true);

    // Verify we're not stuck in an infinite loading state
    const pageHasFinishedLoading = await pageLoadComplete(page);
    expect(pageHasFinishedLoading).toBe(true);
    if (page.errors.length > 0) {
      console.error(`${viewName} errors:`, page.errors);
    }

    expect(page.errors).toHaveLength(0);
  }

  test('should load AI Factory Guide view', async ({ page }) => {
    await testView(page, 'ai-factory-guide', 'AI Factory Guide');
  });

  test('should load PRD Review view', async ({ page }) => {
    await testView(page, 'prd-review', 'PRD Review');
  });

  test('should load Design Review view', async ({ page }) => {
    await testView(page, 'design-review', 'Design Review');
  });

  test('PRD Review shows Review Status filter and Signed Off metric', async ({ page }) => {
    await page.goto('/#/ai-impact/prd-review');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const reviewStatusFilter = page.locator('select').filter({ hasText: 'All Review Status' });
    await expect(reviewStatusFilter).toBeVisible();
    await expect(reviewStatusFilter.locator('option')).toHaveText(['All Review Status', 'Approved', 'Awaiting Sign-off']);

    await expect(page.getByText('Signed Off')).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('PRD Review shows the PRD List header and AI provenance badges above the title', async ({ page }) => {
    await page.goto('/#/ai-impact/prd-review');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByText('PRD List')).toBeVisible();
    // Demo fixtures include PRDs in every AI-involvement state
    await expect(page.getByText('AI Created', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('AI Review', { exact: true }).first()).toBeVisible();

    // "PR Status" (raw Jira/PR status) is distinct from "Review Status" (human sign-off)
    const prStatusFilter = page.locator('select').filter({ hasText: 'All PR Statuses' });
    await expect(prStatusFilter).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('Design Review shows a Design List header and page title, matching PRD Review', async ({ page }) => {
    await page.goto('/#/ai-impact/design-review');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByRole('heading', { name: 'Design Review', exact: true })).toBeVisible();
    await expect(page.getByText('Design List')).toBeVisible();

    // Design cards mirror PRD: cards with a design doc carry an AI-provenance pill
    // in the title row (demo fixtures include a scored feature -> "AI Review").
    await expect(page.getByText('AI Review', { exact: true }).first()).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('the no-artifact badge is aligned: "Missing PRD" on PRD, "Missing Design" on Design', async ({ page }) => {
    await page.goto('/#/ai-impact/prd-review');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
    // PRDs with no PR render the "Missing PRD" pill (demo fixtures include these).
    await expect(page.getByText('Missing PRD', { exact: true }).first()).toBeVisible();

    await page.goto('/#/ai-impact/design-review');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
    // Features with no design doc render the mirrored "Missing Design" pill.
    await expect(page.getByText('Missing Design', { exact: true }).first()).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('Design Review view loads data from unified store', async ({ page }) => {
    // Monitor API requests — Design Review reads from ai-impact/features
    // which internally reads from the releases execution store
    const apiResponses = [];
    page.on('response', response => {
      if (response.url().includes('/api/modules/ai-impact/features')) {
        apiResponses.push({
          url: response.url(),
          status: response.status()
        });
      }
    });

    await page.goto('/#/ai-impact/design-review');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Verify the features API was called and returned data
    const featuresResponse = apiResponses.find(r =>
      r.url.endsWith('/features') || r.url.includes('/features?')
    );
    expect(featuresResponse).toBeDefined();
    expect(featuresResponse.status).toBe(200);

    expect(page.errors).toHaveLength(0);
  });

  test('should load Jira AutoFix view', async ({ page }) => {
    await testView(page, 'autofix', 'AutoFix');
  });

  test('autofix bar Jira links use classified issue keys', async ({ page }) => {
    // Demo fixtures are dated April 2026 and fall outside every Autofix time
    // window, so Ready for AI never renders from live API data. Seed a
    // current-window payload so this test always checks the JQL contract.
    const created = new Date().toISOString();
    await page.route('**/api/modules/ai-impact/autofix-data**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fetchedAt: created,
          jiraHost: 'https://redhat.atlassian.net',
          metrics: {
            triageTotal: 2,
            triageVerdicts: {
              ready: 1, missingInfo: 0, notFixable: 0, stale: 1, pending: 0,
              external: 0, securityReview: 0, humanAssigned: 0
            },
            autofixStates: {
              ready: 1, pending: 0, review: 0, ciFailing: 0, merged: 0,
              rejected: 0, maxRetries: 0, blocked: 0, forkUserMissing: 0
            },
            autofixTotal: 1,
            successRate: 0,
            windowTotal: 2,
            totalIssues: 2,
            eligibleCount: 1,
            eligibilityRate: 50
          },
          trendData: [],
          issues: [
            {
              key: 'OSAC-READY', summary: 'queued', status: 'New', issueType: 'Bug',
              priority: 'Normal', created, updated: created, components: [],
              assignee: null, pipelineState: 'autofix-ready'
            },
            {
              key: 'OSAC-STALE', summary: 'stale leftover jira-autofix', status: 'New',
              issueType: 'Bug', priority: 'Normal', created, updated: created,
              components: [], assignee: null, pipelineState: 'triage-stale'
            }
          ]
        })
      });
    });

    await page.goto('/#/ai-impact/autofix');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const readyRow = page.locator('div.flex.items-center.justify-between').filter({
      has: page.locator('span.text-sm', { hasText: /^Ready for AI$/ })
    });
    await expect(readyRow).toHaveCount(1);
    const href = await readyRow.locator('a[href*="jql"]').first().getAttribute('href');
    expect(href).toBeTruthy();
    const jql = decodeURIComponent(href);
    expect(jql).toContain('key IN (');
    expect(jql).toContain('OSAC-READY');
    expect(jql).not.toContain('OSAC-STALE');
    expect(jql).not.toContain('assignee is EMPTY');

    expect(page.errors).toHaveLength(0);
  });

  test('should load AI Commits view', async ({ page }) => {
    await page.goto('/#/ai-impact/ai-commits');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    const iframe = page.locator('iframe[title="AI Commits Scanner — OSAC"]');
    await expect(iframe).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('AI Commits proxy endpoint responds', async ({ page }) => {
    const response = await page.request.get('/api/modules/ai-impact/ai-commits-proxy', {
      maxRedirects: 0
    });
    const status = response.status();
    if (status === 200) {
      expect(response.headers()['content-type']).toContain('text/html');
      const body = await response.text();
      expect(body).toContain('AI Commit Scanner');
      expect(body).not.toContain('rh-ecosystem-edge');
    } else {
      expect(status).toBe(302);
    }
  });

  test('should load State of the Union on landing page', async ({ page }) => {
    // SOTU content now lives on the landing page (home), not as an AI Impact nav item
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    // The SOTU heading should be visible on the landing page
    const sotuHeading = page.locator('text=State of the Union');
    const isVisible = await sotuHeading.isVisible().catch(() => false);
    expect(isVisible).toBe(true);

    expect(page.errors).toHaveLength(0);
  });

  test('should redirect legacy SOTU hash to home', async ({ page }) => {
    await page.goto('/#/ai-impact/state-of-the-union');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Should redirect to home (root hash)
    const url = page.url();
    expect(url).toMatch(/\/#?\/?$/);

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * AI Impact Tools guide modal
 *
 * Verify the "AI Impact Tools" popup describes the OSAC PRD/design/enablement
 * process (OSAC-3117), not the legacy opendatahub RFE workflow.
 */
test.describe('AI Impact Tools guide modal @ai-impact', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  // Open a view that mounts the guide, then ensure the modal is showing.
  // The guide auto-opens on first visit (empty localStorage); fall back to the
  // floating "AI Impact Guide" button if it is not already visible.
  async function openGuideModal(page) {
    await page.goto('/#/ai-impact/prd-review');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const heading = page.getByRole('heading', { name: 'AI Impact Tools' });
    if (!(await heading.isVisible().catch(() => false))) {
      await page.locator('button').filter({ hasText: 'AI Impact Guide' }).first().click();
    }
    await expect(heading).toBeVisible();
    // Scope all assertions to the modal so we never match the sidebar nav
    return page.locator('.max-w-2xl').filter({ hasText: 'AI Impact Tools' });
  }

  test('PRD Scoring tab shows OSAC PRD criteria', async ({ page }) => {
    const modal = await openGuideModal(page);
    await modal.getByRole('button', { name: 'PRD Scoring' }).click();

    await expect(modal.getByText('User-Facing Focus')).toBeVisible();
    await expect(modal.getByText('Right-Sized')).toBeVisible();
    await expect(modal.getByText(/7\/10/)).toBeVisible();
    await expect(modal.getByText('/prd-review')).toBeVisible();
    // Legacy opendatahub tooling should be gone
    await expect(modal.getByText('assess-rfe')).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });

  test('Design Review tab shows OSAC design criteria', async ({ page }) => {
    const modal = await openGuideModal(page);
    await modal.getByRole('button', { name: 'Design Review' }).click();

    await expect(modal.getByText('Architecture')).toBeVisible();
    await expect(modal.getByText('ep-review').first()).toBeVisible();
    await expect(modal.getByText(/5\/8/).first()).toBeVisible();
    // Legacy strat-creator tooling should be gone
    await expect(modal.getByText('strat.create')).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });

  test('Test Plan Review tab shows OSAC scoring criteria', async ({ page }) => {
    const modal = await openGuideModal(page);
    await modal.getByRole('button', { name: 'Test Plan Review' }).click();

    await expect(modal.getByText('Specificity')).toBeVisible();
    await expect(modal.getByText('Scope Fidelity')).toBeVisible();
    await expect(modal.getByText('/decompose').first()).toBeVisible();
    await expect(modal.getByText('test-plan-review').first()).toBeVisible();
    // Legacy opendatahub tooling should be gone
    await expect(modal.getByText('odh-test-gen')).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });

  test('Enablement tab shows OSAC Agentic SDLC resources', async ({ page }) => {
    const modal = await openGuideModal(page);
    await modal.getByRole('button', { name: 'Enablement' }).click();

    await expect(modal.getByRole('heading', { name: 'OSAC Agentic SDLC', exact: true })).toBeVisible();
    await expect(modal.getByText('/implement')).toBeVisible();
    await expect(
      modal.getByRole('link', { name: 'Agentic SDLC Presentation' })
    ).toHaveAttribute(
      'href',
      /osac-project\.github\.io\/osac-workspace\/presentations\/ai-assisted-sdlc\.html/
    );

    expect(page.errors).toHaveLength(0);
  });
});
