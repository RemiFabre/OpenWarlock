// End-to-end check: spins up real WebSocket clients against a running server,
// plays a game, and asserts the flow works. Usage:
//   node test/integration.js [port]
// Exits 0 on success, 1 on failure.

import WebSocket from 'ws';

const PORT = process.argv[2] || 3123;
const URL = `ws://localhost:${PORT}`;

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
const timeout = setTimeout(() => fail('timed out after 120 s'), 120_000);

class Client {
  constructor(name) {
    this.name = name;
    this.id = null;
    this.snap = null;
    this.events = [];
    this.ws = new WebSocket(URL);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'welcome') this.id = m.id;
      if (m.t === 'snap') { this.snap = m.s; this.events.push(...m.e); }
    });
    this.ready = new Promise((res) => this.ws.on('open', res));
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  me() { return this.snap && this.id ? this.snap.players[this.id] : null; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond, what, ms = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return;
    await sleep(50);
  }
  fail(`waiting for ${what}`);
}

const a = new Client('Aggro');
const b = new Client('Victim');
await Promise.all([a.ready, b.ready]);
a.send({ t: 'join', name: 'Aggro' });
b.send({ t: 'join', name: 'Victim' });

await waitFor(() => a.id && b.id && a.snap, 'welcome + first snapshot');
console.log('joined:', a.id, b.id);
if (a.snap.phase !== 'lobby') fail(`expected lobby, got ${a.snap.phase}`);

a.send({ t: 'ready', ready: true });
b.send({ t: 'ready', ready: true });
await waitFor(() => a.snap.phase === 'countdown' || a.snap.phase === 'battle', 'game start');
console.log('game started');

await waitFor(() => a.snap.phase === 'battle', 'battle phase');

// Aggro hunts Victim: move toward it and fireball at it. Victim runs to center.
const hunt = setInterval(() => {
  if (!a.snap || a.snap.phase !== 'battle') return;
  const meA = a.me(), meB = b.snap && b.me();
  if (!meA || !meB || !meA.alive || !meB.alive) return;
  a.send({ t: 'move', x: meB.x * 0.7, y: meB.y * 0.7 });
  a.send({ t: 'cast', key: 'fireball', x: meB.x, y: meB.y });
  b.send({ t: 'move', x: 0, y: 0 });
}, 150);

// A hit should land soon
await waitFor(
  () => b.me() && b.me().hp < b.me().maxHp,
  'Victim taking damage', 30_000
);
console.log('damage landed, victim hp:', b.me().hp);

// Round should eventually end (kill or lava), entering shop or another round
await waitFor(
  () => ['shop', 'gameover'].includes(a.snap.phase),
  'round end', 110_000
);
clearInterval(hunt);
console.log('round ended, phase:', a.snap.phase);

const killer = a.me();
const scoreOk = Object.values(a.snap.players).some((p) => p.kills > 0);
if (!scoreOk) console.log('note: round ended by mutual lava death, no kill credit');
console.log('gold:', killer.gold, 'score:', killer.score, 'kills:', killer.kills);

// Buy something in the shop
if (a.snap.phase === 'shop') {
  const goldBefore = a.me().gold;
  a.send({ t: 'buy', id: 'boots' });
  await waitFor(() => (a.me().items.boots || 0) > 0, 'boots purchase', 10_000);
  console.log(`bought boots (${goldBefore} -> ${a.me().gold} gold)`);
}

// Disconnect one player: server should keep running and the other stays seated
b.ws.close();
await sleep(500);
if (!a.snap.players[a.id]) fail('player A vanished after B left');

console.log('\nINTEGRATION OK');
clearTimeout(timeout);
process.exit(0);
