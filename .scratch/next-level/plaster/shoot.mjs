// A shot into the room side of Survival Town's north house's east wall (ticket 48), from 1.3 m: the frame 90 ms after
// each of three single shots (debris in the air), then the holes a second later. Crops round the aim.
//   node .scratch/next-level/plaster/shoot.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: shoot.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  await chrome.navigate(`${BASE}?explore=survival-town&nolock&at=4.6,-24,-1.5708`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
  await sleep(4000);
  const mouse = (type, x = 960, y = 540) => chrome.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  const clip = { x: 610, y: 290, width: 700, height: 440, scale: 1 };
  for (let i = 0; i < 3; i++) {
    await mouse('mousePressed');
    await sleep(40);
    await mouse('mouseReleased');
    await sleep(50);
    const c = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip });
    writeFileSync(`${out}/debris-${i}.jpg`, Buffer.from(c.result.data, 'base64'));
    await sleep(500);
  }
  await sleep(1000);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  writeFileSync(`${out}/wall.jpg`, Buffer.from(s.result.data, 'base64'));
  console.log(JSON.stringify({ at: await chrome.evaluate('duty.game.player.position.map((v) => +v.toFixed(2))'), errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
