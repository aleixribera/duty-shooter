// Ticket 20 in the page: walks the range alone, throws the tactical the loadout carries and
// screenshots it going off. Headless and muted; needs the dev server.
//
//   node .scratch/next-level/tacticals/throw.mjs <smoke|flash> [base url] [width] [height]
//
// Writes <kind>-*.png beside this script.
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const KIND = process.argv[2] ?? 'smoke';
const BASE = process.argv[3] ?? "http://localhost:5173/";
const AT = process.env.AT ?? "0,0,0";
const W = Number(process.argv[4] ?? 1920);
const H = Number(process.argv[5] ?? 1080);
const out = (name) => new URL(`./${name}`, import.meta.url);

const chrome = await launchChrome();
const shot = async (name) => {
  const r = await chrome.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out(`${KIND}-${name}.png`), Buffer.from(r.result.data, 'base64'));
  console.log('shot', name);
};
const key = (type, code, text = '') => chrome.send('Input.dispatchKeyEvent', { type, code, key: text || code, windowsVirtualKeyCode: code === 'KeyE' ? 69 : code === 'KeyW' ? 87 : 0 });
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  // The loadout carries this tactical.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { try { const k = 'duty-shooter.settings.v1'; const s = JSON.parse(localStorage.getItem(k) ?? '{}'); s.loadout = { primary: 'm4a1', secondary: 'pistol', grenade: 'frag', tactical: '${KIND}', perk: null }; localStorage.setItem(k, JSON.stringify(s)); } catch {} })()`,
  });
  await chrome.navigate(`${BASE}?explore=range&nolock&at=${AT}`);
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.game?.player', 120_000))) throw new Error('page did not start');
  await sleep(4000);
  const self = () => chrome.evaluate('JSON.stringify({ p: duty.game.player?.position, tac: duty.game.player?.tacticals, kit: duty.game.player?.loadout })');
  console.log('self', await self());
  // DOWN=<counts>: look down that far first (a synthetic mouse; the page plays without the lock).
  if (process.env.DOWN) await chrome.evaluate(`(() => { for (let i = 0; i < 20; i++) document.dispatchEvent(new MouseEvent('mousemove', { movementY: ${Number(process.env.DOWN)} / 20 })); return true; })()`);
  await sleep(200);
  await shot('0-before');
  // Hold the tactical a moment, then let go.
  await key('keyDown', 'KeyE', 'e');
  await sleep(350);
  await shot('1-held');
  await key('keyUp', 'KeyE', 'e');
  await sleep(250);
  console.log('after throw', await self());
  if (KIND === 'flash') {
    // It goes off in front of you: look at it.
    await sleep(800);
    for (let i = 0; i < 6; i++) {
      await shot(`2-bang-${i}`);
      await sleep(i < 3 ? 120 : 700);
    }
  } else {
    await sleep(1500);
    await shot('2-pop');
    await sleep(2200);
    await shot('3-risen');
    await sleep(4000);
    await shot('4-standing');
    // Walk into it.
    await key('keyDown', 'KeyW', 'w');
    await sleep(2500);
    await key('keyUp', 'KeyW', 'w');
    await shot('5-inside');
    await sleep(8000);
    await shot('6-cleared');
  }
  console.log('errors', chrome.errors.slice(0, 10));
} finally {
  await chrome.close();
}
