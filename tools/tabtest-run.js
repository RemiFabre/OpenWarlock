// B0 gate driver (docs/BRIEF-browser-hosting.md §B0): measures whether a 30 Hz
// loop survives a BACKGROUNDED Chrome tab. Spawns a real Chrome binary with a
// scratch profile — NOT playwright: playwright emulates focus on every page, so
// background tabs never report hidden and never throttle, which silently
// invalidates the whole measurement (found 2026-08-09). The page beacons its
// numbers back over HTTP instead (tabtest.html ?beacon=1).
//
//   node tools/tabtest-run.js            (10 min, the gate's duration)
//   MINUTES=2 node tools/tabtest-run.js  (smoke; Chrome's INTENSIVE throttling
//                                         only starts at 5 min — never gate on a smoke run)
//   CHROME=/path/to/chrome node tools/tabtest-run.js   (default: playwright's Chrome for Testing)
//
// ⚠ opens a real browser window (small, top-left) for the duration.
// Safari and phones cannot be driven from here — open tools/tabtest.html there
// by hand (append ?v=<variant>) and read the on-page report.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4530);
const MINUTES = Number(process.env.MINUTES || 10);
const VARIANTS = ['interval', 'worker', 'worker-audio', 'worker-rtc'];
const CHROME = process.env.CHROME ||
  '/Users/remi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const latest = {}; // variant -> last cumulative report
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST' && u.pathname === '/beacon') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { latest[u.searchParams.get('v')] = JSON.parse(body); } catch { }
      res.writeHead(204); res.end();
    });
    return;
  }
  fs.readFile(path.join(ROOT, 'tools/tabtest.html'), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, r));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tabtest-profile-'));
const url = (v, extra = '') => `http://localhost:${PORT}/?v=${v}&beacon=1${extra}`;
// all URLs open as tabs of ONE window; Chrome activates the LAST one, so the
// four variants are background tabs from the start
const chrome = spawn(CHROME, [
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-sync',
  '--autoplay-policy=no-user-gesture-required', // lets worker-audio start itself
  '--window-size=440,340', '--window-position=24,24',
  url('interval'), url('worker'), url('worker-audio', '&auto=1'), url('worker-rtc'),
  `http://localhost:${PORT}/?v=front`,
], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

console.log(`real Chrome spawned (pid ${chrome.pid}), 4 variant tabs backgrounded for ${MINUTES} min`);
console.log('(Chrome throttles hidden-tab timers to 1 Hz immediately and to 1/min after 5 min — the gate is the 10 min run)');

const t0 = Date.now();
while (Date.now() - t0 < MINUTES * 60_000) {
  await new Promise((r) => setTimeout(r, 60_000));
  const mins = ((Date.now() - t0) / 60_000).toFixed(0);
  const line = VARIANTS.map((v) => {
    const r = latest[v];
    return `${v}=${r ? `${r.hiddenLastHz}Hz` : 'no beacon yet'}`;
  });
  console.log(`  ${mins} min: ${line.join('  ')}`);
}

console.log('\n== B0 report (Hz per 10 s bucket while the tab was hidden; target 30, gate >= 25 sustained) ==');
for (const v of VARIANTS) {
  const r = latest[v];
  if (!r) { console.log(`\n${v}: NO DATA (beacon never arrived)`); continue; }
  const hiddenHz = r.buckets.filter(b => b.hidden).map(b => b.hz);
  console.log(`\n${v}  (page visibility at last beacon: ${r.visibility})`);
  console.log(`  hidden buckets: ${hiddenHz.join(' ')}`);
  console.log(`  min ${r.hiddenMinHz} Hz · last ${r.hiddenLastHz} Hz -> ${r.hiddenLastHz >= 25 ? 'PASS' : 'FAIL'} (>=25 Hz backgrounded)`);
}
const file = path.join(process.env.OUT || ROOT, 'tabtest-report.json');
fs.writeFileSync(file, JSON.stringify({ minutes: MINUTES, chrome: CHROME, out: latest }, null, 2));
console.log(`\nfull report: ${file}`);
cleanup();
server.close();
process.exit(0);
