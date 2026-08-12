// tools/slowlink.js — what a player on a thin link actually experiences.
//
// The round-21.9 bug this was built for: one remote friend got progressively
// jerkier as the rounds went on while another was fine. The snapshot stream
// grows all game (a permanent pillar list re-sent 15×/s), the ws adapter had no
// compression and no way to fall behind except queueing forever, so whoever ran
// out of downlink first fell behind and never recovered.
// history: docs/history/2026-08-12-snapshot-bandwidth.md
//
// It spawns a REAL server, seats N normal clients plus one whose socket is
// rate-limited, has everyone spam Stone Pillars to grow the payload the way a
// long game does, and reports whether the throttled seat kept up. It runs the
// four wire configurations in sequence so the table is self-comparing.
//
//   node tools/slowlink.js                       # the default 4-config table
//   node tools/slowlink.js --rate=25 --seconds=45
//   node tools/slowlink.js --only=both           # one configuration
//
// --rate is the throttled seat's downlink in KB/s. Everything else in the game
// is untouched: this lab only reads the wire.

import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { SNAPSHOT_RATE } from '../shared/constants.js';
import { createSnapSink } from '../shared/snapwire.js';

const arg = (n, d) => {
  const a = process.argv.find(x => x.startsWith(`--${n}=`));
  return a ? a.split('=')[1] : d;
};
const RATE_KBS = Number(arg('rate', 25));      // the thin link, in KB/s
const SECONDS = Number(arg('seconds', 30));
const SEATS = Number(arg('seats', 3));         // normal seats beside the thin one
const PORT = Number(arg('port', 3998));
const ONLY = arg('only', null);
const GOLD = Number(arg('gold', 400));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CONFIGS = [
  { key: 'raw', label: 'neither (the round-21.9 build)', deflate: false, delta: false },
  { key: 'deflate', label: 'permessage-deflate only', deflate: true, delta: false },
  { key: 'delta', label: 'delta snapshots only', deflate: false, delta: true },
  { key: 'both', label: 'deflate + delta (shipped)', deflate: true, delta: true },
];

// One client. `rateKBs` null = drain as fast as the socket delivers.
// ⚠ The throttle counts TCP bytes (`_socket.bytesRead`), not decompressed
// message bytes — throttling the latter would hide permessage-deflate entirely,
// which is one of the four things this lab exists to compare. Leaky bucket at
// 10 Hz: a tick that overruns its allowance carries the debt into the next one,
// so the average really is `rateKBs`.
function seat({ name, delta, rateKBs, port }) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { name, ws, appBytes: 0, wireBytes: 0, applied: 0, myId: null, last: null };
  const up = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const sink = createSnapSink(
    (m) => { c.applied++; c.last = m.s; },
    () => up({ t: 'full' }),
    { ack: (q) => up({ t: 'ack', q }) },   // exactly what client/transport.js does
  );
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, ...(delta ? { dv: 1 } : {}) })));
  ws.on('message', (raw) => {
    c.appBytes += raw.length;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'welcome') { c.myId = m.id; return; }
    sink.take(m);
  });
  ws.on('error', () => { });
  let lastRead = 0, debt = 0;
  const allowance = rateKBs == null ? 0 : rateKBs * 1024 / 10;
  c.tick = setInterval(() => {
    const sock = ws._socket;
    if (!sock) return;
    c.wireBytes = sock.bytesRead;
    if (rateKBs == null) return;
    debt = Math.max(0, debt + (sock.bytesRead - lastRead) - allowance);
    lastRead = sock.bytesRead;
    if (debt > 0 && !sock.isPaused()) sock.pause();
    else if (debt === 0 && sock.isPaused()) sock.resume();
  }, 100);
  c.send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  return c;
}

