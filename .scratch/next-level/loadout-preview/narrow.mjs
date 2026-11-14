// The kept loadouts at 360 px wide with the longest gun names: no name spills out of its tile.
//   node .scratch/next-level/loadout-preview/narrow.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const OUT = process.argv[2] ?? '.scratch/next-level/loadout-preview/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
  await chrome.evaluate(`localStorage.setItem('duty-shooter.profile.v2', ${JSON.stringify(JSON.stringify({ version: 1, xp: 400000, weapons: {} }))})`).catch(() => {});
  await chrome.navigate(`${BASE}?nolock`);
  await chrome.evaluate(`localStorage.setItem('duty-shooter.profile.v2', ${JSON.stringify(JSON.stringify({ version: 1, xp: 400000, weapons: {} }))})`);
  await chrome.navigate(`${BASE}?nolock`);
  await chrome.waitFor('globalThis.duty?.game', 90_000);
  await sleep(2500);
  await chrome.evaluate(`[...document.querySelectorAll('button')].find((b) => b.getClientRects().length && b.innerText.trim().toUpperCase().startsWith('LOADOUT'))?.click()`);
  await sleep(2500);
  // The longest names a kept loadout can carry, written into the tiles.
  const out = await chrome.send('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify((() => { const tiles = [...document.querySelectorAll('.ds-sets .ds-mode')]; const names = [['Ridgeline .308', 'Marshal .357'], ['Bulwark 5.56', 'Warden 9'], ['Vantage 7.62', 'Marshal .357']]; tiles.forEach((t, i) => t.querySelectorAll('.gun').forEach((g, j) => (g.textContent = names[i][j]))); document.querySelector('.ds-sets').scrollIntoView({ block: 'center' }); return tiles.map((t) => { const r = t.getBoundingClientRect(); return { text: t.innerText.split(String.fromCharCode(10)).join(' / '), spill: [...t.querySelectorAll('.gun')].some((g) => g.getBoundingClientRect().right > r.right - 1 || g.scrollWidth > g.clientWidth + 1) }; }); })())` });
  console.log(JSON.stringify(out.result?.result?.value ?? out.result?.exceptionDetails?.exception?.description ?? out));
  await sleep(600);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  writeFileSync(`${OUT}/5-sets-360-longest.jpg`, Buffer.from(s.result.data, 'base64'));
} finally {
  await chrome.close();
}
