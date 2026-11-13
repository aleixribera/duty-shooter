// Review 2026-11-13b: a streaky stretched-texture strip on Switchyard, full screen height (11-kill-2, 13-30s).
// Walks Switchyard alone and looks from SPOTS (x,z,yaw), one frame each.
//   node .scratch/next-level/yard-strip/look.mjs <out dir> [x,z,yaw ...]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const [out, ...args] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const SPOTS = args.length ? args : ['0,4,0'];
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  for (const spot of SPOTS) {
    const [x, z, yaw, pitch = 0] = spot.split(',').map(Number);
    await chrome.navigate(`http://localhost:5173/?explore=switchyard&at=${x},${z},${yaw}&nolock`);
    await chrome.waitFor('globalThis.duty?.game', 240_000);
    await chrome.waitFor('duty.game?.player?.alive === true', 240_000, 500);
    await chrome.evaluate(`duty.game.input.setAngles(${yaw}, ${pitch}), 1`);
    await sleep(4000);
    const r = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${spot.replaceAll(',', '_')}.jpg`, Buffer.from(r.result.data, 'base64'));
    console.log(spot, await chrome.evaluate(`JSON.stringify(duty.game.player.position)`));
  }
  console.log('errors', chrome.errors.slice(0, 3));
} finally {
  await chrome.close();
}
