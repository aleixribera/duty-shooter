// Ticket 89: the desert bunker (bunker-b, Survival Town's test site, at x 36-44, z -38..-32) from the review's range
// and up close. Survival Town walked alone, one still per spot, game paused after the camera settles.
//   node .scratch/next-level/bunker/look.mjs <out dir> [base url]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, BASE = 'http://localhost:5173/'] = process.argv.slice(2);
if (!out) throw new Error('usage: bunker/look.mjs <out dir> [base url]');
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
// name, x, z, yaw, pitch: the review's range (~30 m), 12 m off the slit face, and the door end at 5 m.
const SPOTS = [
  ['range', 22, -8, -0.55, -0.02],
  ['mid', 38, -21, -0.12, 0.0],
  ['door', 31, -33.5, -Math.PI / 2 - 0.35, 0.0],
];
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  for (const [name, x, z, yaw, pitch] of SPOTS) {
    await chrome.navigate(`${BASE}?explore=survival-town&nolock&at=${x},${z},${yaw}`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 120_000))) throw new Error('page did not start');
    await sleep(3500);
    await chrome.evaluate(`duty.game.input.setAngles(${yaw}, ${pitch}), 1`);
    await sleep(1200);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  }
  console.log(JSON.stringify({ pos: await chrome.evaluate('JSON.stringify(duty.game.player)?.slice(0,200)'), errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
