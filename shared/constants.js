// Shared game constants — imported by server, client, and tests.
// Units: 1 unit ≈ 10 px at zoom 1. Times in seconds. Damage in HP.

export const TICK_RATE = 30;          // server simulation Hz
export const SNAPSHOT_RATE = 15;      // snapshots sent to clients Hz

export const ARENA = {
  START_RADIUS: 56,
  MIN_RADIUS: 10,
  SHRINK_TIME: 65,        // seconds from START to MIN at the base rate
  // the shrink RATE scales with deaths: rate *= 1 + ADAPT * (1 - alive/total)
  // (4 fighters, 2 dead -> 1.75x faster) so small fights don't wait on a big arena
  SHRINK_ADAPT: 1.5,
  OVERTIME_GRACE: 45,     // seconds the arena holds at MIN_RADIUS...
  OVERTIME_SHRINK: 30,    // ...then shrinks to 0 over this — every round ends
  SPAWN_RADIUS_FRAC: 0.6, // players spawn on this fraction of start radius
  // obsidian pillars on a fixed ring near the rim: cover vs projectiles and
  // knockback-stoppers; a pillar outside the current arena radius is sunk
  PILLARS: {
    COUNT: 6,
    RADIUS: 2.5,
    RING: 40,             // between the spawn ring (33.6) and the start rim (56)
    BASE_ANGLE: Math.PI / 6, // keeps pillars off the axes (spawn/shot lanes)
    JITTER: 0.12,         // per-pillar angle jitter span (radians), from the seed
  },
};

export const PLAYER = {
  RADIUS: 1.4,            // bigger bodies = spells actually connect
  // your body grows with your kill lead (bigger target when winning) and
  // shrinks when trailing: radius = RADIUS * clamp(1 + PER_KILL*(kills-avg))
  SIZE_LEAD: { PER_KILL: 0.08, MIN: 0.5, MAX: 2.0 },
  MAX_HP: 100,
  SPEED: 11,              // u/s (boots-maxed ≈ the old base speed)
  FRICTION: 3.1,          // exponential velocity damping per second (more slide)
  STOP_EPSILON: 0.3,
  // knockback scales with the PERCENT of hp missing (hp/maxHp — amulet HP
  // counts): impulse *= 1 + KB_HP_FACTOR*(1 - hp/maxHp). Full HP = baseline,
  // near-death ≈ 1.55x. Body size plays NO role in knockback (audited
  // 2026-08-04: being big is only ever a disadvantage — easier to hit).
  KB_HP_FACTOR: 0.385, // was 0.8, then 0.55; −30% again 2026-08-05 (low-HP launches still too wild)
  // 2026-08-07 (Remi, round 12): TEST constant knockback without deleting the
  // mechanic. When set, the formula above is fed this fixed "fraction of HP
  // missing" instead of the real one, so everyone is knocked as if permanently
  // at 70% HP. Set to null to restore true HP-scaled knockback — that one line
  // is the whole revert, deliberately.
  KB_CONSTANT_MISSING: 0.30,
  REGEN: 1.2,             // baseline hp/s for everyone (ring stacks on top)
  // Regen lock (2026-08-06): taking damage throttles regen for a moment.
  // Diagnosis behind it — a lv1 fireball is 5 dmg / 2.1 s = 2.38 dps if EVERY
  // shot lands, against 1.2 hp/s of passive regen, so two players trading lv1
  // fireballs literally could not kill each other. Round 1 (nobody has
  // upgrades yet) measured a median 51.9 s to the first death vs ~20 s in
  // round 3 — the lava did all the work. This makes landed hits stick.
  REGEN_LOCK: 2.5,        // seconds of throttled regen after taking damage
  REGEN_LOCK_MULT: 0.25,  // regen multiplier while the lock is up
};

export const LAVA = {
  DPS: 14,          // hp/s while swimming (was 20; -30% 2026-08 playtest round)
  // you move FASTER in lava, not slower: dipping through the lava is a real
  // play (dodge route, flank), the DPS is the price of admission.
  // 2026-08-05: 1.3 → 2.0 — at 1.3 a swimmer was still a sitting duck;
  // at 2x you can genuinely dodge while burning
  SPEED_MULT: 2.0,
};

export const ROUND = {
  COUNTDOWN: 3,
  SUMMARY_TIME: 3.5,      // victory/defeat banner between battle and shop
  SHOP_TIME: 25,
  KILLS_TO_WIN: 15,       // first to this many kills wins (checked at round end)
  MAX_ROUNDS: 25,         // safety cap: most kills wins if nobody gets there
  // Co-op campaign: 10 levels, and this many ROUNDS to clear them. Clearing a
  // level advances you; wiping costs a round and you retry the same level with
  // one more shop's worth of gold — so this is the retry budget (3 spare
  // rounds). Measured 2026-08-06 with tools/coop.js: a ★★ berserker party
  // spends 10.4 (3 players) to 12.2 (solo) rounds on a full run, and finishes
  // the campaign 100% / 95% / 81% of the time at 3 / 2 / 1 players. 14 rounds
  // is a formality, 12 locks a solo player out a third of the time.
  COOP_MAX_ROUNDS: 13,
  KILL_CREDIT_WINDOW: 5,  // seconds: last hitter gets lava kills
  // kill this fast after your last one and it's a DOUBLE KILL (then triple…)
  MULTIKILL_WINDOW: 6,
};

// Multi-kill names, indexed by streak-2 (streak 2 = 'Double Kill').
export const MULTIKILL_NAMES = [
  'Double Kill', 'Triple Kill', 'Quadra Kill', 'Penta Kill', 'MASSACRE',
];

// Anti-snowball economy (2026-08-03 playtest): passive income dominates.
// HARD CAP: in a 4-player game the max per-round income is
// ROUND_BASE + 3*PER_KILL + ROUND_WIN, and the floor is ROUND_BASE — keeping
// ROUND_BASE >= 3*PER_KILL + ROUND_WIN guarantees the player with EVERY kill
// can never out-earn a player with none by more than 2x. (Bounties can't
// break the cap: the leader never collects one — see kill() in sim.js.)
// Totals tuned down 2026-08-03 evening playtest: with 11/3/2 everyone was
// full-build before the end — the cap ratio was right, the volume wasn't.
export const GOLD = {
  START: 12,
  PER_KILL: 2,
  ROUND_BASE: 8,   // = 3*PER_KILL + ROUND_WIN: sits exactly on the 2x cap
  ROUND_WIN: 2,
  FIRST_DEATH: 1,
  // Bounty: killing someone AHEAD of you on kills pays extra, scaled by the
  // kill gap — #2 sniping #1 earns little (the snowball would just move),
  // the last player toppling the leader is an event. Always modest.
  BOUNTY_PER_GAP: 0.5,  // gold per kill of gap, floored
  BOUNTY_MAX: 3,
};

