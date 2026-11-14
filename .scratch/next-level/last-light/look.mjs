// The gun in hand under the last minute's light (review 14g, defect 4): a Survival Town TDM Bot Match with 70 s on
// the clock, the player standing still at their spawn (behind the north house, facing it), a frame about T-0:50 and one
// about T-0:15.
//   node .scratch/next-level/last-light/look.mjs <out dir> [base url]
// `patches.py <frames>` then measures the gun's pixels and how much of it is crushed to black.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
const click = async (text) => {
  const r = await chrome.send('Runtime.evaluate', {
    userGesture: true,
    returnByValue: true,
    expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`,
  });
  if (r.result?.result?.value !== true) throw new Error(`no "${text}" button`);
  await sleep(300);
};
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(s.result.data, 'base64'));
};
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`${BASE}?nolock&matchtime=70`);
  if (!(await chrome.waitFor('!!globalThis.duty?.game && !!globalThis.duty?.sound', 90_000))) throw new Error('page did not start');
  await sleep(2000);
  for (const t of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Start']) await click(t);
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  const t0 = Date.now();
  const frames = [
    { at: 20, name: 'spawn-t50' },
    { at: 58, name: 'spawn-t12' },
  ];
  for (const f of frames) {
    while (Date.now() - t0 < f.at * 1000) await sleep(500);
    console.log(JSON.stringify({ frame: f.name, clock: await chrome.evaluate(`document.body.innerText.match(/T-\\d:\\d\\d/)?.[0] ?? null`) }));
    await shot(f.name);
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 5) }));
} finally {
  await chrome.close();
}
