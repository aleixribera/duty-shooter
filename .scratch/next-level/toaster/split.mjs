// Ticket 99: one frame of a map's `?bench` flight split into the game's own callback and everything else
// (style, layout, paint, the GPU process), over 120 frames, at a CPU throttle.
//   node .scratch/next-level/toaster/split.mjs [map,map] [rate=4]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const maps = (process.argv[2] ?? 'range,survival-town').split(',');
const rate = Number(process.argv[3] ?? 4);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
// Wraps requestAnimationFrame so each callback's own time is summed per frame.
const WRAP = `(() => { const real = requestAnimationFrame; globalThis.__cb = 0; globalThis.requestAnimationFrame = (f) => real((t) => { const s = performance.now(); try { f(t); } finally { globalThis.__cb += performance.now() - s; } }); })()`;
const PROBE = `(async () => {
  const frames = [];
  let last = performance.now(), cb0 = globalThis.__cb;
  await new Promise((done) => { const f = () => { const now = performance.now(); frames.push([now - last, globalThis.__cb - cb0]); last = now; cb0 = globalThis.__cb; frames.length >= 120 ? done() : requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  return JSON.stringify({ frame: med(frames.map((f) => f[0])), callbacks: med(frames.map((f) => f[1])), dom: document.querySelectorAll('*').length });
})()`;
for (const map of maps) {
  const chrome = await launchChrome({ uncapped: true });
  try {
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: WRAP });
    await chrome.navigate(new URL(`?bench&map=${map}`, BASE).toString());
    if (!(await chrome.waitFor(`[...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))`, 600_000, 500))) throw new Error('no flight');
    if (rate > 1) await chrome.send('Emulation.setCPUThrottlingRate', { rate });
    await sleep(4000);
    console.log(map, await chrome.evaluate(PROBE));
  } finally {
    await chrome.close();
  }
}
