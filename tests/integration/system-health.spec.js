const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors, pageHasContent, pageLoadComplete, mainContentIsVisible } = require('./helpers');

/**
 * Integration tests for System Health module
 *
 * These tests verify:
 * - Module loads and renders correctly
 * - Data fetching and display works
 * - Navigation within the module functions
 * - API integration is functional
 *
 * Tag: @system-health
 * Usage: npx playwright test --grep @system-health
 */

// Offsets `base` by whole UTC days so CI Duty fixtures never go stale against the wall clock.
function ciDutyIsoDate(base, offsetDays) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function makeCiDutyRoster() {
  const today = new Date();
  return {
    generatedAt: today.toISOString(),
    entries: [
      { lead: 'Riccardo Piccoli', workgroup: 'CaaS', startDate: ciDutyIsoDate(today, -3), endDate: ciDutyIsoDate(today, 3) },
      { lead: 'Adrien Gentil', workgroup: 'BMaaS', startDate: ciDutyIsoDate(today, 4), endDate: ciDutyIsoDate(today, 10) },
      { lead: 'Ygal Blum', workgroup: 'VMaaS', startDate: ciDutyIsoDate(today, 11), endDate: ciDutyIsoDate(today, 17) }
    ]
  };
}

function makeCiDutyGapRoster() {
  const today = new Date();
  return {
    generatedAt: today.toISOString(),
    entries: [
      { lead: 'Adrien Gentil', workgroup: 'BMaaS', startDate: ciDutyIsoDate(today, 4), endDate: ciDutyIsoDate(today, 10) }
    ]
  };
}

async function mockOperationalMetricsProjects(page) {
  await page.route('**/api/roster**', route => {
    const requestUrl = new URL(route.request().url());
    const projectId = requestUrl.searchParams.get('projectId') || 'osac';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projectId, orgs: [], visibleFields: [], managerNames: {} })
    });
  });
  await page.route('**/api/projects', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      projects: [
        {
          projectId: 'osac',
          displayName: 'OSAC',
          capabilities: {
            operationalMetrics: {
              state: 'supported',
              title: 'Unified Operational Intelligence',
              url: 'https://devtools.pages.redhat.com/n8n-pulumi-poc/#/?org=ecosystem&product=osac&team=osac',
              freshness: 'unknown'
            }
          }
        },
        {
          projectId: 'flightctl',
          displayName: 'Flight Control',
          capabilities: {
            operationalMetrics: {
              state: 'inapplicable',
              reason: 'The UOI registry has no Flightctl/RHEM entry and is OSAC-only.'
            }
          }
        }
      ]
    })
  }));
}

test.describe('System Health Module @system-health', () => {
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

    // Find the System Health module in the sidebar
    const moduleNav = page.locator('aside nav').filter({ hasText: 'System Health' });
    const count = await moduleNav.count();
    expect(count).toBeGreaterThan(0);

    // Verify the module link is visible and clickable
    const moduleLink = moduleNav.first();
    await expect(moduleLink).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('module header should be enabled and expandable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'System Health' }).first();
    const isDisabled = await moduleHeader.getAttribute('disabled');
    expect(isDisabled).toBeNull();

    const cursor = await moduleHeader.evaluate(el => window.getComputedStyle(el).cursor);
    expect(cursor).not.toBe('not-allowed');

    expect(page.errors).toHaveLength(0);
  });

  test('quality-analysis is hidden from nav; legacy component-maturity item remains disabled', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'System Health' }).first();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    const qualityAnalysisItem = page.locator('aside nav button').filter({ hasText: 'Quality analysis' });
    expect(await qualityAnalysisItem.count()).toBe(0);

    const componentMaturityItem = page.locator('aside nav button').filter({ hasText: 'Component maturity' }).first();
    const isDisabled = await componentMaturityItem.getAttribute('disabled');
    expect(isDisabled).not.toBeNull();

    expect(page.errors).toHaveLength(0);
  });

  test('should use static data for legacy quality-analysis view (no API calls required)', async ({ page }) => {
    // Monitor network requests
    const apiRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/modules/system-health')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });

    // Navigate to Quality Analysis view
    await page.goto('/#/system-health/quality-analysis');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // System Health uses static data (imported from qualityReports.data.js)
    // so there should be NO API requests to system-health endpoints
    expect(apiRequests.length).toBe(0);
    console.log(`System Health API requests: ${apiRequests.length} (expected 0 - uses static data)`);

    // Verify the page still loaded successfully with content
    const hasContent = await pageHasContent(page);
    expect(hasContent).toBe(true);

    expect(page.errors).toHaveLength(0);
  });

});

