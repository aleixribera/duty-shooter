// Watches a Duos match in a real browser against the real server: the person's
// seat is kept alive and carried from one bot to the next, a camera on the ground.
//   remote-test --local "node .scratch/battle-royale/bots-watch.mjs"
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../apps/range/scripts/chrome.mjs';

const PORT = 3297;
const VITE = 5297;
const out = '.scratch/battle-royale/shots/bots';
const LENGTH = Number(process.env.WATCH ?? 480);
mkdirSync(out, { recursive: true });
const children = [];
const start = (cmd, args, env, cwd) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'ignore', 'inherit'], shell: cmd === 'npx' });
  children.push(c);
  return c;
};
start(process.execPath, ['.scratch/battle-royale/downed/dist/serve.js'], { MODE: 'battle-royale', SQUADS: '2', TIME_LIMIT: '600', PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist`, NO_HEAL: '1' });
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
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
let chrome;
try {
  await until('server', () => ctl('/list'), 60000, 500);
  await until('vite', () => fetch(`http://localhost:${VITE}/`).then((r) => r.ok), 60000, 500);
  chrome = await launchChrome();
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const local = async () => JSON.parse(await chrome.evaluate(`JSON.stringify((() => { const p = duty.game.player; return p ? { id: p.id, alive: p.alive, yaw: p.yaw, pitch: p.pitch } : null; })())`));
  // The input reads mouse movement, so a look is a few nudges toward where it should end up.
  const look = async (at, from) => {
    const want = Math.atan2(-(at[0] - from[0]), -(at[2] - from[2]));
    for (let i = 0; i < 8; i++) {
      const me = await local();
      if (!me) return;
      const d = Math.atan2(Math.sin(want - me.yaw), Math.cos(want - me.yaw));
      const up = Math.atan2(at[1] - from[1], Math.max(1, flat(at, from))) - (me.pitch ?? 0);
      if (Math.abs(d) < 0.05 && Math.abs(up) < 0.05) return;
      await chrome.evaluate(`document.dispatchEvent(new MouseEvent('mousemove', { movementX: ${Math.round(-d * 300)}, movementY: ${Math.round(-up * 300)}, bubbles: true }))`);
      await sleep(80);
    }
  };

  await chrome.navigate(`http://localhost:${VITE}/?online&nolock`);
  await sleep(2000);
  await chrome.evaluate(`globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().startsWith(text))`);
  await chrome.waitFor(`!!globalThis.__find?.('Play Online')`, 60000, 100);
  await chrome.evaluate(`document.querySelector('.ds-menu input').value = 'Ada'; __find('Play Online').click()`);
  await chrome.waitFor(`!!__find('Join') || !!__find('Start')`, 60000, 100);
  await chrome.evaluate(`if (__find('Join')) { const i = document.querySelector('.ds-field input'); i.value = 'Ada'; __find('Join').click(); }`);
  if (!(await chrome.waitFor(`!!__find('Start')`, 180000, 200))) throw new Error('no lobby');
  await until('enemy seated', async () => (await ctl('/list')).enemy, 20000);
  await chrome.evaluate(`__find('Start').click()`);
  const me = await until('in the match', async () => ((await ctl('/list')).phase === 'playing' ? await local() : null), 120000, 500);
  await ctl(`/guard?id=${me.id}`);
  say(`playing as ${me.id}`);
  const begun = Date.now();
  let n = 0;
  let last = null;
  let lastFollowed = null;
  while ((Date.now() - begun) / 1000 < LENGTH) {
    const l = await ctl('/list');
    const t = ((Date.now() - begun) / 1000).toFixed(0);
    if (l.phase !== 'playing') {
      say(`${t} s: phase ${l.phase}`);
      say(`page: ${await chrome.evaluate(`document.body.innerText.slice(0, 400).replace(/\s+/g, ' ')`)}`);
      await shot('end');
      say(`alive ${l.players.filter((p) => p.alive).length} ${JSON.stringify(l.players.filter((p) => !p.bot).map((p) => [p.name, p.alive, p.health, p.downed]))}`);
      break;
    }
    const seats = l.players.filter((p) => p.alive && p.id !== me.id);
    const acts = {};
    for (const p of seats) acts[p.act ?? 'person'] = (acts[p.act ?? 'person'] ?? 0) + 1;
    const downed = seats.filter((p) => p.downed);
    const squads = new Set(seats.map((p) => p.team)).size;
    const mine = l.players.find((p) => p.id === me.id);
    const walking = seats.filter((p) => !p.downed && p.id !== lastFollowed);
    // Follow what's most worth seeing: a fight, a Downed seat, a flank, else a Squad on the move.
    const rank = (p) => (p.act === 'flank' ? 4 : p.act === 'cover' ? 3 : p.act === 'fight' ? 2 : p.act === 'use' ? 3 : 1);
    const pick = (downed[0] && n % 3 === 0 ? downed[0] : walking.sort((a, b) => rank(b) - rank(a))[0]) ?? seats[0];
    if (!pick) break;
    lastFollowed = pick.id;
    const mate = seats.find((p) => p.team === pick.team && p.id !== pick.id);
    say(`${t} s: ${seats.length + 1} seats, ${squads} Squads, ${downed.length} Downed; ${JSON.stringify(acts)}; following ${pick.name} (${pick.act}, health ${Math.round(pick.health)}) mate ${mate ? `${mate.act} ${flat(mate.position, pick.position).toFixed(0)} m off` : 'none'}`);
    const a = Math.random() * Math.PI * 2;
    const spot = [pick.position[0] + Math.cos(a) * 16, pick.position[1], pick.position[2] + Math.sin(a) * 16];
    await ctl(`/place?id=${me.id}&x=${spot[0]}&y=${spot[1] + 1}&z=${spot[2]}`);
    await sleep(700);
    await look(pick.position, spot);
    await sleep(300);
    const again = (await ctl('/list')).players.find((p) => p.id === pick.id);
    await shot(`${String(n).padStart(2, '0')}-${t}s-${pick.act}${pick.downed ? '-downed' : ''}`);
    if (again) await look(again.position, mine ? spot : spot);
    await sleep(1800);
    const after = (await ctl('/list')).players.find((p) => p.id === pick.id);
    if (after) {
      await look(after.position, spot);
      await shot(`${String(n).padStart(2, '0')}-${t}s-${pick.act}-next-${after.act}`);
      say(`  then ${after.act}, moved ${flat(after.position, pick.position).toFixed(1)} m in about 3 s, ${after.alive ? `health ${Math.round(after.health)}` : 'dead'}${after.downed ? ', Downed' : ''}`);
    }
    n += 1;
    last = l;
    await sleep(Math.max(0, 10000 - 3200));
  }
  say(`errors in the page: ${JSON.stringify(chrome.errors?.slice(0, 5) ?? [])}`);
  void last;
} finally {
  await chrome?.close?.();
  for (const c of children) spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
  await sleep(800);
  process.exit(0);
}
