// Aleix vetoed the kill dip (v2.221.0) on 2026-11-15. Practice Range: hold the M4A1 on the 10 m dummy until it dies,
// then frame the gun at 0, 120, 300 and 600 ms after the kill: the gun should sit still (no drop).
//   node .scratch/next-level/no-kill-dip/look.mjs <out dir>   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const AIM = (id) => `(() => {
  const g = duty.game, me = g?.player, t = g?.driver?.others(0).find((p) => p.id === ${JSON.stringify(id)});
  if (!me || !t) return null;
  const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
  const dx = t.position[0] - eye[0], dy = t.position[1] + t.eyeHeight * 0.72 - eye[1], dz = t.position[2] - eye[2];
  const look = g.input.angles;
  g.input.setAngles(Math.atan2(-dx, -dz) - (me.yaw - look.yaw), Math.atan2(dy, Math.hypot(dx, dz)) - (me.pitch - look.pitch));
  return t.alive;
})()`;
const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate('http://localhost:5173/?explore=range&at=-56,-2,0&nolock');
  if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('range did not start');
  await sleep(5000);
  await chrome.evaluate(AIM('dummy-10'));
  await sleep(1500);
  await shot('0-before');
  // Single taps so the trigger is up at the kill (no muzzle flash in the after frames).
  let killedAt = null, taps = 0;
  for (; taps < 20; taps++) {
    await chrome.evaluate(AIM('dummy-10'));
    await mouse('mousePressed');
    await sleep(40);
    await mouse('mouseReleased');
    await sleep(160);
    const alive = await chrome.evaluate(`duty.game.driver.others(0).find((p) => p.id === 'dummy-10')?.alive`);
    if (alive === false) { killedAt = Date.now(); break; }
  }
  const frames = [];
  for (const ms of [0, 120, 300, 600]) {
    const wait = killedAt + ms - Date.now();
    if (wait > 0) await sleep(wait);
    await shot(`1-after-${ms}ms`);
    frames.push({ ms, at: Date.now() - killedAt });
  }
  const result = { killed: killedAt !== null, taps: taps + 1, frames, errors: chrome.errors.slice(0, 5) };
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await chrome.close();
}
