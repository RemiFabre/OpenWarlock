// Drive the real client from a script, and ASK the canvas what it drew.
//
// Why this exists: verifying "does the new thing actually render" used to mean
// re-writing the same Playwright boilerplate (join → bots → sandbox gold →
// ready → buy → press a key) and then screenshotting a burst of frames and
// eyeballing them. Screenshots are by far the most expensive thing an agent
// reads, and a 1.5 s effect usually falls between two of them.
//
// So: `probe()` reads the canvas pixels IN THE PAGE and returns a count. You
// poll a colour signature until it appears, and only then take ONE screenshot,
// already cropped to what you care about. Cheap, and it never misses a window.
//
// Used as a library by a throwaway script:
//
//   import { arena } from './tools/shot.js';
//   const A = await arena({ players: 2, bots: 1, gold: 200, out: '/tmp/x' });
//   await A.buy(A.p[0], 'ember', 3);
//   await A.start();
//   await A.hold(A.p[0], 'q', 900, { x: 900, y: 400 });
//   const hit = await A.waitFor(A.p[0], { r: [130, 180], g: [200, 245], b: [230, 256] });
//   if (hit) await A.snap(A.p[0], 'charged', { crop: hit.box });
//   await A.close();
//
// Self-test (proves the whole path works, including the probe):
//   node tools/shot.js --self-test

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SHOT_BASE || 'http://localhost:3000';

async function serverUp(url) {
  try { const r = await fetch(`${url}/health`); return r.ok; } catch { return false; }
}

export async function arena(opts = {}) {
  const {
    players = 2, bots = 0, gold = 0, out = '/tmp/shot',
    viewport = { width: 1280, height: 800 }, names = null,
  } = opts;
  mkdirSync(out, { recursive: true });

  // reuse a server if one is already up (Remi may be hosting; never kill it)
  let child = null;
  if (!await serverUp(BASE)) {
    child = spawn(process.execPath, ['server/index.js'],
      { stdio: 'ignore', env: { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '' } });
    for (let i = 0; i < 40 && !await serverUp(BASE); i++) await new Promise(r => setTimeout(r, 250));
  }

  const errors = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  const p = [];
  for (let i = 0; i < players; i++) {
    const page = await ctx.newPage();
    const who = (names && names[i]) || `P${i + 1}`;
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); });
    await page.goto(`${BASE}/?nobeacon=1`);
    await page.fill('#name', who);
    await page.click('#joinBtn');
    await page.waitForSelector('#lobby:not(.hidden)', { timeout: 15000 });
    p.push(page);
  }
  for (let i = 0; i < bots; i++) {
    await p[0].click('#botBtns button');
    await p[0].waitForTimeout(200);
  }
  if (gold > 0) {
    // the sandbox flag became a segmented toggle in round 22.1
    await p[0].click('#testSeg button[data-v="on"]');
    await p[0].fill('#testingGold', String(gold));
    await p[0].waitForTimeout(300);
  }

  const A = {
    p, errors, out,
    // Ready everyone up. With `gold` the game opens in the untimed sandbox shop
    // (call start() when you are done buying); without it, this waits out the
    // countdown too, so it returns with the round ACTUALLY live; casting during
    // the countdown is silently refused, which reads as "my feature is broken".
    async ready() {
      for (const page of p) await page.click('#readyBtn');
      if (gold > 0) {
        await p[0].waitForSelector('#shop:not(.hidden)', { timeout: 20000 });
        await p[0].waitForTimeout(600);
      } else {
        await p[0].waitForSelector('#lobby.hidden', { state: 'attached', timeout: 20000 });
        await p[0].waitForTimeout(4200);
      }
    },
    async buy(page, key, times = 1) {
      for (let i = 0; i < times; i++) {
        await page.click(`#shopGrid [data-key="${key}"]`);
        await page.waitForTimeout(220);
      }
    },
    // leave the shop and wait out the countdown
    async start() {
      for (const page of p) await page.click('#shopReadyBtn').catch(() => {});
      await p[0].waitForTimeout(4200);
    },
    async walk(page, x, y) { await page.mouse.click(x, y, { button: 'right' }); },
    async tap(page, key, aim) {
      if (aim) await page.mouse.move(aim.x, aim.y);
      await page.keyboard.press(key);
    },
    // press-and-hold, for the charged casts
    async hold(page, key, ms, aim) {
      if (aim) await page.mouse.move(aim.x, aim.y);
      await page.keyboard.down(key);
      await page.waitForTimeout(ms);
      await page.keyboard.up(key);
    },
    // Count canvas pixels inside the rgb ranges, and report where they are.
    // `range` is {r:[lo,hi], g:[lo,hi], b:[lo,hi]}; omit a channel to ignore it.
    // `rect` narrows the search (do use one; it is both faster and the only way
    // to keep scenery out of the signature). `pad` is the margin around the hit
    // that `box` reports.
    async probe(page, range, { rect = null, pad = 45 } = {}) {
      return page.evaluate(({ range, rect, pad }) => {
        const c = document.getElementById('game');
        if (!c) return { error: 'no #game canvas' };
        const g = c.getContext('2d');
        const R = rect || { x: 0, y: 0, w: c.width, h: c.height };
        let data;
        try { data = g.getImageData(R.x, R.y, R.w, R.h).data; }
        catch (e) { return { error: String(e.message || e) }; }
        const inRange = (v, band) => !band || (v >= band[0] && v <= band[1]);
        let n = 0, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (let i = 0; i < data.length; i += 4) {
          if (!inRange(data[i], range.r) || !inRange(data[i + 1], range.g) ||
              !inRange(data[i + 2], range.b)) continue;
          const px = (i / 4) % R.w, py = ((i / 4) / R.w) | 0;
          n++;
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
        if (!n) return { n: 0 };
        return {
          n,
          box: {
            x: Math.max(0, R.x + minX - pad), y: Math.max(0, R.y + minY - pad),
            width: Math.min(c.width, maxX - minX + pad * 2),
            height: Math.min(c.height, maxY - minY + pad * 2),
          },
        };
      }, { range, rect, pad });
    },
    // Poll until at least `min` matching pixels appear. Returns the probe hit,
    // or null on timeout; a null is a real answer ("it never drew"), not a
    // crash, so a caller can assert on it.
    // ⚠ For anything that MOVES FAST (a projectile), trust the count and skip
    // the picture: a screenshot lands ~200 ms after the probe, which is far
    // enough for a ball to leave a tight crop. Use a big `pad`, or just assert
    // on `hit.n`. For static tells (bars, rings, halos, shop cards) the
    // cropped shot is exact.
    async waitFor(page, range, { min = 25, timeout = 6000, every = 120, rect = null, pad = 45 } = {}) {
      const until = Date.now() + timeout;
      while (Date.now() < until) {
        const hit = await A.probe(page, range, { rect, pad });
        if (hit.error) throw new Error(`probe: ${hit.error}`);
        if (hit.n >= min) return hit;
        await page.waitForTimeout(every);
      }
      return null;
    },
    // One screenshot, optionally cropped to a probe's box; read THIS, not a burst
    async snap(page, name, { crop = null } = {}) {
      const path = `${out}/${name}.png`;
      await page.screenshot({ path, ...(crop ? { clip: crop } : {}) });
      return path;
    },
    async close() {
      await browser.close();
      if (child) child.kill();
    },
  };
  return A;
}

