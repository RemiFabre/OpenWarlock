// tools/rtclab.js: what a Host-online guest actually experiences over a game.
//
// Built for the round-21.11 question: one friend degrades progressively on the
// RTC path while another is fine, and tools/slowlink.js cannot see it (ws only,
// bandwidth only). This lab runs the REAL engine, the real createSnapWire host
// half and createSnapSink guest half, through a modeled two-channel link per
// guest:
//   ctrl  reliable + ORDERED  = a lost chunk stalls everything behind it one
//                               retransmit; big messages queue ahead of small
//   snap  unreliable+unordered = losing ANY chunk of a message drops all of it
// with a shared host uplink, per-guest downlink, RTT + jitter, and bursty
// (Gilbert-Elliott) chunk loss. Sends mirror transport.js sendTo(); keep them
// in sync by hand, there are ~6 lines of policy.
//
//   node tools/rtclab.js                     # 1 host + 3 profiled guests
//   node tools/rtclab.js --guests=dsl:250/45/1 --minutes=8
//
// --guests = name:downKBs/rttMs/loss% per guest, comma-separated.
// --up     = host uplink KB/s (shared by everyone; the host tab IS the server).
// --echo   = 1|0: cadence keyframes ride beside the delta (shipped) vs
//            replacing it (pre-21.11: the keyframe race). The 21.10 hot-spare
//            stream is gone from the game and from here; its cost is on record
//            in docs/history/2026-08-12-rtc-lag-rootcause.md.
// ⚠ What this cannot see: it is arithmetic, not SCTP; no congestion control
// (real loss also collapses the send window, so real harm is WORSE), no browser
// scheduling, and guest inputs reach the engine with zero delay. Trends and
// mechanisms are trustworthy; absolute numbers are a floor on the harm.

import { createEngine } from '../shared/engine.js';
import { createSnapWire, createSnapSink, createGapTracker } from '../shared/snapwire.js';
import { TICK_RATE, SNAPSHOT_RATE } from '../shared/constants.js';

const arg = (n, d) => {
  const a = process.argv.find(x => x.startsWith(`--${n}=`));
  return a ? a.split('=')[1] : d;
};
const UP_KBS = Number(arg('up', 1250));        // 10 Mbit/s host uplink
const MINUTES = Number(arg('minutes', 25));    // sim cap; the game usually ends first
const ECHO = arg('echo', '1') !== '0';
// The PLAYOUT tracker each guest renders with (createGapTracker): 'step' is
// the shipped peak-hold (a jitter spike REWINDS the drawn world in one frame),
// 'slew' the bounded-walk fix. The rew/freeze columns price the difference.
const TRACKER = arg('tracker', 'step');
const GUESTS = arg('guests', 'fiber:2500/12/0.3,cable:1000/25/1,dsl:250/45/1')
  .split(',').map(s => {
    const [name, spec] = s.split(':');
    const [down, rtt, loss] = spec.split('/').map(Number);
    return { name, downKBs: down, rttMs: rtt, loss: loss / 100 };
  });
const CHUNK = 1200;                            // ~one SCTP chunk on the wire
const DT = 1 / TICK_RATE;

// deterministic rng: same run every time, like every lab here
let rngS = 21;
const rng = () => (rngS = (rngS * 1664525 + 1013904223) >>> 0) / 2 ** 32;

// Bursty loss: Gilbert-Elliott, loss only inside BAD spells (60% there, mean
// spell ~3 chunks), tuned so the long-run average hits the asked-for rate.
function makeLoss(avg) {
  if (avg <= 0) return () => false;
  const inBad = 0.6, stayBad = 0.7;
  const piBad = Math.min(0.9, avg / inBad);
  const toBad = piBad * (1 - stayBad) / (1 - piBad);
  let bad = false;
  return () => {
    bad = rng() < (bad ? stayBad : toBad);
    return bad && rng() < inBad;
  };
}

