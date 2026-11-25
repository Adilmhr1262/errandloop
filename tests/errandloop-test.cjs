// Browser acceptance tests for ErrandLoop (Playwright, headless Firefox).
// Serves the project over local HTTP and drives the real UI.
// Run: NODE_PATH=<test-tools node_modules> node tests/errandloop-test.cjs
// Exits non-zero if any check fails.
const { firefox } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { passed++; console.log('  PASS ' + name); }
  else { failed++; failures.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const now = new Date();
const TODAY = fmt(now);
const YESTERDAY = fmt(new Date(now.getTime() - 86400000));
const TOMORROW = fmt(new Date(now.getTime() + 86400000));

async function addErrand(page, fields) {
  await page.click('[data-testid="add-errand"]');
  await page.fill('[data-testid="errand-title"]', fields.title);
  if (fields.destination !== undefined) await page.fill('[data-testid="errand-destination"]', fields.destination);
  if (fields.category) await page.selectOption('[data-testid="errand-category"]', fields.category);
  if (fields.priority) await page.selectOption('[data-testid="errand-priority"]', fields.priority);
  if (fields.due) await page.fill('[data-testid="errand-due"]', fields.due);
  if (fields.duration) await page.fill('[data-testid="errand-duration"]', String(fields.duration));
  if (fields.notes) await page.fill('[data-testid="errand-notes"]', fields.notes);
  await page.click('[data-testid="save-errand"]');
  await page.waitForSelector('.modal', { state: 'detached' });
  await sleep(200);
}

(async () => {
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}/`;
  let browser;
  try {
    browser = await firefox.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
    page.on('request', (req) => { if (!req.url().startsWith(base)) externalRequests.push(req.url()); });

    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="nav-dashboard"]');

    // 1. Fresh install: zero stats and empty state.
    check('fresh install total is 0', (await page.locator('[data-testid="stat-total"]').textContent()) === '0');
    check('fresh install pending is 0', (await page.locator('[data-testid="stat-pending"]').textContent()) === '0');
    check('fresh install due today is 0', (await page.locator('[data-testid="stat-due-today"]').textContent()) === '0');
    check('fresh install completed is 0', (await page.locator('[data-testid="stat-completed"]').textContent()) === '0');
    check('fresh install shows empty state', await page.locator('.empty-state').first().isVisible());

    // 2. Add the first errand from the dashboard empty state.
    await page.click('[data-testid="add-first-errand"]');
    await page.fill('[data-testid="errand-title"]', 'Buy groceries');
    await page.fill('[data-testid="errand-destination"]', 'Market');
    await page.selectOption('[data-testid="errand-category"]', 'Shopping');
    await page.selectOption('[data-testid="errand-priority"]', 'High');
    await page.fill('[data-testid="errand-due"]', TODAY);
    await page.fill('[data-testid="errand-duration"]', '30');
    await page.fill('[data-testid="errand-notes"]', 'Milk, eggs, bread');
    await page.click('[data-testid="save-errand"]');
    await page.waitForSelector('.modal', { state: 'detached' });
    await sleep(200);
    check('total is 1 after first errand', (await page.locator('[data-testid="stat-total"]').textContent()) === '1');
    check('pending is 1 after first errand', (await page.locator('[data-testid="stat-pending"]').textContent()) === '1');
    check('due today is 1 after first errand', (await page.locator('[data-testid="stat-due-today"]').textContent()) === '1');
    check('attention shows the high-priority errand', (await page.locator('.section .errand-card h3').first().textContent()) === 'Buy groceries');

    // 3. Add two more errands from My Errands.
    await page.click('[data-testid="nav-errands"]');
    await addErrand(page, { title: 'Pay electricity bill', destination: 'Bank', category: 'Banking', priority: 'Medium', due: YESTERDAY, duration: 15 });
    await addErrand(page, { title: 'Fix leaky tap', destination: '', category: 'Household', priority: 'Low', due: TOMORROW });
    check('errand count reads 3 errands', (await page.locator('[data-testid="errand-count"]').textContent()).includes('3 errands'));
    check('overdue errand shows overdue label', (await page.locator('.errand-card', { hasText: 'Pay electricity bill' }).textContent()).includes('Overdue by 1 day'));

    // 4. Title validation: too short is rejected.
    await page.click('[data-testid="add-errand"]');
    await page.fill('[data-testid="errand-title"]', 'x');
    await page.click('[data-testid="save-errand"]');
    check('one-letter title rejected with error shown', await page.locator('.form-errors').isVisible());
    await page.click('text=Cancel');
    check('rejected errand was not saved', (await page.locator('[data-testid="errand-count"]').textContent()).includes('3 errands'));

    // 5. Search and filters.
    await page.fill('[data-testid="search-errands"]', 'groceries');
    check('search finds the errand', (await page.locator('[data-testid="errand-count"]').textContent()).includes('1 errand'));
    await page.fill('[data-testid="search-errands"]', 'zzz-no-match');
    check('no-match search shows empty state', await page.locator('.empty-state').isVisible());
    await page.fill('[data-testid="search-errands"]', '');
    await page.selectOption('[data-testid="filter-category"]', 'Banking');
    check('category filter shows only the Banking errand', (await page.locator('[data-testid="errand-count"]').textContent()).includes('1 errand'));
    await page.selectOption('[data-testid="filter-category"]', '');
    await page.selectOption('[data-testid="filter-priority"]', 'High');
    check('priority filter shows only the High errand', (await page.locator('[data-testid="errand-count"]').textContent()).includes('1 errand'));
    await page.selectOption('[data-testid="filter-priority"]', '');
    await page.selectOption('[data-testid="sort-errands"]', 'alpha');
    check('alphabetical sort puts Buy groceries first', (await page.locator('.errand-card h3').first().textContent()) === 'Buy groceries');
    await page.selectOption('[data-testid="sort-errands"]', 'due');

    // 6. Complete and reopen from the errand card.
    await page.locator('.errand-card', { hasText: 'Buy groceries' }).locator('button', { hasText: 'Mark complete' }).first().click();
    await sleep(300);
    await page.click('[data-testid="nav-dashboard"]');
    check('completed is 1 after completing', (await page.locator('[data-testid="stat-completed"]').textContent()) === '1');
    check('pending is 2 after completing', (await page.locator('[data-testid="stat-pending"]').textContent()) === '2');
    check('recently completed lists the errand', (await page.locator('.section', { hasText: 'Recently completed' }).locator('.errand-card h3').first().textContent()) === 'Buy groceries');
    await page.click('[data-testid="nav-errands"]');
    await page.locator('.errand-card', { hasText: 'Buy groceries' }).locator('button', { hasText: 'Reopen' }).first().click();
    await sleep(300);
    check('reopen returns it to pending', (await page.locator('[data-testid="errand-count"]').textContent()).includes('3 errands'));

    // 7. Edit the errand title.
    await page.locator('.errand-card', { hasText: 'Buy groceries' }).locator('button', { hasText: 'Edit' }).first().click();
    await page.fill('[data-testid="errand-title"]', 'Buy weekly groceries');
    await page.click('[data-testid="save-errand"]');
    await page.waitForSelector('.modal', { state: 'detached' });
    await sleep(200);
    check('edited title is saved', (await page.locator('.errand-card h3', { hasText: 'Buy weekly groceries' }).count()) === 1);

    // 8. Planner: group by destination, start an outing, complete a stop.
    await page.click('[data-testid="nav-planner"]');
    check('planner groups by Market', await page.locator('.group-card', { hasText: 'Market' }).first().isVisible());
    const marketGroup = page.locator('.group-card', { hasText: 'Market' }).first();
    await marketGroup.locator('[data-testid="outing-select"]').first().check();
    await marketGroup.locator('[data-testid="start-outing"]').click();
    await sleep(300);
    check('outing card appears', await page.locator('[data-testid="outing-card"]').first().isVisible());
    check('outing progress starts at 0 of 1', (await page.locator('[data-testid="outing-progress"]').first().textContent()).includes('0 of 1 stops done'));
    check('outing shows total estimated time', (await page.locator('[data-testid="outing-progress"]').first().textContent()).includes('30 min'));
    await page.locator('[data-testid="outing-stops"] input[type="checkbox"]').first().check();
    await sleep(300);
    check('checking a stop completes the errand', (await page.locator('[data-testid="outing-progress"]').first().textContent()).includes('1 of 1 stops done (100%)'));
    check('finished outing shows Done', (await page.locator('[data-testid="outing-card"]').first().textContent()).includes('Done'));
    await page.click('[data-testid="nav-dashboard"]');
    check('dashboard completed is 1 after outing stop', (await page.locator('[data-testid="stat-completed"]').textContent()) === '1');
    // Reopen the stop from the outing: errand goes back to pending, outing active again.
    await page.click('[data-testid="nav-planner"]');
    await page.locator('[data-testid="outing-stops"] input[type="checkbox"]').first().uncheck();
    await sleep(300);
    check('unchecking a stop reopens the errand', (await page.locator('[data-testid="outing-progress"]').first().textContent()).includes('0 of 1 stops done'));
    check('outing is active again', (await page.locator('[data-testid="outing-card"]').first().textContent()).includes('Active'));

    // 9. Reorder stops in a two-stop outing.
    await page.click('[data-testid="nav-errands"]');
    await addErrand(page, { title: 'Pick up prescription', destination: 'Pharmacy', category: 'Personal', priority: 'Medium', due: TODAY, duration: 10 });
    await addErrand(page, { title: 'Buy vitamins', destination: 'Pharmacy', category: 'Shopping', priority: 'Low', due: TODAY, duration: 5 });
    await page.click('[data-testid="nav-planner"]');
    const pharmacyGroup = page.locator('.group-card', { hasText: 'Pharmacy' }).first();
    const pharmacyChecks = pharmacyGroup.locator('[data-testid="outing-select"]');
    await pharmacyChecks.nth(0).check();
    await pharmacyChecks.nth(1).check();
    await pharmacyGroup.locator('[data-testid="start-outing"]').click();
    await sleep(300);
    const outingCards = page.locator('[data-testid="outing-card"]');
    check('two outings are listed', (await outingCards.count()) === 2);
    const pharmacyOuting = outingCards.nth(0);
    check('first stop is the prescription', (await pharmacyOuting.locator('.stop-title').first().textContent()) === 'Pick up prescription');
    await pharmacyOuting.locator('[aria-label="Move Pick up prescription down"]').click();
    await sleep(300);
    check('moving a stop down reorders the outing', (await page.locator('[data-testid="outing-card"]').nth(0).locator('.stop-title').first().textContent()) === 'Buy vitamins');
    check('duplicate stops are prevented', (await page.locator('[data-testid="outing-card"]').nth(0).locator('.stop').count()) === 2);

    // 10. Cancel the Bank outing and see it under past outings.
    const bankGroup = page.locator('.group-card', { hasText: 'Bank' }).first();
    await bankGroup.locator('[data-testid="outing-select"]').first().check();
    await bankGroup.locator('[data-testid="start-outing"]').click();
    await sleep(300);
    const bankOuting = page.locator('[data-testid="outing-card"]', { hasText: 'Bank' }).first();
    await bankOuting.locator('button', { hasText: 'Cancel outing' }).click();
    await page.locator('[data-testid="confirm-action"]').click();
    await sleep(300);
    check('cancelled outing shows under past outings', (await page.locator('.section', { hasText: 'Past outings' }).locator('[data-testid="outing-card"]').count()) === 1);

    // 11. Persistence across reload, including the unfinished outing.
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="nav-dashboard"]');
    await sleep(200);
    check('errands survive reload', (await page.locator('[data-testid="stat-total"]').textContent()) === '5');
    await page.click('[data-testid="nav-planner"]');
    check('unfinished outing survives reload', (await page.locator('[data-testid="outing-card"]').count()) >= 2);

    // 12. Settings: destinations add and delete keeps errands.
    await page.click('[data-testid="nav-settings"]');
    await page.fill('[data-testid="new-destination"]', 'Library');
    await page.click('[data-testid="add-destination"]');
    await sleep(300);
    check('destination is added', (await page.locator('[data-testid="destination-list-display"]').textContent()).includes('Library'));
    await page.fill('[data-testid="new-destination"]', 'Pharmacy');
    await page.click('[data-testid="add-destination"]');
    await sleep(300);
    const pharmacyRow = page.locator('.dest-row', { hasText: 'Pharmacy' }).first();
    await pharmacyRow.locator('[data-testid="delete-destination"]').click();
    await page.locator('[data-testid="confirm-action"]').click();
    await sleep(300);
    check('destination is deleted from the list', !(await page.locator('[data-testid="destination-list-display"]').textContent()).includes('Pharmacy'));
    await page.click('[data-testid="nav-planner"]');
    check('deleting a destination keeps its errands', await page.locator('.group-card', { hasText: 'Pharmacy' }).first().isVisible());

    // 13. Backup export, bad import rejection, good import replacement.
    await page.click('[data-testid="nav-settings"]');
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await page.click('[data-testid="export-backup"]');
    const download = await downloadPromise;
    const downloadPath = path.join(ROOT, 'tests', '.export-check.json');
    await download.saveAs(downloadPath);
    const exported = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
    check('exported backup is valid ErrandLoop JSON', exported.app === 'errandloop' && exported.version === 1 && exported.errands.length === 5);
    fs.unlinkSync(downloadPath);

    const csvPromise = page.waitForEvent('download', { timeout: 5000 });
    await page.click('[data-testid="export-csv"]');
    const csvDownload = await csvPromise;
    const csvPath = path.join(ROOT, 'tests', '.export-check.csv');
    await csvDownload.saveAs(csvPath);
    const csvText = fs.readFileSync(csvPath, 'utf8');
    check('CSV export has header and errands', csvText.startsWith('id,title,destination') && csvText.includes('Buy weekly groceries'));
    fs.unlinkSync(csvPath);

    await page.setInputFiles('[data-testid="import-backup"]', path.join(ROOT, 'tests', 'bad-backup.json'));
    await sleep(400);
    check('invalid backup rejected with a reason', (await page.locator('[data-testid="import-status"]').textContent()).includes('not valid'));
    await page.click('[data-testid="nav-dashboard"]');
    check('data intact after rejected import', (await page.locator('[data-testid="stat-total"]').textContent()) === '5');

    await page.click('[data-testid="nav-settings"]');
    await page.setInputFiles('[data-testid="import-backup"]', path.join(ROOT, 'tests', 'good-backup.json'));
    await sleep(400);
    await page.locator('[data-testid="confirm-action"]').click();
    await sleep(400);
    await page.click('[data-testid="nav-errands"]');
    check('valid import replaces data with Buy bread', (await page.locator('.errand-card h3').first().textContent()) === 'Buy bread');
    check('imported count is 1 errand', (await page.locator('[data-testid="errand-count"]').textContent()).includes('1 errand'));

    // 14. Dark theme applies and persists.
    await page.click('[data-testid="nav-settings"]');
    await page.click('[data-testid="theme-dark"]');
    check('dark theme applies', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    await page.reload({ waitUntil: 'load' });
    check('dark theme persists after reload', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    await page.click('[data-testid="theme-light"]');

    // 15. Delete-all gating.
    await page.click('[data-testid="nav-settings"]');
    check('delete-all disabled until DELETE is typed', await page.locator('[data-testid="delete-all-btn"]').isDisabled());
    await page.fill('[data-testid="delete-all-input"]', 'delete');
    check('lowercase delete keeps button disabled', await page.locator('[data-testid="delete-all-btn"]').isDisabled());
    await page.fill('[data-testid="delete-all-input"]', 'DELETE');
    await page.click('[data-testid="delete-all-btn"]');
    await page.locator('[data-testid="confirm-action"]').click();
    await sleep(400);
    await page.click('[data-testid="nav-dashboard"]');
    check('delete-all empties the dashboard', (await page.locator('[data-testid="stat-total"]').textContent()) === '0');

    // 16. Responsive: no horizontal overflow; bottom nav on mobile, sidebar on desktop.
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await sleep(200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      check(`no horizontal overflow at ${width}px`, !overflow);
    }
    await page.setViewportSize({ width: 375, height: 800 });
    check('bottom nav visible at 375px', await page.locator('#bottom-nav').isVisible());
    await page.setViewportSize({ width: 1024, height: 800 });
    check('sidebar visible at 1024px', await page.locator('.sidebar').isVisible());
    check('bottom nav hidden at 1024px', !(await page.locator('#bottom-nav').isVisible()));

    // 17. Keyboard focus is visible.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('[data-testid="nav-errands"]');
    await page.keyboard.press('Tab');
    const focusVisible = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return false;
      const style = getComputedStyle(active);
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
    });
    check('keyboard focus is visible', focusVisible);

    // 18. Zero console errors and zero external requests.
    check('zero console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    check('zero external requests', externalRequests.length === 0, externalRequests.slice(0, 3).join(', '));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failures: ' + failures.join(', '));
    process.exit(1);
  }
})().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
