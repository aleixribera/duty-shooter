// Request 2 (the pistol): in the Practice Range, the Warden 9 laid on the 10 m dummy's chest, clicked at a quick human pace
// (a press every CADENCE ms, a little faster than the gun's 150 ms), relaid before each click. Reads the range's own
// "Time to kill" and "Shots / hits", the rounds the magazine lost, and takes a frame after the kill, desktop or phone.
//   node .scratch/next-level/pistol/look.mjs <out dir> [WxH] [cadence ms]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [WxH] [cadence ms]');
const [W, H] = (process.argv[3] ?? '1920x1080').split('x').map(Number);
const CADENCE = Number(process.argv[4] ?? 130);
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
const READ = `({ weapon: duty.game.player.weapon.id, ammo: duty.game.player.weapon.ammo, ttk: document.querySelector('.ttk')?.textContent, shots: document.querySelector('.shots')?.textContent, dist: document.querySelector('.dist')?.textContent, lastHit: document.querySelector('.last-hit')?.textContent })`;
const chrome = await launchChrome();
const click = async () => {
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: W / 2, y: H / 2, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(40);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: W / 2, y: H / 2, button: 'left', buttons: 0, clickCount: 1 });
};
try {
  if (W !== 1920) await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate('http://localhost:5173/?explore=range&at=-56,-2,0&nolock');
  if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('range did not start');
  await sleep(4000);
  await chrome.evaluate(`duty.game.driver.setLoadout({ primary: 'm4a1', secondary: 'pistol', grenade: 'frag' })`);
  await sleep(3000);
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Digit2', key: '2', windowsVirtualKeyCode: 50 });
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Digit2', key: '2', windowsVirtualKeyCode: 50 });
  await sleep(1500);
  const runs = [];
  for (const [label, height] of [['chest', 0.72], ['head', 1.0]]) {
    await chrome.evaluate(AIM('dummy-10', height));
    await sleep(1500);
    const before = await chrome.evaluate(READ);
    const clicks = 8;
    for (let i = 0; i < clicks; i++) {
      await chrome.evaluate(AIM('dummy-10', height));
      const t = Date.now();
      await click();
      await sleep(Math.max(0, CADENCE - (Date.now() - t)));
    }
    await sleep(600);
    const after = await chrome.evaluate(READ);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    writeFileSync(`${out}/pistol-${label}-${W}.jpg`, Buffer.from(s.result.data, 'base64'));
    runs.push({ label, cadence: CADENCE, clicks, fired: before.ammo - after.ammo, before, after });
    // Reload and let the dummy stand back up before the next run.
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
    await sleep(4000);
  }
  const result = { runs, errors: chrome.errors.slice(0, 5) };
  writeFileSync(`${out}/result-${W}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await chrome.close();
}
