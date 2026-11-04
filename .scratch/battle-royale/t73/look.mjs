// Ticket 73's look: the death recap (Downed, then out), the attacker on the map, the match card, and ticket 69's phone layout (outside warning vs the feed, one-line Squad wiped).
// headless, muted Chrome. Pings by tap and by the wheel, an enemy ping, the compass and the
// island map, the toast under the open map, a crate standing solid and its opening bar.
//   npx vite build -c .scratch/battle-royale/t66/vite.harness.ts
//   remote-test --local "node .scratch/battle-royale/t66/play.mjs"
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const PORT = Number(process.env.PORT ?? 3471);
const VITE = PORT + 2000;
const out = '.scratch/battle-royale/t73/shots';
mkdirSync(out, { recursive: true });
const children = [];
const start = (cmd, args, env, cwd) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'ignore', 'inherit'], shell: cmd === 'npx' });
  children.push(c);
  return c;
};
start(process.execPath, ['.scratch/battle-royale/t66/dist/serve.js'], { NO_HEAL: '1', MODE: 'battle-royale', SQUADS: '2', TIME_LIMIT: '170', PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist` });
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




  const feed = () => ev(`return [...document.querySelectorAll('.ds-feed > div')].map((d) => d.textContent)`);
  const vis = (sel) => ev(`const e = document.querySelector('${sel}'); return e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' ? e.textContent : null`);
  const rect = (sel) => ev(`const e = [...document.querySelectorAll('${sel}')].find((x) => getComputedStyle(x).display !== 'none'); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height }`);
  const settleSeat = async (id, x, z, from = 60) => {
    await place(id, [x, from, z]);
    let y = 999;
    return until('settled', async () => { const p = (await ctl('/list')).players.find((q) => q.id === id); const still = p && Math.abs(p.position[1] - y) < 0.01; y = p?.position[1] ?? 999; return still ? p.position : null; }, 8000, 300).catch(async () => (await ctl('/list')).players.find((q) => q.id === id)?.position);
  };
  const st = await state();
  const nx = st.objective.next;
  const circle = st.objective.circle;
  say(`  circle ${JSON.stringify(circle)} next ${JSON.stringify(nx)}`);

  // Part 1 (ticket 69's phone fixes): two Squads wiped for feed lines, then you outside the Ring at phone width.
  const enemySpot = await settleSeat(enemyId, nx.x, nx.z);
  list = await ctl('/list');
  const squads = new Map();
  const enemyTeam = list.players.find((q) => q.id === enemyId).team;
  for (const p of list.players) if (p.bot && p.alive && p.team !== mine.team && p.team !== enemyTeam) squads.set(p.team, [...(squads.get(p.team) ?? []), p.id]);
  const victims = [...squads.values()].filter((s) => s.length === 2).slice(0, 2).flat();
  // Outside: past the circle's edge, where there is ground.
  let outside = null;
  for (let a = 0; a < 16 && !outside; a++) {
    const ang = (a / 16) * Math.PI * 2;
    const x = circle.x + Math.cos(ang) * (circle.radius + 8);
    const z = circle.z + Math.sin(ang) * (circle.radius + 8);
    const p = await settleSeat(me.id, x, z, 80);
    say(`  try ${a}: ${JSON.stringify(p)}`);
    if (p && Math.hypot(p[0] - circle.x, p[2] - circle.z) > circle.radius && p[1] > -3) outside = p;
  }
  say(`  outside at ${JSON.stringify(outside)}`);
  await size(true);
  for (const v of victims) {
    await ctl(`/out?id=${v}&by=${enemyId}`);
    await sleep(500);
  }
  await until('wiped lines', async () => ((await feed()).filter((l) => /Squad wiped/.test(l)).length >= 2 ? true : null), 15000, 200).catch(() => null);
  await sleep(400);
  const out1 = await rect('.ds-outside');
  const lines = await ev(`return [...document.querySelectorAll('.ds-feed > div')].filter((d) => getComputedStyle(d).display !== 'none').map((d) => { const r = d.getBoundingClientRect(); return { t: r.top, b: r.bottom, h: r.height, l: r.left, r: r.right, text: d.textContent }; })`);
  say(`  phone: outside ${JSON.stringify(out1)} feed ${JSON.stringify(lines)}`);
  check('phone: the outside warning shows', !!out1);
  check('phone: the feed starts below the outside warning', !!out1 && lines.length > 0 && lines.every((l) => l.t >= out1.b));
  check('phone: every feed line is one line and on screen', lines.length > 0 && lines.every((l) => l.h < 34 && l.l >= 0 && l.r <= 390));
  await shot('01-outside-feed-phone');
  await size(false);
  await shot('01-outside-feed-desktop');

  // Part 2: the death recap, from a real fight: you, 14 m from a hostile bot; you open fire, it answers and puts you Downed.
  list = await ctl('/list');
  const foe = list.players.filter((p) => p.bot && p.alive && !p.downed && p.team !== mine.team && p.team !== enemyTeam && !victims.includes(p.id) && Math.abs(p.position[1]) < 200).sort((a, b) => Math.hypot(a.position[0] - nx.x, a.position[2] - nx.z) - Math.hypot(b.position[0] - nx.x, b.position[2] - nx.z))[0];
  const foeName = foe.name;
  say(`  foe ${foe.id} ${foeName} at ${JSON.stringify(foe.position)}`);
  await ctl(`/guard?id=${me.id},${mate.id},${enemyId}`);
  const mine2 = await settleSeat(me.id, foe.position[0] + 8, foe.position[2] + 11);
  await sleep(1500);
  await ctl(`/guard?id=${mate.id},${enemyId}`);
  for (let i = 0; i < 8; i++) {
    const f = (await ctl('/list')).players.find((q) => q.id === foe.id);
    await look(f.position, 1.3);
    await mouse('mousedown', { button: 0 });
    await sleep(120);
    await mouse('mouseup', { button: 0 });
    await sleep(150);
  }
  const downed = await until('downed', async () => { const m = (await ctl('/list')).players.find((q) => q.id === me.id); return m?.downed || !m?.alive ? true : null; }, 120000, 100);
  await sleep(600);
  const recap = await vis('.ds-recap');
  say(`  downed recap: ${recap}`);
  check('Downed: the recap names the Enemy, its weapon and distance, damage both ways and its health', /Downed by\s*\w+.*\d+ m.*You dealt\s*\d+.*They dealt\s*\d+.*Their health\s*(\d+|–)/.test(recap ?? ''));
  check('Downed: you dealt it damage', /You dealt\s*[1-9]/.test(recap ?? ''));
  await both('02-downed-recap');
  await key('keyDown', 'KeyM', 'm');
  await key('keyUp', 'KeyM', 'm');
  await sleep(800);
  check('the map marks who put you down', /Who put you down/.test((await vis('.ds-map aside')) ?? ''));
  await both('03-map-attacker');
  await key('keyDown', 'KeyM', 'm');
  await key('keyUp', 'KeyM', 'm');
  await ctl(`/out?id=${me.id}&by=${foe.id}`);
  await until('out', async () => ((await ctl('/list')).players.find((q) => q.id === me.id)?.alive ? null : true), 30000, 100);
  await sleep(1500);
  const spec = await vis('.ds-spec');
  say(`  spectator panel: ${spec}`);
  check('out: the spectator panel leads with who finished you', /(Finished by|Bled out · Downed by)\s*\w+/.test(spec ?? ''));
  await sleep(5000);
  await both('04-out-recap');

  // Part 3: the match card at the end, after the victory beat.
  await until('result', async () => ((await ctl('/list')).phase !== 'playing' ? true : null), 300000, 250);
  await sleep(4000);
  const card = await vis('.ds-card');
  say(`  card: ${card}`);
  check('the match card shows your place, numbers and the lobby countdown', /of \d+ Squads.*Eliminations.*Downs.*Damage.*Revives.*Reboots.*Time alive.*Back to the lobby in \d+ s/.test(card ?? ''));
  check('the end panel gives way to the card', !(await vis('.ds-end')));
  await both('05-card');
  say(`page errors: ${JSON.stringify(await ev('return globalThis.__errors ?? []'))}`);
} catch (e) {
  say(`ERROR ${e.stack ?? e}`);
  failed = true;
} finally {
  await chrome?.close?.().catch(() => {});
  for (const c of children) c.kill();
  process.exit(failed ? 1 : 0);
}
