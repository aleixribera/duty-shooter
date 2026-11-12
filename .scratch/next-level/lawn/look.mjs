// Ticket 58: the lawn's edge on the desert. The menu's aerial view, then Survival Town walked alone from spots by the edge.
//   node .scratch/next-level/lawn/look.mjs <out dir> name=x,z,yaw ...   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, ...spots] = process.argv.slice(2);
if (!out) throw new Error('usage: look.mjs <out dir> name=x,z,yaw ...');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
try {
  await chrome.navigate('http://localhost:5191/');
  await chrome.waitFor('document.querySelector(".ds-home")', 240_000);
  await sleep(9000);
  await shot('menu');
  for (const v of spots) {
    const [name, at] = v.split('=');
    await chrome.navigate(`http://localhost:5191/?explore=survival-town&nolock&at=${at}`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 120_000))) throw new Error('page did not start');
    await sleep(3500);
    await shot(name);
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
