// The SMOKE + HEALTH lab (slimmed in round 24.4, Remi's cleanup): fast
// seeded games straight against the simulation, reporting whether the game is
// HEALTHY: games finish, kills are sane, lava kill share, comeback rate, the
// multi-enemy focus metric. Runs at any seat count (the ritual checks 4p AND
// 8p in seconds). It is NOT the ranking instrument: strategy strength is
// tools/elo.js, head-to-head "why" is tools/pair.js, bot tiers are
// tools/h2h.js. The old --isolate / --ladder / --mirror / --probe options
// were RETIRED in 24.4 (superseded; recover from git, ad9d54e has them all).
//
//   node tools/arena.js --games=60 --players=4          # the ritual smoke
//   node tools/arena.js --games=60 --players=8          # the scaled arena
//   node tools/arena.js --fx=sword.lifesteal=0.1,0.2,0.3  # sweep a constant
//
// Output: the health lines + a mixed-lobby table (and JSON via --json=path).

import fs from 'node:fs';
import {
  createGame, addPlayer, startGame, step, stepBot, buy, setShopReady, makeRng,
} from '../shared/sim.js';
import {
  BOTS, ROUND, SPELLS, ELEMENTS, ITEMS, ITEM_FX, BUILDS as SHARED_BUILDS,
} from '../shared/constants.js';
import { ownedLevel } from '../shared/catalogue.js';

const DT = 1 / 30;

// Progress ticks ("400/1000 games (12s)") are for a human watching a terminal.
// When stderr is NOT a TTY (an agent, a pipe, CI) they are pure context
// noise, so they are silenced (Remi's context policy, 2026-08-08). The
// one-line run banners stay: they identify what a saved output file was.
const progress = process.stderr.isTTY ? console.error : () => {};
const MAX_TICKS = 30 * 60 * 45; // 45 sim-minutes hard cap per game

// ---- build schemes --------------------------------------------------------
// Priority lists consumed greedily every shop (first affordable next step).
// The real builds live in shared/constants.js (BUILDS), same lists the
// lobby's per-bot strategy picker uses, plus one arena-only control.
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

// ---- multi-enemy focus (round 17 §11) ---------------------------------------
// The pain the stochastic pickPrey exists to fix: everyone converging on one
// victim. A player is "focused" while 2+ living enemies stand inside FOCUS_R;
// we only watch the opening FOCUS_WINDOW of each round, because that is where
// the pile-on happens (later the field is thinned and 2+ nearby is just the
// endgame). Sampled every FOCUS_EVERY ticks; cheap, and 5 Hz is far finer
// than the phenomenon. Reported as the share of that window the average player
// spends under it, so it is comparable across games of any length.
// (Arena games are always free-for-all, so "enemy" is just "anybody else".)
const FOCUS_R = 16, FOCUS_WINDOW = 20, FOCUS_EVERY = 6;

function sampleFocus(state, acc) {
  const alive = Object.values(state.players).filter(p => p.alive);
  for (const p of alive) {
    let near = 0;
    for (const o of alive)
      if (o !== p && Math.hypot(o.x - p.x, o.y - p.y) < FOCUS_R) near++;
    acc.samples++;
    if (near >= 2) acc.hits++;
  }
}

const focusLine = (r) =>
  `multi-enemy focus (2+ within ${r.focusRadius}u): ` +
  `${(r.focusShare * r.focusWindow).toFixed(1)}s of the first ${r.focusWindow}s ` +
  `(${(r.focusShare * 100).toFixed(1)}%)`;

// ---- single game ------------------------------------------------------------
// (The old harness-side boomerang assist is gone: shared/sim.js bots now
// pilot every spell their build buys (boomerang included), so arena games
// measure exactly what live-server games do.)

