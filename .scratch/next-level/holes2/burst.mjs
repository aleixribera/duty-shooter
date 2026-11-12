// Bullet holes at a wall a metre away (ticket 45): Survival Town walked alone, facing the shaded wall at (-55, -10) from
// 1.5 m, six single shots nudged apart, then the trigger held a second into one spot. The screen and a crop round the aim.
//   node .scratch/next-level/holes2/burst.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: burst.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  await chrome.navigate(`${BASE}?explore=survival-town&nolock&at=-53.5,-10,1.571`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
  await sleep(4000);
  const mouse = (type, x = 960, y = 540) => chrome.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  for (let i = 0; i < 6; i++) {
    await mouse('mouseMoved', 960 + (i % 3) * 40 - 40, 540 + (i < 3 ? -30 : 30));
    await mouse('mousePressed');
    await sleep(60);
    await mouse('mouseReleased');
    await sleep(450);
  }
  await mouse('mousePressed');
  await sleep(1000);
  await mouse('mouseReleased');
  await sleep(900);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  writeFileSync(`${out}/wall.jpg`, Buffer.from(s.result.data, 'base64'));
  const c = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, clip: { x: 560, y: 240, width: 800, height: 500, scale: 1 } });
  writeFileSync(`${out}/crop.jpg`, Buffer.from(c.result.data, 'base64'));
  console.log(JSON.stringify({ at: await chrome.evaluate('duty.game.player.position.map((v) => +v.toFixed(2))'), errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
