# docs/history — the append-only archive

*Created 2026-08-08 on Remi's instruction: agent context usage on this project
is CRITICAL, so the living docs stay lean and everything historical lands here.*

## The rules

- **This folder only grows.** Nothing here is ever edited or deleted — new
  rounds add new files. File names are date-prefixed: `YYYY-MM-DD-topic.md`.
- **Never read this folder wholesale.** It is not part of the entry set.
  `grep -r` it when you are investigating a SPECIFIC value, finding ID, or
  decision ("why is rampDmg 0.022?", "what did Finding 15C say?") — then read
  only the matching section.
- **Finding IDs live here.** Code and docs cite findings like `15C` or `16A`;
  the full text is in the dated report file for that round.
- **What goes here**: full balance reports, sweep tables, superseded designs,
  the long versions of scars, archived versions of living docs before a big
  rewrite. **What does not**: anything an agent needs on every session — that
  belongs (briefly) in AGENTS.md, BALANCE.md, or a code comment.
- **Code comments point here.** A constant carries at most a few lines (what
  it is, current intent, active ⚠ warnings) plus a pointer like
  `history: docs/history/2026-08-08-constants-sweeps.md#momentum`. Sweep
  tables are never pasted into code.

## Index

| file | what |
|---|---|
| `2026-08-08-round15-16-balance-full.md` | the complete BALANCE.md as of round 16 (isolation-lab report, round-16 strategy study §0, findings 15A-15F and 16A) before the living doc went lean |
| `2026-08-08-agents-full-pre-diet.md` | the complete AGENTS.md before the context diet (full scar stories, full rules snapshot, full debt list) |
| `2026-08-08-remi-notes-rounds-1-15.md` | REMI_NOTES.md rounds 1-15 (round 16 onward stays in the living file until superseded) |
| `2026-08-08-constants-sweeps.md` | the sweep tables and design-history comment blocks extracted from `shared/constants.js`, one section per constant |
| `2026-08-08-round17-bot-targeting-softmax.md` | ROUND17 §11: the `BOT_TARGETING` softmax, the TEMPERATURE sweep (targeting convergence + h2h ladder), and why the new arena focus metric does not move |
| `2026-08-08-round17-battery.md` | the ROUND17 Session B battery: mixed tables, strategy study, item ladders, the venom tick sweeps (96→56), the momentum threshold sweep, the sword structural finding, and the final tables at HEAD |
| `2026-08-08-remi-notes-round-16.md` | REMI_NOTES.md round 16 (archived when round 17 was written) |
| `2026-08-08-round17-value-analysis.md` | upgrade VALUE analysis: sustained-dps math per option, tankiness/effective-HP with regen gone, and the staged gold-matched duel matrix (tools/duel.js) — why momentum is a "time machine" and venom a bad duelist |
