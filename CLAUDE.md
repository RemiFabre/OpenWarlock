# OpenWarlock — read this first

Entry set: **AGENTS.md** (the handoff + the CONTEXT POLICY, mandatory), then
**REMI_NOTES.md** (latest round). Read everything else on demand.

Hard rules (full policy in AGENTS.md):
- `docs/history/` is the append-only archive — grep it for specifics, never
  read it wholesale, never edit or delete anything in it.
- Living docs (AGENTS.md, BALANCE.md, REMI_NOTES.md, STRATEGIES.md) are edited
  in place and stay lean; long reports become new dated files in
  `docs/history/`. No sweep tables in code comments — pointer lines only.
- `npx vitest run` (304) and the verification ritual in AGENTS.md must pass
  before claiming anything works. Check Remi isn't hosting
  (`pgrep -fl "server/index.js"`) before running tests that kill servers.
