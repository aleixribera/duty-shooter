// Ticket 86: splinters off a wooden wall at point-blank. Survival Town walked alone, the camera a hand from the
// house front; fire held and a frame every ~70 ms, so a splinter flying past the eye is caught.
//   node .scratch/next-level/chips/look.mjs <out dir> [x,z,yaw,pitch] [base url]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, spot = '-1,-13.3,0,0', BASE = 'http://localhost:5173/'] = process.argv.slice(2);
if (!out) throw new Error('usage: chips/look.mjs <out dir> [x,z,yaw,pitch] [base url]');
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const [x, z, yaw, pitch] = spot.split(',').map(Number);
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`${BASE}?explore=survival-town&nolock&at=${x},${z},${yaw}`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 120_000))) throw new Error('page did not start');
  await sleep(3000);
  await chrome.evaluate(`duty.game.input.setAngles(${yaw}, ${pitch}), 1`);
  await sleep(1200);
  const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', clickCount: 1 });
  await mouse('mousePressed');
  for (let i = 0; i < 24; i++) {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(`${out}/${String(i).padStart(2, '0')}.jpg`, Buffer.from(s.result.data, 'base64'));
    await sleep(40);
  }
  await mouse('mouseReleased');
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