if (process.argv.includes('--self-test')) {
  // Drives a real 2-player game and asks the canvas whether a fireball's ORANGE
  // TRAIL was ever drawn, inside a rect well within the platform. ⚠ Both halves
  // of that matter: white would also match the name plates, and searching the
  // whole canvas would match the lava rim. A signature is only useful if
  // nothing else on screen shares it.
  const A = await arena({ players: 2, bots: 0, gold: 0, out: '/tmp/shot-selftest' });
  await A.ready();
  let seen = null;
  for (let i = 0; i < 6 && !seen; i++) {
    await A.tap(A.p[0], 'q', { x: 900, y: 380 });
    // Calibrated, not guessed: this band reads 0 on the idle arena inside this
    // rect, and ~35 when a ball crosses it. Do the same for any new signature;
    // sample the scene WITHOUT the effect first, or you are measuring scenery.
    seen = await A.waitFor(A.p[0], { r: [250, 255], g: [150, 200], b: [60, 120] },
      { min: 12, timeout: 1600, rect: { x: 500, y: 300, w: 300, h: 200 }, pad: 150 });
    await A.p[0].waitForTimeout(1600);
  }
  console.log(seen ? `probe saw the ball: ${seen.n} px at ${JSON.stringify(seen.box)}`
    : 'probe never saw a ball');
  // The PASS is the count. The picture is written for a human, and for a ball
  // this fast it may well be empty by the time the shutter closes, which is
  // the whole reason the probe exists.
  if (seen) console.log('cropped shot (may lag a fast ball):',
    await A.snap(A.p[0], 'ball', { crop: seen.box }));
  console.log('page errors:', A.errors.length ? A.errors.slice(0, 3) : 'none');
  await A.close();
  process.exit(seen ? 0 : 1);
}