// Deterministic pillar spam: the same cast sequence in every configuration, so
// the four rows describe the wire and nothing else.
let castN = 0;
function spamPillars(clients) {
  for (const c of clients) {
    const me = c.last && c.myId && c.last.players && c.last.players[c.myId];
    if (!me || !me.alive || c.last.phase !== 'battle') continue;
    if ((me.cooldowns && me.cooldowns.pillar) > 0) continue;
    const a = (castN++) * 2.39996, r = 8 + (castN % 30);
    c.send({ t: 'cast', key: 'pillar', x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
}

async function run(cfg) {
  const srv = spawn('node', ['server/index.js', `--port=${PORT}`, '--seed=1'], {
    stdio: 'ignore',
    env: { ...process.env, ...(cfg.deflate ? {} : { WS_DEFLATE: '0' }) },
  });
  await sleep(1200);

  const fast = Array.from({ length: SEATS }, (_, i) =>
    seat({ name: `fast${i}`, delta: cfg.delta, rateKBs: null, port: PORT }));
  const slow = seat({ name: 'thin', delta: cfg.delta, rateKBs: RATE_KBS, port: PORT });
  const all = [...fast, slow];
  await sleep(600);

  // testing sandbox: chosen gold, the game opens in an untimed shop, so every
  // seat can actually buy the Stone Pillar this lab needs
  fast[0].send({ t: 'testing', on: true, gold: GOLD });
  await sleep(300);
  for (const c of all) c.send({ t: 'ready', ready: true });
  await sleep(800);
  for (const c of all) { c.send({ t: 'buy', id: 'pillar' }); c.send({ t: 'buy', id: 'pillar' }); }
  await sleep(400);
  for (const c of all) c.send({ t: 'ready', ready: true });

  const t0 = Date.now();
  let worstLag = 0, lagSamples = 0, lagSum = 0;
  const spam = setInterval(() => spamPillars(all), 200);
  const ready = setInterval(() => { for (const c of all) if (c.last && c.last.phase === 'shop') c.send({ t: 'ready', ready: true }); }, 500);
  const probe = setInterval(() => {
    const live = fast[0].last, thin = slow.last;
    if (!live || !thin || live.phase !== 'battle' || thin.phase !== 'battle') return;
    const lag = live.time - thin.time;      // the same game clock, two seats
    if (lag > worstLag) worstLag = lag;
    lagSum += Math.max(0, lag); lagSamples++;
  }, 100);

  await sleep(SECONDS * 1000);
  clearInterval(spam); clearInterval(ready); clearInterval(probe);

  const health = await fetch(`http://127.0.0.1:${PORT}/health`).then(r => r.json()).catch(() => null);
  const skipped = health && Array.isArray(health.wire)
    ? Math.max(0, ...health.wire.map(w => w.skipped || 0)) : 0;
  const secs = (Date.now() - t0) / 1000;
  const out = {
    ...cfg,
    pillars: (fast[0].last && fast[0].last.pillars && fast[0].last.pillars.length) || 0,
    fastKBs: fast[0].wireBytes / 1024 / secs,
    fastAppKBs: fast[0].appBytes / 1024 / secs,
    fastHz: fast[0].applied / secs,
    thinKBs: slow.wireBytes / 1024 / secs,
    thinHz: slow.applied / secs,
    // ⚠ null, never 0: a seat so starved it never received a single battle
    // state has NO samples, and printing that as "0.00 s behind" reads as the
    // best possible result when it is the worst.
    worstLag: lagSamples ? worstLag : null,
    avgLag: lagSamples ? lagSum / lagSamples : null,
    skipped,
  };
  for (const c of all) { clearInterval(c.tick); try { c.ws.close(); } catch { } }
  srv.kill();
  await sleep(400);
  return out;
}

const rows = [];
for (const cfg of CONFIGS) {
  if (ONLY && cfg.key !== ONLY) continue;
  process.stderr.write(`running ${cfg.key}…\n`);
  rows.push(await run(cfg));
}

console.log(`\ntools/slowlink.js — ${SEATS + 1} seats, one of them throttled to ${RATE_KBS} KB/s,`);
console.log(`${SECONDS}s per configuration, every seat spamming Stone Pillars (same cast order each run).`);
console.log('\nEach row is ONE wire configuration. Columns:');
console.log('  pillars   = on the map when the run ended (the payload driver)');
console.log(`  full seat = TCP KB/s down and applied snapshots/s for an UNTHROTTLED seat`);
console.log(`              (${SNAPSHOT_RATE} Hz is the send rate, so ~${SNAPSHOT_RATE} Hz = keeping up)`);
console.log(`  thin seat = the same two numbers for the ${RATE_KBS} KB/s seat`);
console.log('  behind    = how far behind the live game its newest state was, avg / worst, in seconds');
console.log('              — this is the number the player feels as jerkiness.');
console.log('              "never" = it received no battle state at all, which is worse than any number');
console.log('  skipped   = snapshots the server dropped for it on purpose rather than queueing\n');
console.log('configuration                       pillars   full seat          thin seat          behind (avg/worst)  skipped');
for (const r of rows)
  console.log(
    r.label.padEnd(34),
    String(r.pillars).padStart(6),
    `${r.fastKBs.toFixed(0).padStart(5)} KB/s ${r.fastHz.toFixed(1).padStart(4)} Hz`,
    `  ${r.thinKBs.toFixed(0).padStart(5)} KB/s ${r.thinHz.toFixed(1).padStart(4)} Hz`,
    r.avgLag == null ? '        never      ' : `   ${r.avgLag.toFixed(2).padStart(5)} / ${r.worstLag.toFixed(2).padStart(5)} s`,
    String(r.skipped).padStart(8),
  );
console.log('\n⚠ What this cannot see: it is one machine, so the only impairment is');
console.log('  bandwidth — no jitter, no packet loss, and no WebRTC path (that one is');
console.log('  unreliable+unordered and fails differently). Absolute KB/s scales with the');
console.log('  pillar count reached, so compare rows, not runs.');
