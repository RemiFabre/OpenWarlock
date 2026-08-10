# Notes for Remi — OpenWarlock & the open web MOBA

*Round 21.7, 2026-08-10. Your post-playtest list, applied. Rounds 21.0-21.6 (the
overnight rulings, Statue, the brazier, Decoy, the ELO re-run) are archived at
`docs/history/2026-08-10-remi-notes-round-21.md`.*

## Decoy wasn't broken — its key was stolen. So were NOPE's.

This is the whole bug, and it explains both of your reports at once.

Your saved keys are AZERTY, so your client has **fireball on A** and
**lightning on Z**. Statue and Decoy shipped later with the QWERTY defaults
**A** and **Z**, and the key→spell lookup returns the *first* match, so:

- pressing **A** cast your fireball, never Statue;
- pressing **Z** tried to cast Lightning — which you don't own — so **nothing
  happened at all**. That is the "decoy doesn't work".

Decoy itself is fine: I bought it in a real browser, pressed its key, and the
clone stepped out (screenshotted, cooldown ticking).

**The fix is at load time, so it can never happen again.** Your own saved
bindings always win; any spell whose default collides takes the first free key
from *its QWERTY default → its AZERTY default → the rest of the alphabet*. On
your machine that lands **NOPE on Q and Decoy on W** — exactly the AZERTY
positions they were meant to have. Nothing you bound by hand moved.

## The key menu does what you asked

One rule now, in both the shop chip popup and the Keys panel: **Esc or a click
outside cancels; any other key just works.** If that key belonged to another
spell, the two **swap** and a toast says which is where now. The old "you own
that spell, so I refuse" rule is gone — it refused silently and taught you
nothing.

## Right-click never opens the browser menu again

It was only suppressed on the game canvas, which is why it popped over the
lobby, the shop and the dead-and-waiting screen — where a misclick on Reload
costs you the game. It is off for the whole page now. Text fields (your name,
the room code) keep their menu so copy/paste still works.

## Icons, names, rows

- **Stone Pillar has its 🗿 back**, and **NOPE** (ex-Statue) wears **the same
  moai in gold**. Grey stone / gold stone, everywhere an icon appears —
  one CSS filter, one line to revert.
- **Stone Pillar moved to the Special row** (it is terrain you leave behind,
  not a save).
- **Coal Brazier → Hat of Aura 🎩.** 🔥 belongs to Ember, so the hat is the icon.
- **Echo is 🫧** — the closest thing to a drop's ripple that exists as an emoji.
  Alternates if you want them: 💧, 🌊 (🌀 is already Blink's).

## Two new sounds

- **Anger: your own low "ouu"** — fires the moment YOU bank a stack (your
  fireball hits the red mark and +0.5 damage becomes permanent; my reading of
  "when the user gains a stack" — not when the mark appears). A sine bending up an octave with a
  quiet fifth over it and a sub under it, ~0.3 s. It used to reuse the kill
  jingle, which is why it never felt like *yours*. I wrote two alternates and
  shipped the one I like best; to hear the others, open the console and run
  `__sfx('angerBell')` (brighter, trophy-ish) or `__sfx('angerDeep')` (slower,
  a growl that lands). Say which and it's a one-word change.
- **NOPE: a clean two-partial ding** — high, short, and the only pure bell in
  the mix, so "someone just went untouchable" reads without looking.

⚠ I can't hear them; they are designed, not auditioned. If either is wrong,
tell me what's wrong (too high / too long / too soft) and I'll move it.

## Numbers, exactly as you dictated

| thing | was | now |
|---|---|---|
| Hat of Aura (ex-brazier) | 7 g, ring 3 / 3.8 / 4.6 | **6 g**, ring **5 / 6 / 7** |
| Cape of the Magi | −15 / −26 / −35% knockback | **−25 / −40 / −50%** |
| Ember | 6 / 5 / 5 | **5 / 5 / 7** |
| Terra | 6 / 5 / 5 | **6 / 6 / 7** |
| Gale | 10 / 8 / 8 | **6 / 6 / 6** |
| Arcane | 6 / 5 / 12 | **6 / 6 / 10** |
| Ghost | 6 / 5 / 10 | **6 / 6 / 10** |
| Gale's gust (every 3rd hit) | +30 / 60 / 90 push | **+25 / 50 / 75** |

Gale went from 26 g to 18 g for all three levels, so I cut the gust with the
discount as you asked. Everything above is a one-line revert.

**Arcane's hover text now says it**: "every fireball hit refunds 1 s of your
other cooldowns — **never the fireball's own**." (That exclusion has always
been in the code — a self-refund measured a 66-74% auto-win, twice.)

The Hat's ring is a real threat radius now: **lv1 equals a lv1 Malady aura**,
and even maxed it stays inside a maxed plague. The old "it must be half a
plague" sizing was my rule, not yours, so it's gone — the test that enforced it
now enforces the new relation instead.

## The README

Short now, and the **play link is the first thing on the page**, right under the
title. Then what the game is, how to play, how to host, and where the code
lives — everything else moved out.

## What I verified

376 unit tests, both harness scenarios, the 2-engine browser test (chromium +
webkit), the reconnect test, and 60-game bot smokes at 4 and 8 seats — all
green, no page errors. Plus a real browser session with **your** saved AZERTY
bindings: no duplicate keys, NOPE on Q, Decoy on W, and the clone rendering.

⚠ **None of the new numbers are measured.** The ELO baseline predates them, and
gale/cape are exactly the two things bots price worst (they never bait a gust,
and the cape's value flips sign by pilot). Your read is the instrument here.

## Still waiting on you

The two sounds; whether a 3v1 team's kill target should be capped by how many
enemies exist; Echo pair feel; anger's strength; sword-by-structure; whether the
chronomancer CDR family is where you want it; and names for Bomb 💣 and
Switcheroo 🎭 (both still placeholders).
