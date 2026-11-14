// A spawn's first look, walked alone: each spot at a given facing, or at the facing the map gives it now (yaw "map").
//   node .scratch/next-level/yard-view/look.mjs <out dir> <map> name=x,z,yaw|map ...   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, map, ...spots] = process.argv.slice(2);
if (!out || !map) throw new Error('usage: look.mjs <out dir> <map> name=x,z,yaw|map ...');
const base = 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const walk = async (at) => {
  await chrome.navigate(`${base}?explore=${map}&nolock&at=${at}`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 180_000))) throw new Error('page did not start');
  await sleep(3500);
};
try {
  await walk('0,0,0');
  const spawns = JSON.parse(await chrome.evaluate('JSON.stringify([...duty.map.spawns.ffa, ...(duty.map.spawns.teams ?? []).flat()])'));
  for (const v of spots) {
    const [name, at] = v.split('=');
    const [xs, zs, ys] = at.split(',');
    const [x, z] = [Number(xs), Number(zs)];
    let yaw = Number(ys);
    if (ys === 'map') {
      const now = spawns.find((s) => Math.abs(s.position[0] - x) < 0.01 && Math.abs(s.position[2] - z) < 0.01);
      if (!now) throw new Error(`no spawn at ${x},${z}`);
      yaw = now.yaw;
    }
    await walk(`${x},${z},${yaw}`);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    console.log(name, x, z, yaw.toFixed(3));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
