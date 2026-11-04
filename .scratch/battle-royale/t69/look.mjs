// Ticket 69's look: squad wipes, the Kill Leader, the victory beat and the champion at the next dive (adapted from t66/play.mjs): a Duos Battle Royale on the real server (t66/serve.ts) in a
// headless, muted Chrome. Pings by tap and by the wheel, an enemy ping, the compass and the
// island map, the toast under the open map, a crate standing solid and its opening bar.
//   npx vite build -c .scratch/battle-royale/t66/vite.harness.ts
//   remote-test --local "node .scratch/battle-royale/t66/play.mjs"
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const PORT = Number(process.env.PORT ?? 3321);
const VITE = PORT + 2000;
const out = '.scratch/battle-royale/t69/shots';
mkdirSync(out, { recursive: true });
const children = [];
const start = (cmd, args, env, cwd) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'ignore', 'inherit'], shell: cmd === 'npx' });
  children.push(c);
  return c;
};
start(process.execPath, ['.scratch/battle-royale/t66/dist/serve.js'], { MODE: 'battle-royale', SQUADS: '2', TIME_LIMIT: '150', PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist` });
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



  const feed = () => ev(`return [...document.querySelectorAll('.ds-feed > div, .ds-objfeed > div')].map((d) => d.textContent)`);
  const vis = (sel) => ev(`const e = document.querySelector('${sel}'); return e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' ? e.textContent : null`);
  // Open ground: the next circle's middle. The Enemy stands there; each victim is dropped 7 m north of it.
  const nx = (await state()).objective.next;
  const settleSeat = async (id, x, z, from = 60) => {
    await place(id, [x, from, z]);
    let y = 999;
    return until('settled', async () => { const p = (await ctl('/list')).players.find((q) => q.id === id); const still = p && Math.abs(p.position[1] - y) < 0.01; y = p?.position[1] ?? 999; return still ? p.position : null; }, 20000, 300);
  };
  const enemySpot = await settleSeat(enemyId, nx.x, nx.z);
  say(`  enemy at ${JSON.stringify(enemySpot)}`);
  // Three bot Squads in front of the Enemy, one seat at a time: Squads wiped, and a Kill Leader.
  list = await ctl('/list');
  const squads = new Map();
  for (const p of list.players) if (p.bot && p.alive && p.team !== mine.team && p.team !== list.players.find((q) => q.id === enemyId).team) squads.set(p.team, [...(squads.get(p.team) ?? []), p.id]);
  const victims = [...squads.values()].filter((s) => s.length === 2).slice(0, 3).flat();
  say(`  victims ${victims.join(', ')}`);
  // Each put Downed by the Enemy with its bleed-out run down (the harness's /out): the simulation's own bleed-out and wipe do the rest.
  const heard = new Set();
  for (const v of victims) {
    await ctl(`/out?id=${v}&by=${enemyId}`);
    await until(`${v} out`, async () => ((await ctl('/list')).players.find((q) => q.id === v)?.alive ? null : true), 10000, 200);
    await sleep(700);
    for (const l of await feed()) heard.add(l);
    say(`  ${v}: out`);
    if (process.env.QUICK) break;
  }
  await ctl('/fire?at=');
  if (process.env.QUICK) throw new Error('quick stop');
  await place(me.id, [enemySpot[0] + 4, enemySpot[1] + 0.5, enemySpot[2] + 10]);
  await sleep(1500);
  for (const l of await feed()) heard.add(l);
  const f = [...heard];
  say(`  feed: ${JSON.stringify(f)}`);
  check('a wiped Squad is called, with how many Squads are left', f.some((l) => /Squad wiped: .* Squads? left/.test(l)));
  check('the Kill Leader is called out', f.some((l) => /Enemy is the Kill Leader · \d+ eliminations/.test(l)));
  const lead = await vis('.ds-leader');
  say(`  leader plate: ${lead}`);
  check('the Kill Leader shows under the compass for everyone', /Kill Leader\s*Enemy\s*\d/.test(lead ?? ''));
  await both('01-leader');
  // The match runs to its time limit; the victory beat comes before the nuke.
  await until('result', async () => ((await ctl('/list')).phase !== 'playing' ? true : null), 200000, 250);
  await sleep(300);
  const v1 = await vis('.ds-victory');
  const shotNow = null;
  say(`  victory card: ${v1}; ending shot: ${shotNow}; end panel: ${await vis('.ds-end')}`);
  check('the victory beat shows who won before the nuke', /win, 1st of \d+ Squads|Victory/.test(v1 ?? ''));
  await shot('02-victory-desktop');
  await size(true);
  await shot('02-victory-phone');
  await size(false);
  await sleep(3500);
  const v2 = await vis('.ds-victory');
  say(`  after the beat: victory ${v2}; end panel ${await vis('.ds-end')}`);
  check('the beat gives way to the ending and its panel', !v2);
  await shot('03-nuke-desktop');
  // Back to the lobby, then the next match: its dive introduces the champions.
  await chrome.waitFor(`!!__find('Start')`, 60000, 250);
  await chrome.evaluate(`__find('Start').click()`);
  await until('preparation', () => ev(`return document.querySelector('.ds-prep:not([hidden])') ? true : null`), 60000, 250);
  const champ = await until('the dive', () => ev(`const c = document.querySelector('.ds-prep .champ'); return c ? c.textContent : null`), 60000, 200);
  say(`  champion at the dive: ${champ}`);
  check('the champion Squad is introduced at the dive', /Champion Squad.*Enemy|Won the last match|Kill Leader/.test(champ ?? ''));
  await sleep(800);
  await both('04-champion');
  say(`page errors: ${JSON.stringify(await ev('return globalThis.__errors ?? []'))}`);
} catch (e) {
  say(`ERROR ${e.stack ?? e}`);
  failed = true;
} finally {
  await chrome?.close?.().catch(() => {});
  for (const c of children) c.kill();
  process.exit(failed ? 1 : 0);
}
