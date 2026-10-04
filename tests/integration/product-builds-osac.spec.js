const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors } = require('./helpers');

/**
 * Integration tests for Product Builds > OSAC
 *
 * Tag: @product-builds-osac
 * Usage: npx playwright test --grep @product-builds-osac
 */

test.describe('Product Builds OSAC @product-builds-osac', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should navigate to OSAC from the Product Builds sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const projectSelector = page.locator('#project-selector');
    if (await projectSelector.count()) {
      await projectSelector.selectOption('osac');
      await page.waitForTimeout(500);
    }

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'Product Builds' }).first();
    await expect(moduleHeader).toBeVisible();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    const osacLink = page.locator('aside nav a, aside nav button').filter({ hasText: 'OSAC' }).first();
    await expect(osacLink).toBeVisible();
    await osacLink.click();
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByRole('heading', { name: 'OSAC' })).toBeVisible();
    expect(page.errors).toHaveLength(0);
  });

  test('should show the latest published build from fixture data', async ({ page }) => {
    await page.goto('/#/product-builds/osac?projectId=osac');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const latestBuildCard = page.getByText('Latest published build').locator('xpath=..');
    await expect(latestBuildCard).toBeVisible();

    const versionHeadline = latestBuildCard.locator('span.text-lg.font-semibold', { hasText: '0.0.10-nightly.2' });
    await expect(versionHeadline).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('should expand a build history entry', async ({ page }) => {
    await page.goto('/#/product-builds/osac?projectId=osac');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const historyEntry = page.getByText('0.0.9').first();
    await expect(historyEntry).toBeVisible();
    await historyEntry.click();
    await page.waitForTimeout(500);

    const runLinks = page.getByRole('link', { name: 'GitHub Actions run' });
    await expect(runLinks).toHaveCount(2);

    expect(page.errors).toHaveLength(0);
  });

  test('does not link to unregistered Product Builds nav items', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'Product Builds' }).first();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    for (const label of ['RHAIIS', 'RHEL AI', 'Base Images', 'Builder Images', 'Wheel Collections', 'Package Analysis']) {
      const legacyLink = page.locator('aside nav a, aside nav button').filter({ hasText: label });
      await expect(legacyLink).toHaveCount(0);
    }
  });
});
