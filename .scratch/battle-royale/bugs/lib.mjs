// Ticket 35's bug hunt: a muted headless Chrome with gamepads hidden, real clicks
// and keys, screenshots, and an in-page watcher that checks invariants every frame.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

export { sleep };
export const SHOTS = '.scratch/battle-royale/shots/bugs';
mkdirSync(SHOTS, { recursive: true });
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const find = (text) =>
  `[...document.querySelectorAll('button, [role=button], a')].find((b) => b.getClientRects().length > 0 && b.textContent.trim().toLowerCase().startsWith(${JSON.stringify(text.toLowerCase())}))`;

/** In-page watcher: every animation frame, the invariants the ticket lists. */
const WATCH = `(() => {
  if (window.__hunt) return;
  const MAG = { m4a1: 30, smg: 32, shotgun: 6, sniper: 5, pistol: 17 };
  const h = (window.__hunt = { playingSince: Infinity, sounds: {}, viol: {}, n: 0, frames: 0, spikes: [], pitch: [0, 0], last: performance.now(), downedSince: {}, deadIds: {}, revived: 0, warnings: 0 });
  const bad = (k, detail) => { const v = (h.viol[k] ??= { count: 0, first: null, last: null }); v.count++; v.first ??= { t: Math.round(performance.now()), detail }; v.last = { t: Math.round(performance.now()), detail }; };
  const loop = (t) => {
    const dt = t - h.last; h.last = t; h.frames++;
    if (dt > 250 && !document.hidden && h.frames > 30) h.spikes.push([Math.round(t), Math.round(dt)]);
    try {
      const g = globalThis.duty?.game; const d = g?.driver; const p = g?.player;
      if (p) {
        h.n++;
        if (!(p.health >= 0 && p.health <= 100)) bad('health-range', p.health);
        if (![...p.position, p.yaw, p.pitch].every(Number.isFinite)) bad("nan", JSON.stringify(p.position));
        const deg = (p.pitch * 180) / Math.PI;
        h.pitch[0] = Math.min(h.pitch[0], deg); h.pitch[1] = Math.max(h.pitch[1], deg);
        if (Math.abs(deg) > 85.5) bad('pitch-range', deg.toFixed(1));
        const w = p.weapon; const mag = MAG[w?.id];
        if (w && mag !== undefined && !(w.ammo >= 0 && w.ammo <= mag)) bad('ammo-range', w.id + ' ' + w.ammo);
        if (p.alive && p.health <= 0 && !p.downed) bad('alive-at-zero', p.health);
        if (p.position[1] < -50) bad("fell-out", p.position[1].toFixed(1));
      }
      if (d) {
        const now = performance.now();
        for (const o of d.others(0)) {
          if (o.kind && o.kind !== 'player' && o.kind !== 'bot') continue;
          if (o.downed) { h.downedSince[o.id] ??= now; if (now - h.downedSince[o.id] > 45000) bad('stuck-downed', o.id + ' ' + Math.round((now - h.downedSince[o.id]) / 1000) + 's'); }
          else if (h.downedSince[o.id] !== undefined) { if (o.alive) h.revived++; delete h.downedSince[o.id]; }
          if (d.match?.mode === 'battle-royale' && d.match?.phase === 'playing' && now - h.playingSince > 5000) {
            if (!o.alive && !o.downed) h.deadIds[o.id] ??= Math.round(d.serverTime);
            else if (o.alive && h.deadIds[o.id] !== undefined) { bad('alive-after-out', o.id + ' dead at server ' + h.deadIds[o.id] + ' alive at ' + Math.round(d.serverTime)); delete h.deadIds[o.id]; }
          }
        }
        if (d.match?.phase !== 'playing') { h.deadIds = {}; h.playingSince = Infinity; } else if (h.playingSince === Infinity) h.playingSince = now;
      }
    } catch (e) { bad('watch-threw', String(e).slice(0, 200)); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Sounds started while no match is in play (menus, lobby): they should be UI sounds only.
  const s = globalThis.duty?.sound;
  if (s && !s.__hunted) {
    s.__hunted = true;
    const play = s.play.bind(s);
    s.play = (event, params) => {
      const g = globalThis.duty?.game;
      const inPlay = g?.driver && !g.paused && g.driver.match?.phase !== 'lobby';
      if (!inPlay) h.sounds[event] = (h.sounds[event] ?? 0) + 1;
      return play(event, params);
    };
  }
})()`;

export async function open(name, { url, phone = false, width = 1600, height = 900 } = {}) {
  const chrome = await launchChrome();
  chrome.name = name;
  chrome.warnings = [];
  chrome.logs = [];
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: 'navigator.getGamepads = () => [];' });
  await chrome.send('Log.enable');
  await chrome.send(
    'Emulation.setDeviceMetricsOverride',
    phone ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width, height, deviceScaleFactor: 1, mobile: false },
  );
  const wait = chrome.waitFor.bind(chrome);
  chrome.must = async (expression, ms, every = 250) => {
    const v = await wait(expression, ms, every);
    if (!v) throw new Error(`${name}: timed out waiting for ${expression.slice(0, 140)}`);
    return v;
  };
  chrome.url = url;
  await chrome.navigate(url);
  await chrome.must(`location.protocol.startsWith('http') && performance.now() > 0`, 60_000, 200);
  return chrome;
}

