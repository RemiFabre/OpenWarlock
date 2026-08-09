// Phase-A deliverable test (docs/BRIEF-browser-hosting.md §A verification 5):
// the client, served by a DUMB STATIC FILE SERVER with no game server running,
// must open, detect there is no server, and play SOLO vs a bot entirely in the
// tab. If this passes, the GitHub Pages link works.
//
// Run: node test/solo-static.js            (serves the repo itself on PORT)
//      SHOTS=/dir node test/solo-static.js (also saves screenshots there)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4520);
// the repo is served UNDER A SUBPATH, exactly like RemiFabre.github.io/OpenWarlock/
// — this is what catches any absolute /client|/assets path sneaking back in
const PREFIX = '/OpenWarlock';
const BASE = `http://localhost:${PORT}${PREFIX}`;
const SHOTS = process.env.SHOTS || null;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

// deliberately dumb: files + directory index.html, nothing else. No /health,
// no WebSocket — exactly what GitHub Pages gives us.
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (!p.startsWith(PREFIX + '/')) { res.writeHead(404); res.end('outside subpath'); return; }
  p = p.slice(PREFIX.length);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((r) => server.listen(PORT, r));
console.log(`static server (no game server) on ${BASE}`);

// ENGINE=webkit covers the Safari-shaped path (default chromium)
const browser = await (process.env.ENGINE === 'webkit' ? webkit : chromium).launch();
try {
  const page = await browser.newContext({ viewport: { width: 1280, height: 800 } }).then(c => c.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));

  // the root landing page must forward into client/
  await page.goto(BASE + '/');
  await page.waitForURL('**/client/**', { timeout: 5000 });
  await page.waitForSelector('#joinBtn', { timeout: 5000 });

  // the /health probe must have failed over to solo, and said so
  await page.waitForSelector('#netMode:not(.hidden)', { timeout: 5000 });
  const hint = await page.textContent('#netMode');
  if (!/solo/i.test(hint)) fail(`netMode hint doesn't announce solo: "${hint}"`);
  console.log(`solo detected: "${hint.trim()}"`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hosting-solo-join.png') });

  await page.fill('#name', 'Solo-Remi');
  await page.click('#joinBtn');
  await page.waitForSelector('#lobby:not(.hidden)', { timeout: 5000 });
  console.log('joined the in-tab lobby');

  await page.click('#addBot-berserker');
  await page.click('#readyBtn');
  await page.waitForFunction(() => window.__phase === 'battle', { timeout: 20000 });
  console.log('battle running, no server anywhere');
  if (SHOTS) { await sleep(1500); await page.screenshot({ path: path.join(SHOTS, 'hosting-solo-battle.png') }); }

  // actually PLAY: chase the cursor around and cast at it for a while
  const casts = ['q', 'w', 'e', 'd'];
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const x = 400 + Math.random() * 500, y = 200 + Math.random() * 400;
    await page.mouse.move(x, y);
    await page.mouse.click(x, y, { button: 'right' });
    await page.keyboard.press(casts[(Math.random() * casts.length) | 0]);
    await sleep(400);
  }

  // the rAF heartbeat is alive, snapshots keep flowing, the sim advanced
  const hb1 = await page.evaluate(() => window.__hb || 0);
  await sleep(1200);
  const hb2 = await page.evaluate(() => window.__hb || 0);
  if (!(hb2 > hb1)) fail(`rAF heartbeat stalled: ${hb1} -> ${hb2}`);
  const state = await page.evaluate(() => ({
    phase: window.__phase,
    deaths: window.__deaths || 0,
    round: window.__engine ? window.__engine.game.round : null,
    time: window.__engine ? window.__engine.game.time : null,
  }));
  console.log(`state after play: ${JSON.stringify(state)}`);
  if (!['battle', 'shop', 'roundEnd', 'countdown'].includes(state.phase)) fail(`unexpected phase ${state.phase}`);
  if (!(state.round >= 1)) fail('round never started');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hosting-solo-late.png') });
  if (errors.length) fail(`page errors:\n${errors.join('\n')}`);

  console.log('\nSOLO STATIC OK — played vs a bot with no game server');
} finally {
  await browser.close();
  server.close();
}
