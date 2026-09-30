const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const base = process.env.BASE_URL;
  await page.goto(base + '/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  console.log('URL after goto /:', page.url());
  console.log('hash:', await page.evaluate(() => window.location.hash));
  const sel = page.locator('#project-selector');
  console.log('selector count:', await sel.count());
  if (await sel.count()) {
    console.log('options:', await sel.locator('option').allTextContents());
    await sel.selectOption('flightctl');
    await page.waitForTimeout(1000);
    console.log('URL after select:', page.url());
    console.log('hash after select:', await page.evaluate(() => window.location.hash));
  }
  // Registry check
  await page.goto(base + '/#/releases/schedule?projectId=flightctl');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const reqs = [];
  page.on('request', r => { if (r.url().includes('/api/')) reqs.push(r.url()); });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  console.log('API requests on /#/releases/schedule:', reqs.filter(u => u.includes('releases')).slice(0, 5));
  // Nav click
  await page.goto(base + '/#/ai-impact/autofix?projectId=flightctl');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  console.log('hash before nav click:', await page.evaluate(() => window.location.hash));
  const mod = page.locator('aside nav button').filter({ hasText: 'People & Teams' }).first();
  console.log('mod count:', await mod.count());
  await mod.click();
  await page.waitForTimeout(600);
  console.log('hash after module click:', await page.evaluate(() => window.location.hash));
  const view = page.locator('aside nav button').filter({ hasText: /^People$/ }).first();
  console.log('view count:', await view.count());
  if (await view.count()) {
    await view.click();
    await page.waitForTimeout(800);
    console.log('hash after view click:', await page.evaluate(() => window.location.hash));
  }
  await browser.close();
})();
