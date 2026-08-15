# Contributions, licensing, and the money question

*Answers to Remi's questions, 2026-08-07. Not legal advice; an engineering read
on well-trodden ground. Companion to [NAMING.md](NAMING.md) and
[VERSIONING.md](VERSIONING.md).*

`LICENSE` (MIT) now exists, matching what `package.json` already declared.

## Q: Do player contributions need a special framework?

**No. MIT already handles it, by the "inbound = outbound" norm.** A
contribution to an MIT project is offered under the project's own terms. This
isn't folklore: GitHub's Terms of Service (§D.6) say that when you submit a
contribution to a public repository that carries a license, you license it under
those same terms. So a PR into OpenWarlock arrives MIT, automatically, with no
paperwork.

Contributors keep the copyright on what they wrote. They simply grant everyone
(including you) the MIT permissions: use, modify, distribute, sublicense, sell.

**One thing worth adding**, cheap and standard: a `CONTRIBUTING.md` stating
"contributions are accepted under the MIT license." It costs nothing and removes
the argument before it happens.

## Q: If there's ever revenue (merch, etc.), is it a problem that contributors get no share?

**No. This is settled and completely normal.** MIT grants the right to *sell*
explicitly and irrevocably, royalty-free, with no revenue-sharing obligation.
It's how Linux, React, VS Code, and thousands of commercially-successful projects
work: the contributor's compensation is that the thing exists and they can use it
too.

Merch is even easier than software revenue: you'd be selling t-shirts, not the
code, and nothing in MIT touches that.

Two practical notes anyway:

- **Say it out loud in `CONTRIBUTING.md`.** Legally you're covered; socially,
  people get upset when they feel ambushed. One honest line ("this project may
  eventually have a commercial side; contributions are MIT and carry no revenue
  share") costs nothing and buys goodwill.
- **Art and music are the exception to watch.** If a contributor supplies a
  sprite or a track, confirm it's under the project license too. Assets are
  where "I didn't realise you'd sell it" fights actually happen (never code).

## Q: "I want everything to always stay public." ⚠️ MIT does not give you that.

This is the one place where what you asked for and what you chose don't match,
so it's worth being blunt: **MIT permits anyone to take OpenWarlock closed.** A
studio can fork it, build a proprietary version, sell it, and publish nothing.
They must keep your copyright notice. That's the whole obligation.

The tool that actually enforces "always public" is **copyleft**, and for a
browser game specifically, **AGPLv3**, because it's the one that closes the
network loophole: anyone who *runs* a modified version as a service must publish
their source. GPLv3 wouldn't cover it, since players never download a binary.

Trade-off, honestly:

| | MIT (current) | AGPLv3 |
|---|---|---|
| Maximum adoption / reuse | ✅ | weaker |
| Anyone can fork it closed | yes | **no** |
| You can sell merch / hosting | ✅ | ✅ (copyleft restricts *closing*, not *selling*) |
| Matches "tout doit rester public" | ✗ | ✅ |

**The good news, and it's the reason not to agonise now: you picked the
reversible direction.** MIT code can be pulled into an AGPL project later (you
keep the MIT notices), so **MIT → AGPL stays open to you**. The reverse,
AGPL → MIT, is impossible without every contributor's consent. Starting
permissive and tightening later works; starting copyleft and loosening doesn't.

The only cost of deferring: a fork taken while the project is MIT stays MIT
forever. A later relicense binds the future, not the past.

**So: MIT now, as you asked, is a defensible choice and not a trap.** Just know
that today the guarantee is "the *original* is always public," not "every version
is always public." If the stronger property turns out to matter, revisit it
before the project gets popular, not after.

## The in-game chat box (the genuinely novel path)

Someone typing "make fireball's cooldown shorter" into a box has agreed to no
license at all. Three reasons this is nonetheless low-risk:

1. **Ideas aren't copyrightable.** "Reduce this cooldown" carries no rights.
2. **Your agent writes the code**, so the implementation's authorship sits with
   you, not the requester.
3. AI-generated code is, in most jurisdictions today, thinly protected at best,
   which cuts both ways but removes the requester from the picture entirely.

Still, put one line of microcopy next to the box: *"By submitting a suggestion
you agree it may be implemented and released under the project's MIT license."*
Ten seconds of work, closes the question permanently.

The real risk on that path isn't legal, it's security: an internet-facing text
box feeding an agent with write access to your repo. That's covered in
[VERSIONING.md](VERSIONING.md), failure mode #4.

## Action list

- [x] `LICENSE` (MIT) added
- [ ] `CONTRIBUTING.md`: inbound = outbound, no revenue share, assets need
      explicit licensing
- [ ] One-line license notice next to the in-game suggestion box (when built)
- [ ] Optional, only if you want the "every version stays public" guarantee:
      revisit AGPLv3 **before** the project gets popular
