// The ELO-tournament strategy roster (docs/ARCHETYPES.md is GENERATED from
// this file — edit HERE, then `node tools/roster.js --doc` to regenerate).
// Remi's design goals (2026-08-09): level-explicit cores; every core costs a
// bit MORE than the ~145 g an average seat earns in a full game (measured:
// 13.1 rounds, 9.8 kills), so the uncontrolled everything-else tail almost
// never runs; families isolate systems (items vs elements vs mutations vs
// spells, depth vs breadth, spell scaling).
//
//   node tools/roster.js          — cost check table (every core, gold total)
//   node tools/roster.js --doc    — print the ARCHETYPES.md markdown
//
// core entries are [key, level] pairs: ['frost', 2] = "buy frost UP TO lv2
// here" — the runner expands to one buy per level step. Bots fall into the
// study's shared exhaust tail after the core (see tools/strategy-study.js),
// and only into the in-game random fallback once even that is maxed.

import { SPELLS, ELEMENTS, ITEMS, itemCost } from '../shared/constants.js';

const AVG_EARNED = 145; // measured 2026-08-09, seed 1000-1039, 4 Hard seats
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
// core enters the cost band — so hand-edited cores stay in spec without
// bookkeeping. Purity probes (noPad) are exempt: their shelf EXHAUSTS below
// the band, which is itself a finding, stated in the doc.
// ⚠ Round 20 (echo deleted, items flat) + 21.1 (items 5/7 g) + 21.7/21.8 (the
// Hat of Aura 6×3 and the Slow Spoon 7×3): the whole item shelf is 147 g, i.e.
// STILL BELOW the 150 g band
// — an items-only core cannot fill its own budget and the padder hits shelf
// exhaustion. Stated as a finding, not papered over.
const FILLER = ['sword', 'amulet', 'boots', 'cape', 'treads', 'hourglass', 'brazier', 'spoon'];
export function paddedCore(entry) {
  if (entry.noPad) return entry.core;
  const core = entry.core.map(x => [...x]);
  const lv = {};
  for (const [k, to] of core) lv[k] = Math.max(lv[k] || 0, to);
  let guard = 40;
  while (coreCost(core) < COST_TARGET[0] && guard-- > 0) {
    let done = true;
    for (const k of FILLER) {
      const max = ITEMS[k].maxLevel;
      if ((lv[k] || 0) < max) {
        lv[k] = (lv[k] || 0) + 1;
        core.push([k, lv[k]]);
        done = false;
        break;
      }
    }
    if (done) break; // every filler maxed — shelf exhaustion
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

export const ROSTER = {
  // ---- Family A: system purity — price each shelf as a class --------------
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
  // 147 g — still under
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
  // deliberately absent from this whole roster — no bot reads a trap or a bluff.
  'C7-statue-guard': {
    family: 'C', fantasy: 'A 2 s invulnerable statue as the panic button on a plain fighting kit.',
    tests: 'what a total-immunity root is worth on the ONE reading a bot can make of it (hurt + a ball inbound) — a floor for a spell whose real value is human timing',
    core: [['statue', 1], ['ember', 2], ['statue', 2], ['sword', 1], ['amulet', 1],
      ['ember', 3], ['sword', 2], ['amulet', 2], ['sword', 3], ['amulet', 3]],
  },

  // ---- Family D: play-style archetypes --------------------------------------
  'D1-warlord': {
    family: 'D', fantasy: 'No tricks, bigger numbers: win every straight trade.',
    tests: "ember's dominance + sword-by-structure (question L) in one kit",
    core: [['ember', 2], ['sword', 1], ['amulet', 1], ['ember', 3],
      ['sword', 2], ['amulet', 2], ['arcane', 2], ['sword', 3], ['amulet', 3], ['boots', 2], ['cape', 1]],
  },
  'D2-executioner': {
    family: 'D', fantasy: 'The mark appears, someone dies: build entirely around claiming.',
    tests: "anger's claim rate when built for the chase (question K's missing half)",
    core: [['anger', 1], ['boots', 1], ['anger', 2], ['ghost', 1], ['anger', 3],
      ['boots', 2], ['ghost', 2], ['sword', 1], ['boots', 3], ['ghost', 3], ['sword', 2], ['amulet', 2], ['sword', 3], ['amulet', 3]],
  },
  'D3-tycoon': {
    family: 'D', fantasy: 'Every hit pays, the amplifier doubles the payroll.',
    tests: 'mosquito-as-gold-amp + midas with real shopping depth (question E)',
    core: [['midas', 1], ['mosquito', 1], ['midas', 2], ['hourglass', 1],
      ['midas', 3], ['mosquito', 2], ['sword', 1], ['amulet', 1], ['sword', 2],
      ['amulet', 2], ['sword', 3], ['boots', 1]],
  },
  'D4-leech': {
    family: 'D', fantasy: 'Every 5th ball is a feast, and the trap volley speeds the count.',
    tests: 'the vampire×mosquito cast-counting ruling; sustain stacking',
    core: [['vampire', 2], ['mosquito', 1], ['sword', 1], ['vampire', 3],
      ['mosquito', 2], ['amulet', 1], ['sword', 2], ['amulet', 2], ['mosquito', 3], ['sword', 3], ['amulet', 3]],
  },
  'D5-plaguebearer': {
    family: 'D', fantasy: 'Wade into the pack; everyone leaves sick.',
    tests: 'contagion value (the lab is blind to it — this is the human entry)',
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
    // chew on (boomerang) — same intent, the deleted item's gold re-spent.
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
  // anything — the Slow Spoon's flat per-hit heal and the Hat of Aura's burn.
  'D11-spoonbearer': {
    family: 'D', fantasy: 'Low damage, endless uptime: hold them still and heal a flat amount off every tap.',
    tests: "the Slow Spoon's premise (round 21.8) — does a flat heal-per-hit carry a deliberately LOW-damage utility kit, where lifesteal pays almost nothing?",
    core: [['spoon', 1], ['frost', 1], ['gale', 1], ['spoon', 2], ['frost', 2],
      ['gale', 2], ['spoon', 3], ['frost', 3], ['gale', 3], ['boots', 1], ['treads', 1]],
  },
  'D12-hatburner': {
    family: 'D', fantasy: 'Stand in the pack and cook: a burning ring that follows them out of it.',
    tests: "passive damage as a build — the Hat of Aura's ring + its round-21.8 linger, paired with the plague that wants the same close range",
    core: [['brazier', 1], ['malady', 1], ['brazier', 2], ['malady', 2],
      ['brazier', 3], ['malady', 3], ['treads', 1], ['amulet', 1], ['treads', 2], ['amulet', 2]],
  },

  // ---- Family E: cooldown reduction (Remi's question M) ---------------------
  // Remi, round 20: "I suspect CDR stacking is secretly strong and untested."
  // The two CDR axes are arcane (haste [18,32,32] on the FIREBALL ONLY, plus a
  // lv3 refund that shaves the KIT's cooldowns on every fireball hit — never
  // its own) and the hourglass (haste [10,18,26] on EVERYTHING). Haste SUMS:
  // maxed together the fireball casts at 1 + 58/100 = 1.58x rate. D7 already
  // probes CDR × ONE spell maxed; E1 probes CDR × fireball THROUGHPUT (mosquito
  // pairs), E2 probes CDR × kit WIDTH. Three points on the same axis.
  'E1-hastemaker': {
    family: 'E', fantasy: 'Cast faster, and every so often the cast is two balls.',
    tests: "question M: CDR x fireball throughput — arcane+hourglass haste multiplied by mosquito's pair, with a pilotable kit for the lv3 refund to shave",
    core: [['arcane', 1], ['mosquito', 1], ['hourglass', 1], ['arcane', 2],
      ['arcane', 3], ['mosquito', 2], ['mosquito', 3], ['lightning', 1],
      ['boomerang', 1], ['shield', 1], ['lightning', 2], ['boomerang', 2],
      ['teleport', 1], ['lightning', 3]],
  },
  'E2-chronomancer': {
    family: 'E', fantasy: 'Five buttons, none of them ever off cooldown for long.',
    tests: "question M: CDR x kit WIDTH — the same maxed haste core feeding five pilotable buttons, so arcane lv3's per-hit refund has the most cooldowns to shave (vs D7's one-spell depth)",
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
  // RUNS — its filler holds both items and would contaminate the comparison.
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
  'F2-sword-volume': {
    family: 'F', fantasy: 'The same barrage, paid for in lifesteal instead.',
    tests: 'the control for F1: the Blood Sword in the identical high-volume kit, Slow Spoon banned',
    caps: { spoon: 0 },
    core: [['arcane', 3], ['mosquito', 3], ['hourglass', 3], ['lightning', 1],
      ['boomerang', 1], ['rush', 1], ['ghost', 2], ['sword', 3], ['boots', 2], ['amulet', 2]],
  },
};

// ---- cost check + doc generation -------------------------------------------
const [lo, hi] = COST_TARGET;
if (process.argv[1] && process.argv[1].endsWith('roster.js')) {
  if (process.argv.includes('--doc')) {
    let out = `# Strategy roster — GENERATED from tools/roster.js (edit there, \`node tools/roster.js --doc\`)\n\n`;
    out += `**Goal**: mass AI games, ELO per strategy (random 4-strategy lobbies, Elo fitted from placements).\n`;
    out += `**Core cost target**: ${lo}-${hi} g — a bit above the ~${AVG_EARNED} g an average seat earns in a full game (measured: 13.1 rounds, 9.8 kills/seat), so the uncontrolled everything-else tail almost never runs.\n`;
    out += `**After the core**: the bot walks the study's shared exhaust list (identical for every strategy), and only when even that is maxed does the in-game random fallback (items, then pilotable spells, then mutations) spend leftovers.\n`;
    out += `**Fireball**: free at lv1 for everyone in elemental, never levels — not listed.\n`;
    out += `**Spells bots can pilot** (the only ones allowed here): lightning, boomerang, rush, shield, blink, meteor (CC-gated: cast only into a frost stun/heavy slow) and statue (round 21.8: a panic button — hurt, a ball inbound, away from the rim). Mine, Decoy, Switcheroo, vanish, pillar, wall and repulse are NOT pilotable and are excluded from the ELO pool.\n\n`;
    let fam = '';
    for (const [id, s] of Object.entries(ROSTER)) {
      if (s.family !== fam) {
        fam = s.family;
        const titles = { A: 'Family A — system purity (price each shelf as a class)',
          B: 'Family B — depth vs breadth, per system',
          C: 'Family C — spell-scaling probes',
          D: 'Family D — play-style archetypes',
          E: 'Family E — cooldown reduction (question M)',
          F: 'Family F — sustain: flat heal-per-hit vs lifesteal (round 21.8)' };
        out += `\n## ${titles[fam]}\n\n`;
      }
      const order = core => core.map(([k, l]) => `${k}${l}`).join(' → ');
      const padded = paddedCore(s);
      const note = s.noPad ? ', shelf exhausts here BY DESIGN'
        : shelfExhausted(s) ? ', ⚠ item shelf EXHAUSTED below the band (round 21.8: the whole item shelf is 147 g)' : '';
      out += `- **${id}** (${coreCost(padded)} g${note}): ${s.fantasy}\n`;
      out += `  - order: ${order(padded)}\n`;
      out += `  - tests: ${s.tests}\n`;
    }
    console.log(out);
  } else {
    for (const [id, s] of Object.entries(ROSTER)) {
      const c = coreCost(paddedCore(s));
      const flag = s.noPad ? '  (pure shelf, exempt)'
        : shelfExhausted(s) ? '  (item shelf EXHAUSTED — 147 g is the whole shelf since round 21.8)'
        : c < lo ? '  ⚠ UNDER' : c > hi ? '  ⚠ OVER' : '';
      console.log(`${String(c).padStart(4)} g  ${id}${flag}`);
    }
  }
}
