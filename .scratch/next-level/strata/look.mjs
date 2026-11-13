// Ticket 100: the Dustlands' sandstone ledges and pillars up close, walking Zero Island alone.
//   node .scratch/next-level/strata/look.mjs <out dir>      (BASE=http://localhost:5173/ by default)
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const BASE = process.env.BASE ?? 'http://localhost:5173/';
const out = process.argv[2];
// x,z,yaw: each looks at a rock-strata piece from 10-15 m (a 9 m pillar, a 13 m ledge, a heap of three, the 31-b canyon).
const SPOTS = { pillar: '-150,178,-2.66', ledge: '-130,165,2.47', heap: '-108,205,0.73', canyon: '-207,221,0.36' };
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  for (const [name, at] of Object.entries(SPOTS).filter(([n]) => !process.env.ONLY || process.env.ONLY.split(',').includes(n))) {
    await chrome.navigate(new URL(`?explore=zero-island&at=${at}&nolock`, BASE).toString());
    await chrome.waitFor('globalThis.duty?.game', 240_000);
    await chrome.waitFor('document.body.dataset.bake', 240_000);
    await chrome.waitFor('duty.game?.player?.alive === true', 240_000, 500);
    await sleep(8000);
    const r = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(r.result.data, 'base64'));
    console.log(name);
  }
  console.log('errors', chrome.errors.slice(0, 3));
} finally {
  await chrome.close();
}
