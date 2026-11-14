// node course21.mjs <out dir>   The Practice Range's Course, run in the real page by an in-page runner that presses keys
// (W, Shift, Space, C) from where the player is each frame: screenshots of the clock ready on the pad, mid-run and at the
// result, and the clock's text through the run. W/H set the window; SLIDE=1 slide-jumps the gaps; RUNS=n runs it n times.
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'course21';
mkdirSync(OUT, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const W = Number(process.env.W ?? 1920), H = Number(process.env.H ?? 1080);
const URL_ = process.env.URL ?? 'http://localhost:5173/';
const RUNS = Number(process.env.RUNS ?? 2);
const chrome = await launchChrome();
const shot = async (name) => writeFileSync(`${OUT}/${name}-${W}.png`, Buffer.from((await chrome.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
const clockText = () => chrome.evaluate(`(() => { const c = document.querySelector('.ds-course'); return c && !c.hidden ? c.innerText.replace(/\\n/g, ' | ') : null; })()`);
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${URL_}?explore=range&nolock&at=8,1,0`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player?.alive', 120000))) throw new Error('page did not start');
  await sleep(2500);
  // The runner: keys from the player's position each frame. Gaps' near edges and the climbs' faces along x = 8, -Z.
  await chrome.evaluate(`(() => {
    const key = (type, code) => document.dispatchEvent(Object.assign(new Event(type), { code }));
    const held = new Set();
    const set = (code, on) => { if (on && !held.has(code)) { held.add(code); key('keydown', code); } if (!on && held.has(code)) { held.delete(code); key('keyup', code); } };
    const tap = (code) => { key('keydown', code); setTimeout(() => key('keyup', code), 40); };
    const edges = [-18, -30.9], faces = [-44.85, -46.35, -47.85, -53.85, -55.35];
    let lastJump = 0, shiftAt = 0;
    globalThis.__runner = { on: false, slide: ${process.env.SLIDE === '1'} };
    const frame = () => {
      requestAnimationFrame(frame);
      const r = globalThis.__runner, p = duty.game.player;
      if (!r.on || !p?.alive) { set('KeyW', false); set('KeyC', false); return; }
      set('KeyW', true);
      const now = performance.now();
      if (!shiftAt) { shiftAt = now; tap('ShiftLeft'); }
      const z = p.position[2], grounded = p.movement !== 'airborne' && p.movement !== 'mantle';
      const edge = edges.find((e) => z > e && z - e < 3);
      set('KeyC', !!(r.slide && edge !== undefined && grounded && z - edge < 1.6 && z - edge > 0.3));
      const jump = grounded && ((edge !== undefined && z - edge < 0.3) || faces.some((f) => z > f && z - f < 0.8));
      if (jump && now - lastJump > 150) { lastJump = now; set('KeyC', false); tap('Space'); }
    };
    requestAnimationFrame(frame);
  })()`);
  const log = [];
  // Onto the start pad, stand still: ready.
  await sleep(500);
  log.push({ t: 'ready', clock: await clockText(), pos: await chrome.evaluate('JSON.stringify(duty.game.player.position)') });
  await shot('ready');
  for (let run = 1; run <= RUNS; run++) {
    if (run > 1) {
      // Back to the pad: the dev teleport the page offers is a reload, so walk there by spawning: kill and respawn is slow; use ?at instead.
      await chrome.navigate(`${URL_}?explore=range&nolock&at=8,1,0`);
      if (!(await chrome.waitFor('globalThis.duty?.game?.player?.alive', 120000))) throw new Error('page did not restart');
      await sleep(2500);
      throw new Error('reload drops the runner: one run per page');
    }
    await chrome.evaluate('globalThis.__runner.on = true');
    const start = Date.now();
    let mid = false, result = null;
    while (Date.now() - start < 40000) {
      const c = await clockText();
      const p = JSON.parse(await chrome.evaluate('JSON.stringify({ pos: duty.game.player?.position, m: duty.game.player?.movement })'));
      log.push({ ms: Date.now() - start, clock: c, ...p });
      if (!mid && p.pos && p.pos[2] < -25) { mid = true; await shot(`running-${run}`); }
      if (c && c.toUpperCase().startsWith('COURSE ·') && !c.toUpperCase().includes('READY') && p.pos && p.pos[1] > 9) { result = c; await sleep(300); await shot(`result-${run}`); break; }
      await sleep(100);
    }
    await chrome.evaluate('globalThis.__runner.on = false');
    log.push({ run, result });
    await sleep(1000);
    log.push({ t: 'after', clock: await clockText(), best: await chrome.evaluate('JSON.parse(localStorage.getItem("duty-shooter.profile.v2") ?? "{}").courseBest ?? null') });
    break;
  }
  writeFileSync(`${OUT}/log-${W}.json`, JSON.stringify(log, null, 1));
  console.log(JSON.stringify({ result: log.filter((l) => l.run || l.t), errors: chrome.errors.slice(0, 8) }, null, 1));
} finally { await chrome.close(); }
