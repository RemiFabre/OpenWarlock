# Round 10 Implementation Plan — reconnect, power-spell combos, poison rework, Critical element, bot reaction time, balance campaign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Remi's 11 round-10 changes (persistence, combos, poison ticks, Critical element, midas/arcane/KB/lava tuning, bot reaction time, hook visuals), then run a multi-thousand-game balance campaign and write BALANCE.md report #4.

**Architecture:** All gameplay numbers in `shared/constants.js`, all mechanics in `shared/sim.js` (pure, seeded, vitest-covered), reconnect persistence in `server/index.js` (keyed on normalized name), visuals in `client/render.js` + `client/main.js`. Balance measured with `tools/arena.js` studies (mirror / elemental / full), thousands of headless games, iterating numbers only after mechanics are test-green.

**Tech Stack:** Vanilla JS ESM, no build step, vitest, ws. Push directly to main, short commits.

## Global Constraints

- `npx vitest run` must stay green (92 tests + new ones) before every commit.
- Classic-mode wire format must stay byte-identical (elemental fields only under `mode === 'elemental'`).
- DoT ticks must NOT stamp `lastHitBy` (round-9 scar) — tick kills credit via direct `sourceId` instead.
- Knockback must keep zero size/radius term.
- Economy invariant `ROUND_BASE >= 3*PER_KILL + ROUND_WIN` untouched.
- Bots stay rebindable-keyboard-agnostic; no image assets for game objects (emoji ok).
- Kill stray servers after robustness tests (`pgrep -fl "server/index.js"`).

---

### Task 1: Number retunes (KB −30% at low HP, lava speed ×2)

**Files:** Modify `shared/constants.js:41` (KB_HP_FACTOR), `:49` (LAVA.SPEED_MULT). Test: `test/sim.test.js`.

- [ ] Step 1: `KB_HP_FACTOR: 0.55` → `0.385` (comment: `was 0.55: −30% 2026-08-05, low-HP launches still too wild`).
- [ ] Step 2: `SPEED_MULT: 1.3` → `2.0` (comment: lava swimming is a real dodge route — you sprint at 2× while burning).
- [ ] Step 3: `npx vitest run` — knockback regression tests use the constant, must stay green.
- [ ] Step 4: Commit `retune: low-HP knockback -30%, lava speed x2`.

### Task 2: Repulse + Teleport/Rush combos

**Files:** Modify `shared/sim.js:190` (castSpell gate), `shared/constants.js:152` (repulse desc). Test: `test/sim.test.js`.

**Interfaces:** Produces: while `pl.charging`, `castSpell` accepts `teleport` and `rush` (only); while `pl.dash`, accepts `repulse` (only).

- [ ] Step 1: Failing tests: (a) start repulse charge, cast teleport → position blinks, charge still fires after 2 s and hits an adjacent enemy; (b) charge + rush → dash executes, burst still fires; (c) charge + fireball → still refused; (d) mid-dash repulse → accepted.
- [ ] Step 2: Replace `if (pl.dash || pl.charging) return false;` with:
```js
  // power combos (2026-08-05): a charging repulse may still reposition —
  // teleport/rush into the pack and let the burst land. Everything else
  // stays locked, and a dash only allows starting the charge.
  if (pl.dash && key !== 'repulse') return false;
  if (pl.charging && key !== 'teleport' && key !== 'rush') return false;
```
- [ ] Step 3: `setMoveTarget` still blocks during dash only — unchanged. Run tests → green.
- [ ] Step 4: Update repulse desc: `'💥 Charge 2 s (visibly — Teleport/Rush still work), then blast everyone around you away. From round 6.'`
- [ ] Step 5: Commit `repulse combos: teleport/rush usable while charging`.

### Task 3: Poison rework — discrete ticks, stacking on re-hit, tick kills

**Files:** Modify `shared/constants.js:207-210` (venom fx), `shared/sim.js` (addPlayer fields, startRound reset, stepBattle DoT block, applyElementsHit, hazard tint guard). Test: `test/sim.test.js`.

**Interfaces:** Produces player fields `poisonT` (s left), `poisonTick` (dmg/tick), `poisonBy`, `_poisonNext` (s to next tick). Consumes `applyDamage(state, pl, dmg, sourceId, {silent:true, stamp:false})`.

