// The scoreboard held in a Survival Town Bot Match (ticket 46): starts the match, holds Tab, saves the screen and the board's column heads.
//   node .scratch/next-level/board/held-board.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: held-board.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  const key = (type, code, key, vk) => chrome.send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: vk });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive`, 180_000))) throw new Error('match did not start');
  await sleep(2000);
  await key('keyDown', 'Tab', 'Tab', 9);
  await sleep(700);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  writeFileSync(`${out}/held-board.jpg`, Buffer.from(s.result.data, 'base64'));
  const heads = await chrome.evaluate(`[...document.querySelectorAll('.ds-board table')].map((t) => [...t.querySelectorAll('th')].map((h) => h.innerText.trim()))`);
  await key('keyUp', 'Tab', 'Tab', 9);
  console.log(JSON.stringify({ heads, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