export function playGame(lineup, seed, { mode = 'classic' } = {}) {
  const state = createGame({ seed, mode });
  lineup.forEach((strat, i) => {
    addPlayer(state, `s${i}`, strat.id, { bot: true, kind: strat.kind });
  });
  startGame(state);
  // a lineup entry may carry an explicit priority list (item probes) instead
  // of naming one of BUILDS, and an optional `caps` map {key: maxLevel} that
  // stops the greedy shopper at a level below the thing's own maxLevel (the
  // isolation lab measures "this item AT level 2", so it must not drift to 3).
  // ⚠ SCAR (round 21.8): round 20.2 retired the legacy six builds, and three
  // labs still named `bruiser` in their DEFAULTS; the elemental study threw
  // "not iterable" and had been dead ever since. Failing LOUD here is the
  // point: an unknown build must never quietly become "this seat buys nothing",
  // which is a table full of numbers that measure the wrong thing.
  const buildList = (strat) => {
    if (strat.priorities) return strat.priorities;
    const list = BUILDS[strat.build];
    if (!list) {
      throw new Error(`unknown build: ${strat.build} (have: ${Object.keys(BUILDS).join(', ')})`);
    }
    return list;
  };

  let ticks = 0;
  let lastPhase = state.phase;
  // per-game trackers: kill causes (lava vs direct-damage) + comeback deficits
  let lavaDeaths = 0, directDeaths = 0;
  const focus = { samples: 0, hits: 0 };
  const maxDeficit = Object.fromEntries(Object.keys(state.players).map(id => [id, 0]));
  while (state.phase !== 'gameover' && ticks++ < MAX_TICKS) {
    step(state, DT);
    if (state.phase === 'battle') {
      for (const id of Object.keys(state.players)) stepBot(state, id, DT);
      if (state.time <= FOCUS_WINDOW && ticks % FOCUS_EVERY === 0) sampleFocus(state, focus);
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
        for (const thing of buildList(strat)) {
          if (strat.caps && ownedLevel(state.players[id], thing) >= strat.caps[thing]) continue;
          buy(state, id, thing);
        }
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
    focusSamples: focus.samples, focusHits: focus.hits,
    // comeback: the eventual winner was at some point >= 4 kills behind
    winnerMaxDeficit: maxDeficit[ranked[0].id],
    comeback: maxDeficit[ranked[0].id] >= 4,
    ranking: ranked.map(p => ({
      idx: Number(p.id.slice(1)), kills: p.kills, deaths: p.deaths,
      gold: p.gold, items: p.items, spells: p.spells,
    })),
  };
}

// The old "elemental study" (--mode=elemental, element-vs-element mirror games)
// was DELETED in round 23 (Remi): identical-build mirrors are not the game
// people play and its tables kept getting quoted as balance evidence. Rank with
// tools/elo.js instead.

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

// ---- study ----------------------------------------------------------------------

export function runStudy({ games = 1000, playersPerGame = 4, seed = 1, mode = 'elemental', log = progress } = {}) {
  const strats = strategies();
  const elo = makeElo(strats.map(s => s.id));
  const wins = Object.fromEntries(strats.map(s => [s.id, 0]));
  const itemWins = {}, itemGames = {};   // per item: games where owner won / played
  const rand = makeRng(seed);
  let unfinished = 0;
  let lavaDeaths = 0, directDeaths = 0, comebacks = 0, finished = 0;
  let focusSamples = 0, focusHits = 0;
  const t0 = Date.now();

  for (let g = 0; g < games; g++) {
    // sample a lineup of distinct strategies
    const pool = [...strats];
    const lineup = [];
    for (let i = 0; i < playersPerGame; i++) {
      lineup.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    }
    const res = playGame(lineup, seed * 100000 + g, { mode });
    if (!res.finished) { unfinished++; continue; }
    finished++;
    lavaDeaths += res.lavaDeaths;
    directDeaths += res.directDeaths;
    focusSamples += res.focusSamples;
    focusHits += res.focusHits;
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
    games, mode, playersPerGame, unfinished, expectedWinRate,
    lavaShare: lavaDeaths / Math.max(1, lavaDeaths + directDeaths),
    comebackRate: comebacks / Math.max(1, finished),
    focusShare: focusHits / Math.max(1, focusSamples),
    focusWindow: FOCUS_WINDOW, focusRadius: FOCUS_R,
    seconds: (Date.now() - t0) / 1000, table, items,
  };
}

// ---- CLI --------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('arena.js')) {
  const argNum = (name, dflt) => Number((process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || dflt);

  // ---- --fx=<item>.<field>=<a,b,c> : sweep a constant without editing the file
  // Repeatable. Exists so a sweep table in a constants.js comment is something
  // the next agent can RE-RUN rather than take on trust:
  //   node tools/arena.js --ladder=treads --fx=treads.lavaMult=0.85,0.70,0.60
  // Also accepts an item cost (`--fx=treads.cost=10,12,14` sets ITEMS.treads.cost
  // when scalar, or the per-level cost array when itemCost() supports one).
  for (const a of process.argv.filter(x => x.startsWith('--fx='))) {
    const [lhs, rhs] = a.slice(5).split('=');
    const [key, field] = lhs.split('.');
    const vals = rhs.split(',').map(Number);
    const target = Object.hasOwn(ITEM_FX, key) && field !== 'cost' ? ITEM_FX[key]
      : Object.hasOwn(ELEMENTS, key) && field !== 'cost' ? ELEMENTS[key].fx
      : Object.hasOwn(ITEMS, key) ? ITEMS[key]
      : null;
    if (!target) { console.error(`--fx: unknown key ${key}`); process.exit(1); }
    target[field] = vals.length === 1 ? vals[0] : vals;
    console.error(`--fx override: ${key}.${field} = ${JSON.stringify(target[field])}`);
  }
  if (process.argv.includes('--list')) {
    for (const s of strategies()) console.log(s.id);
    process.exit(0);
  }
  const games = argNum('games', 1000);
  const playersPerGame = argNum('players', 4);
  const seed = argNum('seed', 1);
  // ⚠ Round 21.8: the GAME's default ruleset is elemental (shared/sim.js
  // createGame), and so is this lab's; every arena table printed before that
  // was CLASSIC, which is not the game most people play. `--ruleset=classic`
  // reproduces the old numbers; the ruleset is printed on every table so an
  // old and a new report can never be confused.
  const ruleset = (process.argv.find(a => a.startsWith('--ruleset=')) || '').split('=')[1] || 'elemental';
  if (!['classic', 'elemental'].includes(ruleset)) {
    console.error(`--ruleset: expected classic|elemental, got ${ruleset}`);
    process.exit(1);
  }

  if ((process.argv.find(a => a.startsWith('--mode=')) || '').split('=')[1] === 'elemental') {
    console.error('--mode=elemental was removed in round 23 (Remi): not representative; use tools/elo.js');
    process.exit(1);
  }

  console.error(`arena: ${games} games of ${playersPerGame}, ${ruleset}, seed ${seed}, ${strategies().length} strategies`);
  const res = runStudy({ games, playersPerGame, seed, mode: ruleset });

  console.log(`\n=== Elo table (${games} games, ${ruleset}, expected win rate ${(res.expectedWinRate * 100).toFixed(0)}%) ===`);
  console.log('elo    games  win%   strategy');
  for (const r of res.table)
    console.log(`${String(r.elo).padEnd(6)} ${String(r.games).padEnd(6)} ${(r.winRate * 100).toFixed(1).padStart(5)}  ${r.strategy}`);

  console.log(`\n=== item/spell pick win rates (winner-held share) ===`);
  console.log('win%   picked  thing');
  for (const it of res.items)
    console.log(`${(it.winRate * 100).toFixed(1).padStart(5)}  ${String(it.picked).padEnd(7)} ${it.thing}`);

  console.log(`\nlava kill share: ${(res.lavaShare * 100).toFixed(1)}%   comeback rate (winner was >=4 behind): ${(res.comebackRate * 100).toFixed(1)}%`);
  console.log(focusLine(res));
  if (res.unfinished) console.log(`\n(unfinished games: ${res.unfinished})`);
  console.log(`\n${res.seconds.toFixed(1)}s total`);

  const jsonPath = (process.argv.find(a => a.startsWith('--json=')) || '').split('=')[1];
  if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(res, null, 2));
}
