// The ELO-tournament strategy roster (docs/ARCHETYPES.md is GENERATED from
// this file; edit HERE, then `node tools/roster.js --doc` to regenerate).
// Remi's design goals (2026-08-09): level-explicit cores; every core costs a
// bit MORE than the ~145 g an average seat earns in a full game (measured:
// 13.1 rounds, 9.8 kills), so the uncontrolled everything-else tail almost
// never runs; families isolate systems (items vs elements vs mutations vs
// spells, depth vs breadth, spell scaling).
//
//   node tools/roster.js          = cost check table (every core, gold total)
//   node tools/roster.js --doc    = print the ARCHETYPES.md markdown
//
// core entries are [key, level] pairs: ['frost', 2] = "buy frost UP TO lv2
// here"; the runner expands to one buy per level step. Bots fall into the
// study's shared exhaust tail after the core (EXHAUST_PASS below),
// and only into the in-game random fallback once even that is maxed.

import { SPELLS, ELEMENTS, ITEMS, itemCost } from '../shared/constants.js';

export const AVG_EARNED = 145; // measured 2026-08-09, seed 1000-1039, 4 Hard seats

// One canonical breadth pass: everything a berserker/stalker can use, sustain
// and damage first. Repeated so every level of everything is eventually
// reachable (a list entry buys at most one level per shop pass). Lived in
// tools/strategy-study.js until round 24.4 (that instrument was RETIRED,
// superseded by elo.js; this tail is the piece everything else shared).
export const EXHAUST_PASS = [
  'amulet', 'sword', 'boots', 'lightning', 'cape', 'treads',
  'hourglass', 'brazier', 'spoon', 'ember', 'terra', 'arcane', 'gale', 'ghost', 'malady',
  'vampire', 'anger', 'boomerang', 'rush', 'shield', 'teleport',
  'frost', 'mosquito', 'midas',
];

export const COST_TARGET = [150, 185]; // core must land in this band

// cost of buying `key` from level (from) to level (to), exclusive-from
function stepCost(key, from, to) {
  let c = 0;
  for (let l = from; l < to; l++) {
    if (SPELLS[key]) c += SPELLS[key].costs[l];
    else if (ELEMENTS[key]) c += ELEMENTS[key].costs[l];
    else if (ITEMS[key]) c += itemCost(key, l);
    else throw new Error(`unknown key ${key}`);
  }
  return c;
}

export function coreCost(core) {
  const lv = {};
  let total = 0;
  for (const [key, to] of core) {
    total += stepCost(key, lv[key] || 0, to);
    lv[key] = to;
  }
  return total;
}

// expand [key, level] pairs into the study's one-buy-per-entry list
export function expandCore(core) {
  const lv = {};
  const out = [];
  for (const [key, to] of core) {
    for (let l = lv[key] || 0; l < to; l++) out.push(key);
    lv[key] = to;
  }
  return out;
}

// Auto-pad: append filler levels (neutral staples, fixed order) until the
// core enters the cost band, so hand-edited cores stay in spec without
// bookkeeping. Purity probes (noPad) are exempt: their shelf EXHAUSTS below
// the band, which is itself a finding, stated in the doc.
// ⚠ Round 20 (echo deleted, items flat) + 21.1 (items 5/7 g) + 21.7/21.8 (the
// Hat of Aura 6×3 and the Slow Spoon 7×3): the whole item shelf is 147 g, i.e.
// STILL BELOW the 150 g band
// so an items-only core cannot fill its own budget and the padder hits shelf
// exhaustion. Stated as a finding, not papered over.
const FILLER = ['sword', 'amulet', 'boots', 'cape', 'treads', 'hourglass', 'brazier', 'spoon'];
export function paddedCore(entry) {
  if (entry.noPad) return entry.core;
  const core = entry.core.map(x => [...x]);
  const lv = {};
  for (const [k, to] of core) lv[k] = Math.max(lv[k] || 0, to);
  let guard = 40;
  // BREADTH-first fill (Remi, 24.8): always bump the LOWEST-level filler
  // (FILLER order breaks ties), so a build gets every lv1 before any lv2 and
  // every lv2 before any lv3. The old walk maxed items one by one, which is
  // how a tail ended up buying boots lv3 before owning a single amulet.
  while (coreCost(core) < COST_TARGET[0] && guard-- > 0) {
    let pick = null;
    for (const k of FILLER) {
      // a capped thing (caps {x: n}) is off the shelf for this build above n;
      // without this the padder hands a "without x" probe the x back (24.7)
      if (entry.caps && (lv[k] || 0) >= entry.caps[k]) continue;
      if ((lv[k] || 0) >= ITEMS[k].maxLevel) continue;
      if (pick === null || (lv[k] || 0) < (lv[pick] || 0)) pick = k;
    }
    if (pick === null) break; // every filler maxed or capped; shelf exhaustion
    lv[pick] = (lv[pick] || 0) + 1;
    core.push([pick, lv[pick]]);
  }
  return core;
}

