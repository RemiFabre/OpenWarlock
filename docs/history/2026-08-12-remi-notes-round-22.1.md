# Notes for Remi (OpenWarlock & the open web MOBA)

*Round 22.1, 2026-08-12 (your feedback pass, shipped minutes before game
night). Round 22 is archived at
`docs/history/2026-08-12-remi-notes-round-22.md`.*

## Everything you asked, in place

- **First screen**: your exact "No server here, by design!" three-liner (no
  robot emoji), and the version row now just says "Choose the game version".
- **Avatars**: you join with a random avatar that nobody in the lobby wears
  (one face per warlock, server-enforced). Next to it, "Choose your avatar"
  opens the full roster: 56 options now (demons, beasts, elements, weapons,
  masks). Taken ones are greyed out. The old 12 still exist, so saved picks
  keep working.
- **Real toggles**: Playing|Watching, Rules Elemental|Classic, Draft On|Off,
  Testing On|Off. Both values visible, the active one lit. Hover texts kept.
- **Shop**: the browse button wears the golden statue now, and the hover-tip
  bug is fixed (a lobby-phase line was killing every tip 15 times a second
  while browsing. Real bug, good catch).
- **Trash Talk is on main.** I had it audited before merging, since you were
  worried about bloat: it is one 188-line client module (`client/chatter.js`)
  with three tiny seams in main.js, one bubble pass in render.js, and a
  4-line additive event field in sim.js. No wire shape change, no randomness
  in the sim, 12-bubble cap, its own 7 tests. It passed cleanly.
- **Your lost 5-star rating**: found and explained. You rated before the new
  relay was deployed, so the old relay dropped the POST (fire and forget).
  I seeded the server with it plus the pre-metric history (173 plays, 186
  player-rounds from the measured 55 rounds at 3.38 players/game). The
  picker now shows real numbers for the default version. New ratings land
  live.
- **The Faker whiff you saw** (hold connects, lightning misses): reopened
  issue #7 with your repro details and suspects. The issue agent already
  shipped a held-bolt fix as a new Faker version (serial 8) on its branch.
- **Em dashes**: being purged from the whole project's text as you read this
  (full stops and brackets instead), and the rule is saved so future agents
  never reintroduce them.

## For tonight

Hard-refresh every tab right before you start (the corner stamp should read
r311 or higher). Watch for: the Normal/Hard standoff feel, Trash Talk in real
play, and your friend's ms badge if anyone lags.

## Still waiting on you

The 21.9 leftovers (mine throwability, the two 21.7 sounds, 3v1 kill-target
cap, Switcheroo names), the standoff verdict, and whether the demo Faker
should return to fresh lobbies.
