import { describe, it, expect } from 'vitest';
import { createChatter } from '../client/chatter.js';

// Trash Talk (issue #4). The module is pure: an event stream and a roster in,
// a list of bubbles out. `rng` is injected, so "stochastic" is testable;
// rng()=0 accepts every probability roll, rng()=0.99 rejects all but the
// guaranteed ones.
const always = () => 0;
const never = () => 0.99;
const roster = (n = 4) => Array.from({ length: n }, (_, i) => ({
  id: `p${i}`, alive: true, x: i * 3, y: 0,
}));
const said = (c, id) => (c.bubbles.find(b => b.id === id) || {}).text;

describe('Trash Talk (issue #4)', () => {
  it('a big hit speaks on all three sides: victim, sender, bystanders', () => {
    const c = createChatter(always);
    c.onEvent({ t: 'hit', id: 'p0', src: 'p1', amount: 25 }, roster(), 1000);
    expect(said(c, 'p0')).toBeTruthy();
    expect(said(c, 'p1')).toBeTruthy();
    expect(said(c, 'p2')).toBeTruthy();
    expect(said(c, 'p3')).toBeTruthy();
  });

  // Round 23 (Remi): EVERY line, rare ones included, takes the halved dice
  // (FREQ), so "rare" now only means "exempt from the speaker cooldown".
  it('a rare line takes the dice but never the speaker cooldown', () => {
    const quiet = createChatter(never);      // every probability roll fails
    quiet.onEvent({ t: 'hit', id: 'p0', src: 'p1', amount: 30 }, roster(), 1000);
    expect(said(quiet, 'p0')).toBeUndefined(); // the global damper can eat even a big one
    const c = createChatter(always);
    c.onEvent({ t: 'hit', id: 'p0', src: 'p1', amount: 30 }, roster(), 1100);
    const hitLine = said(c, 'p0');
    expect(hitLine).toBeTruthy();            // a big one lands when the dice allow
    c.onEvent({ t: 'death', id: 'p0', killer: 'p1' }, roster(), 1150);
    expect(said(c, 'p0')).toBeTruthy();      // and again, inside the cooldown...
    expect(said(c, 'p0')).not.toBe(hitLine); // ...replacing the hit line
  });

  it('an ordinary line is rate-limited per speaker', () => {
    const c = createChatter(always);
    c.onEvent({ t: 'hit', id: 'p0', amount: 4 }, roster(), 1000);
    const first = said(c, 'p0');
    expect(first).toBeTruthy();
    c.onEvent({ t: 'catch', id: 'p0' }, roster(), 1400);
    expect(said(c, 'p0')).toBe(first);       // too soon: still the old bubble
    c.onEvent({ t: 'catch', id: 'p0' }, roster(), 9000);
    expect(c.bubbles.filter(b => b.id === 'p0').length).toBe(1); // never stacks
  });

  it('never speaks for an attacker it cannot see (that would reveal a Vanish)', () => {
    const c = createChatter(always);
    const hidden = roster();
    delete hidden[1].x;                      // exactly what snapshot() strips
    c.onEvent({ t: 'hit', id: 'p0', src: 'p1', amount: 25 }, hidden, 1000);
    expect(said(c, 'p0')).toBeTruthy();
    expect(said(c, 'p1')).toBeUndefined();
  });

  it('being launched across the arena earns its own line', () => {
    const c = createChatter(always);
    const before = roster();
    const after = roster();
    after[0].x = before[0].x + 40;           // 40 units in one second
    c.onFrame(after, before, 1, 5000);
    expect(said(c, 'p0')).toBeTruthy();
    expect(said(c, 'p1')).toBeUndefined();   // nobody else moved
  });

  it('bubbles expire, and the phase change clears them', () => {
    const c = createChatter(always);
    c.onEvent({ t: 'hit', id: 'p0', amount: 30 }, roster(), 1000);
    expect(c.bubbles.length).toBeGreaterThan(0);
    c.onFrame(roster(), roster(), 1 / 60, 1000 + 5000);
    expect(c.bubbles.length).toBe(0);
    c.onEvent({ t: 'hit', id: 'p0', amount: 30 }, roster(), 20000);
    c.clear();
    expect(c.bubbles.length).toBe(0);
  });

  it('a dead player says nothing, and a hit under 1 damage is not worth a word', () => {
    const c = createChatter(always);
    const dead = roster();
    dead[0].alive = false;
    c.onEvent({ t: 'hit', id: 'p0', amount: 25 }, dead, 1000);
    expect(said(c, 'p0')).toBeUndefined();
    const c2 = createChatter(always);
    c2.onEvent({ t: 'hit', id: 'p1', amount: 0.4 }, roster(), 2000);
    expect(c2.bubbles.length).toBe(0);
  });
});
