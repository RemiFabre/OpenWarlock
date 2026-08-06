// Sound effects — everything synthesized with WebAudio, no external files.
// One shared AudioContext, created lazily on the first user gesture (initSfx
// is called from the join click). Every public call is try/catch-safe: audio
// must never crash the game.

let ctx = null;
let master = null;
let noiseBuf = null;

const MASTER_GAIN = 0.3;

let muted = false;
try { muted = localStorage.getItem('owMuted') === '1'; } catch { /* storage unavailable */ }

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem('owMuted', muted ? '1' : '0'); } catch { }
  try { if (master) master.gain.value = muted ? 0 : MASTER_GAIN; } catch { }
}

// Create the AudioContext. Call from a user gesture (browsers block earlier);
// safe to call repeatedly — later calls just try to resume a suspended context.
export function initSfx() {
  try {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => { });
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);
    if (ctx.state === 'suspended') ctx.resume().catch(() => { });
  } catch { ctx = null; master = null; }
}

// ---- synth building blocks -------------------------------------------------

// Single enveloped oscillator, optional frequency sweep f0 -> f1 over dur.
function tone({ type = 'sine', f0 = 440, f1 = null, t0 = 0, dur = 0.2, vol = 0.5 }) {
  const start = ctx.currentTime + t0;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), start);
  if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.05);
}

// Enveloped filtered noise, optional filter-frequency sweep f0 -> f1.
function noise({ t0 = 0, dur = 0.2, vol = 0.4, filter = 'bandpass', f0 = 1000, f1 = null, q = 1 }) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.5), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const start = ctx.currentTime + t0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(Math.max(1, f0), start);
  if (f1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(master);
  src.start(start);
  src.stop(start + dur + 0.05);
}

// ---- effects ----------------------------------------------------------------
// All short (<400 ms) except the gameover fanfare.

const FX = {
  // fireball cast: soft whoosh — bandpass noise sweeping up
  whoosh() { noise({ dur: 0.24, vol: 0.5, filter: 'bandpass', f0: 380, f1: 2100, q: 1.3 }); },

  // projectile impact: sine drop thump + low noise burst
  boom() {
    tone({ type: 'sine', f0: 165, f1: 42, dur: 0.28, vol: 0.9 });
    noise({ dur: 0.13, vol: 0.5, filter: 'lowpass', f0: 900, f1: 130 });
  },

  // lightning beam: electric zap — fast saw drop + crackle
  zap() {
    tone({ type: 'sawtooth', f0: 1900, f1: 210, dur: 0.14, vol: 0.32 });
    noise({ dur: 0.1, vol: 0.22, filter: 'highpass', f0: 2600, q: 0.8 });
  },

  // death: low boom + descending tone
  death() {
    tone({ type: 'sine', f0: 100, f1: 33, dur: 0.38, vol: 0.9 });
    tone({ type: 'triangle', f0: 440, f1: 88, dur: 0.34, vol: 0.35, t0: 0.02 });
  },

  // teleport / rush: rising chirp
  teleport() { tone({ type: 'sine', f0: 280, f1: 1500, dur: 0.2, vol: 0.4 }); },

  // shield reflect: metallic ping — two detuned high partials
  reflect() {
    tone({ type: 'triangle', f0: 1320, dur: 0.18, vol: 0.3 });
    tone({ type: 'triangle', f0: 1980, dur: 0.11, vol: 0.18 });
  },

  // countdown tick (3-2-1) and round-start go
  tick() { tone({ type: 'square', f0: 660, dur: 0.07, vol: 0.22 }); },
  go() { tone({ type: 'square', f0: 990, f1: 1320, dur: 0.18, vol: 0.32 }); },

  // boomerang caught: crisp upward snap (your cooldown just halved)
  catch() { tone({ type: 'triangle', f0: 990, f1: 1480, dur: 0.09, vol: 0.3 }); },

  // you scored a kill: quick bright three-note celebration
  kill() {
    [659.25, 880, 1318.5].forEach((f, i) =>
      tone({ type: 'triangle', f0: f, dur: 0.12, vol: 0.32, t0: i * 0.06 }));
  },

  // multi-kill announcer: the streak length picks how far the arpeggio climbs,
  // so a Penta sounds unmistakably bigger than a Double without new samples
  multikill(n = 2) {
    const steps = Math.max(2, Math.min(6, Math.round(+n) || 2));
    for (let i = 0; i < steps; i++) {
      tone({ type: 'square', f0: 523.25 * 2 ** (i / 4), dur: 0.13, vol: 0.26, t0: i * 0.075 });
      tone({ type: 'triangle', f0: 1046.5 * 2 ** (i / 4), dur: 0.1, vol: 0.14, t0: i * 0.075 });
    }
    tone({ type: 'sine', f0: 120, f1: 48, dur: 0.5, vol: 0.55 });
  },

  // frost detonation: glassy shatter over a dropping chime
  freeze() {
    tone({ type: 'triangle', f0: 2300, f1: 640, dur: 0.24, vol: 0.22 });
    noise({ dur: 0.3, vol: 0.24, filter: 'highpass', f0: 3200, q: 0.7 });
  },

  // round end: short major arpeggio if I won / soft low note if I died
  victory() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ type: 'triangle', f0: f, dur: 0.15, vol: 0.34, t0: i * 0.08 }));
  },
  defeat() { tone({ type: 'sine', f0: 131, f1: 98, dur: 0.38, vol: 0.42 }); },

  // shop purchase: bright two-note coin click
  buy() {
    tone({ type: 'square', f0: 880, dur: 0.05, vol: 0.2 });
    tone({ type: 'square', f0: 1320, dur: 0.08, vol: 0.2, t0: 0.05 });
  },

  // gameover fanfare (the one allowed long effect, ~1.3 s)
  fanfare() {
    [392, 523.25, 659.25, 783.99].forEach((f, i) =>
      tone({ type: 'triangle', f0: f, dur: 0.2, vol: 0.3, t0: i * 0.13 }));
    [783.99, 987.77, 1174.66].forEach((f) =>
      tone({ type: 'triangle', f0: f, dur: 0.75, vol: 0.2, t0: 0.55 }));
  },
};

// Small per-effect throttle so a burst of identical events (e.g. many booms in
// one snapshot) doesn't stack into a blast.
const lastAt = {};

export function playSfx(name, ...args) {
  try {
    if (!ctx || !master || muted) return;
    const fn = FX[name];
    if (!fn) return;
    const now = performance.now();
    if (now - (lastAt[name] || 0) < 45) return;
    lastAt[name] = now;
    if (ctx.state === 'suspended') ctx.resume().catch(() => { });
    fn(...args);
  } catch { /* audio must never break the game */ }
}
