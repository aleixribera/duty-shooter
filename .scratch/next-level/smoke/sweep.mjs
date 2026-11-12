// Ticket 56: muzzle smoke on a long burst. Survival Town walked alone; holds the trigger while the view sweeps left,
// as the review's scripted player did, and takes a frame late in the magazine.
//   node .scratch/next-level/smoke/sweep.mjs <out dir> name=x,z,yaw ...   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, ...rest] = process.argv.slice(2);
if (!out) throw new Error('usage: sweep.mjs <out dir> name=x,z,yaw ...');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  for (const v of rest) {
    const [name, at] = v.split('=');
    await chrome.navigate(`http://localhost:5191/?explore=survival-town&nolock&at=${at}`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
    await sleep(3500);
    await chrome.evaluate(`globalThis.__sweep = setInterval(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: -6 })), 30)`);
    await mouse('mousePressed');
    for (let k = 0; k < 3; k++) {
      await sleep(k === 0 ? 1400 : 300);
      const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      writeFileSync(`${out}/${name}-${k}.jpg`, Buffer.from(s.result.data, 'base64'));
    }
    await mouse('mouseReleased');
    await chrome.evaluate('clearInterval(globalThis.__sweep)');
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
