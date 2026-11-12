// The sidearm in hand in sun (ticket 44): Survival Town walked alone at ticket 37's sun spot, the screen with the rifle
// and then with the secondary (key 2).
//   node .scratch/next-level/arsenal-finish/sidearm.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: sidearm.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`${BASE}?explore=survival-town&nolock&at=-40.00,-10.00,-1.571`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
  await sleep(5000);
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  await shot('rifle');
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Digit2', key: '2', windowsVirtualKeyCode: 50 });
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Digit2', key: '2', windowsVirtualKeyCode: 50 });
  await sleep(2500);
  await shot('sidearm');
  console.log(JSON.stringify({ weapon: await chrome.evaluate('duty.game.player?.weapon ?? duty.game.player?.loadout?.secondary ?? null'), errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