/** Hooks warnings (the error list is chrome.mjs's own). Call after open. */
export async function hookWarnings(chrome) {
  await chrome.evaluate(`(() => { if (window.__warns) return; window.__warns = []; const w = console.warn.bind(console); console.warn = (...a) => { window.__warns.push(a.map(String).join(' ').slice(0, 300)); w(...a); }; })()`);
}
export const warnings = async (chrome) => JSON.parse((await chrome.evaluate(`JSON.stringify(window.__warns ?? [])`)) ?? '[]');

export async function watch(chrome) {
  await chrome.evaluate(WATCH);
}
export async function report(chrome) {
  return JSON.parse((await chrome.evaluate(`JSON.stringify(window.__hunt ?? null)`)) ?? 'null');
}

export async function setName(chrome, name) {
  await chrome.evaluate(`(() => { const i = document.querySelector('input[aria-label="Name"]'); i.value = ${JSON.stringify(name)}; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); })()`);
}

export const has = (chrome, text) => chrome.evaluate(`!!${find(text)}`);
export const buttons = (chrome) =>
  chrome.evaluate(`JSON.stringify([...document.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0).map((b) => b.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40) + (b.disabled ? ' (disabled)' : '')))`);

export async function click(chrome, text) {
  const box = JSON.parse(
    (await chrome.evaluate(
      `(() => { const b = ${find(text)}; if (!b || b.disabled) return 'null'; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`,
    )) ?? 'null',
  );
  if (!box) throw new Error(`${chrome.name}: no enabled button "${text}"; have ${await buttons(chrome)}`);
  for (const type of ['mousePressed', 'mouseReleased'])
    await chrome.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  log(`${chrome.name}: clicked "${text}"`);
}

const KEYS = { Escape: 'Escape', Tab: 'Tab', Enter: 'Enter', Space: ' ', ShiftLeft: 'Shift', ControlLeft: 'Control' };
const KEYCODES = { Escape: 27, Tab: 9, Enter: 13, Space: 32, ShiftLeft: 16, ControlLeft: 17 };
export async function keyDown(chrome, code) {
  const key = KEYS[code] ?? (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code);
  const windowsVirtualKeyCode = KEYCODES[code] ?? (code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? code.charCodeAt(5) : 0);
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode });
}
export async function keyUp(chrome, code) {
  const key = KEYS[code] ?? (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code);
  const windowsVirtualKeyCode = KEYCODES[code] ?? (code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? code.charCodeAt(5) : 0);
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode });
}
export async function tap(chrome, code, ms = 60) {
  await keyDown(chrome, code);
  await sleep(ms);
  await keyUp(chrome, code);
}

const mouseX = 800;
const mouseY = 450;
/** A relative mouse move into the game's own mouse handler (the deltas pointer lock would give). */
export async function look(chrome, dx, dy, steps = 6) {
  for (let i = 0; i < steps; i++)
    await chrome.evaluate(`document.dispatchEvent(new MouseEvent('mousemove', { movementX: ${dx / steps}, movementY: ${dy / steps} })), 1`);
}
export async function mouse(chrome, type, button = 'left') {
  await chrome.send('Input.dispatchMouseEvent', { type, x: mouseX, y: mouseY, button, buttons: type === 'mousePressed' ? (button === 'left' ? 1 : 2) : 0, clickCount: 1 });
}

/** Plays like a restless person for `ms`: walks, sprints, turns, fires bursts, reloads, jumps, crouches, swaps. */
export async function play(chrome, ms, { onStep } = {}) {
  const end = Date.now() + ms;
  const moves = ['KeyW', 'KeyW', 'KeyW', 'KeyA', 'KeyD', 'KeyS'];
  let n = 0;
  while (Date.now() < end) {
    n++;
    const k = moves[n % moves.length];
    await keyDown(chrome, k);
    if (n % 3 === 0) await keyDown(chrome, 'ShiftLeft');
    await look(chrome, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 60);
    if (n % 2 === 0) {
      await mouse(chrome, 'mousePressed');
      await sleep(150 + Math.random() * 600);
      await mouse(chrome, 'mouseReleased');
    } else await sleep(400);
    if (n % 7 === 0) await tap(chrome, 'KeyR');
    if (n % 11 === 0) await tap(chrome, 'Space');
    if (n % 13 === 0) await tap(chrome, 'KeyC');
    if (n % 17 === 0) await tap(chrome, 'KeyQ');
    await keyUp(chrome, 'ShiftLeft');
    await keyUp(chrome, k);
    if (onStep) await onStep(n);
  }
}

export async function shoot(chrome, name) {
  const r = (await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })).result;
  if (!r) return null;
  const file = `${SHOTS}/${name}.jpg`;
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  log(file);
  return file;
}

export const state = async (chrome) =>
  JSON.parse(
    (await chrome.evaluate(
      `JSON.stringify((() => { const g = duty.game, d = g.driver, p = g.player; return { status: d?.status, mode: d?.match?.mode, map: d?.match?.map, phase: d?.match?.phase, seats: d?.scores.length, paused: g.paused, screen: duty.menu?.screen, alive: p?.alive, hp: p?.health, downed: p?.downed, pitch: p && +(p.pitch * 57.3).toFixed(1), pos: p && [...p.position].map((v) => +v.toFixed(1)), weapon: p?.weapon.id, ammo: p?.weapon.ammo }; })())`,
    )) ?? 'null',
  );

export const text = (chrome, sel) => chrome.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getClientRects().length > 0).map((e) => e.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')`);
