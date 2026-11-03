// Previews Zero Island's nuke ending with no match on (dev server, ?explore), screenshots at a few seconds.
//   node .scratch/battle-royale/t16/preview.mjs <out dir> [port]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
const port = process.argv[3] ?? '5199';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`http://127.0.0.1:${port}/?nolock&map=zero-island&spot=overhead`);
  if (!(await chrome.waitFor(`location.protocol === 'http:' && globalThis.duty?.game`, 180_000))) throw new Error('page did not start');
  await sleep(10000);
  for (const t of [0.5, 2.5, 3.2, 4.5, 6, 9, 15]) {
    await chrome.evaluate(`duty.game.previewEnding = ${t}`);
    await sleep(900);
    const shot = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
    writeFileSync(`${out}/t${t}.jpg`, Buffer.from(shot.result.data, 'base64'));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 5) }));
} finally {
  await chrome.close();
}
