const { test, expect } = require('@playwright/test');
const { setupErrorTracking, logCapturedErrors } = require('./helpers');

const osacIndex = require('../../fixtures/releases/execution/index.json');
const scopedUiFeature = require('../../fixtures/releases/execution/features/TEST1-9105.json');
const closedViaEpicFeature = require('../../fixtures/releases/execution/features/TEST1-9106.json');

/**
 * Covers Phase 3 (OSAC-6322) end-to-end against the real app: the unified Labels
 * filter (Feature-level, Epic stage/routing, and Epic workflow labels via
 * workflowLabelSources), the single-source-Epic safeguard, scope-aware card labels,
 * Closed Feature visibility via epicReleaseVersions, and Drawer provenance. Unit
 * coverage for the underlying matching/resolution functions lives in
 * useUiUxFilter.test.js; this exercises the same contract through actual filter
 * interactions and rendered output.
 *
 * Tag: @releases
 */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const osacVersions = [...new Set(osacIndex.features.flatMap(f => f.fixVersions || []))].sort();

function installUiUxApi(page) {
  page.route('**/api/**', route => route.fulfill({ json: {} }));
  page.route('**/api/projects', route => route.fulfill({ json: {
    projects: [{ projectId: 'osac', displayName: 'OSAC' }]
  } }));
  page.route('**/api/roster?**', route => {
    const projectId = new URL(route.request().url()).searchParams.get('projectId');
    return route.fulfill({ json: { projectId, availability: 'available', orgs: [], people: [] } });
  });
  page.route('**/api/modules/releases/execution/**', route => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace('/api/modules/releases/execution', '');

    if (pathname === '/features') {
      const features = clone(osacIndex.features);
      return route.fulfill({ json: {
        projectId: 'osac', state: 'supported', freshness: 'fresh', partial: false,
        fetchedAt: osacIndex.fetchedAt, featureCount: features.length,
        totalFeatureCount: features.length, features
      } });
    }

    const detailMatch = pathname.match(/^\/features\/([^/]+)$/);
    if (detailMatch) {
      const key = decodeURIComponent(detailMatch[1]);
      const detail = key === 'TEST1-9105' ? clone(scopedUiFeature)
        : key === 'TEST1-9106' ? clone(closedViaEpicFeature)
        : null;
      return detail
        ? route.fulfill({ json: { ...detail, projectId: 'osac', state: 'supported', detailState: 'supported' } })
        : route.fulfill({ status: 404, json: { error: `Feature ${key} not found` } });
    }

    if (pathname === '/versions') {
      return route.fulfill({ json: { projectId: 'osac', state: 'supported', partial: false, versions: osacVersions } });
    }

    return route.fulfill({ status: 404, json: { projectId: 'osac', error: 'Unknown Execute test endpoint' } });
  });
}

function filterDropdown(page, labelText) {
  return page.locator('div.flex.flex-col.gap-0\\.5', { has: page.locator(`label:text-is("${labelText}")`) });
}

// Scoped to a direct child of .multi-select-dropdown so it only ever matches the trigger,
// never a category-heading button nested inside the (deeper) open options panel.
function triggerButton(dropdown) {
  return dropdown.locator(':scope > div.multi-select-dropdown > button');
}

