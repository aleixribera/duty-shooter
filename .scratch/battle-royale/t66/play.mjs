// Ticket 66's play-through: a Duos Battle Royale on the real server (t66/serve.ts) in a
// headless, muted Chrome. Pings by tap and by the wheel, an enemy ping, the compass and the
// island map, the toast under the open map, a crate standing solid and its opening bar.
//   npx vite build -c .scratch/battle-royale/t66/vite.harness.ts
//   remote-test --local "node .scratch/battle-royale/t66/play.mjs"
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const PORT = Number(process.env.PORT ?? 3321);
const VITE = PORT + 2000;
const out = '.scratch/battle-royale/t66/shots';
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

  // 1. A tap on open ground: "Going here", on screen, in the feed, on the compass.
  const spot = mine.position;
  await place(me.id, spot);
  await place(mate.id, [spot[0] + 30, spot[1], spot[2] + 30]);
  await sleep(800);
  await chrome.evaluate(`duty.game.input.setAngles(0, -0.25)`);
  await sleep(500);
  const ground = await ev(`const p = duty.game.player; return [p.position[0], p.position[1], p.position[2] - 6]`);
  let h1 = null;
  for (let attempt = 0; attempt < 15 && !h1; attempt++) {
    say(`  tap ${attempt}: ${JSON.stringify(await ev(`const g = duty.game; const p = g.player; return { paused: g.paused, locked: g.input.locked, alive: p?.alive, movement: p?.movement, phase: duty.driver?.match?.phase, wheel: g.input.pingWheel, prep: !!document.querySelector('.ds-prep:not([hidden])') }`))}`);
    await tap();
    h1 = await until('go ping shown', async () => {
      const h = await hud();
      return h.pings.length ? h : null;
    }, 1500, 100).catch(() => null);
  }
  say(`  after a tap: ${JSON.stringify(h1)}`);
  check('a tap marks the ground: a Going-here marker', /go .*Going here/.test(h1?.pings.join() ?? ''));
  check('the feed says who pinged', h1?.feed.some((f) => /You: Going here/.test(f)) ?? false);
  check('the compass shows the ping', h1?.compass.some((c) => /ping/.test(c)) ?? false);
  await sleep(400);
  await both('01-go');

  // The bot squadmate: does it come over (answers only when it makes sense to).
  const pingAt = (await ev(`return duty.game.player?.position`)) ?? spot;
  const mate0 = (await ctl('/list')).players.find((p) => p.id === mate.id).position;
  await sleep(8000);
  const mate1 = (await ctl('/list')).players.find((p) => p.id === mate.id);
  say(`  ${mate.name}: ${flat(mate0, ground).toFixed(1)} m from the ping, after 8 s ${flat(mate1.position, ground).toFixed(1)} m (${mate1.act})`);
  const next = (await state()).objective.next;
  const fromCentre = Math.hypot(ground[0] - next.x, ground[2] - next.z);
  say(`  the ping is ${fromCentre.toFixed(0)} m from the next circle's centre (radius ${next.radius.toFixed(0)})`);
  // A bot goes with a squadmate's "Going here" only inside the circle that matters next: outside it, staying put is its call.
  if (fromCentre < next.radius * 0.7) check('the bot squadmate came toward a Going-here ping inside the next circle', flat(mate1.position, ground) < flat(mate0, ground) - 5);
  void pingAt;

  // 2. Hold: the wheel opens; push up: Enemy.
  await chrome.evaluate(`duty.game.input.setAngles(0, -0.25)`);
  await mouse('mousedown', { button: 1 });
  await sleep(450);
  await mouse('mousemove', { movementX: 4, movementY: -60 });
  await sleep(200);
  const h2 = await hud();
  say(`  wheel: ${JSON.stringify(h2.wheel)}`);
  check('holding opens the wheel, and a push up picks Enemy', JSON.stringify(h2.wheel) === '["Enemy"]');
  await shot('02-wheel-desktop');
  await mouse('mousemove', { movementX: 80, movementY: 60 });
  await sleep(100);
  const h2b = await hud();
  check('pushed right instead: Going here', JSON.stringify(h2b.wheel) === '["Going here"]');
  await mouse('mousemove', { movementX: -84, movementY: 60 });
  await sleep(100);
  check('pushed down: Defend here', JSON.stringify((await hud()).wheel) === '["Defend here"]');
  await mouse('mouseup', { button: 1 });
  await sleep(600);
  const h3 = await hud();
  check('letting go marks Defend here, replacing the Going-here', h3.pings.filter((p) => /Going here|Defend here/.test(p)).length === 1 && h3.pings.some((p) => /Defend here/.test(p)));

  // 3. An enemy in sight: a tap marks them.
  await place(enemyId, [spot[0] + 3, spot[1] + 8, spot[2] - 18]);
  await sleep(2500);
  const foe = (await ctl('/list')).players.find((p) => p.id === enemyId).position;
  await look(foe, 1.2);
  await sleep(300);
  await tap();
  const h4 = await until('enemy ping', async () => {
    const h = await hud();
    return h.pings.some((p) => /enemy/.test(p)) ? h : null;
  }, 5000, 100).catch(() => hud());
  say(`  enemy ping: ${JSON.stringify(h4.pings)} feed ${JSON.stringify(h4.feed)}`);
  check('a tap on an enemy marks the enemy', h4.pings.some((p) => /enemy .*Enemy/.test(p)));
  check('the feed calls it out', h4.feed.some((f) => /You: Enemy spotted/.test(f)));
  await sleep(300);
  await both('03-enemy', () => look(foe, 1.2));
  await place(enemyId, [spot[0] + 200, spot[1], spot[2] + 200]);

  // 4. The island map open: pings on it, none on screen, no toast through it.
  await chrome.evaluate(`duty.game.hud.toast('A toast under the map', 8)`);
  await key('keyDown', 'KeyM', 'm');
  await sleep(600);
  const h5 = await hud();
  say(`  map open: ${JSON.stringify(h5)}`);
  check('with the map open, no ping markers on the view', h5.pings.length === 0);
  check('with the map open, the toast is hidden', h5.toast.every((t) => t.startsWith('hidden') || !/under the map/.test(t)));
  await both('04-map');
  await key('keyUp', 'KeyM', 'm');
  await key('keyDown', 'KeyM', 'm');
  await key('keyUp', 'KeyM', 'm');
  await sleep(300);

  // 5. A Supply Drop: it stands solid, pings as a crate, and opening it shows the bar.
  const drop = await until('a drop announced', async () => (await state()).objective?.drops?.[0], 400000, 1000);
  say(`  drop at ${drop.position.map((v) => v.toFixed(0))}, lands ${drop.lands.toFixed(0)}`);
  // Waiting beside where it lands, so the opening comes before any bot's.
  await until('nearly landed', async () => (await state()).time > drop.lands - 3, 120000, 300);
  await place(me.id, [drop.position[0] + 1.6, drop.position[1] + 0.5, drop.position[2]]);
  await until('landed', async () => (await state()).time > drop.lands + 0.1, 20000, 100);
  await look(drop.position, 0.3);
  await key('keyDown', 'KeyF', 'f');
  await sleep(1100);
  const h7 = await hud();
  const opening = (await state()).objective.drops.find((d) => d.stage === drop.stage)?.opening ?? null;
  say(`  opening: ${h7.revive}; prompt ${await ev(`return [...document.querySelectorAll('.ds-prompt')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.textContent)`)}; server ${JSON.stringify(opening)}`);
  check('opening shows a progress bar', /Opening Supply Drop/.test(h7.revive ?? ''));
  await shot('06-opening-desktop');
  await key('keyUp', 'KeyF', 'f');
  await sleep(300);
  await place(mate.id, [drop.position[0] + 60, drop.position[1], drop.position[2] + 60]);
  await place(me.id, [drop.position[0] + 8, drop.position[1], drop.position[2] + 2]);
  await sleep(1000);
  await look(drop.position, 0.4);
  await sleep(400);
  await tap();
  const h6 = await until('drop ping', async () => {
    const h = await hud();
    return h.pings.some((p) => /drop/.test(p)) ? h : null;
  }, 5000, 100).catch(() => hud());
  say(`  crate ping: ${JSON.stringify(h6.pings)}; crate ${JSON.stringify((await state()).objective.drops.find((d) => d.stage === drop.stage))}`);
  check('a tap on the crate marks the Supply Drop', h6.pings.some((p) => /drop .*Supply Drop/.test(p)));
  await both('05-crate-ping', () => look(drop.position, 0.4));
  // Walk at it from the east: stopped at its side.
  await place(me.id, [drop.position[0] + 3, drop.position[1], drop.position[2]]);
  await sleep(600);
  await look([drop.position[0] - 10, drop.position[1], drop.position[2]], 1.6);
  say(`  before the walk: ${JSON.stringify(await local())}; crate ${JSON.stringify((await state()).objective.drops.find((d) => d.stage === drop.stage))}`);
  await key('keyDown', 'KeyW', 'w');
  await sleep(1500);
  await key('keyUp', 'KeyW', 'w');
  const after = await local();
  say(`  walked at the crate: ${(after.position[0] - drop.position[0]).toFixed(2)} m east of its centre`);
  check('the crate is solid: walking at it stops at its side', after.position[0] - drop.position[0] > 0.8);
  const errors = await ev(`return globalThis.__errors ?? []`);
  say(`page errors: ${JSON.stringify(errors)}`);
} catch (error) {
  failed = true;
  say(`ERROR ${error?.stack ?? error}`);
} finally {
  await chrome?.close?.();
  for (const c of children) c.kill();
  process.exit(failed ? 1 : 0);
}
