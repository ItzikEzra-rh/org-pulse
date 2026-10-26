const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors } = require('./helpers');

/**
 * Integration tests for the Test Coverage module
 *
 * The module is OSAC-only: one sidebar entry named after the module, no nested
 * child repeating the project name, and no OSAC data under another project.
 *
 * Tag: @test-coverage
 * Usage: npx playwright test --grep @test-coverage
 */

const FLIGHTCTL = 'flightctl';

test.describe('Test Coverage @test-coverage', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('renders as a single sidebar entry in the OSAC project', async ({ page }) => {
    await page.goto('/#/test-coverage/coverage?projectId=osac');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByRole('heading', { name: 'Test Coverage' })).toBeVisible();
    await expect(page.locator('aside nav button[aria-label="Test Coverage"]')).toBeVisible();
    await expect(page.locator('aside nav button[aria-label="Coverage"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="empty-state"], table')).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('is hidden outside the OSAC project', async ({ page }) => {
    await page.goto(`/#/test-coverage/coverage?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.locator('aside nav button[aria-label="Test Coverage"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Test Coverage' })).toHaveCount(0);
    expect(page.url()).not.toContain('/test-coverage/');
  });

  test('serves an unavailable envelope to another project', async ({ request }) => {
    const response = await request.get(`/api/modules/test-coverage/latest?projectId=${FLIGHTCTL}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      projectId: FLIGHTCTL,
      state: 'unavailable',
      reason: 'osac-only-data-source',
      data: null
    });
  });
});
