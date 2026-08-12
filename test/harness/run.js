// Scenario runner: spawns a fresh instrumented server, connects scripted
// players, watches for freezes/crashes, then runs the invariant checker on
// the journal. This is the entry point for AI agents testing the game.
//
//   node test/harness/run.js test/harness/scenarios/duel.js
//   node test/harness/run.js <scenario> --seed=123 --keep-logs
//
// A scenario module exports default {
//   name, seed?, timeoutMs?, bots?,          // bots added by first player
//   players: [{ name, script: [...] }],
//   expect?: { deaths?: n, phaseReached?: 'shop'|'gameover', ... }
// }
// Exit code 0 = PASS, 1 = FAIL. Prints the journal path either way.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { ScriptedPlayer } from './bot-client.js';
import { checkJournal } from './check.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

export async function runScenario(scenario, { seed, verbose = false } = {}) {
  const problems = [];
  const logDir = path.join(__dirname, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const journalPath = path.join(logDir, `${scenario.name}-${stamp}.jsonl`);
  const port = await freePort();
  const useSeed = seed ?? scenario.seed ?? 1;

  const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    env: {
      ...process.env, PORT: String(port), SEED: String(useSeed), JOURNAL: journalPath,
    },
  });
  let serverExited = null;
  let serverErr = '';
  server.stderr.on('data', (b) => { serverErr += b; });
  server.on('exit', (code, sig) => { serverExited = { code, sig }; });
  await new Promise((r) => setTimeout(r, 700));
  if (serverExited) return fail(`server died on startup: ${serverErr}`);

  const url = `ws://localhost:${port}`;
  const log = verbose ? (m) => console.log('  |', m) : () => {};
  const players = scenario.players.map((p) => new ScriptedPlayer(url, p.name, p.script, log));

  try {
    for (const p of players) await p.connect();
  } catch (e) {
    return fail(`connect failed: ${e.message}`);
  }

  for (let i = 0; i < (scenario.bots || 0); i++) players[0].send({ t: 'addBot' });

  // watchdog: any connected client starving for snapshots = freeze
  let frozen = null;
  const watchdog = setInterval(() => {
    for (const p of players) {
      if (p.connected && p.lastSnapAt && Date.now() - p.lastSnapAt > 2000)
        frozen = `${p.name} got no snapshot for ${Date.now() - p.lastSnapAt} ms`;
    }
    if (serverExited && players.some((p) => p.connected))
      frozen = `server exited mid-game (code ${serverExited.code})`;
  }, 250);

  const timeout = scenario.timeoutMs || 120_000;
  const startedAt = Date.now();
  const scriptRun = Promise.all(players.map((p) => p.run()));
  const result = await Promise.race([
    scriptRun.then(() => 'done'),
    new Promise((r) => setTimeout(() => r('timeout'), timeout)),
    new Promise((r) => { const i = setInterval(() => { if (frozen) { clearInterval(i); r('frozen'); } }, 100); }),
  ]);
  clearInterval(watchdog);

  if (result === 'timeout') problems.push(`scenario scripts did not finish within ${timeout} ms`);
  if (result === 'frozen') problems.push(`FREEZE: ${frozen}`);

  // collect client-side problems
  for (const p of players) {
    for (const err of p.errors) problems.push(`client ${p.name}: ${err}`);
    if (!p.id) problems.push(`client ${p.name}: never welcomed`);
  }

  // expectations
  const allEvents = players.flatMap((p) => p.events);
  const exp = scenario.expect || {};
  if (exp.minDeaths != null) {
    const uniqueDeaths = players[0].events.filter((e) => e.t === 'death').length;
    if (uniqueDeaths < exp.minDeaths) problems.push(`expected ≥${exp.minDeaths} deaths, saw ${uniqueDeaths}`);
  }
  if (exp.phaseReached) {
    const phases = new Set(players.map((p) => p.snap && p.snap.phase));
    const seen = allEvents.some((e) => e.t === 'roundEnd') || phases.has(exp.phaseReached);
    if (exp.phaseReached === 'gameover' && !phases.has('gameover') && !allEvents.some(e => e.t === 'gameover'))
      problems.push(`expected to reach gameover`);
    else if (exp.phaseReached === 'shop' && !seen)
      problems.push(`expected to reach shop`);
  }

  for (const p of players) p.abort();
  server.kill();
  await new Promise((r) => setTimeout(r, 300));

  // journal invariants
  let journalLines = [];
  try { journalLines = fs.readFileSync(journalPath, 'utf8').split('\n'); }
  catch { problems.push('no journal written'); }
  for (const viol of checkJournal(journalLines)) problems.push(`invariant: ${viol}`);

  return {
    name: scenario.name, seed: useSeed, ok: problems.length === 0,
    problems, journal: journalPath,
    stats: {
      // WHY the run stopped, always printed: 'done' (scripts finished),
      // 'timeout' or 'frozen'. A short run that says 'done' means a script
      // ended early; one that says 'frozen' is a starved client. Without this,
      // a rare failure needs journal forensics to tell those apart.
      ended: result, ranSec: +((Date.now() - startedAt) / 1000).toFixed(1),
      deaths: players[0] ? players[0].events.filter((e) => e.t === 'death').length : 0,
      casts: players[0] ? players[0].events.filter((e) => e.t === 'cast').length : 0,
    },
  };

  function fail(msg) {
    server.kill();
    return { name: scenario.name, seed: useSeed, ok: false, problems: [msg], journal: journalPath, stats: {} };
  }
}

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('run.js')) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node test/harness/run.js <scenario.js> [--seed=N] [-v]'); process.exit(2); }
  const seedArg = process.argv.find((a) => a.startsWith('--seed='));
  const { default: scenario } = await import(path.resolve(file));
  const res = await runScenario(scenario, {
    seed: seedArg ? Number(seedArg.split('=')[1]) : undefined,
    verbose: process.argv.includes('-v'),
  });
  console.log(`\n${res.ok ? 'PASS' : 'FAIL'} — ${res.name} (seed ${res.seed})`);
  console.log(`  ended: ${res.stats.ended ?? '?'} after ${res.stats.ranSec ?? '?'}s` +
    `  deaths: ${res.stats.deaths ?? '?'}  casts: ${res.stats.casts ?? '?'}`);
  console.log(`  journal: ${res.journal}`);
  for (const p of res.problems) console.log('  ✗', p);
  process.exit(res.ok ? 0 : 1);
}
