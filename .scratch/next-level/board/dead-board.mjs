// The scoreboard held while dead (ticket 40): a Survival Town Bot Match, the player walking forward and firing until killed,
// then Tab held. Saves the screen and says what the centre line and prompt read and whether they show.
//   node .scratch/next-level/board/dead-board.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: dead-board.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  const key = (type, code, key, vk) => chrome.send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: vk });
  const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive`, 180_000))) throw new Error('match did not start');
  await sleep(3000);
  await key('keyDown', 'KeyW', 'w', 87);
  await mouse('mousePressed');
  const died = await chrome.waitFor('duty.game.player && !duty.game.player.alive', 120_000, 200);
  await key('keyUp', 'KeyW', 'w', 87);
  await mouse('mouseReleased');
  if (!died) throw new Error('never died');
  await sleep(600);
  await key('keyDown', 'Tab', 'Tab', 9);
  await sleep(700);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  writeFileSync(`${out}/dead-board.jpg`, Buffer.from(s.result.data, 'base64'));
  const state = await chrome.evaluate(`(() => { const v = (sel) => { const e = document.querySelector(sel); return e ? { text: e.innerText.replace(/\\s+/g, ' ').trim(), visible: !e.hidden && getComputedStyle(e).visibility === 'visible' && getComputedStyle(e).display !== 'none' } : null; }; return { boarded: document.querySelector('.ds-hud')?.classList.contains('boarded'), center: v('.ds-center'), prompt: v('.ds-prompt') }; })()`);
  await key('keyUp', 'Tab', 'Tab', 9);
  await sleep(400);
  const after = await chrome.evaluate(`(() => { const e = document.querySelector('.ds-center'); return e ? { text: e.innerText.replace(/\\s+/g, ' ').trim(), visible: getComputedStyle(e).visibility === 'visible' } : null; })()`);
  console.log(JSON.stringify({ held: state, released: after, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
