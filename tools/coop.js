// Co-op campaign lab: headless parties of bots against the 10 campaign levels.
//
// Same idea as tools/arena.js (pure simulation, no server, no network) but
// the question is different. The arena asks "which strategy wins a free-for-
// all"; this asks "can a party of N clear level L, and how often". The answer
// has to hold at party sizes 1, 2 and 3, and the curve has to rise.
//
//   node tools/coop.js                              # ★★ berserker, 1/2/3 players
//   node tools/coop.js --runs=300 --kind=stalker --build=turtle
//   node tools/coop.js --party=2 --runs=500
//   node tools/coop.js --roster                     # just print the level table
//
// How a run works: a party of `party` bots plays the campaign from level 1.
// Clearing a level advances to the next; a WIPE costs a round and the party
// tries the same level again (there is a normal shop between every round, so
// the party powers up exactly like humans would). The run ends when level 10
// falls or the ROUND.MAX_ROUNDS retry budget runs out.
//
// Metrics (per level)
//   tries    attempts at this level across all runs
//   clear%   share of attempts that cleared it (target: 40-70% for a ★★ party
//            on the late levels, near 100% on the first ones)
//   secs     mean battle time of a cleared attempt
//   deaths   mean party members lost per attempt (0 = a clean sweep)
//   reach%   share of runs that got to this level at all

import {
  createGame, addPlayer, startGame, step, stepBot, botShop, setShopReady,
} from '../shared/sim.js';
import { CAMPAIGN, MAX_LEVEL, levelRoster, waveUnits } from '../shared/campaign.js';
import { BOTS, BUILDS, GOLD } from '../shared/constants.js';

const DT = 1 / 30;
const MAX_TICKS = 30 * 60 * 20; // 20 sim-minutes hard cap per campaign run

// One full campaign run. Returns a per-level log:
//   [{level, cleared, time, deaths, partyAlive}]
export function playCampaign({
  party = 2, kind = 'berserker', build = 'warlord', seed = 1,
} = {}) {
  const state = createGame({ seed, mode: 'coop' });
  for (let i = 0; i < party; i++) {
    addPlayer(state, `p${i}`, `${kind}${i}`, { bot: true, kind, build });
  }
  startGame(state);

  const log = [];
  let ticks = 0;
  let lastPhase = state.phase;
  let deaths = 0;
  while (state.phase !== 'gameover' && ticks++ < MAX_TICKS) {
    step(state, DT);
    if (state.phase === 'battle') {
      for (const id of Object.keys(state.players)) stepBot(state, id, DT);
    }
    if (state.events.length) {
      for (const ev of state.events) {
        if (ev.t !== 'death') continue;
        const p = state.players[ev.id];
        if (p && p.team !== 'ai') deaths++;
      }
      state.events.length = 0;
    }
    if (state.phase === 'roundEnd' && lastPhase !== 'roundEnd') {
      const c = state.roundSummary && state.roundSummary.coop;
      if (c) {
        log.push({
          level: c.level, attempt: c.attempt, cleared: !!c.cleared,
          wiped: !!c.wiped, time: state.time, deaths, survivors: c.survivors,
        });
        deaths = 0;
      }
    }
    if (state.phase === 'shop' && lastPhase !== 'shop') {
      for (const p of Object.values(state.players)) if (p.bot) botShop(state, p.id);
      for (const p of Object.values(state.players)) setShopReady(state, p.id);
    }
    lastPhase = state.phase;
  }
  return { log, finished: state.phase === 'gameover' || log.length > 0, ticks };
}

// ---- isolated level runs ----------------------------------------------------
// Tuning one level at a time through full campaigns is hopeless: you only ever
// see level 7 in the runs that survived level 6. This drops a party straight
// into level L with the gear it would plausibly own by then (`income` gold per
// level already banked and spent through the normal bot shop) and plays that
// one round. Calibrate `income` against the full-campaign sweep (default 16 =
// 8 round base + ~4 wave kills each) before trusting the absolute numbers; the
// RELATIVE difficulty between levels is what this is for.

