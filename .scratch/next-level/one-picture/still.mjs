// Ticket 35: the processor's time per frame with the camera held still, for A/B comparisons a flight is
// too noisy for. Opens the page with `query`, waits for it to settle, slows the processor `rate` times,
// and times `game.frame` (everything a frame does on the main thread) over `frames` frames.
//   node .scratch/next-level/one-picture/still.mjs "<query>" [rate] [frames] [label]
//   e.g. "explore=zero-island&nolock&at=120,-340,1.2"
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const query = process.argv[2] ?? 'explore=zero-island&nolock';
const rate = Number(process.argv[3] ?? 4);
const count = Number(process.argv[4] ?? 300);
const label = process.argv[5] ?? '';
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?${query}&hz=1000`, BASE).toString());
  if (!(await chrome.waitFor('globalThis.duty?.game', 180_000))) throw new Error('no game');
  await chrome.waitFor('document.body.dataset.bake', 180_000);
  await sleep(8000);
  if (rate > 1) await chrome.send('Emulation.setCPUThrottlingRate', { rate });
  await sleep(2000);
  const out = await chrome.evaluate(`new Promise((done) => {
    const game = duty.game;
    const real = game.frame;
    const times = [];
    game.frame = function () {
      const t = performance.now();
      try { return real.apply(this, arguments); } finally {
        times.push(performance.now() - t);
        if (times.length === ${count}) {
          game.frame = real;
          const s = [...times].sort((a, b) => a - b);
          const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
          done(JSON.stringify({ frames: s.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), mean: (s.reduce((a, b) => a + b, 0) / s.length).toFixed(2) }));
        }
      }
    };
  })`);
  console.log(`${label} ${query} x${rate}: ${out}`);
} finally {
  await chrome.close();
}
