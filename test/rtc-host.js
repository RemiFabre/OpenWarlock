// Phase-B deliverable test (docs/BRIEF-browser-hosting.md §B verification):
// the client, served as STATIC FILES (no game server), hosts a lobby from one
// browser tab; a second browser context joins via the #r=CODE invite link over
// WebRTC brokered by server/signal.js; a real round is played over the data
// channels; the signalling relay is KILLED mid-battle and the game must not
// notice (it is not in the data path).
//
// Run: node test/rtc-host.js              (static on 4530, signalling on 4531)
//      SHOTS=/dir node test/rtc-host.js   (also saves screenshots there)
//
// Headless WebRTC note: chromium is launched with
// --disable-features=WebRtcHideLocalIpsWithMdns — headless Chrome has no mDNS
// responder, so the default .local ICE candidate obfuscation would break
// loopback connectivity. Plain RTCDataChannels need no fake-media flags.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4530);       // dumb static server
const SIG_PORT = Number(process.env.SIG_PORT || 4531); // signalling relay (child process)
const PREFIX = '/OpenWarlock';                        // GitHub-Pages-shaped subpath
const BASE = `http://localhost:${PORT}${PREFIX}`;
const SHOTS = process.env.SHOTS || null;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};
const statics = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (!p.startsWith(PREFIX + '/')) { res.writeHead(404); res.end(); return; }
  p = p.slice(PREFIX.length);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => SHOTS ? page.screenshot({ path: path.join(SHOTS, name) }) : Promise.resolve();

// the signalling relay runs as ITS OWN child process so we can kill exactly it
function startSignal() {
  const child = spawn('node', ['server/signal.js', `--port=${SIG_PORT}`], { cwd: ROOT, stdio: 'ignore' });
  return child;
}
async function waitSignalUp(timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(`http://localhost:${SIG_PORT}/health`); if (r.ok) return; } catch { }
    await sleep(100);
  }
  throw new Error('signalling relay did not come up');
}

// keep both warlocks busy: run around and cast at random spots
async function playFor(pages, ms) {
  const casts = ['q', 'w', 'e', 'd'];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const page of pages) {
      const x = 400 + Math.random() * 500, y = 200 + Math.random() * 400;
      await page.mouse.move(x, y);
      await page.mouse.click(x, y, { button: 'right' });
      await page.keyboard.press(casts[(Math.random() * casts.length) | 0]);
    }
    await sleep(350);
  }
}

await new Promise((r) => statics.listen(PORT, r));
let signal = startSignal();
await waitSignalUp();
console.log(`static (no game server) on ${BASE} · signalling child pid ${signal.pid} on :${SIG_PORT}`);

const browser = await chromium.launch({
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
});
try {
  const mkPage = async () => {
    const page = await browser.newContext({ viewport: { width: 1280, height: 800 } }).then(c => c.newPage());
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(String(e.message)));
    return page;
  };
  const sigQ = `?signal=ws%3A%2F%2Flocalhost%3A${SIG_PORT}`;

  // ---- host: static page -> "Host online" -> room code --------------------
  const host = await mkPage();
  await host.goto(`${BASE}/client/${sigQ}`);
  await host.waitForSelector('#joinBtn', { timeout: 8000 });
  await host.fill('#name', 'Remi-Host');
  await host.click('#hostBtn');
  await host.waitForSelector('#hostbar:not(.hidden)', { timeout: 8000 });
  const barText = await host.textContent('#hostbar');
  if (!/keep this tab open/i.test(barText)) fail(`hostbar misses the keep-open notice: "${barText}"`);
  const code = (await host.textContent('#hostCode')).trim();
  if (!/^[A-Z2-9]{12}$/.test(code)) fail(`bad room code "${code}"`);
  await host.waitForSelector('#lobby:not(.hidden)', { timeout: 5000 }); // the host is a player
  console.log(`host is up, room ${code}, hostbar warns to keep the tab open`);
  await shot(host, 'hosting-b-host-lobby.png');

  // ---- guest: opens the invite link, lands in the host's lobby ------------
  const guest = await mkPage();
  await guest.goto(`${BASE}/client/${sigQ}#r=${code}`);
  await guest.waitForSelector('#netMode:not(.hidden)', { timeout: 8000 });
  const hint = await guest.textContent('#netMode');
  if (!hint.includes(code)) fail(`guest netMode does not mention the room: "${hint}"`);
  await guest.fill('#name', 'Ana-Guest');
  await guest.click('#joinBtn');
  await guest.waitForSelector('#lobby:not(.hidden)', { timeout: 20000 });
  await host.waitForFunction(() =>
    document.getElementById('playerList').innerText.includes('Ana-Guest'), { timeout: 8000 });
  console.log('guest joined over WebRTC and is seated in the host lobby');
  await shot(guest, 'hosting-b-guest-lobby.png');

  // ---- a real round: 2 humans + a hard bot, ready up, fight ---------------
  await host.click('#addBot-berserker');
  await host.click('#readyBtn');
  await guest.click('#readyBtn');
  await host.waitForFunction(() => window.__phase === 'battle', { timeout: 20000 });
  await guest.waitForFunction(() => window.__phase === 'battle', { timeout: 20000 });
  console.log('battle running on both ends');
  await playFor([host, guest], 4000);
  await shot(host, 'hosting-b-battle-host.png');
  await shot(guest, 'hosting-b-battle-guest.png');

  // ---- kill the signalling relay MID-MATCH: the game must not notice ------
  signal.kill('SIGKILL');
  signal = null;
  console.log('signalling relay KILLED mid-battle');
  const snapsBefore = await guest.evaluate(() => window.__snapN || 0);
  await playFor([host, guest], 8000);
  const snapsAfter = await guest.evaluate(() => window.__snapN || 0);
  if (!(snapsAfter > snapsBefore + 30))
    fail(`snapshots stalled after signal death: ${snapsBefore} -> ${snapsAfter}`);
  const guestPhase = await guest.evaluate(() => window.__phase);
  if (!['battle', 'roundEnd', 'shop', 'countdown'].includes(guestPhase))
    fail(`guest fell out of the game after signal death (phase ${guestPhase})`);
  console.log(`game unaffected: guest snapshots ${snapsBefore} -> ${snapsAfter}, phase ${guestPhase}`);

  // ---- play the round OUT (bot fights until somebody dies -> shop) --------
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const ph = await guest.evaluate(() => window.__phase);
    if (ph === 'shop' || ph === 'gameover') break;
    await playFor([host, guest], 1500);
  }
  const endPhase = await guest.evaluate(() => window.__phase);
  if (!['shop', 'gameover'].includes(endPhase)) fail(`round never resolved (phase ${endPhase})`);
  console.log(`round resolved: phase ${endPhase} — a real round was played over RTC`);
  await shot(host, 'hosting-b-shop-host.png');
  await shot(guest, 'hosting-b-shop-guest.png');

  // (the B4 hot-spare assertion lived here until 21.11 — the spare is deleted
  // until host migration is actually built; plan in docs/BRIEF-browser-hosting.md §B4)

  if (host.errors.length) fail(`host page errors:\n${host.errors.join('\n')}`);
  if (guest.errors.length) fail(`guest page errors:\n${guest.errors.join('\n')}`);
  console.log('\nRTC HOSTING OK — hosted from a static tab, joined by link, round played, relay death ignored');
} finally {
  await browser.close();
  if (signal) signal.kill('SIGKILL');
  statics.close();
}