// One guest's pipe. Chunks wait for the SHARED uplink, then for this guest's
// downlink, then fly one-way-delay; ctrl chunks lost are re-sent one RTO later,
// snap messages die whole on any chunk loss. `queued` per channel is what the
// host would read as bufferedAmount.
function makeGuest(cfg, id) {
  return {
    id, cfg, lose: makeLoss(cfg.loss),
    queued: { ctrl: 0, snap: 0 },
    downFreeAt: 0,            // serial downlink: when the pipe next frees up
    ctrlDone: 0,              // ordered delivery horizon (seconds)
    inbox: [],                // {at, msg} ready to parse
    // metrics for the current report bucket
    m: { applied: 0, kf: 0, fulls: 0, staleSum: 0, staleMax: 0, ctrlB: 0, snapB: 0 },
    sink: null,
    // the playout layer: what this guest's EYES get (times in ms, like the client)
    tracker: createGapTracker({ intervalMs: 1000 / SNAPSHOT_RATE, mode: TRACKER }),
    prevRt: null, lastArriveMs: null,
  };
}

// send one message down a guest's channel; returns nothing, delivery lands in
// guest.inbox. `now` and all times in seconds.
const upQ = [];   // shared uplink FIFO: {g, ch, bytes...}
function send(g, ch, str, now) {
  const msg = { g, ch, bytes: str.length, str, chunksLeft: Math.ceil(str.length / CHUNK), arriveAt: 0, dead: false };
  g.queued[ch] += str.length;
  for (let i = 0; i < msg.chunksLeft; i++) upQ.push({ msg, sentAt: now });
  g.m[ch === 'ctrl' ? 'ctrlB' : 'snapB'] += str.length;
}

let upDebt = 0, dbgN = 0;
function pumpNet(now) {
  // uplink: drain what 10 Mbit (or --up) allows this tick, FIFO like a socket
  let budget = UP_KBS * 1024 * DT + upDebt;
  while (upQ.length && budget >= CHUNK) {
    const { msg } = upQ.shift();
    budget -= CHUNK;
    const g = msg.g;
    g.queued[msg.ch] -= Math.min(CHUNK, msg.bytes - (msg.chunksDone || 0) * CHUNK);
    msg.chunksDone = (msg.chunksDone || 0) + 1;
    // downlink is serial: this chunk transmits when the pipe frees up
    const owd = g.cfg.rttMs / 2000 + rng() * 0.004;
    g.downFreeAt = Math.max(g.downFreeAt, now) + CHUNK / (g.cfg.downKBs * 1024);
    let at = g.downFreeAt + owd;
    if (g.lose()) {
      if (msg.ch === 'snap') msg.dead = true;              // no retransmit there
      else at += g.cfg.rttMs / 1000 * 1.5 + 0.05;          // one RTO stall
      if (msg.ch === 'ctrl' && g.lose()) at += g.cfg.rttMs / 1000 * 1.5 + 0.05; // twice unlucky
    }
    msg.arriveAt = Math.max(msg.arriveAt, at);
    if (--msg.chunksLeft === 0 && !msg.dead) {
      // ordered ctrl: nothing overtakes an earlier ctrl message
      if (msg.ch === 'ctrl') msg.arriveAt = g.ctrlDone = Math.max(g.ctrlDone, msg.arriveAt);
      g.inbox.push({ at: msg.arriveAt, msg });
    }
  }
  upDebt = upQ.length ? budget : 0; // unused budget only banks while draining
}

// ---- assemble the room: engine + one wire per guest, mirroring transport.js
const guests = GUESTS.map((c, i) => makeGuest(c, 'g' + (i + 1)));
const byId = new Map(guests.map(g => [g.id, g]));
const wires = new Map(guests.map(g => [g.id, createSnapWire({ echo: ECHO })]));
let now = 0;
const laterQ = [];  // guest->host acks/fulls, delayed one uplink OWD
const later = (at, fn) => laterQ.push({ at, fn });

