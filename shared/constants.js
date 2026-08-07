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
  // ⚠ No round reset means this is genuinely unbounded over 25 rounds. Starting
  // at +1/hit per Remi; if the lab shows late rounds one-shotting, the lever is
  // rampDmg or a soft cap, NOT the removal of the permanence.
  momentum: { name: 'Momentum', icon: '⚙️', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Starts at 80% damage. EVERY fireball you LAND makes your fireball permanently stronger — for the whole game, not just the round, with no ceiling. Damage only: your push never changes.',
           fx: { dmgMult: 0.8, rampDmg: [1, 1.5, 2], rampPermanent: true } },
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
  // (never anyone else's) and the stack is spent: a few units before impact, TWO
  // of your normal fireballs appear slightly offset and land in quick
  // succession. So every on-hit effect you own fires TWICE — double frost,
  // double venom, double midas. That is the whole fantasy: the pest is setup,
  // your own kit is the payoff.
  // The offset is deliberate, not cosmetic: a perfectly timed teleport can dodge
  // the second ball, which is real skill expression on both sides.
  // ⚠ HARD RULE: the two spawned fireballs must NOT place mosquito stacks, or
  // the effect chains forever. Test-locked — see docs/ROUND12.md S3.
  // cdMult is a real nerf from the old 0.55/0.5/0.45: the payoff went from one
  // doubled hit to two full fireballs, so the sting rate pays for it. Level
  // buys sting cadence — how often you get to set the trap up.
  mosquito: { name: 'Mosquito', icon: '🦟', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Your fireball becomes a mosquito: 1 damage, no push, but a much faster sting that leaves a mosquito stack on whoever it hits. Sting someone who already carries YOUR stack and it spends it: two of your normal fireballs land back to back, so every effect you own procs twice.',
           fx: { mosquito: true, cdMult: [0.75, 0.65, 0.55], stingDmg: 1,
                 procBalls: 2, procGap: 0.09, procSpawnBack: 2 } },
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
  vampire: { name: 'Vampire', icon: '🧛', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Every 3rd fireball is engorged: it heals you for 200% of the damage it deals (275% / 350% at higher levels). Rare, loud, and it turns a won trade into a full heal.',
           fx: { chargeEvery: 3, chargeLifesteal: [2.0, 2.75, 3.5] } },
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
export const BOTS = {
  grunt:     { name: 'Grunt',     difficulty: 1, desc: 'Wanders and throws. Cannon fodder.' },
  berserker: { name: 'Berserker', difficulty: 2, desc: 'Hyper-aggressive. Hunts you down, rushes, never retreats.' },
  stalker:   { name: 'Stalker',   difficulty: 3, desc: 'Dodges, leads its shots, saves itself with teleport and shield.' },
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
