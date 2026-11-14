// Pass 84: what your own flash and a burst's haze cover round the aim point down the M4A1's irons. Walks Survival Town
// alone, aims, holds the trigger and takes frames back to back (crop round the aim point).
//   node .scratch/next-level/kill-flash/look.mjs <out dir> name=x,z,yaw ...   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, ...rest] = process.argv.slice(2);
if (!out) throw new Error('usage: look.mjs <out dir> name=x,z,yaw ...');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  const mouse = (type, button) =>
    chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button, buttons: type === 'mousePressed' ? (button === 'left' ? 1 : 2) : 0, clickCount: 1 });
  for (const v of rest) {
    const [name, at] = v.split('=');
    await chrome.navigate(`http://localhost:5173/?explore=survival-town&nolock${at ? `&at=${at}` : ''}`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
    await sleep(3500);
    await mouse('mousePressed', 'right');
    await sleep(600);
    const shot = async (k) => {
      const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip: { x: 720, y: 360, width: 480, height: 360, scale: 1 } });
      writeFileSync(`${out}/${name}-${k}.jpg`, Buffer.from(s.result.data, 'base64'));
    };
    await shot('aim');
    await mouse('mousePressed', 'left');
    await sleep(300);
    for (let k = 0; k < 6; k++) await shot(k);
    await mouse('mouseReleased', 'left');
    await sleep(250);
    await shot('let-go');
    await mouse('mouseReleased', 'right');
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
