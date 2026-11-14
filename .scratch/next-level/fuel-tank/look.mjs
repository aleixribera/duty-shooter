// node look.mjs <out dir>   Station Nine's fuel tanks from where review 2026-11-14a saw a "plain white sphere" (end on, down the lane), and
// from three other sides. The camera is held through `game.overview` (as `?spot` does), the HUD hidden.
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'out';
mkdirSync(OUT, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const E = -Math.PI / 2, W = Math.PI / 2;
const VIEWS = [
  ['1-end-on', [11, 1.6, 24.8], E, 0],
  ['2-end-near', [15.5, 1.6, 23.6], E + 0.15, 0.05],
  ['3-three-quarter', [13.5, 1.7, 20.5], -2.04, -0.03],
  ['4-west-end-on', [-11, 1.6, 25.6], W, 0],
];
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await chrome.navigate(`http://localhost:${process.env.PORT ?? 5173}/?nolock&map=station-nine&spot=fuel%20tanks`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.overview', 180000))) throw new Error('page did not start');
  await sleep(20000);
  for (const [name, position, yaw, pitch] of VIEWS) {
    await chrome.evaluate(`duty.game.overview = { name: '${name}', position: ${JSON.stringify(position)}, yaw: ${yaw}, pitch: ${pitch} }`);
    await sleep(2500);
    const data = (await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })).result.data;
    writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(data, 'base64'));
  }
  console.log('errors', JSON.stringify(chrome.errors.slice(0, 3)));
} finally {
  await chrome.close();
}
