// The menu's backdrop as a still (ticket 85): the main menu's live aerial with every page element hidden.
//   node .scratch/next-level/menu-still/still.mjs <out.jpg> [base url]
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.drawing', 120_000))) throw new Error('world never drew');
  // The baked lighting and the first frames' shaders.
  await sleep(20_000);
  // The fly-through's first pose: where the menu starts once the world draws.
  await chrome.evaluate('duty.flyAt = 0');
  await chrome.evaluate(`document.querySelectorAll('body > *:not(#view)').forEach((e) => (e.style.visibility = 'hidden'))`);
  await sleep(1500);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  writeFileSync(out, Buffer.from(s.result.data, 'base64'));
  console.log('saved', out, chrome.errors.slice(0, 3));
} finally {
  await chrome.close();
}