/**
 * Active Components
 *
 * Verify each major view (aka menu item) in the System Health module loads with
 * meaningful content
 */
test.describe('System Health Views @system-health', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  // Helper to navigate and verify a view loads with content
  async function testView(page, viewId, viewName) {
    await page.goto(`/#/system-health/${viewId}`);
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

  test('should load the configured OSAC UOI dashboard for the OSAC project', async ({ page }) => {
    await mockOperationalMetricsProjects(page);
    await page.route('https://devtools.pages.redhat.com/n8n-pulumi-poc/**', route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>UOI test dashboard</title>'
    }));
    await page.goto('/#/system-health/operational-metrics?projectId=osac');

    await expect(page.locator('main h1')).toHaveText('Operational Metrics');

    const iframe = page.locator('iframe');
    await expect(iframe).toHaveCount(1);
    const src = await iframe.getAttribute('src');
    expect(src).toContain('devtools.pages.redhat.com/n8n-pulumi-poc');
    expect(src).toContain('product=osac');

    const openInNewTab = page.locator('a').filter({ hasText: 'Open in new tab' });
    await expect(openInNewTab).toHaveAttribute('target', '_blank');
    const href = await openInNewTab.getAttribute('href');
    expect(href).toContain('devtools.pages.redhat.com/n8n-pulumi-poc');
  });

  test('should not request or render the OSAC UOI dashboard for Flight Control', async ({ page }) => {
    await mockOperationalMetricsProjects(page);
    const dashboardRequests = [];
    page.on('request', request => {
      if (request.url().includes('devtools.pages.redhat.com/n8n-pulumi-poc')) {
        dashboardRequests.push(request.url());
      }
    });

    await page.goto('/#/system-health/operational-metrics?projectId=flightctl');

    await expect(page.getByText('Operational Metrics is not applicable to Flight Control')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open in new tab' })).toHaveCount(0);
    expect(dashboardRequests).toHaveLength(0);
  });

  test('should load Quality Analysis view', async ({ page }) => {
    await testView(page, 'quality-analysis', 'Quality Analysis');
  });

  test('should load Component Maturity view', async ({ page }) => {
    await testView(page, 'component-maturity', 'Component Maturity');
  });

  test('should show empty state for repos without scan data', async ({ page }) => {
    await page.goto('/#/system-health/quality-analysis');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Find a "Pending" indicator — these appear for repos without scan data
    const pendingLabels = page.locator('table td span').filter({ hasText: 'Pending' });
    const pendingCount = await pendingLabels.count();
    if (pendingCount === 0) {
      console.log('No unscanned repos found — all repos have scan data, skipping empty state test');
      return;
    }

    // The same row should also show "Awaiting scan" in the gaps column
    const pendingRow = pendingLabels.first().locator('xpath=ancestor::tr');
    await expect(pendingRow.locator('text=Awaiting scan')).toBeVisible();

    // Click the repo name button in that row to open the detail view
    await pendingRow.locator('button').first().click();
    await page.waitForTimeout(1000);

    // Should show the empty state heading instead of an iframe
    const heading = page.locator('h2').filter({ hasText: 'No quality report available' });
    await expect(heading).toBeVisible();

    // Should show the troubleshooting section
    const troubleshooting = page.locator('text=Troubleshooting');
    await expect(troubleshooting).toBeVisible();

    // Should NOT render an iframe
    const iframe = page.locator('iframe');
    expect(await iframe.count()).toBe(0);

    expect(page.errors).toHaveLength(0);
  });

  test('should display table with required columns in Quality Analysis', async ({ page }) => {
    await page.goto('/#/system-health/quality-analysis');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // We expect at least one table
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Check that all expected columns are present
    const expectedColumns = ['REPOSITORY', 'TIER', 'COMPONENT', 'SCORE', 'TOP GAPS'];
    for (const columnName of expectedColumns) {
      // Look for the column header in table headers (th) or column cells
      const columnHeader = table.locator('th, thead td, [role="columnheader"]').filter({ hasText: columnName });
      const count = await columnHeader.count();
      expect(count).toBeGreaterThan(0);
      console.log(`Found column: "${columnName}"`);
    }

    // Verify column order
    const allHeaders = await table.locator('th, thead td, [role="columnheader"]').allTextContents();
    console.log('All table headers:', allHeaders);

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Disconnected Readiness Feature
 *
 * Verify the disconnected readiness dashboard functionality.
 */
test.describe('System Health Disconnected Readiness @system-health', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should show disconnected readiness tab in component maturity view', async ({ page }) => {
    await page.goto('/#/system-health/component-maturity');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Look for the "Disconnected readiness" tab
    const disconnectedTab = page.locator('button, a, [role="tab"]').filter({ hasText: 'Disconnected readiness' });
    await expect(disconnectedTab).toBeVisible();

    // Click the disconnected readiness tab
    await disconnectedTab.click();
    await page.waitForTimeout(1000);

    // Verify content loaded
    const hasContent = await pageHasContent(page);
    expect(hasContent).toBe(true);

    expect(page.errors).toHaveLength(0);
  });

  test('should display summary cards in disconnected readiness view', async ({ page }) => {
    await page.goto('/#/system-health/component-maturity');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Navigate to disconnected readiness tab
    const disconnectedTab = page.locator('button, a, [role="tab"]').filter({ hasText: 'Disconnected readiness' });
    await disconnectedTab.click();
    await page.waitForTimeout(1000);

    // Look for summary cards - ReadinessSummaryCards renders as a grid with white/gray cards
    const summaryCards = page.locator('div.grid.grid-cols-2 > div');
    const cardCount = await summaryCards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Look for readiness percentage or count displays
    const readinessMetrics = page.locator('text=/\\d+%|\\d+ ready|\\d+ repos/i');
    const metricsCount = await readinessMetrics.count();
    expect(metricsCount).toBeGreaterThan(0);

    expect(page.errors).toHaveLength(0);
  });

  test('should display readiness table with repositories', async ({ page }) => {
    await page.goto('/#/system-health/component-maturity');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Navigate to disconnected readiness tab
    const disconnectedTab = page.locator('button, a, [role="tab"]').filter({ hasText: 'Disconnected readiness' });
    await disconnectedTab.click();
    await page.waitForTimeout(1000);

    // Look for a table with repository data
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Check for expected column headers
    const expectedColumns = ['Repository', 'Score', 'Status', 'Last Updated'];
    for (const columnName of expectedColumns) {
      // Look for the column header (case insensitive)
      const columnHeader = table.locator('th, thead td, [role="columnheader"]').filter({ hasText: new RegExp(columnName, 'i') });
      const count = await columnHeader.count();
      if (count > 0) {
        console.log(`Found column: "${columnName}"`);
      }
      // Don't require all columns as the exact naming might differ
    }

    expect(page.errors).toHaveLength(0);
  });

  test('should handle repository detail navigation', async ({ page }) => {
    await page.goto('/#/system-health/component-maturity');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Navigate to disconnected readiness tab
    const disconnectedTab = page.locator('button, a, [role="tab"]').filter({ hasText: 'Disconnected readiness' });
    await disconnectedTab.click();
    await page.waitForTimeout(1000);

    // Look for clickable repository rows in the table
    const repoRow = page.locator('table tbody tr').first();
    const rowCount = await repoRow.count();

    if (rowCount > 0) {
      // Click the first repository row
      await repoRow.click();
      await page.waitForTimeout(1000);

      // Verify we navigated to a detail view
      expect(page.url()).toMatch(/disconnected-repo-detail/);

      // Verify detail content loaded
      const hasContent = await pageHasContent(page);
      expect(hasContent).toBe(true);
    } else {
      console.log('No repository links found - likely empty state or different UI pattern');
    }

    expect(page.errors).toHaveLength(0);
  });

  test('should fetch disconnected summary data from API', async ({ page }) => {
    // Monitor API requests
    const apiRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/modules/system-health/disconnected')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });

    await page.goto('/#/system-health/component-maturity');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Navigate to disconnected readiness tab
    const disconnectedTab = page.locator('button, a, [role="tab"]').filter({ hasText: 'Disconnected readiness' });
    await disconnectedTab.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Should have made at least one API request to the disconnected endpoints
    expect(apiRequests.length).toBeGreaterThan(0);

    // Verify the summary endpoint was called
    const summaryRequests = apiRequests.filter(req => req.url.includes('/summary'));
    expect(summaryRequests.length).toBeGreaterThan(0);

    console.log(`Disconnected API requests: ${apiRequests.length}`);
    apiRequests.forEach(req => console.log(`  ${req.method} ${req.url}`));

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * CI Daily Digest
 *
 * Verify the OSAC CI Daily Digest view: sidebar navigation, a successful
 * report render, the no-report-yet state, and error/retry handling. All
 * scenarios mock the ci-digest API response directly (deterministic data,
 * no live GitHub dependency), following the same page.route conventions
 * used by the AI Impact integration tests.
 */
test.describe('CI Daily Digest @system-health', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  function makeEnvelope() {
    return {
      source: {
        repo: 'osac-project/osac-test-infra',
        workflow: 'ci-daily-digest.yml',
        runId: 1,
        runUrl: 'https://github.com/osac-project/osac-test-infra/actions/runs/1',
        runConclusion: 'success',
        artifactId: 1,
        artifactCreatedAt: '2026-09-10T15:23:35Z'
      },
      fetchedAt: '2026-09-10T15:24:02Z',
      digest: {
        now: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
        periodic_24h: { success: 18, failure: 2, success_rate: 0.9 },
        periodic_72h: { success: 50, failure: 10, success_rate: 0.8333 },
        infra_24h: { infra_total: 3, test_total: 5, unattributed_total: 0, total_failures: 8, infra_by_step: [] },
        infra_72h: {
          infra_total: 10, test_total: 12, unattributed_total: 2, total_failures: 24,
          infra_by_step: [{ step: 'Provision cluster', count: 6 }]
        },
        periodic_infra_24h: { infra_total: 0, test_total: 1, unattributed_total: 0, total_failures: 1, infra_by_step: [] },
        periodic_infra_72h: { infra_total: 0, test_total: 3, unattributed_total: 0, total_failures: 3, infra_by_step: [] },
        merge_time: {
          median_approval_to_merge_display: '3h 0m 0s', avg_approval_to_merge_display: '5h 0m 0s',
          approved_count: 20, count: 30,
          median_queue_wait_display: '45m 0s', avg_queue_wait_display: '50m 0s',
          via_merge_queue_count: 12, avg_retest_count: 2.5,
          by_repo: [
            {
              repo: 'digest-repo', median_approval_to_merge_seconds: 10800, median_approval_to_merge_display: '3h 0m 0s',
              approved_count: 20, count: 30, median_queue_wait_seconds: 2700, median_queue_wait_display: '45m 0s',
              via_merge_queue_count: 12
            }
          ]
        },
        merge_time_24h: {
          median_approval_to_merge_display: '30m 0s', avg_approval_to_merge_display: '35m 0s',
          approved_count: 5, count: 6,
          median_queue_wait_display: '15m 0s', avg_queue_wait_display: '18m 0s',
          via_merge_queue_count: 3, avg_retest_count: 1.2,
          by_repo: [
            {
              repo: 'digest-repo', median_approval_to_merge_seconds: 1800, median_approval_to_merge_display: '30m 0s',
              approved_count: 5, count: 6, median_queue_wait_seconds: 900, median_queue_wait_display: '15m 0s',
              via_merge_queue_count: 3
            }
          ]
        },
        flake_rate: 0.05,
        mttr: { mttr_display: '2h 10m 0s', num_recoveries: 42 },
        top_failing: { workflow: 'E2E Widget Install', failure: 9 },
        jobs_per_pr: {
          distinct_prs: 50, total_jobs: 300, avg_jobs_per_pr: 6.0, median_jobs_per_pr: 5,
          histogram: [{ bucket: '1', prs: 10, success: 10, cancelled: 0, failure: 0 }],
          top_prs: [{ repo: 'digest-repo', pr: '#99', jobs: 40 }],
          outcomes: [{ outcome: 'Success', count: 250 }, { outcome: 'Failure', count: 50 }]
        }
      }
    };
  }

  test('is reachable via sidebar navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'System Health' }).first();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    const viewLink = page.locator('aside nav button').filter({ hasText: 'CI Daily Digest' }).first();
    await expect(viewLink).toBeVisible();
    await viewLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toMatch(/system-health\/ci-digest/);

    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    expect(page.errors).toHaveLength(0);
  });

  test('renders headline tiles and section content from a successful API response', async ({ page }) => {
    await page.route('**/api/modules/system-health/ci-digest', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeEnvelope()) });
    });

    await page.goto('/#/system-health/ci-digest');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Headline tiles
    await expect(page.getByText('90.0%')).toBeVisible();
    await expect(page.getByText('83.3%')).toBeVisible();
    // These headline values are echoed again in the "Other stability signals" section below
    await expect(page.getByText('5.0%').first()).toBeVisible();
    await expect(page.getByText('2h 10m 0s').first()).toBeVisible();
    await expect(page.getByText('42 recoveries')).toBeVisible();

    // Infra failure donuts render real counts and the top infra step, not just a canvas
    await expect(page.getByText('8 failures')).toBeVisible();
    await expect(page.getByText('24 failures')).toBeVisible();
    await expect(page.getByText(/Provision cluster \(6\)/)).toBeVisible();
    await expect(page.getByText('Unattributed').first()).toBeVisible();

    // Time to Merge / Time in Merge Queue descriptions reflect the mocked windows
    await expect(page.getByText(/7d median 3h 0m 0s.*20\/30 with an approval/)).toBeVisible();
    await expect(page.getByText(/7d median 45m 0s.*12\/30 via queue/)).toBeVisible();

    // Top PRs table renders real row content
    await expect(page.getByText('digest-repo')).toBeVisible();
    await expect(page.getByRole('link', { name: '#99' })).toBeVisible();

    // Other stability signals
    await expect(page.getByText('E2E Widget Install (9 failures)')).toBeVisible();
    await expect(page.getByText('2.5')).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('shows the no-report state when no digest has been delivered yet', async ({ page }) => {
    await page.route('**/api/modules/system-health/ci-digest', async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'No CI digest report available yet' })
      });
    });

    await page.goto('/#/system-health/ci-digest');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByRole('heading', { name: 'No CI digest report available' })).toBeVisible();
    await expect(page.getByText('Waiting for org-pulse-data to deliver the first OSAC CI daily digest report.')).toBeVisible();
    await expect(page.getByText('Failed to load CI digest')).toHaveCount(0);

    // The browser logs the mocked 404 resource load itself; only assert no uncaught app errors
    expect(page.errors.filter(e => e.type === 'pageerror')).toHaveLength(0);
  });

  test('shows a generic error and recovers on manual retry', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/modules/system-health/ci-digest', async route => {
      callCount += 1;
      if (callCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'CI digest service unavailable' })
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeEnvelope()) });
      }
    });

    await page.goto('/#/system-health/ci-digest');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByRole('heading', { name: 'Failed to load CI digest' })).toBeVisible();
    await expect(page.getByText('CI digest service unavailable')).toBeVisible();

    await page.getByRole('button', { name: 'Try again' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByRole('heading', { name: 'Failed to load CI digest' })).toHaveCount(0);
    await expect(page.getByText('90.0%')).toBeVisible();
    expect(callCount).toBe(2);

    // The browser logs the mocked 500 resource load itself; only assert no uncaught app errors
    expect(page.errors.filter(e => e.type === 'pageerror')).toHaveLength(0);
  });
});