// ---- Spells -------------------------------------------------------------
// costs[i] = cost to reach level i+1 (level 0 = not owned)
export const SPELLS = {
  fireball: {
    // the 4th damage/knockback/cost entries are only reachable in elemental
    // mode via the Cinder Crown (maxLevel stays 3 in classic — buy() enforces)
    name: 'Fireball', hotkey: 'Q', maxLevel: 3, costs: [0, 8, 8, 8],
    // lv1 spam was too strong (2026-08-03): ~30% slower at lv1, upgrades
    // buy the old cadence back
    // lv1 damage 5 → 7 (2026-08-06): at 5 a lv1 fireball could not out-damage
    // passive regen, which is what made round 1 a 52-second stalemate
    cooldown: [2.1, 1.85, 1.6, 1.5], speed: 41, radius: 0.8, range: Infinity,
    damage: [7, 10, 14, 18], knockback: [65, 70, 76, 83],
    desc: 'Your bread and butter. Medium projectile, strong knockback.',
  },
  lightning: {
    // last-hitting from across the map was too strong (2026-08-03):
    // range -30%, push removed entirely — damage untouched
    name: 'Lightning', hotkey: 'W', maxLevel: 3, costs: [10, 6, 6],
    cooldown: 5, range: 38, width: 1.2,
    damage: [5, 8, 12],
    desc: 'Instant mid-range bolt. No push — a pure finisher.',
  },
  boomerang: {
    // 2026-08-06 rework (Remi: "nobody ever plays it, make it exciting"):
    // fireball-grade reach, and YOU choose the turn point — tapping the key
    // again while it flies recalls it early. It still returns to the LAUNCH
    // POINT, so catching it (halving the cooldown) is a real read.
    // outDistance is now a ceiling, not a plan.
    name: 'Boomerang', hotkey: 'R', maxLevel: 3, costs: [10, 6, 6],
    cooldown: 5.5, speed: 31, radius: 1.4, outDistance: 52,
    damage: [4, 6, 8], knockback: [50, 59, 68],
    desc: 'Long throw, out and back to where you threw it. Tap again to recall it early. Catch it: cooldown halved. Miss it: gone.',
  },
  teleport: {
    name: 'Teleport', hotkey: 'F', maxLevel: 2, costs: [12, 8],
    cooldown: [16, 12], range: [18, 26],
    desc: 'Blink to cursor. Cancels your momentum — the lava save.',
  },
  shield: {
    name: 'Shield', hotkey: 'D', maxLevel: 2, costs: [12, 6],
    cooldown: [15, 12], duration: 1.25,
    desc: 'Reflects projectiles back at their owner for 1.25 s.',
  },
  rush: {
    name: 'Rush', hotkey: 'E', maxLevel: 2, costs: [10, 6],
    cooldown: [10, 8], distance: 16, speed: 60, hitRadius: 1.6,
    damage: [5, 8], knockback: [79, 79],
    desc: 'Dash through enemies, blasting them aside.',
  },
  pillar: {
    name: 'Stone Pillar', hotkey: 'S', maxLevel: 2, costs: [10, 6],
    cooldown: [14, 11], range: 20, radius: 2.2, duration: [10, 16],
    desc: 'Raise an obsidian pillar: cover, blocker, knockback-stopper. One standing at a time.',
  },
  // ---- power tier: expensive, but available from round 1 ------------------
  // Going for these is a real tradeoff (their entry costs rival a full item)
  // but they end fights. 2026-08-07 (Remi, round 12): the `minRound: 5` gate is
  // GONE — they are buyable from the first shop.
  // ⚠ BOTS PILOT NONE OF THESE. Remi's rule: an AI must never buy a spell it
  // uses badly, so the power tier stays out of every BUILDS/BOT_BUILDS order
  // list (below) — that omission is the gate now, and it is load-bearing.
  // Teaching bots to pilot them is the open lab work (AGENTS.md debt #2).
  meteor: {
    name: 'Meteor', hotkey: 'T', tier: 'power', maxLevel: 2, costs: [22, 10],
    cooldown: [15, 13], range: 45, delay: 1.25, radius: 6,
    damage: [16, 24], knockback: [110, 130],
    desc: '☄️ Mark a spot; a rock falls: heavy damage, radial blast.',
  },
  hook: {
    // 2026-08-06 (Remi: "very hard to hit"): range +30% and the projectile
    // is 20% slower, so you can actually read and lead it
    name: 'Hook', hotkey: 'G', tier: 'power', maxLevel: 2, costs: [20, 8],
    cooldown: [13, 10], speed: 38, radius: 0.9, range: [34, 44],
    damage: [4, 6],
    desc: '🪝 Skewer the first enemy hit and yank them BEHIND you.',
  },
  repulse: {
    name: 'Repulse', hotkey: 'X', tier: 'power', maxLevel: 2, costs: [20, 8],
    cooldown: [16, 13], charge: 2, radius: [9, 11],
    damage: [8, 12], knockback: [130, 150],
    desc: '💥 Charge for 2 s (visibly — Teleport and Rush still work), then blast everyone around you away.',
  },
  wall: {
    name: 'Mirror Wall', hotkey: 'C', tier: 'power', maxLevel: 2, costs: [24, 10],
    cooldown: [18, 15], range: 20, length: [8, 11], duration: 5,
    desc: '🪞 A wall that reflects ENEMY projectiles and blocks their lightning. Yours pass.',
  },
  // ---- 2026-08-07 (Remi, round 12): invisibility -------------------------
  // No restrictions on purpose (casting, attacking and colliding all still
  // work) — the level buys DURATION only, linearly.
  // ⚠ Two implementation rules, both non-negotiable, see docs/ROUND12.md N4:
  // it must be stripped in snapshot() (never merely skipped by the renderer,
  // or devtools sees through it), and bot perception must be masked too or the
  // top tier becomes an aimbot that ignores the spell.
  vanish: {
    name: 'Vanish', hotkey: 'V', maxLevel: 3, costs: [12, 8, 8],
    cooldown: [14, 13, 12], duration: [0.75, 1.5, 2.25],
    desc: '👁️ Vanish completely for a moment. You can still cast, hit and be hit — nobody can see you do it.',
  },
};

