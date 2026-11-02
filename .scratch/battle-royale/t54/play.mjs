// Ticket 54 in a real Duos match on Zero Island, real server, real browser:
// A) an enemy holds the trigger on the person from 30 HP: the burst Downs them and
//    keeps going; the Grace must keep the pool full for 1 s, so it can't Finish them.
// B) the person fires on an enemy just Downed: the marker must read shielded, then hit.
//   npx vite build -c .scratch/battle-royale/t54/vite.harness.ts
//   remote-test --local "node .scratch/battle-royale/t54/play.mjs"
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const PORT = 3354;
const VITE = 5354;
const out = '.scratch/battle-royale/t54/shots';
mkdirSync(out, { recursive: true });
const children = [];
const start = (cmd, args, env, cwd) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'ignore', 'inherit'], shell: cmd === 'npx' });
  children.push(c);
  return c;
};
start(process.execPath, ['.scratch/battle-royale/t54/dist/serve.js'], { MODE: 'battle-royale', SQUADS: '2', TIME_LIMIT: '500', PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist` });
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
const results = {};
try {
  await until('server', () => ctl('/list'), 90000, 500);
  await until('vite', () => fetch(`http://localhost:${VITE}/`).then((r) => r.ok), 60000, 500);
  chrome = await launchChrome();
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const local = async () => JSON.parse(await chrome.evaluate(`JSON.stringify((() => { const p = duty.game.player; return p ? { id: p.id, alive: p.alive, health: p.health, downed: p.downed, position: p.position } : null; })())`));
  const action = () => chrome.evaluate(`[...document.querySelectorAll('.ds-action')].filter((a) => a.style.display !== 'none').map((a) => a.textContent).join(' | ')`);
  const seat = async (id) => (await ctl('/list')).players.find((p) => p.id === id);

  await chrome.navigate(`http://localhost:${VITE}/?online&nolock`);
  await sleep(2000);
  await chrome.evaluate(`globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().toLowerCase().startsWith(text.toLowerCase()))`);
  await chrome.waitFor(`!!globalThis.__find?.('Play Online')`, 60000, 100);
  await chrome.evaluate(`document.querySelector('.ds-menu input').value = 'Ada'; __find('Play Online').click()`);
  await chrome.waitFor(`!!__find('Join') || !!__find('Start')`, 60000, 100);
  await chrome.evaluate(`if (__find('Join')) { const i = document.querySelector('.ds-field input'); i.value = 'Ada'; __find('Join').click(); }`);
  if (!(await chrome.waitFor(`!!__find('Start')`, 180000, 200))) throw new Error('no lobby');
  await until('enemy seated', async () => (await ctl('/list')).enemy, 20000);
  await chrome.evaluate(`__find('Start').click()`);
  const me = await until('in the match', async () => ((await ctl('/list')).phase === 'playing' ? await local() : null), 180000, 500);
  await until('alive', async () => (await local())?.alive, 20000);
  await sleep(6000);
  let list = await ctl('/list');
  const mine = list.players.find((p) => p.id === me.id);
  const mate = list.players.find((p) => p.team === mine.team && p.id !== me.id);
  const enemyId = list.enemy;
  say(`playing as ${me.id}; mate ${mate.name} (bot ${mate.bot}); enemy ${enemyId}`);
  const near = (at, dx, dz, up = 0.6) => `x=${at[0] + dx}&y=${at[1] + up}&z=${at[2] + dz}`;
  await ctl(`/guard?id=${mate.id}`);

  // A) Downed by a burst that keeps going.
  const here = mine.position;
  await ctl(`/place?id=${mate.id}&${near(here, -6, 5, 0.3)}`);
  // Somewhere 5 m off and a little above, so a low shot at a body lying down clears the slope.
  for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5], [3.5, 3.5], [-3.5, 3.5], [3.5, -3.5], [-3.5, -3.5]]) {
    await ctl(`/place?id=${enemyId}&${near(here, dx, dz)}`);
    await sleep(500);
    const y = (await seat(enemyId)).position[1];
    say(`shooter at ${dx},${dz}: dy ${(y - here[1]).toFixed(2)}`);
    if (y - here[1] > 0.4 && y - here[1] < 2.5) break;
  }
  await ctl(`/hp?id=${me.id}&hp=30`);
  await ctl(`/fire?at=${me.id}&auto=1`);
  await until('Downed', async () => (await local())?.downed, 20000, 30);
  await sleep(350);
  results.protectedLine = await action();
  await shot('a1-downed-protected');
  await sleep(500);
  // Past the Grace: short bursts, so the recoil keeps the enemy on target.
  await ctl(`/fire?at=${me.id}&keep=1`);
  // Until the first hit past the Grace lands, then hold fire, so Ada lives for part B.
  await until('a hit past the Grace', async () => (await ctl('/trace')).at(-1).health < 100, 6000, 16).catch(() => null);
  const trace = await ctl('/trace');
  await ctl('/fire?at=');
  await sleep(300);
  await shot('a2-after-grace');
  const down = trace.findIndex((s) => s.downed);
  const t0 = trace[down].t;
  const graceHits = trace.filter((s) => s.t >= t0 && s.t < t0 + 1).flatMap((s) => s.hits);
  const inGrace = trace.filter((s) => s.t >= t0 && s.t < t0 + 0.98);
  results.burst = {
    healthBeforeDown: trace.slice(0, down).map((s) => s.health).filter((h, i, a) => a.indexOf(h) === i),
    graceHealth: [...new Set(inGrace.map((s) => s.health))],
    graceHitsSeen: graceHits.length,
    graceHitDamage: [...new Set(graceHits)],
    sample: trace.filter((s, i) => i % 20 === 0).map((s) => [s.t.toFixed(2), s.health.toFixed(0), s.ammo, s.shots, s.hits.join('/'), s.stance, s.their.map((v) => v.toFixed(1)).join(','), s.my.map((v) => v.toFixed(1)).join(',')]),
    hitsAfterGrace: trace.filter((s) => s.t >= t0 + 1).flatMap((s) => s.hits),
    t0, tEnd: trace.at(-1).t,
    afterGrace: trace.filter((s) => s.t >= t0 + 1).map((s) => s.health).at(-1),
    aliveAfter: trace.at(-1).alive,
    fired: (trace.at(-1).t - trace[0].t).toFixed(2),
  };
  results.lineAfter = await action();
  say(`A: ${JSON.stringify(results.burst)}; HUD in grace "${results.protectedLine}", after "${results.lineAfter}"`);

  // B) The person fires on an enemy just Downed.
  await ctl(`/place?id=${enemyId}&${list.players.find((p) => p.id === enemyId).position.join(',').replace(/^([^,]+),([^,]+),([^,]+)$/, 'x=$1&y=$2&z=$3')}`);
  if ((await local())?.alive) await ctl(`/up?id=${me.id}`);
  await until('standing', async () => (await local())?.alive && !(await local())?.downed, 5000, 100);
  const self = await local();
  say(`after A: ${JSON.stringify(self)}`);
  if (!self.alive) throw new Error('Ada was Finished after the grace; part B needs her standing');
  const spot = (await seat(me.id)).position;
  await ctl('/heal?on=0');
  await ctl(`/place?id=${enemyId}&${near(spot, 0, -4, 0.3)}`);
  await sleep(700);
  const enemy = await seat(enemyId);
  const eye = (await seat(me.id));
  const dx = enemy.position[0] - eye.position[0];
  const dz = enemy.position[2] - eye.position[2];
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(enemy.position[1] + 0.25 - (eye.position[1] + 1.6), Math.hypot(dx, dz));
  await chrome.evaluate(`duty.game.input.setAngles(${yaw}, ${pitch}), 1`);
  await chrome.evaluate(`globalThis.__marks = []; new MutationObserver(() => { const h = document.querySelector('.ds-hit'); __marks.push([Math.round(performance.now()), h.className]); }).observe(document.querySelector('.ds-hit'), { attributes: true, attributeFilter: ['class', 'style'] }); 1`);
  await ctl(`/down?id=${enemyId}`);
  const downedAt = await chrome.evaluate('performance.now()');
  const tap = async () => {
    await chrome.evaluate(`(() => { const i = duty.game.input, p = duty.game.player, a = i.angles; i.setAngles(${yaw} - (p.yaw - a.yaw), ${pitch} - (p.pitch - a.pitch)); return 1; })()`);
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 800, y: 450, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(40);
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 450, button: 'left', buttons: 0, clickCount: 1 });
  };
  const ammo0 = JSON.parse(await chrome.evaluate('JSON.stringify(duty.game.player.weapon.ammo)'));
  await tap();
  await sleep(40);
  await shot('b1-shielded-marker');
  for (let i = 0; i < 3; i++) {
    await sleep(180);
    await tap();
  }
  results.enemyInGrace = (await seat(enemyId)).health;
  await sleep(1200 - (await chrome.evaluate('performance.now()') - downedAt) > 0 ? 1200 - (await chrome.evaluate('performance.now()') - downedAt) : 0);
  await tap();
  await sleep(40);
  await shot('b2-hit-marker');
  for (let i = 0; i < 3; i++) {
    await sleep(250);
    await tap();
  }
  await sleep(300);
  results.ammoUsed = ammo0 - JSON.parse(await chrome.evaluate('JSON.stringify(duty.game.player.weapon.ammo)'));
  results.angles = await chrome.evaluate('JSON.stringify([duty.game.input.angles, duty.game.player.yaw, duty.game.player.pitch])');
  results.want = [yaw, pitch];
  const marks = JSON.parse(await chrome.evaluate('JSON.stringify(__marks)'));
  const classes = marks.map(([t, c]) => [Math.round(t - downedAt), c]).filter(([, c], i, a) => i === 0 || a[i - 1][1] !== c);
  results.marks = classes;
  results.enemyAfter = (await seat(enemyId));
  say(`B: marker classes ${JSON.stringify(classes)}; enemy now ${results.enemyAfter.health} HP downed ${!!results.enemyAfter.downed} alive ${results.enemyAfter.alive}`);
  // The markers fade in 0.28 s, faster than a screenshot: hold each one up to look at it.
  await chrome.evaluate(`document.head.insertAdjacentHTML('beforeend', '<style>.ds-hit { opacity: 1 !important; }</style>'), 1`);
  for (const cls of ['ds-hit shielded', 'ds-hit', 'ds-hit head']) {
    await chrome.evaluate(`(() => { const h = document.querySelector('.ds-hit'); const o = new MutationObserver(() => { if (h.className !== '${cls}') h.className = '${cls}'; }); h.className = '${cls}'; o.observe(h, { attributes: true, attributeFilter: ['class'] }); globalThis.__hold = o; return 1; })()`);
    await sleep(200);
    await shot(`b3-marker-${cls.replace(/ /g, '-')}`);
    await chrome.evaluate('__hold.disconnect(), 1');
  }
  if (chrome.errors.length) say(`console errors:\n${chrome.errors.slice(0, 8).join('\n')}`);
  console.log('PLAY OK', JSON.stringify(results));
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
