// PLAN item 7, Customizing (rough): attachments on the gun model, camos by Mastery, each optic's reticle colour and
// shape. The Loadout screen's gun with a build and a camo on it, hovering camos and reticles; then the gun in first
// person on the range, hip and aimed. Needs the dev server.
//
//   node .scratch/next-level/customize/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/customize/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const ONLY = process.env.ONLY ?? '';
mkdirSync(OUT, { recursive: true });

const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const stageShot = async (name) => {
  await chrome.evaluate(`document.querySelector('.ds-stage')?.scrollIntoView({ block: 'center' })`);
  await sleep(700);
  await shot(name);
};
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text, scope = 'button') =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
/** Hovers the tile starting `text` in the gunsmith row labelled `row` of the primary. */
const hoverIn = (row, text) => chrome.evaluate(`(() => { const r = [...document.querySelectorAll('.ds-smith-row')].find((r) => r.querySelector('.ds-label')?.innerText.trim().toUpperCase() === ${JSON.stringify(row.toUpperCase())}); const b = r && [...r.querySelectorAll('.ds-mode')].find((b) => b.innerText.toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.dispatchEvent(new MouseEvent('mouseenter')); return true; })()`);
const clickIn = (row, text) => chrome.evaluate(`(() => { const r = [...document.querySelectorAll('.ds-smith-row')].find((r) => r.querySelector('.ds-label')?.innerText.trim().toUpperCase() === ${JSON.stringify(row.toUpperCase())}); const b = r && [...r.querySelectorAll('.ds-mode')].find((b) => b.innerText.toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const report = { steps: [], errors: chrome.errors };
const log = (step, detail) => {
  report.steps.push({ step, ...detail });
  console.log(step, JSON.stringify(detail));
};
const settingsKey = 'duty-shooter.settings.v1';
const desktop = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const phone = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
const drawn = `document.querySelector('.ds-stage')?.dataset.drawn ?? null`;
const until = async (want, limit = 45000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    const d = await js(drawn);
    if (d && (!want || d === want)) return Date.now() - t0;
    await sleep(50);
  }
  return null;
};
const mastered = { kills: 600, headshots: 0, longest: 0 };
const PROFILE = { version: 1, xp: 400000, weapons: { m4a1: mastered, burst: mastered, shotgun: mastered, sniper: { kills: 80, headshots: 0, longest: 0 } } };
const start = async (settings, query = '') => {
  await chrome.evaluate(`localStorage.setItem('duty-shooter.profile.v1', ${JSON.stringify(JSON.stringify(PROFILE))}); localStorage.setItem('${settingsKey}', ${JSON.stringify(JSON.stringify(settings))})`);
  await chrome.navigate(`${BASE}?nolock${query}`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
};
/** Waits for the map's loading card to go, then for the gun to settle in the hands. */
const ready = async () => {
  await chrome.waitFor(`!/loading/i.test(document.body.innerText)`, 90_000);
  await sleep(5000);
};
const m4Build = { optic: 'reflex', muzzle: 'suppressor', magazine: 'extended', grip: 'vertical' };
const loadout = (primary, attachments) => ({ primary, secondary: 'pistol', grenade: 'frag', tactical: 'smoke', perk: null, attachments: { primary: attachments } });

try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await desktop();
  await chrome.navigate(BASE);
  if (!ONLY || ONLY === 'menu') {
    await start({ loadout: loadout('m4a1', m4Build), builds: { m4a1: m4Build, burst: { muzzle: 'compensator', grip: 'angled', magazine: 'speed', optic: 'prism' }, shotgun: { grip: 'vertical' } }, camos: { m4a1: 'forest' }, reticles: { reflex: { colour: 'green', shape: 'chevron' } } });
    await click('Loadout');
    log('m4 forest', { msToGun: await until('m4a1+reflex'), rows: await js(`[...document.querySelectorAll('.ds-smith-row .ds-label')].map((l) => l.innerText)`) });
    await sleep(2500);
    await stageShot('m4-forest-desktop');
    for (const camo of ['Sand', 'Urban', 'Night', 'Gold']) {
      log(`hover ${camo}`, { ok: await hoverIn('Camo', camo) });
      await sleep(1800);
      await stageShot(`m4-${camo.toLowerCase()}-desktop`);
    }
    log('pick gold', { ok: await clickIn('Camo', 'Gold'), saved: await js(`JSON.parse(localStorage.getItem('${settingsKey}')).camos`) });
    log('pick cyan ring', { colour: await clickIn('Reticle', 'Cyan'), shape: await clickIn('Shape', 'Ring'), saved: await js(`JSON.parse(localStorage.getItem('${settingsKey}')).reticles`) });
    await sleep(1500);
    await phone();
    await sleep(1500);
    await stageShot('m4-gold-phone');
    await chrome.evaluate(`document.querySelector('.ds-smith-row')?.scrollIntoView({ block: 'center' })`);
    await sleep(800);
    await shot('m4-gold-phone-rows');
    await desktop();
    await sleep(800);
    // The Trident with a compensator, an angled grip and the speed magazine's tab; the shotgun's grip on its pump.
    await click('Trident');
    log('trident', { msToGun: await until('burst+prism') });
    await sleep(2500);
    await stageShot('trident-desktop');
    await click('Harrow');
    log('harrow', { msToGun: await until('shotgun') });
    await sleep(2500);
    await stageShot('harrow-desktop');
    // The Ridgeline at 80 kills: Mastery 1 earns Sand, the rest locked.
    await click('Ridgeline');
    await until('sniper');
    log('ridgeline camos', { tiles: await js(`[...document.querySelectorAll('.ds-smith-row')].filter((r) => r.querySelector('.ds-label').innerText.trim().toUpperCase() === 'CAMO').flatMap((r) => [...r.querySelectorAll('.ds-mode')].map((b) => b.innerText.replace(/\\n/g, ' / ') + (b.classList.contains('locked') ? ' [locked]' : '')))`) });
  }

  if (ONLY === 'first') {
    // The first open's time to the gun, bare and with the full build (each a fresh page: its shaders compile anew). Run it on a quiet PC.
    for (const [camos, build] of [[{}, { optic: 'reflex' }], [{}, m4Build], [{}, { optic: 'reflex' }], [{}, m4Build]]) {
      await start({ loadout: loadout('m4a1', build), builds: { m4a1: build }, camos }); log('build', build);
      await click('Loadout');
      log('first open', { camos, build, msToGun: await until('m4a1+reflex') });
    }
  }

  if (!ONLY || ONLY === 'range') {
    // In first person on the range: the M4A1 in Gold with its suppressor, grip and long magazine; aimed through a green chevron.
    await start({ loadout: loadout('m4a1', m4Build), builds: { m4a1: m4Build }, camos: { m4a1: 'gold' }, reticles: { reflex: { colour: 'green', shape: 'chevron' } } }, '&explore=range');
    await ready();
    await shot('range-m4-hip');
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'right', buttons: 2, clickCount: 1 });
    await sleep(1200);
    await shot('range-m4-aimed');
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(400);
    // The same gun in Urban, aimed through an amber ring.
    await start({ loadout: loadout('m4a1', m4Build), builds: { m4a1: m4Build }, camos: { m4a1: 'urban' }, reticles: { reflex: { colour: 'amber', shape: 'ring' } } }, '&explore=range');
    await ready();
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'right', buttons: 2, clickCount: 1 });
    await sleep(1200);
    await shot('range-m4-urban-aimed-ring');
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'right', buttons: 0, clickCount: 1 });
  }
} catch (error) {
  log('failed', { error: String(error) });
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
