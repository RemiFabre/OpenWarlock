// Head-to-head between TWO roster strategies — 2 seats each in the same game,
// reporting what each side actually DID, not just who won. The Elo table
// (tools/elo.js) answers "which ranks higher"; this answers "why", which is the
// question a one-variable A/B (same kit, one item swapped) actually asks.
//
//   node tools/pair.js F1-spoon-volume F2-sword-volume --games=300 --seed=1
//   node tools/pair.js A1-items-sustain B5-item-depth --games=600
//
// ⚠ Roster `caps` are honoured (caps {x: 0} = never buy x). For a
// one-variable comparison this is LOAD-BEARING: the shared exhaust tail holds
// nearly every item, so without a ban each seat eventually buys the very thing
// its rival's core exists to test, and the pair measures buy ORDER instead
// (round 21.8 scar — it silently produced a plausible table).
//
// What it cannot see: the usual bot ceiling (no baiting, no CC chains, no
// cluster play), plus anything that needs a human to read it (traps, bluffs).

import { createGame, addPlayer, startGame, step, stepBot, buy, setShopReady, makeRng }
  from '../shared/sim.js';
import { ITEM_FX, ITEMS, ELEMENTS } from '../shared/constants.js';
import { ROSTER, paddedCore, expandCore } from './roster.js';
import { EXHAUST_PASS } from './strategy-study.js';

// --fx=<key>.<field>=<a,b,c> — same sweep hook arena.js has, so a "what if we
// made it X" question is one command instead of an edit-run-revert cycle.
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

const DT = 1 / 30;
const arg = (n, d) => {
  const a = process.argv.find(x => x.startsWith(`--${n}=`));
  return a ? a.split('=')[1] : d;
};
const ids = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (ids.length !== 2 || ids.some(id => !ROSTER[id])) {
  console.error('usage: node tools/pair.js <strategyA> <strategyB> [--games=300] [--seed=1] [--kind=berserker]');
  console.error(`known: ${Object.keys(ROSTER).join(' ')}`);
  process.exit(1);
}
const GAMES = Number(arg('games', 300));
const SEED = Number(arg('seed', 1));
const KIND = arg('kind', 'berserker');

const buyList = (id) => [...expandCore(paddedCore(ROSTER[id])), ...EXHAUST_PASS, ...EXHAUST_PASS];
const SEATS = [ids[0], ids[1], ids[0], ids[1]];   // alternating, 2 each
const lists = SEATS.map(buyList);
const acc = Object.fromEntries(ids.map(id =>
  [id, { heal: 0, dmg: 0, lava: 0, kills: 0, deaths: 0, place: 0, wins: 0, n: 0 }]));

const rand = makeRng(SEED);
for (let g = 0; g < GAMES; g++) {
  const state = createGame({ seed: Math.floor(rand() * 1e9), mode: 'elemental' });
  SEATS.forEach((id, i) => addPlayer(state, `s${i}`, id, { bot: true, kind: KIND }));
  startGame(state);
  let ticks = 0, lastPhase = state.phase;
  while (state.phase !== 'gameover' && ticks++ < 200_000) {
    step(state, DT);
    if (state.phase === 'battle') for (const id of Object.keys(state.players)) stepBot(state, id, DT);
    if (state.phase === 'shop' && lastPhase !== 'shop') {
      SEATS.forEach((_, i) => {
        const caps = ROSTER[SEATS[i]].caps || {};
        for (const thing of lists[i]) {
          if (caps[thing] != null) continue;   // banned by the core's own spec
          buy(state, `s${i}`, thing);
        }
        setShopReady(state, `s${i}`);
      });
    }
    lastPhase = state.phase;
    state.events.length = 0;
  }
  Object.values(state.players)
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    .forEach((p, place) => {
      const a = acc[SEATS[Number(p.id.slice(1))]];
      a.heal += p.healLifesteal || 0;
      a.dmg += p.dmgDealt || 0;
      a.lava += p.dmgLava || 0;
      a.kills += p.kills;
      a.deaths += p.deaths;
      a.place += place + 1;
      a.n++;
      if (place === 0) a.wins++;
    });
  if (g % 50 === 0) process.stderr.write(`${g}/${GAMES}\r`);
}

// Every column is PER GAME per seat, averaged over both seats of that strategy.
// "healed" is the healing column of the in-game scoreboard (lifesteal + the
// Slow Spoon's flat procs); "won" is share of games this seat placed 1st, and
// 25% is par in a 4-seat lobby.
console.log(`\n${GAMES} games · 2 seats each · ${KIND} bots · elemental · seed ${SEED}`);
console.log('healed  dmg dealt  lava dmg  kills  deaths  place  won%   strategy');
for (const id of ids) {
  const a = acc[id];
  console.log(`${(a.heal / a.n).toFixed(1).padStart(6)}  ${(a.dmg / a.n).toFixed(0).padStart(9)}  ` +
    `${(a.lava / a.n).toFixed(0).padStart(8)}  ${(a.kills / a.n).toFixed(2).padStart(5)}  ` +
    `${(a.deaths / a.n).toFixed(2).padStart(6)}  ${(a.place / a.n).toFixed(2).padStart(5)}  ` +
    `${(100 * a.wins / a.n).toFixed(1).padStart(5)}  ${id}`);
}
