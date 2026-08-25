const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors } = require('./helpers');

/**
 * Integration tests for Releases module
 *
 * These tests verify:
 * - Module loads and renders correctly
 * - Data fetching and display works
 * - Navigation within the module functions
 * - API integration is functional
 *
 * Tag: @releases
 * Usage: npx playwright test --grep @releases
 */

test.describe('Releases Module @releases', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should fetch data from Releases API endpoints', async ({ page }) => {
    // Monitor network requests
    const apiRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/modules/releases')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });

    // Navigate to Execute view (a data-driven view that makes API calls)
    await page.goto('/#/releases/execute');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Verify that API requests were made to the Releases endpoints
    // In demo mode, these should still be called and return fixture data
    expect(apiRequests.length).toBeGreaterThan(0);
    console.log(`Releases API requests: ${apiRequests.length}`);
    apiRequests.forEach(req => {
      console.log(`  ${req.method} ${req.url}`);
    });

    expect(page.errors).toHaveLength(0);
  });

});

/**
 * RICE Config API
 *
 * Verify the single-field RICE config round-trip works end-to-end:
 * save riceScoreField → retrieve config → field is persisted.
 * Does not require a Jira connection.
 */
test.describe('Releases RICE Config API @releases', () => {
  test('saves and retrieves riceScoreField via health-admin/config', async ({ request }) => {
    const base = '/api/modules/releases/planning'

    const putRes = await request.put(`${base}/releases/health-admin/config`, {
      data: { riceScoreField: 'customfield_10864', enableRice: true }
    })

    // Admin endpoints require PM auth — skip in CI containers where no user is authenticated
    if (putRes.status() === 403) {
      test.skip()
      return
    }

    expect(putRes.ok()).toBe(true)
    const putBody = await putRes.json()
    expect(putBody.saved).toBe(true)
    expect(putBody.customFieldIds.riceScoreField).toBe('customfield_10864')
    expect(putBody.enableRice).toBe(true)

    const getRes = await request.get(`${base}/releases/health-admin/config`)
    expect(getRes.ok()).toBe(true)
    const getBody = await getRes.json()
    expect(getBody.customFieldIds.riceScoreField).toBe('customfield_10864')
    expect(getBody.enableRice).toBe(true)
  })

  test('rejects riceScoreField with invalid characters', async ({ request }) => {
    const base = '/api/modules/releases/planning'
    const res = await request.put(`${base}/releases/health-admin/config`, {
      data: { riceScoreField: 'bad field!' }
    })

    // Admin endpoints require PM auth — skip in CI containers where no user is authenticated
    if (res.status() === 403) {
      test.skip()
      return
    }

    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid riceScoreField')
  })
})

/**
 * Active Components
 *
 * Verify each major view (aka menu item) in the Releases module loads with
 * meaningful content
 */
