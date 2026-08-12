// OpenWarlock — transport-agnostic authoritative game room.
// Extracted verbatim from server/index.js (2026-08-09) so the same room can run
// behind the Node ws server, inside a browser tab (solo vs bots), or behind a
// WebRTC host later. docs/BRIEF-browser-hosting.md is the spec.
//
// The line this module holds: the engine knows CONNECTION IDS and NAMES.
// It never sees sockets, IPs, files, or the game-loop clock — the caller owns
// the 30 Hz tick / 15 Hz snapshot cadence and all I/O:
//   - name-bans, ghosts/reconnect, kick, seating -> here (they are game state)
//   - IP-bans, journal, crash dumps, /health, static serving -> the adapter
// setTimeout IS used, but only for the two long grace windows (again/lobby
// reset) — it exists in browsers and Node alike and survives a paused caller.

import {
  createGame, addPlayer, removePlayer, setMoveTarget, castSpell, buy,
  startGame, step, snapshot, viewEvents, stepBot, botShop, setShopReady, setShopPause,
  setSpectator, fighters, setMode, setDraft, setTesting, draftPick, setTeam,
} from './sim.js';
import { BOTS, BUILDS } from './constants.js';

const BOT_NAMES = ['Gul\'dan', 'Kil\'jaeden', 'Cho\'gall', 'Teron', 'Nerzhul', 'Archimonde'];
const BOT_AVATARS = ['👹', '💀', '👺', '🧟', '🐉', '😈'];

export const normName = (n) => String(n || '').trim().toLowerCase().slice(0, 16);

// Reconnect persistence (2026-08-05): a human who drops mid-game keeps their
// progress. Stash under normalized NAME, restore on the next join with that
// name within the TTL. Stashes die with the game — names are trusted within a
// friends lobby, same as bans.
const GHOST_TTL_MS = 10 * 60 * 1000;

