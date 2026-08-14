// Guards for the roster's round-24.7 shape and the report page generator.
// Numbers come FROM THE SPEC (COST_TARGET, ROSTER), never pinned.
import { describe, it, expect } from 'vitest';
import {
  ROSTER, paddedCore, coreCost, expandCore, COST_TARGET, shelfExhausted,
} from '../tools/roster.js';
import { reportHtml } from '../tools/report.js';

describe('roster shape (round 24.7)', () => {
  it('every padded core lands in the cost band, unless its shelf exhausts by design', () => {
    for (const [id, entry] of Object.entries(ROSTER)) {
      const cost = coreCost(paddedCore(entry));
      if (entry.noPad || shelfExhausted(entry)) continue;
      expect(cost, id).toBeGreaterThanOrEqual(COST_TARGET[0]);
      expect(cost, id).toBeLessThanOrEqual(COST_TARGET[1]);
    }
  });

  it('family M: identical cost and identical scaffold after the lead mutation', () => {
    const ms = Object.entries(ROSTER).filter(([id]) => id.startsWith('M'));
    expect(ms.length).toBe(6);
    const costs = ms.map(([, e]) => coreCost(paddedCore(e)));
    expect(new Set(costs).size).toBe(1);
    // every M core = [lead mutation x3] + the same tail
    const tails = ms.map(([, e]) => JSON.stringify(e.core.slice(1)));
    expect(new Set(tails).size).toBe(1);
    expect(ms.every(([, e]) => e.core[0][1] === 3)).toBe(true);
  });

  it('family G: a caps ban keeps the banned thing out of the PADDED core too', () => {
    for (const [id, entry] of Object.entries(ROSTER)) {
      if (!entry.caps) continue;
      const banned = Object.keys(entry.caps).filter(k => entry.caps[k] === 0);
      const bought = expandCore(paddedCore(entry));
      for (const k of banned) expect(bought, `${id} buys banned ${k}`).not.toContain(k);
    }
  });

  it('G1 and G2 differ only by shield vs debt (same slots, same cost)', () => {
    const a = ROSTER['G1-warlord-shield'].core.map(([k, l]) => [k === 'shield' ? 'X' : k, l]);
    const b = ROSTER['G2-warlord-debt'].core.map(([k, l]) => [k === 'debt' ? 'X' : k, l]);
    expect(a).toEqual(b);
    expect(coreCost(paddedCore(ROSTER['G1-warlord-shield'])))
      .toBe(coreCost(paddedCore(ROSTER['G2-warlord-debt'])));
  });
});

describe('report page', () => {
  it('roster mode renders every build with an icon-chip order and self-explains', () => {
    const html = reportHtml({});
    for (const id of Object.keys(ROSTER)) expect(html).toContain(`card-${id}`);
    expect(html).toContain('class="chip');
    expect(html).toContain('auto-fill');       // core/filler divider
    expect(html).toContain(`${COST_TARGET[0]}-${COST_TARGET[1]} g`); // self-explains the band
  });

  it('elo mode ranks by elo and carries the caveat line', () => {
    const ids = Object.keys(ROSTER);
    const run = {
      GAMES: 10, SEED: 1, KIND: 'berserker', unfinished: 0,
      elo: Object.fromEntries(ids.map((id, i) => [id, 1500 + i])),
      games: Object.fromEntries(ids.map(id => [id, 10])),
      placeSum: Object.fromEntries(ids.map(id => [id, 25])),
    };
    const html = reportHtml({ run });
    expect(html).toContain('Bot read only');
    const last = ids[ids.length - 1];
    // highest elo listed before lowest
    expect(html.indexOf(`data-id="${last}"`)).toBeLessThan(html.indexOf(`data-id="${ids[0]}"`));
  });

  it('a run naming an unknown strategy throws (never a silently wrong table)', () => {
    expect(() => reportHtml({ run: {
      GAMES: 1, SEED: 1, KIND: 'berserker', unfinished: 0,
      elo: { 'Z9-retired': 1500 }, games: { 'Z9-retired': 1 }, placeSum: { 'Z9-retired': 2 },
    } })).toThrow(/unknown strategy/);
  });
});
