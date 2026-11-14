// The Preparation screen alone (no Zero Island load): mounts PreparationPage over the menu page through Vite and
// frames its solo Ready and two-player Ready at desktop and phone width. Needs the dev server.
//   node .scratch/next-level/subheads/prep.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/subheads/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });
const mod = '/@fs/' + resolve('packages/fps-client/src/ui/preparation.ts').split(String.fromCharCode(92)).join('/');
const chrome = await launchChrome();
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const show = (people) => chrome.evaluate(`(async () => {
  const { PreparationPage } = await import(${JSON.stringify(mod)});
  document.querySelector('.ds-menu')?.setAttribute('hidden', '');
  document.querySelector('.ds-prep')?.remove();
  const page = new PreparationPage(document.body, { loadout() {}, build() {}, ready() {}, play() {} });
  page.show({ stage: 'squad', elapsed: 9, left: 18, alive: 60, squads: 60, squad: [], loadout: { primary: 'm4a1', secondary: 'pistol', grenade: 'frag' },
    ready: false, readyCount: 0, people: ${people}, loading: 0, play: false });
  return document.querySelector('.ds-prep .go')?.innerText ?? null;
})()`);
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(2000);
  console.log('solo:', JSON.stringify(await show(1)));
  await sleep(1800);
  await shot('4-prep-solo');
  console.log('two:', JSON.stringify(await show(2)));
  await sleep(1800);
  await shot('4-prep-two');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await show(1);
  await sleep(1800);
  await shot('4-prep-phone');
  if (chrome.errors.length) console.log('errors:', chrome.errors.slice(0, 3));
} finally {
  await chrome.close();
}
