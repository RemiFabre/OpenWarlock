# The midas gold probe: why the midas/anger gap is wide with the same mechanic (2026-08-14)

Remi's question after the 24.1 elo table: midas and anger share the hunt
mechanic and ~equal per-claim pricing (2 g vs 0.5 dmg at ember's ~4 g/dmg),
so why does D3-tycoon sit ~400 Elo under B3?

Instrument: a throwaway clone of tools/pair.js (300 games per run,
D3-tycoon and B3-mutation-depth at 2 seats each, Hard bots, same lobbies).
Columns are per seat per game; "levels" = summed owned levels at game over
(the full item shelf is 24). "old midas" = the same probe run against
commit ad9d54e (the pre-rework plant-then-cash midas with the dmg malus).

| run | gold earned | claims | item lv | elem lv | spell lv | place / win% |
|---|---|---|---|---|---|---|
| old midas D3 | 296.5 | (volume-farmed) | 23.5 | 15.4 | 3.9 | 2.47 / 32% |
| new midas D3 (24.1 cadence) | 180.5 | 21.4 x 2 g | 17.6 | 6.2 | 1.8 | 3.46 / 0% |
| new midas D3 (24.2 cadence [20,15,11]) | 199.6 | 30.4 x 2 g | 19.3 | 6.7 | 2.5 | 3.44 / 0% |
| anger B3 (baseline) | ~156 | ~24 claims = +12 dmg | 18.9 | 3.5 | 1.1 | 1.54 / 50% |

Findings:
1. Bots ALWAYS spend their gold (both shopping paths; the 14-21 g left at
   game end is only the final round's income arriving after the last shop).
2. The gold-to-Elo slope is SHALLOW by design: old midas earned +125 g/game,
   bought nearly the whole shop, and still only reached par against anger.
   Marginal gold buys breadth, and breadth rows are the measured bottom of
   the elo table (B2/B4/B6: 1280-1360). The anti-snowball economy working.
3. Anger's identical nominal value lands as concentrated DEPTH (+~12 dmg on
   every one of ~170 balls/game, uncapped, no shop friction).
4. The mark-chasing hunt bias is innocent: HUNT_MARK 0 vs 40 moved D3's
   place 3.46 -> 3.42 (claims land incidentally in brawls).
5. D3's shell is stale for new midas (mosquito/hourglass amplified per-HIT
   midas, they do nothing for a timed hunt): the row underprices the element.

What the instrument cannot see: humans keep range (fewer incidental claims)
but never run out of gold sinks (pillars and mines are unlimited), and gold
buys TEMPO early. The table's midas verdict is a bot floor on conversion
value and a bot ceiling on claim count at once; only live play arbitrates.

Cadence follow-ups the same day: markEvery [20,15,11] (24.2) lifted
D3-tycoon 1199 -> 1307/1334 in the standard elo. Levers if still weak live:
goldOnClaim 2 -> 3 (cadence-capped, cannot re-create the volume farm).
