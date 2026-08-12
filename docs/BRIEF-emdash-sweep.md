# BRIEF — em-dash purge (PENDING, ordered by Remi 2026-08-12)

*STATUS: not done. A first attempt (round 22.1) died on a session usage limit
with nothing committed; main is clean. Any agent can execute this; it needs no
other context.*

Remove every em dash (U+2014) from the project's text. Remi: "It's a big AI
tail." Replace each one by ending the sentence with a full stop and starting a
new one, OR with brackets (his stated preference). Judge per instance; never a
lazy comma swap. Keep each file's meaning and line-wrapping style.

Scope: all tracked .md/.js/.html/.json (~1660 instances in ~74 files:
comments, UI strings, docs, test names). EXCLUDE:
- `docs/history/**` (append-only archive, never edit)
- `package-lock.json`, `shared/version.js` (generated/stamped)
- `docs/CODEMAP.md`, `docs/ARCHETYPES.md`: generated. Fix their SOURCES, then
  `node tools/codemap.js --doc` and `node tools/roster.js --doc`.

Traps:
1. Tests may assert exact strings containing em dashes (shop desc/long in
   shared/constants.js, engine denial reasons). Change source and test
   together.
2. An em dash used as a rendered DATA separator must become another separator
   (like `·`), not a full stop. Grep for those first.
3. versions.json: if touched, bump `serial` by 1 (higher serial wins in both
   loaders).
4. UI strings deserve the most care; players read them.

Also add one line to AGENTS.md "How Remi works": no em dashes in any project
text; full stops or brackets instead (Remi, 2026-08-12).

Verify: `npx vitest run` green (469 at time of writing); `node --check` every
edited .js; final `git grep -c '—'` hits only `docs/history/`. Commit in a few
logical chunks. Delete this brief in the closing commit.
