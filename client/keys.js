// Spell keybindings: the presets, the saved-binding resolver, the Keys panel and
// the in-shop rebind popup. Extracted from main.js in round 23; imports only
// ui.js and the spec, so it can never close a cycle (see client/ui.js).
//
// This module OWNS the live bindings. Nothing outside may assign them (an
// imported binding is read-only in ESM anyway): read with bindings()/keyOf()
// and write with bindKey().

import { SPELLS } from '../shared/constants.js';
import { $, ICONS, esc, toast } from './ui.js';

// Defaults per Remi 2026-08-03: blink (teleport) on F, dash (rush) on E,
// boomerang moves to R. Saved custom bindings in localStorage still win.
// ⚠ THIS is the source of truth for hotkeys, not SPELLS[key].hotkey (which is
// vestigial; its only other use is being excluded from tooltips). Every spell in
// SPELLS needs an entry in BOTH presets: refreshKeyUi() walks Object.keys(SPELLS)
// and calls keyLabel() on the binding, so a missing one throws on load and the
// client comes up blank. Add the spell here in the same commit you add it there.
const KEY_PRESETS = {
  // statue sits on the PHYSICAL key left of pillar's S in both layouts
  // (qwerty A = azerty Q), so "stone next to stone" holds either way.
  // decoy sits on the PHYSICAL key left of repulse's X in both layouts
  // (qwerty Z = azerty W), the last free key on the bottom row.
  qwerty: { fireball: 'q', lightning: 'w', boomerang: 'r', teleport: 'f', shield: 'd', rush: 'e',
            pillar: 's', vanish: 'v', meteor: 't', swap: 'g', repulse: 'x', wall: 'c', nova: 'b',
            statue: 'a', decoy: 'z', firewalk: 'h', debt: 'y', genki: 'k' },
  azerty: { fireball: 'a', lightning: 'z', boomerang: 'r', teleport: 'f', shield: 'd', rush: 'e',
            pillar: 's', vanish: 'v', meteor: 't', swap: 'g', repulse: 'x', wall: 'c', nova: 'b',
            statue: 'q', decoy: 'w', firewalk: 'h', debt: 'y', genki: 'k' },
};

// ⚠ Round 21.7 SCAR (Remi, live): two spells on one key is a SILENT dead
// spell. He plays AZERTY, so his saved bindings had fireball on `a` and
// lightning on `z`; Statue and Decoy shipped later with the QWERTY defaults
// `a`/`z`, and spellForKey() returns the FIRST match, so Statue never fired
// (fireball ate the key) and Decoy did literally nothing. Load now resolves
// every collision: your SAVED keys win, then a defaulted spell takes the first
// free key from [its qwerty default, its azerty default, a-z, 0-9].
const FALLBACK_KEYS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
function loadKeys() {
  const b = { ...KEY_PRESETS.qwerty };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('owKeys') || '{}') || {}; }
  catch { /* corrupt storage; fall back to defaults */ }
  const spells = Object.keys(b);
  const savedKey = (s) => (typeof saved[s] === 'string' && saved[s]) ? saved[s].toLowerCase() : null;
  const out = {};
  const taken = new Set();
  for (const spell of spells) {           // your own bindings first, in order
    const k = savedKey(spell);
    if (k && !taken.has(k)) { out[spell] = k; taken.add(k); }
  }
  for (const spell of spells) {           // the rest: default, else first free
    if (out[spell]) continue;
    for (const k of [KEY_PRESETS.qwerty[spell], KEY_PRESETS.azerty[spell], ...FALLBACK_KEYS])
      if (k && !taken.has(k)) { out[spell] = k; taken.add(k); break; }
  }
  return out;
}
let keyBindings = loadKeys();
function saveKeys() { try { localStorage.setItem('owKeys', JSON.stringify(keyBindings)); } catch { } }

export const bindings = () => keyBindings;
export const keyOf = (spell) => keyBindings[spell];
export function spellForKey(k) {
  for (const [spell, key] of Object.entries(keyBindings)) if (key === k) return spell;
  return null;
}

// Any key can be bound (round 21.7), so the label has to survive the odd ones.
const KEY_LABELS = { ' ': 'Space', arrowup: '↑', arrowdown: '↓', arrowleft: '←',
  arrowright: '→', enter: '⏎', tab: '⇥', backspace: '⌫' };
