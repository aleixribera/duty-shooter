// Ticket 35: where a benchmark flight's main-thread time goes. Profiles 20 s of the flight and prints
// the top functions by self time, and the renderer's draw calls by pass.
//   node .scratch/next-level/one-picture/profile.mjs [map] [seconds]
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const map = process.argv[2] ?? 'survival-town';
const seconds = Number(process.argv[3] ?? 20);
const rate = Number(process.argv[4] ?? 1);
const OUT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?bench&map=${map}`, BASE).toString());
  if (!(await chrome.waitFor(`[...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))`, 600_000, 500))) throw new Error('the flight did not start');
  if (rate > 1) await chrome.send('Emulation.setCPUThrottlingRate', { rate });
  await sleep(3000);
  await chrome.send('Profiler.enable');
  await chrome.send('Profiler.setSamplingInterval', { interval: 200 });
  await chrome.send('Profiler.start');
  await sleep(seconds * 1000);
  const { result } = await chrome.send('Profiler.stop');
  const profile = result.profile;
  writeFileSync(`${OUT}profile-${map}-x${rate}.cpuprofile`, JSON.stringify(profile));
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    const f = n.callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '')}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 45);
  console.log(`total ${total.toFixed(0)} ms over ${seconds} s`);
  for (const [k, ms] of top) console.log(`${((ms / total) * 100).toFixed(1).padStart(5)}%  ${ms.toFixed(0).padStart(6)} ms  ${k}`);
} finally {
  await chrome.close();
}
