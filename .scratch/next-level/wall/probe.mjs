// Ticket 90: replay the review's walk and report the solid under the crosshair at the 07 moment.
//   node .scratch/next-level/wall/probe.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/wall/probe';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const UNDER = `(() => {
  const p = duty.game.player; const w = duty.map;
  const solids = (w.world?.solids ?? w.solids ?? []);
  const eye = [p.position[0], p.position[1] + 1.6, p.position[2]];
  const cp = Math.cos(p.pitch);
  const d = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
  let best = null;
  for (const s of solids) {
    let t0 = 0, t1 = 1e9, ok = true;
    for (const i of [0, 1, 2]) { const k = i;
      if (Math.abs(d[i]) < 1e-9) { if (eye[i] < s.min[k] || eye[i] > s.max[k]) { ok = false; break; } continue; }
      let a = (s.min[k] - eye[i]) / d[i], b = (s.max[k] - eye[i]) / d[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && !s.orientation && (!best || t0 < best.t)) { const n = solids.indexOf(s); const look = w.looks?.[n] ?? null; best = { t: t0, n, min: s.min, max: s.max, material: s.material, look, finishes: look ? Object.fromEntries(Object.values(look).map((f) => [f, w.finishes[f]])) : null }; }
  }
  return { pos: p.position, yaw: p.yaw, pitch: p.pitch, best };
})()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  const key = (type, code, k = code.slice(3).toLowerCase(), vk = code.charCodeAt(3)) => chrome.send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk });
  const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', clickCount: 1 });

  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  await click('Start');
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  await sleep(1500);
  console.log('start', JSON.stringify(await chrome.evaluate(UNDER)));
  await key('keyDown', 'KeyW');
  for (let t = 0; t <= 30; t += 5) {
    const side = t % 10 === 0 ? 'KeyA' : 'KeyD';
    await key('keyDown', side);
    await mouse('mousePressed');
    await sleep(1200);
    await mouse('mouseReleased');
    await key('keyUp', side);
    await sleep(1800);
    if (t === 30) {
      await shot('07-play-mid');
      console.log('07', JSON.stringify(await chrome.evaluate(UNDER)));
    }
    await sleep(2000);
  }
  await key('keyUp', 'KeyW');
} finally {
  await chrome.close();
}