export function keyLabel(k) {
  if (!k) return '·';
  return KEY_LABELS[k] || (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
}

// ---- the Keys panel ---------------------------------------------------------

const keyRows = {};
// main.js calls this once, after the DOM exists. `onRefresh` is the one thing
// this module cannot repaint itself: the spell bar, which main.js owns.
let onRefresh = () => {};
export function initKeys({ onRefresh: cb } = {}) {
  if (cb) onRefresh = cb;
  const list = $('keyList');
  for (const [spell, spec] of Object.entries(SPELLS)) {
    const row = document.createElement('div');
    row.className = 'krow';
    row.innerHTML = `<span class="icon">${ICONS[spell]}</span><span class="kname">${spec.name}</span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'keybtn';
    btn.addEventListener('click', () => startCapture(spell));
    row.appendChild(btn);
    list.appendChild(row);
    keyRows[spell] = btn;
  }
  $('presetQwerty').addEventListener('click', () => applyPreset('qwerty'));
  $('presetAzerty').addEventListener('click', () => applyPreset('azerty'));
  $('keysCloseBtn').addEventListener('click', closeKeysPanel);
  $('lobbyKeysBtn').addEventListener('click', () => $('keysPanel').classList.remove('hidden'));
  $('rebind').addEventListener('click', closeRebind); // click away = cancel
  refreshKeyUi();
}

let capturing = null; // spell whose binding is being captured
export const isCapturing = () => !!capturing;
function startCapture(spell) {
  cancelCapture();
  capturing = spell;
  keyRows[spell].classList.add('capturing');
  keyRows[spell].textContent = 'press any key…';
  window.addEventListener('keydown', onCaptureKey, true);
  window.addEventListener('mousedown', onCaptureClick, true);
}
function cancelCapture() {
  if (!capturing) return;
  capturing = null;
  window.removeEventListener('keydown', onCaptureKey, true);
  window.removeEventListener('mousedown', onCaptureClick, true);
  refreshKeyUi();
}
// click anywhere but another key button = cancel (same rule as the popup)
function onCaptureClick(e) {
  if (!(e.target instanceof Element) || !e.target.classList.contains('keybtn')) cancelCapture();
}
function onCaptureKey(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key === 'Escape') { cancelCapture(); return; }
  if (MODIFIER_KEYS.includes(e.key)) return; // wait for a real key
  bindKey(capturing, e.key.toLowerCase());
  cancelCapture(); // refreshes all labels
}
function applyPreset(preset) {
  cancelCapture();
  keyBindings = { ...KEY_PRESETS[preset] };
  saveKeys();
  refreshKeyUi();
}
export function closeKeysPanel() { cancelCapture(); $('keysPanel').classList.add('hidden'); }

// ---- rebinding: ONE rule, both entry points ---------------------------------
// Round 21.7 (Remi): "any key just works". Esc or a click outside cancels;
// ANY other key takes the binding, and if that key was another spell's, the two
// SWAP and a toast says so. No key is ever defended (the round-20 owned-spell
// veto is gone; it made the popup refuse and say nothing useful).
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];
function bindKey(spell, k) {
  if (!spell || !k || keyBindings[spell] === k) return;
  const other = spellForKey(k);
  const old = keyBindings[spell];
  keyBindings[spell] = k;
  if (other && other !== spell) {
    keyBindings[other] = old;
    toast(`Swapped: ${SPELLS[spell].name} is now ${keyLabel(k)}, ` +
      `${SPELLS[other].name} is now ${keyLabel(old)}`);
  }
  saveKeys();
  refreshKeyUi();
}

// The in-shop popup: click a spell's key chip, press the new key. The
// capture-phase listener eats every keydown while it is open.
let rebindSpell = null;
export function openRebind(spell) {
  cancelCapture();
  rebindSpell = spell;
  $('rebindMsg').innerHTML = `Press the key you want for <b>${esc(SPELLS[spell].name)}</b>`;
  $('rebind').classList.remove('hidden');
  window.addEventListener('keydown', onRebindKey, true);
}
function closeRebind() {
  rebindSpell = null;
  $('rebind').classList.add('hidden');
  window.removeEventListener('keydown', onRebindKey, true);
}
function onRebindKey(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key === 'Escape') { closeRebind(); return; }
  if (MODIFIER_KEYS.includes(e.key)) return; // wait for a real key
  bindKey(rebindSpell, e.key.toLowerCase());
  closeRebind();
}

// Every key label in the UI (panel, spell bar, shop chips, join hint) reflects
// current bindings.
export function refreshKeyUi() {
  for (const [spell, btn] of Object.entries(keyRows)) {
    btn.classList.remove('capturing');
    btn.textContent = keyLabel(keyBindings[spell]);
  }
  for (const chip of document.querySelectorAll('.keychip'))
    chip.textContent = keyLabel(keyBindings[chip.dataset.spell]);
  onRefresh(); // the spell bar, which main.js owns
  // the one always-visible controls line in the lobby, LIVE binding, never a
  // hardcoded Q (non-QWERTY scar, round 21.7)
  $('controlsHint').innerHTML =
    `press <kbd>${esc(keyLabel(keyBindings.fireball))}</kbd> to throw your fireball · <kbd>right-click</kbd> to move · hold <kbd>Tab</kbd> in game for the scoreboard`;
}
