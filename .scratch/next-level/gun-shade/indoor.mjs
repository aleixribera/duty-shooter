// The gun in hand indoors: the middle of Survival Town's first indoor zone, facing along its longer side.
//   node .scratch/next-level/gun-shade/indoor.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const out = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  await chrome.navigate(`${BASE}?explore=survival-town&nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
  const z = await chrome.evaluate(`JSON.parse(JSON.stringify(duty.map.indoorZones?.[0] ?? null))`);
  console.log(JSON.stringify(z));
  const min = z.min ?? z.box?.min, max = z.max ?? z.box?.max;
  const x = (min[0] + max[0]) / 2, zc = (min[2] + max[2]) / 2;
  const yaw = max[0] - min[0] > max[2] - min[2] ? -Math.PI / 2 : 0;
  await chrome.navigate(`${BASE}?explore=survival-town&nolock&at=${x.toFixed(2)},${zc.toFixed(2)},${yaw.toFixed(3)}`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
  await sleep(5000);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  writeFileSync(`${out}/indoor.jpg`, Buffer.from(s.result.data, 'base64'));
  console.log(JSON.stringify({ player: await chrome.evaluate('duty.game.player?.position'), errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
