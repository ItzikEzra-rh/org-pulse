const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');

/**
 * Bug B reproduction: AI Impact tab-to-tab sidebar navigation loses/corrupts
 * the project context. Claim: after selecting flightctl, clicking Test Plan
 * Review in the sidebar fires ?projectId=osac; clicking PRD Review fires
 * with no projectId at all — while the shell selector still reads flightctl.
 *
 * Usage: BASE_URL=http://host:18081 npx playwright test tests/integration/ai-tab-context.spec.js
 */

const FLIGHTCTL = 'flightctl';

test.describe('AI tab context @ai-tab-context', () => {
  test('sidebar tab navigation keeps the projectId param in AI fetches', async ({ page }) => {
    const aiRequests = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/modules/ai-impact/')) {
        aiRequests.push({ url, projectId: new URL(url).searchParams.get('projectId') });
      }
    });

    await page.goto(`/#/ai-impact/autofix?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Navigate through the module's sidebar tabs the way a user would
    const navButtons = [
      'Design Review',
      'Test Plan Review',
      'PRD Review',
      'Implementation',
    ];
    for (const label of navButtons) {
      const btn = page.locator(`aside nav button, aside nav a`).filter({ hasText: label }).first();
      const count = await btn.count();
      if (count === 0) continue;
      await btn.scrollIntoViewIfNeeded();
      await btn.dispatchEvent('click');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1200);
    }

    // Report every AI fetch that fired with a wrong or missing projectId
    const wrong = aiRequests.filter((r) => r.projectId !== FLIGHTCTL);
    console.log('\n=== AI fetches captured:', aiRequests.length);
    for (const r of aiRequests) {
      console.log(`  projectId=${r.projectId === null ? '(none)' : r.projectId}  ${r.url.replace(/^.*\/api\/modules\//, '')}`);
    }
    console.log(`=== wrong/missing projectId fetches: ${wrong.length}`);

    // The page URL must still carry flightctl
    expect(page.url()).toContain(`projectId=${FLIGHTCTL}`);
    // No AI fetch may fire for another project context
    expect(wrong).toEqual([]);
  });
});
