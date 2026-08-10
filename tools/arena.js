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
import {
  BOTS, ROUND, SPELLS, ELEMENTS, ITEMS, ITEM_FX, BUILDS as SHARED_BUILDS,
} from '../shared/constants.js';
import { ownedLevel } from '../shared/catalogue.js';

const DT = 1 / 30;

// Progress ticks ("400/1000 games (12s)") are for a human watching a terminal.
// When stderr is NOT a TTY — an agent, a pipe, CI — they are pure context
// noise, so they are silenced (Remi's context policy, 2026-08-08). The
// one-line run banners stay: they identify what a saved output file was.
const progress = process.stderr.isTTY ? console.error : () => {};
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

// ---- multi-enemy focus (round 17 §11) ---------------------------------------
// The pain the stochastic pickPrey exists to fix: everyone converging on one
// victim. A player is "focused" while 2+ living enemies stand inside FOCUS_R;
// we only watch the opening FOCUS_WINDOW of each round, because that is where
// the pile-on happens (later the field is thinned and 2+ nearby is just the
// endgame). Sampled every FOCUS_EVERY ticks — cheap, and 5 Hz is far finer
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
// pilot every spell their build buys — boomerang included — so arena games
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
  // labs still named `bruiser` in their DEFAULTS — the elemental study threw
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

// ---- elemental study --------------------------------------------------------
// Sanity check for the experimental ruleset: mirror games (all seats the same
// combat profile + build) where only the element pick differs, so any
// degenerate element (e.g. a midas gold snowball) shows up as a win-rate or
// gold outlier. Not a tuning tool — a smoke alarm.

// the shared build every elemental-study seat runs, so the element is the only
// difference between seats (round 21.8: `bruiser` retired, `warlord` replaces it)
export const ELEMENTAL_STUDY_BUILD = 'warlord';

