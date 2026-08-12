# Is "OpenWarlock" a safe name?

*Analysis for Remi, 2026-08-07. I am not a lawyer; this is an engineering-grade
risk read, not legal advice.*

## Short answer

**Keep the name.** It is the lowest-risk part of this project. Two cheap
paperwork fixes (below) matter far more than the name itself.

## Why the name is fine

**Game rules are not copyrightable.** Copyright protects expression (art,
music, code, text, the specific audiovisual look), not mechanics or rules.
Reimplementing "knock wizards into lava with physics spells" is the same legal
act as building a new MOBA, roguelike, or Souls-like. Your instinct here was
correct: genre, not plagiarism.

**"Warlock" is a generic fantasy noun.** Blizzard's marks are *Warcraft*,
*World of Warcraft*, *Blizzard*. A warlock is a spellcaster in D&D, folklore,
and a hundred games. Nobody holds an exclusive claim on it for video games, and
a mark that weak is hard for anyone to enforce, including you, later (see
"if you ever commercialise").

**The `Open<Thing>` pattern has 20 years of unchallenged precedent**, and all
of it is on reimplementations of commercial games:

| Project | Reimplements | Status |
|---|---|---|
| OpenRA | Command & Conquer (EA) | ~18 years, never sued |
| OpenMW | Morrowind (Bethesda) | ~17 years, never sued |
| OpenTTD | Transport Tycoon Deluxe | ~21 years, never sued |
| OpenXcom, Freeciv, OpenDota | X-COM, Civilization, Dota | same |

The common thread in every survivor: **they ship no copyrighted assets and
never imply endorsement.** That is the whole recipe.

**Prior art specific to us.** *Warlock Brawl* is an existing standalone remake
of this same WC3 custom map, public for years. And the original Warlock was
itself a community custom map. This genre's entire history is people rebuilding
each other's ideas. The space is uncontested.

## Where the actual risk is (ranked)

1. **`assets/`, art and music.** This is the real exposure, an order of
   magnitude above the name. Copyright *does* protect images and audio. Two
   things to confirm: (a) nothing is ripped from WC3 or any other game;
   (b) AGENTS.md points at your originals in
   `~/reachy_mini_apps/fire_nation_attacked_assets/`. If that art is
   generated in the recognisable style of a specific franchise, that is a
   bigger liability than "OpenWarlock" will ever be. Worth a look. A generic
   fantasy look costs you nothing and removes the question.
   *Good news:* game objects are emoji, not sprites (AGENTS.md), so the surface
   is only backgrounds + music.
2. **Verbatim names and icons.** Don't copy WC3 ability names, icon art, or
   unit names. Our spell names are already generic (fireball, teleport, rush);
   keep it that way.
3. **Implying affiliation.** Never "the official Warlock", never Blizzard
   branding. Positioning is: *inspired by*, *Warlock-style*.

## Two fixes to make (both ~10 minutes)

1. **Add a `LICENSE` file.** `package.json` declares MIT but **there is no
   LICENSE file in the repo.** For a project about to accept community
   contributions, that is the one genuine legal hole here: right now nobody
   knows what they're allowed to do with your code, or what you're allowed to
   do with theirs. See [VERSIONING.md](VERSIONING.md), which depends on this.
2. **Add a disclaimer + genre framing to README.** Something like:

   > OpenWarlock is a Warlock-style arena brawler, an original,
   > from-scratch implementation inspired by the community-made *Warlock*
   > custom map for Warcraft III. It is not affiliated with, endorsed by, or
   > associated with Blizzard Entertainment, and contains no Warcraft assets.

   "Warlock-style" is the load-bearing phrase. It uses the word as a **genre
   marker**, exactly like "MOBA" or "Souls-like", which is both honest and
   the strongest posture available.

## If you ever commercialise

The weakness of a generic name cuts both ways: **you could not register
"Warlock" as a trademark either** (too descriptive, too crowded). If a real
brand ever matters (store page, funding, merch), the move is to coin a
distinct name for the *product* and keep `OpenWarlock` as the *project* name.
That is Chromium/Chrome, WebKit/Safari. It's a decision you can defer for
years at zero cost, so don't spend thought on it now.

## Verdict

Name: **keep**. Do the LICENSE file and the README disclaimer. Then glance at
where the background art came from; that's the only item on this page that
could actually bite.
