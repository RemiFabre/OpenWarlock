// Render client/sfx.js effects to WAV files so a human (or an agent that
// cannot hear) can A/B them without launching a game.
//
//   node tools/sfx-render.js                     # every FX in sfx.js
//   node tools/sfx-render.js anger angerBell ding
//   node tools/sfx-render.js --dur=1.2 multikill # longer window
//   -> tools/sfx-out/<name>.wav   (then: afplay -v 3 tools/sfx-out/anger.wav)
//
// How: a headless browser renders the REAL module through an OfflineAudioContext
// (so what you hear is exactly what ships, master gain included). sfx.js caches
// its context in module scope, so each sound gets a freshly imported copy via a
// cache-busting query string.

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'sfx-out');
const args = process.argv.slice(2);
const durArg = args.find(a => a.startsWith('--dur='));
const DUR = durArg ? Number(durArg.slice(6)) : 2.0;   // seconds rendered per sound
const names = args.filter(a => !a.startsWith('--'));

const HARNESS = `<!doctype html><meta charset="utf-8"><title>sfx render</title>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html' }).end(HARNESS);
    return;
  }
  const file = path.join(ROOT, url.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': 'text/javascript' }).end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/?nobeacon=1`);
// ⚠ playSfx's per-effect throttle compares performance.now() against 0 for an
// unheard effect, so ANY sound fired within 45 ms of page load is dropped and
// renders as silence. Wait the page out of that window once, up front.
await page.waitForTimeout(120);

// The renderer, in the page: swap in an OfflineAudioContext, import a fresh copy
// of sfx.js, fire one effect, render, and hand back a base64 WAV.
const render = (name, dur, v) => page.evaluate(async ([name, dur, v]) => {
  let ctx = null;
  // ⚠ state/resume are overridden on purpose: sfx.js resumes a 'suspended'
  // context, and resume() on an OfflineAudioContext STARTS the render, which
  // races startRendering() and hands back a silent buffer.
  window.AudioContext = class extends OfflineAudioContext {
    constructor() { super(1, Math.ceil(48000 * dur), 48000); ctx = this; }
    get state() { return 'running'; }
    resume() { return Promise.resolve(); }
  };
  const m = await import(`/client/sfx.js?v=${v}`);
  m.setMuted(false);
  m.initSfx();
  const known = m.playSfx(name);
  m.playSfx(name, 4);           // multikill takes a streak arg; harmless elsewhere
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  // 16-bit mono PCM WAV
  const bytes = new Uint8Array(44 + d.length * 2);
  const dv = new DataView(bytes.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + d.length * 2, true); str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++)
    dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return { wav: btoa(s), peak, known: known !== false };
}, [name, dur, v]);

// the FX names live in sfx.js; read them once so "no args" means "all of them"
const all = fs.readFileSync(path.join(ROOT, 'client', 'sfx.js'), 'utf8')
  .split('const FX = {')[1].split('\n};')[0]
  .split('\n').map(l => /^\s{2}(\w+)\(/.exec(l)).filter(Boolean).map(m => m[1]);
const wanted = names.length ? names : all;
const unknown = wanted.filter(n => !all.includes(n));
if (unknown.length) console.log(`⚠ not in sfx.js: ${unknown.join(', ')}\n  known: ${all.join(' ')}`);

fs.mkdirSync(OUT, { recursive: true });
let v = 0;
for (const name of wanted.filter(n => all.includes(n))) {
  const { wav, peak } = await render(name, DUR, ++v);
  const file = path.join(OUT, `${name}.wav`);
  fs.writeFileSync(file, Buffer.from(wav, 'base64'));
  console.log(`${name.padEnd(12)} peak ${peak.toFixed(3)}  ${path.relative(ROOT, file)}`);
}
await browser.close();
server.close();
console.log(`\nplay one:  afplay -v 3 tools/sfx-out/anger.wav`);
console.log(`play all:  for f in tools/sfx-out/*.wav; do echo $f; afplay -v 3 $f; done`);
