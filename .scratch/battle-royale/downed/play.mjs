// Plays Downed and Revive in a real browser against the real server, Duos on
// Zero Island: Revive a bot, go Downed from real shots, crawl, get Revived by the
// bot, go Downed again, get Finished. Screenshots at each step.
//   remote-test --local "node .scratch/battle-royale/downed/play.mjs"
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const PORT = 3297;
const VITE = 5297;
const out = '.scratch/battle-royale/downed/shots';
mkdirSync(out, { recursive: true });
const children = [];
const start = (cmd, args, env, cwd) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'ignore', 'inherit'], shell: cmd === 'npx' });
  children.push(c);
  return c;
};
start(process.execPath, ['.scratch/battle-royale/downed/dist/serve.js'], { MODE: 'battle-royale', SQUADS: '2', TIME_LIMIT: '500', PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist` });
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
  await until('server', () => ctl('/list'), 60000, 500);
  await until('vite', () => fetch(`http://localhost:${VITE}/`).then((r) => r.ok), 60000, 500);
  chrome = await launchChrome();
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const key = (type, code, text) => chrome.send('Input.dispatchKeyEvent', { type, code, key: text, windowsVirtualKeyCode: text.toUpperCase().charCodeAt(0) });
  const local = async () => JSON.parse(await chrome.evaluate(`JSON.stringify((() => { const p = duty.game.player; return p ? { id: p.id, alive: p.alive, health: p.health, downed: p.downed, reviving: p.reviving, position: p.position, stance: p.stance, eye: p.eyeHeight } : null; })())`));
  const hud = () => chrome.evaluate(`JSON.stringify({ prompt: document.querySelector('.ds-prompt')?.hidden ? null : document.querySelector('.ds-prompt')?.textContent, feed: [...document.querySelectorAll('.ds-feed > div')].map((d) => d.textContent), actions: [...document.querySelectorAll('.ds-action')].filter((a) => a.style.display !== 'none').map((a) => a.textContent), label: document.querySelector('.ds-health .ds-label')?.textContent, hp: document.querySelector('.ds-health .hp')?.textContent, centre: document.querySelector('.ds-center')?.textContent })`);
  const seat = async (id) => (await ctl('/list')).players.find((p) => p.id === id);

  await chrome.navigate(`http://localhost:${VITE}/?online&nolock`);
  await sleep(2000);
  await chrome.evaluate(`globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().toLowerCase().startsWith(text.toLowerCase()))`);
  await chrome.waitFor(`!!globalThis.__find?.('Play Online')`, 60000, 100);
  await chrome.evaluate(`document.querySelector('.ds-menu input').value = 'Ada'; __find('Play Online').click()`);
  await chrome.waitFor(`!!__find('Join') || !!__find('Start')`, 60000, 100);
  await chrome.evaluate(`if (__find('Join')) { const i = document.querySelector('.ds-field input'); i.value = 'Ada'; __find('Join').click(); }`);
  if (!(await chrome.waitFor(`!!__find('Start')`, 180000, 200))) throw new Error('no lobby');
  say('lobby');
  await shot('0-lobby');
  await until('enemy seated', async () => (await ctl('/list')).enemy, 20000);
  await chrome.evaluate(`__find('Start').click()`);
  let lastLog = 0;
  const me = await until('in the match', async () => {
    const l = await ctl('/list');
    if (Date.now() - lastLog > 8000) {
      lastLog = Date.now();
      say(`phase ${l.phase}, seats ${l.players.length}: ${await chrome.evaluate(`document.body.innerText.slice(0, 120).replace(/\\s+/g, ' ')`)} / player ${JSON.stringify(await local().catch((e) => String(e)))}`);
    }
    return l.phase === 'playing' ? await local() : null;
  }, 120000, 500);
  say(`playing as ${me.id}`);
  await until('alive', async () => (await local())?.alive, 20000);
  await sleep(6000);
  let list = await ctl('/list');
  const mine = list.players.find((p) => p.id === me.id);
  const mate = list.players.find((p) => p.team === mine.team && p.id !== me.id);
  const enemyId = list.enemy;
  say(`seats ${list.players.length}, Squad ${mine.team}, mate ${mate.name} (bot ${mate.bot}), enemy team ${list.players.find((p) => p.id === enemyId).team}`);
  const near = (at, dx, dz, up = 0.6) => `x=${at[0] + dx}&y=${at[1] + up}&z=${at[2] + dz}`;
  // Back to its own spawn: the sea or a long fall would end the run.
  const home = list.players.find((p) => p.id === enemyId).position;
  const away = () => near(home, 0, 0, 0.3);

  // Revive the bot: put it Downed at the player's feet, take the prompt, hold Use.
  await ctl(`/place?id=${mate.id}&${near(mine.position, 1.2, -1.2)}`);
  await sleep(600);
  await ctl(`/down?id=${mate.id}`);
  await until('prompt', async () => JSON.parse(await hud()).prompt, 5000, 100).catch(async (e) => {
    say(`no prompt: me ${JSON.stringify(await seat(me.id))} mate ${JSON.stringify(await seat(mate.id))} client ${await chrome.evaluate(`JSON.stringify((duty.driver.latest?.players ?? duty.driver.snapshot?.players ?? []).filter?.((p) => p.id === '${mate.id}'))`)} keys ${await chrome.evaluate(`Object.keys(duty.driver).join() + ' / ' + Object.getOwnPropertyNames(Object.getPrototypeOf(duty.driver)).join()`)}`);
    throw e;
  });
  say(`HUD with the mate Downed: ${await hud()}`);
  await shot('1-prompt');
  await key('keyDown', 'KeyF', 'f');
  await until('Reviving', async () => (await local()).reviving !== null, 3000, 50);
  await sleep(2500);
  say(`Reviving: ${await hud()} ${JSON.stringify(await local())}`);
  await shot('2-reviving');
  await until('mate up', async () => !(await seat(mate.id)).downed, 5000, 100).catch(async (e) => {
    say(`no mate up: me ${JSON.stringify(await seat(me.id))} mate ${JSON.stringify(await seat(mate.id))}; ${await hud()}`);
    throw e;
  });
  await key('keyUp', 'KeyF', 'f');
  results.revivedBot = (await seat(mate.id)).health;
  say(`mate up at ${results.revivedBot} HP; feed ${await hud()}`);

  // Downed by real shots.
  list = await ctl('/list');
  const here = list.players.find((p) => p.id === me.id).position;
  await ctl(`/place?id=${enemyId}&${near(here, 5, 0)}`);
  await ctl(`/fire?at=${me.id}`);
  await until('Downed', async () => (await local())?.downed, 40000, 50);
  say('Downed by shots');
  await ctl('/fire?at=');
  await ctl(`/place?id=${enemyId}&${away()}`);
  await ctl(`/guard?id=${mate.id}`);
  await ctl(`/place?id=${mate.id}&${near(here, -6, 5, 0.3)}`);
  await sleep(900);
  say(`Downed: ${await hud()} ${JSON.stringify(await local())}`);
  await shot('3-downed');
  // Crawl.
  const from = (await local()).position;
  const t0 = Date.now();
  await key('keyDown', 'KeyW', 'w');
  await sleep(1500);
  say(`crawling: ${JSON.stringify(await chrome.evaluate(`JSON.stringify((() => { const p = duty.game.player; return { v: p.velocity, m: p.movement, stance: p.stance }; })())`))} server ${JSON.stringify(await seat(me.id))}`);
  await sleep(1500);
  await key('keyUp', 'KeyW', 'w');
  const to = (await local()).position;
  const moved = Math.hypot(to[0] - from[0], to[2] - from[2]);
  say(`crawled ${moved.toFixed(2)} m in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await shot('4-crawl');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(700);
  await shot('5-downed-phone-tall');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await sleep(700);
  await shot('5-downed-phone-wide');
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await sleep(500);
  // The bot walks over and Revives.
  await until('Revive under way', async () => (await local())?.downed?.revive > 0, 40000, 100).catch(async (error) => {
    say(`no Revive coming: ${JSON.stringify(await seat(mate.id))} ${JSON.stringify(await local())}`);
    throw error;
  });
  await sleep(1500);
  say(`being Revived: ${await hud()}`);
  await shot('6-being-revived');
  await until('Revived', async () => !(await local())?.downed, 8000, 100);
  await sleep(300);
  const back = await local();
  results.revived = back.health;
  say(`Revived at ${back.health} HP, stance ${back.stance}; ${await hud()}`);
  await shot('7-revived');

  // Downed again and Finished, with the mate sent off.
  await sleep(2000);
  const spot = (await seat(me.id)).position;
  await ctl(`/place?id=${mate.id}&${near(spot, -7, -6, 0.3)}`);
  await ctl(`/place?id=${enemyId}&${near(spot, 0, 5)}`);
  await ctl(`/fire?at=${me.id}`);
  await until('Downed again', async () => (await local())?.downed, 40000, 50);
  say(`Downed again ${JSON.stringify((await local()).downed)}`);
  await sleep(200);
  await shot('8-downed-again');
  await until('Finished', async () => (await local())?.alive === false, 30000, 50);
  await ctl('/fire?at=');
  await sleep(500);
  say(`Finished: ${await hud()}`);
  await shot('9-finished');
  if (chrome.errors.length) say(`console errors:\n${chrome.errors.slice(0, 8).join('\n')}`);
  console.log('PLAY OK', JSON.stringify(results));
} catch (error) {
  say(`FAILED: ${error.message}`);
  if (chrome) say(`console: ${chrome.errors.slice(0, 8).join(' | ')}`);
  if (chrome) await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }).then((s) => writeFileSync(`${out}/failed.jpg`, Buffer.from(s.result.data, 'base64'))).catch(() => {});
  process.exitCode = 1;
} finally {
  await chrome?.close().catch(() => {});
  for (const c of children) c.kill('SIGTERM');
  for (const line of execSync('netstat -ano').toString().split('\n')) {
    if (line.includes(`:${VITE}`) && line.includes('LISTENING')) {
      try {
        execSync(`taskkill /F /T /PID ${line.trim().split(/\s+/).at(-1)}`, { stdio: 'ignore' });
      } catch {}
    }
  }
  process.exit();
}
