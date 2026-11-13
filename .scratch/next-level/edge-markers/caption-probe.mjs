// The caption's box on a narrow screen in an Outposts Bot Match, with and without touch mode (html.ds-touch):
// it must sit under the A B C strip without touch, and keep its own height (not stretch top to bottom) with it.
//   node .scratch/next-level/edge-markers/caption-probe.mjs   (dev server on :5173)
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
const click = async (text) => {
  const r = await chrome.send('Runtime.evaluate', { userGesture: true, returnByValue: true, expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()` });
  if (r.result?.result?.value !== true) throw new Error(`no "${text}" button`);
  await sleep(300);
};
const BOX = (sel) => `JSON.stringify((() => { const e = document.querySelector('${sel}'); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; })())`;
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`http://localhost:5173/?nolock&seed=3`);
  await chrome.waitFor('!!globalThis.duty?.game', 120_000);
  await sleep(2000);
  for (const t of ['Bot Match', 'Switchyard', 'Outposts', 'Start']) await click(t);
  await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000, 500);
  await chrome.waitFor(`!!document.querySelector('.ds-caption.on')`, 30_000, 200);
  console.log('strip', await chrome.evaluate(BOX('.ds-zones')), 'caption', await chrome.evaluate(BOX('.ds-caption')));
  await chrome.evaluate(`document.documentElement.classList.add('ds-touch'), 1`);
  await sleep(200);
  console.log('touch caption', await chrome.evaluate(BOX('.ds-caption')));
} finally {
  await chrome.close();
}