export function createEngine({
  seed = (Math.random() * 2 ** 31) | 0,
  maxPlayers = 10,
  mode,
  state = null,                 // a blob from serialize(); resumes that game
  onSend = () => {},            // (connId, msgObject) — the only way out
  onKick = () => {},            // (connId, {ban}) — adapter closes the pipe / records the IP
  onUnbanAll = () => {},        // adapter clears its IP bans
  onLog = () => {},             // (k, data) — journal hook; adapter decides where it goes
  externalBans = () => 0,       // adapter's IP-ban count (folded into the snap `bans` field)
  // How long the final standings stay up for the stragglers once somebody has
  // clicked Continue.
  againGraceMs = 45000,
  // Humans-all-gone mid-game: wait this long for a reconnect before resetting.
  resetGraceMs = 60000,
} = {}) {
  if (state && state.seed != null) seed = state.seed;
  let game = state ? state.game : createGame({ seed, mode });
  let nextBotId = state ? state.nextBotId : 1;
  let lastPhase = game.phase;

  const conns = new Set();      // connection ids currently attached (adapter's sockets mirror)
  const pings = new Map();      // connId -> ms, fed by setPing (ws adapter only)
  const bannedNames = new Set();
  const ghosts = new Map();     // normName -> {at, ...progress}
  let againTimer = null;
  let lobbyResetTimer = null;

  // Seats that count against maxPlayers: co-op campaign monsters are spawned by
  // the simulation and must never keep a human out of their own game.
  function playerCount() {
    return Object.values(game.players).filter(p => !p.wave).length;
  }

  function maybeAutoStart() {
    if (game.phase !== 'lobby') return;
    const humans = Object.values(game.players).filter(p => !p.bot);
    // co-op is playable solo (the campaign scales to the party); the free-for-all
    // rulesets still need somebody to fight
    const need = game.mode === 'coop' ? 1 : 2;
    if (humans.length >= 1 && humans.every(p => p.ready) && fighters(game).length >= need) {
      startGame(game);
    }
  }

  function resetToLobby() {
    onLog('reset', {});
    clearTimeout(againTimer); againTimer = null;
    ghosts.clear(); // progress stashes never outlive the game they came from
    const old = game.players;
    const wasDraft = game.draft;
    const wasTesting = game.testing;
    // the ruleset (like avatars) survives "play again"
    game = createGame({ seed: seed + game.round + 1, mode: game.mode });
    // ...and so do the draft and testing toggles (the pool is re-rolled per game)
    game.draft = wasDraft;
    game.testing = wasTesting;
    for (const [id, p] of Object.entries(old)) {
      if (p.wave) continue; // campaign monsters belong to the level, not the lobby
      if (p.bot || conns.has(id)) {
        const np = addPlayer(game, id, p.name, {
          bot: p.bot, color: p.color, avatar: p.avatar, kind: p.kind, build: p.build,
          // the versus team survives "play again" like the colour and avatar —
          // a lobby arrangement, not a per-game one. A co-op team is a STRING
          // set by the campaign each round, so it is deliberately not carried.
          team: typeof p.team === 'number' ? p.team : undefined,
        });
        np.ready = false;
        np.spectator = p.spectator;
      }
    }
  }

  function scheduleLobbyReset() {
    if (lobbyResetTimer) return;
    onLog('reset-scheduled', { inMs: resetGraceMs });
    lobbyResetTimer = setTimeout(() => {
      lobbyResetTimer = null;
      // a human made it back during the grace window: keep the game alive
      if (Object.values(game.players).some(p => !p.bot)) return;
      resetToLobby();
    }, resetGraceMs);
  }
  function cancelLobbyReset() {
    if (!lobbyResetTimer) return;
    clearTimeout(lobbyResetTimer);
    lobbyResetTimer = null;
  }

  return {
    get game() { return game; },

    // -> {ok:true} | {ok:false, reason}. The caller sends welcome/denied and
    // registers its pipe; a truthy return means the conn is seated and will
    // receive snapshots until leave().
    join(connId, { name, avatar } = {}) {
      if (bannedNames.has(normName(name))) {
        return { ok: false, reason: 'banned from this lobby' };
      }
      if (playerCount() >= maxPlayers) {
        return { ok: false, reason: 'game is full' };
      }
      const pl = addPlayer(game, connId, name || 'warlock', {
        avatar: typeof avatar === 'string' ? avatar : undefined,
      });
      if (game.phase === 'countdown') {
        // the fight hasn't started yet — seat them straight into this round
        pl.alive = true;
        const n = Object.keys(game.players).length;
        const a = n * 2.39996; // golden angle: spreads any number of joiners
        const r = 56 * 0.6;
        pl.x = Math.cos(a) * r; pl.y = Math.sin(a) * r;
      } else if (game.phase !== 'lobby') {
        // mid-battle joiners are seated but dead until the next round
        pl.alive = false;
      }
      cancelLobbyReset(); // a human is back: the game no longer needs to die
      // returning player? restore the progress their dropped socket stashed
      const ghost = ghosts.get(normName(name));
      if (ghost && Date.now() - ghost.at < GHOST_TTL_MS && game.phase !== 'lobby') {
        pl.color = ghost.color;
        if (pl.avatar === '🧙') pl.avatar = ghost.avatar;
        // your side comes back with you: reconnecting onto the enemy team
        // mid-game would hand the other side a free ally (round 21.3)
        if (ghost.team != null) pl.team = ghost.team;
        pl.gold = ghost.gold; pl.goldEarned = ghost.goldEarned;
        pl.kills = ghost.kills; pl.deaths = ghost.deaths;
        pl.dmgDealt = ghost.dmgDealt;
        pl.maxHp = ghost.maxHp; // amulet hp travels here — never re-apply items
        pl.hp = Math.min(pl.hp, pl.maxHp);
        pl.spells = ghost.spells; pl.items = ghost.items; pl.elements = ghost.elements;
        pl.angerMarks = ghost.angerMarks || 0; // the permanent anger bank survives
        ghosts.delete(normName(name));
        onLog('reconnect-restore', { id: connId, name: pl.name, kills: pl.kills, gold: pl.gold });
      }
      conns.add(connId);
      return { ok: true };
    },

    // the existing wire protocol, verbatim (post-join messages)
    message(id, m) {
      const pl = game.players[id];
      if (!pl) return;
      switch (m.t) {
        case 'ready':
          if (game.phase === 'shop') { setShopReady(game, id, !!m.ready); break; }
          pl.ready = !!m.ready;
          maybeAutoStart();
          break;
        case 'shopPause':
          setShopPause(game, id, !!m.on);
          break;
        case 'spectate':
          setSpectator(game, id, !!m.on);
          maybeAutoStart();
          break;
        case 'mode':
          // any player may flip the ruleset, but only in the lobby;
          // setMode validates both the phase and the value
          if (typeof m.mode === 'string') setMode(game, m.mode);
          break;
        case 'draft':
          // draft mode is an INDEPENDENT flag, not a fourth ruleset: it composes
          // with classic, elemental and co-op. Lobby only, like 'mode'.
          setDraft(game, !!m.on);
          break;
        case 'testing':
          // testing sandbox: chosen starting gold, game opens in an untimed
          // shop. A flag like draft, lobby only; setTesting validates.
          setTesting(game, !!m.on, m.gold);
          break;
        case 'team':
          // Versus teams (round 21.3): you set your OWN number. `m.id` is
          // honoured only for a BOT, so whoever is arranging the lobby can put
          // the bots on a side too; it can never move another human.
          {
            const target = typeof m.id === 'string' && game.players[m.id] &&
              game.players[m.id].bot ? m.id : id;
            setTeam(game, target, m.n);
          }
          break;
        case 'draftPick': {
          const r = draftPick(game, id, String(m.id || ''));
          onLog('draftPick', { id, thing: m.id, ok: r.ok, err: r.err });
          if (!r.ok) onSend(id, { t: 'denied', reason: r.err });
          break;
        }
        case 'move':
          if (typeof m.x === 'number' && typeof m.y === 'number')
            setMoveTarget(game, id, m.x, m.y);
          break;
        case 'cast':
          if (typeof m.x === 'number' && typeof m.y === 'number' && typeof m.key === 'string')
            castSpell(game, id, m.key, m.x, m.y);
          break;
        case 'buy': {
          const r = buy(game, id, String(m.id || ''));
          onLog('buy', { id, thing: m.id, ok: r.ok, err: r.err });
          if (!r.ok) onSend(id, { t: 'denied', reason: r.err });
          break;
        }
        case 'addBot': {
          if (game.phase !== 'lobby' || playerCount() >= maxPlayers) break;
          const kind = Object.hasOwn(BOTS, m.kind) ? m.kind : 'grunt';
          // build strategy: explicit lobby pick, or a random one ('random'/absent).
          // Issue #7: a `kinds` build is restricted to those tiers (the Faker's
          // combo arsenals), and those tiers get ONLY their own builds — a
          // combo bot with a generic build is just Extreme, which defeats it.
          const buildKeys = Object.keys(BUILDS).filter(k =>
            BUILDS[k].kinds ? BUILDS[k].kinds.includes(kind)
              : !Object.values(BUILDS).some(b => b.kinds && b.kinds.includes(kind)));
          const build = typeof m.build === 'string' && buildKeys.includes(m.build)
            ? m.build : buildKeys[(Math.random() * buildKeys.length) | 0];
          const bid = 'bot' + nextBotId++;
          const bp = addPlayer(game, bid, BOT_NAMES[(nextBotId - 2) % BOT_NAMES.length], {
            bot: true, kind, build, avatar: BOT_AVATARS[(nextBotId - 2) % BOT_AVATARS.length],
          });
          bp.ready = true;
          maybeAutoStart();
          break;
        }
        case 'removeBot': {
          const bots = Object.values(game.players).filter(p => p.bot);
          if (bots.length && game.phase === 'lobby') removePlayer(game, bots[bots.length - 1].id);
          break;
        }
        case 'kick': {
          // lobby-only: boot a HUMAN player (ghost seats, AFK friends). With
          // ban:true their name stays blocked (the adapter adds the IP) until
          // the room dies — else an abandoned tab auto-reconnects 2 s later.
          if (game.phase !== 'lobby' || typeof m.id !== 'string') break;
          const target = game.players[m.id];
          if (!target || target.bot || m.id === id) break;
          if (m.ban) bannedNames.add(normName(target.name));
          onSend(m.id, { t: 'denied', reason: m.ban ? 'banned from this lobby' : 'kicked from the lobby' });
          onKick(m.id, { ban: !!m.ban });
          conns.delete(m.id);
          onLog('kick', { by: id, target: m.id, ban: !!m.ban });
          removePlayer(game, m.id);
          maybeAutoStart();
          break;
        }
        case 'unbanAll': {
          onLog('unbanAll', { by: id, names: bannedNames.size, ips: externalBans() });
          bannedNames.clear();
          onUnbanAll();
          break;
        }
        case 'again':
          // Everyone reads the final standings at their own pace, so one player
          // hitting Continue must NOT yank the table off everybody else's
          // screen. The lobby comes back when every connected human has
          // acknowledged — but one AFK player must not hold it hostage forever.
          if (game.phase !== 'gameover') break;
          pl.againReady = true;
          onLog('again', { id });
          if (Object.values(game.players).every(p => p.bot || !conns.has(p.id) || p.againReady)) {
            clearTimeout(againTimer); againTimer = null;
            resetToLobby();
          } else if (!againTimer) {
            againTimer = setTimeout(() => {
              againTimer = null;
              if (game.phase === 'gameover') resetToLobby();
            }, againGraceMs);
          }
          break;
      }
    },

    // disconnect path. Idempotent: safe to call for an already-removed player
    // (a kick closes the pipe, whose close event lands here a beat later).
    leave(connId) {
      conns.delete(connId);
      pings.delete(connId);
      // stash a mid-game fighter's progress so a reconnect (same name) keeps it
      const pl = game.players[connId];
      if (pl && !pl.bot && !pl.spectator &&
          game.phase !== 'lobby' && game.phase !== 'gameover') {
        ghosts.set(normName(pl.name), {
          at: Date.now(), color: pl.color, avatar: pl.avatar, team: pl.team,
          gold: pl.gold, goldEarned: pl.goldEarned, kills: pl.kills,
          deaths: pl.deaths, dmgDealt: pl.dmgDealt, maxHp: pl.maxHp,
          spells: { ...pl.spells }, items: { ...pl.items },
          elements: { ...(pl.elements || {}) },
          // Anger's mark bank is game-long, so a tunnel hiccup must not erase
          // the power earned over 20 rounds of claimed marks
          angerMarks: pl.angerMarks || 0,
        });
        onLog('reconnect-stash', { id: connId, name: pl.name, kills: pl.kills, gold: pl.gold });
      }
      removePlayer(game, connId);
      if (playerCount() === 0 || Object.values(game.players).every(p => p.bot)) {
        // don't let bot-only games spin forever — but if a game is RUNNING,
        // give the vanished humans a grace window to reconnect first (a tunnel
        // hiccup must not wipe a solo-vs-bots game; see the ghost stash above)
        if (game.phase === 'lobby' || game.phase === 'gameover') resetToLobby();
        else scheduleLobbyReset();
      }
    },

    // one simulation step: physics + bots + shop entry. The CALLER owns the
    // clock — call at TICK_RATE with dt = 1/TICK_RATE.
    tick(dt) {
      step(game, dt);
      for (const p of Object.values(game.players)) {
        if (p.bot) stepBot(game, p.id, dt);
      }
      if (game.phase === 'shop' && lastPhase !== 'shop') {
        for (const p of Object.values(game.players)) if (p.bot) botShop(game, p.id);
      }
      lastPhase = game.phase;
    },

    // PER-VIEWER snapshots (round 12): element stacks are private to whoever
    // applied them, so each conn gets its own view; the event stream likewise
    // (Vanish would leak through a shared one). Drains game.events.
    pushSnapshots() {
      if (conns.size === 0) { game.events = []; return; }
      const events = game.events;
      game.events = [];
      // per-player RTT (adapter-fed, ws only): one shared blob — a ping is not
      // a secret, and every viewer wants to see who is lagging. Absent when no
      // adapter reports one (solo/RTC), which the client renders as "no badge".
      const pingBlob = {};
      for (const [pid, ms] of pings) if (Number.isFinite(ms)) pingBlob[pid] = Math.round(ms);
      const havePings = Object.keys(pingBlob).length > 0;
      // lobby ban count (room-level, not game state): the client shows its
      // "Unban all" button only when there is actually something to lift
      const banCount = bannedNames.size + externalBans();
      for (const id of conns) {
        onSend(id, {
          t: 'snap', s: snapshot(game, id), e: viewEvents(game, events, id),
          ...(banCount ? { bans: banCount } : {}),
          ...(havePings ? { pings: pingBlob } : {}),
        });
      }
    },

    // adapter feeds RTT in; the engine just reports it in snapshots
    setPing(connId, ms) {
      if (Number.isFinite(ms)) pings.set(connId, ms);
    },

    // B4 prep (host migration): the full room state as a JSON-safe blob.
    // The rng cursor is a plain field on the game (sim.js rng()), so a restored
    // engine replays step-for-step identically — test-locked in engine.test.js.
    serialize() {
      return JSON.parse(JSON.stringify({ game, nextBotId, seed }));
    },

    // clears the grace timers; a discarded engine must not reset a dead game
    destroy() {
      clearTimeout(againTimer); againTimer = null;
      clearTimeout(lobbyResetTimer); lobbyResetTimer = null;
    },
  };
}
