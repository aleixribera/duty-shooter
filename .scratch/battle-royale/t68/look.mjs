// Ticket 68's look (adapted from t66/play.mjs): a Duos Battle Royale on the real server (t66/serve.ts) in a
// headless, muted Chrome. Pings by tap and by the wheel, an enemy ping, the compass and the
// island map, the toast under the open map, a crate standing solid and its opening bar.
//   npx vite build -c .scratch/battle-royale/t66/vite.harness.ts
//   remote-test --local "node .scratch/battle-royale/t66/play.mjs"
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const PORT = Number(process.env.PORT ?? 3321);
const VITE = PORT + 2000;
const out = '.scratch/battle-royale/t68/shots';
mkdirSync(out, { recursive: true });
const children = [];
const start = (cmd, args, env, cwd) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'ignore', 'inherit'], shell: cmd === 'npx' });
  children.push(c);
  return c;
};
start(process.execPath, ['.scratch/battle-royale/t66/dist/serve.js'], { MODE: 'battle-royale', SQUADS: '2', TIME_LIMIT: '900', PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist` });
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
const say = (t) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${t}`;
  console.log(line);
  appendFileSync(`${out}/../play.log`, `${line}
`);
};
writeFileSync(`${out}/../play.log`, '');
let failed = false;
const check = (what, ok) => {
  say(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
};
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
let chrome;
try {
  await until('server', () => ctl('/list'), 60000, 500);
  await until('vite', () => fetch(`http://localhost:${VITE}/`).then((r) => r.ok), 60000, 500);
  chrome = await launchChrome();
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const size = async (phone) => {
    await chrome.send('Emulation.setDeviceMetricsOverride', phone ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await sleep(700);
  };
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    say(`  shot ${name}`);
  };
  const both = async (name, between) => {
    await shot(`${name}-desktop`);
    await size(true);
    await between?.();
    await shot(`${name}-phone`);
    await size(false);
  };
  const key = (type, code, text) => chrome.send('Input.dispatchKeyEvent', { type, code, key: text, windowsVirtualKeyCode: text.toUpperCase().charCodeAt(0) });
  const mouse = (type, init = {}) => chrome.evaluate(`document.dispatchEvent(new MouseEvent('${type}', ${JSON.stringify({ bubbles: true, ...init })}))`);
  const tap = async () => {
    await mouse('mousedown', { button: 1 });
    await sleep(80);
    await mouse('mouseup', { button: 1 });
  };
  const ev = async (js) => JSON.parse((await chrome.evaluate(`JSON.stringify((() => { ${js} })())`)) ?? 'null');
  const local = () => ev(`const p = duty.game.player; return p ? { id: p.id, alive: p.alive, position: p.position } : null`);
  const hud = () =>
    ev(`return {
      pings: [...document.querySelectorAll('.ds-ping')].map((d) => d.className + ' ' + d.textContent),
      wheel: document.querySelector('.ds-pingwheel.open') ? [...document.querySelectorAll('.ds-pingwheel span.on')].map((s) => s.textContent) : null,
      feed: [...document.querySelectorAll('.ds-feed > div, .ds-objfeed > div')].map((d) => d.textContent),
      compass: [...document.querySelectorAll('.ds-compass .mk')].map((d) => d.className + ' ' + d.textContent),
      toast: [...document.querySelectorAll('.ds-toast')].map((d) => getComputedStyle(d).visibility + ':' + d.textContent),
      revive: (() => { const r = [...document.querySelectorAll('.ds-action')].find((e) => getComputedStyle(e).display !== 'none'); return r && getComputedStyle(r).display !== 'none' ? r.textContent + ' ' + (r.querySelector('.bar i')?.style.width ?? '') : null; })(),
    }`);
  const state = () => ctl('/state');
  const look = (at, up = 0) => chrome.evaluate(`(() => { const p = duty.game.player; const d = [${at[0]} - p.position[0], ${at[1]} + ${up} - p.position[1] - 1.6, ${at[2]} - p.position[2]]; duty.game.input.setAngles(Math.atan2(-d[0], -d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))); })()`);
  const place = (id, at) => ctl(`/place?id=${id}&x=${at[0]}&y=${at[1] + 0.4}&z=${at[2]}`);

  await chrome.navigate(`http://localhost:${VITE}/?online&nolock`);
  await sleep(2000);
  await chrome.evaluate(`globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().toLowerCase().startsWith(text.toLowerCase()))`);
  await chrome.waitFor(`!!globalThis.__find?.('Play Online')`, 90000, 100);
  await chrome.evaluate(`document.querySelector('.ds-menu input').value = 'Ada'; __find('Play Online').click()`);
  await chrome.waitFor(`!!__find('Join') || !!__find('Start')`, 60000, 100);
  await chrome.evaluate(`if (__find('Join')) { const i = document.querySelector('.ds-field input'); i.value = 'Ada'; __find('Join').click(); }`);
  if (!(await chrome.waitFor(`!!__find('Start')`, 180000, 200))) throw new Error('no lobby');
  await until('enemy seated', async () => (await ctl('/list')).enemy, 20000);
  await chrome.evaluate(`__find('Start').click()`);
  const me = await until('in play', async () => ((await ctl('/list')).phase === 'playing' ? await local() : null), 240000, 500);
  await until('dropped', async () => {
    const p = await local();
    return p?.alive && !(await ev(`return !!document.querySelector('.ds-prep:not([hidden])')`)) ? true : null;
  }, 150000, 300);
  // The Preparation's screen holds the game paused until the drop is over.
  await until('in control', () => ev(`const p = duty.game.player; return p?.alive && !duty.game.paused && p.movement !== 'airborne' && !document.querySelector('.ds-prep:not([hidden])') ? p.movement : null`), 90000, 300);
  await sleep(2000);
  let list = await ctl('/list');
  const mine = list.players.find((p) => p.id === me.id);
  const mate = list.players.find((p) => p.team === mine.team && p.id !== me.id);
  const enemyId = list.enemy;
  await ctl(`/guard?id=${me.id},${mate.id},${enemyId}`);
  say(`playing as ${me.id} with ${mate.name} (${mate.id}, bot ${mate.bot}); enemy ${enemyId}`);


  const line = () => ev(`const e = document.querySelector('.ds-nextline'); const o = document.querySelector('.ds-outside'); return { next: e && getComputedStyle(e).display !== 'none' ? e.textContent + ' | ' + (e.querySelector('.arrow')?.style.transform ?? '') : null, outside: o && getComputedStyle(o).display !== 'none' ? o.textContent : null, ringline: document.querySelector('.ds-ringline')?.textContent }`);
  const settle = async (at) => {
    await place(me.id, [at[0], 60, at[1]]);
    let y = 999;
    await until('landed', async () => { const p = await local(); const still = p && Math.abs(p.position[1] - y) < 0.01; y = p?.position[1] ?? 999; return still ? p : null; }, 30000, 400);
    await sleep(1200);
  };
  const o = (await state()).objective;
  say(`  ring ${JSON.stringify(o.circle)} next ${JSON.stringify(o.next)}`);
  // Inside the Ring, well out of the next circle: on the far side of the Ring's centre from it.
  const dx = o.circle.x - o.next.x, dz = o.circle.z - o.next.z, d = Math.hypot(dx, dz) || 1;
  let reach = Math.min(o.next.radius + 120, Math.hypot(dx, dz) + o.circle.radius * 0.5);
  const far = [o.next.x + (dx / d) * reach, o.next.z + (dz / d) * reach];
  await settle(far);
  await chrome.evaluate(`duty.game.input.setAngles(0, -0.05)`);
  await sleep(800);
  let h = await line();
  say(`  far from the next circle: ${JSON.stringify(h)}`);
  check('inside the Ring and out of the next circle: the way to it shows', /m to the next circle/.test(h.next ?? '') && !h.outside);
  await both('01-nextline', async () => { await sleep(600); say(`  phone: ${JSON.stringify(await line())}`); });
  // Into the next circle: the line goes.
  await settle([o.next.x, o.next.z]);
  h = await line();
  say(`  in the next circle: ${JSON.stringify(h)}`);
  check('inside the next circle, no line', !h.next);
  // Out of the Ring: the hazard warning instead.
  const ux = (o.next.x - o.circle.x) || 1, uz = o.next.z - o.circle.z, ud = Math.hypot(ux, uz);
  await settle([o.circle.x - (ux / ud) * (o.circle.radius + 40), o.circle.z - (uz / ud) * (o.circle.radius + 40)]);
  h = await line();
  say(`  outside the Ring: ${JSON.stringify(h)}`);
  check('outside the Ring: the warning, not the line', !!h.outside && !h.next);
  await both('02-outside');
  say(`page errors: ${JSON.stringify(await ev('return globalThis.__errors ?? []'))}`);
} catch (e) {
  say(`ERROR ${e.stack ?? e}`);
  failed = true;
} finally {
  await chrome?.close?.().catch(() => {});
  for (const c of children) c.kill();
  process.exit(failed ? 1 : 0);
}
