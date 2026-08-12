// Client robustness test: drives the real client in Chromium AND WebKit.
//
// Per engine:
//  (a) join with 3 bots, ready up, play 90+ s with active random casting;
//      assert zero page errors, the rAF heartbeat (window.__hb) keeps ticking,
//      and at least one death event was rendered (window.__deaths).
//  (b) kill the server process mid-battle; assert the "Connection lost"
//      banner appears and no page error is thrown.
//  (c) restart the server; assert the client auto-reconnects (banner clears)
//      and reaches the lobby again.
//
// Run: node test/client-robustness.js   (manages its own server on PORT)

import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3217;
const BASE = `http://localhost:${PORT}`;
const PLAY_MS = Number(process.env.PLAY_MS || 95_000); // override for quick smoke runs

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  return spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
}

async function waitForHealth(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error('server did not become healthy in time');
}

async function waitForServerGone(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await fetch(`${BASE}/health`); } catch { return; }
    await sleep(150);
  }
  throw new Error('server still answering /health after kill');
}

async function assertHeartbeatTicking(page, label) {
  const hb1 = await page.evaluate(() => window.__hb || 0);
  await sleep(1500);
  const hb2 = await page.evaluate(() => window.__hb || 0);
  if (!(hb2 > hb1)) throw new Error(`rAF heartbeat stalled (${label}): ${hb1} -> ${hb2}`);
}

async function runScenario(engineName, engine) {
  console.log(`\n=== ${engineName} ===`);
  let server = startServer();
  let browser;
  try {
    await waitForHealth();
    browser = await engine.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') console.log(`  [console.error] ${m.text()}`); });
    const assertNoErrors = (stage) => {
      if (errors.length) throw new Error(`page errors during ${stage}:\n${errors.join('\n')}`);
    };

    // -- (a) join, 3 bots, ready, play 90+ s --------------------------------
    await page.goto(BASE);
    await page.fill('#name', `Robo-${engineName}`);
    await page.click('#joinBtn');
    await page.waitForSelector('#lobby:not(.hidden)', { timeout: 8000 });
    for (const kind of ['grunt', 'berserker', 'stalker']) {
      await page.click(`#addBot-${kind}`);
      await sleep(150);
    }
    await page.click('#readyBtn');
    await page.waitForSelector('#lobby.hidden', { state: 'attached', timeout: 8000 });
    await page.waitForFunction(() => window.__phase === 'battle', null, { timeout: 20_000 });
    console.log('  battle started, playing...');

    const keys = ['q', 'w', 'e', 'r', 'd', 'f'];
    const start = Date.now();
    let lastHbCheck = Date.now();
    while (Date.now() - start < PLAY_MS) {
      const x = 200 + Math.random() * 880, y = 150 + Math.random() * 500;
      await page.mouse.move(x, y);
      await page.keyboard.press(keys[(Math.random() * keys.length) | 0]);
      if (Math.random() < 0.6) {
        await page.mouse.click(200 + Math.random() * 880, 150 + Math.random() * 500, { button: 'right' });
      }
      await sleep(300);
      if (Date.now() - lastHbCheck > 20_000) {
        lastHbCheck = Date.now();
        await assertHeartbeatTicking(page, 'mid-play');
      }
    }
    assertNoErrors('90s play');
    await assertHeartbeatTicking(page, 'after play');
    // A death always comes eventually (the arena shrinks to nothing), but short
    // PLAY_MS smoke runs can end before the first one; wait instead of asserting.
    await page.waitForFunction(() => (window.__deaths || 0) >= 1, null, { timeout: 120_000 })
      .catch(() => { throw new Error('no death event was rendered'); });
    const deaths = await page.evaluate(() => window.__deaths || 0);
    console.log(`  play OK: ${deaths} deaths rendered, heartbeat alive, no page errors`);

    // -- (b) kill the server mid-battle --------------------------------------
    // (if a bot already won the whole game, restart it and get back to battle)
    await page.waitForFunction(
      () => window.__phase === 'battle' || window.__phase === 'gameover',
      null, { timeout: 120_000 });
    if (await page.evaluate(() => window.__phase) === 'gameover') {
      console.log('  game ended early; returning to lobby for round 2 of testing');
      await page.click('#againBtn');
      await page.waitForSelector('#lobby:not(.hidden)', { timeout: 8000 });
      await page.click('#readyBtn');
      await page.waitForFunction(() => window.__phase === 'battle', null, { timeout: 20_000 });
    }
    server.kill('SIGKILL');
    await waitForServerGone();
    console.log('  server killed mid-battle');
    await page.waitForSelector('#connbanner:not(.hidden)', { timeout: 10_000 });
    const bannerText = await page.textContent('#connbanner');
    if (!/connection lost/i.test(bannerText)) {
      throw new Error(`unexpected banner text: "${bannerText}"`);
    }
    await assertHeartbeatTicking(page, 'after server kill');
    assertNoErrors('server kill');
    console.log(`  banner shown: "${bannerText.trim()}", client still alive`);

    // -- (c) restart the server, expect auto-reconnect ------------------------
    server = startServer();
    await waitForHealth();
    await page.waitForSelector('#connbanner.hidden', { state: 'attached', timeout: 15_000 });
    await page.waitForSelector('#lobby:not(.hidden)', { timeout: 10_000 });
    await assertHeartbeatTicking(page, 'after reconnect');
    assertNoErrors('reconnect');
    console.log('  reconnected: banner cleared, lobby reached, no page errors');

    console.log(`=== ${engineName} PASS ===`);
    return true;
  } catch (err) {
    console.error(`=== ${engineName} FAIL: ${err.message} ===`);
    return false;
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGKILL');
    await waitForServerGone().catch(() => {});
  }
}

let allPass = true;
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  if (!(await runScenario(name, engine))) allPass = false;
}
console.log(allPass ? '\nCLIENT ROBUSTNESS OK (chromium + webkit)' : '\nCLIENT ROBUSTNESS FAILED');
process.exit(allPass ? 0 : 1);