// ---- Items (passive, 3 LEVELS each) ------------------------------------
// mode: 'elemental' marks experimental wares that only exist (shop + buy)
// when the game runs the elemental ruleset; classic never sees them.
//
// 2026-08-07 (Remi, round 12) — items are LEVELLED, like spells.
// The history: items used to be unique (max 1), then freely stackable at +20%
// per copy (2026-08-06). Stacking produced a meta nobody wanted — four or five
// pairs of Boots, past the speed threshold where a good player simply cannot be
// hit, and those seats topped the table. Remi's diagnosis is the general one and
// worth keeping: *a single stacked dimension exacerbates whatever gameplay
// problem it touches; let players chase one axis, but make breadth the better
// default.* So: hard cap 3, the SAME gold cost at every level, and each level
// worth less than the last. Cost no longer escalates — the diminishing effect is
// the brake now.
//
// Values below are ABSOLUTE CUMULATIVE totals at that level, matching how
// SPELLS.damage and ELEMENTS already read (never per-level increments — an
// agent should be able to read the answer off the array without doing algebra).
// Boots are Remi's spec: +15% / +10% more / +7% more → 1.15 / 1.27 / 1.35.
export const ITEMS = {
  boots:  { name: 'Boots of Speed',       cost: 10, maxLevel: 3, desc: '+15% move speed, then +29% and +42%' },
  treads: { name: 'Lava Treads',          cost: 10, maxLevel: 3, desc: '-50% lava damage, then -64% and -72%' },
  amulet: { name: 'Amulet of Health',     cost: 12, maxLevel: 3, desc: '+25 max HP, then +43 and +56' },
  ring:   { name: 'Ring of Regeneration', cost: 12, maxLevel: 3, desc: '+0.7 HP/s, then +1.2 and +1.55' },
  // ---- 2026-08-08 (round 15): Remi asked directly whether the Cape and the
  // Lava Treads should be buffed, having read the round-13 item table. They got
  // OPPOSITE answers, and the reason is worth more than either number.
  // Both were measured in the isolation lab (`tools/arena.js --isolate=`, see
  // BALANCE 15A for what it is): 4 identical seats, one holds the item, the
  // other three hold a price-matched do-nothing control, so the baseline is
  // exactly 25% by symmetry and the number is points over wasting the same gold.
  //
  //  · THE TREADS WERE REAL AND TOO SMALL. Points over 25, 800 games/cell,
  //    Hard berserker, seeds 1 and 7 (2σ ≈ ±3.1 on one cell):
  //        lavaMult              lv1     lv2     lv3
  //        [0.85,0.74,0.68] ship +1.4    +2.9    +6.4     <- was worth ~nothing
  //        [0.60,0.45,0.35]      +4.4     --    +11.4
  //      **[0.50,0.36,0.28]      +6.0    +8.1   +12.7  <- SHIPPED**
  //        [0.45,0.30,0.20]      +7.9     --    +11.0
  //        [0,   0,   0   ] ceil +16.5    --    +20.0     <- total lava immunity
  //    The ceiling is the important row: even IMMUNITY to the lava is only worth
  //    ~+17 at this price, because the lava is 8.5% of all damage dealt (BALANCE
  //    13A). So the treads can be made worth their gold, and can never be made
  //    a headline item — the value is bounded by that 8.5%, not by this array.
  //    Value scales roughly linearly with the fraction of burn removed, which is
  //    why the shipped −15% measured as nothing: 15% of a small thing.
  //    ⚠ Checked for the trap below: the sign is the SAME at every bot tier
  //    (Extreme reads +2.5 shipped / +13.8 at the new values, i.e. the same
  //    story roughly doubled), so this is a number problem and a number fixes it.
  //
  //  · THE CAPE IS NOT A NUMBER PROBLEM — NOTHING CHANGED HERE, DELIBERATELY.
  //    Its measured value depends on WHO IS WEARING IT, and it changes SIGN:
  //        cape lv1, 800 games, seed 1  shipped (0.92)   kbMult 0 (immune)
  //        Normal  (brawler)                  --             −11.5
  //        Hard    (berserker)               +0.9            −19.8
  //        Extreme (stalker)                 +1.1            +25.6
  //    (lv3 on Extreme: +9.1, against −2.0 on Hard. On Hard the direction sweep
  //    is 0 → −19.8, 0.5 → −10.4, 0.92 → +0.9, 1.25 → −5.0: the peak is at "no
  //    cape at all", and moving either way from ×1.0 loses points.)
  //    Knockback resistance is worth −20 points to a
  //    berserker and +26 to a stalker. A bot that charges in and never retreats
  //    is HELPED by being shoved out of a fight it is losing; a bot that dodges,
  //    kites and holds its ground is helped by not being shoved at all. A human
  //    is at least as positional as the stalker.
  //    So the honest reading is that the Hard-tier number Remi saw (11.7 in the
  //    round-13 table, ~0 here) is a BOT ARTIFACT, and buffing the cape on it
  //    would be tuning the item for the pilot that misuses it — the exact
  //    mistake AGENTS.md says to flag rather than pay for. Note also that a
  //    "buff" here means pushing kbMult DOWN, i.e. toward the value that
  //    measures −19 on Hard: the lab would report the buffed cape as worse.
  //    ⚠ THIS ONE NEEDS REMI, NOT MORE GAMES. If it feels weak in his hands the
  //    lever is this array; if it feels fine, the round-13 table was reading a
  //    berserker's mistake. See BALANCE 15D.
  cape:   { name: 'Cape of the Magi',     cost: 12, maxLevel: 3, desc: '-8% knockback taken, then -15% and -20%' },
  // ---- 2026-08-07: Remi played a game with it and reported *"the sword that
  // does lifesteal is very expensive and when I looked at my numbers with it, it
  // was really really weak"*, with the hypothesis that *"a lot of damage comes
  // from the lava... lifesteal only works on the damage we deal ourselves, so in
  // the end it's not that much"*. Both halves were measured. NOTHING CHANGED
  // HERE, and here is why.
  //
  //  (i) THE LAVA HYPOTHESIS IS FALSE, and it is the cleanest number in the
  //      study. Across 300-game mirrors, of ALL damage absorbed by all bodies
  //      the lava is **8.4-8.8%** and other players are 91.2-91.6% — same in
  //      classic and elemental, same at seeds 1 and 7, and flat at ~8% in EVERY
  //      round from 2 to 18 (only round 1 is higher, 15-16%, because spells are
  //      still level 1). From the dealer's side, 91.3% of the damage you are
  //      credited with causing is your own hits, i.e. lifesteal-eligible.
  //      The lava is the EXECUTIONER, not the damage dealer: it takes ~30% of
  //      the kills (AGENTS.md) off ~8.5% of the damage, because it finishes
  //      people who were already chipped down by players. So lifesteal's ceiling
  //      is barely dented by it, and "make lifesteal pay on lava too" would be
  //      chasing a cause that does not exist. (dmgTakenLava/dmgTakenDirect were
  //      added to the sim for this; nothing had ever recorded uncredited burn.)
  //
  //  (ii) THE SWORD IS THE SECOND-STRONGEST ITEM IN THE GAME, not a weak one.
  //      Measured against a lab-only CONTROL item — same 15 g, three levels,
  //      `fx` literally `{}` — in mirror games where every seat runs an
  //      identical long build order and only the probe purchase differs
  //      (3000 games, Hard berserker/bruiser, seed 1, ~2400 games/arm, 2σ ±1.8).
  //      Points over wasting the SAME gold on the control:
  //          item     lv1 vs control1    lv3 vs control3    lv3 − lv1
  //          amulet        +39.1              +83.0            +43.3
  //          sword         +36.5              +40.0             −3.6
  //          boots         +27.5               +8.2            −32.2
  //          ring          +24.9              +10.7            −28.9
  //          treads        +19.7               +3.7            −32.5
  //          cape          +11.7               +0.4            −30.6
  //      The control is 15 g at every level, so it is exactly price-matched to
  //      the SWORD and 3-5 g dearer than everything else — the bias runs against
  //      the sword and it still places 2nd at both levels. Calibration for the
  //      absolute scale (the item-side twin of the 2.7% do-nothing element):
  //      burning 15 g on the control scores 7.8% and burning 45 g scores 0.7%,
  //      against 31.6% for a seat that just buys the tail. 15 g is worth ~24
  //      points in this game; the sword returns ~36.
  //
  //  (iii) WHAT IS REAL IN HIS REPORT is the LEVELS and the SCOREBOARD.
  //      · Levels: sword lv3 is 3.6 points WORSE than lv1 (44.3 -> 40.7) because
  //        30 g of lifesteal loses to 30 g of the rest of the shop. That is
  //        true of every item except the amulet, and by far the least badly for
  //        the sword — so it is an ITEM-LEVELS question (see the note in ITEMS
  //        above), not a sword question. Build-dependent: lv2/lv3 are free in a
  //        bruiser (39.1/37.0 vs 38.4 at lv1), mildly bad in a turtle, and a
  //        disaster in a rusher (46.6 -> 28.3 -> 17.3), whose budget is tighter.
  //      · Scoreboard: the standings print "Lifesteal" directly beside "Regen",
  //        and for a sword-lv1 bruiser those columns read 349 and 357. The 15 g
  //        item appears to heal slightly LESS than the free passive regen — so
  //        the number he read is real, and it understates the item, because
  //        lifesteal arrives mid-fight while regen is throttled to 25% for 2.5 s
  //        after every hit (PLAYER.REGEN_LOCK). In-combat hp and out-of-combat
  //        hp are not the same hp. THIS is the "really really weak" reading.
  //      Recommended (NOT done here — it is a feel change, not a number):
  //      give the sword some in-fight feedback. It is deliberately silent today
  //      (see applyDamage: only vampire's engorged ball gets a green number),
  //      which is the momentum/mosquito scar again — a correct mechanic with no
  //      on-screen presence reads as broken.
  //
  //  ⚠ BOT CAVEAT on all of the above: bots never dodge, never bait, and never
  //  make the trade a human makes with a lifesteal build ("I can win this
  //  brawl because I heal through it"). Lifesteal is a mechanic that rewards
  //  choosing to fight, and nothing in this lab chooses.
  sword:  { name: 'Blood Sword',          cost: 15, maxLevel: 3, desc: 'Heal 18% of damage dealt, then 30% and 38% (poison too — lava excluded)' },
  echo:   { name: 'Echo Stone', cost: 16, mode: 'elemental', maxLevel: 1,
            desc: '⚗️ experimental — every 4th fireball echoes: a second one fires 0.15 s later, same aim' },
  crown:  { name: 'Cinder Crown', cost: 18, mode: 'elemental', maxLevel: 1,
            desc: '⚗️ experimental — unlocks Fireball lv4 (buy it for the usual 8 g: +4 dmg, +7 push)' },
};

// Price of the next level of `key`. Flat by design (round 12): every level of
// an item costs the same, and the shrinking effect is what limits stacking.
export function itemCost(key) {
  return ITEMS[key] ? ITEMS[key].cost : 0;
}

// Per-level effect totals, indexed by level-1. Scalars apply at every level.
// 2026-08-03 1k-game study: sustain items dominated every mirror table
// (turtle 48-50%, bruiser 42-65% win rates vs the 25% baseline) after the
// lava -30% / knockback -10% retune made chip damage weaker. All five
// trimmed one gentle step; mobility spells got cheaper entries instead.
// Level 1 is a small NERF vs the old single copy (boots 1.2 → 1.15, treads
// 0.8 → 0.85, cape 0.9 → 0.92) because three levels are now reachable.
// ---- 2026-08-08 (round 15): the LEVEL curve, measured level by level -------
// The round-13 addendum reported "item levels 2-3 are near-worthless across the
// whole roster, lv1→lv3 is −29 to −33 points". That does NOT reproduce, and the
// reason is a flaw in how it was measured: its control item cost a flat 15 g at
// every level, so a level-3 item (30-45 g) was being compared against a 45 g
// waste while a level-1 item (10-15 g) was compared against a 15 g waste — the
// mismatch grew with the level. Against a control that is price-matched AT EVERY
// LEVEL, every item's value RISES with its level (`--isolate=items`, 800
// games/cell, mean of seeds 1 and 7, points over wasting the same gold):
//     item     lv1     lv2     lv3        item     lv1     lv2     lv3
//     amulet  +63.5   +73.9   +74.9*      boots    +8.7   +18.9   +19.0
//     sword   +41.0   +58.8   +64.4       treads   +1.4    +2.9    +6.4
//     ring    +12.0   +20.8   +27.9       cape     −0.2    −0.9    −1.4
//   (*the amulet wins 100.0% of its games at lv2-3: the instrument saturates
//    there and cannot resolve the last two levels. See BALANCE 15C.)
//
// So levels 2-3 are NOT worthless. What is true — and it is the real finding —
// is that they LOSE TO BREADTH. The level ladder (`--ladder=`, four identical
// seats capped at 0/1/2/3 levels of one item, everyone spending the saved gold
// on the same shared list, so 25% = "this level is exactly worth its price"):
//     item    lv0    lv1    lv2    lv3     reading
//     amulet   0.2    3.4   37.6   58.9    mandatory, and deep
//     sword    3.9   21.5   33.3   41.5    every level pays
//     boots   32.3   31.6   21.8   14.4    level 1 breaks even, 2-3 are traps
//     ring    32.1   31.7   22.1   14.2    same shape
//     treads  48.6   28.8   15.7    7.0    even level 1 lost to the alternative
//     cape    53.7   29.8   12.9    3.6    the worst purchase in the shop
// Both tables are true at once: level 2 of the boots beats 10 g of NOTHING by
// +10 points and loses to 10 g of THE REST OF THE SHOP by 10. That gap is the
// amulet and the sword, which return 3-6x more per gold than anything else.
//
// ⚠ THE FLAT COST IS NOT THE PROBLEM, so it was NOT touched (Remi's explicit
// round-12 instruction, and the measurement backs it): the levels lose to
// breadth, so ESCALATING their cost would make them worse, not better, and the
// measured cause is the amulet/sword outlier, not the price of a second pair of
// boots. Deliberately not acted on here — nerfing the two best items in the shop
// is a much bigger change than this round's brief, and it is BALANCE 15C's open
// question for Remi.
// The one thing that WAS a curve problem is boots level 3, which measured as
// adding literally nothing (+18.9 → +19.0, i.e. 0 ± 3 across two seeds). The
// falloff was too steep at the last step only:
//     speedMult                lv2     lv3
//     [1.15,1.27,1.35] shipped +18.9   +19.0   <- level 3 buys nothing
//   **[1.15,1.29,1.42]         +16.6   +26.9   <- SHIPPED (seeds 1/7: 25.7/28.1)**
// Level 1 is untouched at ×1.15 — that is Remi's own spec ("+15%, then +10%
// more, then +7% more") and only the last step is re-cut, to +14pp/+13pp instead
// of +12pp/+8pp. ⚠ This is still an edit to a number he specced by hand: the
// one-line revert is [1.15, 1.27, 1.35]. Round 11's 4-5-boots meta cannot come
// back from it — that needed UNCAPPED stacking (1.2^5 = ×2.49); this is ×1.42
// behind a hard cap of 3.
export const ITEM_FX = {
  boots: { speedMult: [1.15, 1.29, 1.42] },
  treads: { lavaMult: [0.50, 0.36, 0.28] },
  amulet: { maxHp: [25, 43, 56] },
  ring: { regen: [0.7, 1.2, 1.55] },
  cape: { kbMult: [0.92, 0.85, 0.80] },
  sword: { lifesteal: [0.18, 0.30, 0.38] },
  echo: { every: 4, delay: 0.15 },   // handled in castSpell/stepBattle
  crown: { fireballMax: 1 },         // handled in buy()
};

