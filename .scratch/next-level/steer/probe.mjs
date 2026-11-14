// How often the review's scripted player stands with a wall in its face: a Bot Match played by the capture's
// player (`steer`, as reviews/capture.mjs drives it) for N seconds, measuring each step the distance to the first
// collider straight ahead at eye height, and a frame whenever it has been within 1 m for a second.
// node .scratch/next-level/steer/probe.mjs <out dir> <map: Survival Town|Switchyard|Station Nine> <mode> [seconds]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';
const { loadNav, steer } = await import(process.env.STEER_FROM ?? '../../../apps/range/scripts/trailer/shots.mjs');

const [out, map = 'Survival Town', mode = 'Outposts', secs = '60'] = process.argv.slice(2);
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
  let steps = 0, alive = 0, near = 0, nearFight = 0, run = 0, worstRun = 0, shots = 0, last = Date.now();
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
    const d = await js(AHEAD);
    const now = Date.now(), dt = (now - last) / 1000;
    last = now;
    steps++;
    if (d !== null) {
      alive += dt;
      if (d < 1) {
        near += dt;
        if (want?.ads) nearFight += dt;
        run += dt;
        worstRun = Math.max(worstRun, run);
        if (run >= 0.5 && run - dt < 0.5 && shots < 8) (await shot(`wall-${++shots}-${Math.round((now - start) / 1000)}s`), console.log(shots, JSON.stringify({ want, d, st: await js(`(() => { const me = duty.game.player, s = __steer, m = duty.driver.others(0).filter((p) => p.kind === 'player' && p.alive && p.team === me.team).map((p) => Math.round(C.flat(p.position, me.position) * 10) / 10).sort((a, b) => a - b); return { p: me.position.map((v) => Math.round(v * 10) / 10), yaw: Math.round(me.yaw * 100) / 100, dbg: s.dbg, dbgAge: s.dbg ? Math.round(performance.now() - s.dbg.t) : null, mates: m, phase: duty.driver.match.phase }; })()`) })));
      } else run = 0;
    }
    if ((await js(ME)).phase !== 'playing') break;
    await sleep(40);
  }
  const me = await js(ME);
  const r = { map, mode, seconds: Math.round((Date.now() - start) / 1000), steps, aliveS: Math.round(alive), wallWithin1mS: Math.round(near * 10) / 10, share: Math.round((near / Math.max(1, alive)) * 1000) / 10, worstRunS: Math.round(worstRun * 10) / 10, nearInFightS: Math.round(nearFight * 10) / 10, kills: me.kills, deaths: me.deaths, errors: chrome.errors.slice(0, 3) };
  writeFileSync(`${out}/result.json`, JSON.stringify(r, null, 1));
  console.log(JSON.stringify(r));
} finally {
  await chrome.close();
}
