// The CO-OP CAMPAIGN — 10 levels of pure data.
//
// Design rule (deliberate, enforce it when you edit this file): a campaign
// enemy is an EXISTING bot kind (grunt ★ / berserker ★★ / stalker ★★★) running
// an EXISTING build, differing from a normal lobby bot only in
//   maxHp · spells · items · sizeMult · COUNT · arrival time.
// No new AI behaviour lives here or anywhere else for co-op. If a level needs
// something the roster can't express, change the numbers, not the code.
//
// The client keys the background art, the music track and the title card off
// the campaign LEVEL (assets/manifest.json has exactly ten of each), so the
// whole audiovisual layer comes for free. Level 10 is the finale and plays the
// intro track (see client/coop.js). Level != round: clearing advances the
// level, wiping costs a round and you retry — ROUND.COOP_MAX_ROUNDS is the
// budget for the whole run.
//
// ---- party scaling ---------------------------------------------------------
// P = number of party members (humans and/or their bot stand-ins), 1..N.
// The numbers in the table below are the SOLO numbers; the party makes them
// grow. Every wave declares how:
//   scale: 'count' (default) — the swarm brings MORE bodies:
//        count' = max(1, round(count * (1 + COUNT_PER_PLAYER * (P-1))))
//   scale: 'hp'             — a single elite/boss gets TOUGHER, never cloned:
//        maxHp' = round(maxHp * (1 + HP_PER_PLAYER * (P-1)))
//   scale: 'both'           — half of each (a small pack of elites)
//   scale: 'none'           — fixed, whatever the party size
//   minParty: n             — the wave only exists at party size >= n
//   perPlayer: f            — override COUNT_PER_PLAYER for this wave only
// Their spells, items and AI tier never scale: those are the level's signature
// and stay identical at 1, 2 or 3 players.
//
// Why the scaling is superlinear (COUNT_PER_PLAYER > 1): a party only wipes
// when EVERY member is down, so three players are far more than three times as
// durable as one. Flat clear rates across party sizes need >1x bodies per
// extra player.
//
// ---- what the retune of 2026-08-07 learned (friendly fire is ON) ------------
// Allies — including monsters — now damage and shove each other. That rewrote
// every rule of thumb this file used to carry, so the whole table was remeasured
// with `node tools/coop.js --levels` (200 attempts per level per party size):
//
// * MORE BODIES IS OFTEN EASIER. A pack that only grows in numbers shreds
//   itself: eighteen imps clear 100% at every size, and nine 45 hp hounds are a
//   softer level 6 than five 64 hp ones. Chaff waves that used to be the party-
//   scaling default now make a level LESS threatening as the party grows, which
//   is exactly the flattening this retune had to undo. Grow packs with
//   scale:'both' (count AND hp) so the survivors are worth the crossfire.
// * CHAFF EXPIRES. Imps and Cultists are level-1-to-5 units and nothing more:
//   at level-8 gear, six imps, thirteen imps and five cultists all clear 100%
//   at every party size. The back half is denominated in Shades and tanks.
// * STAGGERING ARRIVALS IS A DIFFICULTY *REDUCTION*, not an increase — a wave
//   that trickles in fights the party one at a time and never crosses fire with
//   itself, but also never surrounds anyone. Late `at` times are a softening
//   lever now (level 9's hounds), not a pressure lever.
// * A PARTY IS WORTH FAR MORE THAN ITS BODY COUNT. One Shade is a 71% clear
//   solo and two are 10%; two Shades against a DUO are 95%. Threat counts have
//   to roughly triple from 1p to 2p, which is more than any perPlayer value
//   lands cleanly — hence the minParty/scale:'none' waves that count the real
//   threats out by hand for each party size.
//
// ---- what the ITEM-CAP repair of 2026-08-07 (later) learned ------------------
// Round 12 turned items from freely-stackable copies into 3 levels with a hard
// cap. Nobody re-measured the campaign, and it broke: the party is BOTS THAT
// SHOP UP TO 13 TIMES, so under uncapped stacking they used to reach the back
// half carrying 8-13 copies of every item, while every enemy here is a fixed
// template that owned exactly ONE copy and therefore lost almost nothing. The
// levels the party had banked the most shops for are the ones that collapsed:
//   L7 69/67/70 -> 69/75/73   L8 58/61/60 -> 68/85/57
//   L9 44/53/42 -> 22/29/8    L10 38/36/38 -> 23/12/12
//   full campaign, 200 runs/party size: 55/79/55% -> 11/10/4% (that last pair of
//   figures is quoted from the work order, not re-measured here; the isolated
//   level table above WAS reproduced at HEAD before anything was changed).
// After this retune: L8 68/66/57 · L9 39/46/44 · L10 30/42/32, monotone at every
// party size, full campaign 37.0/55.5/41.0%.
// Levels 8, 9 and 10 were retuned; 1-7 were left alone. L7 still reads on target
// (69/75/73). ⚠ L4-L6 have drifted UP a few points (94/94/97, 98/96/91,
// 91/97/97) and that is NOT the item cap — the party has barely shopped by then.
// The untested hypothesis is round 12's constant knockback (S1): everyone is now
// shoved as if permanently at 70% HP, which helps a full-HP party shove a fresh
// Brute and stops a dying player from being launched. Left alone deliberately:
// the curve is still non-increasing there, and the brief was levels 9-10.
// Three rules were re-confirmed the hard way, all at 200 attempts/cell:
// * THE ★★★ IS THE WHOLE FIGHT, AND IT IS THE COARSEST UNIT IN THE GAME. Delete
//   level 9's single solo Shade and the level clears 100%; delete its Brute and
//   it still clears 87%. At level 10, one Shade at 2p was worth ~45 clear points
//   at every boss HP tried. Price a party in Shades and you cannot land between
//   two numbers — hounds (~10 points each) are the fine grain.
// * HP IS STILL A NO-OP FOR BERSERKER-KIND. Brute 210 -> 170 -> 140 moved level
//   9 solo by 1 point per step and level 5 by 1-2. The boss is the exception and
//   only because he carries shield + treads (his HP is level 10's main lever).
// * STAGGERING REALLY DOES SOFTEN. Level 9's first Shade at 0/12/15/25 s reads
//   35/39/53/72% solo. `at` is now doing real tuning work, not flavour.
// Also tried and rejected: making the BRUTE a `brawler` (Normal tier) — it does
// fix level 9 solo (35 -> 49%) but it takes level 5 to 99/99/99 and breaks the
// L4->L5 step, so the arrival time did the job instead. The `brawler` tier
// remains available and is the right tool the day a level needs a tank that is
// *dumber* rather than weaker.
//
// What HP does (still true, refined): for a BERSERKER-kind enemy at LOW gear,
// HP is nearly a no-op — it dies to the lava, not to damage. Against a
// late-campaign party it stops being free: they out-damage the lava, so the
// Golem's 380 (and lava treads, which is the same lever from the other side) is
// what makes level 8 a siege. For a STALKER-kind enemy HP is the whole fight at
// any gear: it never walks into the lava, so it has to be burned down.

