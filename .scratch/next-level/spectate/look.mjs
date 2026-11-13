// Ticket 110: the spectator's view. Starts a Switchyard Charge Bot Match, cooks a grenade in hand until it puts the
// player out, then frames Spectating: behind the one watched (three frames, 2 s apart), through their eyes (two),
// back behind, and after stepping to the next. Logs the spectator panel's text and the camera against the watched
// player each frame.
//   node .scratch/next-level/spectate/look.mjs <out dir> [width height] [map] [mode]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const [out, W = '1920', H = '1080', map = 'Switchyard', mode = 'Charge'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
const click = async (text) => {
  const r = await chrome.send('Runtime.evaluate', { userGesture: true, returnByValue: true, expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()` });
  if (r.result?.result?.value !== true) throw new Error(`no "${text}" button`);
  await sleep(300);
};
const key = async (type, code, k = code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: code === 'Space' ? 32 : k.toUpperCase().charCodeAt(0) });
const tap = async (code, k) => {
  await key('keyDown', code, k);
  await sleep(120);
  await key('keyUp', code, k);
};
const mouse = async (button) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await chrome.send('Input.dispatchMouseEvent', { type, x: +W / 2, y: +H / 2, button, clickCount: 1 });
    await sleep(80);
  }
};
const PROBE = `JSON.stringify((() => { const p = document.querySelector('.ds-spec:not([hidden])'); const name = p?.querySelector('.who b')?.textContent ?? ''; const w = duty.driver.others(1).find((o) => duty.driver.nameOf(o.id).toUpperCase() === name.toUpperCase()); return { watched: w ? { pitch: +w.pitch.toFixed(2), ads: +w.weapon.ads.toFixed(2), move: w.movement } : null, panel: p ? p.innerText.replace(/\\s+/g, ' ') : null, ammo: document.querySelector('.ds-ammo')?.innerText.replace(/\\s+/g, ' ') ?? null }; })())`;
let n = 0;
const frame = async (name) => {
  const r = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  const file = `${String(n++).padStart(2, '0')}-${name}-${W}.jpg`;
  writeFileSync(`${out}/${file}`, Buffer.from(r.result.data, 'base64'));
  console.log(file, await chrome.evaluate(PROBE));
};
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: +W < 768 });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`http://localhost:5173/?nolock&seed=3`);
  await chrome.waitFor('!!globalThis.duty?.game', 120_000);
  await sleep(2000);
  for (const t of ['Bot Match', map, mode, 'Start']) await click(t);
  await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000, 500);
  await sleep(2500);
  // Out: a grenade cooked in hand, looking at the floor.
  await chrome.evaluate(`duty.game.input.setAngles(0, -1.4), 1`);
  await key('keyDown', 'KeyG', 'g');
  const outBy = await chrome.waitFor(`!!document.querySelector('.ds-spec:not([hidden])')`, 20_000, 200);
  await key('keyUp', 'KeyG', 'g');
  if (!outBy) throw new Error('not spectating after 20 s');
  await sleep(1500);
  for (let i = 0; i < 3; i++) {
    await frame('follow');
    await sleep(2000);
  }
  await tap('Space', ' ');
  await sleep(1200);
  await frame('eyes');
  await sleep(2500);
  await frame('eyes');
  await tap('Space', ' ');
  await sleep(1500);
  await frame('follow-back');
  await mouse('left');
  await sleep(2000);
  await frame('next');
  console.log('errors', chrome.errors.slice(0, 3));
} finally {
  await chrome.close();
}
