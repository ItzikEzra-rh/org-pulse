const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors, pageHasContent, pageLoadComplete, mainContentIsVisible } = require('./helpers');

/**
 * Integration tests for the Org Pulse Home page
 *
 * These tests verify:
 * - Hero and Explore Org Pulse navigation cards render above the widget dashboard
 * - Home is a single continuous page (no tabs / Browse Modules toggle)
 * - Widget picker opens and lists available widgets
 * - Widgets render content from their respective modules
 * - Navigation from Explore Org Pulse cards works
 *
 * Tag: @sotu-dashboard
 * Usage: npx playwright test --grep @sotu-dashboard
 */

test.describe('Org Pulse Home @sotu-dashboard', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should show the Hero, Explore Org Pulse cards, and Your Overview on one page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await pageLoadComplete(page);

    // Hero
    await expect(page.getByText('WHAT IS ORG PULSE?')).toBeVisible({ timeout: DEFAULT_PAGE_WAIT_TIME });
    await expect(page.getByRole('heading', { name: 'Red Hat Ecosystem Engineering | Edge' })).toBeVisible();
    await expect(page.getByText('Org Pulse brings together people, delivery, engineering, and AI signals to give Edge teams a shared view of what\'s happening and where attention is needed.')).toBeVisible();

    // Explore Org Pulse cards
    await expect(page.getByText('EXPLORE ORG PULSE')).toBeVisible();
    const exploreSection = page.locator('section', { has: page.getByText('EXPLORE ORG PULSE') });
    await expect(exploreSection.getByRole('button', { name: /People & Teams/ })).toBeVisible();
    await expect(exploreSection.getByRole('button', { name: /Releases/ })).toBeVisible();
    await expect(exploreSection.getByRole('button', { name: /AI Impact/ })).toBeVisible();
    await expect(exploreSection.getByRole('button', { name: /System Health/ })).toBeVisible();

    // Your Overview + widget dashboard, on the same page as the Hero/cards above
    await expect(page.getByText('YOUR OVERVIEW')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Widgets' }).first()).toBeVisible();
    await expect(page.locator('h3:has-text("Feature Planning Board")')).toBeVisible({ timeout: DEFAULT_PAGE_WAIT_TIME });
  });

  test('should no longer have a Browse Modules / Back to Overview toggle', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await pageLoadComplete(page);

    await expect(page.getByText('Browse Modules')).toHaveCount(0);
    await expect(page.getByText('Back to Overview')).toHaveCount(0);
  });

  test('should navigate to a module when an enabled Explore Org Pulse card is clicked', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await pageLoadComplete(page);

    const exploreSection = page.locator('section', { has: page.getByText('EXPLORE ORG PULSE') });
    const peopleCard = exploreSection.getByRole('button', { name: /People & Teams/ });
    await expect(peopleCard).toBeEnabled({ timeout: DEFAULT_PAGE_WAIT_TIME });
    await peopleCard.click();

    await expect(page).toHaveURL(/team-tracker/);
  });

  test('should open widget picker when Add Widgets is clicked', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await pageLoadComplete(page);

    // Click Add Widgets
    await page.getByRole('button', { name: 'Add Widgets' }).first().click();

    // Widget picker panel should appear
    await expect(page.locator('h2:has-text("Add Widgets")')).toBeVisible({ timeout: DEFAULT_PAGE_WAIT_TIME });
  });

  test('should render widget content without JS errors', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await pageLoadComplete(page);
    await mainContentIsVisible(page);

    // Page should have substantive content (not just loading spinners)
    const hasContent = await pageHasContent(page);
    expect(hasContent).toBe(true);
  });

  test('should add and render Release Schedule widget', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await pageLoadComplete(page);

    // Open widget picker
    await page.getByRole('button', { name: 'Add Widgets' }).first().click();
    await expect(page.locator('h2:has-text("Add Widgets")')).toBeVisible({ timeout: DEFAULT_PAGE_WAIT_TIME });

    // Find and toggle the Release Schedule widget
    const scheduleWidget = page.locator('button', { hasText: 'Release Schedule' });
    await expect(scheduleWidget).toBeVisible();
    await scheduleWidget.click();

    // Close the picker by clicking the backdrop
    await page.locator('.fixed.inset-0.bg-black').click();
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Widget should render with its heading
    await expect(page.locator('h3:has-text("Release Schedule")')).toBeVisible({ timeout: DEFAULT_PAGE_WAIT_TIME });

    // Should show milestone rows or empty state (not an error)
    const hasMilestones = await page.locator('text=Plan Freeze').or(page.locator('text=Code Freeze')).or(page.locator('text=Release')).count() > 0;
    const hasEmpty = await page.locator('text=No upcoming milestones').count() > 0;
    expect(hasMilestones || hasEmpty).toBe(true);

    expect(page.errors).toHaveLength(0);
  });

  test('should render Feature Planning Board widget by default with Feature-only readiness columns', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await pageLoadComplete(page);

    // Feature Planning Board is a default widget, so it renders without adding it via the picker
    await expect(page.locator('h3:has-text("Feature Planning Board")')).toBeVisible({ timeout: DEFAULT_PAGE_WAIT_TIME });

    // The board is Feature-only: exactly the seven lifecycle columns, no inherited RFE columns
    await expect(page.getByText('PRD Not Started')).toBeVisible();
    await expect(page.getByText('PRD Created')).toBeVisible();
    await expect(page.getByText('PRD Needs Revision')).toBeVisible();
    await expect(page.getByText('Ready for Design')).toBeVisible();
    await expect(page.getByText('Design Needs Revision')).toBeVisible();
    await expect(page.getByText('Awaiting Sign-off')).toBeVisible();
    await expect(page.getByText('Signed Off', { exact: true })).toBeVisible();
    await expect(page.getByText('Not Yet Assessed')).not.toBeVisible();
    await expect(page.getByText('Queued for Feature Creation')).not.toBeVisible();

    expect(page.errors).toHaveLength(0);
  });
});