// ---- Elements (elemental mode only) --------------------------------------
// 2026-08-04 rework (Remi): each element is a 3-LEVEL upgrade path and they
// STACK — frost+ember is a chilling fire; buy as many as you can afford.
// Adds are summed, mults multiplied across everything you own. Per-level
// values are arrays indexed by level-1; scalars apply at every level.
// Riders need Fireball >= 1; arcane is global (no fireball needed).
// Balance notes vs the old one-pick system: gale and midas nerfed (were
// dominant), venom buffed (+ground trail), terra size now scales per level.
export const ELEMENTS = {
  ember: { name: 'Ember', icon: '🔥', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Pure fire: more damage and push each level.',
           fx: { dmgAdd: [2, 4, 6], kbAdd: [2, 4, 6] } },
  // 2026-08-06 rework (Remi: the old always-on chill "wasn't impactful").
  // Now it BUILDS: every frost hit leaves a stack that never melts, and the
  // 3rd one detonates. Stacks are on the VICTIM and, since round 12 (S2), are
  // PRIVATE to each attacker — you see and consume only your own.
  //
  // ---- WHY frost reads ~17% in the 12-element table, and why it is NOT retuned
  // (investigated 2026-08-07; three candidate causes, each tested separately)
  //  (i) THE PRIVATE-STACKS CHANGE — RULED OUT BY MEASUREMENT. The standard
  //      elemental study deals every seat a DIFFERENT element, so it contains
  //      exactly ONE frost player, and with one attacker private and shared
  //      counters are the same number. Verified rather than argued: the shipped
  //      sim and a lab copy patched to share stacks produce BYTE-IDENTICAL
  //      results at 1 frost seat (37.2% vs 37.2% at seed 7, 39.5% vs 39.5% at
  //      seed 23, 600 games each). Where the change IS visible — 2 frost seats
  //      in one game — it costs 2.4-3.9 points (private 24.9/24.7/23.3 vs shared
  //      27.3/28.5/27.2 at seeds 7/23/41), and ~1 point at 3 seats. That is the
  //      whole nerf, and it only exists in multi-frost lineups.
  //  (ii) DISPLACEMENT BY THE ROUND-12 NEWCOMERS — real but small. Dropping
  //      vampire+chronos+ghost from the pool leaves frost at 17.0% (both seeds);
  //      also dropping the reworked mosquito lifts it to 19.8%. So ~3 points.
  //  (iii) PRE-EXISTING, and this is most of it. Frost's berserker-mirror number
  //      has always been low and swingy: 27.1% (round 10 report), 23.2% (round
  //      11 report), 16.9% now — and 16.0% for the grunt tier as far back as
  //      round 10. The "29.4%" in docs/ROUND12.md is a single unreplicated cell.
  //      16.9% is ~1.2σ under round 11's 23.2% at this study's precision.
  //  Also ruled out: constant knockback (S1). Restoring HP-scaled knockback
  //  (KB_CONSTANT_MISSING=null) moves frost 16.5 -> 18.0% and 17.9 -> 18.6%.
  //
  // ⚠ AND THE MIXED TABLE IS THE WRONG RULER for "is this element weak". In the
  // absolute lab (1 element seat vs 3 seats with NO element, 600 games — see the
  // ghost block below for the 2.7% no-op calibration) frost wins 37.2/39.5%
  // while the no-element seats win 20.2-20.9%. Frost is a MID-STRENGTH element
  // in a very strong field, not a broken one: same lab, vampire 68-71 · mosquito
  // 60-62 · momentum 59-62 · venom 58-60 · ember 50-53 · arcane 48.7 · terra
  // 43.8 · chronos 42.5 · frost 37-40 · gale 34-38 · ghost 18-20 · midas 0.5-1.0.
  // Buying frost up toward 25% in the mixed table would just inflate the field.
  // NOTHING CHANGED HERE 2026-08-07.
  frost: { name: 'Frost', icon: '❄️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Hits leave a frost stack that never melts. The 3rd stack detonates: lv1 −30% speed 3 s · lv2 −50% speed 3 s · lv3 FROZEN SOLID 2 s. Everyone\'s stacks count toward the same 3.',
           fx: { stacksToTrigger: 3, slowMult: [0.7, 0.5, 1], slowT: [3, 3, 0],
                 stunT: [0, 0, 2] } },
  // 2026-08-05 rework: the DoT is now DISCRETE ticks (1/s for 5 s) and
  // re-hits refresh the clock AND stack the tick damage (capped). A lethal
  // tick gives the poisoner the kill — even in lava — but ticks still never
  // stamp the last-hitter slot (the round-9 credit rule).
  venom: { name: 'Venom', icon: '🐍', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Hits poison: 1 tick/s for 5 s. Re-hits refresh the clock AND strengthen the ticks. Trail on the ground. −15% direct damage.',
           fx: { dmgMult: 0.85, tickDmg: [1, 1.5, 2], stackAdd: [0.4, 0.6, 0.8],
                 stackCap: [3, 4.5, 6], dotTime: 5, tickEvery: 1,
                 trailT: [1.4, 1.9, 2.4], trailDps: 2, trailStep: 2.5, trailR: 1.3 } },
  // 2026-08-06 -> 2026-08-07 rework (Remi, from playtest: *"I find [wind] very
  // strong... I think we're going to change the wind's gameplay to redo it like
  // with the ice, where the pushback is enormous after three stacks and normal
  // the rest of the time"*). Gale WAS an always-on `kbMult: [1.28, 1.46, 1.65]`
  // on every hit — invisible, unavoidable, and the reason bots that bought it all
  // felt the same. It is now FROST'S SHAPE: every gale fireball that lands leaves
  // one stack, knockback is completely normal while they build, and the 3rd stack
  // is spent on one enormous shove. Stacks are PRIVATE to whoever applied them
  // (the round-12 rule) and go through the same generic store frost and mosquito
  // use — see addStack/galeHit in sim.js.
  //
  // ---- SWEEP for burstKbMult (`tools/arena.js --mode=elemental --games=1000`,
  // Hard berserker/bruiser). The brief was to land gale NEAR where it already
  // was, so the rework is a change of FEEL and not a stealth buff or nerf.
  // Pre-rework gale, same lab: 23.5% (seed 1) · 28.0% (seed 7).
  //
  // The starting candidate was impulse-neutral: gale now pushes ×1 twice and ×B
  // once, so B = 3M − 2 keeps the AVERAGE impulse per hit at the old flat M.
  // That gives [1.84, 2.38, 2.95] — and it measured dead on target:
  //     [1.84, 2.38, 2.95]  ->  23.5 / 26.4 / 24.3%  (seeds 1/7/23)  <- SHIPPED
  //     [2.20, 2.85, 3.55]  ->    -- / 40.4 / 36.7%
  //     [2.60, 3.40, 4.20]  ->  48.4 /   -- /   --
  //     [3.20, 4.20, 5.20]  ->  64.2 /   -- /   --
  //     [4.00, 5.20, 6.40]  ->  81.7 /   -- /   --
  // Two things to carry forward from that table:
  //  · IMPULSE IS WHAT COUNTS, not its distribution — concentrating the same
  //    average shove into one hit in three changed the win rate by less than
  //    noise. The prediction going in was the opposite (that a burst would be
  //    worth more, because only a big shove reaches the lava); it was wrong, and
  //    see the bot caveat below for why it may still be right for a human.
  //  · THIS LEVER IS VIOLENTLY STEEP. A 20% bump on the burst (1.84 -> 2.20) is
  //    +14 points. Do not "round it up a bit" without re-running the table.
  //
  // ⚠ BOT ARTIFACT, flagged not corrected: bots never bait, never hold a shot,
  // and never notice they are standing at 2 stacks with the lava behind them.
  // Everything a burst is FOR — timing it, saving it, walking someone toward the
  // edge before spending it — is invisible to this lab, so 23.5% is a floor on
  // gale's value in human hands and the honest reading of "unchanged" is
  // "unchanged for players who don't aim it". Remi's playtest decides.
  gale:  { name: 'Gale', icon: '🌪️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Hits leave a gale stack and push normally. The 3rd stack is spent on one enormous gust: ×1.84 knockback, then ×2.38 and ×2.95. Only YOUR stacks count toward your 3.',
           fx: { stacksToTrigger: 3, burstKbMult: [1.84, 2.38, 2.95] } },
  // 2026-08-06 rework (Remi, from human play — the lab's 1% win rate is a
  // gold-saturation artifact, see BALANCE.md): +1 g per hit is ALREADY strong,
  // so the payout is capped there forever and the levels buy back a real
  // drawback instead of raising income. Level 1 is half a fireball.
  //
  // ---- 2026-08-07: midas measures 0.0% again. NOTHING CHANGED, and here is why.
  // Round 12 capped items at 3 levels, which partly undid the round-11 stacking
  // that had given bot gold somewhere to go — and midas immediately fell back to
  // 0.0% while ending games on 54.3 average gold against ~13.8 for every other
  // seat. AGENTS.md's rule is "before believing 'bot artifact', try to DELETE the
  // artifact", so it was attacked from three directions (800 games/cell):
  //   · MORE TO BUY. Appending every spell a bruiser bot can actually pilot
  //     (lightning, rush, boomerang, shield, teleport, pillar) to its build order:
  //     midas 0.0% -> 7.0 / 10.0 / 8.9% (seeds 1/7/23) and its leftover gold
  //     54.3 -> 27-29. Adding crown+echo on top changed nothing further.
  //   · SCARCER GOLD. GOLD.ROUND_BASE 8 -> 5 -> 3 with the shipped build order:
  //     0.0 -> 4.4 -> 12.5%, leftover gold 54.3 -> 30.9 -> 24.1.
  //   · BOTH AT ONCE (ROUND_BASE 3 + the long order): 17.3 / 19.0%.
  // Every axis that makes gold matter moves midas monotonically up, and it is
  // still saturated (20.6 g left over) at the far end. So 0.0% is a FLOOR set by
  // the −50% damage drawback, not a measurement of the element.
  // The control that proves the drawback half is real and the income half is
  // invisible: midas with goldOnHit forced to 0 measures 0.0% with 3.3 kills;
  // shipped midas measures 0.0% with 7.9 kills. The income buys 4.6 kills' worth
  // of tempo and zero wins, because everyone finishes their build anyway.
  // ⚠ Calibration for whoever reads a 0.0% next: in the absolute lab (see ghost)
  // an element that does literally nothing but still costs its 26 g scores 2.7%.
  // Midas scores 0.5-1.0% — i.e. it is currently measured as slightly WORSE than
  // paying 26 gold for nothing, which is exactly what "a real drawback plus an
  // unspendable upside" looks like. Remi's human read was right the last time
  // this number was 1%; do not act on it.
  midas: { name: 'Midas', icon: '🪙', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Every hit pays +1 g — never more, at any level. The price: your fireball is HALVED at lv1 (−50% damage and push). Levels buy the penalty back: −38% at lv2, −28% at lv3.',
           fx: { goldOnHit: [1, 1, 1], dmgMult: [0.5, 0.62, 0.72], kbMult: [0.5, 0.62, 0.72] } },
  terra: { name: 'Terra', icon: '🪨', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Bigger, heavier fireball each level; hits briefly grow the target (a bigger target is easier to hit).',
           fx: { dmgAdd: [1, 2, 3], projRadiusMult: [1.25, 1.45, 1.65], growMult: [1.1, 1.15, 1.2], growT: 3, growCap: 2.2 } },
  // 2026-08-07 (Remi, round 12) — REWORKED and RENAMED from 'critical', a name
  // that never described what it did. History worth keeping, it is two lessons:
  // the original ramp was correct but invisible (+0.45 dmg/hit), so Remi
  // reported a working mechanic as broken; uncapping it moved the lab number
  // only 21→24% because bots rarely pass 15 stacks. Both times the mechanic was
  // fine and the FEEL was the bug.
  // Now the stacking is PERMANENT — it accumulates across the whole game, not
  // the round, so a player who keeps landing fireballs ends the match with a
  // cannon they earned over 20 rounds. Damage ONLY: knockback stays normal, so
  // a big Momentum stack melts people rather than launching them into the lava.
  // The white bonus number over the damage number is not decoration, it is the
  // fix for the 2026-08-06 report — see docs/ROUND12.md S5.
  // rampDmg was Remi's suggested +1/hit and it MEASURED 100% win rate (2026-08-07,
  // 1000 games): a momentum seat lands a median 78 fireballs per game (max 108
  // over ~15 rounds), so +1/hit is +78 damage on a 7-14 damage fireball against
  // 100 max HP — exactly the one-shotting the design ⚠ predicted.
  //
  // ---- RE-SWEPT 2026-08-07 (later), and the old 0.08 → "27.2%" claim is WRONG.
  // That figure came from a single 400-game run and does not reproduce: 0.08
  // actually makes momentum the strongest element in the game. Re-measured on the
  // standard 12-element elemental study (4 seats, baseline 25%, so an element
  // plays ~1/3 of the games — at 800 games one cell is ~250-280 games, 2σ ≈ ±5.4
  // points), 800 games × 3 seeds (1 / 7 / 23), which is why this table is
  // trustworthy where the old one was not:
  //   rampDmg lv1   seed 1   seed 7   seed 23   mean
  //   0.08          43.1%    37.9%    38.5%     39.8%   ← what shipped as "27.2"
  //   **0.06        23.6%    24.6%    25.0%     24.4%   ← SHIPPED**
  //   0.05          16.1%    13.6%    15.1%     14.9%
  //   0.04           8.6%    11.8%    10.7%     10.4%
  //   0.03           6.0%     5.4%     7.1%      6.2%
  // Monotone at every seed, and 0.06 is the tightest cell in the sweep (spread
  // 1.4 points across three seeds) — it lands ON the 25% baseline and reproduces.
  // The response curve is steep: one notch up is +15 points, one notch down is
  // −10, so re-run 800×3 after any change to the fireball, knockback or the lava.
  // 0.06 keeps the 1:1.5:2 level ratio and the permanence untouched, and still
  // ends a long game at ~+4.7 dmg (lv1) to ~+9.4 (lv3) on a 7-14 damage fireball
  // — earned over 20 rounds, which is the design.
  // The small per-hit step does NOT re-create the 2026-08-06 "I can't see it
  // working" complaint, because the feedback now comes from the accumulated
  // white number on the damage popup, not from the size of one step.
  // ⚠ Bot-measured. Bots spam fireballs; if Remi's human read says the ramp
  // feels too slow to earn, rampDmg is the one-line lever — raise it, don't
  // touch the permanence (accumulating across the whole game is Remi's design).
  momentum: { name: 'Momentum', icon: '⚙️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Starts at 80% damage. EVERY fireball you LAND makes your fireball permanently stronger — for the whole game, not just the round, with no ceiling. Damage only: your push never changes.',
           fx: { dmgMult: 0.8, rampDmg: [0.06, 0.09, 0.12], rampPermanent: true } },
  // 2026-08-07 (Remi, round 12) — SIMPLIFIED. The 2026-08-06 version put a bite
  // on an ARC of the victim's body and let any OTHER spell double on it. Two
  // things killed it: it was too fiddly to aim and too invisible to read (the
  // bites were on the wire but the client never drew them AT ALL, which is why
  // "mosquito feels broken" was a rendering gap, not a numbers problem), and
  // cross-spell doubling made mosquito+lightning the obvious meta. Remi's call:
  // drop both. Doubling now applies ONLY to your own fireball.
  //
  // The model is frost's: your sting leaves ONE stack on whoever it hits, no
  // geometry involved. Land a fireball on a target already carrying YOUR stack
  // (never anyone else's) and the stack is spent: TWO of your normal fireballs
  // appear at the sting's contact point and land TOGETHER. So every on-hit effect
  // you own fires TWICE — double frost, double venom, double midas. That is the
  // whole fantasy: the pest is setup, your own kit is the payoff.
  //
  // cdMult buys sting cadence — how often you get to set the trap up. See the
  // BALANCE block below for what each value actually measured.
  //
  // ⚠ 2026-08-07 (Remi, explicit — SIMPLER ON PURPOSE): the balls used to be
  // offset in time (`procGap`) and behind the impact (`procSpawnBack`), so a
  // perfectly timed teleport could dodge the second one. That offset is what let
  // constant knockback shove the victim out of the second ball's path, and the
  // fix for it (an intercept re-solve at release plus a muzzle that followed the
  // victim) was more machinery than the effect is worth. His call, verbatim:
  // *"put the 2 balls at exactly the same place. We'd just need to clearly see
  // all the on-hit indicators pop twice (for example seeing +1 gold twice)."*
  // Both knobs are GONE. The dodge window is gone with them, and the FEEDBACK is
  // now the feature: co-located popups fan sideways and stagger by a couple of
  // frames on the client (pushFloater in client/main.js) so two damage numbers,
  // two `+1 g`, two frost pips are legible as two events.
  // ⚠ KNOCKBACK HAPPENS ONCE (Remi's ruling, 2026-08-07 — this replaced the ×2
  // shove described below). Two simultaneous hits used to mean two impulses, and
  // impulses simply add, so a cashed sting launched a full-HP victim at 145.0 u/s
  // against a plain lv1 fireball's 72.5 (×2.00 exactly; 239 u/s with gale lv3).
  // His call, in translation: *"it will hit twice in damage and twice in all the
  // on-hits, yes. But the knockback, that will only happen once — I see the
  // mosquito as drawing its strength from DAMAGE rather than from knockback,
  // otherwise I can imagine a monstrous win rate."* So every proc ball now
  // carries `kbScale: 1 / procBalls` (shared/sim.js, spawnFireball → the collision
  // block) and the volley totals EXACTLY one fireball's push whatever procBalls
  // is. Damage and every on-hit effect still fire procBalls times: two damage
  // numbers, two `+1 g`, two frost pips — all test-locked, including a run with
  // procBalls forced to 3 so the rule cannot silently degrade into "ball 2 is
  // free".
  // ⚠ HARD RULE: the spawned fireballs must NOT place mosquito stacks, or
  // the effect chains forever. Test-locked — see docs/ROUND12.md S3.
  //
  // ---- BALANCE, RE-SWEPT under knockback-once (2026-08-07, later) ------------
  // Standard lab: tools/arena.js elemental study, 12-element pool, 4 seats,
  // baseline 25%. (Older 9-element-pool numbers in this file and in
  // docs/ROUND12.md are NOT comparable — the pool grew in round 12.)
  //
  // Removing the doubled shove cost the element far more than it cost the
  // spreadsheet, exactly as predicted: the lava is the primary killer, so a sting
  // that no longer launches anybody into it stops converting hits into kills.
  // Every table below is knockback-once. 400 games/seed for the wide sweep,
  // 800 games × 3 seeds for the band that decided it (mosquito's own n is ~1/3 of
  // the games, so at 800 games one cell is ~270-315 games, 2σ ≈ ±4.5 points —
  // which is why the wide sweep looked non-monotone between 0.86 and 0.95 and the
  // fine sweep does not):
  //   [0.98,0.85,0.72] (what shipped with ×2 kb, 21.8/27.8%) → **4.8 / 5.3%**
  //   [0.95,0.82,0.70] → 6.8 / 6.0%      [0.92,0.80,0.68] → 14.3 / 9.8%
  //   [0.90,0.78,0.66] → 17.7 / 16.5%
  //   [0.86,0.75,0.63] → 15.2 / 16.4 / 18.9%   (mean 16.8, 800 games)
  //   [0.83,0.72,0.61] → 15.9 / 17.5 / 18.6%   (mean 17.3, 800 games)
  //   **[0.80,0.70,0.59] → 28.3 / 23.9 / 20.4% (mean 24.2, 800 games) ← SHIPPED**
  //   [0.75,0.65,0.55] (the pre-nerf value) → 48.6 / 42.2 / 46.8% (mean 45.9)
  //   [0.55,0.50,0.45] (the original) → 78.2 / 78.9%
  //   [0.45,0.40,0.35] → 94.6 / 92.5%
  // SHIPPED [0.80, 0.70, 0.59]: the FASTEST sting that still lands on the 25%
  // baseline, chosen deliberately over the safer-looking 0.83/0.86 because the
  // fast sting IS this element's identity and ×1.3 had effectively deleted it
  // (lv1 sting 2.06 s vs a plain fireball's 2.10 s — a "double-rate sting" that
  // was 2% faster than not taking the element at all). At 0.80 the sting is
  // 1.68 s at lv1 and 0.94 s at lv3 against a plain fireball's 2.10/1.60, i.e.
  // 20% and 41% faster: a pest again.
  // ⚠ The response curve is brutally steep either side of this point — one notch
  // faster (0.75) is 45%, one notch slower (0.83) is 17%. Do not eyeball this
  // knob; re-run 800 games × 3 seeds after any change to knockback, the lava or
  // the fireball's own numbers.
  // The `procDmgMult` lever (proc-ball damage only, absent = 1.0) is still
  // implemented and still test-locked, but it is NOT needed any more: it existed
  // to pay for the double shove, which no longer exists. Its old sweep was
  // measured against the ×2 version and is void.
  // ⚠ Bot-measured, and bots flatter this element: a bot re-hits its nearest
  // enemy constantly, so it cashes the mark for free and never has to hunt a
  // marked target. Treat 24% as an UPPER bound on how hard the setup is, and
  // Remi's feel report outranks the table — the sweep above says what each step
  // buys.
  mosquito: { name: 'Mosquito', icon: '🦟', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Your fireball becomes a mosquito: 1 damage, no push, and a much faster sting that leaves a mosquito stack on whoever it hits. Sting someone who already carries YOUR stack and it spends it: two of your normal fireballs land at once, so every effect you own procs twice — double damage, double frost, double gold. The push, though, is only ever a single fireball.',
           fx: { mosquito: true, cdMult: [0.80, 0.70, 0.59], stingDmg: 1,
                 procBalls: 2 } },
  // 2026-08-05: buffed (−10/−18/−25 felt invisible in play) and the HUD now
  // badges every spell slot with 🔮 so the owner SEES it working.
  arcane:{ name: 'Arcane', icon: '🔮', maxLevel: 3, costs: [10, 8, 8],
           desc: 'ALL your cooldowns run faster: −10% / −19% / −28%.',
           fx: { cdrMult: [0.9, 0.81, 0.72] } },
  // ---- 2026-08-07 (Remi, round 12): three new elements -------------------
  // Remi's read was that the lifesteal fantasy is under-exploited — the Blood
  // Sword pays 18% and nobody notices. This chases much bigger numbers, but
  // rarely, so it is an EVENT rather than a passive trickle. The counter runs on
  // YOUR casts, so unlike mosquito it needs no setup on a specific target.
  // ⚠ Interaction to keep bounded: lifesteal is paid on damage ACTUALLY dealt
  // (overkill excluded, never from lava), which is what stops vampire+mosquito's
  // 1-damage sting from healing anything meaningful. Test it, don't assume it.
  // MEASURED AND RETUNED 2026-08-07, same session it was written. As specced
  // (every 3rd cast, 200/275/350%) it won **74.7%** of games — 3x the 25%
  // baseline, the most dominant element ever measured here, because sustain is
  // this game's strongest axis (see the 2026-08-03 study: sustain items topped
  // every mirror table, and round 10's knockback cut crowned them again).
  // Both knobs swept independently at 400 games, seed 7, standard elemental
  // study (baseline 25%):
  //   chargeEvery, % kept at spec: 3 → 74.7 · 5 → 48.6 · 7 → 31.5 · 9 → 15.8 ·
  //                                12 → 6.8 · 16 → 4.1
  //   chargeLifesteal ×k, every 3: 1.0 → 74.7 · 0.6 → 51.4 · 0.4 → 34.9 ·
  //                                0.25 → 17.8 · 0.15 → 11.0
  //   combinations: every 8 at spec% → 21.2 · every 6 ×0.8 → 34.9 ·
  //                 **every 5 ×0.7 → 26.7** · every 5 ×0.55 → 28.1 ·
  //                 every 4 ×0.55 → 41.1
  // Split across BOTH knobs on purpose, because each one alone deletes half the
  // design: shrinking only the % (0.35x, i.e. ~70%) makes the engorged ball heal
  // LESS than the Blood Sword already pays passively, and stretching only the
  // cadence to every 8th makes it unreadable and hostage to short rounds. At
  // every 5th × 0.7 the lifesteal is still ABOVE 100% at every level — the ball
  // still heals you for more than it hit for, which is the whole fantasy — and it
  // measures 26.7%. The level ratio is untouched (1 : 1.37 : 1.75).
  // ⚠ Probably still generous in Remi's hands, and probably OVER-measured by
  // bots: a bruiser berserker brawls point-blank forever, which is the ideal
  // lifesteal engine. `chargeEvery` and `chargeLifesteal` are both one-line
  // levers; raise them if his feel report says the ball is not an event.
  vampire: { name: 'Vampire', icon: '🧛', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Every 5th fireball is engorged: it heals you for 140% of the damage it deals (192% / 245% at higher levels). Rare, loud, and it turns a won trade around.',
           fx: { chargeEvery: 5, chargeLifesteal: [1.4, 1.92, 2.45] } },
  // Remi's design, and the build he wants to make possible: buy level 1 of
  // EVERYTHING — boomerang, lightning, fireball, repulse, hook — and machine-gun
  // the whole kit, using repulse's AoE to refund it all at once. Rise, ~2013.
  // Distinct from arcane on purpose: arcane is a passive flat %, chronos is
  // EARNED on hit. They stack into something absurd, which is the intent.
  // Refund applies to every cooldown currently running INCLUDING the spell that
  // just landed, and multiplies by the number of enemies that spell hit.
  // ⚠ cdFloor exists so a refund can never drive a cooldown to 0 in the same
  // frame and re-cast in a loop. Test-locked.
  chronos: { name: 'Chronos', icon: '⏳', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Every spell of yours that HITS refunds 0.5 s off every cooldown you have running (1 s / 1.5 s at higher levels) — and it counts per enemy hit, so a Repulse into four people refunds four times.',
           fx: { cdRefund: [0.5, 1.0, 1.5], cdFloor: 0.25 } },
  // Remi's design: the ball does not stop on the first body, it goes through.
  // Deliberately NOT scaled per victim — a lucky 4-player line would produce a
  // nonsense number. The first victim takes an ordinary fireball; everyone
  // BEHIND them takes the bonus, and the level buys how big that bonus is.
  // Cheap to build: boomerang already tracks one-hit-per-enemy-per-throw, so
  // ghost reuses that set plus the pierce flag.
  // MEASURED 2026-08-07 and DELIBERATELY LEFT ALONE at 4.3% (1000-game study,
  // baseline 25%) — the numbers below are not the problem, the trigger rate is,
  // and AGENTS.md forbids number-buffing around a bot artifact. The evidence:
  //   • the pierce bonus fires on **3.07% of ghost fireballs** (60 games, 11880
  //     balls: 51.1% hit somebody, only 3.07% reached a SECOND body) — about 6
  //     bonus hits per whole game, i.e. ~21 extra damage over ~15 rounds.
  //   • controls, 400 games each: an element that does literally NOTHING scores
  //     2.2%, and "pierces but with a 1.0x bonus" scores 2.9% — so piercing
  //     costs nothing, and ghost's 4.4% is the no-op floor plus a rounding error.
  //     The 25% baseline is an average over the pool; a seat with no working
  //     element sits at ~2%, which is what ghost currently is TO A BOT.
  //   • scaling the bonus does work, but only at absurd values: ×2
  //     (dmg 2.0/2.8/3.6) → 6.6% · ×3 (2.5/3.7/4.9) → 11.0% · ×5
  //     (3.5/5.5/7.5) → 28.7%. A second victim taking 3.5x a fireball out-damages
  //     a Meteor; that is not a retune, it is a different element.
  // Bots never line two enemies up — "line them up" IS this element's entire
  // skill expression, exactly the case AGENTS.md says to flag rather than pay
  // for. A human in a late-round arena (radius 10, everyone clustered) should
  // trigger it far more often than 3%. If Remi's feel report says it is weak
  // anyway, the honest fix is FREQUENCY (pierce more reliably, or give the first
  // victim something), not a bigger multiplier — the sweep above shows what each
  // multiplier step actually buys.
  //
  // ---- RE-CONFIRMED 2026-08-07 (8.3% in the 1000-game table) — STILL UNCHANGED,
  // and this is where the calibration for every "is this element weak" question
  // now lives. The mixed 12-element study is a RANKING, not a strength meter, so
  // the absolute lab was built: ONE element seat against THREE seats carrying no
  // element at all, 600 games, same profile and build everywhere.
  //   · the no-op control — an element whose fx is `{}`, so it does nothing but
  //     still costs its 10+8+8 g and is still bought FIRST — scores **2.7 / 2.8%**
  //     (seeds 7/23). THAT is the floor of this lab, not 25%: the element seat
  //     starts 26 gold behind three seats that spent it all on their build.
  //   · pierce with the bonus neutralised (dmg/kb mult 1.0) scores **8.5 / 8.5%**.
  //   · ghost as shipped scores **18.0 / 20.3%**.
  // So piercing is worth ~+6 over nothing, the bonus another ~+10, and ghost is a
  // WORKING element that ranks last of twelve because the field is strong (same
  // lab: vampire 68-71 · mosquito 60-62 · momentum 59-62 · venom 58-60 · ember
  // 50-53 · arcane 48.7 · terra 43.8 · chronos 42.5 · frost 37-40 · gale 34-38 ·
  // ghost 18-20 · midas 0.5-1.0). Its 8.3% in the mixed table is what "12th out of
  // 12 strong things" looks like, and in BOT hands that is the correct answer: the
  // bonus fires on 3.07% of ghost fireballs because bots do not line targets up.
  // ⚠ The honest lever if Remi's feel report says it is weak in HUMAN hands is
  // still FREQUENCY, not a bigger multiplier — see the multiplier sweep above,
  // where the only values that move the table are ones that out-damage a Meteor.
  ghost: { name: 'Ghost', icon: '👻', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Your fireball passes straight through people. The first one hit takes a normal hit; anyone caught BEHIND them takes +50% damage and +30% push (+90/+55% and +130/+80% at higher levels). Line them up.',
           fx: { pierce: true, pierceDmgMult: [1.5, 1.9, 2.3],
                 pierceKbMult: [1.3, 1.55, 1.8] } },
};

