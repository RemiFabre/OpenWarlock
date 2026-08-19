// End-to-end test for Pages-hosted experimental versions. The local server
// behaves like GitHub Pages: unknown URLs receive the repo's 404.html.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = '/OpenWarlock';
const PORT = Number(process.env.PORT || 4523);
const BASE = `http://localhost:${PORT}${PREFIX}`;
const COMMIT = '74523c1078d7e948e4237c67e52bbb2992add792';
const SHOTS = process.env.SHOTS || null;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.m4a': 'audio/mp4'
};

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (!pathname.startsWith(PREFIX + '/')) { res.writeHead(404); res.end(); return; }
  let relative = pathname.slice(PREFIX.length);
  if (relative.endsWith('/')) relative += 'index.html';
  const file = path.normalize(path.join(ROOT, relative));
  if (!file.startsWith(ROOT)) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (error, data) => {
    if (!error) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
      return;
    }
    fs.readFile(path.join(ROOT, '404.html'), (_, fallback) => {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end(fallback);
    });
  });
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await new Promise((resolve) => server.listen(PORT, resolve));
const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
const browser = await engine.launch();

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${BASE}/client/?nobeacon=1`);
  await page.waitForSelector('#owv-join');
  assert(await page.textContent('#owv-join').then((text) => text.includes('Default')), 'default version not identified');
  await page.click('#owv-button');
  await page.waitForSelector('#owv-overlay.open');
  assert(await page.textContent('#owv-list').then((text) => text.includes('Remi’s Blood Debt')), 'experimental version missing');
  await page.fill('#owv-search', 'remi debt');
  assert(await page.textContent('#owv-list').then((text) => text.includes('Remi’s Blood Debt') && !text.includes('Official version')), 'multi-word version search failed');
  await page.fill('#owv-search', 'nothing matches this');
  assert(await page.textContent('#owv-list').then((text) => text.includes('No versions match')), 'empty search result missing');
  await page.fill('#owv-search', '');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'versions-default.png') });

  await page.locator('.owv-item', { hasText: 'Remi’s Blood Debt' }).locator('.owv-play').click();
  await page.waitForFunction((commit) => location.pathname.includes(`/v/${commit}/client/`), COMMIT, { timeout: 15000 });
  await page.waitForSelector('#joinBtn', { timeout: 15000 });
  await page.waitForSelector('#owv-join', { timeout: 30000 });
  assert(await page.evaluate(() => window.__keys().debt === 'y'), 'Blood Debt code did not load');
  assert(await page.textContent('#owv-join').then((text) => text.includes('Remi’s Blood Debt')), 'experimental version not identified');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'versions-blood-debt.png') });
  console.log('selector loaded the exact experimental commit');

  const directContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const direct = await directContext.newPage();
  direct.on('pageerror', (error) => errors.push(error.message));
  await direct.goto(`${BASE}/v/${COMMIT}/client/?version=remis-blood-debt&nobeacon=1#r=ABCDEFGHJKM2`, { waitUntil: 'domcontentloaded' });
  await direct.waitForSelector('#joinBtn', { timeout: 15000 });
  await direct.waitForSelector('#owv-join');
  assert(direct.url().includes(`#r=ABCDEFGHJKM2`), 'shared room hash was lost');
  assert(await direct.evaluate(() => window.__keys().debt === 'y'), 'fresh shared link did not load the branch');
  console.log('fresh permanent link booted and preserved its invite hash');

  await direct.click('#owv-button');
  await direct.locator('.owv-item', { hasText: 'Default' }).locator('.owv-play').click();
  await direct.waitForURL(`**${PREFIX}/client/`, { timeout: 10000 });
  await direct.waitForSelector('#joinBtn');
  console.log('experimental version switched back to default');

  const invalid = 'a'.repeat(40);
  await direct.goto(`${BASE}/v/${invalid}/client/?nobeacon=1`);
  assert(await direct.textContent('body').then((text) => text.includes('no longer listed')), 'unlisted commit was not blocked');
  console.log('unlisted commit was blocked');

  assert(errors.length === 0, `page errors:\n${errors.join('\n')}`);
  console.log(`VERSION PLATFORM OK (${process.env.ENGINE || 'chromium'})`);
  await directContext.close();
  await context.close();
} finally {
  await browser.close();
  server.close();
}
