// Extra responsive verification for ErrandLoop at 320px and 1920px.
// Reports innerWidth, scrollWidth and any overflowing elements at both widths,
// and exercises nav, cards, the errand form and planner controls at 320px.
const { firefox } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/daily-projects/2026-11-25-errandloop';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
let passed = 0, failed = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { passed++; console.log('  PASS ' + name); }
  else { failed++; failures.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  async function measure(label) {
    const m = await page.evaluate(() => {
      const over = [];
      const vw = window.innerWidth;
      document.querySelectorAll('*').forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 && (rect.right > vw + 0.5 || rect.left < -0.5)) {
          const tag = node.tagName.toLowerCase() + (node.className && typeof node.className === 'string' ? '.' + node.className.split(' ').join('.') : '');
          over.push(tag + ' right=' + Math.round(rect.right));
        }
      });
      return { innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, overflowing: over.slice(0, 10) };
    });
    console.log(`  ${label}: innerWidth=${m.innerWidth} scrollWidth=${m.scrollWidth} overflowing=${JSON.stringify(m.overflowing)}`);
    return m;
  }
  try {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('#bottom-nav');
    // Seed data via localStorage so cards, planner and forms render with content.
    await page.evaluate(() => {
      const state = {
        errands: [
          { id: 'r1', title: 'Buy weekly groceries and household supplies', destination: 'Market', category: 'Shopping', priority: 'High', dueDate: new Date().toISOString().slice(0, 10), durationMin: 45, notes: 'Milk, eggs, bread, cleaning spray', status: 'pending', createdAt: 1000, completedAt: null },
          { id: 'r2', title: 'Pay electricity bill', destination: 'Bank', category: 'Banking', priority: 'Medium', dueDate: new Date().toISOString().slice(0, 10), durationMin: 15, notes: '', status: 'pending', createdAt: 1001, completedAt: null },
          { id: 'r3', title: 'Pick up prescription', destination: 'Pharmacy', category: 'Personal', priority: 'Low', dueDate: null, durationMin: 10, notes: '', status: 'pending', createdAt: 1002, completedAt: null },
        ],
        destinations: ['Market', 'Bank', 'Pharmacy'],
        outings: [{ id: 'o1', destination: 'Market', errandIds: ['r1'], status: 'active', createdAt: 1000, completedAt: null }],
        settings: { theme: 'system' },
      };
      localStorage.setItem('errandloop.v1', JSON.stringify(state));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#bottom-nav');

    // 320px: dashboard with data.
    await page.setViewportSize({ width: 320, height: 700 });
    await sleep(300);
    let m = await measure('320px dashboard');
    check('320px dashboard no horizontal overflow', m.scrollWidth <= m.innerWidth, 'scrollWidth=' + m.scrollWidth);
    check('320px dashboard no overflowing elements', m.overflowing.length === 0, JSON.stringify(m.overflowing));
    check('320px bottom nav visible', await page.locator('#bottom-nav').isVisible());
    check('320px stat cards fit', (await page.locator('.stat-card').count()) === 4);

    // 320px: errand form usable.
    await page.click('[data-testid="nav-errands-mobile"]');
    await sleep(200);
    await page.click('[data-testid="add-errand"]');
    await sleep(200);
    m = await measure('320px errand form');
    check('320px errand form no horizontal overflow', m.scrollWidth <= m.innerWidth, 'scrollWidth=' + m.scrollWidth);
    check('320px errand form no overflowing elements', m.overflowing.length === 0, JSON.stringify(m.overflowing));
    await page.fill('[data-testid="errand-title"]', '320px form check');
    await page.click('[data-testid="save-errand"]');
    await page.waitForSelector('.modal', { state: 'detached' });
    await sleep(200);
    check('320px form saves the errand', (await page.locator('[data-testid="errand-count"]').textContent()).includes('4 errands'));

    // 320px: planner controls usable.
    await page.click('[data-testid="nav-planner-mobile"]');
    await sleep(200);
    m = await measure('320px planner');
    check('320px planner no horizontal overflow', m.scrollWidth <= m.innerWidth, 'scrollWidth=' + m.scrollWidth);
    check('320px planner no overflowing elements', m.overflowing.length === 0, JSON.stringify(m.overflowing));
    const outing = page.locator('[data-testid="outing-card"]').first();
    check('320px outing stop checkbox clickable', await outing.locator('.stop input[type="checkbox"]').first().isVisible());
    await outing.locator('.stop input[type="checkbox"]').first().check();
    await sleep(300);
    check('320px outing stop completes at 320px', (await page.locator('[data-testid="outing-progress"]').first().textContent()).includes('1 of 1 stops done'));

    // 320px: settings usable.
    await page.click('[data-testid="nav-settings-mobile"]');
    await sleep(200);
    m = await measure('320px settings');
    check('320px settings no horizontal overflow', m.scrollWidth <= m.innerWidth, 'scrollWidth=' + m.scrollWidth);
    check('320px settings no overflowing elements', m.overflowing.length === 0, JSON.stringify(m.overflowing));

    // 1920px: desktop layout.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.click('[data-testid="nav-dashboard"]');
    await sleep(300);
    m = await measure('1920px dashboard');
    check('1920px dashboard no horizontal overflow', m.scrollWidth <= m.innerWidth, 'scrollWidth=' + m.scrollWidth);
    check('1920px dashboard no overflowing elements', m.overflowing.length === 0, JSON.stringify(m.overflowing));
    check('1920px sidebar visible', await page.locator('.sidebar').isVisible());
    await page.click('[data-testid="nav-planner"]');
    await sleep(200);
    m = await measure('1920px planner');
    check('1920px planner no horizontal overflow', m.scrollWidth <= m.innerWidth, 'scrollWidth=' + m.scrollWidth);
    check('1920px planner no overflowing elements', m.overflowing.length === 0, JSON.stringify(m.overflowing));
    await page.click('[data-testid="nav-errands"]');
    await sleep(200);
    m = await measure('1920px errands');
    check('1920px errands no horizontal overflow', m.scrollWidth <= m.innerWidth, 'scrollWidth=' + m.scrollWidth);
    check('1920px errands no overflowing elements', m.overflowing.length === 0, JSON.stringify(m.overflowing));

    check('zero console/page errors during responsive checks', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log('Failures: ' + failures.join(', ')); process.exit(1); }
})().catch((err) => { console.error('Test run crashed:', err); process.exit(1); });
