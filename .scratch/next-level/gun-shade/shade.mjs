// The gun in hand in shade and in sun (Survival Town, walked alone): finds a spot in a wall's shadow facing the sunlit street,
// and one in open sun, and saves the screen at each plus the gun's mean brightness against the picture's.
//   node .scratch/next-level/gun-shade/shade.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: shade.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

// In the page: walls of the map's own solids (axis-aligned, tall, not props), a spot 1 m off each wall's sun-free face, kept if the
// sun is blocked there and a spot 6 m further out is in sun. Yaw faces out from the wall. Sun direction from surfaces/lighting.ts.
const FIND = `(() => {
  const m = duty.map; const solids = (m.solids ?? []).filter((s) => !s.orientation && !s.prop && s.max[1] - s.min[1] > 2.5 && s.material !== 'glass');
  const n = Math.hypot(-0.55, 0.62, 0.55); const sun = [-0.55 / n, 0.62 / n, 0.55 / n];
  const hit = (a, b) => solids.some((s) => { let t0 = 0, t1 = 1; for (let k = 0; k < 3; k++) { const d = b[k] - a[k]; if (Math.abs(d) < 1e-9) { if (a[k] < s.min[k] || a[k] > s.max[k]) return false; continue; } let u = (s.min[k] - a[k]) / d, v = (s.max[k] - a[k]) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false; } return true; });
  const shaded = (p) => hit(p, [p[0] + sun[0] * 80, p[1] + sun[1] * 80, p[2] + sun[2] * 80]);
  const inside = (p) => solids.some((s) => p[0] > s.min[0] - 0.4 && p[0] < s.max[0] + 0.4 && p[2] > s.min[2] - 0.4 && p[2] < s.max[2] + 0.4 && p[1] > s.min[1] - 1.7 && p[1] < s.max[1]);
  const spots = [];
  for (const s of solids) {
    if (s.min[1] > 0.5) continue;
    const y = s.min[1] + 1.6;
    // Faces away from the sun: +x (sun is toward -x) and -z (sun toward +z).
    for (const [dx, dz, yaw] of [[1, 0, -Math.PI / 2], [0, -1, 0]]) {
      const c = [dx ? (dx > 0 ? s.max[0] + 1 : s.min[0] - 1) : (s.min[0] + s.max[0]) / 2, y, dz ? (dz > 0 ? s.max[2] + 1 : s.min[2] - 1) : (s.min[2] + s.max[2]) / 2];
      const far = [c[0] + dx * 7, y, c[2] + dz * 7];
      if (inside(c) || inside(far) || !shaded(c) || shaded(far) || hit(c, far)) continue;
      spots.push({ at: c, yaw, size: (s.max[0] - s.min[0]) * (s.max[2] - s.min[2]) });
    }
  }
  spots.sort((a, b) => b.size - a.size);
  return { keys: Object.keys(m).slice(0, 30), count: solids.length, spots: spots.slice(0, 3) };
})()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`${BASE}?explore=survival-town&nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
  const found = await chrome.evaluate(FIND);
  console.log(JSON.stringify(found));
  const shots = [];
  if (found.spots[0]) shots.push(['shade', found.spots[0]]);
  if (found.spots[0]) shots.push(['sun', { at: [found.spots[0].at[0] + (found.spots[0].yaw ? 7 : 0), found.spots[0].at[1], found.spots[0].at[2] - (found.spots[0].yaw ? 0 : 7)], yaw: found.spots[0].yaw }]);
  for (const [name, spot] of shots) {
    const deg = (spot.yaw * 180) / Math.PI;
    await chrome.navigate(`${BASE}?explore=survival-town&nolock&at=${spot.at[0].toFixed(2)},${spot.at[2].toFixed(2)},${spot.yaw.toFixed(3)}`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
    await sleep(5000);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    console.log(name, JSON.stringify({ at: spot.at.map((v) => +v.toFixed(1)), yaw: +deg.toFixed(0), player: await chrome.evaluate('duty.game.player?.position?.map((v) => +v.toFixed(1))') }));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
