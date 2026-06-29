import http from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const OUT = process.env.OUT || '.';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.map': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  try { let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p === '/') p = '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) return res.writeHead(403).end();
    const body = await readFile(f); res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(8124, r));
async function chrome() { for (const c of [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']) { try { await access(c); return c; } catch {} } }
const scheme = process.env.SCHEME || 'dark';
const browser = await chromium.launch({ executablePath: await chrome() });
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
const shot = async (n) => { await page.waitForTimeout(650); await page.screenshot({ path: join(OUT, `${scheme}-${n}.png`) }); };
await page.goto('http://localhost:8124/index.html', { waitUntil: 'networkidle' });
await page.fill('textarea.big-input', 'I work Monday to Friday from 9 to 6. Wake at 5. Gym after work. Study Salesforce one hour every day. Pray at 5:10. Read 30 minutes daily.');
await page.click('.btn.primary'); await page.waitForSelector('.sugg-card');
await page.locator('.why-toggle').first().click().catch(() => {});
await shot('1-review');
await page.click('.sticky-actions .btn.primary'); await page.waitForSelector('main .screen');
await page.click('nav.tabbar button:has-text("Home")'); await page.waitForSelector('.home-head'); await shot('2-home');
await page.click('nav.tabbar button:has-text("Today")'); await page.waitForSelector('.day-switch'); await shot('3-today');
await page.click('nav.tabbar button:has-text("Routines")'); await page.waitForSelector('.group'); await shot('4-routines');
await page.click('nav.tabbar button:has-text("You")'); await page.waitForSelector('.group'); await shot('5-settings');
await page.goto('http://localhost:8124/index.html', { waitUntil: 'networkidle' });
await page.click('nav.tabbar button:has-text("Add")'); await page.waitForSelector('.seg'); await shot('6-add');
await browser.close(); server.close();
console.log('shots written:', scheme);
