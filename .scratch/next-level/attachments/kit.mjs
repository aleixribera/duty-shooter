// Ticket 19 in the real game: a saved loadout with attachments spawns with them.
// The HUD's magazine shows the build's rounds, and aiming shows its zoom (a screenshot each, aimed at the nearest dummy).
//   KIT='{"magazine":"extended","optic":"prism"}' NAME=prism node .scratch/next-level/attachments/kit.mjs
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const KIT = JSON.parse(process.env.KIT ?? '{}');
const NAME = process.env.NAME ?? 'stock';
const OUT = new URL('.', import.meta.url);
const loadout = { primary: 'm4a1', secondary: 'pistol', grenade: 'frag', tactical: 'smoke', perk: null, attachments: { primary: KIT } };
const SEED = `(() => { try { const k = 'duty-shooter.settings.v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.loadout = ${JSON.stringify(loadout)}; localStorage.setItem(k, JSON.stringify(s)); } catch {} })()`;
const PAD = `(() => { const pad = (window.__pad = { buttons: Array(18).fill(0), axes: [0, 0, 0, 0] });
  navigator.getGamepads = () => [{ id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: pad.axes.slice(), buttons: pad.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })) }];
  Document.prototype.hasFocus = () => true;
})()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PAD });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${BASE}?explore=range&nolock`);
  if (!(await chrome.waitFor('window.duty?.game?.player && !duty.game.paused', 240_000))) throw new Error('never playing');
  const js = (e) => chrome.evaluate(e);
  await sleep(2500);
  for (const v of [1, 0, 1, 0]) {
    await js(`__pad.buttons[3] = ${v}`);
    await sleep(250);
  }
  await sleep(1500);
  const mag = () => js(`document.querySelector('.ds-ammo .mag')?.textContent`);
  console.log(NAME, 'magazine on the HUD', await mag());
  const target = await js(`(() => { const me = duty.game.player; const ds = (duty.driver?.others(1) ?? []).filter((o) => o.kind === 'dummy' && o.alive);
    const d = ds.map((o) => ({ o, r: Math.hypot(o.position[0] - me.position[0], o.position[2] - me.position[2]) })).filter((x) => x.r > 12).sort((a, b) => a.r - b.r)[0];
    if (!d) return null; const p = [d.o.position[0], d.o.position[1] + d.o.eyeHeight * 0.72, d.o.position[2]];
    const dx = p[0] - me.position[0], dy = p[1] - (me.position[1] + me.eyeHeight), dz = p[2] - me.position[2];
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz)); duty.game.input.setAngles(yaw, pitch);
    return { range: d.r.toFixed(1) }; })()`);
  console.log(NAME, 'aimed at a dummy', target);
  await sleep(500);
  // Aimed: L2 held.
  await js('__pad.buttons[6] = 1');
  await sleep(900);
  writeFileSync(new URL(`${NAME}-aimed.png`, OUT), Buffer.from((await chrome.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  // A short burst, then let go of everything.
  await js('__pad.buttons[7] = 1');
  await sleep(500);
  await js('__pad.buttons[7] = 0; __pad.buttons[6] = 0');
  await sleep(600);
  console.log(NAME, 'after a burst', await mag());
  // Reload (Square), timing until the HUD shows a full magazine again.
  const full = Number(await js(`String(duty.game.player?.weapon?.ammo ?? '')`)) ;
  const t0 = Date.now();
  await js('__pad.buttons[2] = 1');
  await sleep(150);
  await js('__pad.buttons[2] = 0');
  const before = await mag();
  let refilled = null;
  while (Date.now() - t0 < 6000) {
    await sleep(50);
    const m = Number(await mag());
    if (m > Number(before)) {
      refilled = Date.now() - t0;
      break;
    }
  }
  console.log(NAME, 'reload put the magazine in after', refilled, 'ms; now', await mag(), full ? '' : '');
} finally {
  await chrome.close();
}
