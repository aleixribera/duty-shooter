// Ticket 35: the benchmark flight with the page's CPU slowed (Chrome's throttle), as on a weak laptop processor.
//   node .scratch/next-level/one-picture/potato.mjs [map] [rate=4] [label]
import { writeFileSync, mkdirSync } from 'node:fs';
import { launchChrome } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const map = process.argv[2] ?? 'survival-town';
const rate = Number(process.argv[3] ?? 4);
const label = process.argv[4] ?? 'run';
const OUT = new URL('./bench/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?bench&map=${map}`, BASE).toString());
  // Slowed once the map is up: loading it slowed would only take longer.
  if (!(await chrome.waitFor(`[...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))`, 600_000, 500))) throw new Error('the flight did not start');
  await chrome.send('Emulation.setCPUThrottlingRate', { rate });
  const report = await chrome.waitFor("document.body.dataset.benchmark === 'done' ? JSON.stringify(globalThis.duty?.benchmark) : null", 20 * 60_000, 2000);
  if (!report) throw new Error('no report');
  const r = JSON.parse(report);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}${label}-${map}-x${rate}.json`, report);
  console.log(`${label} ${map} x${rate}: mean ${r.meanMs.toFixed(2)} ms, 1% low ${r.low1Ms.toFixed(2)} ms, p50 ${r.frameMs?.p50?.toFixed?.(2)}, gpu p50 ${r.gpuMs?.p50?.toFixed(2)}, draws ${r.drawCalls?.mean}`);
} finally {
  await chrome.close();
}
