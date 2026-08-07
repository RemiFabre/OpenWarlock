// Balance lab: headless batch arena with Elo ratings per strategy.
//
// A *strategy* = a combat profile (bot kind) × a build scheme (shop priority
// list). The arena runs thousands of seeded, full games directly against the
// simulation (no server, no network) and rates strategies with Elo from
// pairwise placements, plus per-item/per-spell win correlations.
//
//   node tools/arena.js                         # default: full round-robin-ish study
//   node tools/arena.js --games=2000 --players=4 --seed=1
//   node tools/arena.js --mirror=stalker --games=1500   # same profile, builds only
//   node tools/arena.js --list                  # show strategies
//
// Output: a ranked Elo table + item/spell win-rate stats (and JSON via --json=path).

import fs from 'node:fs';
import {
  createGame, addPlayer, startGame, step, stepBot, botShop, buy, setShopReady, makeRng,
  castSpell,
} from '../shared/sim.js';
import { BOTS, ROUND, SPELLS, ELEMENTS, BUILDS as SHARED_BUILDS } from '../shared/constants.js';

const DT = 1 / 30;
const MAX_TICKS = 30 * 60 * 45; // 45 sim-minutes hard cap per game

// ---- build schemes --------------------------------------------------------
// Priority lists consumed greedily every shop (first affordable next step).
// The real builds live in shared/constants.js (BUILDS) — same lists the
// lobby's per-bot strategy picker uses — plus one arena-only control.
export const BUILDS = {
  ...Object.fromEntries(Object.entries(SHARED_BUILDS).map(([k, v]) => [k, v.order])),
  greedless: [], // control: never buys anything
};

export function strategies() {
  const out = [];
  for (const kind of Object.keys(BOTS)) {
    for (const build of Object.keys(BUILDS)) {
      out.push({ id: `${kind}/${build}`, kind, build });
    }
  }
  return out;
}

// ---- single game ------------------------------------------------------------
// (The old harness-side boomerang assist is gone: shared/sim.js bots now
// pilot every spell their build buys — boomerang included — so arena games
// measure exactly what live-server games do.)

export function playGame(lineup, seed, { mode = 'classic' } = {}) {
  const state = createGame({ seed, mode });
  lineup.forEach((strat, i) => {
    addPlayer(state, `s${i}`, strat.id, { bot: true, kind: strat.kind });
  });
  startGame(state);
  // a lineup entry may carry an explicit priority list (item probes) instead
  // of naming one of BUILDS
  const buildList = (strat) => strat.priorities || BUILDS[strat.build];

  let ticks = 0;
  let lastPhase = state.phase;
  // per-game trackers: kill causes (lava vs direct-damage) + comeback deficits
  let lavaDeaths = 0, directDeaths = 0;
  const maxDeficit = Object.fromEntries(Object.keys(state.players).map(id => [id, 0]));
  while (state.phase !== 'gameover' && ticks++ < MAX_TICKS) {
    step(state, DT);
    if (state.phase === 'battle') {
      for (const id of Object.keys(state.players)) stepBot(state, id, DT);
    }
    // drain the transient event queue (the server normally does this) and
    // classify deaths: a death at a position outside the current arena radius
    // is a lava death, anything inside died to direct spell damage.
    if (state.events.length) {
      for (const ev of state.events) {
        if (ev.t !== 'death') continue;
        const inLava = state.arenaRadius <= 0 ||
          Math.hypot(ev.x, ev.y) > state.arenaRadius;
        if (inLava) lavaDeaths++; else directDeaths++;
        // kill counts just changed: refresh every player's worst deficit
        const top = Math.max(...Object.values(state.players).map(p => p.kills));
        for (const p of Object.values(state.players)) {
          maxDeficit[p.id] = Math.max(maxDeficit[p.id], top - p.kills);
        }
      }
      state.events.length = 0;
    }
    if (state.phase === 'shop' && lastPhase !== 'shop') {
      lineup.forEach((strat, i) => {
        const id = `s${i}`;
        // elemental probes: the seat's element is the FIRST purchase
        if (strat.element) buy(state, id, strat.element);
        for (const thing of buildList(strat)) buy(state, id, thing);
        setShopReady(state, id);
      });
    }
    lastPhase = state.phase;
  }

  const players = Object.values(state.players);
  // rank by kills desc, deaths asc as tiebreak (matches game ranking)
  const ranked = [...players].sort((a, b) =>
    b.kills - a.kills || a.deaths - b.deaths || b.gold - a.gold);
  return {
    finished: state.phase === 'gameover',
    rounds: state.round,
    lavaDeaths, directDeaths,
    // comeback: the eventual winner was at some point >= 4 kills behind
    winnerMaxDeficit: maxDeficit[ranked[0].id],
    comeback: maxDeficit[ranked[0].id] >= 4,
    ranking: ranked.map(p => ({
      idx: Number(p.id.slice(1)), kills: p.kills, deaths: p.deaths,
      gold: p.gold, items: p.items, spells: p.spells,
    })),
  };
}

