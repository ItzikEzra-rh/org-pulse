const { test, expect } = require('@playwright/test');
const { once } = require('node:events');
const { createAutofixSnapshotFixture, blockedIssue } = require('../helpers/autofix-snapshot');

test('AutoFix shows a newly published blocked issue without restarting its backend @ai-impact', async ({ page }) => {
  const fixture = createAutofixSnapshotFixture();
  const server = fixture.app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const apiUrl = `http://127.0.0.1:${server.address().port}/api/modules/ai-impact/autofix-data`;
    const now = Date.now();
    const previousFetchedAt = new Date(now - 2 * 86400000).toISOString();
    const currentFetchedAt = new Date(now - 3600000).toISOString();
    const lastSuccessfulRunAt = new Date(now).toISOString();
    fixture.publish({ fetchedAt: previousFetchedAt, issues: [] });

    // Forward to the real module route backed by temporary JSON files. This is
    // not a canned API response: both requests use the same registered backend.
    await page.route('**/api/modules/ai-impact/autofix-data**', async route => {
      const query = new URL(route.request().url()).search;
      const response = await route.fetch({ url: apiUrl + query });
      await route.fulfill({ response });
    });
    await page.goto('/#/ai-impact/autofix?projectId=osac');
    await page.locator('select').filter({ has: page.locator('option[value="week"]') }).selectOption('week');
    await expect(page.getByRole('row').filter({ hasText: 'OSAC-6214' })).toHaveCount(0);

    fixture.publish({
      fetchedAt: currentFetchedAt,
      issues: [blockedIssue(new Date(now - 4 * 86400000).toISOString())]
    });
    fixture.publishStatus({ schemaVersion: 1, status: 'success', lastSuccessfulRunAt, contentChanged: false },
      { schemaVersion: 1, revision: 'b'.repeat(40), lastSuccessfulSyncAt: lastSuccessfulRunAt });
    const responsePromise = page.waitForResponse(response => response.url().includes('/api/modules/ai-impact/autofix-data'));
    await page.reload();
    const payload = await (await responsePromise).json();
    expect(payload.fetchedAt).toBe(currentFetchedAt);
    expect(payload.issues).toEqual([expect.objectContaining({ key: 'OSAC-6214', pipelineState: 'autofix-blocked' })]);
    await page.locator('select').filter({ has: page.locator('option[value="week"]') }).selectOption('week');
    const row = page.getByRole('row').filter({ hasText: 'OSAC-6214' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('AI Blocked');
    await expect(page.getByText(/Last collection.*No issue changes/)).toBeVisible();
    const weekResponse = await page.request.get(apiUrl + '?projectId=osac&timeWindow=week');
    expect((await weekResponse.json()).metrics).toMatchObject({ windowTotal: 1, autofixStates: { blocked: 1 } });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    fixture.cleanup();
  }
});
