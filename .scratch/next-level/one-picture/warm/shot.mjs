// A screenshot of Zero Island walked alone, once play has started (after the game's warm-up).
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../../apps/range/scripts/chrome.mjs';
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`http://localhost:5191/?explore=zero-island&at=${process.argv[2]}&nolock`);
  await chrome.waitFor('globalThis.duty?.game?.driver && duty.game.drawing && !duty.game.warming', 240_000, 500);
  await sleep(4000);
  const r = await chrome.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(new URL('./play.png', import.meta.url), Buffer.from(r.result.data, 'base64'));
  console.log('errors', chrome.errors.slice(0, 3));
} finally {
  await chrome.close();
}
