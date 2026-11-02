// Ticket 14's play-through: a real Battle Royale's Preparation on Zero Island against
// the real server and its bots, in a real browser: the island, the Squad, the picker,
// Ready (early end) or the full clock (FULL=1), the dive, and control at the end.
//   remote-test --local "node .scratch/battle-royale/prep/play.mjs"
// Build the harness first: cd .scratch/battle-royale/prep && npx vite build -c vite.harness.ts
// Shots go to .scratch/battle-royale/shots/prep/.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const PORT = 3321;
const VITE = 5321;
const FULL = process.env.FULL === '1';
const out = `.scratch/battle-royale/shots/prep${process.env.SHOTS ? `-${process.env.SHOTS}` : ''}`;
mkdirSync(out, { recursive: true });
const children = [];
const start = (cmd, args, env, cwd) => {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'ignore', 'inherit'], });
  children.push(c);
  return c;
};
start(process.execPath, ['.scratch/battle-royale/prep/dist/serve.js'], { MODE: 'battle-royale', SQUADS: '2', TIME_LIMIT: '300', PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist`, NO_HEAL: '1' });
start(process.execPath, [`${process.cwd()}/node_modules/vite/bin/vite.js`, '--port', String(VITE), '--strictPort'], { DUTY_SERVER: `http://127.0.0.1:${PORT}` }, 'apps/range');
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
let failed = false;
const check = (what, ok) => {
  say(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
};
try {
  await until('server', () => ctl('/list'), 90000, 500);
  await until('vite', () => fetch(`http://localhost:${VITE}/`).then((r) => r.ok), 60000, 500);
  chrome = await launchChrome();
  const errors = [];
  const ev = async (js) => JSON.parse((await chrome.evaluate(`JSON.stringify((() => { ${js} })())`)) ?? 'null');
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    say(`  shot ${name}`);
  };
  const size = (w, h, mobile = false) => chrome.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await size(1920, 1080);
  const prep = () => ev(`const t = duty.game.preparation; const m = duty.game.driver?.match; return { t, prep: m?.preparation ?? null, phase: m?.phase, open: !!document.querySelector('.ds-prep:not([hidden])'), text: document.querySelector('.ds-prep:not([hidden])')?.innerText.replace(/\\s+/g, ' ').slice(0, 400) ?? '', paused: duty.game.paused, hud: getComputedStyle(document.querySelector('.ds-hud') ?? document.body).display };`);
  const waitPrep = (name, test, ms = 30000) => until(name, async () => {
    const p = await prep();
    return test(p) ? p : null;
  }, ms, 50);

  await chrome.navigate(`http://localhost:${VITE}/?online&nolock`);
  await until('page', async () => (await chrome.evaluate('location.protocol')) === 'http:', 30000, 100);
  await chrome.evaluate(`addEventListener('error', (e) => (globalThis.__errors ??= []).push(String(e.message)))`);
  await chrome.evaluate(`globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().startsWith(text))`);
  await chrome.waitFor(`!!globalThis.__find?.('Play Online')`, 60000, 100);
  await chrome.evaluate(`document.querySelector('.ds-menu input').value = 'Ada'; __find('Play Online').click()`);
  await chrome.waitFor(`!!__find('Join') || !!document.querySelector('[data-act="start"]')`, 60000, 100);
  await chrome.evaluate(`if (__find('Join')) { const i = document.querySelector('.ds-field input'); i.value = 'Ada'; __find('Join').click(); }`);
  if (!(await chrome.waitFor(`!!document.querySelector('[data-act="start"]')`, 180000, 200))) throw new Error('no lobby');
  await until('enemy seated', async () => (await ctl('/list')).enemy, 20000);
  await ctl('/mate');
  await until('mate seated', async () => (await ctl('/list')).mate, 20000);
  await sleep(500);
  await chrome.evaluate(`document.querySelector('[data-act="start"]').click()`);
  const p0 = await waitPrep('preparation opens', (p) => p.t !== null && p.open, 60000).catch(async (e) => {
    say(`state: ${JSON.stringify(await prep())} ${JSON.stringify(await ctl('/prep'))}`);
    throw e;
  });
  say(`Preparation: ${JSON.stringify(p0.prep)} ${p0.t.stage} left ${p0.t.left.toFixed(1)}`);
  check('the Preparation opens over the game, the lobby page gone', p0.open && !(await ev(`return !!document.querySelector('.ds-royale:not([hidden])')`)));
  check('it runs about 20 s', p0.t.left > 18 && p0.t.left <= 20.2);
  await ctl('/mate-say?t=loaded');
  await sleep(300);
  await shot('01-veil-0s');
  await waitPrep('island', (p) => p.t?.elapsed >= 2.5);
  await shot('02-island-igniting-2s');
  await waitPrep('island lit', (p) => p.t?.elapsed >= 5.5);
  await shot('03-island-lit-5s');
  const island = await prep();
  check('"60 Alive" held on screen', /60 ALIVE/i.test(island.text));
  // A pick: the SMG, through the page's own button.
  await chrome.evaluate(`document.querySelector('.ds-prep [data-key="primary-smg"]').click()`);
  await waitPrep('squad', (p) => p.t?.stage === 'squad' && p.t.elapsed >= 9);
  await shot('04-squad-9s');
  {
    const l = await ctl('/list');
    const me = l.players.find((p) => p.name === 'Ada');
    const mate = l.players.find((p) => p.id === l.mate);
    say(`  squad: Ada ${JSON.stringify(me?.position)} team ${me?.team}, Mate ${JSON.stringify(mate?.position)} team ${mate?.team}; others seen ${await ev(`return duty.game.driver.players?.length ?? -1`)}`);
  }
  await size(390, 844, true);
  await sleep(700);
  await shot('05-squad-phone-390');
  await size(1920, 1080);
  await sleep(500);
  const seatLoadout = await ev(`return duty.game.player?.loadout ?? null`);
  check(`the pick reaches the seat (${JSON.stringify(seatLoadout)})`, seatLoadout?.primary === 'smg');
  if (!FULL) {
    await chrome.evaluate(`__find('Ready').click()`);
    await sleep(400);
    const waiting = await prep();
    say(`  after Ready: ${waiting.text}`);
    check('Ready waits for the rest', /waiting for 3 more/i.test(waiting.text) && /Ada Ready Mate Choosing/.test(waiting.text));
    await shot('06-ready-waiting');
    await ctl('/all-say?t=ready');
    await sleep(500);
    check('one more Ready still waits', (await prep()).t?.stage === 'squad');
    await ctl('/mate-say?t=ready');
    const d = await waitPrep('dive', (p) => p.t?.stage === 'dive', 5000);
    check(`everyone ready brings the dive at once (at ${d.t.elapsed.toFixed(1)} s, ${d.t.left.toFixed(1)} s left)`, d.t.elapsed < 14 && d.t.left > 4);
  }
  await waitPrep('dive 1', (p) => p.t?.stage === 'dive' && p.t.dive >= 0.2, 25000);
  await shot('07-dive-early');
  await waitPrep('dive 2', (p) => p.t?.stage === 'dive' && p.t.dive >= 0.55, 5000);
  await shot('08-dive-mid');
  await waitPrep('dive 3', (p) => p.t?.stage === 'dive' && p.t.dive >= 0.9, 5000);
  await shot('09-dive-landing');
  const played = await waitPrep('play', (p) => p.t === null && !p.open, 8000);
  await sleep(600);
  await shot('10-control');
  check('control snaps: the page goes, the HUD is back, input on', !played.open && !played.paused);
  const pose = await ev(`const c = duty.game.player; return c ? { yaw: c.yaw, pos: c.position, alive: c.alive } : null`);
  check(`alive at the spawn (${JSON.stringify(pose)})`, pose?.alive === true);
  const list = await ctl('/list');
  check('Mate is still a person (not held by a bot)', list.players.find((p) => p.id === list.mate)?.bot === false);
  const errs = await ev(`return globalThis.__errors ?? []`);
  check(`no page errors (${errs.join(' | ')})`, errs.length === 0);
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await chrome?.close().catch(() => {});
  for (const c of children) c.kill();
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
}
