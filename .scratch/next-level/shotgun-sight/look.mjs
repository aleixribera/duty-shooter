// Review 2026-11-14b: the Harrow 12's receiver hiding the dummy's lower half when aimed (30-shotgun-ads). Walks the
// Practice Range alone with the shotgun, aims at the 10 m and 25 m dummies and takes a frame fully aimed (and one
// with the Reflex on), at desktop and phone width.
//
//   node .scratch/next-level/shotgun-sight/look.mjs <out dir>     (dev server on :5173, BASE overrides)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir>');
const base = process.env.BASE ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const AIM_AT = (id) => `(() => {
  const g = duty.game, me = g?.player, t = g?.driver?.others(0).find((p) => p.id === ${JSON.stringify(id)});
  if (!me || !t) return null;
  const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
  const dx = t.position[0] - eye[0], dy = t.position[1] + t.eyeHeight * 0.78 - eye[1], dz = t.position[2] - eye[2];
  const look = g.input.angles;
  g.input.setAngles(Math.atan2(-dx, -dz) - (me.yaw - look.yaw), Math.atan2(dy, Math.hypot(dx, dz)) - (me.pitch - look.pitch));
  return Math.round(Math.hypot(dx, dz));
})()`;
const SIZES = [
  { name: 'desktop', width: 1920, height: 1080, mobile: false },
  { name: 'phone', width: 844, height: 390, mobile: false },
];
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${base}?explore=range&nolock`);
  if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('page did not start');
  await sleep(3000);
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w' });
  await sleep(1500);
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w' });
  for (const optic of [null, 'reflex']) {
    await chrome.evaluate(`duty.game.driver.setLoadout(${JSON.stringify({ primary: 'shotgun', secondary: 'pistol', grenade: 'frag', attachments: optic ? { primary: { optic } } : {} })})`);
    await sleep(3200);
    for (const size of SIZES) {
      await chrome.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      for (const target of optic ? ['dummy-10'] : ['dummy-10', 'dummy-25']) {
        const mouse = (type, button, buttons) => chrome.send('Input.dispatchMouseEvent', { type, x: size.width / 2, y: size.height / 2, button, buttons, clickCount: 1 });
        await chrome.evaluate(AIM_AT(target));
        await mouse('mousePressed', 'right', 2);
        await sleep(1500);
        await chrome.evaluate(AIM_AT(target));
        await sleep(300);
        const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
        writeFileSync(join(out, `${size.name}-${target}${optic ? `-${optic}` : ''}.jpg`), Buffer.from(s.result.data, 'base64'));
        await mouse('mouseReleased', 'right', 0);
        await sleep(600);
      }
    }
  }
  console.log(JSON.stringify({ errors: [...new Set(chrome.errors)].slice(0, 5) }));
} finally {
  await chrome.close();
}
