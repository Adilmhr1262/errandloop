// Live check for ErrandLoop on GitHub Pages (Playwright, headless Firefox).
// Run after publish: LIVE_URL=https://adilmhr1262.github.io/errandloop/ NODE_PATH=<test-tools node_modules> node tests/errandloop-live-check.cjs
// Exits non-zero if any check fails.
// Note: this VM's Firefox does not trust the GitHub Pages cert chain, so the
// live check runs with ignoreHTTPSErrors; curl verifies the 200s separately.
const { firefox } = require('playwright-core');

const LIVE = process.env.LIVE_URL || 'https://adilmhr1262.github.io/errandloop/';
let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { passed++; console.log('  PASS ' + name); }
  else { failed++; failures.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await firefox.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
    page.on('request', (req) => { if (!req.url().startsWith(LIVE)) externalRequests.push(req.url()); });

    await page.goto(LIVE, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="nav-dashboard"]');
    check('live title is ErrandLoop', (await page.title()).includes('ErrandLoop'));
    check('live site starts empty', (await page.locator('[data-testid="stat-total"]').textContent()) === '0');
    check('live empty state visible', await page.locator('.empty-state').first().isVisible());

    await page.click('[data-testid="add-first-errand"]');
    await page.fill('[data-testid="errand-title"]', 'Live check errand');
    await page.fill('[data-testid="errand-destination"]', 'Market');
    await page.click('[data-testid="save-errand"]');
    await page.waitForSelector('.modal', { state: 'detached' });
    await sleep(300);
    check('live errand created', (await page.locator('[data-testid="stat-total"]').textContent()) === '1');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-testid="nav-dashboard"]');
    check('live errand persists after reload', (await page.locator('[data-testid="stat-total"]').textContent()) === '1');

    await page.setViewportSize({ width: 375, height: 800 });
    await sleep(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check('live 375px no overflow', !overflow);
    check('live bottom nav visible at 375px', await page.locator('#bottom-nav').isVisible());

    check('zero console/page errors live', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    check('zero external requests live', externalRequests.length === 0, externalRequests.slice(0, 3).join(', '));
  } finally {
    await browser.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failures: ' + failures.join(', '));
    process.exit(1);
  }
})().catch((err) => {
  console.error('Live check crashed:', err);
  process.exit(1);
});
