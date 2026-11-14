// Review 2026-11-14b defect 2: is the target seen through your own muzzle flash and smoke while you fire down the
// sights? The Practice Range walked alone: aims the M4A1 at the 25 m dummy, holds the trigger ~1.5 s with frames back
// to back, lets go and takes the haze as it hangs, then the same from the hip.
//
//   node .scratch/next-level/muzzle-clear/look.mjs <out dir> [gun]     (dev server on :5173, BASE overrides)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [gun]');
const gun = process.argv[3] ?? 'm4a1';
const base = process.env.BASE ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  // Other sessions' edits must not reload the page mid-run.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${base}?explore=range&nolock`);
  if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('page did not start');
  if (gun !== 'm4a1') await chrome.evaluate(`duty.game.driver.setLoadout(${JSON.stringify({ primary: gun, secondary: 'pistol', grenade: 'frag' })})`);
  await sleep(5000);
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(join(out, `${name}.jpg`), Buffer.from(s.result.data, 'base64'));
  };
  const mouse = (type, button, buttons) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button, buttons, clickCount: 1 });
  for (const aimed of [true, false]) {
    const tag = aimed ? 'ads' : 'hip';
    const held = aimed ? 2 : 0;
    if (aimed) await mouse('mousePressed', 'right', 2);
    await sleep(1400);
    await shot(`${tag}-still`);
    await mouse('mousePressed', 'left', held | 1);
    const t0 = Date.now();
    for (let k = 0; Date.now() - t0 < 1500; k++) await shot(`${tag}-fire-${String(k).padStart(2, '0')}`);
    await mouse('mouseReleased', 'left', held);
    for (let k = 0; k < 4; k++) {
      await sleep(250);
      await shot(`${tag}-after-${k}`);
    }
    if (aimed) await mouse('mouseReleased', 'right', 0);
    // Reload and let the haze clear before the next run.
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
    await sleep(4500);
  }
  console.log(JSON.stringify({ errors: [...new Set(chrome.errors)].slice(0, 5) }));
} finally {
  await chrome.close();
}