export const TEAM = { PARTY: 'party', AI: 'ai' };

// The colour every campaign enemy wears (party members keep the normal
// per-seat palette, so "red-black = monster" reads at a glance).
export const ENEMY_COLOR = '#8b1a1a';

export const SCALE = {
  COUNT_PER_PLAYER: 1.2,  // +120% bodies per extra party member
  HP_PER_PLAYER: 0.85,    // +85% hp per extra party member (pacing, see above)
};

// ---- unit templates --------------------------------------------------------
// Each is a normal bot with tuned stats. `spells` bypasses the shop's minRound
// gate on purpose (that is how the finale gets "every upgrade").

const IMP = {           // dies to a single fireball — the chaff
  name: 'Imp', avatar: '👺', kind: 'grunt', maxHp: 6, sizeMult: 0.7,
  spells: { fireball: 1 },
};
const HOUND = {         // fast, aggressive, still fragile
  name: 'Hound', avatar: '🐺', kind: 'berserker', maxHp: 45, sizeMult: 0.8,
  spells: { fireball: 1, rush: 1 },
};
const CULTIST = {       // ranged chip damage from the back line
  name: 'Cultist', avatar: '🧟', kind: 'grunt', maxHp: 70, sizeMult: 0.95,
  spells: { fireball: 2, lightning: 1 },
};
const SHADE = {         // ★★★ skirmisher: dodges and blinks — but made of paper
  // Measured 2026-08-06: two ★★★ Shades at 90 hp WITH a shield wiped every
  // ★★ party at every size (the ★★★ > ★★ ladder is 100% in h2h — see
  // AGENTS.md). A ★★★ enemy's job here is to be hard to HIT, not hard to kill.
  // 2026-08-07: 40 -> 34. Shades are the ONLY unit the late campaign can price
  // in — imps, cultists and 45 hp hounds all read as 100% clears by level 8 —
  // so the whole back half is denominated in Shades, and one Shade has to be a
  // finer-grained unit of difficulty than it used to be.
  name: 'Shade', avatar: '👻', kind: 'stalker', maxHp: 34, sizeMult: 0.85,
  spells: { fireball: 1, teleport: 1 },
};
const BRUTE = {         // a wall you shove into the lava, not one you burn down
  name: 'Brute', avatar: '👹', kind: 'berserker', maxHp: 210, sizeMult: 1.5,
  spells: { fireball: 2, rush: 1 }, items: { cape: 1 },
};
// (There is deliberately no second ★★★ template. An early draft had a tankier
// "Warden" with a lightning finisher: enemy LIGHTNING is hitscan, so a solo
// player cannot dodge it and cannot out-trade it — it took the solo clear rate
// from 70% to 4% on its own. If you want a nastier skirmisher, add bodies, not
// hitscan.)
const GOLEM = {         // the Brute's big brother: a siege engine, not a skirmisher
  // A second tank template exists because level 5's Brute and level 8's tank
  // need different weight classes, and a wave can only scale a template's HP,
  // never override it. Measured 2026-08-07: at level-8 gear a 210 hp Brute is a
  // 97% clear — the tank has to start where the Brute's party-scaled HP ends.
  name: 'Golem', avatar: '🗿', kind: 'berserker', maxHp: 380, sizeMult: 1.6,
  spells: { fireball: 2, rush: 1 }, items: { cape: 1, treads: 1 },
};
const CHAMPION = {
  // The finale, and the answer to Remi's "3 against one very strong player who
  // has every upgrade". A ★★ BERSERKER on purpose, not a ★★★ stalker: a ★★★
  // with boots kites forever and simply cannot be cornered (measured 0% clear
  // at every party size — an unloseable enemy is not a boss, it's a wall).
  // No boomerang either: bots over-perform with it for reasons that have
  // nothing to do with the fight being good (AGENTS.md, "nothing dodges or
  // catches a boomerang").
  // 110 -> 130 (2026-08-07): with the hound bodyguard replaced by Shades the
  // boss himself had to carry more of the fight; his HP is the finest lever
  // level 10 has (every 7 hp is worth ~4 clear points at every party size).
  // 130 -> 115 (2026-08-07, item-cap repair): capping items at 3 levels took
  // most of the party's late-game power (they used to arrive here with 8-13
  // copies of everything) while Sargeras, a fixed template, lost almost nothing
  // — level 10 fell to 23/12/12 (1p/2p/3p, 200 attempts/cell, seed 7). His HP is
  // still the finest lever the level has. Swept at 200 attempts/cell WITH the
  // wave fix below already in place (so 130's 23/12/12 is the only cell measured
  // on the old waves):
  //   120 -> 28/34/29 · **115 -> 30/42/32** · 110 -> 30/47/35 · 105 -> 37/51/34
  // and confirmed at a second seed (115 -> 31/39/31). 115 keeps him the hardest
  // single fight in the campaign while leaving level 10 monotonically under
  // level 9 at every party size.
  name: 'Sargeras', avatar: '😈', kind: 'berserker', maxHp: 115, sizeMult: 1.8,
  spells: { fireball: 3, lightning: 3, teleport: 2, shield: 2, rush: 2, pillar: 2 },
  // One LEVEL of each, which is the faithful translation of the old "one copy
  // of each" — deliberately NOT lv 3. Raising the boss's GEAR was considered and
  // rejected in the 2026-08-07 repair: level 10 needed to get EASIER, not harder,
  // so the measured lever was his HP (above) and the size of his honour guard.
  // These stay at level 1; if a future pass needs him stronger, raise them and
  // re-measure — the sweep above is the template.
  items: { boots: 1, cape: 1, ring: 1, sword: 1, treads: 1 },
};