// Dropdown options don't auto-close on selection; toggling the trigger again closes it so the
// next dropdown's options aren't obscured.
function exactTextRegex(text) {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

// Exact match avoids both "rhoai-3.4" matching "rhoai-3.4.EA2" and the dropdown's
// own trigger button (which echoes the single selected option's label).
async function selectFilterOption(page, labelText, optionText) {
  const dropdown = filterDropdown(page, labelText);
  await triggerButton(dropdown).click();
  await dropdown.locator('label').filter({ hasText: exactTextRegex(optionText) }).click();
  await triggerButton(dropdown).click();
}

async function openFeatureList(page) {
  await page.goto('/#/releases/execute?projectId=osac');
  await page.getByRole('button', { name: 'Feature List', exact: true }).click();
}

function detailButton(page, key) {
  return page.getByRole('button', { name: `Open details for ${key}`, exact: true });
}

// Board-view card container for a Feature; unique once Search narrows to one result.
function cardFor(page, key) {
  return page.locator('div.cursor-pointer.overflow-hidden', { has: detailButton(page, key) });
}

test.describe('Releases Feature List Labels filter @releases', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('renders one unified Labels dropdown with category headings; the old UI/UX status dropdowns and List columns are gone', async ({ page }) => {
    installUiUxApi(page);
    await openFeatureList(page);

    await expect(triggerButton(filterDropdown(page, 'Labels'))).toBeVisible();
    await expect(page.locator('label:text-is("UI status")')).toHaveCount(0);
    await expect(page.locator('label:text-is("UX status")')).toHaveCount(0);

    await triggerButton(filterDropdown(page, 'Labels')).click();
    await expect(page.getByText('UI/UX Workflow', { exact: true })).toBeVisible();
    await triggerButton(filterDropdown(page, 'Labels')).click();

    await page.getByRole('button', { name: 'List', exact: true }).click();
    const headerTexts = await page.locator('thead th').allTextContents();
    expect(headerTexts).not.toContain('UI');
    expect(headerTexts).not.toContain('UX');

    expect(page.errors).toHaveLength(0);
  });

  test('matches an Epic stage label and honors the single-source-Epic safeguard once a Release is folded in', async ({ page }) => {
    installUiUxApi(page);
    await openFeatureList(page);
    await page.getByLabel('Search').fill('TEST1-9105');

    // ui-completed lives only on TEST9-3001, scoped to rhoai-3.4.
    await selectFilterOption(page, 'Labels', 'ui-completed');
    await expect(detailButton(page, 'TEST1-9105')).toBeVisible();

    await selectFilterOption(page, 'Version', 'rhoai-3.4');
    await expect(detailButton(page, 'TEST1-9105')).toBeVisible();

    // Switching to rhoai-3.5 (a different Epic's scope) hides the Feature: Version is
    // folded into the label predicate, bypassing the standalone Version filter.
    await selectFilterOption(page, 'Version', 'rhoai-3.4');
    await selectFilterOption(page, 'Version', 'rhoai-3.5');
    await expect(detailButton(page, 'TEST1-9105')).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });

  test('combines Label + Release + Component on the same Epic, rejecting a cross-Epic match where Component only matches a different Epic', async ({ page }) => {
    installUiUxApi(page);
    await openFeatureList(page);
    await page.getByLabel('Search').fill('TEST1-9105');

    await selectFilterOption(page, 'Labels', 'ui-completed');
    await selectFilterOption(page, 'Version', 'rhoai-3.4');
    await selectFilterOption(page, 'Component', 'Dashboard');
    await expect(detailButton(page, 'TEST1-9105')).toBeVisible();

    // Backend shares TEST9-3001's Release (rhoai-3.4) but only via a different Epic
    // (TEST9-3004, which doesn't carry ui-completed) -- no single Epic satisfies all three.
    await selectFilterOption(page, 'Component', 'Dashboard');
    await selectFilterOption(page, 'Component', 'Backend');
    await expect(detailButton(page, 'TEST1-9105')).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });

  test('matches the design-approved Epic workflow label via workflowLabelSources, scoped to its own Epic release', async ({ page }) => {
    installUiUxApi(page);
    await openFeatureList(page);
    await page.getByLabel('Search').fill('TEST1-9105');

    await selectFilterOption(page, 'Labels', 'design-approved');
    await expect(detailButton(page, 'TEST1-9105')).toBeVisible();

    await selectFilterOption(page, 'Version', 'rhoai-3.4');
    await expect(detailButton(page, 'TEST1-9105')).toBeVisible();

    await selectFilterOption(page, 'Version', 'rhoai-3.4');
    await selectFilterOption(page, 'Version', 'rhoai-3.5');
    await expect(detailButton(page, 'TEST1-9105')).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });

  test('matches the be-completed Epic workflow label via workflowLabelSources, scoped to its own (unclassified) Epic release', async ({ page }) => {
    installUiUxApi(page);
    await openFeatureList(page);
    await page.getByLabel('Search').fill('TEST1-9105');

    await selectFilterOption(page, 'Labels', 'be-completed');
    await selectFilterOption(page, 'Version', 'rhoai-3.5');
    await expect(detailButton(page, 'TEST1-9105')).toBeVisible();

    await selectFilterOption(page, 'Version', 'rhoai-3.5');
    await selectFilterOption(page, 'Version', 'rhoai-3.4');
    await expect(detailButton(page, 'TEST1-9105')).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });

  test('no-ui is filterable but never hides the Feature from the unfiltered list', async ({ page }) => {
    installUiUxApi(page);
    await openFeatureList(page);
    await page.getByLabel('Search').fill('TEST1-9105');

    await expect(detailButton(page, 'TEST1-9105')).toBeVisible();

    await selectFilterOption(page, 'Labels', 'no-ui');
    await expect(detailButton(page, 'TEST1-9105')).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('clears the Labels filter via Clear filters', async ({ page }) => {
    installUiUxApi(page);
    await openFeatureList(page);
    await page.getByLabel('Search').fill('TEST1-9105');

    await selectFilterOption(page, 'Labels', 'be-completed');
    await selectFilterOption(page, 'Version', 'rhoai-3.4');
    await expect(detailButton(page, 'TEST1-9105')).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(detailButton(page, 'TEST1-9105')).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('the Board card shows one compact Labels row prioritizing workflow labels, with an expandable +N', async ({ page }) => {
    installUiUxApi(page);
    await openFeatureList(page);
    await page.getByLabel('Search').fill('TEST1-9105');

    const card = cardFor(page, 'TEST1-9105');
    // Aggregate (no Release/Component selected): ui-completed, no-ui, ux-in-progress,
    // design-approved, be-completed -- 5 labels, so only the first 3 show before expanding.
    await expect(card).toContainText('ui-completed');
    await expect(card).toContainText('no-ui');
    await expect(card).toContainText('ux-in-progress');
    await expect(card).not.toContainText('design-approved');
    await expect(card).not.toContainText('be-completed');

    await card.getByRole('button', { name: 'Show 2 more labels' }).click();
    await expect(card).toContainText('design-approved');
    await expect(card).toContainText('be-completed');
    await expect(card.getByRole('button', { name: 'Show fewer labels' })).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('the Board card Labels row is scope-aware to the selected Release', async ({ page }) => {
    installUiUxApi(page);
    await openFeatureList(page);
    await page.getByLabel('Search').fill('TEST1-9105');

    const card = cardFor(page, 'TEST1-9105');

    // TEST9-3001 (ui-completed) and TEST9-3000 (design-approved) are scoped to
    // rhoai-3.4; TEST9-3002 (no-ui) and TEST9-3003 (be-completed) are scoped to
    // rhoai-3.5 -- only the matching pair shows once a Release is selected.
    await selectFilterOption(page, 'Version', 'rhoai-3.4');
    await expect(card).toContainText('ui-completed');
    await expect(card).toContainText('design-approved');
    await expect(card).not.toContainText('no-ui');
    await expect(card).not.toContainText('be-completed');

    await selectFilterOption(page, 'Version', 'rhoai-3.4');
    await selectFilterOption(page, 'Version', 'rhoai-3.5');
    await expect(card).not.toContainText('ui-completed');
    await expect(card).not.toContainText('design-approved');
    await expect(card).toContainText('no-ui');
    await expect(card).toContainText('be-completed');

    expect(page.errors).toHaveLength(0);
  });

  test('reveals a Closed Feature via epicReleaseVersions only once its Release is selected', async ({ page }) => {
    installUiUxApi(page);
    await openFeatureList(page);
    await page.getByLabel('Search').fill('TEST1-9106');

    await expect(detailButton(page, 'TEST1-9106')).toHaveCount(0);

    await selectFilterOption(page, 'Version', 'rhoai-3.0');
    await expect(detailButton(page, 'TEST1-9106')).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('shows per-source Epic provenance and the highlighted matching scope in the Drawer', async ({ page }) => {
    installUiUxApi(page);
    await openFeatureList(page);
    await page.getByLabel('Search').fill('TEST1-9105');
    await selectFilterOption(page, 'Version', 'rhoai-3.4');

    await detailButton(page, 'TEST1-9105').click();
    const drawer = page.getByRole('dialog', { name: 'Feature details for TEST1-9105' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('UI/UX Evidence', { exact: true })).toBeVisible();
    await expect(drawer).toContainText('TEST9-3001');
    await expect(drawer).toContainText('ui-completed');
    await expect(drawer).toContainText('label:ui-completed');

    expect(page.errors).toHaveLength(0);
  });
});
