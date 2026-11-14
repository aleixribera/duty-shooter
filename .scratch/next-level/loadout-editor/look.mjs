// PLAN item 7, the loadout editor (rough): the Loadout screen's gun in 3D, turning, how long it takes to show,
// the three kept loadouts and picking one there, then in a Bot Match picking one while dead with 1, 2, 3 and
// respawning with it. Needs the dev server.
//
//   node .scratch/next-level/loadout-editor/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/loadout-editor/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const ONLY = process.env.ONLY ?? '';
mkdirSync(OUT, { recursive: true });
const CURVE = Math.log(400_000 / 800) / Math.log(49);
const floor = (r) => (r === 1 ? 0 : Math.round((800 * (r - 1) ** CURVE) / 50) * 50);

const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text, scope = 'button') =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const hover = (text) => chrome.evaluate(`[...document.querySelectorAll('.ds-mode')].find((b) => b.innerText.toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())}))?.dispatchEvent(new MouseEvent('mouseenter'))`);
const key = (type, code, text) => chrome.send('Input.dispatchKeyEvent', { type, code, key: text ?? code, ...(type === 'keyDown' && text ? { text } : {}), windowsVirtualKeyCode: code.startsWith('Digit') ? 48 + Number(code.slice(5)) : code.startsWith('Key') ? code.charCodeAt(3) : 0 });
const press = async (code, text) => {
  await key('keyDown', code, text);
  await sleep(60);
  await key('keyUp', code, text);
};
const report = { steps: [], errors: chrome.errors };
const log = (step, detail) => {
  report.steps.push({ step, ...detail });
  console.log(step, JSON.stringify(detail));
};
const settingsKey = 'duty-shooter.settings.v1';
const start = async (xp, settings, query = '') => {
  await chrome.evaluate(`localStorage.setItem('duty-shooter.profile.v2', JSON.stringify({ version: 1, xp: ${xp} })); ${settings ? `localStorage.setItem('${settingsKey}', ${JSON.stringify(JSON.stringify(settings))})` : `localStorage.removeItem('${settingsKey}')`}`);
  await chrome.navigate(`${BASE}?nolock${query}`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
};
const desktop = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const phone = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
const drawn = `document.querySelector('.ds-stage')?.dataset.drawn ?? null`;
/** Milliseconds from now until the stage has drawn `want` (or any gun), or null after `limit`. */
const until = async (want, limit = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    const d = await js(drawn);
    if (d && (!want || d === want)) return Date.now() - t0;
    await sleep(25);
  }
  return null;
};

