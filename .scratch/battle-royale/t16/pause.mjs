// The pause screen's Controls list away from a Battle Royale: no "Island map".
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`http://127.0.0.1:5199/?nolock&explore=switchyard`);
  if (!(await chrome.waitFor(`location.protocol === 'http:' && globalThis.duty?.game?.player`, 180_000))) throw new Error('page did not start');
  await sleep(3000);
  await chrome.evaluate(`duty.menu.show('pause')`);
  await sleep(800);
  const keys = await chrome.evaluate(`document.querySelector('.ds-keys')?.innerText.replace(/\s+/g, ' ')`);
  console.log(keys);
  console.log(/Island map/.test(keys ?? '') ? 'FAIL Island map listed' : 'PASS no Island map', /Scoreboard/.test(keys ?? '') ? 'PASS Scoreboard listed' : 'FAIL');
  const shot = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
  writeFileSync('.scratch/battle-royale/shots/t16/pause-explore-switchyard.jpg', Buffer.from(shot.result.data, 'base64'));
} finally {
  await chrome.close();
}
