// The review's pictures (spec "The review"): one short headless session, about two minutes.
// The main menu at desktop and phone width, the Bot Match setup, then a Survival Town TDM
// played for `seconds` (walking, strafing, firing), with shots in play, mid-burst and of the scoreboard.
//   node .scratch/next-level/reviews/capture.mjs <out dir> [seconds] [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: capture.mjs <out dir> [seconds] [base url]');
const SECONDS = Number(process.argv[3] ?? 50);
const BASE = process.argv[4] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  const key = (type, code, k = code.slice(3).toLowerCase(), vk = code.charCodeAt(3)) => chrome.send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk });
  const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', clickCount: 1 });

  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(2500);
  await shot('01-menu');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(800);
  await shot('02-menu-phone');
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await sleep(800);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  await shot('03-bot-match-setup');
  await click('Start');
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  await sleep(1500);
  await shot('04-play-start');
  await key('keyDown', 'KeyW');
  for (let t = 0; t < SECONDS; t += 5) {
    const side = t % 10 === 0 ? 'KeyA' : 'KeyD';
    await key('keyDown', side);
    await mouse('mousePressed');
    await sleep(500);
    if (t === 10) await shot('05-firing');
    await sleep(700);
    await mouse('mouseReleased');
    await key('keyUp', side);
    await sleep(1800);
    if (t === 20) {
      await key('keyDown', 'Tab', 'Tab', 9);
      await sleep(500);
      await shot('06-scoreboard');
      await key('keyUp', 'Tab', 'Tab', 9);
    }
    if (t === 30) await shot('07-play-mid');
    await sleep(2000);
  }
  await key('keyUp', 'KeyW');
  await shot('08-play-late');
  console.log(JSON.stringify({ kills: await chrome.evaluate('duty.driver.scores.reduce((n, s) => n + s.kills, 0)'), errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
