// Balance lab: headless batch arena with Elo ratings per strategy.
//
// A *strategy* = a combat profile (bot kind) × a build scheme (shop priority
// list). The arena runs thousands of seeded, full games directly against the
// simulation (no server, no network) and rates strategies with Elo from
// pairwise placements, plus per-item/per-spell win correlations.
//
//   node tools/arena.js                         # default: full round-robin-ish study
//   node tools/arena.js --games=2000 --players=4 --seed=1
//   node tools/arena.js --list                  # show strategies
//
// Output: a ranked Elo table + item/spell win-rate stats (and JSON via --json=path).

import fs from 'node:fs';
import {
  createGame, addPlayer, startGame, step, stepBot, botShop, buy, setShopReady, makeRng,
} from '../shared/sim.js';
import { BOTS, ROUND } from '../shared/constants.js';

const DT = 1 / 30;
const MAX_TICKS = 30 * 60 * 45; // 45 sim-minutes hard cap per game

// ---- build schemes --------------------------------------------------------
// Priority lists consumed greedily every shop (first affordable next step).
export const BUILDS = {
  bruiser:   ['fireball', 'amulet', 'fireball', 'boots', 'sword', 'ring', 'cape', 'treads'],
  sniper:    ['lightning', 'fireball', 'boots', 'lightning', 'fireball', 'lightning', 'cape', 'ring'],
  escape:    ['teleport', 'boots', 'fireball', 'teleport', 'cape', 'fireball', 'ring', 'treads'],
  turtle:    ['shield', 'amulet', 'ring', 'cape', 'shield', 'treads', 'fireball', 'fireball'],
  rusher:    ['rush', 'boots', 'fireball', 'rush', 'sword', 'amulet', 'fireball', 'cape'],
  boomer:    ['boomerang', 'fireball', 'boots', 'boomerang', 'amulet', 'boomerang', 'ring', 'sword'],
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

export function playGame(lineup, seed) {
  const state = createGame({ seed });
  lineup.forEach((strat, i) => {
    addPlayer(state, `s${i}`, strat.id, { bot: true, kind: strat.kind });
  });
  startGame(state);

  let ticks = 0;
  let lastPhase = state.phase;
  while (state.phase !== 'gameover' && ticks++ < MAX_TICKS) {
    step(state, DT);
    if (state.phase === 'battle') {
      for (const id of Object.keys(state.players)) stepBot(state, id, DT);
    }
    if (state.phase === 'shop' && lastPhase !== 'shop') {
      lineup.forEach((strat, i) => {
        const id = `s${i}`;
        for (const thing of BUILDS[strat.build]) buy(state, id, thing);
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
    ranking: ranked.map(p => ({
      idx: Number(p.id.slice(1)), kills: p.kills, deaths: p.deaths,
      items: p.items, spells: p.spells,
    })),
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

// ---- study ----------------------------------------------------------------------

export function runStudy({ games = 1000, playersPerGame = 4, seed = 1, log = console.error } = {}) {
  const strats = strategies();
  const elo = makeElo(strats.map(s => s.id));
  const wins = Object.fromEntries(strats.map(s => [s.id, 0]));
  const itemWins = {}, itemGames = {};   // per item: games where owner won / played
  const rand = makeRng(seed);
  let unfinished = 0;
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

    const placement = res.ranking.map(r => lineup[r.idx].id);
    elo.update(placement);
    wins[placement[0]]++;

    // item/spell attribution: winner's inventory vs everyone's
    res.ranking.forEach((r, place) => {
      const owned = [...r.items, ...Object.entries(r.spells)
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
    seconds: (Date.now() - t0) / 1000, table, items,
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

  if (res.unfinished) console.log(`\n(unfinished games: ${res.unfinished})`);
  console.log(`\n${res.seconds.toFixed(1)}s total`);

  const jsonPath = (process.argv.find(a => a.startsWith('--json=')) || '').split('=')[1];
  if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(res, null, 2));
}