// ---- elemental study --------------------------------------------------------
// Sanity check for the experimental ruleset: mirror games (all seats the same
// combat profile + build) where only the element pick differs, so any
// degenerate element (e.g. a midas gold snowball) shows up as a win-rate or
// gold outlier. Not a tuning tool — a smoke alarm.

export function runElementalStudy({ kind = 'berserker', games = 100, playersPerGame = 4, seed = 1, log = console.error } = {}) {
  const elements = Object.keys(ELEMENTS);
  const wins = Object.fromEntries(elements.map(e => [e, 0]));
  const played = Object.fromEntries(elements.map(e => [e, 0]));
  const placeSum = Object.fromEntries(elements.map(e => [e, 0]));
  const goldSum = Object.fromEntries(elements.map(e => [e, 0]));
  const killSum = Object.fromEntries(elements.map(e => [e, 0]));
  const rand = makeRng(seed);
  let unfinished = 0;
  const t0 = Date.now();

  for (let g = 0; g < games; g++) {
    const pool = [...elements];
    const lineup = [];
    for (let i = 0; i < playersPerGame; i++) {
      const el = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      lineup.push({ id: `${kind}+${el}`, kind, build: 'bruiser', element: el });
    }
    const res = playGame(lineup, seed * 100000 + g, { mode: 'elemental' });
    if (!res.finished) { unfinished++; continue; }
    res.ranking.forEach((r, place) => {
      const el = lineup[r.idx].element;
      played[el]++;
      placeSum[el] += place + 1;
      goldSum[el] += r.gold;
      killSum[el] += r.kills;
      if (place === 0) wins[el]++;
    });
    if ((g + 1) % 50 === 0) log(`  ${g + 1}/${games} elemental games (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  const table = elements.map(e => ({
    element: e, games: played[e],
    winRate: played[e] ? wins[e] / played[e] : 0,
    avgPlace: played[e] ? placeSum[e] / played[e] : 0,
    avgGold: played[e] ? goldSum[e] / played[e] : 0,
    avgKills: played[e] ? killSum[e] / played[e] : 0,
  })).sort((a, b) => b.winRate - a.winRate);

  return {
    kind, games, playersPerGame, unfinished, expectedWinRate: 1 / playersPerGame,
    seconds: (Date.now() - t0) / 1000, table,
  };
}

// ---- Elo ----------------------------------------------------------------------

function makeElo(ids) {
  const rating = Object.fromEntries(ids.map(id => [id, 1000]));
  const games = Object.fromEntries(ids.map(id => [id, 0]));
  return {
    rating, games,
    // update from a full placement ordering (best first): pairwise Elo
    update(placementIds) {
      const K = 16;
      for (let i = 0; i < placementIds.length; i++) {
        for (let j = i + 1; j < placementIds.length; j++) {
          const a = placementIds[i], b = placementIds[j]; // a placed above b
          const ea = 1 / (1 + 10 ** ((this.rating[b] - this.rating[a]) / 400));
          this.rating[a] += K * (1 - ea);
          this.rating[b] += K * (0 - (1 - ea));
        }
      }
      for (const id of placementIds) this.games[id]++;
    },
  };
}

// ---- item probe -------------------------------------------------------------
// De-confounded single-item comparison: every seat runs the SAME profile and
// the SAME build tail; only the FIRST purchase differs (one item under test,
// or nothing for the control). The winner-held table in the main study is
// confounded — items late in a priority list are bought mostly by players who
// are already winning (they live long and stack gold), which inflates their
// "winner-held" share. Buying the probe item first removes that.

export function runItemProbe({ kind = 'berserker', games = 1400, playersPerGame = 4, seed = 1, log = console.error } = {}) {
  const TAIL = ['fireball', 'fireball', 'amulet', 'boots'];
  const probes = ['treads', 'cape', 'ring', 'sword', 'boots', 'amulet', 'none'];
  const priorities = (p) => (p === 'none' ? TAIL : [p, ...TAIL.filter(x => x !== p)]);
  const wins = Object.fromEntries(probes.map(p => [p, 0]));
  const played = Object.fromEntries(probes.map(p => [p, 0]));
  const rand = makeRng(seed);
  let unfinished = 0;
  const t0 = Date.now();

  for (let g = 0; g < games; g++) {
    const pool = [...probes];
    const lineup = [];
    for (let i = 0; i < playersPerGame; i++) {
      const p = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      lineup.push({ id: `${kind}+${p}`, kind, probe: p, priorities: priorities(p) });
    }
    const res = playGame(lineup, seed * 100000 + g);
    if (!res.finished) { unfinished++; continue; }
    res.ranking.forEach((r, place) => {
      const p = lineup[r.idx].probe;
      played[p]++;
      if (place === 0) wins[p]++;
    });
    if ((g + 1) % 500 === 0) log(`  ${g + 1}/${games} probe games (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  const table = probes.map(p => ({
    probe: p, games: played[p],
    winRate: played[p] ? wins[p] / played[p] : 0,
  })).sort((a, b) => b.winRate - a.winRate);
  return {
    kind, games, playersPerGame, unfinished, expectedWinRate: 1 / playersPerGame,
    seconds: (Date.now() - t0) / 1000, table,
  };
}

// ---- study ----------------------------------------------------------------------

export function runStudy({ games = 1000, playersPerGame = 4, seed = 1, log = console.error } = {}) {
  const strats = strategies();
  const elo = makeElo(strats.map(s => s.id));
  const wins = Object.fromEntries(strats.map(s => [s.id, 0]));
  const itemWins = {}, itemGames = {};   // per item: games where owner won / played
  const rand = makeRng(seed);
  let unfinished = 0;
  let lavaDeaths = 0, directDeaths = 0, comebacks = 0, finished = 0;
  const t0 = Date.now();

  for (let g = 0; g < games; g++) {
    // sample a lineup of distinct strategies
    const pool = [...strats];
    const lineup = [];
    for (let i = 0; i < playersPerGame; i++) {
      lineup.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    }
    const res = playGame(lineup, seed * 100000 + g);
    if (!res.finished) { unfinished++; continue; }
    finished++;
    lavaDeaths += res.lavaDeaths;
    directDeaths += res.directDeaths;
    if (res.comeback) comebacks++;

    const placement = res.ranking.map(r => lineup[r.idx].id);
    elo.update(placement);
    wins[placement[0]]++;

    // item/spell attribution: winner's inventory vs everyone's
    res.ranking.forEach((r, place) => {
      // items and spells are both {key: level}; "owned at all" is the signal
      const owned = [...Object.entries(r.items).filter(([, v]) => v > 0).map(([k]) => k),
        ...Object.entries(r.spells)
          .filter(([k, v]) => v > 0 && k !== 'fireball').map(([k]) => k)];
      for (const it of new Set(owned)) {
        itemGames[it] = (itemGames[it] || 0) + 1;
        if (place === 0) itemWins[it] = (itemWins[it] || 0) + 1;
      }
    });

    if ((g + 1) % 200 === 0) log(`  ${g + 1}/${games} games (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  const expectedWinRate = 1 / playersPerGame;
  const table = strats.map(s => ({
    strategy: s.id,
    elo: Math.round(elo.rating[s.id]),
    games: elo.games[s.id],
    winRate: elo.games[s.id] ? wins[s.id] / elo.games[s.id] : 0,
  })).sort((a, b) => b.elo - a.elo);

  const items = Object.keys(itemGames).map(it => ({
    thing: it,
    picked: itemGames[it],
    winRate: itemWins[it] ? itemWins[it] / itemGames[it] : 0,
  })).sort((a, b) => b.winRate - a.winRate);

  return {
    games, playersPerGame, unfinished, expectedWinRate,
    lavaShare: lavaDeaths / Math.max(1, lavaDeaths + directDeaths),
    comebackRate: comebacks / Math.max(1, finished),
    seconds: (Date.now() - t0) / 1000, table, items,
  };
}

// ---- mirror study -----------------------------------------------------------
// All seats use the SAME combat profile; only builds differ. This removes the
// profile confound (skill dwarfs shopping) and answers the real balance
// question: within one skill tier, is any build a trap or an auto-win?

export function runMirror({ kind = 'stalker', games = 1500, playersPerGame = 4, seed = 1, log = console.error } = {}) {
  const builds = Object.keys(BUILDS);
  const wins = Object.fromEntries(builds.map(b => [b, 0]));
  const played = Object.fromEntries(builds.map(b => [b, 0]));
  const placeSum = Object.fromEntries(builds.map(b => [b, 0]));
  const rand = makeRng(seed);
  let unfinished = 0, finished = 0;
  let lavaDeaths = 0, directDeaths = 0, comebacks = 0;
  const t0 = Date.now();

  for (let g = 0; g < games; g++) {
    const pool = [...builds];
    const lineup = [];
    for (let i = 0; i < playersPerGame; i++) {
      const build = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      lineup.push({ id: `${kind}/${build}`, kind, build });
    }
    const res = playGame(lineup, seed * 100000 + g);
    if (!res.finished) { unfinished++; continue; }
    finished++;
    lavaDeaths += res.lavaDeaths;
    directDeaths += res.directDeaths;
    if (res.comeback) comebacks++;
    res.ranking.forEach((r, place) => {
      const b = lineup[r.idx].build;
      played[b]++;
      placeSum[b] += place + 1;
      if (place === 0) wins[b]++;
    });
    if ((g + 1) % 500 === 0) log(`  ${g + 1}/${games} mirror games (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  const expectedWinRate = 1 / playersPerGame;
  const table = builds.map(b => ({
    build: b,
    games: played[b],
    winRate: played[b] ? wins[b] / played[b] : 0,
    avgPlace: played[b] ? placeSum[b] / played[b] : 0,
  })).sort((a, b) => b.winRate - a.winRate);

  return {
    kind, games, playersPerGame, unfinished, expectedWinRate,
    lavaShare: lavaDeaths / Math.max(1, lavaDeaths + directDeaths),
    comebackRate: comebacks / Math.max(1, finished),
    seconds: (Date.now() - t0) / 1000, table,
  };
}

// ---- CLI --------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('arena.js')) {
  const argNum = (name, dflt) => Number((process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || dflt);
  if (process.argv.includes('--list')) {
    for (const s of strategies()) console.log(s.id);
    process.exit(0);
  }
  const games = argNum('games', 1000);
  const playersPerGame = argNum('players', 4);
  const seed = argNum('seed', 1);

  const mode = (process.argv.find(a => a.startsWith('--mode=')) || '').split('=')[1];
  if (mode === 'elemental') {
    const kind = (process.argv.find(a => a.startsWith('--kind=')) || '').split('=')[1] || 'berserker';
    console.error(`elemental study: ${games} games of ${playersPerGame} × ${kind}, elements only differ, seed ${seed}`);
    const res = runElementalStudy({ kind, games, playersPerGame, seed });
    console.log(`\n=== elemental: all ${kind}/bruiser, element pick differs (expected win rate ${(res.expectedWinRate * 100).toFixed(0)}%) ===`);
    console.log('win%   avg-place  avg-gold  avg-kills  games  element');
    for (const r of res.table)
      console.log(`${(r.winRate * 100).toFixed(1).padStart(5)}  ${r.avgPlace.toFixed(2).padStart(9)}  ${r.avgGold.toFixed(1).padStart(8)}  ${r.avgKills.toFixed(1).padStart(9)}  ${String(r.games).padEnd(6)} ${r.element}`);
    if (res.unfinished) console.log(`(unfinished games: ${res.unfinished})`);
    console.log(`${res.seconds.toFixed(1)}s total`);
    const jsonPathE = (process.argv.find(a => a.startsWith('--json=')) || '').split('=')[1];
    if (jsonPathE) fs.writeFileSync(jsonPathE, JSON.stringify(res, null, 2));
    process.exit(0);
  }

  const mirror = (process.argv.find(a => a.startsWith('--mirror=')) || '').split('=')[1];
  if (mirror) {
    if (!BOTS[mirror]) { console.error(`unknown profile: ${mirror}`); process.exit(1); }
    console.error(`mirror arena: ${games} games of ${playersPerGame} × ${mirror}, seed ${seed}`);
    const res = runMirror({ kind: mirror, games, playersPerGame, seed });
    console.log(`\n=== mirror: all ${mirror}, builds only (expected win rate ${(res.expectedWinRate * 100).toFixed(0)}%) ===`);
    console.log('win%   avg-place  games  build');
    for (const r of res.table)
      console.log(`${(r.winRate * 100).toFixed(1).padStart(5)}  ${r.avgPlace.toFixed(2).padStart(9)}  ${String(r.games).padEnd(6)} ${r.build}`);
    console.log(`\nlava kill share: ${(res.lavaShare * 100).toFixed(1)}%   comeback rate (winner was >=4 behind): ${(res.comebackRate * 100).toFixed(1)}%`);
    if (res.unfinished) console.log(`(unfinished games: ${res.unfinished})`);
    console.log(`${res.seconds.toFixed(1)}s total`);
    const jsonPathM = (process.argv.find(a => a.startsWith('--json=')) || '').split('=')[1];
    if (jsonPathM) fs.writeFileSync(jsonPathM, JSON.stringify(res, null, 2));
    process.exit(0);
  }

  const probe = (process.argv.find(a => a.startsWith('--probe=')) || '').split('=')[1];
  if (probe) {
    if (!BOTS[probe]) { console.error(`unknown profile: ${probe}`); process.exit(1); }
    console.error(`item probe: ${games} games of ${playersPerGame} × ${probe}, seed ${seed}`);
    const res = runItemProbe({ kind: probe, games, playersPerGame, seed });
    console.log(`\n=== item probe: all ${probe}, first purchase differs (expected win rate ${(res.expectedWinRate * 100).toFixed(0)}%) ===`);
    console.log('win%   games  first item');
    for (const r of res.table)
      console.log(`${(r.winRate * 100).toFixed(1).padStart(5)}  ${String(r.games).padEnd(6)} ${r.probe}`);
    if (res.unfinished) console.log(`(unfinished games: ${res.unfinished})`);
    console.log(`${res.seconds.toFixed(1)}s total`);
    process.exit(0);
  }

  console.error(`arena: ${games} games of ${playersPerGame}, seed ${seed}, ${strategies().length} strategies`);
  const res = runStudy({ games, playersPerGame, seed });

  console.log(`\n=== Elo table (${games} games, expected win rate ${(res.expectedWinRate * 100).toFixed(0)}%) ===`);
  console.log('elo    games  win%   strategy');
  for (const r of res.table)
    console.log(`${String(r.elo).padEnd(6)} ${String(r.games).padEnd(6)} ${(r.winRate * 100).toFixed(1).padStart(5)}  ${r.strategy}`);

  console.log(`\n=== item/spell pick win rates (winner-held share) ===`);
  console.log('win%   picked  thing');
  for (const it of res.items)
    console.log(`${(it.winRate * 100).toFixed(1).padStart(5)}  ${String(it.picked).padEnd(7)} ${it.thing}`);

  console.log(`\nlava kill share: ${(res.lavaShare * 100).toFixed(1)}%   comeback rate (winner was >=4 behind): ${(res.comebackRate * 100).toFixed(1)}%`);
  if (res.unfinished) console.log(`\n(unfinished games: ${res.unfinished})`);
  console.log(`\n${res.seconds.toFixed(1)}s total`);

  const jsonPath = (process.argv.find(a => a.startsWith('--json=')) || '').split('=')[1];
  if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(res, null, 2));
}