// ---- Draft mode (2026-08-07, Remi, round 12) -----------------------------
// Optional lobby toggle, OFF by default. The problem it attacks: with 12
// elements, 12 spells and 8 items all permanently available, a single optimal
// build eventually calcifies into the meta and everyone plays it. When draft is
// on, half the catalogue leaves the shop entirely and becomes a random pool;
// every few rounds you are handed a free choice of three from it. Availability
// becomes the thing you adapt to, so ADAPTING is the skill being tested, and
// rare-but-spectacular combos get to exist because nobody can plan around them.
// The pool split is rolled per GAME (so no two matches feel alike), decided
// server-side, and identical for every player in the lobby.
// Implementation notes, all decided 2026-08-07 and all one-liners to revert:
//   · "The catalogue" is shared/catalogue.js — one enumerable list of spells +
//     elements + items for the current ruleset, MINUS the starting kit
//     (Fireball: everyone owns lv1 and every rider element hangs off it, so
//     draft-locking it would lock half the shop behind one roll).
//   · A pool thing is unbuyable until you own it; the moment you draft it, it is
//     back on the shelf at its normal price for levels 2 and 3. "Do you own any
//     level of it" IS the gate — no second bookkeeping list.
//   · Offers land in the shop after rounds 1, 4, 7… (EVERY_ROUNDS apart, but
//     starting with the FIRST shop rather than the third: you draft before you
//     have calcified, which is the whole point).
//   · An offer is never something you already own at any level, which is what
//     makes "a drafted thing arrives at level 1" true.
export const DRAFT = {
  POOL_FRAC: 0.5,      // fraction of the catalogue pulled out of the shop
  EVERY_ROUNDS: 3,     // a free pick is offered this often
  OPTIONS: 3,          // choices offered, roughly gold-equivalent
  // The first option is pre-selected, so a player who never clicks still gets
  // something. Clicking picks another. Bots pick immediately.
  AUTO_PICK_FIRST: true,
};

