// Ticket 90: frames of a room's corner in Survival Town, walked to alone.
//   node .scratch/next-level/wall/look.mjs <out dir> [x,z,yaw ...]   (no spots: list the walls of the review's building)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/wall/after';
const spots = process.argv.slice(3);
const BASE = 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  if (spots.length === 0) {
    await chrome.navigate(`${BASE}?explore=survival-town&nolock`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('no player');
    // Opaque solids at least 2.4 m tall standing on the review building's floor (x -8.1..6.1, z -31.85..-13.9).
    const walls = await chrome.evaluate(`duty.map.solids.map((s, i) => ({ i, min: s.min, max: s.max, m: s.material, look: duty.map.looks?.[i] ?? null })).filter(({ min, max, m }) => m !== 'glass' && max[1] - min[1] > 2.4 && min[1] > -0.1 && min[1] < 0.1 && max[0] > -8.2 && min[0] < 6.2 && max[2] > -32 && min[2] < -13.8)`);
    for (const w of walls) console.log(w.i, w.m, JSON.stringify(w.min), JSON.stringify(w.max), w.look?.inside ?? '');
  }
  for (const spot of spots) {
    await chrome.navigate(`${BASE}?explore=survival-town&nolock&at=${spot}`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('no player');
    await sleep(6000);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    writeFileSync(`${out}/corner-${spot.replaceAll(',', '_')}.jpg`, Buffer.from(s.result.data, 'base64'));
    console.log(spot, JSON.stringify(await chrome.evaluate('duty.game.player.position')));
  }
} finally {
  await chrome.close();
}