// What one party member banks for clearing level k first try: the round base,
// the win bonus, and their share of the wave's kill gold. Derived from the
// campaign table itself, so editing a level re-prices the gear that follows.
export function levelIncome(k, party) {
  const units = waveUnits(CAMPAIGN[k - 1], party).length;
  return GOLD.ROUND_BASE + GOLD.ROUND_WIN + GOLD.PER_KILL * (units / party);
}

export function playLevel({
  party = 2, kind = 'berserker', build = 'warlord', seed = 1, level = 1, income = null,
} = {}) {
  const state = createGame({ seed, mode: 'coop' });
  for (let i = 0; i < party; i++) {
    addPlayer(state, `p${i}`, `${kind}${i}`, { bot: true, kind, build });
  }
  // pre-gear: one simulated shop per level already cleared, first try
  state.phase = 'shop';
  for (let k = 1; k < level; k++) {
    const g = Math.round(income == null ? levelIncome(k, party) : income);
    for (const p of Object.values(state.players)) {
      p.gold += g; p.goldEarned += g;
      botShop(state, p.id);
    }
  }
  state.phase = 'lobby';
  state.coopLevel = level;
  startGame(state);

  let ticks = 0, deaths = 0;
  while (ticks++ < MAX_TICKS) {
    step(state, DT);
    if (state.phase === 'battle') {
      for (const id of Object.keys(state.players)) stepBot(state, id, DT);
    }
    for (const ev of state.events) {
      if (ev.t !== 'death') continue;
      const p = state.players[ev.id];
      if (p && p.team !== 'ai') deaths++;
    }
    state.events.length = 0;
    if (state.phase === 'roundEnd') break;
  }
  const c = (state.roundSummary && state.roundSummary.coop) || {};
  return { cleared: !!c.cleared, time: state.time, deaths, survivors: c.survivors || 0 };
}

// Independent per-level table: `runs` isolated attempts at every level, for
// every party size. This is the tuning view.
export function levelTable({
  runs = 100, parties = [1, 2, 3], kind = 'berserker', build = 'warlord',
  seed = 11, income = null,
} = {}) {
  const rows = [];
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const row = { level, byParty: {} };
    for (const party of parties) {
      let cleared = 0, timeSum = 0, deathSum = 0;
      for (let r = 0; r < runs; r++) {
        const res = playLevel({
          party, kind, build, level, income, seed: seed * 1e6 + r * 131 + party * 7,
        });
        if (res.cleared) { cleared++; timeSum += res.time; }
        deathSum += res.deaths;
      }
      row.byParty[party] = {
        runs, clear: cleared / runs,
        secs: cleared ? timeSum / cleared : 0, deaths: deathSum / runs,
      };
    }
    rows.push(row);
  }
  return rows;
}

// Sweep: `runs` campaigns per party size, aggregated per level.
export function sweep({
  runs = 200, parties = [1, 2, 3], kind = 'berserker', build = 'warlord', seed = 7,
} = {}) {
  const out = [];
  for (const party of parties) {
    const per = Array.from({ length: MAX_LEVEL }, () => ({
      tries: 0, reached: 0, cleared: 0, timeSum: 0, deathSum: 0,
    }));
    let fullClears = 0, roundSum = 0;
    for (let r = 0; r < runs; r++) {
      const { log } = playCampaign({ party, kind, build, seed: seed * 1e6 + r * 97 + party });
      const seen = new Set();
      for (const e of log) {
        const s = per[e.level - 1];
        s.tries++;
        s.deathSum += e.deaths;
        if (!seen.has(e.level)) { seen.add(e.level); s.reached++; }
        if (e.cleared) { s.cleared++; s.timeSum += e.time; }
      }
      roundSum += log.length;
      if (log.length && log[log.length - 1].cleared && log[log.length - 1].level >= MAX_LEVEL)
        fullClears++;
    }
    out.push({ party, kind, build, runs, fullClears, avgRounds: roundSum / runs, per });
  }
  return out;
}

