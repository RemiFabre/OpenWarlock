import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The manifest IS the allowlist, so its shape and the rule that picks between
// two copies of it are worth locking. version-sw.js is a service worker (it
// touches `self`), so the pure helper is lifted out of the source text rather
// than imported, which also means this test fails if the helper is renamed
// away, instead of quietly testing nothing.
const swSource = readFileSync(new URL('../version-sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../versions.json', import.meta.url), 'utf8'));

function loadHelper() {
  const m = swSource.match(/function readManifest\(data\) \{[\s\S]*?\n\}/);
  expect(m, 'version-sw.js must define readManifest()').toBeTruthy();
  return new Function(`${m[0]}; return readManifest;`)();
}
// how loadValidCommits() picks between the two copies
const pick = (list) => list.filter(Boolean).sort((a, b) => b.serial - a.serial)[0];

describe('version manifest', () => {
  it('carries a serial and well-formed immutable commits', () => {
    expect(Number.isInteger(manifest.serial)).toBe(true);
    expect(manifest.serial).toBeGreaterThan(0);
    const slugs = manifest.versions.map(v => v.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const v of manifest.versions) {
      expect(v.commit, v.slug).toMatch(/^[0-9a-f]{40}$/);
      expect(typeof v.branch, v.slug).toBe('string');
      expect(typeof v.name, v.slug).toBe('string');
    }
  });

  it('rejects anything that is not a full list of 40-hex commits', () => {
    const readManifest = loadHelper();
    expect(readManifest(null)).toBe(null);
    expect(readManifest({})).toBe(null);
    expect(readManifest({ versions: [{ commit: 'main' }] })).toBe(null);
    expect(readManifest({ versions: [{ commit: 'ABC' }] })).toBe(null);
    const ok = readManifest(manifest);
    expect(ok.commits.size).toBe(manifest.versions.length);
    expect(ok.serial).toBe(manifest.serial);
  });

  // The reason `serial` exists: two CDN copies, each of which can be stale.
  // "Higher serial wins" has to work in BOTH directions or it is a bug;
  // publishing fast while revoking slowly is exactly what it must not do.
  it('the fresher copy wins, whichever direction it moved', () => {
    const readManifest = loadHelper();
    const sha = 'a'.repeat(40);
    const withIt = readManifest({ serial: 9, versions: [{ commit: sha }] });
    const withoutIt = readManifest({ serial: 10, versions: [] });
    // fresh copy REMOVED it: revoked at once, even though a stale copy lists it
    expect(pick([withIt, withoutIt]).commits.has(sha)).toBe(false);
    // fresh copy ADDED it: published at once, even though a stale copy lacks it
    const added = readManifest({ serial: 11, versions: [{ commit: sha }] });
    expect(pick([withoutIt, added]).commits.has(sha)).toBe(true);
    // an unnumbered (pre-serial) copy can never outrank a numbered one
    const legacy = readManifest({ versions: [{ commit: sha }] });
    expect(legacy.serial).toBe(0);
    expect(pick([legacy, withoutIt]).commits.has(sha)).toBe(false);
  });
});
