// Views from spawns: each named spot walked alone, facing the yaw the map gives it.
//   node .scratch/next-level/opening-sight/look.mjs <out dir> <map> x,z ...   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, map, ...spots] = process.argv.slice(2);
const base = 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const walk = async (at) => {
  await chrome.navigate(`${base}?explore=${map}&nolock&at=${at}`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 180_000))) throw new Error('page did not start');
  await sleep(3500);
};
try {
  await walk('0,0,0');
  const spawns = JSON.parse(await chrome.evaluate('JSON.stringify(duty.map.spawns.ffa)'));
  for (const v of spots) {
    const [x, z] = v.split(',').map(Number);
    const s = spawns.find((s) => Math.abs(s.position[0] - x) < 0.01 && Math.abs(s.position[2] - z) < 0.01);
    if (!s) throw new Error(`no spawn at ${x},${z}`);
    await walk(`${x},${z},${s.yaw}`);
    await shot(`${map}-${x}_${z}`);
    console.log(v, 'yaw', s.yaw.toFixed(2));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
