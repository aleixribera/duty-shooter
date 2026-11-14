// Teammates and the camera: a Team deathmatch Bot Match on Survival Town, the player either standing still
// (how near do teammates come?) or walking straight into the nearest teammate (is their body drawn round the camera?).
//   MODE=idle|chase node .scratch/next-level/ally-room/look.mjs <out dir> [seconds]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, secs = '45'] = process.argv.slice(2);
const MODE = process.env.MODE ?? 'idle';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const W = window.WebSocket; window.WebSocket = function (url, p) { if (String(url).includes('vite-hmr') || p === 'vite-hmr') return { readyState: 3, close() {}, send() {}, addEventListener() {}, removeEventListener() {} }; return new W(url, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, W); })()`;
const chrome = await launchChrome();
const js = (e) => chrome.evaluate(e);
const click = async (text) => {
  const r = await chrome.send('Runtime.evaluate', {
    userGesture: true,
    returnByValue: true,
    expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`,
  });
  return r.result?.result?.value === true;
};
const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: code.charCodeAt(3) });
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  if (s.result?.data) writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
// The nearest living teammate: their flat distance from your eyes, and (chasing) your view turned onto them.
const NEAREST = (turn) => `(() => {
  const g = duty.game, me = g?.player;
  if (!me?.alive) return null;
  const mates = g.driver.others(0).filter((p) => p.alive && p.team === me.team);
  let best = null, d = Infinity;
  for (const p of mates) { const k = Math.hypot(p.position[0] - me.position[0], p.position[2] - me.position[2]); if (k < d) { d = k; best = p; } }
  if (!best) return null;
  if (${turn}) {
    const dx = best.position[0] - me.position[0], dz = best.position[2] - me.position[2];
    const look = g.input.angles;
    g.input.setAngles(Math.atan2(-dx, -dz) - (me.yaw - look.yaw), -0.05 - (me.pitch - look.pitch));
  }
  return { d, id: best.id };
})()`;
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate('http://localhost:5173/?nolock');
  if (!(await chrome.waitFor(`location.protocol.startsWith('http') && !!globalThis.duty?.game`, 120_000))) throw new Error('page did not start');
  await sleep(2000);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  await sleep(1500);
  const chase = MODE === 'chase';
  if (chase) await key('keyDown', 'KeyW');
  const samples = [];
  let shots = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < Number(secs) * 1000) {
    const s = await js(NEAREST(chase));
    if (s) {
      samples.push(s.d);
      // A frame each time the camera is inside a teammate (0.55 m), at most eight.
      if (s.d < 0.55 && shots < 8) await shot(`${MODE}-inside-${shots++}-${s.d.toFixed(2)}`);
    }
    await sleep(100);
  }
  if (chase) await key('keyUp', 'KeyW');
  const inside = samples.filter((d) => d < 0.55).length;
  const touching = samples.filter((d) => d < 0.76).length;
  const least = Math.min(...samples);
  console.log(JSON.stringify({ mode: MODE, samples: samples.length, inside, touching, least: +least.toFixed(3), errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