export function runElementalStudy({ kind = 'berserker', games = 100, playersPerGame = 4, seed = 1, log = progress } = {}) {
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
      // ⚠ was `bruiser` (retired round 20.2, which is what broke this study).
      // warlord is its successor: the plain damage-and-sustain yardstick, so
      // the seats still differ ONLY by their element.
      lineup.push({ id: `${kind}+${el}`, kind, build: ELEMENTAL_STUDY_BUILD, element: el });
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

export function runItemProbe({ kind = 'berserker', games = 1400, playersPerGame = 4, seed = 1, log = progress } = {}) {
  const TAIL = ['fireball', 'fireball', 'amulet', 'boots'];
  const probes = ['treads', 'cape', 'sword', 'boots', 'amulet', 'brazier', 'spoon', 'none'];
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

// ---- isolation lab ----------------------------------------------------------
// "What is this thing worth over spending the same gold on nothing?"
//
// WHY THIS EXISTS (BALANCE.md Findings 12A / 13B / 15A). The mixed tables above
// — the Elo study, the mirror tables, the 12-element elemental study — are
// RANKINGS, not strength meters. They are zero-sum: every point one element wins
// is a point taken off the other three seats, so "below the 25% baseline" does
// not mean "weak". The proof is the do-nothing control: an element whose `fx` is
// literally `{}`, which therefore does nothing at all but still pays its 26 g,
// scores 2.7% in a 4-player game, not 25%. Spending gold on nothing is actively
// bad, and every mixed-table number silently contains that penalty.
//
// THE INSTRUMENT. Four seats, same bot kind, same build order, same everything.
// ONE seat buys the thing under test; the other THREE buy a lab-only CONTROL —
// same gold, same number of purchases, zero effect. Then:
//
//     if the probe seat also carried the control, all four seats would be
//     identical, so each would win 25% of the games BY SYMMETRY.
//
// So the baseline is exactly 25% with no calibration run, and the reported
// number is `win% − 25` = **points gained by swapping a price-matched
// do-nothing for the real thing**. That is the most isolated measurement this
// codebase can make: build, profile, gold spent and number of shop clicks are
// all held equal, and only the effect differs.
//
//   node tools/arena.js --isolate=elements --games=600
//   node tools/arena.js --isolate=items --games=600          # every item, lv1-3
//   node tools/arena.js --isolate=spells --games=600         # every spell, lv1
//   node tools/arena.js --isolate=treads --level=2 --games=800
//   node tools/arena.js --isolate=vampire --control=none     # the round-12 arrangement
//
// `--control=none` reproduces the OLDER arrangement (Finding 12A): the three
// other seats buy nothing at all instead of a control, so the probe seat is
// genuinely poorer than they are and the do-nothing floor is 2.7% rather than
// 25%. Kept because every number in the round-12/13 addenda was taken that way.
//
// ⚠ WHAT THIS LAB STILL CANNOT SEE: bots. A thing whose value is reactive
// (teleport saves, boomerang catches, lining two targets up for ghost, holding a
// gale burst) measures at its FLOOR here, and a spell no bot brain ever casts
// measures at exactly the control — see the `spells` table, where that is a
// visible, reproducible result rather than an excuse.

// The lab-only control. Registered into the real spec objects because buy() and
// itemBonuses() are the code under test and must treat it exactly like any other
// purchase. `ITEM_FX.__control = {}` is the whole "does nothing": itemBonuses
// iterates the fx keys, finds none, and contributes neither a mult nor an add.
const CONTROL_ITEM = '__control';
const CONTROL_ELEMENT = '__controlElement';
function registerControls(itemCost, elementCosts = [10, 8, 8]) {
  ITEMS[CONTROL_ITEM] = { name: 'Control', cost: itemCost, maxLevel: 3, desc: 'lab control: does nothing' };
  ITEM_FX[CONTROL_ITEM] = {};
  // Round 16: element cost curves DIFFER (cheap 6+5+5 single-axis elements vs
  // 6+5+12 specials vs the 10+8+8 originals), so the control element copies the
  // PROBE element's cost curve per run — price-matched at every level.
  ELEMENTS[CONTROL_ELEMENT] = {
    name: 'Control', icon: '·', maxLevel: 3, costs: [...elementCosts],
    desc: 'lab control: does nothing', fx: {},
  };
}

// The LONG build tail every seat shares. Two requirements:
//  · it must contain enough to buy that no seat ends the game sitting on unspent
//    gold — that is the gold-saturation artifact (Finding 12E), and under a short
//    tail a gold sink costs nothing, which makes the control look harmless and
//    every measurement collapse toward zero;
//  · it must contain only spells this bot brain actually pilots, or the tail
//    itself becomes a gold sink of unknown size.
// Levels are reached by repetition: the list is walked once per shop and buys at
// most one level per entry per pass.
// ⚠ ORDER IS BREADTH-FIRST, AND THAT IS LOAD-BEARING. An earlier version listed
// every spell to max and only then the items; it front-loaded 114 g of spells,
// so no seat ever owned an item and every item measurement was taken in a world
// where nobody else had one. One pass = one of everything; three passes = every
// level. It also matches Remi's stated design principle for the shop ("let
// players chase one dimension, but make breadth the better default").
const TAIL_PASS = ['fireball', 'amulet', 'boots', 'sword', 'cape', 'treads',
  'brazier', 'spoon', 'lightning', 'boomerang', 'rush', 'shield', 'teleport'];
export const ISOLATION_TAIL = [...TAIL_PASS, ...TAIL_PASS, ...TAIL_PASS];

// SELF-TEST for the instrument: give the PROBE seat the control too, so all four
// seats are byte-identical. The lab must then read 25.0% / +0.0 — anything else
// is a bug in the harness (seat bias, an unbalanced tail, a leaky control), not
// a fact about the game. `node tools/arena.js --isolate=self-test`.
export function runIsolationSelfTest(opts = {}) {
  registerControls(12);
  return runIsolation({ ...opts, thing: CONTROL_ITEM });
}

// One measurement: `thing` at `level`, against three control seats.
export function runIsolation({
  thing, level = 3, games = 600, seed = 1, kind = 'berserker',
  control = 'matched', mode = 'classic', tail: tailName = 'long', log = () => {},
} = {}) {
  // `tail: <a BUILDS name>` swaps the long shared order for that build's SHORT
  // build. It exists for one measurement and it is not a footnote: midas pays in
  // GOLD, so its whole value is "is there anything left to buy?". On the long
  // tail it is the strongest element in the game; on the bruiser tail the seat
  // finishes its build and sits on the change, and midas measures nothing.
  // Any thing whose payload is economic must be quoted with its tail.
  const baseTail = (SHARED_BUILDS[tailName] && SHARED_BUILDS[tailName].order) || ISOLATION_TAIL;
  const isElement = Object.hasOwn(ELEMENTS, thing);
  const isSpell = Object.hasOwn(SPELLS, thing);
  const spec = isElement ? ELEMENTS[thing] : isSpell ? SPELLS[thing] : ITEMS[thing];
  if (!spec) throw new Error(`unknown thing: ${thing}`);
  const lv = Math.min(level, spec.maxLevel);
  // gold the probe seat spends on the thing, and therefore what the control has
  // to cost to be price-matched
  const price = isElement || isSpell
    ? spec.costs.slice(0, lv).reduce((a, b) => a + b, 0)
    : ITEMS[thing].cost * lv;

  // An ELEMENT is controlled by the control ELEMENT (identical cost curve).
  // Anything else is controlled by the control ITEM, priced so that `lv` copies
  // of it cost exactly what the probe spent. Spells are measured at level 1 for
  // this reason: a spell's cost curve (10+6+6) has no item-shaped twin.
  const ctlKey = isElement ? CONTROL_ELEMENT : CONTROL_ITEM;
  const ctlLevels = isElement ? lv : (isSpell ? 1 : lv);
  registerControls(isElement ? 0 : Math.round(price / ctlLevels),
    isElement ? spec.costs : undefined);
  const ctlPrice = isElement
    ? ELEMENTS[CONTROL_ELEMENT].costs.slice(0, lv).reduce((a, b) => a + b, 0)
    : ITEMS[CONTROL_ITEM].cost * ctlLevels;

  // the shared tail, with the thing under test removed from it (or it would be
  // bought by the control seats too and there would be nothing to compare)
  const tail = baseTail.filter(k => k !== thing);
  const probeList = [...Array(lv).fill(thing), ...tail];
  const ctlList = control === 'none'
    ? tail
    : [...Array(ctlLevels).fill(ctlKey), ...tail];
  const caps = { [thing]: lv, [ctlKey]: ctlLevels };

  const seat = (probe) => ({
    id: probe ? `probe:${thing}` : 'control', kind, probe,
    priorities: probe ? probeList : ctlList, caps,
  });

  let wins = 0, finished = 0, kills = 0, goldLeft = 0, ctlWins = 0;
  for (let g = 0; g < games; g++) {
    // rotate which seat holds the probe: spawn position is seat-indexed
    const probeSeat = g % 4;
    const lineup = [0, 1, 2, 3].map(i => seat(i === probeSeat));
    const res = playGame(lineup, seed * 100000 + g, { mode });
    if (!res.finished) continue;
    finished++;
    res.ranking.forEach((r, place) => {
      const isProbe = r.idx === probeSeat;
      if (isProbe) { kills += r.kills; goldLeft += r.gold; }
      if (place === 0) { if (isProbe) wins++; else ctlWins++; }
    });
    if ((g + 1) % 400 === 0) log(`    ${g + 1}/${games} (${thing} lv${lv})`);
  }
  const winRate = finished ? wins / finished : 0;
  return {
    thing, level: lv, price, ctlPrice, control, games: finished, kind, mode,
    tail: tailName,
    winRate,
    // the headline: points over spending the same gold on a do-nothing control
    isolated: winRate * 100 - (control === 'none' ? 0 : 25),
    ctlWinRate: finished ? ctlWins / finished / 3 : 0,
    avgKills: finished ? kills / finished : 0,
    avgGoldLeft: finished ? goldLeft / finished : 0,
  };
}

// ---- item LEVEL ladder ------------------------------------------------------
// The isolation lab above answers "is this thing worth its gold at all". It does
// NOT answer the question a player actually faces in the shop, which is:
//
//     "should my next 12 gold buy LEVEL 2 of this, or the next thing on my list?"
//
// That one needs no control at all, because the alternative *is* the control:
// four identical seats, same profile, same build tail, differing ONLY in how
// many levels of one item they are allowed to buy — 0, 1, 2, 3. A seat capped at
// level 1 spends the gold it saved on the rest of the tail, automatically. So:
//
//   · 25% everywhere        → every level is exactly worth its price
//   · level 1 above 25%     → the first purchase beats the rest of the shop
//   · level 3 below level 1 → levels 2-3 are a TRAP: the same gold buys more
//                             somewhere else, which is what round 12's flat
//                             cost + steeply diminishing effect produced
//
//   node tools/arena.js --ladder=treads --games=1200
//   node tools/arena.js --ladder=all --games=1200
export function runLevelLadder({
  thing, games = 1200, seed = 1, kind = 'berserker', mode = 'classic', log = () => {},
} = {}) {
  const maxLevel = ITEMS[thing] ? ITEMS[thing].maxLevel : 3;
  // ⚠ All four seats walk the SAME list; only the cap differs. Two earlier
  // versions were wrong and both made every item look like a trap:
  //  · putting the item at the HEAD of the probe seats' list only — that
  //    measured a first-shop tempo cost on top of the item;
  //  · putting all THREE levels at the head — that measured "bought your third
  //    pair of boots before your first amulet", which nobody would ever do.
  // The shape below is the one the design is actually about: level 1 EARLY, then
  // a full breadth pass over the rest of the shop, then level 2, another pass,
  // then level 3. So a capped seat spends the saved gold going WIDER, and the
  // question the table answers is exactly Remi's — depth or breadth?
  const rest = TAIL_PASS.filter(k => k !== thing && k !== 'fireball');
  const list = ['fireball', 'fireball', thing, ...rest, thing, ...rest, thing, ...rest];
  const seat = (lv) => ({
    id: `${thing}@${lv}`, kind, lv, priorities: list, caps: { [thing]: lv },
  });
  const levels = [0, 1, 2, 3].slice(0, maxLevel + 1);
  const wins = Object.fromEntries(levels.map(l => [l, 0]));
  const played = Object.fromEntries(levels.map(l => [l, 0]));
  const placeSum = Object.fromEntries(levels.map(l => [l, 0]));
  let finished = 0;
  for (let g = 0; g < games; g++) {
    // rotate the seat order so spawn position cannot favour a level
    const order = levels.map((_, i) => levels[(i + g) % levels.length]);
    const lineup = order.map(seat);
    const res = playGame(lineup, seed * 100000 + g, { mode });
    if (!res.finished) continue;
    finished++;
    res.ranking.forEach((r, place) => {
      const lv = lineup[r.idx].lv;
      played[lv]++; placeSum[lv] += place + 1;
      if (place === 0) wins[lv]++;
    });
    if ((g + 1) % 400 === 0) log(`    ${g + 1}/${games} ladder games (${thing})`);
  }
  return {
    thing, games: finished, kind, cost: ITEMS[thing] ? ITEMS[thing].cost : 0,
    rows: levels.map(l => ({
      level: l, games: played[l],
      winRate: played[l] ? wins[l] / played[l] : 0,
      avgPlace: played[l] ? placeSum[l] / played[l] : 0,
    })),
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

// ---- mirror study -----------------------------------------------------------
// All seats use the SAME combat profile; only builds differ. This removes the
// profile confound (skill dwarfs shopping) and answers the real balance
// question: within one skill tier, is any build a trap or an auto-win?

export function runMirror({ kind = 'stalker', games = 1500, playersPerGame = 4, seed = 1, mode = 'elemental', log = progress } = {}) {
  const builds = Object.keys(BUILDS);
  const wins = Object.fromEntries(builds.map(b => [b, 0]));
  const played = Object.fromEntries(builds.map(b => [b, 0]));
  const placeSum = Object.fromEntries(builds.map(b => [b, 0]));
  const rand = makeRng(seed);
  let unfinished = 0, finished = 0;
  let lavaDeaths = 0, directDeaths = 0, comebacks = 0;
  let focusSamples = 0, focusHits = 0;
  const t0 = Date.now();

  for (let g = 0; g < games; g++) {
    const pool = [...builds];
    const lineup = [];
    for (let i = 0; i < playersPerGame; i++) {
      const build = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      lineup.push({ id: `${kind}/${build}`, kind, build });
    }
    const res = playGame(lineup, seed * 100000 + g, { mode });
    if (!res.finished) { unfinished++; continue; }
    finished++;
    lavaDeaths += res.lavaDeaths;
    directDeaths += res.directDeaths;
    focusSamples += res.focusSamples;
    focusHits += res.focusHits;
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
    kind, mode, games, playersPerGame, unfinished, expectedWinRate,
    lavaShare: lavaDeaths / Math.max(1, lavaDeaths + directDeaths),
    comebackRate: comebacks / Math.max(1, finished),
    focusShare: focusHits / Math.max(1, focusSamples),
    focusWindow: FOCUS_WINDOW, focusRadius: FOCUS_R,
    seconds: (Date.now() - t0) / 1000, table,
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
  // createGame), and so is this lab's — every arena table printed before that
  // was CLASSIC, which is not the game most people play. `--ruleset=classic`
  // reproduces the old numbers; the ruleset is printed on every table so an
  // old and a new report can never be confused.
  const ruleset = (process.argv.find(a => a.startsWith('--ruleset=')) || '').split('=')[1] || 'elemental';
  if (!['classic', 'elemental'].includes(ruleset)) {
    console.error(`--ruleset: expected classic|elemental, got ${ruleset}`);
    process.exit(1);
  }

  const mode = (process.argv.find(a => a.startsWith('--mode=')) || '').split('=')[1];
  if (mode === 'elemental') {
    const kind = (process.argv.find(a => a.startsWith('--kind=')) || '').split('=')[1] || 'berserker';
    console.error(`elemental study: ${games} games of ${playersPerGame} × ${kind}, elements only differ, seed ${seed}`);
    const res = runElementalStudy({ kind, games, playersPerGame, seed });
    console.log(`\n=== elemental: all ${kind}/${ELEMENTAL_STUDY_BUILD}, element pick differs (expected win rate ${(res.expectedWinRate * 100).toFixed(0)}%) ===`);
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
    console.error(`mirror arena: ${games} games of ${playersPerGame} × ${mirror}, ${ruleset}, seed ${seed}`);
    const res = runMirror({ kind: mirror, games, playersPerGame, seed, mode: ruleset });
    console.log(`\n=== mirror: all ${mirror} in ${ruleset}, builds only (expected win rate ${(res.expectedWinRate * 100).toFixed(0)}%) ===`);
    console.log('win%   avg-place  games  build');
    for (const r of res.table)
      console.log(`${(r.winRate * 100).toFixed(1).padStart(5)}  ${r.avgPlace.toFixed(2).padStart(9)}  ${String(r.games).padEnd(6)} ${r.build}`);
    console.log(`\nlava kill share: ${(res.lavaShare * 100).toFixed(1)}%   comeback rate (winner was >=4 behind): ${(res.comebackRate * 100).toFixed(1)}%`);
    console.log(focusLine(res));
    if (res.unfinished) console.log(`(unfinished games: ${res.unfinished})`);
    console.log(`${res.seconds.toFixed(1)}s total`);
    const jsonPathM = (process.argv.find(a => a.startsWith('--json=')) || '').split('=')[1];
    if (jsonPathM) fs.writeFileSync(jsonPathM, JSON.stringify(res, null, 2));
    process.exit(0);
  }

  // ---- item level ladder: --ladder=<item|all> ------------------------------
  const ladder = (process.argv.find(a => a.startsWith('--ladder=')) || '').split('=')[1];
  if (ladder) {
    const kind = (process.argv.find(a => a.startsWith('--kind=')) || '').split('=')[1] || 'berserker';
    const keys = ladder === 'all'
      ? Object.keys(ITEMS).filter(k => !ITEMS[k].mode)
      : [ladder];
    console.error(`level ladder: ${keys.length} item(s) x ${games} games, ${kind}, seed ${seed}`);
    console.log(`\n=== item level ladder: 4 identical ${kind} seats, capped at 0/1/2/3 levels ===`);
    console.log(`${games} games each. A seat that stops early spends the saved gold on the same`);
    console.log(`shared tail, so 25% = "this level is exactly worth its price"; below 25% = a trap.\n`);
    console.log('item     cost  lv0    lv1    lv2    lv3     (win%, baseline 25.0)');
    const out = [];
    for (const k of keys) {
      const r = runLevelLadder({ thing: k, games, seed, kind, log: progress });
      out.push(r);
      const cells = r.rows.map(x => (x.winRate * 100).toFixed(1).padStart(5)).join('  ');
      console.log(`${k.padEnd(8)} ${String(r.cost).padStart(4)}  ${cells}`);
    }
    const jsonPathL = (process.argv.find(a => a.startsWith('--json=')) || '').split('=')[1];
    if (jsonPathL) fs.writeFileSync(jsonPathL, JSON.stringify(out, null, 2));
    process.exit(0);
  }

  // ---- isolation lab: --isolate=<key|elements|items|spells> ----------------
  const isolate = (process.argv.find(a => a.startsWith('--isolate=')) || '').split('=')[1];
  if (isolate) {
    const kind = (process.argv.find(a => a.startsWith('--kind=')) || '').split('=')[1] || 'berserker';
    const control = (process.argv.find(a => a.startsWith('--control=')) || '').split('=')[1] || 'matched';
    const tail = (process.argv.find(a => a.startsWith('--tail=')) || '').split('=')[1] || 'long';
    const levelArg = (process.argv.find(a => a.startsWith('--level=')) || '').split('=')[1];
    // what to measure, and at which levels
    let jobs = [];
    if (isolate === 'self-test') {
      const r = runIsolationSelfTest({ games, seed, kind, control, log: progress });
      console.log(`\n=== isolation SELF-TEST: all four seats carry the control ===`);
      console.log(`${r.games} games. Expected 25.0% / +0.0 by symmetry.`);
      console.log(`measured ${(r.winRate * 100).toFixed(1)}%  (isolated ${r.isolated >= 0 ? '+' : ''}${r.isolated.toFixed(1)})`);
      process.exit(0);
    }
    if (isolate === 'no-op') {
      // The calibration run of Finding 12A, reproducible with the shipped tool:
      // an ELEMENT whose fx is literally {} — it does nothing whatsoever but
      // still pays its 10+8+8 g. Under --control=none (three seats that buy no
      // element at all) this is the "do-nothing floor", and it is nowhere near
      // 25%. It doubles as the proof that the lab's control is really inert.
      registerControls(12);
      jobs = [{ thing: CONTROL_ELEMENT, level: 3, mode: 'elemental' }];
    } else if (isolate === 'elements') {
      jobs = Object.keys(ELEMENTS).map(k => ({ thing: k, level: 3, mode: 'elemental' }))
        .filter(j => j.thing !== CONTROL_ELEMENT);
    } else if (isolate === 'items') {
      const levels = levelArg ? [Number(levelArg)] : [1, 2, 3];
      for (const k of Object.keys(ITEMS)) {
        if (ITEMS[k].mode === 'elemental') continue; // an elemental-only item (none today)
        for (const L of levels) jobs.push({ thing: k, level: L, mode: 'classic' });
      }
    } else if (isolate === 'spells') {
      jobs = Object.keys(SPELLS).filter(k => k !== 'fireball')
        .map(k => ({ thing: k, level: Number(levelArg || 1), mode: 'classic' }));
      jobs.push({ thing: 'fireball', level: 3, mode: 'classic' });
    } else {
      const mode = Object.hasOwn(ELEMENTS, isolate) ? 'elemental' : 'classic';
      jobs = [{ thing: isolate, level: Number(levelArg || 3), mode }];
    }
    console.error(`isolation lab: ${jobs.length} measurement(s) x ${games} games, ` +
      `${kind}, control=${control}, seed ${seed}`);
    const rows = [];
    for (const job of jobs) {
      const r = runIsolation({ ...job, games, seed, kind, control, tail, log: progress });
      rows.push(r);
      console.error(`  ${r.thing} lv${r.level}: ${(r.winRate * 100).toFixed(1)}%`);
    }
    const base = control === 'none' ? 0 : 25;
    console.log(`\n=== isolation: 1 seat has the thing, ${control === 'none'
      ? '3 seats buy nothing extra (the round-12 arrangement; do-nothing floor ~2.7%)'
      : '3 seats buy a price-matched do-nothing control (baseline exactly 25%)'} ===`);
    console.log(`${games} games each, all seats ${kind} on the shared long tail. ` +
      `"isolated" = win% − ${base}, i.e. points over spending the same gold on nothing.`);
    console.log('\nisolated  win%   gold  ctl-win%  kills  games  thing');
    for (const r of [...rows].sort((a, b) => b.isolated - a.isolated))
      console.log(`${(r.isolated >= 0 ? '+' : '') + r.isolated.toFixed(1).padStart(7)}  ` +
        `${(r.winRate * 100).toFixed(1).padStart(5)}  ${String(r.price).padStart(4)}  ` +
        `${(r.ctlWinRate * 100).toFixed(1).padStart(8)}  ${r.avgKills.toFixed(1).padStart(5)}  ` +
        `${String(r.games).padEnd(6)} ${r.thing} lv${r.level}`);
    const jsonPathI = (process.argv.find(a => a.startsWith('--json=')) || '').split('=')[1];
    if (jsonPathI) fs.writeFileSync(jsonPathI, JSON.stringify(rows, null, 2));
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
