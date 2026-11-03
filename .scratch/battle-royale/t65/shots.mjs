// Ticket 65: screenshots of tracers and sniper smoke in the real game (dev server, headless, muted).
// The page's frame loop is held on the frame a tracer is in flight, so the shot shows it.
//   remote-test --local "node .scratch/battle-royale/t65/shots.mjs"
// SCENE=own|bots|royale, MAP=zero-island|switchyard|survival-town, BASE=http://localhost:5191/, QUERY=webgl
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5191/';
const SCENE = process.env.SCENE ?? 'own';
const MAP = process.env.MAP ?? 'zero-island';
const Q = process.env.QUERY ? `&${process.env.QUERY}` : '';
const out = '.scratch/battle-royale/shots/t65';
mkdirSync(out, { recursive: true });
const say = (t) => console.log(`${new Date().toISOString().slice(11, 19)} ${t}`);
const HOLD = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const queue = [];
  globalThis.__hold = false;
  globalThis.__want = null;
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (globalThis.__hold) { queue.push(cb); return; }
    cb(t);
    try { if (globalThis.__want && globalThis.__want()) { globalThis.__want = null; globalThis.__hold = true; } } catch {}
  });
  globalThis.__release = () => { globalThis.__hold = false; for (const c of queue.splice(0)) raf(c); };
  addEventListener('error', (e) => (globalThis.__errors ??= []).push(String(e.message)));
})();`;
const chrome = await launchChrome();
let failed = false;
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HOLD });
  const ev = async (js) => JSON.parse((await chrome.evaluate(`JSON.stringify((() => { ${js} })())`)) ?? 'null');
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    say(`shot ${name}`);
  };
  const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', clickCount: 1 });
  const face = (yaw, pitch) => chrome.evaluate(`duty.game.input.setAngles(${yaw}, ${pitch}), 1`);
  /** Holds the frame loop as soon as `test` (page JS, an expression) holds, waits up to `ms`; true if it held. */
  const holdWhen = async (test, ms = 4000) => {
    await chrome.evaluate(`globalThis.__want = () => (${test}), 1`);
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await chrome.evaluate('globalThis.__hold')) return true;
      await sleep(5);
    }
    await chrome.evaluate('globalThis.__want = null, 1');
    return false;
  };
  const release = () => chrome.evaluate('__release(), 1');
  const ready = (id) => chrome.waitFor(`duty.game.player?.weapon.id === '${id}' && duty.game.player.weapon.canFire`, 8000, 50);
  const tracers = () => ev('return duty.game.tracers');

  if (SCENE === 'own') {
    await chrome.navigate(`${BASE}?explore=${MAP}&nolock${Q}`);
    if (!(await chrome.waitFor('!!globalThis.duty?.game?.player?.alive', 240000, 500))) throw new Error('no player');
    await sleep(4000);
    await chrome.evaluate(`document.querySelector('canvas')?.click()`);
    const yaw = Number(process.env.YAW ?? 0.6);
    const pitch = Number(process.env.PITCH ?? -0.02);
    await face(yaw, pitch);
    await sleep(800);
    // Automatic fire: several tracers in the air at once.
    for (let k = 0; k < 3; k++) {
      await ready('m4a1');
      await mouse('mousePressed');
      const held = await holdWhen(`duty.game.tracers.flying >= ${k + 2}`);
      if (held) await shot(`${MAP}-own-auto-${k}`);
      await release();
      await mouse('mouseReleased');
      say(`auto ${k}: ${held} ${JSON.stringify(await tracers())}`);
      await sleep(900);
    }
    // The sniper: the round in flight with its trail, then the trail lingering and drifting, seen from beside it.
    await chrome.evaluate(`duty.driver.setLoadout({ primary: 'sniper', secondary: 'pistol', grenade: 'frag' }), 1`);
    await sleep(2500);
    const sy = yaw + Number(process.env.SNIPER_TURN ?? 0.25);
    const sp = Number(process.env.SNIPER_PITCH ?? -0.025);
    await face(sy, sp);
    await sleep(800);
    say(`sniper ready: ${await ready('sniper')}`);
    await mouse('mousePressed');
    const held = await holdWhen('duty.game.tracers.smoke > 1');
    await mouse('mouseReleased');
    if (held) await shot(`${MAP}-sniper-flight`);
    // A camera standing beside the line, a little behind and to the right, looking along it.
    await chrome.evaluate(`(() => {
      const me = duty.game.player; const e = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
      const f = [-Math.sin(${sy}) * Math.cos(${sp}), Math.sin(${sp}), -Math.cos(${sy}) * Math.cos(${sp})];
      const r = [Math.cos(${sy}), 0, -Math.sin(${sy})];
      const mid = [e[0] + f[0] * 22, e[1] + f[1] * 22, e[2] + f[2] * 22];
      const c = [e[0] + r[0] * 7 - f[0] * 7, e[1] + 3.2, e[2] + r[2] * 7 - f[2] * 7];
      const dx = mid[0] - c[0], dy = mid[1] - c[1], dz = mid[2] - c[2];
      duty.game.overview = { position: c, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
      duty.game.overviewOnly = true;
      return 1;
    })()`);
    await release();
    say(`sniper: ${held} ${JSON.stringify(await tracers())}`);
    await sleep(250);
    await shot(`${MAP}-sniper-smoke-side-0.3s`);
    await sleep(400);
    await shot(`${MAP}-sniper-smoke-side-0.7s`);
    await sleep(400);
    await shot(`${MAP}-sniper-smoke-side-1.1s`);
    say(`after: ${JSON.stringify(await tracers())}`);
    await chrome.evaluate('duty.game.overviewOnly = false, 1');
  } else if (SCENE === 'bots') {
    const NAMES = { 'survival-town': 'Survival Town', switchyard: 'Switchyard', crash: 'Crash' };
    await chrome.navigate(`${BASE}?nolock${Q}`);
    if (!(await chrome.waitFor('globalThis.duty?.game', 120000))) throw new Error('page did not start');
    await sleep(1000);
    const click = (text) => ev(`const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true;`);
    for (let i = 0; !(await click('Bot Match')); i++) {
      if (i > 300) throw new Error('no Bot Match button');
      await sleep(200);
    }
    await sleep(400);
    for (const p of [NAMES[MAP], 'Free-for-all', 'Start']) {
      if (!(await click(p))) throw new Error(`no "${p}" button`);
      await sleep(300);
    }
    if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180000))) throw new Error('match did not start');
    await sleep(Number(process.env.SETTLE ?? 5) * 1000);
    let n = 0;
    const started = Date.now();
    // Whoever last hit you is faced (a little to the side): when they fire again, the frame is held
    // as their round arrives, the last metres of its flight sweeping past the camera.
    while (Date.now() - started < Number(process.env.PLAY ?? 150) * 1000 && n < 10) {
      const dist = await chrome.evaluate(`(() => {
        const me = duty.game.player; if (!me?.alive) { globalThis.__target = null; globalThis.__hp = 100; return 0; }
        const others = duty.driver.others(1).filter((p) => p.alive);
        if ((globalThis.__hp ?? 100) > me.health) {
          let best = null, bd = Infinity;
          for (const p of others) { const d = Math.hypot(p.position[0] - me.position[0], p.position[2] - me.position[2]); if (d < bd) { bd = d; best = p; } }
          globalThis.__target = best?.id ?? null;
        }
        globalThis.__hp = me.health;
        const t = others.find((p) => p.id === globalThis.__target);
        if (!t) return 0;
        const dx = t.position[0] - me.position[0], dz = t.position[2] - me.position[2], dy = t.position[1] + t.eyeHeight - me.position[1] - me.eyeHeight;
        duty.game.input.setAngles(Math.atan2(-dx, -dz) - 0.12, Math.atan2(dy, Math.hypot(dx, dz)) - 0.04);
        return Math.hypot(dx, dz);
      })()`);
      if (!dist) {
        await sleep(100);
        continue;
      }
      const f0 = await ev('return duty.game.tracers.fired');
      const lag = ((dist * Number(process.env.LAG ?? 0.8)) / 628) * 1000;
      const held = await holdWhen(`(globalThis.__t0 ??= duty.game.tracers.fired > ${f0} ? performance.now() : undefined) !== undefined && performance.now() > globalThis.__t0 + ${lag} && duty.game.tracers.flying > 0`, 1500);
      await chrome.evaluate('globalThis.__t0 = undefined, 1');
      if (!held) continue;
      const t = await tracers();
      await shot(`${MAP}-incoming-${n++}`);
      await release();
      say(`held at ${dist.toFixed(1)} m: ${JSON.stringify(t)} hp ${await ev('return duty.game.player?.health ?? null')}`);
      await sleep(200);
    }
  }
  const errs = await ev('return globalThis.__errors ?? []');
  say(`errors: ${JSON.stringify(errs)} console: ${JSON.stringify(chrome.errors.slice(0, 5))}`);
} catch (e) {
  failed = true;
  console.error(e);
  try {
    writeFileSync(`${out}/${SCENE}-${MAP}-fail.jpg`, Buffer.from((await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 })).result.data, 'base64'));
  } catch {}
} finally {
  await chrome.close().catch(() => {});
  process.exit(failed ? 1 : 0);
}