// true when the padder ran out of shelf: every FILLER item is at max level and
// the core is STILL under the band. Round 20 made this common (147 g shelf).
export function shelfExhausted(entry) {
  const core = paddedCore(entry);
  if (coreCost(core) >= COST_TARGET[0]) return false;
  const lv = {};
  for (const [k, to] of core) lv[k] = Math.max(lv[k] || 0, to);
  return FILLER.every(k => (lv[k] || 0) >= ITEMS[k].maxLevel);
}

// Family G (round 24.7, Remi): D1-warlord is the base build (average power,
// simple to play), and each G row changes exactly ONE thing about it, so the
// Elo delta vs D1 prices that one choice. All G rows share D1's core verbatim
// (edits marked); the auto-padder fills the tail, which may differ between
// rows only past the ~145 g an average seat actually earns.
const WARLORD_CORE = [['ember', 2], ['sword', 1], ['amulet', 1], ['ember', 3],
  ['sword', 2], ['amulet', 2], ['arcane', 2], ['sword', 3], ['amulet', 3], ['boots', 2], ['cape', 1]];

// Family M (round 24.7, Remi): one mutation maxed FIRST, then an identical
// "normal stuff" scaffold (items, then lv1 of each stat element, then lv2,
// then lv3; spells only from the exhaust tail). Every mutation costs 26 g, so
// all six cores are 166 g and the ONLY difference between M rows is which
// mutation leads. Elo deltas between M rows price the mutations directly.
const MUT_SCAFFOLD = [['sword', 1], ['amulet', 1],
  ['ember', 1], ['terra', 1], ['gale', 1], ['arcane', 1], ['ghost', 1],
  ['sword', 2], ['amulet', 2],
  ['ember', 2], ['terra', 2], ['gale', 2], ['arcane', 2], ['ghost', 2],
  ['sword', 3], ['amulet', 3],
  ['ember', 3], ['terra', 3], ['gale', 3], ['arcane', 3], ['ghost', 3]];

export const FAMILY_TITLES = {
  A: 'Family A: system purity (price each shelf as a class)',
  B: 'Family B: depth vs breadth, per system',
  C: 'Family C: spell-scaling probes',
  D: 'Family D: play-style archetypes',
  E: 'Family E: cooldown reduction (question M)',
  F: 'Family F: sustain, flat heal-per-hit vs lifesteal (round 21.8)',
  G: 'Family G: the Warlord, one variable at a time (control = D1-warlord; round 24.7)',
  M: 'Family M: one mutation maxed first, identical scaffold after (round 24.7)',
  K: 'Family K: the Faker combo arsenals, on the Faker brain (issue #7)',
};