export const COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
  '#e67e22', '#1abc9c', '#fd79a8', '#95a5a6', '#00cec9',
];

// ---- Bots ----------------------------------------------------------------
// Behavior lives in shared/sim.js (stepBot); this is the roster contract
// shared by server (spawning) and client (lobby UI).
// 2026-08-07 (Remi, round 12): FOUR named tiers — Easy / Normal / Hard /
// Extreme. The old ★ was never meant to be the entry level: it wanders and
// shoots at nothing, which is Easy, and Remi asked for a real Normal between
// that and the old ★★. `label` is what the UI shows; `difficulty` is only the
// rank used for sorting. The `kind` KEYS are unchanged on purpose — they are
// combat profiles referenced by shared/campaign.js and the labs, and renaming
// them would break the co-op templates for no gain.
//
// `brain` says which step function pilots it, so Normal is NOT new AI: it is
// the berserker brain with two numbers made worse, which is the whole reason it
// can be trusted. `react: [base, jitter]` is the decision interval in seconds
// (`_botT = base + rng*jitter`) and `aimErr: [floor, perUnit]` is the aim error
// (`(rng-0.5) * (floor + dist*perUnit)`).
// The 2026-08-05 lesson these numbers encode: a reaction time is a PERCEPTION
// delay, not a handicap — the bot aims from a stale observation extrapolated
// across the lag, so it leads you correctly and only loses to genuine direction
// changes. Aiming at where you *were* under-leads forever and dropped the ★★
// BELOW the ★.
// ⚠ Verify the ladder with `tools/h2h.js` (2 seats vs 2 seats, 50% = parity),
// NOT the mixed Elo table, which demonstrably hides tier gaps: it once read the
// ★★ as ~80 Elo above the ★ while it actually won 99.6% of head-to-heads.
// Required: extreme > hard > normal > easy, monotonically.
export const BOTS = {
  grunt:     { name: 'Grunt', label: 'Easy', difficulty: 1, brain: 'grunt',
               desc: 'Wanders and throws at nothing in particular. Cannon fodder.' },
  brawler:   { name: 'Brawler', label: 'Normal', difficulty: 2, brain: 'berserker',
               react: [0.30, 0.16], aimErr: [0.9, 0.16],
               desc: 'Hunts you and trades, but it reads you slowly and its aim is loose. A fair fight.' },
  berserker: { name: 'Berserker', label: 'Hard', difficulty: 3, brain: 'berserker',
               react: [0.16, 0.10], aimErr: [0.35, 0.10],
               desc: 'Hyper-aggressive. Hunts you down, rushes, never retreats, and leads its shots well.' },
  // ⚠ the stalker's aimErr is [0.4, 0.05], NOT the berserker's [0.35, 0.10]:
  // Extreme has always carried a slightly bigger floor and a much flatter
  // distance term (that is what makes it accurate at range), and the 65f5597
  // data-ification copied the berserker's pair in by mistake. Corrected to the
  // values stepStalker has actually used since round 10, so wiring the data up
  // changed no behaviour — verified with tools/h2h.js (stalker still beats
  // berserker 100%).
  stalker:   { name: 'Stalker', label: 'Extreme', difficulty: 4, brain: 'stalker',
               react: [0.12, 0.08], aimErr: [0.4, 0.05],
               desc: 'Dodges your projectiles, leads its shots, and saves itself with teleport and shield.' },
};

