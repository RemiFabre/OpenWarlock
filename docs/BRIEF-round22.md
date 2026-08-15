# BRIEF, round 22: Remi's 2026-08-12 request list

*STATUS: executed 2026-08-12, all 18 items on main (REMI_NOTES round 22 is the
outcome report). Kept as the interpretation record.*

*Transcribed from voice (2026-08-12, after the 21.11 netcode round) and
interpreted; ⚠ marks an interpretation Remi has not confirmed. Everything
targets the MAIN version. Execution order is the agent's choice; keep main
green (session tonight) and the repo lean (CONTEXT POLICY in AGENTS.md).*

## A. Bots & sim

1. **Faker difficulty on main.** Port the `issue-7-faker` bot level into the
   main game. Its selectable strategies must be ONLY the combo builds designed
   for it. ⚠ interpret: the difficulty appears in the normal bot picker; its
   build dropdown is restricted to those builds.
2. **Per-difficulty bot name pools.** Each difficulty gets its own ~5 names so
   switching difficulty feels like meeting new bots. The CURRENT names
   (Gul'dan, Kil'jaeden, …) become the **Hard** pool. Invent the others. When a
   lobby needs more names than the pool has, borrow from other pools.
3. **New "immobile" difficulty** for combo training. ⚠ interpret: a training
   dummy (never moves, never casts); joins/spawns like any bot.
4. **Less point-blank oppression.** Bots chase into melee range where humans
   have zero reaction-time counterplay, and the kill leader gets bombarded.
   Remove that from **Normal** (keep distance), reduce its frequency on
   **Hard**; **Extreme keeps it**. Getting close stays legal when space runs
   out or occasionally; the target is the *relentless* point-blank chase.
5. **Lava-immunity spell.** Active cast: immune to lava damage 3 s (lv1) /
   5 s (lv2), cooldown 15 s flat. Price ⚠ 10 g lv1, 5 g lv2 (Remi said "10
   gold … maybe just two levels"; [10,5] matches Blink/Mine). Needs a VISIBLE
   active-effect indicator. Name: agent proposes (Remi liked "burning boots"
   as the emoji idea, e.g. 🥾). 
6. **Mine moves to the offense section** of the shop.

## B. Lobby screen

7. **Per-row bot remove.** Replace the single "remove last bot" button with a
   remove button on each bot's row.
8. **Config row rework.** "I'm ready" stays big/orange. The rest are config,
   displayed differently, aligned vertically: playing → a playing/spectating
   toggle; rules → a visible ruleset choice without the emoji and violet
   color; draft/testing → on/off toggles. Keep the hover explanations.
9. **Wall of text → collapsible "Rules".** The explanatory text (gold, win
   condition, …) moves into a collapsible section titled "Rules"
   (⚠ placement: right below the "gathering" header). Collapsed by default.
10. **Always-visible controls hint** (not collapsible, near the rules): "press
    <current fireball binding> to throw your fireball, right click to move".
    Read the LIVE binding (owKeys), never hardcode Q.
11. **Explore-the-shop button.** A visible "Shop" button that opens the shop
    browse screen directly (today: testing → bot → ready dance). The old path
    stays. Put the golden NOPE statue (gold-tinted 🗿) on the button.
12. **Rate-this-version widget, top right** (see D15).

## C. First screen

13. **Declutter.** Show: name + the two actions (Play vs bots / Host online)
    + the version selector (BIGGER, more visible; full version vs community
    versions is a headline feature) + a discreet sentence: to join someone's
    game the host must send you a link (private hosting only, no servers,
    everything distributed). REMOVE from this screen: avatar/emoji picker
    (moves to the next screen), right-click-move hint and key letters, the
    key-binding panel.
14. **Idea box.** Keep at bottom of first screen, ALSO show on the second
    screen. Reword to one line: "Have an idea to improve the game? An AI agent
    will create a version in your name" + something like "(wait ≈ 1 hour)".

## D. Versions, stats, ratings

15. **Star ratings.** Rating happens in the lobby (top right); aggregates
    (average + count) display in the version picker. No rating yet = five
    hollow stars with a "?" (common iconography). Backend: the relay, like
    usage stats. ⚠ dedupe kept simple (localStorage remembers what you rated).
16. **Per-version play stats in the picker**: rating avg + count, and
    **player-rounds** = rounds played × players in them (5 players × 3 rounds
    = 15). If round data doesn't exist, fall back to games × players and say
    so. A "?" hover in the corner explains the metric in one short sentence.
17. **Usage stats must cover ALL versions**: playing any community version
    should count in the 📊 panel. Verify; fix if not.

## E. Misc

18. **Death panel collapsible.** The mid-battle scoreboard shown while dead
    can be collapsed to watch the fight, and reopened.

## Ground rules for whoever executes

- Lean code is the top priority (AGENTS.md CONTEXT POLICY). Subagents get
  one-commit-sized briefs and their diffs get reviewed.
- Full verification ritual before any "done"; screenshot UI changes
  (tools/shot.js); a feature that renders wrong reads as broken.
- Bot-behavior changes (item 4) are balance-sensitive: check the difficulty
  ladder still orders (tools/h2h.js) and flag feel questions for Remi rather
  than tuning around bots.
