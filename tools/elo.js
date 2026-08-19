// The ELO tournament (Remi, 2026-08-09): every strategy in tools/roster.js,
// random 4-strategy Hard-berserker lobbies, Bradley-Terry strengths fitted
// from ALL pairwise placements (order-free; unlike an online Elo, the result
// does not depend on game order), reported on the familiar Elo scale
// (1500 = the roster's average; +173 ≈ a 73% pairwise favourite).
// STANDARD RUN (Remi, 24.7): ONE seed, seed 1; --games scaled to ~190
// seats/row (rows × 47.5), so 2565 at the 54-row roster.
//
//   node tools/elo.js --games=6000 --seed=1 [--kind=berserker] [--json=path]
//
// What this instrument CANNOT see (state it next to every quote): bots don't
// lead targets, bait, or chain CC windows; reactive tools (shield, blink,
// boomerang recall) and cluster value (malady's contagion) read at a floor;
// anger saturates bot instruments. This is a ranking of what BOTS extract.

import fs from 'node:fs';
import { playGame } from './arena.js';
import { makeRng } from '../shared/sim.js';
import { ROSTER, paddedCore, expandCore, coreCost, EXHAUST_PASS } from './roster.js';
import { writeReport } from './report.js';


const progress = process.stderr.isTTY ? console.error : () => {};
const arg = (name, def) => {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
};

const GAMES = Number(arg('games', 6000));
const SEED = Number(arg('seed', 1));
const KIND = arg('kind', 'berserker');
const JSON_OUT = arg('json', null);

const ids = Object.keys(ROSTER);
const lists = Object.fromEntries(ids.map(id => [id,
  [...expandCore(paddedCore(ROSTER[id])), ...EXHAUST_PASS, ...EXHAUST_PASS, ...EXHAUST_PASS]]));

// pairwise win counts from placements: wins[a][b] = times a placed above b
const wins = Object.fromEntries(ids.map(a => [a,
  Object.fromEntries(ids.map(b => [b, 0]))]));
const games = Object.fromEntries(ids.map(id => [id, 0]));
const placeSum = Object.fromEntries(ids.map(id => [id, 0]));
let unfinished = 0;

const rand = makeRng(SEED);
for (let g = 0; g < GAMES; g++) {
  // sample 4 distinct strategies uniformly (partial Fisher-Yates)
  const pool = [...ids];
  for (let i = 0; i < 4; i++) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, 4);
  // ⚠ `caps` rides along: a roster entry may BAN a thing outright (caps {x: 0}),
  // which is the only way to keep the shared exhaust tail from handing a seat
  // the very item its core exists to do without (round 21.8, family F).
  // issue #7: a roster entry may pin its own bot (family K rides the Faker
  // brain); everyone else runs the tournament's --kind seat.
  const lineup = picks.map(id => ({ id, kind: ROSTER[id].kind || KIND, priorities: lists[id],
    ...(ROSTER[id].caps ? { caps: ROSTER[id].caps } : {}) }));
  const res = playGame(lineup, SEED * 1_000_000 + g, { mode: 'elemental' });
  if (!res.finished) unfinished++;
  const order = res.ranking.map(r => picks[r.idx]); // best first
  for (let i = 0; i < order.length; i++) {
    games[order[i]]++;
    placeSum[order[i]] += i + 1;
    for (let j = i + 1; j < order.length; j++) wins[order[i]][order[j]]++;
  }
  if (g % 200 === 0) progress(`${g}/${GAMES}`);
}

// Bradley-Terry fit (MM algorithm), then Elo scale around 1500
const s = Object.fromEntries(ids.map(id => [id, 1]));
for (let it = 0; it < 800; it++) {
  for (const a of ids) {
    let W = 0, denom = 0;
    for (const b of ids) {
      if (a === b) continue;
      const n = wins[a][b] + wins[b][a];
      if (!n) continue;
      W += wins[a][b];
      denom += n / (s[a] + s[b]);
    }
    s[a] = denom ? Math.max(W / denom, 1e-9) : s[a];
  }
  // normalize: geometric mean 1
  const gm = Math.exp(ids.reduce((acc, id) => acc + Math.log(s[id]), 0) / ids.length);
  for (const id of ids) s[id] /= gm;
}
const elo = Object.fromEntries(ids.map(id => [id, Math.round(1500 + 173.717 * Math.log(s[id]))]));

console.log(`\n=== strategy ELO: ${GAMES} games, seed ${SEED}, 4 random ${KIND} seats/game, elemental ===`);
console.log(`Elo from Bradley-Terry over pairwise placements; 1500 = roster average,`);
console.log(`+173 = 73% favourite in a pair. games = seats played. place = mean of 1-4.`);
console.log(`Bot read ONLY: no target-leading/CC-chaining; reactive tools + contagion at a floor.\n`);
console.log('elo    games  place  cost  strategy');
for (const id of [...ids].sort((a, b) => elo[b] - elo[a])) {
  const cost = coreCost(paddedCore(ROSTER[id]));
  console.log(`${String(elo[id]).padStart(4)}   ${String(games[id]).padStart(5)}  ${(placeSum[id] / Math.max(1, games[id])).toFixed(2)}   ${String(cost).padStart(3)}g  ${id}`);
}
console.log(`\nunfinished games: ${unfinished}`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ GAMES, SEED, KIND, elo, games, placeSum, unfinished, wins }, null, 1));

// Round 24.7 (Remi): every run ends as a web page that opens on his machine,
// with the ranking + the full build (order included) one hover away. Costs the
// agent zero context: it happens here. --no-report skips it (smoke runs),
// --no-open writes without opening, --report=path / --notes=path override.
if (!process.argv.includes('--no-report')) {
  const notesPath = arg('notes', null);
  const file = writeReport({
    run: { GAMES, SEED, KIND, elo, games, placeSum, unfinished },
    notes: notesPath ? fs.readFileSync(notesPath, 'utf8') : '',
    out: arg('report', null),
    open: !process.argv.includes('--no-open'),
  });
  console.log(`report: ${file}`);
}