try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await desktop();
  await chrome.navigate(BASE);
  if (!ONLY || ONLY === 'menu') {
    // A fresh browser: the first open makes the stage's renderer; the second is the time a player meets after.
    await start(0, null);
    // The page settled first (its map and engine in), as a player who reads the menu a moment.
    await sleep(Number(process.env.SETTLE ?? 8000));
    let t0 = Date.now();
    if (!(await click('Loadout'))) throw new Error('no Loadout on the main menu');
    const first = await until('m4a1');
    log('first open', { msToGun: first, wallMs: Date.now() - t0 });
    await sleep(1200);
    await shot('fresh-desktop');
    await click('Done');
    await sleep(500);
    t0 = Date.now();
    await click('Loadout');
    log('second open', { msToGun: await until('m4a1'), sets: await js(`[...document.querySelectorAll('.ds-sets .ds-mode')].map((b) => b.innerText.replace(/\\n/g, ' / ') + (b.classList.contains('on') ? ' [on]' : ''))`) });
    await hover('Wasp 9');
    log('hover wasp', { msToGun: await until('smg') });
    await sleep(2500);
    await shot('wasp-turned-desktop');
    // Pick Close: its guns lit, carried from the next spawn.
    await click('Close', '.ds-sets .ds-mode');
    await sleep(600);
    log('picked close', { set: await js(`JSON.parse(localStorage.getItem('${settingsKey}')).loadoutSet`), primary: await js(`JSON.parse(localStorage.getItem('${settingsKey}')).loadout.primary`), lit: await js(`[...document.querySelectorAll('.ds-kit:not(.ds-smith-tiles):not(.ds-sets) .ds-mode.on')].map((b) => b.querySelector('b').innerText)`), focus: await js(`document.activeElement?.innerText?.split('\\n')[0]`) });
    await sleep(1500);
    await shot('close-desktop');
    await phone();
    await sleep(1200);
    await shot('close-phone');
    await chrome.evaluate(`document.querySelector('.ds-stage')?.scrollIntoView({ block: 'center' })`);
    await sleep(1200);
    await shot('close-phone-stage');
    await desktop();

    // Rank 12 with a Reflex on the Trident: the optic on the model, irons folded.
    await start(floor(12), { loadout: { primary: 'burst', secondary: 'revolver', grenade: 'frag', tactical: 'smoke', perk: null, attachments: { primary: { optic: 'reflex' } } }, builds: { burst: { optic: 'reflex' } } });
    await chrome.evaluate(`localStorage.setItem('duty-shooter.profile.v2', JSON.stringify({ version: 1, xp: ${floor(12)}, weapons: { burst: { kills: 500 } } }))`);
    await chrome.navigate(`${BASE}?nolock`);
    await chrome.waitFor('globalThis.duty?.game', 90_000);
    await sleep(1500);
    await click('Loadout');
    log('trident reflex', { msToGun: await until('burst+reflex') });
    await sleep(800);
    await shot('trident-reflex-desktop');
    await hover('Prism 2x');
    log('prism hover', { msToGun: await until('burst+prism') });
    await sleep(800);
    await shot('trident-prism-desktop');
    await hover('Ridgeline');
    log('ridgeline', { msToGun: await until('sniper') });
    await sleep(800);
    await shot('ridgeline-desktop');
  }

  if (!ONLY || ONLY === 'match') {
    // A Bot Match: die, press 3, respawn carrying Breach's guns.
    // The newcomer's hint on the first death is done, so the prompt shows.
    await chrome.evaluate(`localStorage.setItem('duty-shooter.hints.v1', JSON.stringify({ done: ['loadout'], shown: {} }))`);
    await start(floor(12), null, '&matchtime=300');
    for (const p of ['Bot Match', 'Survival Town', 'Free-for-all', 'Hard', 'Start']) {
      if (!(await click(p))) throw new Error(`no "${p}" button`);
      await sleep(400);
    }
    if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 120_000))) throw new Error('the match did not start');
    const self = `duty.game.player`;
    log('spawned', { primary: await js(`${self}?.loadout?.primary ?? null`) });
    // A frag held past its fuse.
    let dead = false;
    for (let i = 0; i < 6 && !dead; i++) {
      await key('keyDown', 'KeyG', 'g');
      await sleep(6000);
      await key('keyUp', 'KeyG', 'g');
      dead = await chrome.waitFor(`duty.game.player && !duty.game.player.alive`, 20_000);
    }
    log('dead', { dead, prompt: await js(`document.querySelector('.ds-hud')?.innerText.match(/1 2 3[^\\n]*/)?.[0] ?? null`) });
    await shot('dead-before-pick');
    await press('Digit3', '3');
    await sleep(400);
    log('pressed 3', { set: await js(`JSON.parse(localStorage.getItem('${settingsKey}')).loadoutSet`), prompt: await js(`document.querySelector('.ds-hud')?.innerText.match(/1 2 3[^\\n]*/)?.[0] ?? null`) });
    await shot('dead-picked-breach');
    const back = await chrome.waitFor(`duty.game.player?.alive`, 30_000);
    log('respawned', { back, primary: await js(`${self}?.loadout?.primary ?? null`), secondary: await js(`${self}?.loadout?.secondary ?? null`), weapon: await js(`${self}?.weapon?.id ?? null`) });
    await sleep(1500);
    await shot('respawned-breach');
  }
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
