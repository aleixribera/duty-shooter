// Spawns whose first screen opened on something under the nose or mostly wall: each walked alone from its spot, before (the facing HEAD gave it) and after.
//   node .scratch/next-level/spawn-near/look.mjs <out dir> <map> name=x,z,oldYaw ...   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, map, ...spots] = process.argv.slice(2);
if (!out || !map) throw new Error('usage: look.mjs <out dir> <map> name=x,z,oldYaw ...');
const base = 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const walk = async (at) => {
  await chrome.navigate(`${base}?explore=${map}&nolock&at=${at}`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 180_000))) throw new Error('page did not start');
  await sleep(4000);
};
try {
  await walk('0,0,0');
  const all = await chrome.evaluate('JSON.stringify([...duty.map.spawns.ffa, ...(duty.map.spawns.teams ?? []).flat()])');
  const spawns = JSON.parse(all);
  for (const v of spots) {
    const [name, at] = v.split('=');
    const [x, z, old] = at.split(',').map(Number);
    const now = spawns.find((s) => Math.abs(s.position[0] - x) < 0.01 && Math.abs(s.position[2] - z) < 0.01);
    if (!now) throw new Error(`no spawn at ${x},${z}`);
    await walk(`${x},${z},${old}`);
    await shot(`${map}-${name}-before`);
    await walk(`${x},${z},${now.yaw}`);
    await shot(`${map}-${name}-after`);
    console.log(name, 'old', old, 'now', now.yaw.toFixed(3));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
