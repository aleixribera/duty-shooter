// Ticket 11's play-through: a real Battle Royale on Zero Island against the
// real server and its bots, in a real browser, through every Stage of the Ring
// to the browser seat's placement, spectating, and the end of the match.
//   remote-test --local "node .scratch/battle-royale/hud/play.mjs"
// Shots go to .scratch/battle-royale/shots/hud/.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const PORT = 3311;
const VITE = 5311;
const out = '.scratch/battle-royale/shots/hud';
const TIME_LIMIT = Number(process.env.TIME_LIMIT ?? 300);
mkdirSync(out, { recursive: true });
const children = [];
const start = (cmd, args, env, cwd) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'ignore', 'inherit'], shell: cmd === 'npx' });
  children.push(c);
  return c;
};
start(process.execPath, ['.scratch/battle-royale/hud/dist/serve.js'], { MODE: 'battle-royale', SQUADS: '2', TIME_LIMIT: String(TIME_LIMIT), PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist`, NO_HEAL: '1' });
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
// The spot in the circle farthest from any living bot, for Mate to wait out the match.
const quiet = async (q) => {
  const bots = (await ctl('/list')).players.filter((p) => p.alive && p.bot);
  let best = null;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const d = q.radius * (i % 2 ? 0.35 : 0.65);
    const x = q.x + Math.cos(a) * d;
    const z = q.z + Math.sin(a) * d;
    const near = Math.min(...bots.map((b) => Math.hypot(b.position[0] - x, b.position[2] - z)), 1e9);
    if (!best || near > best.near) best = { x, z, near };
  }
  return best;
};
try {
  await until('server', () => ctl('/list'), 60000, 500);
  await until('vite', () => fetch(`http://localhost:${VITE}/`).then((r) => r.ok), 60000, 500);
  chrome = await launchChrome();
  const ev = async (js) => JSON.parse((await chrome.evaluate(`JSON.stringify((() => { ${js} })())`)) ?? 'null');
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    say(`  shot ${name}`);
  };
  const phone = (on) =>
    chrome.send('Emulation.setDeviceMetricsOverride', on ? { width: 844, height: 390, deviceScaleFactor: 2, mobile: true } : { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const key = async (code, k) => {
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
  };
  // The Ring where it stands now, from the page's own copy of the match.
  const ring = () =>
    ev(`const d = duty.game.driver; const o = d?.match?.objective; if (!o || o.kind !== 'battle-royale') return null;
      const t = d.serverTime; const k = t <= o.shrinkAt ? 0 : t >= o.shrinkEnd ? 1 : (t - o.shrinkAt) / (o.shrinkEnd - o.shrinkAt);
      const l = (a, b) => a + (b - a) * k;
      return { x: l(o.circle.x, o.next.x), z: l(o.circle.z, o.next.z), radius: l(o.circle.radius, o.next.radius), stage: o.stage, t, shrinkAt: o.shrinkAt, shrinkEnd: o.shrinkEnd, alive: o.alive, squads: o.squads, phase: d.match.phase };`);
  const local = () => ev(`const p = duty.game.player; return p ? { id: p.id, alive: p.alive, yaw: p.yaw, pitch: p.pitch, position: p.position } : null;`);
  const look = async (yawWant, pitchWant = 0) => {
    for (let i = 0; i < 10; i++) {
      const me = await local();
      if (!me) return;
      const d = Math.atan2(Math.sin(yawWant - me.yaw), Math.cos(yawWant - me.yaw));
      const up = pitchWant - (me.pitch ?? 0);
      if (Math.abs(d) < 0.03 && Math.abs(up) < 0.03) return;
      await chrome.evaluate(`document.dispatchEvent(new MouseEvent('mousemove', { movementX: ${Math.round(-d * 300)}, movementY: ${Math.round(-up * 300)}, bubbles: true }))`);
      await sleep(80);
    }
  };
  const yawTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
  // Puts the browser seat `off` metres from the wall (negative: inside), along `turn` from the Ring's centre, looking along `face` ('in' or 'out').
  const stand = async (me, r, off, turn, face, pitch = 0.05) => {
    const d = r.radius + off;
    const x = r.x + Math.cos(turn) * d;
    const z = r.z + Math.sin(turn) * d;
    await ctl(`/ground?id=${me}&x=${x}&z=${z}`);
    await sleep(600);
    const yaw = face === 'in' ? yawTo([x, z], [r.x, r.z]) : yawTo([r.x, r.z], [x, z]);
    await look(yaw, pitch);
    await sleep(900);
  };
  const hudText = () => ev(`return document.querySelector('.ds-hud')?.innerText.replace(/\\s+/g, ' ').slice(0, 300) ?? '';`);
  const fps = async (ms = 2500) => {
    await sleep(ms);
    return Math.round(await chrome.evaluate(`duty.game.fps`));
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
  await ctl('/mate');
  await until('mate seated', async () => (await ctl('/list')).mate, 20000);
  await sleep(500);
  await chrome.evaluate(`__find('Start').click()`);
  const me = await until('in the match', async () => ((await ctl('/list')).phase === 'playing' ? await local() : null), 120000, 500);
  const list0 = await ctl('/list');
  const mate = list0.mate;
  await ctl(`/guard?id=${me.id}`);
  await ctl(`/guard?id=${mate}`);
  say(`playing as ${me.id}, mate ${mate} (team ${list0.players.find((p) => p.id === mate)?.team} vs ${list0.players.find((p) => p.id === me.id)?.team}); ${list0.players.length} seats`);
  await sleep(3000);
  let r = await ring();
  say(`Stage ${r.stage}: ring ${r.radius.toFixed(0)} m round (${r.x.toFixed(0)}, ${r.z.toFixed(0)}), shrinks at ${r.shrinkAt.toFixed(0)}, t ${r.t.toFixed(0)}`);
  await shot('01-start-hud');
  say(`  hud: ${await hudText()}`);

  // Stage 1, holding: the wall from far inside, near inside, and the map.
  const turn = Math.PI * 0.25;
  await stand(me.id, r, -420, turn, 'out', 0.08);
  await shot('02-stage1-far-inside-420m');
  await stand(me.id, r, -180, turn, 'out', 0.05);
  await shot('03-stage1-inside-180m');
  const nearFps = [];
  await stand(me.id, r, -12, turn, 'out', 0.1);
  nearFps.push(await fps());
  await shot('04-stage1-near-inside-12m');
  await look(yawTo([r.x + Math.cos(turn) * (r.radius - 12), r.z + Math.sin(turn) * (r.radius - 12)], [r.x, r.z]), 0.05);
  nearFps.push(await fps());
  say(`  fps 12 m from the wall: facing it ${nearFps[0]}, facing away ${nearFps[1]}`);
  await key('KeyM', 'm');
  await sleep(1200);
  await shot('05-map-desktop');
  await phone(true);
  await sleep(1500);
  await shot('06-map-phone');
  await key('KeyM', 'm');
  await sleep(800);
  await shot('07-hud-phone');
  await phone(false);
  await sleep(1000);

  // Wait for the first shrink and catch the warning.
  r = await ring();
  await until('closing', async () => {
    const q = await ring();
    return q && q.t >= q.shrinkAt - 0.2;
  }, (r.shrinkAt - r.t + 30) * 1000, 100);
  await sleep(700);
  await shot('08-ring-closing-toast');
  say(`  hud: ${await hudText()}`);

  // Through the Stages: from each, the wall from outside near and far, and the warning while outside.
  let outsideDone = false;
  let lastStage = 0;
  let placedOut = false;
  for (;;) {
    r = await ring();
    if (!r || r.phase !== 'playing') break;
    if (r.stage !== lastStage) {
      lastStage = r.stage;
      say(`Stage ${r.stage}: ring ${r.radius.toFixed(0)} m, ${r.alive} alive in ${r.squads} Squads, t ${r.t.toFixed(0)}`);
      if (r.stage >= 2 && !outsideDone) {
        outsideDone = true;
        const t2 = Math.atan2(-r.z, -r.x);
        await stand(me.id, r, 15, t2, 'in', 0.06);
        await shot(`09-stage${r.stage}-near-outside-15m`);
        say(`  hud: ${await hudText()}`);
        await phone(true);
        await sleep(1200);
        await shot(`10-stage${r.stage}-outside-phone`);
        await phone(false);
        await stand(me.id, await ring(), 140, t2, 'in', 0.04);
        await shot(`11-stage${r.stage}-outside-140m`);
        const r2 = await ring();
        await stand(me.id, r2, 350, t2, 'in', 0.03);
        await shot(`12-stage${r.stage}-far-outside-350m`);
        await stand(me.id, await ring(), -25, t2, 'in', 0);
        await shot(`13-stage${r.stage}-back-inside`);
        // Mate stands in the circle near a living bot, so there's something to watch.
      }
      await stand(me.id, await ring(), -30, Math.PI * 0.5 * r.stage, 'out', 0.04);
      await shot(`14-stage${r.stage}-wall-from-inside`);
      if (r.stage >= 4 && !placedOut) {
        // Out: unguarded and left well outside, the Ring takes the seat Downed then out.
        placedOut = true;
        const spot = await quiet(await ring());
        await ctl(`/ground?id=${mate}&x=${spot.x}&z=${spot.z}`);
        await ctl(`/guard?id=${me.id}&on=0`);
        const q = await ring();
        await stand(me.id, q, 60, Math.atan2(-q.z, -q.x) + 1, 'in', 0);
        say(`  left outside at Stage ${r.stage} to be taken by the Ring`);
        await until('out', async () => (await local())?.alive === false, 120000, 250);
        await sleep(600);
        await shot(`15-stage${r.stage}-out-placement`);
        say(`  hud: ${await hudText()}`);
        await sleep(3500);
        await shot(`16-spectating`);
        say(`  hud: ${await hudText()}`);
        await key('KeyM', 'm');
        await sleep(1000);
        await shot(`17-spectating-map`);
        await key('KeyM', 'm');
        await phone(true);
        await sleep(1200);
        await shot(`18-spectating-phone`);
        await phone(false);
      }
    }
    await sleep(500);
    // Keep Mate inside the circle.
    const q = await ring();
    if (q && placedOut && q.radius > 3) {
      const l = await ctl('/list');
      const m = l.players.find((p) => p.id === mate);
      if (m?.alive && Math.hypot(m.position[0] - q.x, m.position[2] - q.z) > q.radius - 4) {
        const spot = await quiet(q);
        await ctl(`/ground?id=${mate}&x=${spot.x}&z=${spot.z}`);
      }
    }
    if (q && q.stage === 6 && q.radius < 25 && placedOut) {
      // The last circle: let Mate's Squad go too, so the match ends on the Ring.
      await ctl(`/guard?id=${mate}&on=0`);
    }
  }
  await sleep(1500);
  await shot('19-end');
  say(`end: ${await ev(`return document.body.innerText.replace(/\\s+/g, ' ').slice(0, 400);`)}`);
  await phone(true);
  await sleep(1000);
  await shot('20-end-phone');
  say(`errors in the page: ${JSON.stringify(chrome.errors?.slice(0, 8) ?? [])}`);
} catch (e) {
  say(`FAILED: ${e.stack ?? e}`);
  say(`errors in the page: ${JSON.stringify(chrome?.errors?.slice(0, 8) ?? [])}`);
} finally {
  await chrome?.close?.();
  for (const c of children) spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
  await sleep(800);
  process.exit(0);
}
