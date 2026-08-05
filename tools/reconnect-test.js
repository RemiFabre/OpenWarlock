// E2E check for reconnect persistence: a human joins a bot game, plays a
// round, buys an upgrade, drops the socket mid-game, rejoins under the same
// name — and must get their gold/score/build back. A different name must NOT
// inherit. Run: node tools/reconnect-test.js
import WebSocket from 'ws';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 3987);
// stderr is 'ignore', not 'inherit': an inherited pipe that outlives us keeps
// a piped stdout (`node tools/reconnect-test.js | tail`) open forever. Paired
// with the 'exit' hook below — process.exit() skips finally blocks, so that
// hook is the only reliable place to reap the server.
const srv = spawn('node', ['server/index.js', `--port=${PORT}`, '--seed=7'],
  { stdio: ['ignore', 'ignore', 'ignore'] });
process.on('exit', () => { try { srv.kill(); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => { try { srv.kill(); } catch { } process.exit(1); });
const url = `ws://localhost:${PORT}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function client() {
  const ws = new WebSocket(url);
  const c = {
    ws, id: null, snap: null, denied: null,
    open: new Promise(r => ws.on('open', r)),
    send: (o) => ws.send(JSON.stringify(o)),
    me() { return c.snap && c.id ? c.snap.players[c.id] : null; },
  };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.id = m.id;
    if (m.t === 'snap') c.snap = m.s;
    if (m.t === 'denied') c.denied = m.reason;
  });
  return c;
}

async function until(c, pred, timeoutS, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutS * 1000) {
    if (c.snap && pred(c)) return;
    await wait(150);
  }
  throw new Error(`timeout waiting for: ${what}`);
}

function assert(cond, what) {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok: ${what}`);
}

try {
  await wait(800); // server boot

  // -- join as remi, seat a bot, start the game
  const a = client();
  await a.open;
  a.send({ t: 'join', name: 'remi' });
  await until(a, c => c.id, 5, 'welcome');
  a.send({ t: 'addBot', kind: 'grunt', build: 'bruiser' });
  a.send({ t: 'ready', ready: true });
  await until(a, c => c.snap.phase === 'battle', 15, 'battle start');
  console.log('battle started');

  // -- idle through the round (the grunt or the lava finishes us), then shop
  await until(a, c => c.snap.phase === 'shop', 150, 'first shop');
  const me1 = a.me();
  assert(me1.spells.fireball === 1, 'starts with fireball lv1');
  a.send({ t: 'buy', id: 'fireball' });
  await until(a, c => c.me().spells.fireball === 2, 5, 'bought fireball lv2');
  const kept = a.me();
  console.log(`pre-drop: gold=${kept.gold} kills=${kept.kills} deaths=${kept.deaths} fireball=${kept.spells.fireball}`);

  // -- hard drop (no clean leave), then rejoin under the same name
  a.ws.terminate();
  await wait(1200);
  const b = client();
  await b.open;
  b.send({ t: 'join', name: 'Remi' }); // case differs on purpose: normName match
  await until(b, c => c.id && c.me(), 10, 'rejoin snapshot');
  const back = b.me();
  assert(back.spells.fireball === kept.spells.fireball, `fireball level survives (${back.spells.fireball})`);
  assert(back.gold === kept.gold, `gold survives (${back.gold})`);
  assert(back.kills === kept.kills, `kills survive (${back.kills})`);
  assert(back.deaths === kept.deaths, `deaths survive (${back.deaths})`);

  // -- a different name must NOT inherit anything
  const d = client();
  await d.open;
  d.send({ t: 'join', name: 'someone-else' });
  await until(d, c => c.id && c.me(), 10, 'stranger snapshot');
  const fresh = d.me();
  assert(fresh.spells.fireball === 1, 'stranger starts fresh (fireball lv1)');
  assert(fresh.kills === 0, 'stranger starts fresh (0 kills)');

  console.log('\nreconnect-test: ALL OK');
  process.exit(0);
} catch (err) {
  console.error('\nreconnect-test FAILED:', err.message);
  process.exit(1);
}