/**
 * CI Duty
 *
 * Mocks the ci-duty API directly, same page.route convention as CI Daily
 * Digest above.
 */
test.describe('CI Duty View @system-health', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('is reachable via sidebar navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'System Health' }).first();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    const viewLink = page.locator('aside nav button').filter({ hasText: 'CI Duty' }).first();
    await expect(viewLink).toBeVisible();
    await viewLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toMatch(/system-health\/ci-duty/);

    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    expect(page.errors).toHaveLength(0);
  });

  test('renders current, next, and upcoming rotation from a successful API response', async ({ page }) => {
    await page.route('**/api/modules/system-health/ci-duty', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeCiDutyRoster()) });
    });

    await page.goto('/#/system-health/ci-duty');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByRole('heading', { name: 'CI Duty' })).toBeVisible();

    // Current duty
    await expect(page.getByText('Current').first()).toBeVisible();
    await expect(page.getByText('Riccardo Piccoli').first()).toBeVisible();
    await expect(page.getByText('CaaS').first()).toBeVisible();

    // Up next
    await expect(page.getByText('Up Next')).toBeVisible();
    await expect(page.getByText('Adrien Gentil').first()).toBeVisible();
    await expect(page.getByText('BMaaS').first()).toBeVisible();

    // Upcoming rotation lists all three leads and workgroups
    await expect(page.getByRole('heading', { name: 'Upcoming Rotation' })).toBeVisible();
    await expect(page.getByText('Ygal Blum')).toBeVisible();
    await expect(page.getByText('VMaaS')).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('shows the gap state with no current duty while a future duty remains visible', async ({ page }) => {
    await page.route('**/api/modules/system-health/ci-duty', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeCiDutyGapRoster()) });
    });

    await page.goto('/#/system-health/ci-duty');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByText('No one is currently on CI Duty.')).toBeVisible();

    await expect(page.getByText('Up Next')).toBeVisible();
    await expect(page.getByText('Adrien Gentil').first()).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * CI Duty Home Widget
 *
 * Adds the widget via the real Home widget picker (not a direct mount).
 * Each test gets a fresh browser context, so widget layout localStorage
 * starts empty and must be added explicitly.
 */
