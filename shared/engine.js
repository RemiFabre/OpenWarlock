// OpenWarlock: transport-agnostic authoritative game room.
// Extracted verbatim from server/index.js (2026-08-09) so the same room can run
// behind the Node ws server, inside a browser tab (solo vs bots), or behind a
// WebRTC host later. docs/BRIEF-browser-hosting.md is the spec.
//
// The line this module holds: the engine knows CONNECTION IDS and NAMES.
// It never sees sockets, IPs, files, or the game-loop clock; the caller owns
// the 30 Hz tick / 15 Hz snapshot cadence and all I/O:
//   - name-bans, ghosts/reconnect, kick, seating -> here (they are game state)
//   - IP-bans, journal, crash dumps, /health, static serving -> the adapter
// setTimeout IS used, but only for the lobby-reset grace window; it exists
// in browsers and Node alike and survives a paused caller.

import {
  createGame, addPlayer, removePlayer, setMoveTarget, castSpell, buy, undoBuy, refundBuy,
  startGame, step, snapshot, viewEvents, stepBot, botShop, setShopReady, setShopPause,
  setSpectator, fighters, setMode, setDraft, setTesting, draftPick, setTeam,
  optimPick,
} from './sim.js';
import { BOTS, BUILDS, AVATARS } from './constants.js';

// Per-kind name pools (round 22, Remi: switching difficulty should feel like
// meeting new bots). The classic six stayed on Hard. A lobby never repeats a
// name while any is unused: own pool first, then borrow (see botName below).
const TARGET_NAMES = ['Sandbag', 'Piñata', 'Bullseye', 'Tin Can', 'Scarecrow'];
export const BOT_NAMES = {
  grunt:     ['Zug-Zug', 'Grubnub', 'Snotbog', 'Wobbla', 'Peon Pip'],
  brawler:   ['Grommash', 'Durotan', 'Orgrim', 'Nazgrel', 'Broxigar'],
  berserker: ['Gul\'dan', 'Kil\'jaeden', 'Cho\'gall', 'Teron', 'Nerzhul', 'Archimonde'],
  stalker:   ['Mannoroth', 'Tichondrius', 'Magtheridon', 'Mal\'Ganis', 'Sargeras'],
  faker:     ['Loki', 'Anansi', 'Puck', 'Kitsune', 'Coyote'],
  runner:    TARGET_NAMES,
  dummy:     TARGET_NAMES, // the two sparring tiers share the target-practice pool
};
// issue #14 (Sam v5): bots wear illustrated faces too, from the same set, so
// the roster is not half painted and half emoji.
// ⚠ every entry MUST exist in AVATARS: a name outside the roster has no
// artwork, and the arena used to fall back to drawing the id as text
// ('ghost' after the v8 roster swap). Test-locked.
const BOT_AVATARS = ['demon', 'spectre', 'spider', 'necromancer', 'dragon', 'wolf'];

export const normName = (n) => String(n || '').trim().toLowerCase().slice(0, 16);

// Reconnect persistence (2026-08-05): a human who drops mid-game keeps their
// progress. Stash under normalized NAME, restore on the next join with that
// name within the TTL. Stashes die with the game; names are trusted within a
// friends lobby, same as bans.
const GHOST_TTL_MS = 10 * 60 * 1000;

