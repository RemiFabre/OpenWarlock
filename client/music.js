// Music — per-level soundtrack loops from /assets/manifest.json.
// The manifest's levels also carry the background art and title used by
// render.js (same round -> level mapping), so this module owns the manifest.
// Every public call is try/catch-safe: a missing or blocked audio file must
// never break the game. Music mute is separate from SFX ('owMusicMuted').

const VOLUME = 0.35;
const FADE_MS = 900;

let levels = [];        // manifest.levels once fetched
let images = [];        // preloaded background Image per level
let players = null;     // two <audio> elements; crossfade between them
let active = 0;
let fadeTimer = null;
let currentIdx = -1;    // level index currently playing (-1 = nothing yet)
let wantedN = 1;        // last setLevel() argument; replayed once ready
let inited = false;

let musicMuted = false;
try { musicMuted = localStorage.getItem('owMusicMuted') === '1'; } catch { /* storage unavailable */ }

// Round -> level: rounds 1..N map straight; anything else (round 11+, or a
// malformed round) picks a deterministic pseudo-random level from the round
// number, so every client lands on the same track without coordination.
function resolveIndex(n) {
  if (!levels.length) return -1;
  n = Number.isFinite(+n) ? Math.abs(Math.trunc(+n)) : 1;
  if (n >= 1 && n <= levels.length) return n - 1;
  return (n * 2654435761) % levels.length; // Knuth hash, exact below 2^53
}

// Fetch the manifest once at module load (no user gesture needed) and start
// preloading the backgrounds so round transitions don't flash.
(async () => {
  try {
    const res = await fetch('/assets/manifest.json');
    const m = await res.json();
    if (m && Array.isArray(m.levels)) {
      levels = m.levels.filter(lv => lv && typeof lv === 'object');
      images = levels.map(lv => {
        const img = new Image();
        if (typeof lv.background === 'string') img.src = lv.background;
        return img;
      });
    }
    apply();
  } catch { /* no manifest -> no music/backgrounds; the game plays on */ }
})();

// Create the audio elements. Call from a user gesture (the join click);
// safe to call repeatedly — later calls just retry a blocked play().
export function initMusic() {
  try {
    if (!inited) {
      inited = true;
      players = [new Audio(), new Audio()];
      for (const a of players) { a.loop = true; a.preload = 'auto'; a.volume = 0; }
    }
    apply();
  } catch { players = null; }
}

export function setLevel(n) {
  wantedN = n;
  apply();
}

function targetVolume() { return musicMuted ? 0 : VOLUME; }

function apply() {
  try {
    if (!inited || !players || !levels.length) return;
    const idx = resolveIndex(wantedN);
    if (idx < 0) return;
    if (idx === currentIdx) {
      // same track: just make sure it's actually running (autoplay may have
      // blocked an earlier attempt; a later gesture-driven call can succeed)
      const cur = players[active];
      if (cur.paused) {
        cur.volume = targetVolume();
        const p = cur.play();
        if (p && p.catch) p.catch(() => { });
      }
      return;
    }
    const from = players[active];
    const to = players[1 - active];
    active = 1 - active;
    currentIdx = idx;
    to.src = levels[idx].music;
    to.loop = true;
    to.volume = 0;
    const p = to.play();
    if (p && p.catch) p.catch(() => { /* autoplay blocked; a later gesture retries */ });
    // ~1 s crossfade; while muted both stay at 0 but keep playing, so
    // unmuting is instant and stays in sync with the round.
    if (fadeTimer) clearInterval(fadeTimer);
    const t0 = Date.now();
    fadeTimer = setInterval(() => {
      try {
        const k = Math.min(1, (Date.now() - t0) / FADE_MS);
        to.volume = targetVolume() * k;
        from.volume = targetVolume() * (1 - k);
        if (k >= 1) { clearInterval(fadeTimer); fadeTimer = null; from.pause(); }
      } catch { clearInterval(fadeTimer); fadeTimer = null; }
    }, 50);
  } catch { /* audio must never break the game */ }
}

export function isMusicMuted() { return musicMuted; }

export function setMusicMuted(m) {
  musicMuted = !!m;
  try { localStorage.setItem('owMusicMuted', musicMuted ? '1' : '0'); } catch { }
  try {
    if (players && !fadeTimer) { // mid-fade, the timer applies the new target
      players[active].volume = targetVolume();
      players[1 - active].volume = 0;
    }
  } catch { }
}

// The level the renderer should show right now: title + preloaded background
// image (image is null until it has actually arrived).
export function currentLevel() {
  try {
    const idx = resolveIndex(wantedN);
    if (idx < 0) return null;
    const lv = levels[idx];
    const img = images[idx];
    return {
      n: idx + 1,
      title: typeof lv.title === 'string' ? lv.title : '',
      image: (img && img.complete && img.naturalWidth > 0) ? img : null,
    };
  } catch { return null; }
}

// test/debug hook — mirrors window.__phase / __deaths in main.js
try {
  window.__music = () => players ? {
    src: players[active].src,
    paused: players[active].paused,
    err: players[active].error ? players[active].error.code : null,
    level: currentIdx + 1,
  } : null;
} catch { }
