# Archetype strategies — draft for Remi to iterate on (2026-08-09)

Edit freely: rename, reorder buys, cross out, add. When you're happy, tell me
which ones to wire in — each becomes a lobby-selectable bot build (if bots can
pilot it) and/or a strategy-study entry (measured in 4-seat mirrors).

Format per entry: the fantasy in one line, the exact opening buy order (after
that the bot falls into the shared everything-else tail), what the archetype
TESTS, and whether bots can pilot it today.

**Bot-pilotable** means every spell in the list has bot piloting (fireball,
lightning, boomerang, rush, shield, blink, meteor-into-CC). Bomb, Switcheroo,
vanish, pillar, wall, repulse = human-only for now.

---

## 1. Chainer 🧊⚡ (ALREADY LIVE — the reference)
- Fantasy: freeze, bolt, shove into lava, repeat.
- Order: fireball → frost → lightning → gale → mosquito → round-robin those four.
- Tests: CC-window combos; the frost lv2/lv3 threshold in human hands.
- Bots: YES (shipped).

## 2. Warlord 🔥🗡️
- Fantasy: no tricks, bigger numbers — win every straight trade.
- Order: fireball → ember → ember → sword → amulet → ember → sword → amulet.
- Tests: is ember's monster win rate real in human play, and is sword's
  mandatory-ness (question L) felt or only structural?
- Bots: YES.

## 3. Executioner 🔴👟
- Fantasy: the mark appears, someone dies. Build entirely around claiming.
- Order: fireball → anger → boots → anger → ghost → anger → boots → ghost.
- Tests: anger's real human claim rate when you BUILD for the chase (the bot
  mirror can't price this — question K's missing half).
- Bots: YES.

## 4. Tycoon 🪙🦟
- Fantasy: every hit pays; the amplifier doubles the payroll. Rich by round 6,
  full build by round 10.
- Order: fireball → midas → mosquito → midas → hourglass → midas → mosquito → mosquito.
- Tests: mosquito-as-gold-amp (measured at exactly baseline on bots — the one
  mosquito pairing that works there); midas's real value with shopping depth
  (question E).
- Bots: YES.

## 5. Leech 🧛🦟
- Fantasy: every 5th ball is a feast — and the trap volley advances the
  counter, so feasts come fast.
- Order: fireball → vampire → vampire → mosquito → sword → vampire → mosquito → amulet.
- Tests: the new vampire×mosquito cast-counting ruling; sustain stacking
  (lifesteal + engorged heals).
- Bots: YES.

## 6. Plaguebearer 🦠🪨
- Fantasy: wade into the pack, everyone leaves sick.
- Order: fireball → malady → terra → malady → treads → malady → terra → amulet.
- Tests: contagion in real crowded fights (the bot lab is blind to it —
  bots never cluster); whether aura 8/12/16 feels right.
- Bots: YES.

## 7. Sumo 🌪️🧣
- Fantasy: never mind damage — you fly, I don't.
- Order: fireball → gale → cape → gale → boots → gale → cape → treads.
- Tests: the gale buff and cape buff head-on (the knockback war both changed
  today); lava-share economics.
- Bots: YES.

## 8. Stormcaller ⚡🔮
- Fantasy: the kit never stops — bolt on cooldown, refund on every hit.
- Order: fireball → lightning → arcane → arcane → arcane → hourglass → lightning → hourglass.
- Tests: question M — is a dedicated cadence build viable-but-honest now?
- Bots: YES.

## 9. Phantom 👻🔥
- Fantasy: one line, three victims, then gone.
- Order: fireball → ghost → ember → ghost → ghost (lv3 pierce) → ember → vanish → ember.
- Tests: pierce value in human aim; the vanish reveal-on-cast rule under
  pressure.
- Bots: mostly (vanish is uncast by bots — they'll bank it; fine as a build,
  the study entry should skip vanish).

## 10. Meteorologist 🧊☄️
- Fantasy: the 2-second stun is a landing pad.
- Order: fireball → frost → frost → frost (lv3 stun) → meteor → terra → amulet → meteor.
- Tests: the measured lv3-stun→meteor true combo, in human hands; whether
  meteor earns its price over lightning (bots said no, 6.8 vs 11.8).
- Bots: YES (meteor is CC-gated piloted now).

## 11. Trickster 🎭🗿 (human-only)
- Fantasy: you were winning, then you were in the lava and I was on your spot.
- Order: fireball → Switcheroo → treads → pillar → Switcheroo → vanish → boots → Switcheroo.
- Tests: the Switcheroo stun combo window; treads-powered lava play;
  portal routes as escape lanes.

## 12. Bomber 💣🪨 (human-only)
- Fantasy: zone control — you don't get to stand anywhere.
- Order: fireball → Bomb → terra → Bomb → hourglass → Bomb → ember → amulet.
- Tests: Bomb's numbers (first real read — no bot can price it); whether
  fuse-dodging feels fair at 0.5 s.

## 13. Juggernaut ❤️🧣 (the defense-first probe)
- Fantasy: outlive everyone, let the ring do the killing.
- Order: fireball → amulet → cape → treads → amulet → sword → cape → amulet.
- Tests: question H — the offense-first meta. If this feels hopeless in human
  games too, the meta question is answered for real.
- Bots: YES.

## 14. Portal Rat 👟🌀 (human-only)
- Fantasy: the lava is a highway and the portals are exits.
- Order: fireball → boots → treads → boots → vanish → treads → Switcheroo.
- Tests: the whole lava/portal economy after the treads nerf — is the
  swim-away playstyle still alive at −25/−50/−65%?

---

Iteration notes for me (leave your marks anywhere): which to wire in, renames,
order changes, new ideas. Wired-in builds show up in the lobby dropdown with
their fantasy line, and the pilotable ones get measured in the study mirror.
