// How long after the page starts the Loadout stage is warm (`data-warm`), and whether the page logged errors.
//   node .scratch/next-level/loadout-open/warm-probe.mjs [base url]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${BASE}?nolock`);
  const t0 = Date.now();
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  console.log('game at', Date.now() - t0);
  while (Date.now() - t0 < 90_000) {
    const warm = await chrome.evaluate(`globalThis.duty?.menu?.gunStage?.element.dataset.warm ?? 'none'`);
    if (warm !== 'none') {
      console.log('warm', warm, 'at', Date.now() - t0);
      break;
    }
    await sleep(250);
  }
  console.log('errors', JSON.stringify(chrome.errors.slice(0, 5)));
} finally {
  await chrome.close();
}
