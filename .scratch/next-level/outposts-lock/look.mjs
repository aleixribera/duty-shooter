// Does a Survival Town Outposts Bot Match lock out with the review's scripted player in it? Plays N seconds with
// `steer` (as reviews/capture.mjs drives it) and logs the team scores and zone owners every 10 s, with a frame
// every 60 s. node .scratch/next-level/outposts-lock/look.mjs <out dir> [map] [mode] [seconds]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';
const { loadNav, steer } = await import(process.env.STEER_FROM ?? '../../../apps/range/scripts/trailer/shots.mjs');

const [out, map = 'Survival Town', mode = 'Outposts', secs = '240'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
const js = (e) => chrome.evaluate(e);
const key = (type, code, k = code.startsWith('Key') ? code.slice(3).toLowerCase() : code, vk = code.startsWith('Key') ? code.charCodeAt(3) : ({ Space: 32, ShiftLeft: 16 }[code] ?? 0)) => chrome.send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk });
const mouse = (type, button = 'left') => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button, clickCount: 1 });
const click = async (text) => (await chrome.send('Runtime.evaluate', { userGesture: true, returnByValue: true, expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()` })).result?.result?.value === true;
const shot = async (file) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  if (s.result?.data) writeFileSync(`${out}/${file}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const AHEAD = `(() => { const me = duty.game.player; if (!me || !me.alive) return null; const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]]; const f = C.fwd(me.yaw); return Math.round(C.ray(eye, [eye[0] + f[0] * 4, eye[1], eye[2] + f[2] * 4]) * 400) / 100; })()`;
const ME = `(() => { const d = duty.driver, s = d?.scores?.find((x) => x.id === d.selfId); return { kills: s?.kills ?? 0, deaths: s?.deaths ?? 0, phase: d?.match?.phase ?? null }; })()`;
const STATE = `(() => { const m = duty.driver?.match; const me = duty.game.player; return { phase: m?.phase ?? null, myTeam: me?.team ?? null, scores: (m?.teamScores ?? []).map((t) => t.team + ':' + t.score).join(' '), zones: m?.objective?.kind === 'outposts' ? m.objective.zones.map((z) => z.id + z.owner).join(' ') : '' }; })()`;
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate('http://localhost:5173/?nolock&stats');
  if (!(await chrome.waitFor(`!!globalThis.duty?.game`, 90_000))) throw new Error('page did not start');
  await sleep(2000);
  for (const p of ['Bot Match', map, mode]) {
    if (!(await click(p))) throw new Error(`no "${p}"`);
    await sleep(300);
  }
  await click('Mixed teams');
  await sleep(300);
  if (!(await click('Start'))) throw new Error('no Start');
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('no match');
  await js(CAMERA_LIB);
  await loadNav({ js }, map);
  const STEER = steer({ range: 40 });
  const held = { walk: false, ads: false, pressed: false, n: 0 };
  const start = Date.now();
  const log = [];
  let nextLog = 0, nextShot = 60;
  while (Date.now() - start < Number(secs) * 1000) {
    const want = await js(STEER);
    if (want) {
      if (want.walk !== held.walk) await key(want.walk ? 'keyDown' : 'keyUp', 'KeyW');
      if (want.sprint && !held.sprint) (await key('keyDown', 'ShiftLeft', 'Shift'), await key('keyUp', 'ShiftLeft', 'Shift'));
      if (want.ads !== held.ads) await mouse(want.ads ? 'mousePressed' : 'mouseReleased', 'right');
      if (want.reload) (await key('keyDown', 'KeyR'), await key('keyUp', 'KeyR'));
      if (want.jump) (await key('keyDown', 'Space', ' '), await key('keyUp', 'Space', ' '));
      const press = want.fire && (want.dist < 12 || held.n++ % 6 < 4);
      if (!want.fire) held.n = 0;
      if (press !== held.pressed) await mouse(press ? 'mousePressed' : 'mouseReleased', 'left');
      Object.assign(held, want, { pressed: press });
    }
    const t = (Date.now() - start) / 1000;
    if (t >= nextLog) {
      const s = await js(STATE);
      log.push({ t: Math.round(t), ...s });
      console.log(JSON.stringify(log.at(-1)));
      nextLog += 10;
      if (s.phase !== 'playing') break;
    }
    if (t >= nextShot) (await shot(`play-${Math.round(t)}s`), (nextShot += 60));
    await sleep(40);
  }
  const me = await js(ME);
  writeFileSync(`${out}/result.json`, JSON.stringify({ map, mode, kills: me.kills, deaths: me.deaths, log, errors: chrome.errors.slice(0, 3) }, null, 1));
} finally {
  await chrome.close();
}
