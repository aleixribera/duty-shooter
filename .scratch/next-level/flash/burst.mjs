// Ticket 57: is the muzzle flash on screen while firing? Holds the trigger on Survival Town walked alone and takes
// frames back to back, plus a crop round the muzzle.
//   node .scratch/next-level/flash/burst.mjs <out dir> name=x,z,yaw ...   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, ...rest] = process.argv.slice(2);
if (!out) throw new Error('usage: burst.mjs <out dir> name=x,z,yaw ...');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  for (const v of rest) {
    const [name, at] = v.split('=');
    await chrome.navigate(`http://localhost:5191/?explore=survival-town&nolock&at=${at}`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
    await sleep(3500);
    await mouse('mousePressed');
    await sleep(150);
    for (let k = 0; k < 8; k++) {
      const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip: { x: 760, y: 380, width: 560, height: 420, scale: 1 } });
      writeFileSync(`${out}/${name}-${k}.jpg`, Buffer.from(s.result.data, 'base64'));
    }
    await mouse('mouseReleased');
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
