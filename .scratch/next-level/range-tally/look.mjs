// Review 2026-11-14c close-behind: the Practice Range panel said "Shots / hits 4 / 3" after 23 Wasp rounds (a kill, then
// the respawned dummy's first hits wiped it). Walks the range alone, changes gun as the review's capture does, fires as it
// does (2 or 5 presses, PRESSES overrides), and reads the panel after each gun: Shots / hits should tally every round
// spent, and Time to kill keep the last kill. SIZE=844x390 for a phone-sized window. Prints one JSON line per gun.
//
//   node .scratch/next-level/range-tally/look.mjs <out dir>     (dev server on :5173, BASE overrides)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir>');
const [W, H] = (process.env.SIZE ?? '1920x1080').split('x').map(Number);
const base = process.env.BASE ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const SIGHTS = [
  ['m4a1', null],
  ['m4a1', 'reflex'],
  ['dmr', null],
  ['sniper', null],
  ['shotgun', null],
  ['smg', null],
];
const AIM_AT = (id) => `(() => {
  const g = duty.game, me = g?.player, t = g?.driver?.others(0).find((p) => p.id === ${JSON.stringify(id)});
  if (!me || !t) return null;
  const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
  const dx = t.position[0] - eye[0], dy = t.position[1] + t.eyeHeight * 0.78 - eye[1], dz = t.position[2] - eye[2];
  const look = g.input.angles;
  g.input.setAngles(Math.atan2(-dx, -dz) - (me.yaw - look.yaw), Math.atan2(dy, Math.hypot(dx, dz)) - (me.pitch - look.pitch));
  return Math.round(Math.hypot(dx, dz));
})()`;
const PANEL = `(() => Object.fromEntries(['ttk', 'dist', 'shots', 'last-hit'].map((k) => [k, document.querySelector('.' + k)?.textContent ?? null])))()`;
const chrome = await launchChrome();
try {
  // Other sessions' edits must not reload the page mid-run.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${base}?explore=range&nolock`);
  if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('page did not start');
  await sleep(3000);
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(join(out, `${name}.jpg`), Buffer.from(s.result.data, 'base64'));
  };
  const mouse = (type, button, buttons) => chrome.send('Input.dispatchMouseEvent', { type, x: W / 2, y: H / 2, button, buttons, clickCount: 1 });
  const key = async (code, k) => {
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k });
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k });
  };
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w' });
  await sleep(1500);
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w' });
  for (const [gun, optic] of SIGHTS.filter(([g]) => !process.env.ONLY || process.env.ONLY.split(",").includes(g))) {
    const name = `${gun}${optic ? `-${optic}` : ''}`;
    await chrome.evaluate(`duty.game.driver.setLoadout(${JSON.stringify({ primary: gun, secondary: 'pistol', grenade: 'frag', attachments: optic ? { primary: { optic } } : {} })})`);
    await sleep(3200);
    const changed = await chrome.evaluate(PANEL);
    const ammo0 = await chrome.evaluate(`duty.game.player.weapon.ammo`);
    const target = gun === 'shotgun' ? 'dummy-10' : 'dummy-25';
    await chrome.evaluate(AIM_AT(target));
    await mouse('mousePressed', 'right', 2);
    await sleep(1500);
    await chrome.evaluate(AIM_AT(target));
    await sleep(150);
    await shot(`${name}-ads`);
    const presses = Number(process.env.PRESSES ?? 0) || (gun === 'sniper' || gun === 'shotgun' ? 2 : 5);
    let fired = null;
    for (let i = 0; i < presses; i++) {
      if (i > 0) await chrome.evaluate(AIM_AT(target));
      await mouse('mousePressed', 'left', 3);
      await sleep(120);
      if (i === 0) {
        await shot(`${name}-fire`);
        fired = await chrome.evaluate(PANEL);
      }
      await mouse('mouseReleased', 'left', 2);
      await sleep(gun === 'sniper' || gun === 'shotgun' ? 1400 : 300);
    }
    await mouse('mouseReleased', 'right', 0);
    await sleep(400);
    const after = await chrome.evaluate(PANEL);
    await shot(`${name}-after`);
    const spent = ammo0 - (await chrome.evaluate(`duty.game.player.weapon.ammo`));
    console.log(JSON.stringify({ gun: name, changed, fired, after, spent }));
  }
  // Back to the pistol and to the rifle by the number keys: a weapon switch blanks the panel too.
  await key('Digit2', '2');
  await sleep(1200);
  console.log(JSON.stringify({ gun: 'switch to pistol', panel: await chrome.evaluate(PANEL) }));
  await shot('switched');
  console.log(JSON.stringify({ errors: [...new Set(chrome.errors)].slice(0, 5) }));
} finally {
  await chrome.close();
}
