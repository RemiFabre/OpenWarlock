# Community-driven versions: analysis before we build it

*Analysis of Remi's vision, 2026-08-07. Read [NAMING.md](NAMING.md) first for
the LICENSE prerequisite. No code written yet — this is the design argument.*

## The vision, restated

Software evolves at the speed of one expert team listening late to its
community. Replace that: the community itself proposes changes in natural
language, agents implement them, **every request becomes its own playable
version**, players pick a version at launch and rate it, and the data — not a
designer's taste — decides what the default becomes. Two intake paths:

- **Path A (technical):** GitHub PR, reviewed by you or an agent.
- **Path B (everyone else):** a chat box in the game. An agent on your PC reads
  requests and implements them.

You identified the merge problem yourself and answered it with "don't merge —
fork". That instinct is right. The question is *what a fork is made of*, and
that single choice decides whether this works or collapses.

## The pivotal decision: what is a "version"?

### Option A — a version is a git branch (fork the codebase)

Unlimited power: engine changes, collisions, rendering, anything.

But: **hundreds of live branches is hundreds of maintenance liabilities.** Every
crash fix, every security fix, must be backported N times or the old versions
rot. Nothing is cross-compatible. Your "Warlock 2 harvests the best ideas" step
becomes a manual merge of hundreds of divergent trees — the exact work you were
trying to avoid, just deferred six months and multiplied. And auto-merging a PR
that adds a branch means **auto-accepting code you will then run on your own
machine and serve to every player.**

### Option B — a version is a data patch (a *ruleset*) ✅ recommended

A version is a small declarative diff over the game's numbers and content lists:

```json
{
  "name": "Glass Cannons",
  "author": "someguy",
  "parent": "default",
  "schema": 1,
  "notes": "everyone dies fast, fireball hits like a truck",
  "patch": {
    "SPELLS.fireball.dmg": [14, 20, 28],
    "PLAYER.MAX_HP": 60,
    "ELEMENTS.frost.cost": [6, 5, 5]
  }
}
```

Why this fits *this* repo unusually well — from AGENTS.md:

- `shared/constants.js` holds **ALL game numbers** (spells, items, 9 elements,
  arena, economy, bots, builds).
- `shared/campaign.js` — "**levels are data, never code**".

You already built the substrate. Now re-read the request types you listed:
*rebalancing, fireball cooldown shorter, item costs, a co-op level with a boss
at the end* — **the large majority are already pure data.**

The properties this buys are worth more than the expressive power it gives up:

- **Merge conflicts cannot exist.** Not "are rare" — cannot exist. A ruleset
  never touches another ruleset.
- **One engine.** Fix a crash once, all 500 versions get it. This is the
  property Option A can never have, and it's the one that decides whether
  month 6 is alive or a graveyard.
- **A version is human-readable.** 20 lines a player can inspect before
  playing, and a reviewer can eyeball in five seconds.
- **No arbitrary code execution.** A JSON patch cannot own your machine.
- **The harvest becomes computable.** Diff the top-20-rated rulesets against
  default and *see which constants the crowd consistently moves, and which way*.
  That is a genuinely new kind of design data, and it's the actual payoff of
  your whole idea. Option A makes it impossible; Option B makes it a script.

## Recommendation: three tiers, build tier 1 first

| Tier | What a version is | Review | Volume | Build cost |
|---|---|---|---|---|
| **1. Ruleset** | JSON patch over constants + campaign data | **auto-accept** (schema-validated) | hundreds | **small** |
| **2. Content** | new element / spell / item via engine extension points | agent-reviewed | dozens | medium — a real refactor |
| **3. Engine fork** | git branch, own deployment | you, manually | a handful | ~free (just say no) |

**Tier 1 is where 90% of requests land, and it costs the least. Build it end to
end and nothing else, first.** Prove that people actually create and play
versions before paying for tier 2.

**Tier 2 is the strategic one, and here's the happy accident:** making the
engine accept a community-authored element is *the same refactor* as making it
cheap for you to add one. Adding an element today means editing many scattered
sites; a registry where an element declares its on-hit hooks fixes both problems
in one pass. We're about to add four new elements — that refactor pays for
itself immediately whether or not tier 2 ever ships. See
[ROUND12.md](ROUND12.md).

