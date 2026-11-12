// Ticket 35: shaders three builds during a real Bot Match, after the warm-up: each one is a hitch in play.
// Starts the match through the menu (as apps/range/scripts/bot-runs.mjs does), walks, strafes and fires for
// `seconds`, and lists every shader built once the match was playing, by object and pass, with when.
//   node .scratch/next-level/one-picture/match-builds.mjs [map] [mode] [seconds]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5191/';
const map = process.argv[2] ?? 'survival-town';
const mode = process.argv[3] ?? 'tdm';
const SECONDS = Number(process.argv[4] ?? 60);
const NAMES = { 'survival-town': 'Survival Town', switchyard: 'Switchyard', 'station-nine': 'Station Nine', tdm: 'Team deathmatch', ffa: 'Free-for-all', outposts: 'Outposts', charge: 'Charge', gungame: 'Gun game' };
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const HOOK = `(() => {
  const log = (globalThis.__builds = []);
  globalThis.__t0 = null;
  const name = (o) => { let x = o; const parts = []; for (let i = 0; i < 4 && x; i++, x = x.parent) if (x.name) parts.push(x.name); return parts.join('<') || o.type; };
  const tryHook = () => {
    const nodes = globalThis.duty?.renderer?._nodes;
    if (!nodes) return setTimeout(tryHook, 20);
    const real = nodes._createNodeBuilder;
    nodes._createNodeBuilder = function (ro, material) {
      const b = real.apply(this, arguments);
      const build = b.build;
      b.build = function () {
        const t = performance.now();
        const r = build.apply(this, arguments);
        if (globalThis.__t0 !== null) log.push({ at: ((t - globalThis.__t0) / 1000).toFixed(1), what: name(ro.object) + ' / ' + material.type + (ro.camera.isOrthographicCamera ? ' (ortho)' : ''), ms: performance.now() - t });
        return r;
      };
      return b;
    };
  };
  tryHook();
})()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: code.charCodeAt(3) });
  const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', clickCount: 1 });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1000);
  const picks = ['Bot Match', NAMES[map], NAMES[mode], ...(mode === 'ffa' || mode === 'gungame' ? [] : ['Mixed teams']), 'Start'];
  for (const p of picks) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  await chrome.evaluate('globalThis.__t0 = performance.now()');
  // Which grenades the match threw (a smoke or flash canister is a model of its own).
  await chrome.evaluate(`(() => { const ids = new Set(); const count = (globalThis.__thrown = {}); const d = duty.driver; const real = d.grenades.bind(d); d.grenades = () => { const list = real(); for (const g of list) if (!ids.has(g.id)) { ids.add(g.id); count[g.kind] = (count[g.kind] ?? 0) + 1; } return list; }; })()`);
  await key('keyDown', 'KeyW');
  for (let t = 0; t < SECONDS; t += 5) {
    const side = t % 10 === 0 ? 'KeyA' : 'KeyD';
    await key('keyDown', side);
    await mouse('mousePressed');
    await sleep(1200);
    await mouse('mouseReleased');
    await key('keyUp', side);
    await sleep(3800);
  }
  const builds = await chrome.evaluate('__builds');
  // The soldiers' bodies on show: how many, and how many different shader keys their materials make.
  const keys = await chrome.evaluate(`new Promise((done) => {
    const r = duty.renderer;
    const real = r._renderObjectDirect;
    const bodies = new Set();
    r._renderObjectDirect = function (object) { if (object.isSkinnedMesh) bodies.add(object); return real.apply(this, arguments); };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      r._renderObjectDirect = real;
      const list = [...bodies];
      done({ bodies: list.length, materials: new Set(list.map((b) => b.material)).size, keys: new Set(list.map((b) => b.material.customProgramCacheKey())).size, sample: list.slice(0, 2).map((b) => b.material.customProgramCacheKey().slice(0, 300)) });
    }));
  })`);
  console.log(JSON.stringify(keys));
  console.log('thrown', JSON.stringify(await chrome.evaluate('__thrown')));
  const kills = await chrome.evaluate('duty.driver.scores.reduce((n, s) => n + s.kills, 0)');
  console.log(`${map} ${mode}: ${builds.length} builds in ${SECONDS} s of play, ${builds.reduce((a, b) => a + b.ms, 0).toFixed(0)} ms; kills ${kills}; errors ${JSON.stringify(chrome.errors.slice(0, 3))}`);
  for (const b of builds) console.log(`  ${b.at}s  ${b.ms.toFixed(1)} ms  ${b.what}`);
} finally {
  await chrome.close();
}