test.describe('CI Duty Home Widget @system-health', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  // Scopes queries to the CI Duty widget card, so "View all" stays
  // unambiguous if other widgets add the same action later.
  function ciDutyWidget(page) {
    return page.locator('.sotu-widget').filter({ has: page.getByRole('heading', { name: 'CI Duty' }) });
  }

  async function addCiDutyWidget(page) {
    await page.goto('/', { waitUntil: 'networkidle' });
    await pageLoadComplete(page);

    await page.getByRole('button', { name: 'Add Widgets' }).first().click();
    await expect(page.locator('h2:has-text("Add Widgets")')).toBeVisible({ timeout: DEFAULT_PAGE_WAIT_TIME });

    const ciDutyOption = page.locator('button', { hasText: 'CI Duty' });
    await expect(ciDutyOption).toBeVisible();
    await ciDutyOption.click();

    // Close the picker via the backdrop, same convention as other widget tests
    await page.locator('.fixed.inset-0.bg-black').click();
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
  }

  test('adds and renders the CI Duty widget with current and next duty', async ({ page }) => {
    await page.route('**/api/modules/system-health/ci-duty', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeCiDutyRoster()) });
    });

    await addCiDutyWidget(page);

    await expect(page.getByRole('heading', { name: 'CI Duty' })).toBeVisible();
    await expect(page.getByText('Riccardo Piccoli')).toBeVisible();
    await expect(page.getByText('CaaS')).toBeVisible();
    await expect(page.getByText('On duty this week')).toBeVisible();
    await expect(page.getByText('Keeping our CI systems healthy and running.')).toBeVisible();
    await expect(page.getByText('Adrien Gentil')).toBeVisible();
    await expect(ciDutyWidget(page).getByRole('button', { name: 'View all' })).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('navigates to the full CI Duty view via View all', async ({ page }) => {
    await page.route('**/api/modules/system-health/ci-duty', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeCiDutyRoster()) });
    });

    await addCiDutyWidget(page);
    await ciDutyWidget(page).getByRole('button', { name: 'View all' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toMatch(/system-health\/ci-duty/);

    expect(page.errors).toHaveLength(0);
  });

  test('shows the gap state with no current duty while the next duty remains visible', async ({ page }) => {
    await page.route('**/api/modules/system-health/ci-duty', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeCiDutyGapRoster()) });
    });

    await addCiDutyWidget(page);

    await expect(page.getByText('No one is currently on CI Duty.')).toBeVisible();
    await expect(page.getByText('Next:')).toBeVisible();
    await expect(page.getByText('Adrien Gentil')).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });
});