export function createEngine({
  seed = (Math.random() * 2 ** 31) | 0,
  maxPlayers = 10,
  mode,
  state = null,                 // a blob from serialize(); resumes that game
  onSend = () => {},            // (connId, msgObject): the only way out
  onKick = () => {},            // (connId, {ban}): adapter closes the pipe / records the IP
  onUnbanAll = () => {},        // adapter clears its IP bans
  onLog = () => {},             // (k, data): journal hook; adapter decides where it goes
  externalBans = () => 0,       // adapter's IP-ban count (folded into the snap `bans` field)
  // Humans-all-gone mid-game: wait this long for a reconnect before resetting.
  resetGraceMs = 60000,
  // Faker (issue #7): a fresh lobby opens with a Faker already seated. True on
  // the issue-7-faker demo version; on MAIN it defaults off (bots are added
  // by choice (round 22 port).
  demoBot = false,
} = {}) {
  if (state && state.seed != null) seed = state.seed;
  let game = state ? state.game : createGame({ seed, mode });
  let nextBotId = state ? state.nextBotId : 1;
  // Faker (issue #7): the version opens SHOWING its tier; a Faker with a
  // random combo arsenal is already seated in every fresh lobby. Remove it
  // like any bot; "play again" carries it like any bot.
  if (demoBot && !state && mode !== 'coop') {
    const arsenals = Object.keys(BUILDS).filter(k => (BUILDS[k].kinds || []).includes('faker'));
    const bp = addPlayer(game, 'bot' + nextBotId++, botName('faker'), {
      bot: true, kind: 'faker',
      build: arsenals[(Math.random() * arsenals.length) | 0], avatar: BOT_AVATARS[0],
    });
    bp.ready = true;
  }
  let lastPhase = game.phase;

  const conns = new Set();      // connection ids currently attached (adapter's sockets mirror)
  const pings = new Map();      // connId -> ms, fed by setPing (ws adapter only)
  const bannedNames = new Set();
  const ghosts = new Map();     // normName -> {at, ...progress}
  let lobbyResetTimer = null;
  // Round 23 (Remi): the HOST is the oldest seated connection. Rules, bots and
  // kicks are theirs alone; everyone else picks their own seat (play/watch,
  // own team, avatar) and reads the rules. conns keeps insertion order, so a
  // dropped host promotes the next-oldest automatically.
  const hostId = () => { for (const c of conns) if (game.players[c]) return c; return null; };
  let chatterOn = true;         // avatar reactions (round 23): room config, host-set, rides the snap

  // Seats that count against maxPlayers: co-op campaign monsters are spawned by
  // the simulation and must never keep a human out of their own game.
  function playerCount() {
    return Object.values(game.players).filter(p => !p.wave).length;
  }

  // An unused name from the kind's own pool, else borrowed from the others.
  // "Unused" is per LOBBY (humans included), so names never repeat while any
  // pool name is free; "play again" carries names on the player, not here.
  function botName(kind) {
    const used = new Set(Object.values(game.players).map(p => p.name));
    const own = BOT_NAMES[kind] || [];
    for (const pool of [own, ...Object.values(BOT_NAMES).filter(p => p !== own)]) {
      const free = pool.filter(n => !used.has(n));
      if (free.length) return free[(Math.random() * free.length) | 0];
    }
    return 'Bot ' + nextBotId; // every pool exhausted (cannot happen at 10 seats)
  }

  // One face per warlock (round 22.1): a joiner who picked nothing (or picked
  // a face already worn in this lobby) gets a random FREE one instead.
  function freeAvatar(want) {
    const taken = new Set(Object.values(game.players).map(p => p.avatar));
    // only a face from the roster is honoured: a stale emoji from an older
    // client rolls a free illustrated one instead of sticking as text
    const w = AVATARS.includes(want) ? want : '';
    if (w && !taken.has(w)) return w;
    const free = AVATARS.filter(a => !taken.has(a));
    return free.length ? free[(Math.random() * free.length) | 0] : (w || AVATARS[0]);
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
          // the versus team survives "play again" like the colour and avatar;
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
      const pickedOwn = typeof avatar === 'string' && avatar.trim() !== '';
      const pl = addPlayer(game, connId, name || 'warlock', { avatar: freeAvatar(avatar) });
      if (game.phase === 'countdown') {
        // the fight hasn't started yet; seat them straight into this round
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
        if (!pickedOwn) pl.avatar = freeAvatar(ghost.avatar); // keep the ghost's face if it is still free
        // your side comes back with you: reconnecting onto the enemy team
        // mid-game would hand the other side a free ally (round 21.3)
        if (ghost.team != null) pl.team = ghost.team;
        pl.gold = ghost.gold; pl.goldEarned = ghost.goldEarned;
        pl.kills = ghost.kills; pl.deaths = ghost.deaths;
        pl.dmgDealt = ghost.dmgDealt;
        pl.maxHp = ghost.maxHp; // amulet hp travels here; never re-apply items
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
      // host gate (round 23): rules/bots/kicks are refused with a visible
      // denied, so a guest's click explains itself instead of doing nothing
      const hostOnly = () => {
        if (id === hostId()) return true;
        onSend(id, { t: 'denied', reason: 'only the host changes that' });
        return false;
      };
      switch (m.t) {
        case 'ready':
          if (game.phase === 'shop') { setShopReady(game, id, !!m.ready); break; }
          pl.ready = !!m.ready;
          maybeAutoStart();
          break;
        case 'shopPause':
          setShopPause(game, id, !!m.on);
          break;
        case 'avatar': {
          // the lobby picker (round 22.1): one avatar per face. A taken one is
          // refused silently and the snapshot keeps your current look.
          // ⚠ v5.2 (Sam): this used to TRUNCATE to 8 characters, an emoji-sized
          // cap that quietly broke every roster name longer than that
          // ('elemental_fire' -> 'elementa'), so those faces could be picked
          // but never appeared. Validate against the roster instead of cutting.
          const want = AVATARS.includes(m.avatar) ? m.avatar : '';
          if (want && !Object.values(game.players).some(p => p.id !== id && p.avatar === want))
            pl.avatar = want;
          break;
        }
        case 'spectate':
          setSpectator(game, id, !!m.on);
          maybeAutoStart();
          break;
        case 'mode':
          // host only (round 23), lobby only; setMode validates phase and value
          if (!hostOnly()) break;
          if (typeof m.mode === 'string') setMode(game, m.mode);
          break;
        case 'draft':
          // draft mode is an INDEPENDENT flag, not a fourth ruleset: it composes
          // with classic, elemental and co-op. Lobby only, like 'mode'.
          if (!hostOnly()) break;
          setDraft(game, !!m.on);
          break;
        case 'testing':
          // testing sandbox: chosen starting gold, game opens in an untimed
          // shop. A flag like draft, lobby only; setTesting validates.
          if (!hostOnly()) break;
          setTesting(game, !!m.on, m.gold);
          break;
        case 'chatter':
          // avatar reactions on/off (round 23): room config like the flags
          // above, but engine-level (cosmetic, never game state)
          if (!hostOnly()) break;
          if (game.phase === 'lobby') chatterOn = !!m.on;
          break;
        case 'team':
          // Versus teams (round 21.3): you set your OWN number. `m.id` is
          // honoured only for a BOT, so the HOST can put the bots on a side
          // too; it can never move another human.
          {
            const wantBot = typeof m.id === 'string' && game.players[m.id] &&
              game.players[m.id].bot;
            if (wantBot && !hostOnly()) break;
            setTeam(game, wantBot ? m.id : id, m.n);
          }
          break;
        case 'draftPick': {
          const r = draftPick(game, id, String(m.id || ''));
          onLog('draftPick', { id, thing: m.id, ok: r.ok, err: r.err });
          if (!r.ok) onSend(id, { t: 'denied', reason: r.err });
          break;
        }
        case 'optimPick': {
          const r = optimPick(game, id, String(m.id || ''));
          onLog('optimPick', { id, thing: m.id, ok: r.ok, err: r.err });
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
        case 'undo': {
          // refund the last buy of THIS shop (misclick insurance, round 22.2)
          const r = undoBuy(game, id);
          onLog('undo', { id, ok: r.ok, err: r.err });
          if (!r.ok) onSend(id, { t: 'denied', reason: r.err });
          break;
        }
        case 'refund': {
          // right-click: refund ONE card's last purchase of THIS shop
          // (issue #14 iteration 4, Sam)
          const r = refundBuy(game, id, String(m.id || ''));
          onLog('refund', { id, thing: m.id, ok: r.ok, err: r.err });
          if (!r.ok) onSend(id, { t: 'denied', reason: r.err });
          break;
        }
        // issue #14 (Sam v6): the strategy picker moved OUT of "add bots" and
        // INTO the bot's row in the warlock list, so a seated bot's build has
        // to be changeable. Host-only and lobby-only, like every other bot
        // control; the build itself does exactly what it always did.
        case 'botBuild': {
          if (!hostOnly()) break;
          if (game.phase !== 'lobby') break;
          const bp = game.players[String(m.id || '')];
          if (!bp || !bp.bot) break;
          const allowed = Object.keys(BUILDS).filter(k =>
            BUILDS[k].kinds ? BUILDS[k].kinds.includes(bp.kind)
              : !Object.values(BUILDS).some(b => b.kinds && b.kinds.includes(bp.kind)));
          if (allowed.includes(String(m.build))) bp.build = String(m.build);
          break;
        }
        case 'addBot': {
          if (!hostOnly()) break;
          if (game.phase !== 'lobby' || playerCount() >= maxPlayers) break;
          const kind = Object.hasOwn(BOTS, m.kind) ? m.kind : 'grunt';
          // build strategy: explicit lobby pick, or a random one ('random'/absent).
          // Issue #7: a `kinds` build is restricted to those tiers (the Faker's
          // combo arsenals), and those tiers get ONLY their own builds; a
          // combo bot with a generic build is just Extreme, which defeats it.
          const buildKeys = Object.keys(BUILDS).filter(k =>
            BUILDS[k].kinds ? BUILDS[k].kinds.includes(kind)
              : !Object.values(BUILDS).some(b => b.kinds && b.kinds.includes(kind)));
          const build = typeof m.build === 'string' && buildKeys.includes(m.build)
            ? m.build : buildKeys[(Math.random() * buildKeys.length) | 0];
          const bid = 'bot' + nextBotId++;
          const bp = addPlayer(game, bid, botName(kind), {
            bot: true, kind, build, avatar: BOT_AVATARS[(nextBotId - 2) % BOT_AVATARS.length],
          });
          bp.ready = true;
          maybeAutoStart();
          break;
        }
        case 'removeBot': {
          // round 22 (per-row remove buttons): an optional m.id names WHICH bot
          // goes: a bot only, never a human (kick owns those). No id keeps the
          // old behavior: the last-added bot leaves.
          if (!hostOnly()) break;
          if (game.phase !== 'lobby') break;
          const bots = Object.values(game.players).filter(p => p.bot);
          const target = typeof m.id === 'string'
            ? bots.find(p => p.id === m.id) : bots[bots.length - 1];
          if (target) removePlayer(game, target.id);
          break;
        }
        case 'kick': {
          // lobby-only: boot a HUMAN player (ghost seats, AFK friends). With
          // ban:true their name stays blocked (the adapter adds the IP) until
          // the room dies; else an abandoned tab auto-reconnects 2 s later.
          if (!hostOnly()) break;
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
          if (!hostOnly()) break;
          onLog('unbanAll', { by: id, names: bannedNames.size, ips: externalBans() });
          bannedNames.clear();
          onUnbanAll();
          break;
        }
        case 'again':
          // Round 22.2 (Remi): whoever clicks Continue gets the lobby NOW, no
          // waiting on the others. Stragglers lose nothing: their client PINS
          // the standings until they click too (goPinned in main.js), so the
          // table is never yanked. The reset simply happens under it.
          if (game.phase !== 'gameover') break;
          onLog('again', { id });
          resetToLobby();
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
        // don't let bot-only games spin forever; but if a game is RUNNING,
        // give the vanished humans a grace window to reconnect first (a tunnel
        // hiccup must not wipe a solo-vs-bots game; see the ghost stash above)
        if (game.phase === 'lobby' || game.phase === 'gameover') resetToLobby();
        else scheduleLobbyReset();
      }
    },

    // one simulation step: physics + bots + shop entry. The CALLER owns the
    // clock; call at TICK_RATE with dt = 1/TICK_RATE.
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
      // per-player RTT (adapter-fed, ws only): one shared blob; a ping is not
      // a secret, and every viewer wants to see who is lagging. Absent when no
      // adapter reports one (solo/RTC), which the client renders as "no badge".
      const pingBlob = {};
      for (const [pid, ms] of pings) if (Number.isFinite(ms)) pingBlob[pid] = Math.round(ms);
      const havePings = Object.keys(pingBlob).length > 0;
      // lobby ban count (room-level, not game state): the client shows its
      // "Unban all" button only when there is actually something to lift
      const banCount = bannedNames.size + externalBans();
      const host = hostId(); // room-level, like bans: who owns the rule controls
      for (const id of conns) {
        onSend(id, {
          t: 'snap', s: snapshot(game, id), e: viewEvents(game, events, id),
          ...(banCount ? { bans: banCount } : {}),
          ...(havePings ? { pings: pingBlob } : {}),
          ...(host ? { host } : {}),
          ...(chatterOn ? {} : { chat: false }),
        });
      }
    },

    // adapter feeds RTT in; the engine just reports it in snapshots
    setPing(connId, ms) {
      if (Number.isFinite(ms)) pings.set(connId, ms);
    },

    // B4 prep (host migration): the full room state as a JSON-safe blob.
    // The rng cursor is a plain field on the game (sim.js rng()), so a restored
    // engine replays step-for-step identically; test-locked in engine.test.js.
    serialize() {
      return JSON.parse(JSON.stringify({ game, nextBotId, seed }));
    },

    // clears the grace timer; a discarded engine must not reset a dead game
    destroy() {
      clearTimeout(lobbyResetTimer); lobbyResetTimer = null;
    },
  };
}
