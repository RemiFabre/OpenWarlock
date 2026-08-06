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
// CHAFF scales at the default rate; a wave of real threats must scale SLOWER
// (perPlayer ~0.5) or the level explodes: measured 2026-08-06, seven hounds
// beat every party size while three are a fair fight for one player.
// Their spells, items and AI tier never scale: those are the level's signature
// and stay identical at 1, 2 or 3 players.
//
// What HP actually does (measured 2026-08-06 with tools/coop.js, and it is not
// obvious): for a BERSERKER-kind enemy, HP is nearly a no-op — it dies to the
// lava, not to damage, so a Brute at 210 and a Brute at 546 clear at the same
// rate and the fight just lasts longer. For a STALKER-kind enemy, HP is the
// whole fight: it never walks into the lava, so it has to be burned down, and
// the same Warden went from a 70% clear at 55 hp to 2% at 90 hp. Rule of
// thumb: scale tanks by HP for pacing, keep skirmishers cheap to kill.
//
// Why the scaling is superlinear (COUNT_PER_PLAYER > 1): a party only wipes
// when EVERY member is down, so three players are far more than three times as
// durable as one. Flat clear rates across party sizes need >1x bodies per
// extra player.

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
  name: 'Shade', avatar: '👻', kind: 'stalker', maxHp: 40, sizeMult: 0.85,
  spells: { fireball: 1, teleport: 1 },
};
const BRUTE = {         // a wall you shove into the lava, not one you burn down
  name: 'Brute', avatar: '👹', kind: 'berserker', maxHp: 210, sizeMult: 1.5,
  spells: { fireball: 2, rush: 1 }, items: ['cape'],
};
// (There is deliberately no second ★★★ template. An early draft had a tankier
// "Warden" with a lightning finisher: enemy LIGHTNING is hitscan, so a solo
// player cannot dodge it and cannot out-trade it — it took the solo clear rate
// from 70% to 4% on its own. If you want a nastier skirmisher, add bodies, not
// hitscan.)
const CHAMPION = {
  // The finale, and the answer to Remi's "3 against one very strong player who
  // has every upgrade". A ★★ BERSERKER on purpose, not a ★★★ stalker: a ★★★
  // with boots kites forever and simply cannot be cornered (measured 0% clear
  // at every party size — an unloseable enemy is not a boss, it's a wall).
  // No boomerang either: bots over-perform with it for reasons that have
  // nothing to do with the fight being good (AGENTS.md, "nothing dodges or
  // catches a boomerang").
  name: 'Sargeras', avatar: '😈', kind: 'berserker', maxHp: 110, sizeMult: 1.8,
  spells: { fireball: 3, lightning: 3, teleport: 2, shield: 2, rush: 2, pillar: 2 },
  items: ['boots', 'cape', 'ring', 'sword', 'treads'],
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
    brief: 'A tide in chains: imps and a cultist now, hounds at 14 s, more imps at 26 s. Do not chase — hold the centre.',
    waves: [
      { count: 2, unit: IMP },
      { count: 1, unit: CULTIST, scale: 'hp' },
      { count: 1, unit: HOUND, at: 14, perPlayer: 1.0 },
      { count: 2, unit: IMP, at: 26 },
    ],
  },
  {
    n: 5, name: 'Too late.',
    brief: 'A Brute. 210 HP of muscle you will not out-damage — shove it into the lava while the imps swarm you.',
    waves: [
      { count: 1, unit: BRUTE, scale: 'hp' },
      { count: 2, unit: IMP },
      { count: 2, unit: IMP, at: 20 },
    ],
  },
  {
    n: 6, name: 'The price.',
    brief: 'A hound pack, a cultist calling the shots, and imps behind them. No single target to blame — pick one and commit.',
    waves: [
      { count: 2, unit: HOUND, perPlayer: 1.0 },
      { count: 1, unit: CULTIST, scale: 'hp' },
      { count: 2, unit: IMP, at: 16 },
    ],
  },
  {
    n: 7, name: 'Still standing.',
    brief: 'A Shade. It dodges, it blinks, it will not stand still for you — bait the dodge for your partner, and mind the imps.',
    waves: [
      { count: 1, unit: SHADE, perPlayer: 1.0 },
      { count: 1, unit: HOUND, minParty: 2, perPlayer: 1.0 },
      { count: 2, unit: IMP, at: 18, minParty: 2 },
    ],
  },
  {
    n: 8, name: 'Of course.',
    brief: 'A Brute AND a hound pack, with imps rolling in on a timer. The arena will be small by then.',
    waves: [
      { count: 1, unit: BRUTE, scale: 'hp' },
      { count: 1, unit: HOUND, perPlayer: 1.0 },
      { count: 1, unit: HOUND, minParty: 2, perPlayer: 1.0 },
      { count: 3, unit: IMP, at: 16 },
      { count: 2, unit: IMP, at: 30 },
    ],
  },
  {
    n: 9, name: 'Endure.',
    brief: 'A Shade and a Brute together, escorted, reinforced. Nothing here dies quickly. Combo, or be surrounded.',
    waves: [
      { count: 1, unit: SHADE, perPlayer: 0.5 },
      { count: 1, unit: HOUND, perPlayer: 0.5 },
      { count: 2, unit: IMP, perPlayer: 0 },
      { count: 1, unit: BRUTE, scale: 'hp', minParty: 2 },
      { count: 1, unit: HOUND, minParty: 3, scale: 'none' },
      { count: 2, unit: IMP, at: 20, minParty: 3 },
    ],
  },
  {
    n: 10, name: 'Liberation.',
    brief: 'Sargeras: one enemy carrying every upgrade a warlock can pilot, twice your size, with a bodyguard and imps without end. Everything you have learned, at once.',
    waves: [
      { count: 1, unit: CHAMPION, scale: 'hp' },
      { count: 1, unit: HOUND, minParty: 2, perPlayer: 1.8 },
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
        items: [...(w.unit.items || [])],
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

export { IMP, HOUND, CULTIST, SHADE, BRUTE, CHAMPION };
