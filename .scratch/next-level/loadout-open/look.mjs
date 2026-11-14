// PLAN item 7's acceptance: the Loadout screen opens from the menu to the gun in under a second. Each run is a fresh
// page (its shaders compile anew): wait on the main menu, click Loadout, time until the stage has drawn the gun.
// Then the open screen at desktop and phone width. Needs the dev server.
//
//   node .scratch/next-level/loadout-open/look.mjs <out dir> [base url]
//   WAITS=1500,6000 (ms on the menu before the click), RUNS=2 (pages per wait)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/loadout-open/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const WAITS = (process.env.WAITS ?? '1500,6000').split(',').map(Number);
const RUNS = Number(process.env.RUNS ?? 2);
mkdirSync(OUT, { recursive: true });

const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  await chrome.evaluate(`document.querySelector('.ds-stage')?.scrollIntoView({ block: 'center' })`);
  await sleep(700);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const results = [];
const desktop = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const phone = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
const until = async (want, limit = 45000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    if ((await js(`document.querySelector('.ds-stage')?.dataset.drawn ?? null`)) === want) return Date.now() - t0;
    await sleep(25);
  }
  return null;
};
const build = { optic: 'reflex', muzzle: 'suppressor', magazine: 'extended', grip: 'vertical' };
const SETTINGS = { loadout: { primary: 'm4a1', secondary: 'pistol', grenade: 'frag', tactical: 'smoke', perk: null, attachments: { primary: build } }, builds: { m4a1: build }, camos: { m4a1: 'forest' } };
const mastered = { kills: 600, headshots: 0, longest: 0 };
const PROFILE = { version: 1, xp: 400000, weapons: { m4a1: mastered } };

try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await desktop();
  await chrome.navigate(BASE);
  for (const wait of WAITS) {
    for (let run = 0; run < RUNS; run++) {
      await chrome.evaluate(`localStorage.setItem('duty-shooter.profile.v2', ${JSON.stringify(JSON.stringify(PROFILE))}); localStorage.setItem('duty-shooter.settings.v1', ${JSON.stringify(JSON.stringify(SETTINGS))})`);
      await chrome.navigate(`${BASE}?nolock`);
      if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
      await sleep(wait);
      const warmed = await js(`globalThis.duty?.menu?.gunStage?.element.dataset.warm ?? null`);
      await click('Loadout');
      const ms = await until('m4a1+reflex');
      results.push({ wait, run, warmed, msToGun: ms });
      console.log(JSON.stringify(results.at(-1)));
    }
  }
  await sleep(2000);
  await shot('open-desktop');
  await phone();
  await sleep(1500);
  await shot('open-phone');
} finally {
  writeFileSync(`${OUT}/result.json`, JSON.stringify({ results, errors: chrome.errors }, null, 2));
  await chrome.close();
}
