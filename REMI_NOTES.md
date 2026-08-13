# Notes for Remi — OpenWarlock & the open web MOBA

*Round 23, 2026-08-13 (your voice list: polish, balance, two issue ports, the
lobby rework, the Faker+anger run). Rounds 22.2-22.4 are archived at
`docs/history/2026-08-13-remi-notes-rounds-22.2-22.4.md`.*

## The quick polish

- **Stats panel**: "games finished" is still counted by the relay, just not
  displayed. The footer sentence stays.
- **Tab scoreboard**: the backing rectangle is gone; the full-screen dim alone
  carries readability.
- **Shop key chips**: the row 1/2 vs row 3 difference was an accident. The
  sideways OFFENSE/DEFENSE/SPECIAL label stretched each row by a per-word
  amount and the chip was anchored to the stretched wrapper. Now every chip
  deliberately overhangs the card edge by the same 6 px on all three rows.

## Balance (one knob each, both one-line revertible)

- **Lava 14 → 16 DPS** (+~15%), `LAVA.DPS`.
- **Lava Treads 25/50/65% → 25/40/50%** resist, the cape's exact curve
  (`ITEM_FX.treads`).

## Boomerang dodge: the premise was stale

Extreme and Faker already dodge boomerangs, both legs, recall included:
`scanThreats` never filtered by projectile type. Two new tests lock that in,
and the false claim in STRATEGIES.md is corrected. What remains true: Hard
bots (the ELO lab's pilots) sidestep NOTHING by design, so boomerang rows in
the Elo table stay bot-flattered. Per your own rule that is a flag, not a
number to buff around.

## Faker + anger: rank 1 of 42

`K5-faker-vendetta` (Faker brain on B3's exact 152 g list: anger 3 first,
amulet+sword to 3, boots 2, cape 1) lands **Elo 2783, mean place 1.07**,
+101 over the best combo arsenal (K2 2682) and ~+1200 over the same list on
the Hard brain. It carries zero combo spells, so the tier's edge is the
piloting, not the combos. No bot chases the anger mark, so 2783 is a floor.
Standard 2000-game run, raw numbers, single seed (~±40 noise between
neighbours): `docs/history/2026-08-13-round23-elo-faker-anger.md`.
The element-vs-element study is DELETED (code and convention); elo.js at
2000 games is the one ranking instrument now.

## Two versions merged into main

- **Blood Debt 🩶** (issue #1, closed): Defense row, 2 levels 12/6 g, cd
  15/12 s, absorb everything for 1.25 s, carry it as gray health, transfer it
  all with your next fireball hit within 5 s or eat it push-less. The boots
  buff from that version stayed out (it was a test).
- **Genki 💠** (issue #12, closed), with your redesign: cast anything while
  charging; a real hit still breaks the charge but is AMPLIFIED by the stored
  damage (lethal amplify = attacker's kill), ticks still exempt; 3 levels
  capping damage at 30/60/90 (12/6/6 g); 3 dmg/s; 30% bigger at every charge;
  at the cap the ball floats until you recast. Pillar-smash (~4 s) and
  unstoppable (~9 s) stages are reachable at every level. Default key K.

## Lobby: the host owns the room (and avatars chat less)

Rules, bots, kicks and unban now belong to the HOST (oldest seated
connection; auto-promoted if they drop). Guests keep Playing/Watching, their
avatar and their own team, and see every rule read-only with a hint line.
Avatar reactions: every line is half as likely (`FREQ` in chatter.js), all
bubbles render in one plain style (the bold shout variant is gone), and the
lobby has a host-set **Reactions On/Off** toggle.

## Issue housekeeping

#1, #7, #12 closed (merged); Ju's #3/#9/#11 closed, #13 stays open as his
living thread. Closing now belongs to whoever opened the issue; the agent
only labels `ai:done`.

## Verified

494 vitest green + full ritual (bots/coop harness, client robustness,
reconnect, arena 4p/8p, slowlink after the wire change). Version r369.

## Still waiting on you

The 21.9 leftovers (mine throwability, the two 21.7 sounds, 3v1 kill-target
cap, Switcheroo names), the Normal/Hard standoff verdict, whether the demo
Faker returns to fresh lobbies, and a feel pass on lava 16 + the treads nerf.