const engine = createEngine({
  seed: 21,
  onSend: (connId, msg) => {
    const g = byId.get(connId);
    if (!g || msg.t !== 'snap') return;
    // the send policy, verbatim from client/transport.js sendTo():
    const w = wires.get(connId);
    const f = w.frame(msg, g.queued.snap);
    if (f.skipped && process.env.DEBUG_SKIP && dbgN < 40) {
      dbgN++;
      const s = w.stats();
      console.log(`skip t=${now.toFixed(1)} ${g.cfg.name} qsnap=${g.queued.snap} qctrl=${g.queued.ctrl} behind=${s.behind} floor=${s.floor} lastB=${s.lastBytes}`);
    }
    if (f.evt) send(g, 'ctrl', f.evt, now);
    if (f.state) send(g, f.full ? 'ctrl' : 'snap', f.state, now);
    if (f.key) send(g, 'ctrl', f.key, now);
  },
});

engine.join('p1', { name: 'host', avatar: '🧙' });
for (const g of guests) {
  engine.join(g.id, { name: g.cfg.name || g.id, avatar: '🧙' });
  g.sink = createSnapSink(
    (m) => {
      g.m.applied++;
      g.tracker.track(now * 1000); g.lastArriveMs = now * 1000;
      const stale = engine.game.time - (m.s.time || 0);
      if (engine.game.phase === 'battle' && stale >= 0) {
        g.m.staleSum += stale; g.m.staleMax = Math.max(g.m.staleMax, stale); g.m.staleN = (g.m.staleN || 0) + 1;
      }
    },
    () => { g.m.fulls++; later(now + g.cfg.rttMs / 2000, () => wires.get(g.id).requestFull()); },
    { ack: (q) => later(now + g.cfg.rttMs / 2000, () => wires.get(g.id).ack(q)), now: () => now * 1000 },
  );
  wires.get(g.id).requestFull();
}
engine.message('p1', { t: 'testing', on: true, gold: 400 });
for (const id of ['p1', ...guests.map(g => g.id)]) engine.message(id, { t: 'ready', ready: true });

// ---- run the game: everyone spams pillars, exactly like tools/slowlink.js
const snapEvery = Math.max(1, Math.round(TICK_RATE / SNAPSHOT_RATE));
const gm = () => engine.game;
let castN = 0, tick = 0, lastShop = false, lastReport = 0;
const BUCKET_S = 120;
console.log(`host uplink ${UP_KBS} KB/s · echo ${ECHO ? 'on' : 'off'} · guests: ` +
  GUESTS.map(g => `${g.name} ${g.downKBs}KB/s ${g.rttMs}ms ${(g.loss * 100).toFixed(1)}%`).join(' · '));
console.log(`\nHz = state updates applied per second (15 = keeping up, in battle only).`);
console.log('stale = host clock minus the state on the guest screen, battle only.');
console.log(`delay = renderDelay ms the guest plays with (tracker '${TRACKER}'; healthy = 132).`);
console.log('rew   = drawn-world REWIND events per battle-minute / total ms rewound.');
console.log('frz   = ms per battle-minute with nothing new to draw at the render time.');
console.log('min  guest   Hz     stale avg/max   delay   rew /ms      frz  fulls  wasted  skip  ctrl KB/s  snap KB/s  pillars');

