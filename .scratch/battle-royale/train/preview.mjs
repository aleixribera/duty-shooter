// Previews Switchyard's ending with no match on, from a reference spot, and screenshots it at a few seconds.
//   node .scratch/battle-royale/train/preview.mjs <out dir> [spot] [extra query]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
const spot = process.argv[3] ?? 'overview';
const extra = process.argv[4] ?? '';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  await chrome.navigate(`http://localhost:5173/?nolock&map=switchyard&spot=${encodeURIComponent(spot)}${extra}`);
  if (!(await chrome.waitFor(`location.protocol === 'http:' && globalThis.duty?.game`, 90_000))) throw new Error('page did not start');
  await sleep(8000);
  for (const t of [-1, 1, 2, 3, 4, 5, 8]) {
    await chrome.evaluate(`duty.game.previewEnding = ${t < 0 ? 'null' : t}`);
    await sleep(700);
    const shot = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 });
    writeFileSync(`${out}/${spot.replace(/ /g, '-')}-t${t}.jpg`, Buffer.from(shot.result.data, 'base64'));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 5) }));
} finally {
  await chrome.close();
}
