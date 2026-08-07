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
  boots:  { name: 'Boots of Speed',       cost: 10, maxLevel: 3, desc: '+15% move speed, then +27% and +35%' },
  treads: { name: 'Lava Treads',          cost: 10, maxLevel: 3, desc: '-15% lava damage, then -26% and -32%' },
  amulet: { name: 'Amulet of Health',     cost: 12, maxLevel: 3, desc: '+25 max HP, then +43 and +56' },
  ring:   { name: 'Ring of Regeneration', cost: 12, maxLevel: 3, desc: '+0.7 HP/s, then +1.2 and +1.55' },
  cape:   { name: 'Cape of the Magi',     cost: 12, maxLevel: 3, desc: '-8% knockback taken, then -15% and -20%' },
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
export const ITEM_FX = {
  boots: { speedMult: [1.15, 1.27, 1.35] },
  treads: { lavaMult: [0.85, 0.74, 0.68] },
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
  // 3rd one detonates. Stacks are on the VICTIM and shared by all attackers,
  // so two frost players combo into each other's setups.
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
  gale:  { name: 'Gale', icon: '🌪️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'A gust in a ball: more push each level.',
           fx: { kbMult: [1.28, 1.46, 1.65] } },
  // 2026-08-06 rework (Remi, from human play — the lab's 1% win rate is a
  // gold-saturation artifact, see BALANCE.md): +1 g per hit is ALREADY strong,
  // so the payout is capped there forever and the levels buy back a real
  // drawback instead of raising income. Level 1 is half a fireball.
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
  // 100 max HP — exactly the one-shotting the design ⚠ predicted. Sweep at 400
  // games: 1 → 99.6% · 0.3 → 86.4% · 0.15 → 61.8% · **0.08 → 27.2%** · 0.04 → 6.6%
  // (baseline 25%). 0.08 keeps the 1:1.5:2 level ratio and the permanence, and
  // still ends a long game at +6 dmg (lv1) to +12.5 (lv3) — a fireball roughly
  // DOUBLED, earned over 20 rounds.
  // The small per-hit step does NOT re-create the 2026-08-06 "I can't see it
  // working" complaint, because the feedback now comes from the accumulated
  // white number on the damage popup, not from the size of one step.
  // ⚠ Bot-measured. Bots spam fireballs; if Remi's human read says the ramp
  // feels too slow to earn, rampDmg is the one-line lever — raise it, don't
  // touch the permanence.
  momentum: { name: 'Momentum', icon: '⚙️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Starts at 80% damage. EVERY fireball you LAND makes your fireball permanently stronger — for the whole game, not just the round, with no ceiling. Damage only: your push never changes.',
           fx: { dmgMult: 0.8, rampDmg: [0.08, 0.12, 0.16], rampPermanent: true } },
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