function report() {
  const mins = `${Math.round(now / 60)}`.padStart(3);
  for (const g of guests) {
    const battleS = g.m.battleS || 1e-9;
    const hz = (g.m.appliedBattle || 0) / battleS;
    const stale = g.m.staleN ? g.m.staleSum / g.m.staleN : 0;
    const w = wires.get(g.id).stats();
    const bMin = battleS / 60 || 1e-9;
    console.log(`${mins}  ${String(g.cfg.name || g.id).padEnd(6)} ${hz.toFixed(1).padStart(5)}   ` +
      `${(stale.toFixed(2) + ' / ' + g.m.staleMax.toFixed(2)).padStart(13)}   ` +
      `${(g.m.delayN ? g.m.delaySum / g.m.delayN : 0).toFixed(0).padStart(5)}   ` +
      `${(((g.m.rew || 0) / bMin).toFixed(1) + '/' + ((g.m.rewMs || 0) / bMin).toFixed(0)).padStart(9)}  ` +
      `${((g.m.freezeMs || 0) / bMin).toFixed(0).padStart(6)}  ` +
      `${String(g.m.fulls).padStart(5)}  ${String(g.m.wasted || 0).padStart(6)}  ${String(w.skipped - (g.m.skip0 || 0)).padStart(4)}  ` +
      `${(g.m.ctrlB / 1024 / BUCKET_S).toFixed(1).padStart(9)}  ` +
      `${(g.m.snapB / 1024 / BUCKET_S).toFixed(1).padStart(9)}  ` +
      `${String((gm().pillars || []).length).padStart(7)}`);
    g.m = { applied: 0, kf: 0, fulls: 0, staleSum: 0, staleMax: 0, ctrlB: 0, snapB: 0, skip0: w.skipped };
  }
}

while (now < MINUTES * 60) {
  const inShop = gm().phase === 'shop';
  if (inShop && !lastShop) {
    for (const id of ['p1', ...guests.map(g => g.id)]) {
      engine.message(id, { t: 'buy', id: 'pillar' });
      engine.message(id, { t: 'ready', ready: true });
    }
  }
  lastShop = inShop;
  if (gm().phase === 'battle' && tick % 6 === 0) {
    for (const id of ['p1', ...guests.map(g => g.id)]) {
      const me = gm().players[id];
      if (!me || !me.alive || (me.cooldowns && me.cooldowns.pillar) > 0) continue;
      const a = (castN++) * 2.39996, r = 8 + (castN % 30);
      engine.message(id, { t: 'cast', key: 'pillar', x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
  }

  engine.tick(DT);
  if (++tick % snapEvery === 0) engine.pushSnapshots();
  pumpNet(now);
  for (let i = laterQ.length - 1; i >= 0; i--)
    if (laterQ[i].at <= now) { laterQ[i].fn(); laterQ.splice(i, 1); }
  for (const g of guests) {
    if (gm().phase === 'battle') g.m.battleS = (g.m.battleS || 0) + DT;
    g.inbox.sort((a, b) => a.at - b.at);
    while (g.inbox.length && g.inbox[0].at <= now) {
      const { msg } = g.inbox.shift();
      let m; try { m = JSON.parse(msg.str); } catch { continue; }
      const before = g.m.applied;
      g.sink.take(m);
      if (m.t === 'snap') {
        if (g.m.applied > before) { if (gm().phase === 'battle') g.m.appliedBattle = (g.m.appliedBattle || 0) + 1; }
        else g.m.wasted = (g.m.wasted || 0) + 1;           // stale, or a gap: base never arrived
      }
    }
    // the playout sample: what this guest DRAWS this tick (battle only, like stale)
    if (gm().phase === 'battle' && g.lastArriveMs != null) {
      const d = g.tracker.delay(now * 1000);
      const rt = now * 1000 - d;
      g.m.delaySum = (g.m.delaySum || 0) + d; g.m.delayN = (g.m.delayN || 0) + 1;
      if (g.prevRt != null && rt < g.prevRt - 1) { g.m.rew = (g.m.rew || 0) + 1; g.m.rewMs = (g.m.rewMs || 0) + (g.prevRt - rt); }
      if (rt > g.lastArriveMs) g.m.freezeMs = (g.m.freezeMs || 0) + DT * 1000;
      g.prevRt = rt;
    } else g.prevRt = null;
  }

  now += DT;
  if (now - lastReport >= BUCKET_S) { lastReport = now; report(); }
  if (gm().phase === 'gameover') break;   // the only end phase sim.js has
}
if (now - lastReport > 5) report(); // a near-empty final bucket prints as 0.00 = fake data
console.log(`\nended after ${(now / 60).toFixed(1)} min: phase=${gm().phase} round=${gm().round} pillars=${(gm().pillars || []).length}`);