// How long (seconds) a bot keeps aiming at the last place it SAW an enemy.
// Bots read the simulation directly, so Vanish (SPELLS.vanish) has to be masked
// in their perception too or Extreme becomes an aimbot that ignores the spell
// (docs/ROUND12.md N4). Masked perception alone would be worse than human — a
// bot would forget you existed the instant you blinked out — so instead it keeps
// shooting at your last known position and gives up after this. Sized just under
// the lv3 duration (2.25 s) so a fully levelled Vanish buys a real moment of not
// being tracked at all, and above lv1 (0.75 s) so a cheap Vanish only ever
// makes the bot's aim stale, not blind.
export const BOT_MEMORY = 1.5;

// ---- Bot targeting: pressure on the kill leader ---------------------------
// A comeback lever, asked for 2026-08-07: "a tendency to group up against
// whoever has the most kills, or at least for that to bias their targeting…
// it mustn't be extreme". So it is a WEIGHT inside the existing prey score
// (pickPrey / nearestEnemy in sim.js), never an override — "this one is nearly
// dead and standing next to me" still beats "the leader is across the map".
//
// Unit: **arena units of apparent distance per kill of lead**. A target the bot
// is N kills behind feels `N * LEADER_BIAS` units closer than it is. The lead is
// the SAME gap the gold bounty pays on (GOLD.BOUNTY_PER_GAP, kill() in sim.js):
// per-observer, floored at 0, so the leader never hunts anyone for being ahead
// and a field that is level produces no bias at all. Free-for-all only — co-op
// parties are one team and monsters have their own targeting (see killLead()).
//
// SWEPT 2026-08-07. Mixed 4-player study (the same sampler tools/arena.js's
// default study uses), 3 seeds x 2500 games = **7500 games per cell**, and every
// cell replays the SAME lineups and seeds, so the only thing that differs
// between rows is this number. "comeback" = the eventual winner was at some
// point >= 4 kills behind, i.e. exactly what arena.js prints. Cell 0 was
// verified byte-identical to the pre-change build (same Elo table, same lava
// share) — the term is provably inert at 0, so row 0 IS the old game.
//   bias   comeback%          mean   avg rounds   games hitting MAX_ROUNDS
//   0     12.6 / 12.7 / 12.2  12.5      9.13              0.0%
//   1     13.0 / 14.0 / 12.7  13.2      9.21              0.0%
//   1.5   13.4 / 14.5 / 13.0  13.6      9.25              0.0%
//   2.5   14.9 / 14.7 / 14.8  14.8      9.30              0.0%   <- shipped
//   4     14.8 / 13.8 / 14.9  14.5      9.31              0.0%
// Comeback climbs monotonically to 2.5 and then flattens/declines (4.0 is not an
// improvement on any seed pair and 8.0 was erratic in an earlier 1200-game run),
// so 2.5 is the top of the useful range rather than a step along it. The feared
// failure mode — the leader can never close it out and games run to the 25-round
// cap — **did not appear at any weight**: no cell had a single capped game, and
// mean game length moved 9.13 -> 9.30 rounds (+1.9%). Lava kill share 30.3% ->
// 30.4%, i.e. untouched. The difficulty ladder is untouched too: tools/h2h.js at
// 400 games/pair reads Normal>Easy 100%, Hard>Normal 99.5%, Extreme>Hard 100%
// both before and after, the same figures as AGENTS.md.
// Second lab, where the mechanic has the most room (4 EQUAL Hard berserkers,
// builds differing only, 800 games, seed 7): comeback 44.3% at 0 -> 54.6% at
// 2.5, again 0 capped games, mean rounds 13.95 -> 15.20.
// ⚠ What no lab here can see: bots do not experience being ganged up on. If it
// feels oppressive in a real game, 1.5 is the measured step down (+1.1 instead
// of +2.3 points) and 0 removes the mechanic entirely.
export const BOT_TARGETING = {
  LEADER_BIAS: 2.5,
};

