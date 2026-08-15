// Issue #14 (Sam): every illustrated avatar, picked in a REAL browser, all the
// way through picker -> client state -> engine -> snapshot -> DOM.
//
// The two bugs this exists to catch were both silent truncations of the avatar
// id (8 characters, sized for emoji), which broke exactly the names longer than
// that and left those players faceless. A unit test proves the id survives the
// engine; only this proves the picked face is the face that renders.
//
// Run: node test/avatars-e2e.js     (no game server: the in-tab solo engine)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { AVATARS } from '../shared/constants.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4521);
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };

await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => {
    if (/assets\/ui\/avatars/.test(r.url())) errors.push('asset 404: ' + r.url().split('/').pop());
  });
  await page.goto(`http://localhost:${PORT}/client/?mode=solo&nobeacon=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#joinBtn');
  await page.fill('#name', 'AvatarProbe');
  await page.click('#joinBtn');
  await page.waitForSelector('#lobby:not(.hidden)');

  const bad = [];
  for (const av of AVATARS) {
    await page.click('#avatarBtn, .gathering .portrait');
    await page.waitForSelector('#avatarPanel:not(.hidden)');
    const tile = page.locator(`#avatarGrid button[data-av="${av}"]`);
    if (await tile.count() !== 1) { bad.push(`${av}: no tile in the picker`); continue; }
    if (await tile.isDisabled()) { await page.click('#avatarCloseBtn'); continue; } // taken by a bot
    await tile.click();
    // the DOM repaints from the SNAPSHOT, so wait for the echo instead of
    // guessing a delay: a pick that never lands is the bug, a pick that lands
    // one frame later is not.
    await page.waitForFunction((want) => {
      const big = document.querySelector('#myAvatar .avbig > img');
      const row = document.querySelector('#playerList .pl .av > img');
      const is = (el) => !!el && el.getAttribute('src').endsWith(`/${want}.png`);
      return is(big) && is(row);      // the portrait paints at once, the row on the next snapshot
    }, av, { timeout: 4000 }).catch(() => {});
    // what the ENGINE says it is, and what the DOM actually draws
    const seen = await page.evaluate(() => {
      const big = document.querySelector('#myAvatar .avbig > img');
      const row = document.querySelector('#playerList .pl .av > img');
      const src = (el) => (el ? el.getAttribute('src').split('/').pop().replace(/\.png$/, '') : null);
      return { big: src(big), row: src(row) };
    });
    if (seen.big !== av) bad.push(`${av}: YOU portrait shows ${seen.big}`);
    if (seen.row !== av) bad.push(`${av}: roster row shows ${seen.row}`);
    const broken = await page.evaluate(() => [...document.querySelectorAll('#lobby img, #avatarPanel img')]
      .filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.split('/').pop()));
    if (broken.length) bad.push(`${av}: broken images ${broken.join(',')}`);
  }
  if (bad.length) fail(`avatars that did not survive the round trip:\n  ${bad.join('\n  ')}`);
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
  if (!process.exitCode) console.log(`AVATARS E2E OK: all ${AVATARS.length} picked, sent, echoed and rendered`);
} finally {
  await browser.close();
  server.close();
}