export const ROSTER = {
  // ---- Family A: system purity (price each shelf as a class) --------------
  'A1-items-sustain': {
    family: 'A', fantasy: "The item shelf's best self: HP and both kinds of healing.",
    tests: 'items as a class (sustain half) vs the element families',
    // round 21.8: the Slow Spoon is the shelf's second healing source, so the
    // sustain probe has to hold it or it stops being the sustain probe
    core: [['amulet', 1], ['sword', 1], ['spoon', 1], ['amulet', 2], ['sword', 2],
      ['spoon', 2], ['amulet', 3], ['sword', 3], ['spoon', 3], ['cape', 2], ['hourglass', 2]],
  },
  // Round 20: echo deleted, so the mobility half is now boots+treads+cape+
  // hourglass MAXED = 78 g and the padder tops it up with sword/amulet.
  'A2-items-mobility': {
    family: 'A', fantasy: "The item shelf's utility half: speed, lava, armor.",
    tests: 'items as a class (mobility half)',
    core: [['boots', 1], ['treads', 1], ['boots', 2], ['cape', 1], ['boots', 3],
      ['treads', 2], ['cape', 2], ['treads', 3], ['cape', 3], ['hourglass', 1],
      ['hourglass', 2], ['hourglass', 3]],
  },
  'A3-elements-only': {
    family: 'A', noPad: true, fantasy: 'Pure fireball stat scaling, zero items.',
    tests: 'the stat-element shelf as a class',
    core: [['ember', 2], ['arcane', 1], ['gale', 1], ['terra', 1], ['ghost', 1],
      ['ember', 3], ['arcane', 2], ['gale', 2], ['terra', 2], ['ghost', 2], ['arcane', 3], ['terra', 3], ['ghost', 3], ['gale', 3]],
  },
  'A4-mutations-only': {
    family: 'A', noPad: true, fantasy: 'Pure behavior-changers, zero items or stat axes.',
    tests: 'the mutation shelf as a class',
    core: [['anger', 1], ['frost', 1], ['anger', 2], ['frost', 2], ['anger', 3],
      ['frost', 3], ['malady', 2], ['midas', 1], ['malady', 3], ['mosquito', 3], ['midas', 3]],
  },
  'A5-spells-only': {
    family: 'A', noPad: true, fantasy: 'The kit shelf as a class: buttons, no elements.',
    tests: 'spells as a class',
    core: [['lightning', 1], ['boomerang', 1], ['rush', 1], ['shield', 1],
      ['lightning', 2], ['boomerang', 2], ['lightning', 3], ['shield', 2],
      ['boomerang', 3], ['rush', 2], ['teleport', 2]],
  },
  'A6-no-elements': {
    family: 'A', fantasy: 'Items + spells, elements refused: prices the element shelf by absence.',
    tests: 'control: what skipping elements costs',
    core: [['amulet', 1], ['sword', 1], ['boots', 1], ['lightning', 1],
      ['amulet', 2], ['sword', 2], ['boomerang', 1], ['cape', 1], ['treads', 1],
      ['hourglass', 1], ['amulet', 3], ['sword', 3], ['lightning', 2], ['boots', 2]],
  },

  // ---- Family B: depth vs breadth, per system ------------------------------
  'B1-element-depth': {
    family: 'B', fantasy: 'Rush two stat axes to max before anything else.',
    tests: 'depth (vs B2) for stat elements',
    core: [['ember', 3], ['arcane', 3], ['sword', 1], ['amulet', 1],
      ['sword', 2], ['amulet', 2], ['gale', 1], ['sword', 3], ['amulet', 3], ['boots', 1]],
  },
  'B2-element-breadth': {
    family: 'B', fantasy: 'Level 1 of every stat axis before any level 2.',
    tests: 'breadth (vs B1) for stat elements',
    core: [['ember', 1], ['terra', 1], ['arcane', 1], ['gale', 1], ['ghost', 1],
      ['ember', 2], ['terra', 2], ['arcane', 2], ['gale', 2], ['ghost', 2],
      ['ember', 3], ['sword', 2], ['amulet', 2], ['terra', 3]],
  },
  'B3-mutation-depth': {
    family: 'B', fantasy: 'Max one mutation immediately (anger, the scaler).',
    tests: 'depth (vs B4) for mutations',
    core: [['anger', 3], ['amulet', 1], ['sword', 1], ['amulet', 2],
      ['sword', 2], ['amulet', 3], ['sword', 3], ['boots', 2], ['cape', 1]],
  },
  'B4-mutation-breadth': {
    family: 'B', fantasy: 'One level of five mutations: does cross-synergy beat depth?',
    tests: 'breadth (vs B3) for mutations + cross-mutation synergy',
    core: [['anger', 1], ['frost', 1], ['midas', 1], ['malady', 1], ['mosquito', 1],
      ['anger', 2], ['frost', 2], ['midas', 2], ['malady', 2], ['anger', 3], ['sword', 2], ['amulet', 1]],
  },
  'B5-item-depth': {
    family: 'B', fantasy: 'Max the two best items before touching the rest.',
    tests: 'depth (vs B6) for items',
    core: [['sword', 3], ['amulet', 3], ['boots', 1], ['boots', 2],
      ['cape', 1], ['treads', 1], ['boots', 3], ['cape', 2], ['hourglass', 1]],
  },
  // Round 20: echo is gone. Round 21.5/21.8: the Hat of Aura and the Slow Spoon
  // joined, so "one of everything" is EIGHT items and the whole shelf maxed =
  // 147 g; still under
  // the band, so noPad and shelf exhaustion stay BY DESIGN.
  'B6-item-breadth': {
    family: 'B', noPad: true,
    fantasy: 'One of everything before any second level (the round-15 champion).',
    tests: 'breadth (vs B5) for items, post-reworks',
    core: [['sword', 1], ['amulet', 1], ['boots', 1], ['cape', 1], ['treads', 1],
      ['hourglass', 1], ['brazier', 1], ['spoon', 1], ['sword', 2], ['amulet', 2], ['boots', 2],
      ['cape', 2], ['treads', 2], ['hourglass', 2], ['brazier', 2], ['spoon', 2], ['sword', 3],
      ['amulet', 3], ['boots', 3], ['cape', 3], ['treads', 3], ['hourglass', 3],
      ['brazier', 3], ['spoon', 3]],
  },

  // ---- Family C: spell-scaling probes --------------------------------------
  'C1-bolt-rush': {
    family: 'C', fantasy: 'Max one spell immediately: is spell depth worth 22 g?',
    tests: 'spell depth (vs C2, its control)',
    core: [['lightning', 3], ['hourglass', 2], ['amulet', 1], ['sword', 1],
      ['amulet', 2], ['sword', 2], ['hourglass', 3], ['amulet', 3], ['sword', 3], ['boots', 1]],
  },
  'C2-bolt-splash': {
    family: 'C', fantasy: 'Spell lv1 as a tool, stats do the killing.',
    tests: 'the control for C1: same shell, minimum spell investment',
    core: [['lightning', 1], ['ember', 2], ['amulet', 1], ['sword', 1],
      ['ember', 3], ['amulet', 2], ['sword', 2], ['arcane', 2], ['amulet', 3], ['sword', 3], ['boots', 1]],
  },
  'C3-kit-width': {
    family: 'C', fantasy: 'Five buttons at lv1: is width its own power?',
    tests: 'kit width vs C1 depth',
    core: [['lightning', 1], ['boomerang', 1], ['shield', 1], ['teleport', 1],
      ['rush', 1], ['ember', 2], ['sword', 1], ['amulet', 1], ['ember', 3],
      ['sword', 2], ['amulet', 2], ['boots', 2]],
  },
  'C4-boomerang-main': {
    family: 'C', fantasy: 'The forgotten spell, maxed: does anything justify boomerang lv3?',
    tests: 'boomerang scaling',
    core: [['boomerang', 3], ['ember', 2], ['sword', 1], ['amulet', 1],
      ['ember', 3], ['sword', 2], ['amulet', 2], ['sword', 3], ['amulet', 3], ['boots', 1], ['hourglass', 1]],
  },
  'C5-meteor-value': {
    family: 'C', fantasy: 'The 2 s stun is a landing pad for the rock.',
    tests: 'meteor priced against C6 (same shell, cheaper bolt)',
    core: [['frost', 3], ['meteor', 1], ['amulet', 1], ['meteor', 2],
      ['sword', 1], ['amulet', 2], ['sword', 2], ['terra', 2], ['amulet', 3], ['boots', 1]],
  },
  'C6-bolt-combo': {
    family: 'C', fantasy: 'The Chainer: freeze, bolt, shove, repeat (the live lobby build).',
    tests: 'lightning in the same CC shell as C5',
    core: [['frost', 1], ['lightning', 1], ['gale', 1], ['mosquito', 1],
      ['frost', 2], ['lightning', 2], ['gale', 2], ['mosquito', 2],
      ['frost', 3], ['lightning', 3], ['gale', 3], ['mosquito', 3], ['sword', 1], ['amulet', 1]],
  },

  // Round 21.8: statue is the one NEW spell a bot can pilot (stepBot's panic
  // button; SPELLS.statue is in sim.js's PILOTED_POWER). Mine and Decoy are
  // deliberately absent from this whole roster; no bot reads a trap or a bluff.
  'C7-statue-guard': {
    family: 'C', fantasy: 'A 2 s invulnerable statue as the panic button on a plain fighting kit.',
    tests: 'what a total-immunity root is worth on the ONE reading a bot can make of it (hurt + a ball inbound); a floor for a spell whose real value is human timing',
    core: [['statue', 1], ['ember', 2], ['statue', 2], ['sword', 1], ['amulet', 1],
      ['ember', 3], ['sword', 2], ['amulet', 2], ['sword', 3], ['amulet', 3]],
  },

  // ---- Family D: play-style archetypes --------------------------------------
  'D1-warlord': {
    family: 'D', fantasy: 'No tricks, bigger numbers: win every straight trade.',
    tests: "ember's dominance + sword-by-structure (question L) in one kit; ALSO the control every family-G variant is measured against (24.7)",
    core: WARLORD_CORE,
  },
  'D2-executioner': {
    family: 'D', fantasy: 'The mark appears, someone dies: build entirely around claiming.',
    tests: "anger's claim rate when built for the chase (question K's missing half)",
    core: [['anger', 1], ['boots', 1], ['anger', 2], ['ghost', 1], ['anger', 3],
      ['boots', 2], ['ghost', 2], ['sword', 1], ['boots', 3], ['ghost', 3], ['sword', 2], ['amulet', 2], ['sword', 3], ['amulet', 3]],
  },
  // Round 24.7 (Remi): the old premise (echo doubles midas per-hit gold) died
  // with the 24.1 midas rework (a timed gold MARK, +2 g flat on the claim, no
  // per-hit income to amplify). The gold build is a bounty hunt now: D2's
  // exact chase shell with the gold mark instead of the red one, so D2 vs D3
  // is itself a one-variable read (anger's +dmg forever vs midas's +2 g).
  'D3-tycoon': {
    family: 'D', fantasy: 'Every mark is a paycheck: run it down, cash it, outspend the lobby.',
    tests: "the reworked midas (24.1: timed hunt, +2 g flat claim) built for claim rate; D2's exact core with midas swapped for anger, so the two mark hunts price each other",
    note: 'Redesigned round 24.7 (Remi): the midas-echo combo this build existed for no longer exists.',
    core: [['midas', 1], ['boots', 1], ['midas', 2], ['ghost', 1], ['midas', 3],
      ['boots', 2], ['ghost', 2], ['sword', 1], ['boots', 3], ['ghost', 3], ['sword', 2], ['amulet', 2], ['sword', 3], ['amulet', 3]],
  },
  // Round 24.7 (Remi): vampire should be a FREQUENCY build, not a damage
  // build; a feast heals per MARK and marks land per HIT, so cast rate is the
  // whole income. Haste both ways + echo pairs, damage elements refused.
  'D4-leech': {
    family: 'D', fantasy: 'Cast twice as often, bank twice the marks, wade in and drink the pile back.',
    tests: 'the round-24 mark-and-feast fed by CAST RATE (arcane+hourglass haste, echo pairs) instead of raw damage (Remi, 24.7); the 24.5 dive logic keys on vampire, so this row dives half the time',
    note: 'Respecced round 24.7 (Remi): marks scale with hit count, so the build now buys frequency (arcane, hourglass, echo), not damage.',
    core: [['vampire', 2], ['arcane', 1], ['mosquito', 1], ['sword', 1],
      ['vampire', 3], ['arcane', 2], ['hourglass', 1], ['mosquito', 2], ['amulet', 1],
      ['arcane', 3], ['hourglass', 2], ['mosquito', 3], ['sword', 2], ['amulet', 2]],
  },
  'D5-plaguebearer': {
    family: 'D', fantasy: 'Wade into the pack; everyone leaves sick.',
    tests: 'contagion value (the lab is blind to it; this is the human entry)',
    core: [['malady', 2], ['terra', 1], ['treads', 1], ['malady', 3],
      ['terra', 2], ['amulet', 1], ['treads', 2], ['terra', 3], ['amulet', 2], ['sword', 2], ['amulet', 3]],
  },
  'D6-sumo': {
    family: 'D', fantasy: "Never mind damage: you fly, I don't.",
    tests: "today's gale buff vs cape buff, head-on; lava economics",
    core: [['gale', 1], ['cape', 1], ['gale', 2], ['boots', 1], ['gale', 3],
      ['cape', 2], ['treads', 1], ['cape', 3], ['boots', 2], ['treads', 2], ['amulet', 2], ['boots', 3]],
  },
  'D7-stormcaller': {
    family: 'D', fantasy: 'The kit never stops: bolt on cooldown, refund on every hit.',
    tests: 'question M: is a dedicated cadence build viable-but-honest?',
    // Round 20: the echo-stone slot became a SECOND button for the refund to
    // chew on (boomerang); same intent, the deleted item's gold re-spent.
    core: [['arcane', 2], ['lightning', 1], ['arcane', 3], ['hourglass', 1],
      ['lightning', 2], ['hourglass', 2], ['lightning', 3], ['hourglass', 3],
      ['boomerang', 1], ['amulet', 2], ['sword', 1]],
  },
  'D8-juggernaut': {
    family: 'D', fantasy: 'Outlive everyone; the ring does the killing.',
    tests: 'question H: the offense-first meta, probed by its opposite',
    core: [['amulet', 1], ['cape', 1], ['treads', 1], ['amulet', 2], ['sword', 1],
      ['cape', 2], ['amulet', 3], ['sword', 2], ['treads', 2], ['cape', 3], ['sword', 3], ['treads', 3]],
  },
  'D9-phantom': {
    family: 'D', fantasy: 'One line, three victims.',
    tests: 'ghost lv3 pierce value under bot aim (floor read, stated)',
    core: [['ghost', 2], ['ember', 2], ['ghost', 3], ['ember', 3],
      ['sword', 1], ['amulet', 1], ['sword', 2], ['amulet', 2]],
  },
  'D10-skirmisher': {
    family: 'D', fantasy: 'Mobility wins fights: dash in, blink out.',
    tests: 'the mobility-spell package (rush+blink) as a fighting style',
    core: [['boots', 1], ['rush', 1], ['ember', 1], ['teleport', 1], ['ember', 2],
      ['boots', 2], ['shield', 1], ['ember', 3], ['rush', 2], ['sword', 2], ['amulet', 2], ['boots', 3]],
  },

  // Round 21.8: the two passive items bots get full value from without piloting
  // anything: the Slow Spoon's flat per-hit heal and the Hat of Aura's burn.
  'D11-spoonbearer': {
    family: 'D', fantasy: 'Low damage, endless uptime: hold them still and heal a flat amount off every tap.',
    tests: "the Slow Spoon's premise (round 21.8): does a flat heal-per-hit carry a deliberately LOW-damage utility kit, where lifesteal pays almost nothing?",
    core: [['spoon', 1], ['frost', 1], ['gale', 1], ['spoon', 2], ['frost', 2],
      ['gale', 2], ['spoon', 3], ['frost', 3], ['gale', 3], ['boots', 1], ['treads', 1]],
  },
  'D12-hatburner': {
    family: 'D', fantasy: 'Stand in the pack and cook: a burning ring that follows them out of it.',
    tests: "passive damage as a build: the Hat of Aura's ring + its round-21.8 linger, paired with the plague that wants the same close range",
    core: [['brazier', 1], ['malady', 1], ['brazier', 2], ['malady', 2],
      ['brazier', 3], ['malady', 3], ['treads', 1], ['amulet', 1], ['treads', 2], ['amulet', 2]],
  },

  // Round 24.7: the defensive-synergy probe 24.6 unlocked. Bots at Hard+
  // pilot BOTH reactive windows (Shield always did; Blood Debt since 24.6,
  // the understudy on the same imminent-ball read), so this is the first
  // build that shops debt. D8 is armor with no buttons; this is armor WITH
  // buttons.
  'D13-bastion': {
    family: 'D', fantasy: 'Nothing gets through: reflect it, or bank it and hand it back.',
    tests: 'the two reactive windows stacked (24.6: Hard+ casts Shield, and Blood Debt as the understudy) on a max-armor shell; defense WITH buttons vs D8 (armor only)',
    note: 'New round 24.7: answers 24.6\'s open question "which builds should shop Blood Debt".',
    core: [['shield', 1], ['amulet', 1], ['cape', 1], ['debt', 1], ['sword', 1],
      ['amulet', 2], ['shield', 2], ['treads', 1], ['debt', 2], ['cape', 2],
      ['sword', 2], ['amulet', 3], ['treads', 2], ['cape', 3], ['sword', 3], ['treads', 3]],
  },

  // Round 24.8 (Remi): both mark hunts on one body, leveled in lockstep.
  // The all-Faker table put the two mark builds at ranks 1-3, so this asks
  // whether stacking the engines compounds or whether the two clocks compete
  // for the same fireball hits (one ball can only claim one mark).
  'D14-hyperscaler': {
    family: 'D', fantasy: 'Two marks, two clocks, one snowball: claim everything, forever.',
    tests: 'anger + midas leveled in lockstep (lv1 both, lv2 both, lv3 both): do the two mark engines compound or contend? Read vs M1/M5 (each engine alone on a full scaffold)',
    core: [['anger', 1], ['midas', 1], ['anger', 2], ['midas', 2], ['anger', 3], ['midas', 3],
      ['sword', 1], ['amulet', 1], ['sword', 2], ['amulet', 2]],
  },

  // ---- Family E: cooldown reduction (Remi's question M) ---------------------
  // Remi, round 20: "I suspect CDR stacking is secretly strong and untested."
  // The two CDR axes are arcane (haste [18,32,32] on the FIREBALL ONLY, plus a
  // lv3 refund that shaves the KIT's cooldowns on every fireball hit, never
  // its own) and the hourglass (haste [10,18,26] on EVERYTHING). Haste SUMS:
  // maxed together the fireball casts at 1 + 58/100 = 1.58x rate. D7 already
  // probes CDR × ONE spell maxed; E1 probes CDR × fireball THROUGHPUT (mosquito
  // pairs), E2 probes CDR × kit WIDTH. Three points on the same axis.
  'E1-hastemaker': {
    family: 'E', fantasy: 'Cast faster, and every so often the cast is two balls.',
    tests: "question M: CDR x fireball throughput. Arcane+hourglass haste multiplied by mosquito's pair, with a pilotable kit for the lv3 refund to shave",
    core: [['arcane', 1], ['mosquito', 1], ['hourglass', 1], ['arcane', 2],
      ['arcane', 3], ['mosquito', 2], ['mosquito', 3], ['lightning', 1],
      ['boomerang', 1], ['shield', 1], ['lightning', 2], ['boomerang', 2],
      ['teleport', 1], ['lightning', 3]],
  },
  'E2-chronomancer': {
    family: 'E', fantasy: 'Five buttons, none of them ever off cooldown for long.',
    tests: "question M: CDR x kit WIDTH. The same maxed haste core feeding five pilotable buttons, so arcane lv3's per-hit refund has the most cooldowns to shave (vs D7's one-spell depth)",
    core: [['hourglass', 1], ['arcane', 1], ['hourglass', 2], ['arcane', 2],
      ['hourglass', 3], ['arcane', 3], ['lightning', 1], ['boomerang', 1],
      ['shield', 1], ['rush', 1], ['teleport', 1], ['shield', 2], ['rush', 2],
      ['teleport', 2]],
  },

  // ---- Family F: the sustain question (Remi, round 21.8) --------------------
  // ONE variable, 21 g either way (both items are 7 g × 3 levels), inside a kit
  // built to LAND A LOT OF HITS: maxed fireball cadence (arcane 3 + hourglass 3),
  // Echo pairs, ghost speed and three pilotable buttons. Everything else in the
  // two cores is byte-identical and hand-sized into the band so the PADDER NEVER
  // RUNS; its filler holds both items and would contaminate the comparison.
  // F1 minus F2 is the whole measurement: does a FLAT heal per hit beat a
  // PERCENTAGE of the damage dealt, for a build that hits often?
  // ⚠ `caps` is what makes this a real A/B: the study's shared exhaust tail
  // holds BOTH healing items, so without a ban each seat eventually buys the
  // other one too and the pair measures buy ORDER, not the item (found the hard
  // way, round 21.8). caps {x: 0} = never buy x, at any level.
  'F1-spoon-volume': {
    family: 'F', fantasy: 'Cast constantly, heal a flat crumb off every single connection.',
    tests: 'the Slow Spoon against the Blood Sword, identical kit, identical gold, NEITHER seat allowed the other item (vs F2)',
    caps: { sword: 0 },
    core: [['arcane', 3], ['mosquito', 3], ['hourglass', 3], ['lightning', 1],
      ['boomerang', 1], ['rush', 1], ['ghost', 2], ['spoon', 3], ['boots', 2], ['amulet', 2]],
  },
  // The mirror question (round 21.8): F1/F2 ask which item wins when hits are
  // SMALL and frequent; F3/F4 ask the same with hits as BIG as a bot can land
  // ember 3, lightning 2, meteor 2, terra 3. If the answer is the same item in
  // both, one of the two items has no reason to exist.
  'F3-spoon-burst': {
    family: 'F', fantasy: 'Big hits, and a flat crumb of healing per hit that barely notices them.',
    tests: 'the Slow Spoon where lifesteal SHOULD win: few, large hits (vs F4)',
    caps: { sword: 0 },
    core: [['ember', 3], ['lightning', 2], ['meteor', 2], ['terra', 3],
      ['spoon', 3], ['amulet', 2], ['hourglass', 2], ['boots', 3], ['treads', 2]],
  },
  'F4-sword-burst': {
    family: 'F', fantasy: 'Big hits, and a percentage of every one of them.',
    tests: 'the control for F3: the Blood Sword on the same big-hit kit',
    caps: { spoon: 0 },
    core: [['ember', 3], ['lightning', 2], ['meteor', 2], ['terra', 3],
      ['sword', 3], ['amulet', 2], ['hourglass', 2], ['boots', 3], ['treads', 2]],
  },
  'F2-sword-volume': {
    family: 'F', fantasy: 'The same barrage, paid for in lifesteal instead.',
    tests: 'the control for F1: the Blood Sword in the identical high-volume kit, Slow Spoon banned',
    caps: { spoon: 0 },
    core: [['arcane', 3], ['mosquito', 3], ['hourglass', 3], ['lightning', 1],
      ['boomerang', 1], ['rush', 1], ['ghost', 2], ['sword', 3], ['boots', 2], ['amulet', 2]],
  },

  // ---- Family G: the Warlord, one variable at a time (round 24.7) -----------
  // Read every G row against D1-warlord. G1 and G2 also read against each
  // other: same cost, same slots, Shield vs Blood Debt head to head.
  'G1-warlord-shield': {
    family: 'G', fantasy: 'The Warlord who answers: every trade, plus a reflection window.',
    tests: 'ONE variable vs D1: +Shield (12+6 g, bought early); is a piloted reactive worth 18 g of items?',
    core: [['ember', 2], ['sword', 1], ['amulet', 1], ['shield', 1], ['ember', 3],
      ['sword', 2], ['amulet', 2], ['arcane', 2], ['shield', 2], ['sword', 3], ['amulet', 3], ['boots', 2], ['cape', 1]],
  },
  'G2-warlord-debt': {
    family: 'G', fantasy: 'The Warlord who banks the hit and mails it back.',
    tests: 'ONE variable vs D1: +Blood Debt in the exact slots G1 gives Shield (same 12+6 g), so G1-G2 is Shield vs Debt on the same bot read (24.6)',
    note: 'First roster row to shop Blood Debt (with D13), closing 24.6\'s open question.',
    core: [['ember', 2], ['sword', 1], ['amulet', 1], ['debt', 1], ['ember', 3],
      ['sword', 2], ['amulet', 2], ['arcane', 2], ['debt', 2], ['sword', 3], ['amulet', 3], ['boots', 2], ['cape', 1]],
  },
  'G3-warlord-no-sword': {
    family: 'G', fantasy: 'The Warlord without the vampire sword: pure damage, no drain.',
    tests: 'ONE variable vs D1: sword BANNED (caps, padder included); prices lifesteal-by-structure (question L) as an ablation, gold goes to the generic shelf instead',
    caps: { sword: 0 },
    core: [['ember', 2], ['amulet', 1], ['ember', 3], ['amulet', 2],
      ['arcane', 2], ['amulet', 3], ['boots', 2], ['cape', 1]],
  },
  'G4-warlord-no-arcane': {
    family: 'G', fantasy: 'The Warlord who never learns to cast faster.',
    tests: 'ONE variable vs D1: arcane BANNED (caps); prices the haste axis inside the base build, its 12 g goes to the generic shelf instead',
    caps: { arcane: 0 },
    core: [['ember', 2], ['sword', 1], ['amulet', 1], ['ember', 3],
      ['sword', 2], ['amulet', 2], ['sword', 3], ['amulet', 3], ['boots', 2], ['cape', 1]],
  },

  // ---- Family M: one mutation maxed first, identical scaffold (round 24.7) --
  // All six cores cost 166 g (every mutation is 26 g, the scaffold is 140 g),
  // so M row vs M row is a direct price on the mutations themselves.
  'M1-anger-first': {
    family: 'M', fantasy: 'Max the grudge, then build like everyone else.',
    tests: 'anger isolated on the shared scaffold (vs its M siblings)',
    core: [['anger', 3], ...MUT_SCAFFOLD],
  },
  'M2-frost-first': {
    family: 'M', fantasy: 'Max the cold, then build like everyone else.',
    tests: 'frost isolated on the shared scaffold; stack-fade (22.4) means bots must feed the pile',
    core: [['frost', 3], ...MUT_SCAFFOLD],
  },
  'M3-malady-first': {
    family: 'M', fantasy: 'Max the plague, then build like everyone else.',
    tests: 'malady isolated on the shared scaffold; contagion still reads at a floor (bots do not cluster on purpose)',
    core: [['malady', 3], ...MUT_SCAFFOLD],
  },
  'M4-echo-first': {
    family: 'M', fantasy: 'Max the echo, then build like everyone else.',
    tests: 'mosquito (Echo) isolated on the shared scaffold: every 4th cast pairs',
    core: [['mosquito', 3], ...MUT_SCAFFOLD],
  },
  'M5-midas-first': {
    family: 'M', fantasy: 'Max the gold mark, then build like everyone else.',
    tests: 'midas isolated on the shared scaffold: its +2 g claims should show as a DEEPER tail, which is the whole value of gold',
    core: [['midas', 3], ...MUT_SCAFFOLD],
  },
  'M6-vampire-first': {
    family: 'M', fantasy: 'Max the feast, then build like everyone else.',
    tests: 'vampire isolated on the shared scaffold (no frequency support here; D4 is the synergy build)',
    core: [['vampire', 3], ...MUT_SCAFFOLD],
  },

  // ---- Family K (issue #7): the Faker's combo arsenals, ON THE FAKER BRAIN.
  // `kind` overrides the tournament's per-seat bot (tools/elo.js); these four
  // rows answer Remi's question "do the combos PAY, or are they just
  // impressive?" against whatever tier the rest of the lobby runs.
  'K1-faker-hookstorm': {
    family: 'K', kind: 'faker',
    fantasy: 'The hook: Switcheroo into the bolt, the rock onto the landing point.',
    tests: 'does the combo layer out-earn raw value at equal cost',
    core: [['lightning', 3], ['swap', 3], ['meteor', 2], ['ember', 2], ['boots', 2], ['cape', 1]],
  },
  'K2-faker-permafrost': {
    family: 'K', kind: 'faker',
    fantasy: 'The freeze: the third stack is spent on purpose, with the bolt loaded.',
    tests: 'frost-hold combos vs the chainer, on a brain that times them',
    core: [['frost', 3], ['lightning', 3], ['hourglass', 3], ['boots', 2], ['sword', 1]],
  },
  'K3-faker-minefield': {
    family: 'K', kind: 'faker',
    fantasy: 'The detonator: a loaded trap underfoot, Switcheroo drops you on it.',
    tests: 'the trap-hook chain: the biggest measured true combos (tools/combo.js)',
    core: [['lightning', 2], ['nova', 2], ['swap', 3], ['ember', 2], ['boots', 2]],
  },
  'K4-faker-galeforce': {
    family: 'K', kind: 'faker',
    fantasy: 'The wind: every third ball shoves, the bolt is already falling there.',
    tests: 'gust-into-bolt chains; the weakest combo identity in the lab, priced here',
    core: [['gale', 3], ['lightning', 3], ['arcane', 2], ['boots', 2], ['sword', 1]],
  },
  // Round 23: B3-mutation-depth's exact core (the best anger row, r353) on the
  // Faker brain: how strong is anger when the pilot is the top tier?
  'K5-faker-vendetta': {
    family: 'K', kind: 'faker',
    fantasy: 'The grudge: max anger first, claim every mark, snowball forever.',
    tests: "anger in Faker hands: B3's core (the best anger build on Hard) piloted by the top bot tier",
    core: [['anger', 3], ['amulet', 1], ['sword', 1], ['amulet', 2],
      ['sword', 2], ['amulet', 3], ['sword', 3], ['boots', 2], ['cape', 1]],
  },
};