// ---- CLI -------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('coop.js')) {
  const argOf = (n, d) =>
    (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1] ?? d;

  if (process.argv.includes('--roster')) {
    for (const lv of CAMPAIGN) {
      console.log(`\nL${lv.n} ${lv.name}\n  ${lv.brief}`);
      for (const p of [1, 2, 3]) console.log(`  ${p}p: ${levelRoster(lv, p)}`);
    }
    process.exit(0);
  }

  const runs = Number(argOf('runs', 200));
  const kind = String(argOf('kind', 'berserker'));
  const build = String(argOf('build', 'warlord'));  // bruiser retired, round 20.2
  const seed = Number(argOf('seed', 7));
  const partyArg = argOf('party', null);
  const parties = partyArg ? [Number(partyArg)] : [1, 2, 3];
  if (!Object.hasOwn(BOTS, kind)) { console.error(`unknown kind: ${kind}`); process.exit(1); }
  if (!Object.hasOwn(BUILDS, build)) { console.error(`unknown build: ${build}`); process.exit(1); }

  const stars = BOTS[kind].label;   // Easy / Normal / Hard / Extreme (round 12)

  if (process.argv.includes('--levels')) {
    const income = argOf('income', null) == null ? null : Number(argOf('income', 0));
    console.error(`co-op lab (isolated levels): ${runs} attempts × ${parties.length} party sizes × ${MAX_LEVEL} levels, ${stars} ${kind}/${build}, income ${income == null ? 'per-level (derived)' : income + ' g/level'}`);
    const t = Date.now();
    const rows = levelTable({ runs, parties, kind, build, seed, income });
    console.log(`\n=== isolated level clear rate: ${stars} ${kind}/${build}, ${runs} attempts each ===`);
    console.log(`lvl  ${parties.map(p => `${p}p clear%  secs  dth`).join('   ')}   level`);
    for (const row of rows) {
      const cells = parties.map(p => {
        const s = row.byParty[p];
        return `${(100 * s.clear).toFixed(0).padStart(7)}%  ${s.secs.toFixed(0).padStart(4)}  ${s.deaths.toFixed(1).padStart(3)}`;
      }).join('   ');
      console.log(`${String(row.level).padStart(3)}  ${cells}   ${CAMPAIGN[row.level - 1].name}`);
    }
    console.log(`\n${((Date.now() - t) / 1000).toFixed(1)}s total`);
    process.exit(0);
  }

  console.error(`co-op lab: ${runs} campaign runs per party size, ${stars} ${kind}/${build}, seed ${seed}`);
  const t0 = Date.now();
  const res = sweep({ runs, parties, kind, build, seed });

  for (const r of res) {
    console.log(`\n=== party of ${r.party} × ${stars} ${kind}/${build}: ${r.runs} campaign runs ===`);
    console.log('lvl  tries  clear%   secs  deaths  reach%  level');
    for (let i = 0; i < MAX_LEVEL; i++) {
      const s = r.per[i];
      const pct = s.tries ? (100 * s.cleared / s.tries).toFixed(0) : '-';
      const secs = s.cleared ? (s.timeSum / s.cleared).toFixed(0) : '-';
      const dth = s.tries ? (s.deathSum / s.tries).toFixed(2) : '-';
      const rch = (100 * s.reached / r.runs).toFixed(0);
      console.log(
        `${String(i + 1).padStart(3)}  ${String(s.tries).padStart(5)}  ` +
        `${String(pct).padStart(5)}%  ${String(secs).padStart(5)}  ${String(dth).padStart(6)}  ` +
        `${rch.padStart(5)}%  ${CAMPAIGN[i].name}`);
    }
    console.log(`full campaign clears: ${r.fullClears}/${r.runs} (${(100 * r.fullClears / r.runs).toFixed(1)}%) · ${r.avgRounds.toFixed(1)} rounds/run`);
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s total`);
}
