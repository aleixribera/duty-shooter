// Ticket 52 in real matches, real server and browser, headless and muted.
// Trios Battle Royale on Zero Island: Ada (this browser) with Bea and Cole, two people on
// scripted sockets, and bots elsewhere. Tags near, far, behind a wall, off screen and behind,
// Downed far and in reach, at 1920x1080 and 390x844. Then Team Deathmatch with bot teammates.
//   npx vite build -c .scratch/battle-royale/t52/vite.harness.ts
//   remote-test --local "node .scratch/battle-royale/t52/play.mjs"         (MODE=tdm for the second)
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const MODE = process.env.MODE ?? 'battle-royale';
const PORT = 3352;
const VITE = 5352;
const out = '.scratch/battle-royale/shots/bugs/allies';
mkdirSync(out, { recursive: true });
const children = [];
const start = (cmd, args, env, cwd) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'ignore', 'inherit'], shell: cmd === 'npx' });
  children.push(c);
  return c;
};
const serverEnv = { MODE, MATE_A: 'Bea', MATE_B: 'Cole', PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist`, ...(MODE === 'battle-royale' ? { SQUADS: '3', TIME_LIMIT: '500' } : {}) };
start(process.execPath, ['.scratch/battle-royale/t52/dist/serve.js'], serverEnv);
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
let chrome;
const seen = {};
try {
  await until('server', () => ctl('/list'), 90000, 500);
  await until('vite', () => fetch(`http://localhost:${VITE}/`).then((r) => r.ok), 60000, 500);
  chrome = await launchChrome();
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${MODE}-${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const tags = async () => JSON.parse(await chrome.evaluate(`JSON.stringify([...document.querySelectorAll('.ds-ally')].map((e) => ({ cls: e.className.replace('ds-ally', '').trim(), text: e.innerText.replace(/\\n/g, ' / '), at: e.style.transform.match(/-?[\\d.]+px/g)?.join(' ') })))`));
  const local = async () => JSON.parse(await chrome.evaluate(`JSON.stringify((() => { const p = duty.game.player; return p ? { id: p.id, alive: p.alive, team: p.team, position: p.position, eye: p.eyeHeight } : null; })())`));
  const face = (yaw, pitch = -0.05) => chrome.evaluate(`duty.game.input.setAngles(${yaw}, ${pitch}), 1`);
  const phone = async (on) => {
    if (on) await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    else await chrome.send('Emulation.clearDeviceMetricsOverride');
    await sleep(700);
  };

  await chrome.navigate(`http://localhost:${VITE}/?online&nolock`);
  await sleep(2000);
  await chrome.evaluate(`globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().toLowerCase().startsWith(text.toLowerCase()))`);
  await chrome.waitFor(`!!globalThis.__find?.('Play Online')`, 60000, 100);
  await chrome.evaluate(`document.querySelector('.ds-menu input').value = 'Ada'; __find('Play Online').click()`);
  await chrome.waitFor(`!!__find('Join') || !!__find('Start')`, 60000, 100);
  await chrome.evaluate(`if (__find('Join')) { const i = document.querySelector('.ds-field input'); i.value = 'Ada'; __find('Join').click(); }`);
  // A team match already under way takes Ada straight in; a Battle Royale waits in its lobby.
  if (!(await chrome.waitFor(`!!__find('Start') || !!duty.game?.player`, 180000, 200))) throw new Error('no lobby');
  await until('scripted seats', async () => (await ctl('/list')).enemy, 20000);
  if (MODE === 'battle-royale') {
    // Into Bea and Cole's Squad: two people on their own sockets.
    await until('in the Squad of Bea and Cole', async () => {
      if (await chrome.evaluate(`!!document.querySelector('[data-act="squad"][data-key="new-squad"]')`)) return true;
      await chrome.evaluate(`document.querySelector('[data-act="squad"][data-key^="squad-"]')?.click(), 1`);
      return false;
    }, 20000, 500);
    await sleep(1500);
    await shot('lobby-joined');
  }
  await until('in the match', async () => {
    if ((await ctl('/list')).phase === 'playing') return await local();
    await chrome.evaluate(`__find('Start match')?.click(), 1`);
    return null;
  }, 180000, 1500);
  await until('alive', async () => (await local())?.alive, 30000);
  await sleep(MODE === 'battle-royale' ? 6000 : 3000);
  const me = await local();
  const list = await ctl('/list');
  const mates = list.players.filter((p) => p.team === me.team && p.id !== me.id);
  say(`${MODE}: Ada ${me.id} team ${me.team}; mates ${mates.map((p) => `${p.name}${p.bot ? ' (bot)' : ''}`).join(', ')}`);
  say(`people: ${JSON.stringify(list.players.filter((p) => !p.bot).map((p) => [p.id, p.name, p.team]))}`);
  seen.mates = mates.map((p) => `${p.name}${p.bot ? ' (bot)' : ''}`);
  await sleep(500);
  seen.start = await tags();
  say(`tags at the start: ${JSON.stringify(seen.start)}`);
  await shot('0-start');

  // Freeze the mates where they are put: a person's scripted seat stands still; a bot is guarded from dying.
  const here = me.position;
  const people = mates.filter((p) => !p.bot);
  const a = people[0] ?? mates[0];
  const b = people[1] ?? mates[1] ?? mates[0];
  const along = (yaw, d, side = 0) => [here[0] - Math.sin(yaw) * d + Math.cos(yaw) * side, here[2] - Math.cos(yaw) * d - Math.sin(yaw) * side];
  const put = async (p, x, z, up = 1.5) => ctl(`/place?id=${p.id}&x=${x}&y=${here[1] + up}&z=${z}`);
  const yaw0 = 0;
  await face(yaw0);
  // Near and far, both in view.
  const [nx, nz] = along(yaw0, 8, -2);
  const [fx, fz] = along(yaw0, 70, 6);
  await put(a, nx, nz);
  await put(b, fx, fz, 6);
  await sleep(1500);
  seen.nearFar = await tags();
  say(`near and far: ${JSON.stringify(seen.nearFar)}`);
  await shot('1-near-and-far');
  await phone(true);
  seen.nearFarPhone = await tags();
  await shot('1-near-and-far-phone');
  await phone(false);

  // Behind a wall: turn round until a mate 14 m off is on screen with no name.
  let walled = null;
  await put(b, ...along(yaw0 + Math.PI, 60), 6);
  for (let i = 0; i < 24 && !walled; i++) {
    const yaw = (i / 24) * Math.PI * 2;
    const [x, z] = along(yaw, 14);
    await put(a, x, z, 1);
    await face(yaw);
    await sleep(500);
    const list = await tags();
    // 14 m is inside the name range, so an on-screen chevron with no name means no line of sight.
    if (list.some((t) => !t.cls.includes('edge') && t.text === '')) walled = { yaw: yaw.toFixed(2), tags: list };
  }
  seen.wall = walled;
  say(`behind a wall: ${JSON.stringify(walled)}`);
  if (walled) await shot('2-behind-wall');

  // Off screen to the right, and behind.
  await face(yaw0);
  const [rx, rz] = along(yaw0 - Math.PI / 2, 15);
  const [bx, bz] = along(yaw0 + Math.PI, 12);
  await put(a, rx, rz);
  await put(b, bx, bz);
  await sleep(1200);
  seen.offScreen = await tags();
  say(`right and behind: ${JSON.stringify(seen.offScreen)}`);
  await shot('3-right-and-behind');
  await phone(true);
  seen.offScreenPhone = await tags();
  await shot('3-right-and-behind-phone');
  await phone(false);

  // Downed: far, then in reach.
  if (MODE === 'battle-royale') {
    const [dx, dz] = along(yaw0, 25, 3);
    await put(a, dx, dz, 1);
    await sleep(800);
    await ctl(`/down?id=${a.id}`);
    await sleep(1200);
    seen.downedFar = await tags();
    say(`Downed far: ${JSON.stringify(seen.downedFar)}`);
    await shot('4-downed-far');
    const [cx, cz] = along(yaw0, 1.4);
    await put(a, cx, cz, 0.5);
    await face(yaw0, -0.5);
    await sleep(1500);
    seen.downedNear = await tags();
    seen.prompt = await chrome.evaluate(`document.querySelector('.ds-prompt')?.textContent ?? ''`);
    say(`Downed in reach: ${JSON.stringify(seen.downedNear)}; prompt "${seen.prompt}"`);
    await shot('5-downed-in-reach');
    await phone(true);
    await shot('5-downed-in-reach-phone');
    await phone(false);
  }
  // Over the crosshair: a mate straight ahead, the tag right over the centre.
  await face(yaw0, 0.12);
  const [ox, oz] = along(yaw0, 10);
  await ctl(`/up?id=${a.id}`);
  await put(a, ox, oz, 0.5);
  await sleep(1200);
  seen.crosshair = await tags();
  say(`over the crosshair: ${JSON.stringify(seen.crosshair)}`);
  await shot('6-over-crosshair');
  const cost = await chrome.evaluate(`(() => { const t0 = performance.now(); return new Promise((done) => { let n = 0; const tick = () => { if (++n < 120) requestAnimationFrame(tick); else done(JSON.stringify({ frames: n, ms: ((performance.now() - t0) / n).toFixed(1), tags: document.querySelectorAll('.ds-ally').length })); }; requestAnimationFrame(tick); }); })()`);
  say(`frame time with tags: ${cost}`);
  if (chrome.errors.length) say(`console errors:\n${chrome.errors.slice(0, 8).join('\n')}`);
  console.log('PLAY OK', JSON.stringify(seen));
} catch (error) {
  say(`FAILED: ${error.message}`);
  if (chrome) await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }).then((s) => writeFileSync(`${out}/${MODE}-failed.jpg`, Buffer.from(s.result.data, 'base64'))).catch(() => {});
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
