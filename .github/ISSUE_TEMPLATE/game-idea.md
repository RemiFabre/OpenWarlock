---
name: Game idea
about: Ask the AI agent to create an experimental version
title: ''
labels: enhancement, ai:queued
assignees: ''
---

<!--
This template is in English, but you can use your own language and it should work.
Iterating on a version you already got? Write the follow-up in your original issue instead, no new issue needed.
Be as descriptive as possible. If you are vague, the AI agent will fill the gaps; sometimes that works well, sometimes it does not.
-->

## What would you like to change?

<!--
Example of a good request:

I'd like to add a defensive spell like Shield, but instead of reflecting projectiles, it absorbs them. All damage received while the spell is active is stored as "gray health" on my health bar. I take that damage after 5 seconds, with no pushback, unless I hit someone with my fireball first; then they receive all my stored damage instead. High risk, high reward. Find a creative name and icon, and use the same cost and cooldown as Shield.


=== Adding a new spell, item or element? ===

First, go and look at what already exists: open the game, click Shop in the
lobby (you can browse it without starting a game), and hover any card. The
tooltip shows that spell's full table, one row per effect and one column per
level. That is exactly the shape below, so it is the fastest way to see what a
sensible number looks like and to avoid asking for something already in there.
  https://remifabre.github.io/OpenWarlock/client/

Spells, items and elements are all the same shape: a name, a price, a number
of levels, and some effects that change per level. One line per effect, and
" / " separates the levels. Copy one of these and add or delete lines as you
need. Anything you leave out, the agent fills in using the game's conventions,
so a short sheet is a perfectly good request.

A small one (this is the real Lava Treads):

Name: Lava Treads
Type: item
Levels: 3
Cost: 5 gold per level
Lava damage taken: -25% / -40% / -50%

A big one (this is the real Frost, and note how a line can be blank at a
level: at level 3 the slow stops and a freeze replaces it):

Name: Frost
Type: element
Levels: 3
Cost: 10 / 8 / 8 gold
What it does: hits stack frost. The 3rd stack slows the victim, or freezes them solid at level 3.
Stacks needed to trigger: 3 (does not change per level)
Victim speed: -30% / -50% / frozen
Slow lasts: 3 s / 3 s / -
Stun lasts: - / - / 2 s

You can also just describe it and let the agent price it, because the game is
regular about costs. Spells start at 8, 10 or 12 gold and every later level is
half of that; the fireball's mutations are 10 then 8 then 8; items charge one
flat price per level (5, 6 or 7 gold). So this is already enough to build:

Name: something icy
Type: spell
It freezes everyone in a small area around me for a moment. A bit more
expensive than Shield. Pick the numbers so it is strong but not a stun-lock,
and choose a good name and icon.
-->
(write here)
