# Community versions: the decided architecture

*2026-08-07. **Revision 2** — Remi overruled revision 1's central
recommendation, and his argument beat it. Both the recommendation and why it
lost are recorded below, because the reasoning is the most important thing on
this page.*

## The decision

**A version is an arbitrary change to the codebase. Anything can change:
numbers, mechanics, the engine, collisions, rendering. There is no restricted
contribution format and no easy tier.** The project accepts hundreds of
divergent versions as the normal state of affairs, and **maintenance is
distributed** along with authorship.

## Why the "just patch a config file" idea was wrong

Revision 1 recommended that a version be a JSON patch over `shared/constants.js`
— no merge conflicts possible, one engine for everyone, the harvest computable.
Technically all of that is true. Remi's objection is that it is *the wrong thing
to optimise*, and it is worth quoting in full because it generalises far beyond
this project:

> Thinking of contributions as restricted to tuning values in a file is a
> thought that is technical and convenience-driven first. When you talk to
> people who have ideas, they don't think like engineers. We're biased by what
> is easily changeable. If I define these changeable values, then my imagination
> becomes changes within those values, because that's easier — and I want out of
> that straitjacket. If I create different difficulty levels of contributing,
> people will do whatever is easiest and limit themselves.

That is a real and unanswerable point. **The shape of the contribution surface
shapes what contributors imagine.** Offer a slider and you get slider ideas.
Every proposal arriving as a config patch would have looked like validation of
the design, when it was actually the design censoring the input.

And the follow-on observation is the whole reason the project exists: when
non-technical friends describe ideas, the engineer's reflex is *"that's a nasty
change, hard to implement, side effects everywhere."* **That reflex is precisely
the filter to remove.** Maybe the idea is bad. The point is to find out by
playing it, not by estimating it.

So revision 1 optimised for the maintainer's comfort and would have quietly
capped the project's ceiling at what its data model already anticipated. Wrong
trade.

## What his model dissolves

Two of revision 1's three big worries were artefacts of assumptions he doesn't
share.

**Fragmentation of the playerbase — dissolved, not mitigated.** I ranked this as
the thing most likely to kill the project: 500 versions × 4-player lobbies =
nobody finds a game. That only bites if players are supposed to find each other
*through the project*. They aren't. Games are private: you host one, you send the
link to people you know, and **the host picks the version**. There is no
matchmaking and no server browser, by design. Coordination happens on Discord and
Reddit, where people agree on what to try. An empty lobby is impossible when
every lobby starts from an invitation. This also kills the corollary worries —
no need to privilege a default version in the UI, no need to auto-archive quiet
versions, no minimum-sample gate before a version is listed.

**Merge hell and the maintenance burden — distributed, not solved.** Revision 1
assumed the maintainer absorbs every fix across every branch. Remi's model
doesn't: a group that wants the game to go a certain direction works on their own
versions, merges among themselves, pulls from whatever states they like, and
**obsoletes or deletes past versions themselves**. Software maintenance becomes
as distributed as authorship. With agents doing the labour, the cost of keeping a
fork alive is no longer the reason forks die.

This is the genuinely novel claim, and it's stronger than "community versions"
(twenty years old) or even "an agent implements your request" (new but narrow):
**distributed maintenance**. Not just anyone can propose a change — anyone can
own a lineage.

## What survives, and is now more important

Removing the restricted format removes the property that made auto-merge safe.
That doesn't go away by deciding differently; it becomes **the** engineering
problem.

**Auto-accepting arbitrary code means executing untrusted code on Remi's own
machine and serving it to every player who picks that version.** With a JSON
patch this was impossible by construction. With arbitrary code it is the default
outcome, so containment has to be built rather than assumed. This is the price of
the freedom, and it is payable — but it is not optional and it is not a taste
question. Concretely it means the untrusted build never runs with access to the
rest of the machine, the agent that writes it has no shell and no credentials,
and a human stays in the loop for anything touching the host process rather than
the game rules. The detail belongs in [HOSTING.md](HOSTING.md), which is where
the "one Mac serves N arbitrary versions" problem actually lives.

**A crashing version is still a bad experience**, and it reflects on the project
even though nobody promised it would work. Cheap answer that keeps maximum
freedom: run the existing suite — `npx vitest run` plus the harness scenarios —
against every version, and **publish the result as a label rather than a gate**.
A version that fails is marked experimental, not blocked. Freedom to ship
anything, honesty about what it is.

**Ratings are still worth having, just not as a promotion mechanism.** Since
there's no default-version competition to feed, their job is narrower: helping
people on Discord decide what to try next. Keep them cheap — a rating after a
finished game, one per player per version, always shown with N.

**Moderation and abuse remain**: version names and descriptions are
user-generated content, and the suggestion box is an internet-facing text input
feeding an agent. Rate limits, a name filter, and a kill switch per version. See
[HOSTING.md](HOSTING.md) section D.

## One distinction worth keeping straight

Remi's decision rules out **tiers of contribution difficulty** — anything that
tells a contributor "this kind of idea is the cheap kind." It does *not* rule out
**internally clean code**. Those are different things that are easy to conflate.

A registry where an element declares its own hooks doesn't limit what anyone can
propose; it just means the common case costs an agent less context and fewer
scattered edits. Contributors never see it. That refactor is happening anyway as
part of round 12 (four new elements pay for it immediately) and it makes arbitrary
changes cheaper too, because an agent that can hold the relevant code in context
makes better changes. Clean seams lower the cost of the easy path without
raising the cost of the hard one.

## Where the harvest goes

Revision 1's best argument for config patches was that the harvest becomes
computable: diff the top-rated rulesets, see which constants the crowd moves.
That is genuinely lost, and it's the real cost of this decision — worth stating
plainly rather than pretending otherwise.

What replaces it is worse as data and better as evidence: **versions people
actually chose to play, repeatedly, against versions they abandoned.** Extracting
"a Warlock 2 that takes the best ideas" from hundreds of divergent trees is a
manual, case-by-case reading job. Remi's answer is that this is fine, and that it
isn't necessarily *his* job — a group that wants to consolidate a direction can
do that consolidation themselves. The project doesn't promise that popular
versions get merged. It promises they get played.

## Prerequisites already done

- `LICENSE` (MIT) exists — see [CONTRIBUTING-LEGAL.md](CONTRIBUTING-LEGAL.md)
  for inbound=outbound, the revenue question, and why MIT is the reversible
  choice.

## Next, in order

1. Finish round 12 ([ROUND12.md](ROUND12.md)) — the game itself first.
2. [HOSTING.md](HOSTING.md) — a non-technical player must be able to host a game
   from a link. Nothing about community versions matters until people can play at
   all.
3. The suggestion box and the always-on agent that depiles it, including the
   refusal policy and the sandbox. Remi's explicit sequencing: **after everything
   else.**