- [ ] Step 1: New venom fx in constants (trail fields unchanged):
```js
  venom: { name: 'Venom', icon: '🐍', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Hits poison: 1 tick/s for 5 s. Re-hits refresh AND strengthen the ticks. −15% direct damage.',
           fx: { dmgMult: 0.85, tickDmg: [1, 1.5, 2], stackAdd: [0.5, 0.75, 1],
                 dotTime: 5, tickEvery: 1,
                 trailT: [1.4, 1.9, 2.4], trailDps: 2, trailStep: 2.5, trailR: 1.3 } },
```
- [ ] Step 2: Failing tests: (a) one venom lv1 hit → exactly 5 ticks of 1 dmg over ~5 s (hp drops by 5 beyond impact, in 1-dmg steps); (b) re-hit at t=2 s → duration back to 5 s and tick dmg 1.5; (c) lethal tick credits the poisoner with the kill (victim parked in lava at 1 hp: whoever's tick lands the killing blow gets it — poison tick kill → poisoner credited even though lastHitBy is stale); (d) poison does NOT stamp lastHitBy (lava killing blow after window → environment kill, not poisoner).
- [ ] Step 3: In `applyElementsHit` replace the dotDamage branch:
```js
    if (f.tickDmg) {
      // re-hits REFRESH the clock and STACK the tick damage (2026-08-05)
      const fresh = efxV(f.tickDmg, el);
      target.poisonTick = target.poisonT > 0
        ? (target.poisonTick || 0) + efxV(f.stackAdd, el) : fresh;
      if (target.poisonT <= 0) target._poisonNext = f.tickEvery;
      target.poisonT = f.dotTime;
      target.poisonBy = pr.owner;
    }
```
- [ ] Step 4: In `stepBattle` replace the continuous poison drip:
```js
    if (pl.poisonT > 0) {
      pl.poisonT = Math.max(0, pl.poisonT - dt);
      if (pl.poisonTick > 0) {
        pl._poisonNext = (pl._poisonNext ?? ELEMENTS.venom.fx.tickEvery) - dt;
        if (pl._poisonNext <= 0) {
          pl._poisonNext += ELEMENTS.venom.fx.tickEvery;
          // a discrete tick CAN land the killing blow (kill credit goes to the
          // poisoner via sourceId) but never stamps lastHitBy — the round-9 rule
          applyDamage(state, pl, pl.poisonTick, pl.poisonBy, { silent: true, stamp: false });
          if (state.players[pl.poisonBy] || pl.poisonBy == null)
            state.events.push({ t: 'hit', id: pl.id, amount: pl.poisonTick, x: pl.x, y: pl.y, poison: true });
        }
      }
    }
```
- [ ] Step 5: Rename fields everywhere: `poisonDps`/`_poisonAcc` → `poisonTick`/`_poisonNext` in addPlayer + startRound reset. Hazard tint line stays `pl.poisonT = Math.max(pl.poisonT, 0.3)` — guard the tick block with `pl.poisonTick > 0` (done above) so trail tint alone deals no tick damage.
- [ ] Step 6: Run tests, fix, commit `poison rework: 1 tick/s for 5s, re-hits refresh+stack, ticks can last-hit`.

### Task 4: New element — Critical 💢 (per-hit ramp)

**Files:** Modify `shared/constants.js` (ELEMENTS.critical), `shared/sim.js` (addPlayer/startRound `critHits`, projectile damage calc, applyElementsHit increment), `client/render.js:47` (ELEM_CORE color). Test: `test/sim.test.js`.

**Interfaces:** Produces player field `critHits` (fireball hits landed this round). Damage calc: `dmg += min(critHits, rampCap) * rampDmg` and `kb += min(critHits, rampCap) * rampKb` applied BEFORE mults, read at hit time from `state.players[pr.owner]`.

- [ ] Step 1: Constants:
```js
  critical: { name: 'Critical', icon: '💢', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Every fireball you LAND this round rams the next ones: more damage and push per hit. Starts weak: −20% damage.',
           fx: { dmgMult: 0.8, rampDmg: [0.35, 0.5, 0.65], rampKb: [1.5, 2.2, 3], rampCap: 20 } },
```
- [ ] Step 2: Failing tests: (a) first critical hit does 5*0.8=4 dmg; (b) after N hits, hit N+1 does (5 + N*rampDmg)*0.8; (c) counter resets at round start; (d) cap respected.
- [ ] Step 3: In `stepProjectiles` damage calc, inside the `pr.elements` loop add ramp before mults:
```js
          if (f.rampDmg) {
            const own = state.players[pr.owner];
            const hits = Math.min(own && own.critHits || 0, f.rampCap);
            dmg += hits * efxV(f.rampDmg, el);
            kb += hits * efxV(f.rampKb, el);
          }
```
  (order note: the loop applies adds and mults per element as it goes — put ramp in the same add slot; document that element iteration order = ownership insertion order, same as today.)
- [ ] Step 4: In `applyElementsHit` add `if (f.rampDmg && pr.owner != null) { const o = state.players[pr.owner]; if (o) o.critHits = (o.critHits || 0) + 1; }`. Reset `critHits = 0` in startRound + addPlayer.
- [ ] Step 5: `ELEM_CORE` add `critical: '#ff5d5d'`. Run tests, commit `new element: Critical (per-hit dmg/kb ramp, resets each round)`.

### Task 5: Midas nerf

**Files:** Modify `shared/constants.js:214-216`, `shared/sim.js` (applyElementsHit gold branch, per-round first-hit set). Test: `test/sim.test.js`.

- [ ] Step 1: Constants:
```js
  midas: { name: 'Midas', icon: '🪙', maxLevel: 3, costs: [10, 8, 8],
           desc: 'Hits pay +1 g. At lv3 the FIRST hit on each enemy each round pays +2 g. −15% damage.',
           fx: { goldOnHit: [1, 1, 1], firstHitBonus: [0, 0, 1], dmgMult: 0.85 } },
```
- [ ] Step 2: Failing tests: (a) lv3 first hit on a fresh victim pays 2, second hit pays 1; (b) new round resets the first-hit set; (c) lv1 pays 1 flat.
- [ ] Step 3: In `applyElementsHit` gold branch:
```js
    if (f.goldOnHit && pr.owner != null) {
      const owner = state.players[pr.owner];
      if (owner) {
        let pay = efxV(f.goldOnHit, el);
        const bonus = f.firstHitBonus ? efxV(f.firstHitBonus, el) : 0;
        if (bonus > 0) {
          owner._midasHit = owner._midasHit || {};
          if (!owner._midasHit[target.id]) { owner._midasHit[target.id] = true; pay += bonus; }
        }
        owner.gold += pay; owner.goldEarned += pay;
        state.events.push({ t: 'gold', id: pr.owner, amount: pay, x: pr.x, y: pr.y });
      }
    }
```
  Reset `pl._midasHit = {}` in startRound.
- [ ] Step 4: Run tests, commit `midas nerf: 1g/hit, lv3 first-hit-per-enemy bonus, -15% dmg`.

### Task 6: Arcane buff + HUD visibility

**Files:** Modify `shared/constants.js:220-222`, `client/main.js` (spell-bar elem badges), maybe `client/index.html`/CSS. Test: numbers only (constants), UI eyeballed via robustness test.

- [ ] Step 1: `cdrMult: [0.9, 0.82, 0.75]` → `[0.88, 0.78, 0.68]`, desc `'ALL your cooldowns run faster: −12% / −22% / −32%.'` (final numbers may move after the campaign).
- [ ] Step 2: Visibility: in `updateUi` spell bar, show owned arcane on EVERY owned spell slot (not just fireball): if `m.elements.arcane`, append `🔮` to each slot's `.elem` badge — arcane is global, so every cooldown it touches shows it.
- [ ] Step 3: Run robustness test to confirm no client crash. Commit `arcane: -12/-22/-32% CDR, visible on every spell slot`.

### Task 7: Lifesteal audit (test-lock the rule)

**Files:** Modify `shared/sim.js:462-464` (heal on effective damage), `shared/constants.js:170` (desc). Test: `test/sim.test.js`.

- [ ] Step 1: Failing tests: sword owner heals from (a) fireball, (b) poison tick they applied, (c) venom trail, (d) rush hit; (e) no heal from the victim's lava burn even when credited; (f) heal is capped by the victim's remaining hp (no overkill farming).
- [ ] Step 2: In `applyDamage` change `src.hp + amount * lifesteal` → `src.hp + effective * lifesteal` (effective already computed on line 443).
- [ ] Step 3: Item desc → `'Heal 25% of the damage you deal (lava burn excluded)'`.
- [ ] Step 4: Run tests, commit `lifesteal: works on all dealt damage incl. DoT, capped at real damage`.

### Task 8: Hook — visible chain + verified yank-behind

**Files:** Modify `client/render.js` (projectile loop: hook rendering), `shared/sim.js:1039-1040` (yank distance), `shared/constants.js:146` (desc clarity). Test: `test/sim.test.js`.

- [ ] Step 1: Failing test: hook cast east at a victim 10 u away yanks the victim to WEST of the caster (behind, opposite the throw), momentum zeroed. And: victim killed by hook damage is NOT yanked.
- [ ] Step 2: Yank lands the victim a full body further out so the swap reads clearly: `owner.radius + other.radius + 0.6` → `+ 1.4` (both axes).
- [ ] Step 3: render.js — in the projectile loop add:
```js
    } else if (pr.type === 'hook') {
      // taut chain from the caster to the hook head — you SEE the range
      const owner = players.find(p => p && p.id === pr.owner);
      if (owner && fin(owner.x) && fin(owner.y)) {
        ctx.strokeStyle = 'rgba(215, 205, 180, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(view.sx(owner.x), view.sy(owner.y));
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const r = Math.max(4, SPELLS.hook.radius * 2.2 * scale);
      ctx.font = `${Math.round(r * 2)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🪝', x, y);
      ctx.textBaseline = 'alphabetic';
    }
```
- [ ] Step 4: Run vitest + robustness test. Commit `hook: visible chain+head, yank lands a body further behind`.

### Task 9: Reconnect persistence (name-keyed)

**Files:** Modify `server/index.js` (ghost stash on close, restore on join, clear on resetToLobby). Test: scripted ws client in scratchpad (no server unit tests exist) + `PLAY_MS=30000 node test/client-robustness.js`.

**Interfaces:** `ghosts: Map<normName, {snapshotOfProgress, at}>`; restore copies gold, goldEarned, kills, deaths, dmgDealt, spells, items, elements, maxHp, color, avatar.

- [ ] Step 1: In `ws.on('close')`, before `removePlayer`, stash fighters' progress while a game is running:
```js
    const pl = game.players[id];
    if (pl && !pl.bot && !pl.spectator && game.phase !== 'lobby' && game.phase !== 'gameover') {
      ghosts.set(normName(pl.name), {
        at: Date.now(), color: pl.color, avatar: pl.avatar,
        gold: pl.gold, goldEarned: pl.goldEarned, kills: pl.kills,
        deaths: pl.deaths, dmgDealt: pl.dmgDealt, maxHp: pl.maxHp,
        spells: { ...pl.spells }, items: [...pl.items], elements: { ...pl.elements },
      });
    }
```
- [ ] Step 2: In the join handler after `addPlayer`, restore by name (10-minute freshness cap):
```js
      const ghost = ghosts.get(normName(m.name));
      if (ghost && Date.now() - ghost.at < 10 * 60 * 1000 && game.phase !== 'lobby') {
        Object.assign(pl, {
          color: ghost.color, avatar: pl.avatar === '🧙' ? ghost.avatar : pl.avatar,
          gold: ghost.gold, goldEarned: ghost.goldEarned, kills: ghost.kills,
          deaths: ghost.deaths, dmgDealt: ghost.dmgDealt, maxHp: ghost.maxHp,
          spells: ghost.spells, items: ghost.items, elements: ghost.elements,
        });
        pl.hp = Math.min(pl.hp, pl.maxHp);
        ghosts.delete(normName(m.name));
        journal('reconnect-restore', { id, name: pl.name });
      }
```
  (amulet maxHp travels via ghost.maxHp — do NOT re-apply item effects.)
- [ ] Step 3: Clear `ghosts` in `resetToLobby`.
- [ ] Step 4: Scratchpad script: start server, ws-join "remi", play into round 1, buy nothing, force kills via second client? — simpler: join 1 human + bots via messages, wait for battle, set kills by playing is impractical → instead verify gold/spells survive: join, reach shop, buy fireball lv2, disconnect, rejoin same name, assert snapshot shows fireball lv2 + reduced gold. Assert a DIFFERENT name does not inherit.
- [ ] Step 5: Run robustness test (its reconnects must not double-restore). Commit `reconnect keeps your progress: name-keyed ghost stash on the server`.

### Task 10: Berserker reaction time + close-range aim error floor

**Files:** Modify `shared/sim.js` (stepBerserker: stale-observation aim, decision tick, error floor), `shared/constants.js` (BOTS.berserker desc/reaction doc). Test: `test/sim.test.js` (deterministic: berserker no longer point-blank-perfect) + arena win-rate check in campaign.

**Interfaces:** Produces per-bot `pl._obs = {id, x, y, vx, vy}` — last decision-tick's observation of its mark; aim uses the PREVIOUS observation (one decision tick stale ≈ its reaction time).

- [ ] Step 1: `pl._botT = 0.14 + rng*0.1` → `0.22 + rng*0.12` (avg ≈ 0.28 s — human-ish reaction; stalker keeps 0.12, grunt keeps 0.25).
- [ ] Step 2: Fireball aim block: intercept from the STALE observation of the mark, and an absolute error floor so point-blank is no longer pixel-perfect:
```js
  if (mark && (pl.cooldowns.fireball || 0) <= 0) {
    // reaction emulation (2026-08-05): aim with LAST tick's observation of
    // the mark (≈0.28 s stale) — direction changes inside that window are
    // invisible to the bot, exactly like a human's reaction time
    const seen = pl._obs && pl._obs.id === mark.id ? pl._obs : null;
    const v = estVel(mark);
    pl._obs = { id: mark.id, x: mark.x, y: mark.y, vx: v.vx, vy: v.vy };
    const ghost = seen ? { ...mark, x: seen.x, y: seen.y, vx: seen.vx, vy: seen.vy, moveTarget: null } : mark;
    const aim = interceptPoint(pl, ghost, SPELLS.fireball.speed);
    ...
    const err = (rng(state) - 0.5) * (1.8 + mDist * 0.10); // floor: sloppy up close too
    ...
  }
```
  (ghost carries vx/vy from the old observation with `moveTarget: null` so `estVel` inside interceptPoint uses exactly the stale velocity.)
- [ ] Step 3: Deterministic test: park a berserker 3 u from a strafing target; over many decision ticks with seeds, hit rate must be < 100% (assert at least one fireball misses in a fixed-seed scenario that previously always hit). Keep it robust: assert `pl._obs` staleness mechanism (obs equals previous tick's position, not current).
- [ ] Step 4: Run vitest + `node tools/arena.js --games=200 --players=4` sanity (berserker Elo should dip, not crater). Commit `berserker reaction time: stale-obs aim + error floor, slower decision tick`.

### Task 11: Verification ritual + baseline snapshot

- [ ] Step 1: `npx vitest run` all green; `node test/harness/run.js test/harness/scenarios/bots.js`; `PLAY_MS=30000 node test/client-robustness.js`; `node tools/arena.js --games=60 --players=4`; kill stray servers.
- [ ] Step 2: Commit any fixes. This is the mechanics-complete checkpoint.

### Task 12: Balance campaign (thousands of games, iterate, report)

**Files:** Create `BALANCE.md` report #4 (rewrite), update `REMI_NOTES.md` (round 10 entry, newest on top), `AGENTS.md` refresh, `STRATEGIES.md` if bot table shifts.

- [ ] Step 1: Baseline sweeps (run concurrently as background processes / subagents):
  - full study `--games=2500 --players=4` (mixed Elo, lava share, comeback rate)
  - mirrors: `--mirror=grunt|berserker|stalker --games=1500` each
  - elemental studies: `--mode=elemental --kind=grunt|berserker|stalker --games=1500` each (now 8 elements incl. critical)
  - item probe `--probe=berserker --games=1400` (lifesteal + KB change may shift sustain)
- [ ] Step 2: Analyze vs report #3 + round 8/9 addenda. Red lines: any element > 40% or < 12% in 4-seat studies (baseline 25%); venom must NOT regain lava-kill dominance (lava share sanity + venom win rate); critical between 20–35%; berserker mixed-study Elo above grunt, below stalker; lava share reported (Remi hasn't ruled on target).
- [ ] Step 3: Iterate numbers (tickDmg/stackAdd, ramp, midas, cdr, error floor) — one variable per iteration, re-run the affected study at ≥1000 games, document every iteration.
- [ ] Step 4: Write BALANCE.md report #4 per the explain-everything rule (define metrics, state 25% baseline, builds as build+playstyle, link STRATEGIES.md, flag bot artifacts — esp. midas & critical with saturated bots, and that bots don't pilot power spells/hook so those verdicts stay human).
- [ ] Step 5: REMI_NOTES.md round-10 entry (player-facing, interpretation of each voice note stated, one-line reverts). AGENTS.md handoff refresh. Final verification ritual. Commit + final summary.

## Self-Review

- Spec coverage: disconnect/reconnect→T9; repulse+dash/flash→T2; poison→T3; critical→T4; midas→T5; cdr→T6; bot reaction→T10; low-HP pushback −30%→T1; lava ×2 speed→T1; lifesteal→T7; hook→T8; campaign+BALANCE.md→T12. ✔
- Types consistent: poisonTick/_poisonNext used in T3 only; critHits in T4; _midasHit in T5; ghosts map in T9; _obs in T10. ✔
- No placeholders: all steps carry code or exact commands. ✔