// ---- the 10 levels ---------------------------------------------------------
// `brief` is the "here is what is about to happen" the client shows on the
// countdown, before the party has to deal with it.

export const CAMPAIGN = [
  {
    n: 1, name: 'What lies ahead?',
    brief: 'A scouting party of imps. One fireball each — warm up, read the arena, find the lava.',
    waves: [{ count: 3, unit: IMP }],
  },
  {
    n: 2, name: 'Forward.',
    brief: 'Imps, and a cultist lobbing fire from the back. Kill the caster or eat the chip damage.',
    waves: [
      { count: 3, unit: IMP },
      { count: 1, unit: CULTIST, scale: 'hp' },
    ],
  },
  {
    n: 3, name: 'Locked in.',
    brief: 'A hound. It rushes you, it shoves, it never retreats. Keep your back to the middle.',
    waves: [
      { count: 1, unit: HOUND, perPlayer: 1.0 },
      { count: 2, unit: IMP },
      { count: 2, unit: IMP, at: 12 },
    ],
  },
  {
    n: 4, name: 'Too much?',
    brief: 'A tide in chains: imps and a cultist now, hounds at 14 s, a second pack at 24 s. Do not chase — hold the centre.',
    waves: [
      { count: 2, unit: IMP },
      { count: 1, unit: CULTIST, scale: 'hp' },
      { count: 1, unit: HOUND, at: 14, perPlayer: 1.0 },
      { count: 1, unit: HOUND, at: 24, perPlayer: 0.5 },
      { count: 2, unit: IMP, at: 26 },
    ],
  },
  {
    n: 5, name: 'Too late.',
    brief: 'A Brute. 210 HP of muscle you will not out-damage — shove it into the lava while the imps swarm you. Alone you get it to yourself; a duo also gets two hounds, a trio three.',
    waves: [
      { count: 1, unit: BRUTE, scale: 'hp' },
      { count: 2, unit: IMP },
      { count: 2, unit: IMP, at: 20 },
      // The escort is party-size-gated, not count-scaled: measured 2026-08-07,
      // a single extra hound takes the SOLO clear from 78% to 24% while two of
      // them barely dent a duo. Bodies are worth wildly less per player.
      { count: 2, unit: HOUND, minParty: 2, scale: 'none' },
      { count: 1, unit: HOUND, minParty: 3, scale: 'none' },
    ],
  },
  {
    n: 6, name: 'The price.',
    brief: 'A full hound pack, a cultist calling the shots, imps behind them. The pack grows AND toughens with the party — a bigger pack no longer trips over itself.',
    waves: [
      // 'both' on purpose: a pack that only grows in NUMBERS gets weaker per
      // extra player now that friendly fire is on — measured 2026-08-07, nine
      // 45 hp hounds cleared 98% at 3p because they shredded each other.
      // Splitting the scaling into count+hp keeps the pack lethal at size.
      { count: 3, unit: HOUND, scale: 'both', perPlayer: 1.2 },
      { count: 1, unit: CULTIST, scale: 'hp' },
      { count: 2, unit: IMP, at: 16 },
    ],
  },
  {
    n: 7, name: 'Still standing.',
    brief: 'Shades — one, then two more for every warlock who came, and a hound to herd a trio. They dodge, they blink, they will not stand still for you. Almost no chaff to hide behind: this one is pure aim.',
    // Deliberately near escort-free. Measured 2026-08-07: chaff around the
    // Shades makes the level swingy without making it harder (imps die to the
    // Shades' own fire now); the clean version reads 69/67/70 across party
    // sizes where the imp-and-hound-escorted one read 59/80/91.
    waves: [
      { count: 1, unit: SHADE, scale: 'none' },
      { count: 2, unit: SHADE, minParty: 2, scale: 'none' },
      { count: 2, unit: SHADE, minParty: 3, scale: 'none' },
      // A sixth Shade at 3p overshot (57% vs the 70% a hound lands on), and a
      // Shade is the coarsest unit in the game — one hound is the fine tuning.
      { count: 1, unit: HOUND, minParty: 3, scale: 'none' },
    ],
  },
  {
    n: 8, name: 'Of course.',
    brief: 'A Golem — 380 HP in lava treads, so the lava will not do your work for you — behind a hound pack that grows and toughens with the party. Imps at 16 s. The arena will be small by then.',
    waves: [
      { count: 1, unit: GOLEM, scale: 'hp' },
      { count: 2, unit: HOUND, scale: 'both', perPlayer: 1.8 },
      { count: 3, unit: IMP, at: 16 },
      // minParty 3 -> 2 (2026-08-07, item-cap repair). This pair of hounds was
      // the only thing separating the 2p fight from the 3p one, and with items
      // capped at 3 levels level 8 read 68/66*/57 with a star-shaped 2p outlier:
      // 85% at 2p against 75% at level 7, the one real non-monotonicity in the
      // curve. Handing the same pair to a duo lands 68/66/58 (seed 7), 64/65/57
      // (seed 23), 68/68/58 (seed 41) — flat, and back under level 7.
      // (GOLEM.maxHp was the obvious alternative and it is the wrong lever here:
      // it scales with 'hp', so 380 -> 440 fixed 2p but took 3p to 46% — below
      // level 9. Measured, 200 attempts/cell.)
      { count: 2, unit: HOUND, minParty: 2, scale: 'none' },
    ],
  },
  {
    n: 9, name: 'Endure.',
    brief: 'A Brute you cannot ignore and a Shade coven you cannot pin down — one of them holds back twelve seconds, and hounds arrive past 22 s to close the net. The coven grows with the party. Nothing here dies quickly. Combo, or be surrounded.',
    // ---- retuned 2026-08-07 (item-cap repair) --------------------------------
    // Items went from freely-stackable copies to a hard cap of 3 levels, so a
    // party that used to reach this level carrying 8-13 copies of every item now
    // carries 3 levels of each, while every enemy here is a fixed template that
    // owned exactly one copy and lost almost nothing. Level 9 collapsed from
    // 44/53/42 to 22/29/8 (1p/2p/3p, 200 attempts/cell, seed 7).
    // Diagnostics that decided the fix, all 200 attempts/cell at 1p:
    //   * DELETE the Shade and the level is a 100% clear. Delete the BRUTE and it
    //     is 87%. The ★★★ is the entire fight, exactly as AGENTS.md says.
    //   * BRUTE.maxHp is a NO-OP: 210 -> 170 -> 140 moved the solo clear 22 ->
    //     23 -> 24%, and level 5 by 1-2 points. It dies to the lava either way.
    //     Stripping its cape moved nothing (34% vs 35%).
    //   * The Shade's ARRIVAL TIME is the strong solo lever, because staggering
    //     softens: at 0 s -> 35%, at 12 s -> 39%, at 15 s -> 53%, at 25 s -> 72%.
    // Final shape at 200 attempts/cell: 39/46/44 (seed 7), 43/48/38 (seed 23),
    // 42/46/44 (seed 41) — mean 41/47/42 against the 44/53/42 it used to be.
    waves: [
      // Shades are counted out by hand per party size instead of scaled: the
      // step from three to four of them is worth ~30 clear points at 2p
      // (measured 2026-08-07), which no perPlayer value can land between.
      // The counts were 1/3/7 and are now 1/2/4: at 3p, seven Shades was an 8%
      // clear, five is 38%, four is 54% (before the extra hounds below).
      // `at: 12` on the first one is the fine lever the coven does not have —
      // one Shade held back is worth ~4 points to a party of any size, and ~17
      // to a solo player who otherwise fights it and the Brute simultaneously.
      { count: 1, unit: SHADE, at: 12, scale: 'none' },
      { count: 1, unit: SHADE, minParty: 2, scale: 'none' },
      { count: 2, unit: SHADE, minParty: 3, scale: 'none' },
      { count: 1, unit: BRUTE, scale: 'hp' },
      // minParty 2 (2026-08-07): a solo player fighting the Shade, the Brute AND
      // this hound cleared 22%; without the hound, 35%. It is the level's whole
      // solo budget, so it now belongs to parties only.
      { count: 1, unit: HOUND, at: 26, minParty: 2, scale: 'both', perPlayer: 0.6 },
      // 1 -> 2 (2026-08-07): the re-counted coven alone left 2p/3p at 58/57%,
      // and hounds are the fine grain a Shade cannot provide. With everything
      // else final, 2 -> 3 -> 4 hounds here reads 46/44 -> 41/40 -> 30/34 (2p/3p).
      { count: 2, unit: HOUND, at: 22, minParty: 2, scale: 'none' },
    ],
  },
  {
    n: 10, name: 'Liberation.',
    brief: 'Sargeras: one enemy carrying every upgrade a warlock can pilot, twice your size, and imps without end. He faces a lone warlock alone; bring friends and a pair of hounds is loosed at 20 s, with Shades at his shoulder for a full trio. Everything you have learned, at once.',
    // ---- retuned 2026-08-07 (item-cap repair) --------------------------------
    // 23/12/12 after the item cap (was 38/36/38). Two changes: CHAMPION.maxHp
    // 130 -> 115 (see the template, where the sweep lives) and the honour guard
    // re-counted below. Final: 30/42/32 (seed 7), 31/39/31 (seed 23).
    waves: [
      { count: 1, unit: CHAMPION, scale: 'hp' },
      // A hound PACK was the old bodyguard and it now dies to his own blasts
      // before it matters (measured 2026-08-07: five of them left the 3p clear
      // at 81%). Shades survive standing next to him, so the honour guard is
      // ghosts, and hounds ride along as the fine adjustment.
      // 2026-08-07: the Shades used to start at 2p (1 at 2p, 3 at 3p) and that
      // one Shade WAS the 2p fight — with the capped-item party it read 12-18%
      // at every boss HP down to 95 (a Shade is the coarsest unit in the game,
      // and here it is worth ~45 clear points). The guard is a 3p-only pair now,
      // and the duo is priced in hounds instead, which land in ~10-point steps:
      // at 2p, 1 hound -> 63%, 2 -> 47%, 3 -> 39%.
      { count: 2, unit: SHADE, minParty: 3, scale: 'none' },
      { count: 2, unit: HOUND, at: 20, minParty: 2, scale: 'none' },
      { count: 2, unit: IMP, at: 15 },
      { count: 2, unit: IMP, at: 30 },
    ],
  },
];

