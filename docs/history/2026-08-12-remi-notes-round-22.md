# Notes for Remi — OpenWarlock & the open web MOBA

*Round 22, 2026-08-12 — your full request list, all on main. Round 21.11 (the
RTC lag root-cause) is archived at
`docs/history/2026-08-12-remi-notes-round-21.11.md`. The interpreted spec I
worked from is `docs/BRIEF-round22.md` — check my ⚠ interpretation calls there.*

## Faker is on main

The community version merged in whole: a tier ABOVE Extreme with a real combo
brain (swap-hooks onto falling meteors, freeze-then-bolt, mine-then-swap), and
exactly its four combo arsenals — hookstorm, permafrost, minefield, galeforce —
selectable for it and for nobody else. It came with a **Runner** (stands still
until first hit, then flees, never casts), and I added the **Dummy** you asked
for: never moves, never casts, even under fire — pure combo practice. One call
you may want to reverse: the Faker version pre-seated a Faker in every fresh
lobby to demo itself; on main I turned that off — bots are added by choice.

## Bots got personalities per difficulty

Easy = Zug-Zug, Grubnub, Snotbog, Wobbla, Peon Pip. Normal = Grommash, Durotan,
Orgrim, Nazgrel, Broxigar. **Hard = the classic six you know.** Extreme =
Mannoroth, Tichondrius, Magtheridon, Mal'Ganis, Sargeras. Faker = Loki, Anansi,
Puck, Kitsune, Coyote. Runner/Dummy = Sandbag, Piñata, Bullseye, Tin Can,
Scarecrow. A lobby never repeats a name while one is unused; past five of a
tier it borrows from the others.

## Less point-blank oppression — ⚠ one number for you to feel out

Normal bots now hold a real gap (standoff 13 — the melee chase is gone); Hard
only refuses melee (its wounded-prey dive stops at 5 instead of face-camping);
Extreme and Faker are untouched. Bots still close in when the ring leaves no
room, and never back into lava. **The honest cost, measured twice:** Hard beats
Normal 66-69% now instead of ~98% — the ladder still orders cleanly
(Extreme>Hard and Normal>Easy both 100%), but the Hard-Normal gap is
compressed. If Hard now feels too tame or Normal too easy, the knob is the two
`standoff` numbers in `shared/constants.js` BOTS — say the word, don't let a
table decide.

## Fire Walk 👣 — your lava-immunity spell

Active self-buff, key **H**: zero lava damage for 3 s (lv1) / 5 s (lv2),
cooldown flat 15 s, price 10 g + 5 g. You still swim lava at double speed, so
it buys crossings and rim escapes, not a new home. A flame-gold ring shows on
anyone who has it running — chasing them into lava is an informed mistake. Icon
is footprints, not the burning boot: 🥾 was already Lava Treads. The Mine now
sits in the shop's Offense row.

## The screens

- **First screen**: name, Play, Host online, the version picker with equal
  billing ("official & community ideas"), one sentence about joining by link,
  and the idea pitch in one line with "(wait ≈ 1 hour)". Avatar picker, key
  panel and control hints moved to the lobby.
- **Lobby**: 📜 Rules fold holds the gold/team/win text; "press H — right-click
  to move" style controls line stays visible (live binding, never hardcoded);
  config is a quiet vertical stack (Playing/Spectating, Rules without emoji or
  violet, Draft, Testing); every bot row has its own ✕; **🗿 Shop** opens the
  real shelves for browsing (buying stays between rounds); avatars apply live;
  the idea pitch repeats at the bottom.
- **Dead-and-watching**: the standings band folds behind ▾ so you can watch.

## Ratings & per-version stats

Stars in the lobby's top right — everyone's average and count show in the
version picker, with hollow ☆☆☆☆☆ ? until someone rates. Next to it:
**player-rounds** (3 rounds × 5 players = 15; the ⓘ explains it on hover).
Honest limits: the counting starts today, and old pinned community versions
won't feed per-version numbers until each is republished (they run frozen
clients) — their plays DO count in the global 📊 panel, which always covered
all versions. Re-rating replaces your stars (remembered per browser); it's
trust-based, like everything in a friends lobby.

## Still waiting on you

The 21.9 leftovers (mine throwability, the two 21.7 sounds, 3v1 kill-target
cap, Switcheroo names) — plus, new: the Hard/Normal standoff feel after
tonight, and whether the demo-Faker should return to fresh lobbies.