// ---- cost check + doc generation -------------------------------------------
const [lo, hi] = COST_TARGET;
if (process.argv[1] && process.argv[1].endsWith('roster.js')) {
  if (process.argv.includes('--doc')) {
    let out = `# Strategy roster, GENERATED from tools/roster.js (edit there, \`node tools/roster.js --doc\`)\n\n`;
    out += `**Goal**: mass AI games, ELO per strategy (random 4-strategy lobbies, Elo fitted from placements).\n`;
    out += `**Core cost target**: ${lo}-${hi} g, a bit above the ~${AVG_EARNED} g an average seat earns in a full game (measured: 13.1 rounds, 9.8 kills/seat), so the uncontrolled everything-else tail almost never runs.\n`;
    out += `**After the core**: the bot walks the study's shared exhaust list (identical for every strategy), and only when even that is maxed does the in-game random fallback (items, then pilotable spells, then mutations) spend leftovers.\n`;
    out += `**Fireball**: free at lv1 for everyone in elemental, never levels; not listed.\n`;
    out += `**Spells bots can pilot** (the only ones allowed here): lightning, boomerang, rush, shield, Blood Debt (24.6: Hard+ casts it on the imminent-ball read, Shield's understudy), blink, meteor (CC-gated: cast only into a frost stun/heavy slow) and statue (round 21.8: a panic button; hurt, a ball inbound, away from the rim). Mine, Decoy, Switcheroo, vanish, pillar, wall and repulse are NOT pilotable and are excluded from the ELO pool.\n\n`;
    let fam = '';
    for (const [id, s] of Object.entries(ROSTER)) {
      if (s.family !== fam) {
        fam = s.family;
        out += `\n## ${FAMILY_TITLES[fam]}\n\n`;
      }
      const order = core => core.map(([k, l]) => `${k}${l}`).join(' → ');
      const padded = paddedCore(s);
      const note = s.noPad ? ', shelf exhausts here BY DESIGN'
        : shelfExhausted(s) ? ', ⚠ item shelf EXHAUSTED below the band (round 21.8: the whole item shelf is 147 g)' : '';
      out += `- **${id}** (${coreCost(padded)} g${note}): ${s.fantasy}\n`;
      out += `  - order: ${order(padded)}\n`;
      out += `  - tests: ${s.tests}\n`;
      if (s.note) out += `  - note: ${s.note}\n`;
    }
    console.log(out);
  } else {
    for (const [id, s] of Object.entries(ROSTER)) {
      const c = coreCost(paddedCore(s));
      const flag = s.noPad ? '  (pure shelf, exempt)'
        : shelfExhausted(s) ? '  (item shelf EXHAUSTED; 147 g is the whole shelf since round 21.8)'
        : c < lo ? '  ⚠ UNDER' : c > hi ? '  ⚠ OVER' : '';
      console.log(`${String(c).padStart(4)} g  ${id}${flag}`);
    }
  }
}
