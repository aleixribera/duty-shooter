// Request 6 (ticket 112): the redesigned guns in the Practice Range, each aimed down sights at the dummy its new
// design is about, fired as a player would, with the range's own "Time to kill" and "Shots / hits" read after.
// A frame of the sight picture before the first shot, and one after the run.
//   node .scratch/next-level/weapons/look.mjs <out dir> [WxH]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [WxH]');
const [W, H] = (process.argv[3] ?? '1920x1080').split('x').map(Number);
mkdirSync(out, { recursive: true });

// Where the player stands (the 25 m dummy hides the 50 m one from the range's start), label, primary, slot key, dummy,
// aim heights (one per press; 0.72 chest, 1.0 head), gap between presses (ms)
const NEAR = '-56,-2,0';
const FAR = '-44,-2,4';
const RUNS = [
  [NEAR, 'shotgun-8m-chest', 'shotgun', '1', 'dummy-10', [0.72], 0],
  [NEAR, 'revolver-24m-head', 'burst', '2', 'dummy-25', [1.0], 0],
  [FAR, 'burst-29m-chest', 'burst', '1', 'dummy-25', [0.62], 0],
  [FAR, 'dmr-54m-chest', 'dmr', '1', 'dummy-50', [0.72, 0.72, 0.72], 450],
  [FAR, 'dmr-54m-head-chest', 'dmr', '1', 'dummy-50', [1.0, 0.72], 450],
];

const AIM = (id, height) => `(() => {
  const g = duty.game, me = g?.player, t = g?.driver?.others(0).find((p) => p.id === ${JSON.stringify(id)});
  if (!me || !t) return null;
  const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
  const dx = t.position[0] - eye[0], dy = t.position[1] + t.eyeHeight * ${height} - eye[1], dz = t.position[2] - eye[2];
  const look = g.input.angles;
  g.input.setAngles(Math.atan2(-dx, -dz) - (me.yaw - look.yaw), Math.atan2(dy, Math.hypot(dx, dz)) - (me.pitch - look.pitch));
  return Math.round(Math.hypot(dx, dz) * 10) / 10;
})()`;
const READ = `({ weapon: duty.game.player.weapon.id, ammo: duty.game.player.weapon.ammo, ttk: document.querySelector('.ttk')?.textContent, shots: document.querySelector('.shots')?.textContent, lastHit: document.querySelector('.last-hit')?.textContent })`;
const chrome = await launchChrome();
const mouse = (type, button, buttons) => chrome.send('Input.dispatchMouseEvent', { type, x: W / 2, y: H / 2, button, buttons, clickCount: 1 });
const key = async (code, k, vk) => {
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk });
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk });
};
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  writeFileSync(`${out}/${name}-${W}.jpg`, Buffer.from(s.result.data, 'base64'));
};
try {
  if (W !== 1920) await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  const runs = [];
  let at = null;
  for (const [where, label, primary, slot, dummy, heights, gap] of RUNS) {
    if (where !== at) {
      at = where;
      await chrome.navigate(`http://localhost:5173/?explore=range&at=${at}&nolock`);
      if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('range did not start');
      await sleep(4000);
    }
    await chrome.evaluate(`duty.game.driver.setLoadout({ primary: ${JSON.stringify(primary)}, secondary: 'revolver', grenade: 'frag' })`);
    await sleep(2500);
    await key(`Digit${slot}`, slot, 48 + Number(slot));
    await sleep(1500);
    const distance = await chrome.evaluate(AIM(dummy, heights[0]));
    await mouse('mousePressed', 'right', 2);
    await sleep(900);
    await chrome.evaluate(AIM(dummy, heights[0]));
    await sleep(300);
    await shot(`${label}-sight`);
    const before = await chrome.evaluate(READ);
    for (const h of heights) {
      await chrome.evaluate(AIM(dummy, h));
      await sleep(30);
      await mouse('mousePressed', 'left', 3);
      await sleep(40);
      await mouse('mouseReleased', 'left', 2);
      await sleep(gap);
    }
    await sleep(500);
    const after = await chrome.evaluate(READ);
    await shot(`${label}-after`);
    await mouse('mouseReleased', 'right', 0);
    runs.push({ label, distance, presses: heights.length, fired: before.ammo - after.ammo, before, after });
    console.log(JSON.stringify(runs.at(-1)));
    await key('KeyR', 'r', 82);
    // The dummy stands back up and the gun reloads before the next run.
    await sleep(4500);
  }
  writeFileSync(`${out}/result-${W}.json`, JSON.stringify({ runs, errors: chrome.errors.slice(0, 5) }, null, 2));
} finally {
  await chrome.close();
}
