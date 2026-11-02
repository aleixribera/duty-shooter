// Ticket 53: does the sunlight jitter near the Ring, and what makes it? A real Battle Royale
// (real server, headless muted Chrome); Ada is put inside, near and outside the wall, facing
// toward and away from the sun, standing still. Each spot is filmed as a run of frames four
// ways: as played, sun shafts off, Ring dimmed to nothing, both. How much each pixel flickers
// from frame to frame says which one makes the jitter.
//   Needs t52's serve bundle and temporary hooks, removed before the commit:
//   game.ts, after the pipeline is made:  (globalThis as any).__t53 = { ring: this.#ringWall, pipe: this.#pipeline, world: options.world, lighting: currentLighting };
//     and the wall made with `(globalThis as any).__t53nosky ? null : cloudySky` (NOSKY, COST)
//   pipeline.ts render(): `if ((globalThis as any).__t53noShafts) this.#sunAhead.value = 0;`, and an output switch on a
//     uniform `__t53dbg` (0 frame, 1 sun shafts alone, 2 bloom alone)
//   ring-wall.ts update(): `if (ring && __t53hold) ring = __t53hold;` and the clock held at 100 under `__t53freeze`
//   Modes: WAYS, SPOTS, FRAMES, TURN=deg/s, CAST=s (canvas video), COST=1 (ms a frame).
//   remote-test --local "node .scratch/battle-royale/t53/play.mjs"       (TAG=after for the second run)
import { spawn, execSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const TAG = process.env.TAG ?? 'before';
const FRAMES = Number(process.env.FRAMES ?? 24);
const ONLY = process.env.SPOTS?.split(',');
const PORT = 3353;
const VITE = 5353;
const out = `.scratch/battle-royale/shots/bugs/sun/${TAG}`;
mkdirSync(out, { recursive: true });
const children = [];
const start = (cmd, args, env, cwd) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'ignore', 'inherit'], shell: cmd === 'npx' });
  children.push(c);
  return c;
};
start(process.execPath, ['.scratch/battle-royale/t52/dist/serve.js'], { MODE: 'battle-royale', MATE_A: 'Bea', MATE_B: 'Cole', SQUADS: '1', TIME_LIMIT: '900', PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist` });
start('npx', ['vite', '--port', String(VITE), '--strictPort'], { DUTY_SERVER: `http://127.0.0.1:${PORT}` }, 'apps/range');
const ctl = (path) => fetch(`http://127.0.0.1:${PORT + 1}${path}`).then((r) => r.json());
const until = async (name, test, ms = 30000, every = 200) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await test().catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out: ${name}`);
    await sleep(every);
  }
};
const say = (t) => console.log(`${new Date().toISOString().slice(11, 19)} ${t}`);
const W = 960;
const H = 540;
/** Grey bytes of a PNG, through ffmpeg. */
const grey = (file) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 });
let chrome;
const rows = [];
try {
  await until('server', () => ctl('/list'), 90000, 500);
  await until('vite', () => fetch(`http://localhost:${VITE}/`).then((r) => r.ok), 60000, 500);
  chrome = await launchChrome();
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  if (process.env.NOSKY) await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.__t53nosky = true' });
  await chrome.navigate(`http://localhost:${VITE}/?online&nolock`);
  await sleep(2000);
  await chrome.evaluate(`globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().toLowerCase().startsWith(text.toLowerCase()))`);
  await chrome.waitFor(`!!globalThis.__find?.('Play Online')`, 60000, 100);
  await chrome.evaluate(`document.querySelector('.ds-menu input').value = 'Ada'; __find('Play Online').click()`);
  await chrome.waitFor(`!!__find('Join') || !!__find('Start')`, 60000, 100);
  await chrome.evaluate(`if (__find('Join')) { const i = document.querySelector('.ds-field input'); i.value = 'Ada'; __find('Join').click(); }`);
  await chrome.waitFor(`!!__find('Start')`, 180000, 200);
  await until('in the match', async () => {
    if ((await ctl('/list')).phase === 'playing') return true;
    await chrome.evaluate(`__find('Start match')?.click(), 1`);
    return null;
  }, 180000, 1500);
  const me = await until('alive', async () => JSON.parse(await chrome.evaluate(`JSON.stringify((() => { const p = duty.game?.player; return p?.alive ? { id: p.id } : null; })())`)), 60000);
  await ctl(`/guard?id=${me.id}`);
  await sleep(4000);
  // The Ring now, and the sun.
  const env = JSON.parse(await chrome.evaluate(`JSON.stringify((() => { const s = duty.driver.match.objective; const d = __t53.lighting().sunDirection; return { circle: s.circle, next: s.next, shrinkAt: s.shrinkAt, now: duty.driver.serverTime, sun: d }; })())`));
  say(`ring ${JSON.stringify(env.circle)} shrinks at ${env.shrinkAt} (now ${env.now.toFixed(1)}); sun ${env.sun.map((v) => v.toFixed(2))}`);
  const { x: cx, z: cz, radius: r } = env.circle;
  // The wall held where it stands now, so a closing Ring doesn't move it under the camera.
  await chrome.evaluate(`__t53hold = ${JSON.stringify(env.circle)}, 1`);
  const [sx, sy, sz] = env.sun;
  const sh = Math.hypot(sx, sz);
  const ux = sx / sh;
  const uz = sz / sh;
  // Facing: forward is (-sin yaw, -cos yaw).
  const sunYaw = Math.atan2(-ux, -uz);
  const sunPitch = Math.asin(sy / Math.hypot(sx, sy, sz));
  say(`sun elevation ${((sunPitch * 180) / Math.PI).toFixed(1)} deg`);
  const toSun = Math.min(0.5, sunPitch * 0.6);
  let spots = [
    // Inside the Ring, its wall between you and the sun: looking toward the sun through it.
    { name: 'inside-30-to-sun', d: -30, yaw: sunYaw, pitch: toSun },
    { name: 'inside-8-to-sun', d: -8, yaw: sunYaw, pitch: toSun },
    { name: 'inside-30-away', d: -30, yaw: sunYaw + Math.PI, pitch: 0.05 },
    { name: 'outside-15-to-sun', d: 15, yaw: sunYaw, pitch: toSun },
    // Outside, facing the wall with the sun behind you.
    { name: 'outside-15-to-wall', d: 15, yaw: sunYaw + Math.PI, pitch: 0.05 },
    // Far inside, the wall far off toward the sun.
    { name: 'inside-150-to-sun', d: -150, yaw: sunYaw, pitch: toSun },
  ];
  if (ONLY) spots = spots.filter((s) => ONLY.includes(s.name));
  let ways = [
    { name: 'played', js: `__t53noShafts = false; __t53.ring.strength = 1; __t53.pipe.bloomBoost = 0` },
    { name: 'no-bloom', js: `__t53noShafts = false; __t53.ring.strength = 1; __t53.pipe.bloomBoost = -0.1` },
    { name: 'no-shafts', js: `__t53noShafts = true; __t53.ring.strength = 1` },
    { name: 'frozen', js: `__t53freeze = true; __t53noShafts = false; __t53.ring.strength = 1` },
    { name: 'beams', js: `__t53dbg.value = 1; __t53.ring.strength = 1` },
    { name: 'beams-no-ring', js: `__t53dbg.value = 1; __t53.ring.strength = 0` },
    { name: 'bloom', js: `__t53dbg.value = 2; __t53.ring.strength = 1` },
    { name: 'bloom-no-ring', js: `__t53dbg.value = 2; __t53.ring.strength = 0` },
    { name: 'no-ring', js: `__t53noShafts = false; __t53.ring.strength = 0` },
    { name: 'neither', js: `__t53noShafts = true; __t53.ring.strength = 0` },
  ];
  if (process.env.WAYS) ways = ways.filter((w) => process.env.WAYS.split(',').includes(w.name));
  for (const w of ways) { if (w.name !== 'no-bloom') w.js += '; __t53.pipe.bloomBoost = 0'; if (w.name !== 'frozen') w.js += '; __t53freeze = false'; if (!w.name.startsWith('b')) w.js += '; __t53dbg.value = 0'; }
  for (const s of spots) {
    const x = cx + ux * (r + s.d);
    const z = cz + uz * (r + s.d);
    const y = Number(await chrome.evaluate(`(() => { const t = __t53.world.terrain; return Math.max(t.heightAt(${x}, ${z}), t.waterAbove(${x}, 0, ${z})); })()`));
    await ctl(`/place?id=${me.id}&x=${x}&y=${y + 0.3}&z=${z}`);
    await sleep(1500);
    await chrome.evaluate(`duty.game.input.setAngles(${s.yaw}, ${s.pitch}), 1`);
    // TURN=deg/s sweeps the view across the sun and back, as a person looking round would.
    const turn = Number(process.env.TURN ?? 0);
    if (turn) await chrome.evaluate(`(() => { cancelAnimationFrame(globalThis.__t53spin); const y0 = ${s.yaw}, p = ${s.pitch}, t0 = performance.now(); const go = () => { const t = (performance.now() - t0) / 1000; duty.game.input.setAngles(y0 + Math.sin(t * ${turn / 20}) * 20 * Math.PI / 180, p); globalThis.__t53spin = requestAnimationFrame(go); }; go(); return 1; })()`);
    await sleep(800);
    for (const way of ways) {
      await chrome.evaluate(`${way.js}, 1`);
      await sleep(700);
      const dir = `${out}/${s.name}/${way.name}`;
      mkdirSync(dir, { recursive: true });
      if (process.env.COST) {
        // What a frame costs here: vsync is off, so frames come as fast as the GPU draws them.
        const ms = await chrome.evaluate(`new Promise((done) => { let n = 0; const t0 = performance.now(); const tick = () => { if (++n < 400) requestAnimationFrame(tick); else done((performance.now() - t0) / n); }; requestAnimationFrame(tick); })`);
        say(`cost ${s.name} ${way.name}: ${ms.toFixed(2)} ms a frame`);
        continue;
      }
      if (process.env.CAST) {
        // A real-rate recording of the canvas (CAST seconds), every frame as drawn.
        const b64 = await chrome.evaluate(`new Promise((done) => { const c = document.querySelector('canvas'); const rec = new MediaRecorder(c.captureStream(60), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 40e6 }); const parts = []; rec.ondataavailable = (e) => parts.push(e.data); rec.onstop = async () => { const buf = await new Blob(parts).arrayBuffer(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768)); done(btoa(s)); }; rec.start(); setTimeout(() => rec.stop(), ${Number(process.env.CAST) * 1000}); })`);
        writeFileSync(`${out}/${s.name}-${way.name}.webm`, Buffer.from(b64, 'base64'));
        say(`recorded ${s.name} ${way.name}`);
        continue;
      }
      const frames = [];
      for (let i = 0; i < FRAMES; i++) {
        const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
        const file = `${dir}/${String(i).padStart(2, '0')}.png`;
        writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
        frames.push(file);
      }
      // Flicker: per pixel, the mean step from one frame to the next; over the frame, its mean and the share above 6 levels.
      const g = frames.map(grey);
      const n = g[0].length;
      const step = new Float32Array(n);
      for (let k = 1; k < g.length; k++) for (let i = 0; i < n; i++) step[i] += Math.abs(g[k][i] - g[k - 1][i]) / (g.length - 1);
      let sum = 0;
      let loud = 0;
      // Only the top 80 % of the screen: the HUD's bars and the weapon at the bottom are not the sun.
      const top = Math.floor(H * 0.8) * W;
      const map = Buffer.alloc(n);
      for (let i = 0; i < n; i++) {
        map[i] = Math.min(255, step[i] * 12);
        if (i >= top) continue;
        sum += step[i];
        if (step[i] > 6) loud++;
      }
      writeFileSync(`${dir}/flicker.gray`, map);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${W}x${H}`, '-i', `${dir}/flicker.gray`, `${out}/${s.name}-${way.name}-flicker.png`]);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', frames[0], `${out}/${s.name}-${way.name}.jpg`]);
      const row = { spot: s.name, way: way.name, mean: +(sum / top).toFixed(3), loud: +((100 * loud) / top).toFixed(2) };
      rows.push(row);
      say(JSON.stringify(row));
    }
  }
  await chrome.evaluate(`__t53noShafts = false; __t53.ring.strength = 1, 1`);
  writeFileSync(`${out}/flicker.json`, JSON.stringify(rows, null, 1));
  console.log('\nspot                     played  no-shafts    no-ring    neither   (mean step per pixel / % of pixels over 6)');
  for (const s of process.env.CAST ? [] : spots) {
    const cell = (w) => rows.find((r) => r.spot === s.name && r.way === w);
    console.log(s.name.padEnd(20), ...ways.map((w) => `${w.name} ${cell(w.name).mean.toFixed(2)}/${cell(w.name).loud.toFixed(1)}%`.padStart(22)));
  }
  if (chrome.errors.length) say(`console errors:\n${chrome.errors.slice(0, 8).join('\n')}`);
} catch (error) {
  say(`FAILED: ${error.message}`);
  if (chrome) await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }).then((s) => writeFileSync(`${out}/failed.jpg`, Buffer.from(s.result.data, 'base64'))).catch(() => {});
  process.exitCode = 1;
} finally {
  await chrome?.close().catch(() => {});
  for (const c of children) c.kill('SIGTERM');
  for (const line of execSync('netstat -ano').toString().split('\n')) {
    if ((line.includes(`:${VITE}`) || line.includes(`:${PORT}`)) && line.includes('LISTENING')) {
      try {
        execSync(`taskkill /F /T /PID ${line.trim().split(/\s+/).at(-1)}`, { stdio: 'ignore' });
      } catch {}
    }
  }
  process.exit();
}
