// Practice Range damage numbers aimed through each sight (review 2026-11-14g, defect 5: they stacked over the target).
//   node .scratch/next-level/dmgnum/look.mjs <out dir> [phone]
// For each sight: aim at the 25 m dummy, fire once (frame "-1"), then twice more fast (frame "-3"), and print where
// each live damage number stands and what it reads. "phone" runs at 844 x 390.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
const phone = process.argv[3] === 'phone';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const AIM_AT = (id) => `(() => {
  const g = duty.game, me = g?.player, t = g?.driver?.others(0).find((p) => p.id === ${JSON.stringify(id)});
  if (!me || !t) return null;
  const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
  const dx = t.position[0] - eye[0], dy = t.position[1] + t.eyeHeight * 0.78 - eye[1], dz = t.position[2] - eye[2];
  const look = g.input.angles;
  g.input.setAngles(Math.atan2(-dx, -dz) - (me.yaw - look.yaw), Math.atan2(dy, Math.hypot(dx, dz)) - (me.pitch - look.pitch));
  return Math.round(Math.hypot(dx, dz));
})()`;
const NUMS = `[...document.querySelectorAll('.ds-dmgnum')].map((d) => { const r = d.getBoundingClientRect(); return { text: d.innerText.replace(/\\n/g, ' / '), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })`;
const SIGHTS = [
  ['m4a1', null],
  ['m4a1', 'reflex'],
  ['m4a1', 'prism'],
  ['dmr', null],
  ['smg', null],
  ['sniper', null],
];

const chrome = await launchChrome();
const W = phone ? 844 : 1920;
const H = phone ? 390 : 1080;
const report = [];
try {
  if (phone) await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate('http://localhost:5173/?nolock&stats');
  if (!(await chrome.waitFor(`!!globalThis.duty?.game`, 90_000))) throw new Error('page did not start');
  await sleep(2000);
  const r = await chrome.send('Runtime.evaluate', {
    userGesture: true,
    returnByValue: true,
    expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.innerText.trim().toUpperCase().startsWith('PRACTICE RANGE')); if (!b) return false; b.click(); return true; })()`,
  });
  if (r.result?.result?.value !== true) throw new Error('no Practice Range button');
  if (!(await chrome.waitFor(`duty.game?.player?.alive === true`, 240_000, 500))) throw new Error('the range did not start');
  await sleep(3000);
  const mouse = (type, button = 'left') => chrome.send('Input.dispatchMouseEvent', { type, x: W / 2, y: H / 2, button, clickCount: 1 });
  const shot = async (file) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    if (s.result?.data) writeFileSync(`${out}/${file}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  for (const [gun, optic] of SIGHTS) {
    const name = `${gun}${optic ? `-${optic}` : ''}`;
    await chrome.evaluate(`duty.game.driver.setLoadout(${JSON.stringify({ primary: gun, secondary: 'pistol', grenade: 'frag', attachments: optic ? { primary: { optic } } : {} })})`);
    await sleep(3200);
    await chrome.evaluate(AIM_AT('dummy-25'));
    await mouse('mousePressed', 'right');
    await sleep(1500);
    const shots = gun === 'sniper' ? 1 : 3;
    for (let i = 0; i < shots; i++) {
      await chrome.evaluate(AIM_AT('dummy-25'));
      await sleep(60);
      await mouse('mousePressed');
      await sleep(gun === 'dmr' ? 140 : 90);
      await mouse('mouseReleased');
      await sleep(gun === 'dmr' ? 160 : 40);
      if (i === 0 || i === shots - 1) {
        await shot(`${name}-${i + 1}`);
        report.push({ name, shot: i + 1, nums: await chrome.evaluate(NUMS) });
      }
    }
    await mouse('mouseReleased', 'right');
    await sleep(1600);
  }
  console.log(JSON.stringify(report, null, 1));
  if (chrome.errors.length) console.log('errors', chrome.errors.slice(0, 3));
} finally {
  await chrome.close();
}
