// Ticket 34 check in a real browser: minutes of bursts with real (CDP) mouse
// moves holding the aim level against the recoil, then the mouse pulled down
// to the bottom of the screen: the view must reach straight down (-85).
//   node .scratch/battle-royale/recoil/browser-recoil.mjs [url] [seconds]
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [url = 'http://localhost:5173/?explore=range&nolock', seconds = '200'] = process.argv.slice(2);
const out = '.scratch/battle-royale/recoil';
const chrome = await launchChrome();
const online = url.includes('online');
if (online) {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().toLowerCase().startsWith(text.toLowerCase()));`,
  });
}
await chrome.navigate(url);
if (online) {
  // Play Online: a public lobby joins from the tile under the name typed above it; the host starts the match.
  await chrome.waitFor(`!!globalThis.__find?.('Play Online')`, 90_000, 100);
  await chrome.evaluate(`document.querySelector('.ds-menu input').value = 'Recoil'; __find('Play Online').click()`);
  await chrome.waitFor(`!!__find('Join') || !!__find('Start')`, 30_000, 100);
  await chrome.evaluate(`if (__find('Join')) { document.querySelector('.ds-field input').value = 'Recoil'; __find('Join').click(); }`);
  await chrome.waitFor(`!!__find('Start')`, 90_000, 100);
  await chrome.evaluate(`__find('Start').click()`);
}
if (!(await chrome.waitFor('globalThis.duty?.game?.player?.alive', 180_000))) throw new Error('no player');
await sleep(2000);
await chrome.evaluate("import('/@fs/C:/Users/Aleix/Documents/CLAUDE/duty-shooter/packages/fps-client/src/settings.ts').then((m) => { duty.game.applySettings({ ...m.loadSettings(), sensitivity: 50 }); return true; })");
const PX = await chrome.evaluate('50 * 0.0066'); // degrees per pixel
const read = () => chrome.evaluate('(() => { const p = duty.game.player; return { cmd: duty.game.input.angles.pitch * 180 / Math.PI, view: p.pitch * 180 / Math.PI, weapon: p.weapon.id, ammo: p.weapon.ammo, alive: p.alive }; })()');
const X = 960;
let y = 20;
const move = (to) => chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X, y: (y = to), buttons: 0 });
const button = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: X, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
const key = (code) => chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.slice(3).toLowerCase() }).then(() => sleep(60)).then(() => chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.slice(3).toLowerCase() }));
await move(20);
await sleep(300);
const log = [];
const t0 = Date.now();
let firing = false;
let lastLog = -1;
let shots = 0;
// Room kept for the last pull: 85 degrees plus some.
const budget = 1079 - Math.ceil(110 / PX);
while (Date.now() - t0 < Number(seconds) * 1000 && y < budget) {
  const s = (Date.now() - t0) / 1000;
  const r = await read();
  // Long and short bursts: 3 s on, 1 s off, 0.6 s on, 1.4 s off.
  const phase = s % 6;
  const want = phase < 3 || (phase >= 4 && phase < 4.6);
  if (want !== firing) {
    await button(want ? 'mousePressed' : 'mouseReleased');
    firing = want;
    if (want) shots++;
  }
  if (r.ammo === 0) await key('KeyR');
  if (Math.floor(s) % 45 === 30 && Math.floor(s) !== lastLog) await key('KeyQ');
  // The hand pulls the view back towards level, a few pixels at a time.
  const dy = Math.max(-4, Math.min(4, Math.round(r.view / PX)));
  if (dy !== 0) await move(y + dy);
  if (Math.floor(s / 10) !== Math.floor(lastLog / 10)) {
    const row = { s: Math.round(s), ...r, offset: r.view - r.cmd, y };
    log.push(row);
    console.log(JSON.stringify(row));
  }
  lastLog = Math.floor(s);
}
await button('mouseReleased');
await sleep(500);
const held = await read();
console.log('held level after firing', JSON.stringify({ ...held, offset: held.view - held.cmd, y }));
// Now pull the mouse down to the bottom of the screen.
while (y < 1079) {
  await move(Math.min(1079, y + 6));
  await sleep(8);
}
await sleep(500);
const down = await read();
console.log('pulled down', JSON.stringify(down));
const shot = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
writeFileSync(`${out}/looking-down.jpg`, Buffer.from(shot.result.data, 'base64'));
// And back up to the top.
while (y > 0) {
  await move(Math.max(0, y - 6));
  await sleep(8);
}
await sleep(500);
const up = await read();
console.log('pushed up', JSON.stringify(up));
writeFileSync(`${out}/browser-run.json`, JSON.stringify({ url, log, held, down, up, errors: chrome.errors.slice(0, 5) }, null, 1));
console.log('errors', chrome.errors.slice(0, 5));
await chrome.close();
process.exit(Math.abs(down.view + 85) < 0.01 && Math.abs(up.view - 85) < 0.01 ? 0 : 1);
