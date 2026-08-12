// Drives the real client in headless Chromium: two players join, ready up,
// play a bit, screenshot each stage. Also fails on any page JS error.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3123';
const OUT = '/private/tmp/claude-501/-Users-remi/4a6643e9-5f30-4135-8ea2-1267e386f092/scratchpad';
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

async function newPlayer(name) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.goto(BASE);
  await page.fill('#name', name);
  await page.click('#joinBtn');
  await page.waitForSelector('#lobby:not(.hidden)', { timeout: 5000 });
  return page;
}

const p1 = await newPlayer('Remi');
const p2 = await newPlayer('Rival');
await p1.waitForTimeout(400);
await p1.screenshot({ path: `${OUT}/1-lobby.png` });

// no lobby shop anymore; buying only happens during the shop phase
await p1.click('#readyBtn');
await p2.click('#readyBtn');
await p1.waitForSelector('#lobby.hidden', { state: 'attached', timeout: 5000 });
await p1.waitForTimeout(1000); // mid-countdown
await p1.screenshot({ path: `${OUT}/2-countdown.png` });

// battle: p1 moves and casts toward p2's side of the map
await p1.waitForTimeout(2500);
const c = { x: 640, y: 400 };
await p1.mouse.move(c.x + 120, c.y - 60);
await p1.mouse.click(c.x + 60, c.y, { button: 'right' });
for (let i = 0; i < 6; i++) {
  await p1.keyboard.press('q');
  await p2.keyboard.press('q');
  await p1.mouse.move(c.x + 100 - i * 30, c.y - 80 + i * 25);
  await p2.mouse.click(c.x - 50 + i * 20, c.y + 40, { button: 'right' });
  await p1.waitForTimeout(600);
}
await p1.screenshot({ path: `${OUT}/3-battle.png` });

// wait for a shop phase (someone dies eventually; lava shrinks in 75s)
try {
  await p1.waitForSelector('#shop:not(.hidden)', { timeout: 120000 });
  await p1.waitForTimeout(400);
  await p1.screenshot({ path: `${OUT}/4-shop.png` });
} catch { console.log('note: no shop phase reached in time'); }

if (errors.length) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('VISUAL OK, no page errors');
await browser.close();
