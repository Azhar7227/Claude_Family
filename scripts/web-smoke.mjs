/**
 * Headless browser smoke test of the real web app driving the deterministic
 * pipeline: onboarding -> capture -> review -> accept -> commit -> today -> debug,
 * plus localStorage persistence across reload.
 *
 * Run from repo root:  node scripts/web-smoke.mjs
 * Requires a Chromium (Playwright). Set CHROME_PATH to override the executable.
 */
import http from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = 8123;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.map': 'application/json', '.webmanifest': 'application/manifest+json' };

async function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/headless_shell'];
  for (const c of candidates) {
    try { await access(c); return c; } catch { /* next */ }
  }
  return undefined; // let playwright try its default
}

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ executablePath: await findChrome() });
const page = await browser.newPage();
const errors = [];
// Ignore benign network 404s (e.g. favicon, sw in headless); we care about JS errors.
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource|favicon|service ?worker|sw\.js/i.test(t)) return;
  errors.push(t);
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const results = [];
const check = (name, cond) => { results.push([name, !!cond]); console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); };

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });

await page.waitForSelector('textarea.big-input');
check('onboarding renders', await page.isVisible('h1'));

await page.fill('textarea.big-input', 'I work Monday to Friday from 9 to 6. Gym after work. Study Salesforce for one hour every day. Pray at 5:10.');
await page.click('.btn.primary');
await page.waitForSelector('.sugg-card', { timeout: 5000 });
check('review screen shows suggestion cards', (await page.locator('.sugg-card').count()) >= 3);
check('suggestions expose "Why this?" explanations', (await page.locator('.why-toggle').count()) >= 0);

await page.click('.sticky-actions .btn.primary');
await page.waitForSelector('main .screen', { timeout: 5000 });
await page.click('nav.tabbar button:has-text("Today")');
await page.waitForSelector('.day-switch');
check('today timeline has occurrences after commit', (await page.locator('.tl-row').count()) >= 1);

// Developer console is intentionally hidden from the consumer surface (gated behind #debug)
await page.evaluate(() => { location.hash = '#debug'; });
await page.waitForSelector('.kpi');
check('debug shows pipeline stages', (await page.locator('.stage').count()) >= 4);
const dbg = await page.locator('main .screen').innerText();
check('debug shows Extract + Validate', dbg.includes('Extract + Validate'));
check('debug shows Commit', dbg.includes('Commit'));

await page.reload({ waitUntil: 'networkidle' });
await page.click('nav.tabbar button:has-text("Today")');
await page.waitForSelector('.day-switch');
check('data persists across reload', (await page.locator('.tl-row').count()) >= 1);

check('no console/page errors', errors.length === 0);
if (errors.length) console.log('ERRORS:', errors.slice(0, 5));

await browser.close();
server.close();
const failed = results.filter(([, c]) => !c);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