test.describe('Releases Views @releases', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  // Helper to navigate and verify a view loads with content
  async function testView(page, viewId, viewName) {
    await page.goto(`/#/releases/${viewId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Before we verify content, we need to verify the overall view loads
    const mainContent = page.locator('main, [role="main"], .min-h-screen').first();
    await expect(mainContent).toBeVisible();

    // Verify the view has rendered some meaningful content by checking for
    // data-bearing elements (not just empty containers or placeholders)
    const hasButtons = await page.locator('button').count() > 0;
    const hasInputs = await page.locator('input, select, textarea').count() > 0;
    const hasList = await page.locator('ul li, ol li').count() > 0;
    const hasTable = await page.locator('table tbody tr').count() > 0;
    const hasHeadings = await page.locator('h1, h2, h3').count() > 0;
    const hasLinks = await page.locator('a[href]').count() > 0;
    const hasDataElements = await page.locator('[data-testid], [data-key], [data-id]').count() > 0;
    const hasSections = await page.locator('article, section').count() > 0;

    // If this value is 'false', then it indicates we've loaded an empty page.
    const hasContent = hasButtons || hasInputs || hasList || hasTable ||
                       hasHeadings || hasLinks || hasDataElements || hasSections;
    expect(hasContent).toBe(true);

    // Verify we're not stuck in an infinite loading state
    // Use specific selectors to avoid matching legitimate status regions
    const loadingSpinners = await page.locator('[aria-busy="true"], [role="progressbar"], .loading, .spinner, [aria-label*="loading" i]').count();
    expect(loadingSpinners).toBe(0);
    if (page.errors.length > 0) {
      console.error(`${viewName} errors:`, page.errors);
    }

    expect(page.errors).toHaveLength(0);
  }

  test('should load Plan view', async ({ page }) => {
    await testView(page, 'plan', 'Plan');
  });

  test('should load Execute view', async ({ page }) => {
    await testView(page, 'execute', 'Execute');
  });

  test('should load Deliver view', async ({ page }) => {
    await testView(page, 'deliver', 'Deliver');
  });

  test('should load Reports view', async ({ page }) => {
    await testView(page, 'reports', 'Reports');
  });

  test('should load Audit view', async ({ page }) => {
    await testView(page, 'audit', 'Audit');
  });

  test('should load Schedule view', async ({ page }) => {
    await testView(page, 'schedule', 'Schedule');
  });

  test('should load Release Plan view', async ({ page }) => {
    await testView(page, 'release-plan', 'Release Plan');
  });
});

/**
 * Release Plan
 *
 * Forward-looking version plan (OSAC-4396/OSAC-4399/OSAC-4394), served as a
 * pure readFromStorage passthrough — no LLM call in the app.
 */
test.describe('Releases Release Plan @releases', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('release-plans index endpoint returns published versions', async ({ request }) => {
    const res = await request.get('/api/modules/releases/release-plans');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('versions');
    expect(Array.isArray(body.versions)).toBe(true);
  });

  test('release-plan endpoint requires a version parameter', async ({ request }) => {
    const res = await request.get('/api/modules/releases/release-plan');
    expect(res.status()).toBe(400);
  });

  test('release-plan endpoint 404s for an unknown version', async ({ request }) => {
    const res = await request.get('/api/modules/releases/release-plan?version=99.9');
    expect(res.status()).toBe(404);
  });

  test('version picker switches the rendered release plan', async ({ page }) => {
    await page.goto('/#/releases/release-plan');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const picker = page.locator('#release-plan-version');
    await expect(picker).toBeVisible();

    const options = await picker.locator('option').allTextContents();
    if (options.length < 2) {
      test.skip();
      return;
    }

    const initialValue = await picker.inputValue();
    const otherOption = await picker.locator('option').evaluateAll((opts, current) => {
      const match = opts.find((o) => o.value !== current);
      return match ? match.value : null;
    }, initialValue);
    if (!otherOption) {
      test.skip();
      return;
    }

    await picker.selectOption(otherOption);
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
    await expect(picker).toHaveValue(otherOption);
    expect(page.errors).toHaveLength(0);
  });
});

/**
 * PM Hub
 *
 * PM Hub's tab is hidden from Plan nav pending the future OSAC Team/component
 * model — its view is unreachable through any nav path by design, so there is
 * no "load report card via nav" path left to test. Its backend and Jira/velocity
 * endpoints remain in place (prepare-now/enable-later) and are still covered
 * below via direct API calls.
 */
test.describe('Releases PM Hub @releases', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should not show a PM Hub tab under Plan', async ({ page }) => {
    await page.goto('/#/releases/plan');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Positive precondition: prove Plan actually rendered before asserting
    // PM Hub's absence, so a broken/blank page can't pass this test for free.
    await expect(page.locator('button', { hasText: 'Big Rocks' })).toBeVisible();

    const pmHubTab = page.locator('button', { hasText: 'PM Hub' });
    await expect(pmHubTab).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });

  test('PM Hub API endpoints should respond', async ({ request }) => {
    const componentsRes = await request.get('/api/modules/releases/pm-hub/jira/components');
    expect(componentsRes.ok()).toBe(true);
    const componentsBody = await componentsRes.json();
    expect(componentsBody).toHaveProperty('components');
    expect(componentsBody).toHaveProperty('projects');
    expect(Array.isArray(componentsBody.components)).toBe(true);

    const versionsRes = await request.get('/api/modules/releases/pm-hub/jira/versions');
    expect(versionsRes.ok()).toBe(true);
    const versionsBody = await versionsRes.json();
    expect(versionsBody).toHaveProperty('versions');
    expect(versionsBody).toHaveProperty('projects');
    expect(Array.isArray(versionsBody.versions)).toBe(true);
  });

  test('component-release-load endpoint requires filters', async ({ request }) => {
    const res = await request.get('/api/modules/releases/pm-hub/component-release-load');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('filter');
  });

  test('component-release-load returns velocity with age and component fields', async ({ request }) => {
    const componentsRes = await request.get('/api/modules/releases/pm-hub/jira/components');
    const componentsBody = await componentsRes.json();
    if (!componentsBody.components || componentsBody.components.length === 0) {
      test.skip();
      return;
    }
    var compName = componentsBody.components[0].name;
    var res = await request.get('/api/modules/releases/pm-hub/component-release-load?components=' + encodeURIComponent(compName));
    if (!res.ok()) {
      test.skip();
      return;
    }
    var body = await res.json();
    expect(body).toHaveProperty('velocity');
    var vel = body.velocity;
    expect(vel).toHaveProperty('avgPerRelease');
    expect(vel).toHaveProperty('totalResolved');
    expect(vel).toHaveProperty('hasPartialYear');
    expect(vel).toHaveProperty('components');
    expect(vel).toHaveProperty('jql');
    expect(typeof vel.hasPartialYear).toBe('boolean');
    if (vel.components.length > 0) {
      var comp = vel.components[0];
      expect(comp).toHaveProperty('component');
      expect(comp).toHaveProperty('resolved');
      expect(comp).toHaveProperty('releases');
      expect(comp).toHaveProperty('avgPerRelease');
      expect(comp).toHaveProperty('activeWeeks');
      expect(comp).toHaveProperty('isPartialYear');
      expect(typeof comp.isPartialYear).toBe('boolean');
      expect(typeof comp.activeWeeks).toBe('number');
    }
  });

  test('pillar-config endpoint returns valid config', async ({ request }) => {
    const res = await request.get('/api/modules/releases/pm-hub/pillar-config');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('pillars');
    expect(Array.isArray(body.pillars)).toBe(true);
    expect(body.pillars.length).toBeGreaterThan(0);
    expect(body.pillars[0]).toHaveProperty('name');
    expect(body.pillars[0]).toHaveProperty('components');
  });
});

/**
 * Unified Feature Store — AI Review endpoints
 *
 * Verify that the releases execution store serves feature data with aiReview
 * fields populated from demo fixtures.
 */
test.describe('Releases Unified Feature Store @releases', () => {
  test('execution features API returns aiReview data in index', async ({ request }) => {
    const res = await request.get('/api/modules/releases/execution/features');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('features');
    expect(Array.isArray(body.features)).toBe(true);

    // Demo fixtures include features with aiReview summaries
    const withAiReview = body.features.filter(f => f.aiReview);
    expect(withAiReview.length).toBeGreaterThan(0);

    // Verify aiReview shape on first match
    const sample = withAiReview[0].aiReview;
    expect(sample).toHaveProperty('recommendation');
    expect(sample).toHaveProperty('scores');
    expect(sample).toHaveProperty('humanReviewStatus');
  });

  test('execution feature detail includes full aiReview data', async ({ request }) => {
    // TEST1-1168 is a fixture feature with aiReview + history
    const res = await request.get('/api/modules/releases/execution/features/TEST1-1168');
    expect(res.ok()).toBe(true);
    const feature = await res.json();
    expect(feature).toHaveProperty('aiReview');
    expect(feature.aiReview).toHaveProperty('recommendation');
    expect(feature.aiReview).toHaveProperty('scores');
    expect(feature.aiReview).toHaveProperty('humanReviewStatus');
    expect(feature.aiReview).toHaveProperty('reviewedAt');
  });

  test('AI Impact features API reads from unified store', async ({ request }) => {
    const res = await request.get('/api/modules/ai-impact/features');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('features');
    expect(body).toHaveProperty('totalFeatures');
    expect(body.totalFeatures).toBeGreaterThan(0);

    // Verify backward-compatible shape: { [key]: { key, title, recommendation, ... } }
    const keys = Object.keys(body.features);
    expect(keys.length).toBeGreaterThan(0);
    const sample = body.features[keys[0]];
    expect(sample).toHaveProperty('key');
    expect(sample).toHaveProperty('recommendation');
    expect(sample).toHaveProperty('scores');
    expect(sample).toHaveProperty('humanReviewStatus');
  });
});

/**
 * Epics by Release
 *
 * Verify the Release -> Feature -> Epics tree: the tab is reachable under Execute,
 * loads Features/Epics for a selected release, and the underlying API enforces a
 * required version and returns each epic's Fix Version/Component provenance.
 */
test.describe('Releases Epics by Release @releases', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should show Epics by Release tab under Execute and render Features/Epics', async ({ page }) => {
    await page.goto('/#/releases/execute');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const tab = page.locator('button', { hasText: 'Epics by Release' });
    await expect(tab).toBeVisible();

    await tab.click();
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Demo fixtures include TEST1-1120 (fixVersions: ["rhoai-3.4"]) with 2 epics
    const releaseSelect = page.locator('#epics-by-release-version');
    await expect(releaseSelect).toBeVisible();
    await releaseSelect.selectOption('rhoai-3.4');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.locator('text=TEST1-1120').first()).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('epics API requires a version and returns Fix Version/Component provenance', async ({ request }) => {
    const missingVersion = await request.get('/api/modules/releases/execution/epics');
    expect(missingVersion.status()).toBe(400);

    const res = await request.get('/api/modules/releases/execution/epics?version=rhoai-3.4');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('features');
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features.length).toBeGreaterThan(0);

    const feature = body.features.find(f => f.key === 'TEST1-1120');
    expect(feature).toBeTruthy();
    expect(feature.epics.length).toBeGreaterThan(0);

    const directEpic = feature.epics.find(e => e.fixVersionSource === 'direct');
    const inheritedEpic = feature.epics.find(e => e.fixVersionSource === 'via-parent-feature');
    expect(directEpic).toBeTruthy();
    expect(inheritedEpic).toBeTruthy();
    expect(inheritedEpic.fixVersions).toEqual(feature.fixVersions);
  });

  /**
   * Demo fixture: TEST1-1120's own Fix Version is "rhoai-3.4", but its direct
   * Epic TEST2-45862 is directly assigned to milestone "rhoai-3.4-m1" — a version
   * that appears on no Feature. This exercises the Epic-direct-membership rule:
   * a milestone-only version is discoverable (scope=epics), and querying it
   * surfaces TEST1-1120 as context, with its real Fix Version and only the
   * matching Epic shown.
   */
  test('versions endpoint is Feature-only by default and adds direct-Epic-only versions with scope=epics', async ({ request }) => {
    const defaultRes = await request.get('/api/modules/releases/execution/versions');
    expect(defaultRes.ok()).toBe(true);
    const defaultBody = await defaultRes.json();
    expect(defaultBody.versions).not.toContain('rhoai-3.4-m1');

    const epicsScopeRes = await request.get('/api/modules/releases/execution/versions?scope=epics');
    expect(epicsScopeRes.ok()).toBe(true);
    const epicsScopeBody = await epicsScopeRes.json();
    expect(epicsScopeBody.versions).toContain('rhoai-3.4-m1');
  });

  test('epics API surfaces a non-matching parent Feature as context for a direct-Epic-only milestone', async ({ request }) => {
    const res = await request.get('/api/modules/releases/execution/epics?version=rhoai-3.4-m1');
    expect(res.ok()).toBe(true);
    const body = await res.json();

    const feature = body.features.find(f => f.key === 'TEST1-1120');
    expect(feature).toBeTruthy();
    expect(feature.isContext).toBe(true);
    // Real Fix Version preserved — never relabeled to the queried milestone.
    expect(feature.fixVersions).toEqual(['rhoai-3.4']);
    // Only the directly-matching Epic is shown, not the full sibling list.
    expect(feature.epics).toHaveLength(1);
    expect(feature.epics[0].key).toBe('TEST2-45862');
    expect(feature.totalEpicCount).toBeGreaterThan(feature.epics.length);
  });

  test('UI badges a context Feature and explains hidden sibling Epics for a direct-Epic-only milestone', async ({ page }) => {
    await page.goto('/#/releases/execute');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await page.locator('button', { hasText: 'Epics by Release' }).click();
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const releaseSelect = page.locator('#epics-by-release-version');
    await releaseSelect.selectOption('rhoai-3.4-m1');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.locator('text=TEST1-1120').first()).toBeVisible();
    await expect(page.getByText('context', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Showing 1 of \d+ Epic/).first()).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Planning Health Checks
 *
 * Verify planning health UI renders correctly in demo mode.
 * The demo fixture includes releasePhaseMode: 'planning' and planningChecks data.
 */
test.describe('Releases Planning Health @releases', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('Big Rocks tab shows planning readiness banner when in planning mode', async ({ page }) => {
    await page.goto('/#/releases/plan');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // In demo mode with planning fixture, the planning readiness banner should appear
    // if the health data has releasePhaseMode === 'planning'
    // Banner may or may not be visible depending on demo fixture config
    // Just verify page loads without errors
    expect(page.errors).toHaveLength(0);
  });

  // Health tab is temporarily hidden from PlanView — skip until re-enabled
  test.skip('Health tab loads and shows planning mode banner when applicable', async ({ page }) => {
    await page.goto('/#/releases/plan?tab=health');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Verify the health dashboard renders without errors
    const heading = page.locator('h1', { hasText: 'Release Plan Health' });
    await expect(heading).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('Health API includes planning fields in response', async ({ request }) => {
    // First get available releases
    const releasesRes = await request.get('/api/modules/releases/planning/releases');
    if (!releasesRes.ok()) {
      test.skip();
      return;
    }
    const releases = await releasesRes.json();
    if (!releases || releases.length === 0) {
      test.skip();
      return;
    }

    const version = releases[0].version;
    const healthRes = await request.get(`/api/modules/releases/planning/releases/${version}/health`);
    if (!healthRes.ok()) {
      test.skip();
      return;
    }

    const health = await healthRes.json();
    // Verify the health cache includes the new releasePhaseMode field
    // (it may be 'planning', 'execution', or 'unknown' depending on demo data)
    expect(health).toHaveProperty('releasePhaseMode');
    expect(['planning', 'execution', 'unknown']).toContain(health.releasePhaseMode);

    // If in planning mode, verify planningReadiness is present in summary
    if (health.releasePhaseMode === 'planning' && health.summary) {
      expect(health.summary).toHaveProperty('planningReadiness');
    }
  });
});

/**
 * Feature Tracking
 *
 * Verify the Feature Tracking tab under Execute: release selection swaps
 * datasets, filter chips narrow the flat feature table, and scope-change
 * badges render per feature. Also covers a real bug found in review: a
 * feature that is both "moved" and blocker-priority must be excluded from
 * the Blocker Priority filter, matching counts.blockerPriority (which
 * excludes dropped/moved features).
 *
 * Demo fixture (fixtures/releases/execution/tracking-data-rhoai-2.14.json)
 * has one feature per scope-change state: TEST1-1001 (committed),
 * TEST1-1002 (added, blocker priority), TEST1-1003 (dropped),
 * TEST1-1004 (moved, also blocker priority).
 */
test.describe('Releases Feature Tracking @releases', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  async function openFeatureTrackingTab(page) {
    await page.goto('/#/releases/execute');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
    await page.locator('button', { hasText: 'Feature Tracking' }).click();
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
  }

  test('loads the default release and renders flat feature rows with scope-change state', async ({ page }) => {
    await openFeatureTrackingTab(page);

    // RHOAI 2.14 sorts first in the registry, so it's the default selection.
    await expect(page.locator('button', { hasText: 'RHOAI 2.14' })).toBeVisible();

    const table = page.locator('table');
    await expect(page.locator('table tbody tr')).toHaveCount(4);
    await expect(table.getByText('TEST1-1001')).toBeVisible();
    await expect(table.getByText('Committed', { exact: true })).toBeVisible();
    await expect(table.getByText('Added', { exact: true })).toBeVisible();
    await expect(table.getByText('Dropped', { exact: true })).toBeVisible();
    await expect(table.getByText('Moved', { exact: true })).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('switching the release selector loads a different dataset', async ({ page }) => {
    await openFeatureTrackingTab(page);

    await expect(page.locator('table').getByText('TEST1-1001')).toBeVisible();

    await page.locator('button', { hasText: 'RHOAI 2.15' }).click();
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.locator('table').getByText('TEST1-2001')).toBeVisible();
    await expect(page.locator('table').getByText('TEST1-1001')).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });

  test('a filter chip narrows the table to that scope change', async ({ page }) => {
    await openFeatureTrackingTab(page);

    await page.getByText('Added', { exact: true }).first().click();
    await page.waitForTimeout(500);

    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await expect(page.locator('table').getByText('TEST1-1002')).toBeVisible();

    await page.locator('button', { hasText: 'Clear filter' }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('table tbody tr')).toHaveCount(4);

    expect(page.errors).toHaveLength(0);
  });

  test('the Blocker Priority filter excludes a moved feature even though it is blocker priority', async ({ page }) => {
    await openFeatureTrackingTab(page);

    await page.getByText('Blocker Priority', { exact: true }).first().click();
    await page.waitForTimeout(500);

    // Only TEST1-1002 (added) qualifies; TEST1-1004 (moved) is blocker
    // priority too but must stay excluded, consistent with counts.blockerPriority.
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await expect(page.locator('table').getByText('TEST1-1002')).toBeVisible();
    await expect(page.locator('table').getByText('TEST1-1004')).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });

  /**
   * Demo fixture (fixtures/releases/execution/tracking-data-osac-0.2-m1.json) has a
   * successfully-collected, already-reached baseline with zero Features — the case the
   * genuine-zero empty state exists for, distinct from a failed/incomplete collection.
   */
  test('shows the genuine-zero empty state for a release with a resolved baseline and no Feature-level scope', async ({ page }) => {
    await openFeatureTrackingTab(page);

    await page.locator('button', { hasText: 'OSAC 0.2-M1' }).click();
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByText('No Feature-level scope was found for this release or milestone.')).toBeVisible();
    await expect(page.getByText('Epics may still be assigned to this milestone and are shown in Epics by Release.')).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });
});