export const MAX_LEVEL = CAMPAIGN.length;

// Level descriptor for round n (clamped: past the last level the finale repeats).
export function levelFor(n) {
  const i = Math.min(Math.max(1, n | 0), CAMPAIGN.length) - 1;
  return CAMPAIGN[i];
}

// Expand a level into the flat list of units to spawn, applying the party
// scaling rule above. Returns [{at, name, avatar, kind, build, maxHp, spells,
// items, sizeMult}] — `at` is battle time in seconds (0 = at round start).
export function waveUnits(level, partySize) {
  const p = Math.max(1, partySize | 0);
  const out = [];
  for (const w of level.waves) {
    if (w.minParty && p < w.minParty) continue;
    const mode = w.scale || 'count';
    const cShare = mode === 'count' ? 1 : mode === 'both' ? 0.5 : 0;
    const hShare = mode === 'hp' ? 1 : mode === 'both' ? 0.5 : 0;
    const per = w.perPlayer != null ? w.perPlayer : SCALE.COUNT_PER_PLAYER;
    const count = Math.max(1, Math.round(
      (w.count || 1) * (1 + per * cShare * (p - 1))));
    const maxHp = Math.round(
      w.unit.maxHp * (1 + SCALE.HP_PER_PLAYER * hShare * (p - 1)));
    for (let i = 0; i < count; i++) {
      out.push({
        at: w.at || 0,
        name: w.unit.name, avatar: w.unit.avatar, kind: w.unit.kind,
        build: w.unit.build || null,
        maxHp, sizeMult: w.unit.sizeMult || 1,
        spells: { ...w.unit.spells },
        items: { ...(w.unit.items || {}) },
      });
    }
  }
  return out;
}

// One-line summary of what a level throws at a party of `partySize`, e.g.
// "4× Imp · 1× Cultist (120 hp) · +4× Imp @12s". Used by the client brief and
// by tools/coop.js.
export function levelRoster(level, partySize) {
  const units = waveUnits(level, partySize);
  const groups = [];
  for (const un of units) {
    const key = `${un.name}|${un.maxHp}|${un.at}`;
    const g = groups.find(x => x.key === key);
    if (g) g.n++;
    else groups.push({ key, n: 1, ...un });
  }
  return groups.map(g =>
    `${g.at ? '+' : ''}${g.n}× ${g.name} (${g.maxHp} hp)${g.at ? ` @${g.at}s` : ''}`
  ).join(' · ');
}

export { IMP, HOUND, CULTIST, SHADE, BRUTE, GOLEM, CHAMPION };