**Tier 3: don't build infrastructure for it.** "Here's a branch, host it
yourself." Someone rewriting collisions is doing their own project, and that's
fine and healthy.

## Failure modes you should hear about before we start

Ranked by how likely they are to actually kill this.

**1. Playerbase fragmentation — the real killer, and it isn't technical.**
500 versions × 4-player lobbies = nobody can find a game. Merge conflicts were
never the threat; an empty lobby is. Mitigations, all cheap:
privilege the default version heavily in the UI; show **live player count** per
version (the only number that matters for choosing); auto-archive versions with
zero games in 7 days out of the main list; make it one click to return to
default.

**2. Ratings will be low-signal.** Stars come from the author and two friends.
Fixes: rating unlocked only after finishing a game; one rating per player per
version; always display N alongside the average; hide versions below a minimum
sample from the leaderboard. Better still, log two things that can't be
astroturfed: **did they play a second game** (retention) and **did they finish
the first** (rage-quit rate). Show stars to players; trust retention when
deciding the default.

**3. Auto-merge is only safe for data.** "Auto-accept any PR that just adds a
version" is safe in tier 1 and dangerous everywhere else. The gate must be
machine-checkable, not judgement-based: *every changed path matches
`rulesets/*.json`, the schema validates, and nothing else is touched* → merge.
Anything else → human. One rule, no exceptions.

**4. The in-game chat box is a prompt-injection surface into an agent with
write access to your repo.** Anyone on the internet can type into it. Treat
every request as hostile input: the agent gets no shell, its only output is a
ruleset file, and anything outside `rulesets/` requires you. Rate-limit per
author, queue the work — and remember the agent runs on *your* PC, *your*
electricity, *your* API budget.

**5. Version names and notes are user-generated content shown to every
player.** You need a name filter and a one-command kill switch for a version.
Boring, unavoidable.

**6. Schema drift will silently kill old versions.** When we rename a constant,
every ruleset referencing it breaks. Non-negotiable: a schema version field, a
validator that runs over **every** ruleset in CI, and rulesets that fail
validation get flagged loudly rather than quietly serving a broken game. This is
the single thing that decides whether six months of community versions are still
playable in month seven.

## Is the vision sound?

Yes, and it's less speculative than it sounds. Steam Workshop, the Factorio mod
portal, Slay the Spire and Balatro mods all do "accept community content, rate
it, promote the winners". WC3 custom maps — where Warlock itself came from — are
the same loop run by hand. Those are your existence proofs.

**The genuinely new part is the agent closing the loop**: natural language →
playable version in minutes, with no GitHub account, no toolchain, no
gatekeeper. Nobody has that yet, and it is a much better claim than "community
versions", which is 20 years old. It's also why tier 1 matters most: the loop
only feels magic if it's *fast*, and a JSON patch is fast.

Two honest caveats. Most versions will be bad or duplicates — that's fine, it's
the cost of a wide funnel, and it's exactly why ranking and the privileged
default exist. And your "Warlock 2 in six months" is the right frame: don't
promise the community that popular versions get merged, promise that popular
versions get *read*.

## Proposed first slice (small, ~a day, ships something real)

1. `LICENSE` file (see [NAMING.md](NAMING.md)) — prerequisite, not optional.
2. `rulesets/` + a schema + a validator wired into `npx vitest run`.
3. `applyRuleset(constants, patch)` in `shared/` — one pure function, unit
   tested, with `default.json` as an empty patch so the default path is the
   *same* code path as every other version.
4. Lobby: version dropdown (name, author, ★ + N, live players), sortable.
   Server loads the chosen ruleset at lobby start; wire format untouched.
5. Post-game: rate 1–5. Store to a JSONL file, same style as the existing
   journal.
6. **Then** decide about the chat box and the always-on agent — with real data
   on whether anyone makes versions at all.

Steps 1–5 are boring, safe, and testable. That is the point: this is the layer
everything else stands on, so it should be the least clever code in the repo.
