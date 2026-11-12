// Ticket 34: Zero Island's spots with and without its bake (NOBAKE=1 makes the bake's fetch fail, so it draws unbaked).
//   node .scratch/next-level/island-bake/shots.mjs <out dir> <spot or x,z,yaw>...   (x,z,yaw walks the map alone from there)
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const BASE = process.env.BASE ?? 'http://localhost:5191/';
const [out, ...spots] = process.argv.slice(2);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const NO_BAKE = `(() => { const real = fetch; globalThis.fetch = (url, ...rest) => (String(url).includes('bake/') ? Promise.reject(new Error('no bake')) : real(url, ...rest)); })()`;
const tag = process.env.NOBAKE ? 'unbaked' : 'baked';
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  if (process.env.NOBAKE) await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_BAKE });
  for (const spot of spots) {
    const walk = /^-?[\d.]+,-?[\d.]+,-?[\d.]+$/.test(spot);
    await chrome.navigate(new URL(walk ? `?explore=zero-island&at=${spot}&nolock` : `?map=zero-island&spot=${encodeURIComponent(spot)}`, BASE).toString());
    await chrome.waitFor('globalThis.duty?.game', 180_000);
    await chrome.waitFor('document.body.dataset.bake', 180_000);
    console.log(spot, await chrome.evaluate('document.body.dataset.bake'));
    await sleep(9000);
    const r = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${spot.replace(/[^a-z0-9]+/gi, '-')}-${tag}.png`, Buffer.from(r.result.data, 'base64'));
  }
  console.log('errors', chrome.errors.slice(0, 3));
} finally {
  await chrome.close();
}
