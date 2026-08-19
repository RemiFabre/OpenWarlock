// client playout delay (createGapTracker, shared/snapwire.js).
// The scar this file encodes (2026-08-13, a friend's live trace on Host
// online): his wifi delivered snapshots in CLUMPS (gaps to 284 ms while volume
// stayed at 14.1 updates/s), and the shipped 'step' tracker converted each
// spike into a +300 ms renderDelay step, i.e. the drawn world REWINDING a
// third of a second in one frame. These tests replay that measured pattern;
// the 'step' characterization below is the test that would have caught it.
// history: docs/history/2026-08-14-playout-rewind.md

import { describe, it, expect } from 'vitest';
import { createGapTracker } from '../shared/snapwire.js';

const INTERVAL = 1000 / 15;            // 66.7 ms nominal
const BASE = INTERVAL * 1.6 + 25;      // 131.7 ms, the healthy-link delay

// The friend's link, as measured: steady 15 Hz arrivals, and every ~2 s a
// ~284 ms hole (a keyframe retransmit stall) followed by the held-back
// snapshots landing in a clump. Returns arrival timestamps.
function friendArrivals(seconds = 20) {
  const at = [];
  let t = 0;
  while (t < seconds * 1000) {
    for (let i = 0; i < 26; i++) { at.push(t); t += INTERVAL; }  // ~1.7 s clean
    at.push(t += 284);                                           // the stall
    at.push(t += 5); at.push(t += 5); at.push(t += 5);           // the clump
  }
  return at;
}

// Feed arrivals and, between them, read delay(now) at 60 fps like the render
// loop does. Returns every {now, delay} read plus the drawn-clock excursions.
function render(tracker, arrivals) {
  const reads = [];
  let next = 0, prevRt = -Infinity, maxRewind = 0, maxWiden = 0, prevDelay = null;
  for (let now = 0; now <= arrivals.at(-1); now += 1000 / 60) {
    while (next < arrivals.length && arrivals[next] <= now) tracker.track(arrivals[next++]);
    const d = tracker.delay(now);
    const rt = now - d;
    if (prevDelay != null) maxWiden = Math.max(maxWiden, d - prevDelay);
    maxRewind = Math.max(maxRewind, prevRt - rt);
    prevRt = rt; prevDelay = d;
    reads.push({ now, delay: d });
  }
  return { reads, maxRewind, maxWiden };
}

describe('gap tracker: a clean 15 Hz stream', () => {
  it.each(['step', 'slew'])('converges to the 131.7 ms base and stays there (%s)', (mode) => {
    const g = createGapTracker({ intervalMs: INTERVAL, mode });
    const arrivals = Array.from({ length: 300 }, (_, i) => i * INTERVAL);
    const { reads } = render(g, arrivals);
    for (const r of reads.slice(30)) expect(r.delay).toBeCloseTo(BASE, 5);
  });
});

describe('gap tracker: the friend\'s measured jitter (spikes to 284 ms)', () => {
  it('step mode rewinds the drawn world ~300 ms in one frame (the shipped bug)', () => {
    // Characterization, not aspiration: this is WHY mode 'slew' exists. If it
    // starts failing, the step behavior changed and the main.js comment lies.
    const g = createGapTracker({ intervalMs: INTERVAL, mode: 'step' });
    const { maxRewind } = render(g, friendArrivals());
    expect(maxRewind).toBeGreaterThan(250);
  });

  it('slew mode never moves the drawn clock backwards', () => {
    const g = createGapTracker({ intervalMs: INTERVAL, mode: 'slew' });
    const { maxRewind } = render(g, friendArrivals());
    expect(maxRewind).toBeLessThanOrEqual(0.001);
  });

  it('slew mode bounds the per-frame delay change to the slew rates', () => {
    // 200 ms/s widening at 60 fps = at most ~3.4 ms per drawn frame (a brief
    // 0.8x playback, invisible), instead of the +313 ms single-frame step.
    const g = createGapTracker({ intervalMs: INTERVAL, mode: 'slew', slewUp: 200 });
    const { maxWiden } = render(g, friendArrivals());
    expect(maxWiden).toBeLessThanOrEqual(200 / 60 + 0.001);
  });

  it('slew mode still widens enough to cover the recurring spikes', () => {
    // Target for a 284 ms gap is 284*1.6+25 = 479 ms. With a spike every ~2 s
    // and a 3 s window the target never expires, so after the initial walk-up
    // the buffer must sit at spike coverage, not oscillate back to base.
    const g = createGapTracker({ intervalMs: INTERVAL, mode: 'slew' });
    const { reads } = render(g, friendArrivals(20));
    const settled = reads.filter(r => r.now > 5000);
    expect(Math.min(...settled.map(r => r.delay))).toBeGreaterThan(400);
  });

  it('slew mode forgets an isolated spike and walks back to base', () => {
    // One bad second on an otherwise clean link must not tax the player
    // forever: the window (3 s) expires the spike, then the delay tightens at
    // slewDown. 30 ms/s from ~479 needs ~12 s; give it 20.
    const g = createGapTracker({ intervalMs: INTERVAL, mode: 'slew' });
    const arrivals = [];
    let t = 0;
    for (let i = 0; i < 15; i++) { arrivals.push(t); t += INTERVAL; }
    arrivals.push(t += 284);                       // the one spike
    while (t < 22000) { arrivals.push(t); t += INTERVAL; }
    const { reads } = render(g, arrivals);
    expect(reads.at(-1).delay).toBeCloseTo(BASE, 1);
  });
});

describe('gap tracker: lifecycle', () => {
  it('reset() returns to the healthy-link base (a reconnect must not inherit lag)', () => {
    const g = createGapTracker({ intervalMs: INTERVAL, mode: 'step' });
    g.track(0); g.track(500);                      // one huge gap
    expect(g.stats().renderDelay).toBeGreaterThan(400);
    g.reset();
    expect(g.stats().renderDelay).toBeCloseTo(BASE, 5);
  });
});
