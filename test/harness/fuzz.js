// Scenario fuzzer: generates randomized matches (players, bots, behaviors,
// disconnects, garbage input) and runs them through the harness. Failures
// save their scenario + journal for replay.
//
//   node test/harness/fuzz.js [count] [--start-seed=N]
//
// Every scenario is fully determined by its seed, so a failure is rerunnable:
//   node test/harness/fuzz.js 1 --start-seed=<failingSeed>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenario } from './run.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateScenario(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const nPlayers = 1 + Math.floor(rng() * 4);
  const nBots = Math.max(nPlayers === 1 ? 1 : 0, Math.floor(rng() * 4));

  const players = [];
  for (let i = 0; i < nPlayers; i++) {
    const script = [];
    if (rng() < 0.3) script.push(`spam ${Math.floor(rng() * 40)}`);
    if (rng() < 0.4) script.push(`buy ${pick(['fireball', 'lightning', 'boots', 'teleport', 'nonsense'])}`);
    if (rng() < 0.25) script.push(`wait ${(rng() * 20).toFixed(1)}`); // late ready
    script.push('ready');
    const acts = Math.floor(rng() * 6) + 1;
    for (let a = 0; a < acts; a++) {
      script.push(pick([
        `hunt ${(3 + rng() * 25).toFixed(0)}`,
        `flee ${(2 + rng() * 10).toFixed(0)}`,
        `auto ${(10 + rng() * 40).toFixed(0)}`,
        `cast ${pick(['fireball', 'lightning', 'teleport', 'shield', 'rush', 'boomerang'])} at nearest`,
        `move ${(rng() * 160 - 80).toFixed(0)} ${(rng() * 160 - 80).toFixed(0)}`,
        `spam ${Math.floor(rng() * 30)}`,
        'center',
        `wait ${(rng() * 8).toFixed(1)}`,
      ]));
      if (rng() < 0.15) { script.push('disconnect', `wait ${(1 + rng() * 5).toFixed(1)}`, 'reconnect', 'wait 1', 'ready'); }
    }
    script.push('auto 45'); // make sure games progress at the end
    players.push({ name: `F${i}`, script });
  }

  return {
    name: `fuzz-${seed}`,
    seed,
    timeoutMs: 210_000,
    bots: nBots,
    players,
    // no strict expectations; fuzz runs check only invariants + liveness
  };
}

const count = Number(process.argv[2] || 10);
const startSeed = Number((process.argv.find((a) => a.startsWith('--start-seed=')) || '').split('=')[1] || 1000);
const failDir = path.join(__dirname, 'failures');
fs.mkdirSync(failDir, { recursive: true });

let failed = 0;
for (let i = 0; i < count; i++) {
  const seed = startSeed + i;
  const scenario = generateScenario(seed);
  const t0 = Date.now();
  const res = await runScenario(scenario, { seed });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`${res.ok ? 'PASS' : 'FAIL'} seed=${seed} (${secs}s, deaths=${res.stats.deaths ?? '?'})`);
  if (!res.ok) {
    failed++;
    for (const p of res.problems) console.log('   ✗', p);
    const dest = path.join(failDir, `fuzz-${seed}`);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'scenario.json'), JSON.stringify(scenario, null, 2));
    try { fs.copyFileSync(res.journal, path.join(dest, 'journal.jsonl')); } catch { /* no journal */ }
  }
}
console.log(`\nfuzz done: ${count - failed}/${count} passed`);
process.exit(failed ? 1 : 0);