// ---- Bot build strategies -------------------------------------------------
// A bot = a combat profile (BOTS kind: HOW it fights) × a build strategy
// (WHAT it buys). Each order list is consumed greedily every shop: first
// affordable next step, skipping what's owned/maxed. Selectable per bot in
// the lobby ('random' picks one at seat time); the balance lab (tools/
// arena.js) rates every kind × build pairing.
export const BUILDS = {
  bruiser: { name: 'Bruiser',
    desc: 'Max fireball, then HP and lifesteal. Stands its ground and trades.',
    order: ['fireball', 'amulet', 'fireball', 'boots', 'sword', 'ring', 'cape', 'treads'] },
  sniper:  { name: 'Sniper',
    desc: 'Lightning first. Pokes from long range and finishes low targets.',
    order: ['lightning', 'fireball', 'boots', 'lightning', 'fireball', 'lightning', 'cape', 'ring'] },
  escape:  { name: 'Escape artist',
    desc: 'Max fireball with an escape button. Slippery, still dangerous.',
    order: ['boots', 'fireball', 'teleport', 'fireball', 'fireball', 'cape', 'teleport', 'ring'] },
  turtle:  { name: 'Turtle',
    desc: 'Shield, regen and HP. Outlasts you and lets the lava do the work.',
    order: ['shield', 'amulet', 'ring', 'cape', 'shield', 'treads', 'fireball', 'fireball'] },
  rusher:  { name: 'Rusher',
    desc: 'Rush and lifesteal. Dives in and shoves you off the platform.',
    order: ['rush', 'fireball', 'boots', 'sword', 'fireball', 'rush', 'amulet', 'cape'] },
  boomer:  { name: 'Boomer',
    desc: 'Boomerang stacking. Wide throws that hit on the way out and back.',
    order: ['boomerang', 'fireball', 'boots', 'boomerang', 'amulet', 'boomerang', 'ring', 'sword'] },
};
