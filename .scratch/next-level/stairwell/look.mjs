// The stairwell opening in Survival Town's south house (ticket 53), walked alone and looked up at:
//   node .scratch/next-level/stairwell/look.mjs <out dir> name=x,z,yaw,lookUpPx ...
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, ...rest] = process.argv.slice(2);
if (!out) throw new Error('usage: look.mjs <out dir> name=x,z,yaw,up ...');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  for (const v of rest) {
    const [name, spec] = v.split('=');
    const [x, z, yaw, up] = spec.split(',');
    await chrome.navigate(`http://localhost:5191/?explore=survival-town&nolock&at=${x},${z},${yaw}`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
    await sleep(3000);
    await chrome.send('Runtime.evaluate', { expression: `document.dispatchEvent(new MouseEvent('mousemove', { movementY: -${Number(up)} }))` });
    await sleep(1500);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
