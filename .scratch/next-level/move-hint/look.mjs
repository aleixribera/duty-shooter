// "WASD Move" over kills (review 2026-11-14a): in the Practice Range with a fresh browser, waits for the move hint,
// then lays the M4A1 on the 10 m dummy and fires until it drops, without ever moving. Frames: the hint at the spawn,
// the kill, and the quiet after it (past the hints' calm). Reads whether "Move. The mouse looks" is on screen each time.
//   node .scratch/next-level/move-hint/look.mjs <out dir> [WxH]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [WxH]');
const [W, H] = (process.argv[3] ?? '1920x1080').split('x').map(Number);
mkdirSync(out, { recursive: true });
const AIM = (id, height = 0.72) => `(() => {
  const g = duty.game, me = g?.player, t = g?.driver?.others(0).find((p) => p.id === ${JSON.stringify(id)});
  if (!me || !t) return null;
  const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
  const dx = t.position[0] - eye[0], dy = t.position[1] + t.eyeHeight * ${height} - eye[1], dz = t.position[2] - eye[2];
  const look = g.input.angles;
  g.input.setAngles(Math.atan2(-dx, -dz) - (me.yaw - look.yaw), Math.atan2(dy, Math.hypot(dx, dz)) - (me.pitch - look.pitch));
  return Math.round(Math.hypot(dx, dz));
})()`;
const HINT = `document.body.innerText.includes('Move. The mouse looks')`;
const chrome = await launchChrome();
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  writeFileSync(`${out}/${name}-${W}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const press = async (down) =>
  chrome.send('Input.dispatchMouseEvent', { type: down ? 'mousePressed' : 'mouseReleased', x: W / 2, y: H / 2, button: 'left', buttons: down ? 1 : 0, clickCount: 1 });
try {
  if (W !== 1920) await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate('http://localhost:5173/?explore=range&at=-56,-2,0&nolock');
  if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('range did not start');
  const spawnHint = await chrome.waitFor(HINT, 15_000, 250);
  await chrome.evaluate(AIM('dummy-10'));
  await sleep(3000);
  await shot('1-spawn');
  const result = { spawnHint: !!spawnHint };
  // Fire bursts at the chest until the dummy drops (the range's own "Shots / hits" counts them).
  let fired = 0;
  for (let i = 0; i < 12; i++) {
    await chrome.evaluate(AIM('dummy-10'));
    await press(true);
    await sleep(110);
    await press(false);
    fired++;
    await sleep(120);
    if (i === 1) result.hintWhileFiring = await chrome.evaluate(HINT);
  }
  await sleep(250);
  result.hintAtKill = await chrome.evaluate(HINT);
  result.shots = await chrome.evaluate(`document.querySelector('.shots')?.textContent ?? null`);
  await shot('2-kill');
  await sleep(7000);
  result.hintInQuiet = await chrome.evaluate(HINT);
  await shot('3-quiet');
  result.errors = chrome.errors.slice(0, 5);
  writeFileSync(`${out}/result-${W}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await chrome.close();
}
