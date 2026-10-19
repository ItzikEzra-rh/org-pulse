const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors, pageHasContent, pageLoadComplete, mainContentIsVisible, countDisabledNavItems } = require('./helpers');

/**
 * Integration tests for People & Teams module
 *
 * These tests verify:
 * - Module loads and renders correctly
 * - Data fetching and display works
 * - Navigation within the module functions
 * - API integration is functional
 *
 * Tag: @people-teams
 * Usage: npx playwright test --grep @people-teams
 */

test.describe('People & Teams Module @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should be visible in sidebar navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Find the People & Teams module in the sidebar
    const moduleNav = page.locator('aside nav').filter({ hasText: 'People & Teams' });
    const count = await moduleNav.count();
    expect(count).toBeGreaterThan(0);

    // Verify the module link is visible and clickable
    const moduleLink = moduleNav.first();
    await expect(moduleLink).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('should navigate to People & Teams module when clicked', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Expand the People & Teams module section if it's collapsed
    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'People & Teams' }).first();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    // Click on the "Team Directory" view (default view)
    const viewLink = page.locator('aside nav button').filter({ hasText: 'Team Directory' }).first();
    await viewLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Verify URL changed to team-tracker module (default view is home)
    expect(page.url()).toMatch(/team-tracker\/home/);

    // Verify main content is visible
    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    expect(page.errors).toHaveLength(0);
  });

  test('should fetch data from People & Teams API endpoints', async ({ page }) => {
    // Monitor network requests
    const apiRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/modules/team-tracker')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });

    // Navigate to Team Directory (makes API calls for teams and people)
    await page.goto('/#/team-tracker/home');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Verify that API requests were made to the team-tracker endpoints
    // In demo mode, these should still be called and return fixture data
    expect(apiRequests.length).toBeGreaterThan(0);
    console.log(`People & Teams API requests: ${apiRequests.length}`);
    apiRequests.forEach(req => {
      console.log(`  ${req.method} ${req.url}`);
    });

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Disabled Menu Items
 *
 * Verify that People & Teams has no disabled menu items in the
 * publicly visible navigation (excluding role-gated items).
 */
test.describe('People & Teams Disabled Menu Items @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should have no disabled menu items', async ({ page }) => {
    await page.goto('/#/team-tracker/home');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Count disabled navigation items within the People & Teams section only
    const disabledCount = await countDisabledNavItems(page, 'People & Teams');

    // People & Teams module should have no disabled menu items
    expect(disabledCount).toBe(0);
    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Hidden Menu Items
 *
 * Manage and Work Allocation are hidden from nav for the broader engineering
 * rollout (see modules/team-tracker/module.json and
 * modules/team-tracker/client/reports/registry.js) — their underlying views
 * remain in place, just unreachable through nav/the Reports catalog.
 */
test.describe('People & Teams Hidden Menu Items @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('Manage is hidden from nav', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'People & Teams' }).first();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    const manageItem = page.locator('aside nav button').filter({ hasText: 'Manage' });
    expect(await manageItem.count()).toBe(0);

    expect(page.errors).toHaveLength(0);
  });

  test('Work Allocation is hidden from the Reports catalog', async ({ page }) => {
    await page.goto('/#/team-tracker/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const allocationCard = page.locator('.cursor-pointer', { hasText: 'Work Allocation' });
    expect(await allocationCard.count()).toBe(0);

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Active Components
 *
 * Verify each major view (aka menu item) in the People & Teams module loads
 * with meaningful content.
 *
 * Note: "My Teams" requires the manager role and is not tested here since
 * demo mode runs unauthenticated. "Manage" is hidden from nav (see the
 * Hidden Menu Items describe block below) and is not part of this loop.
 */
test.describe('People & Teams Views @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  // Helper to navigate and verify a view loads with content
  async function testView(page, viewId, viewName) {
    await page.goto(`/#/team-tracker/${viewId}`);
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

  test('should load Team Directory view', async ({ page }) => {
    await testView(page, 'home', 'Team Directory');
  });

  test('should load People view', async ({ page }) => {
    await testView(page, 'people', 'People');
  });

  test('should load Reports view', async ({ page }) => {
    await testView(page, 'reports', 'Reports');
  });

  test('should load Org Dashboard view', async ({ page }) => {
    await testView(page, 'org-dashboard', 'Org Dashboard');
  });
});

/**
 * People Directory
 *
 * Verify the People Directory view shows roster data from fixtures
 */
test.describe('People & Teams People Directory @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should display people from registry', async ({ page }) => {
    await page.goto('/#/team-tracker/people');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // The people directory should render a list or table of people
    // from the fixture registry (which has 13 people)
    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    // Look for name-bearing elements — the fixture data includes
    // names like "Alice Chen", "Bob Smith", etc.
    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    const hasNames = bodyText.includes('Alice Chen') || bodyText.includes('Bob Smith');
    expect(hasNames).toBe(true);

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Project-qualified People & Teams (OSAC-5968)
 *
 * Verifies the Flight Control project roster renders through the normalized
 * read model, and that OSAC legacy behavior is unaffected.
 */
test.describe('People & Teams Project-Qualified Roster @people-teams', () => {
  const FLIGHTCTL = 'flightctl';

  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('Flight Control People Directory renders project-qualified people and navigates by accountId', async ({ page }) => {
    await page.goto(`/#/team-tracker/people?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(await mainContentIsVisible(page)).toBe(true);
    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Nadia Osei');

    await page.locator('tbody tr', { hasText: 'Nadia Osei' }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toContain('accountId=fc-acc-1');
    expect(page.url()).not.toContain('uid=');

    expect(page.errors).toHaveLength(0);
  });

  test('Flight Control People Directory surfaces published GitHub/GitLab identities without exposing managerRef', async ({ page }) => {
    await page.goto(`/#/team-tracker/people?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    // Fixture: 2 of 3 flightctl people have a matched GitHub identity (nosei, mliu).
    expect(bodyText).toContain('GitHub IDs');
    expect(bodyText).toContain('GitLab IDs');
    expect(bodyText).not.toContain('fc-acc-2');

    expect(page.errors).toHaveLength(0);
  });

  test('Flight Control Team Directory navigates to Team Detail', async ({ page }) => {
    await page.goto(`/#/team-tracker/home?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const teamCard = page.locator('.cursor-pointer', { hasText: 'Flight Control Core' }).first();
    await expect(teamCard).toBeVisible();
    await teamCard.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toMatch(/team-detail/);
    expect(page.url()).toContain(`teamKey=${FLIGHTCTL}`);

    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Flight Control Core');

    expect(page.errors).toHaveLength(0);
  });

  test('project-qualified Person Detail resolves without the legacy OSAC registry/name fallback', async ({ page }) => {
    const registryRequests = [];
    page.on('request', request => {
      if (request.url().includes('/registry/people/')) registryRequests.push(request.url());
    });

    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(await mainContentIsVisible(page)).toBe(true);
    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Nadia Osei');
    expect(bodyText).not.toContain('Person not found');
    expect(registryRequests).toHaveLength(0);

    expect(page.errors).toHaveLength(0);
  });

  test('OSAC legacy People Directory still resolves people by uid', async ({ page }) => {
    await page.goto('/#/team-tracker/people');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText.includes('Alice Chen') || bodyText.includes('Bob Smith')).toBe(true);

    await page.locator('tbody tr').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toMatch(/person-detail/);
    expect(page.url()).toContain('uid=');
    expect(page.url()).not.toContain('accountId=');
  });
});

/**
 * Project-Qualified Jira Person Metrics (OSAC-6322)
 * Verifies the endpoint is wired end to end and never falls back to legacy OSAC metrics.
 */
test.describe('People & Teams Project-Qualified Jira Person Metrics @people-teams', () => {
  const FLIGHTCTL = 'flightctl';

  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('fetches metrics with the correct projectId/accountId and renders the published Jira panels', async ({ page }) => {
    const metricsRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/modules/team-tracker/project-person-metrics')) {
        metricsRequests.push(request.url());
      }
    });

    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(metricsRequests).toHaveLength(1);
    const requestUrl = new URL(metricsRequests[0]);
    expect(requestUrl.searchParams.get('projectId')).toBe(FLIGHTCTL);
    expect(requestUrl.searchParams.get('accountId')).toBe('fc-acc-1');

    // Fixture: fc-acc-1 (Nadia Osei) has 2 resolved issues, 1 in-progress.
    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Resolved Issues');
    expect(bodyText).toContain('FLPATH-101');
    expect(bodyText).toContain('FLPATH-110');

    expect(page.errors).toHaveLength(0);
  });

  test('renders safely when the Jira publication is unavailable, without fabricated counts or console errors', async ({ page }) => {
    await page.route('**/api/modules/team-tracker/project-person-metrics**', route => route.fulfill({
      json: {
        projectId: FLIGHTCTL,
        accountId: 'fc-acc-2',
        availability: 'unavailable',
        reason: 'missing-publication',
        publicationState: null,
        generatedAt: null,
        partial: false,
        metrics: null
      }
    }));

    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-2`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(await mainContentIsVisible(page)).toBe(true);
    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Marco Liu');
    expect(bodyText).not.toContain('Resolved Issues');
    expect(bodyText).not.toContain('Story Points');

    expect(page.errors).toHaveLength(0);
  });

  test('never falls back to the legacy OSAC per-person Jira metrics endpoint', async ({ page }) => {
    const legacyMetricsRequests = [];
    page.on('request', request => {
      if (/\/api\/modules\/team-tracker\/person\/[^/]+\/metrics/.test(request.url())) {
        legacyMetricsRequests.push(request.url());
      }
    });

    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(legacyMetricsRequests).toHaveLength(0);
    expect(page.errors).toHaveLength(0);
  });
});

test.describe('People & Teams Project-Qualified Contributions @people-teams', () => {
  const FLIGHTCTL = 'flightctl';

  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('project-qualified Person Profile loads GitHub contributions from the canonical artifact, attributed by (projectId, accountId)', async ({ page }) => {
    // Fixture: fixtures/projects/flightctl/sources/contributions/registry.json.
    // 214/97 don't appear in the legacy github-contributions.json fixture.
    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    let bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Nadia Osei');
    expect(bodyText).toContain('GitHub Contributions');
    expect(bodyText).toContain('214');

    // A different accountId in the same project attributes its own count, not fc-acc-1's.
    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-2`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Marco Liu');
    expect(bodyText).toContain('97');
    expect(bodyText).not.toContain('214');

    expect(page.errors).toHaveLength(0);
  });

  test('does not fabricate a contribution count for a person with no resolved GitHub identity', async ({ page }) => {
    // Fixture: fc-acc-3 (Priya Shah) has no identities.github entry, so the
    // publication reports her unresolved (github: null), never a zero.
    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-3`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Priya Shah');
    expect(bodyText).not.toContain('214');
    expect(bodyText).not.toContain('97');

    expect(page.errors).toHaveLength(0);
  });

  test('switching the project context resets contributions instead of retaining the prior project\'s data', async ({ page }) => {
    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    let bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('214');

    // Switch projects via the shell's in-app selector: no full page reload.
    const projectSelector = page.locator('#project-selector');
    await expect(projectSelector).toBeVisible();
    await projectSelector.selectOption('osac');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toContain('projectId=osac');
    bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).not.toContain('214');
    expect(bodyText).not.toContain('Nadia Osei');

    expect(page.errors).toHaveLength(0);
  });
});
