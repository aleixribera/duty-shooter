// Ticket 32's play-through: spectating a real Battle Royale on Zero Island against the
// real server and its bots, in a real browser: put out, watch the Squad, step next and
// previous (mouse, then a controller), through their eyes, a far bot's surroundings sent,
// the automatic switch when the watched one is put out and who did it, and a late arrival.
//   remote-test --local "node .scratch/battle-royale/spectate/play.mjs"
// Uses the Preparation harness (build it first: cd .scratch/battle-royale/prep && npx vite build -c vite.harness.ts).
// Shots go to .scratch/battle-royale/shots/spectate/.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const PORT = 3331;
const VITE = 5331;
const out = '.scratch/battle-royale/shots/spectate';
mkdirSync(out, { recursive: true });
const children = [];
const start = (args, env, cwd) => {
  const c = spawn(process.execPath, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'ignore', 'inherit'] });
  children.push(c);
  return c;
};
start(['.scratch/battle-royale/prep/dist/serve.js'], { MODE: 'battle-royale', SQUADS: '2', TIME_LIMIT: '600', PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist`, NO_HEAL: '1' });
start([`${process.cwd()}/node_modules/vite/bin/vite.js`, '--port', String(VITE), '--strictPort'], { DUTY_SERVER: `http://127.0.0.1:${PORT}` }, 'apps/range');
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
let failed = false;
const check = (what, ok) => {
  say(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
};
const browsers = [];

/** A page in its own browser, joined to the server as `name`. */
async function page(name) {
  const chrome = await launchChrome();
  browsers.push(chrome);
  const ev = async (js) => JSON.parse((await chrome.evaluate(`JSON.stringify((() => { ${js} })())`)) ?? 'null');
  await chrome.navigate(`http://localhost:${VITE}/?online&nolock`);
  await until('page', async () => (await chrome.evaluate('location.protocol')) === 'http:', 30000, 100);
  await chrome.evaluate(`addEventListener('error', (e) => (globalThis.__errors ??= []).push(String(e.message)))`);
  await chrome.evaluate(`globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().startsWith(text))`);
  await chrome.waitFor(`!!globalThis.__find?.('Play Online')`, 60000, 100);
  await chrome.evaluate(`document.querySelector('.ds-menu input').value = ${JSON.stringify(name)}; __find('Play Online').click()`);
  await chrome.waitFor(`!!__find('Join') || !!document.querySelector('[data-act="start"]') || !!duty.game.driver`, 60000, 100);
  await chrome.evaluate(`if (__find('Join')) { const i = document.querySelector('.ds-field input'); i.value = ${JSON.stringify(name)}; __find('Join').click(); }`);
  const shot = async (file) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`${out}/${file}.jpg`, Buffer.from(s.result.data, 'base64'));
    say(`  shot ${file}`);
  };
  const size = (w, h, mobile = false) => chrome.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  const panel = () =>
    ev(`const el = document.querySelector('.ds-spec:not([hidden])'); const g = duty.game; return { text: el?.innerText.replace(/\\s+/g, ' ') ?? null, alive: g.player?.alive ?? null, others: g.driver?.others(1).map((p) => ({ id: p.id, position: p.position, alive: p.alive })) ?? [], cross: getComputedStyle(document.querySelector('.ds-cross')).opacity };`);
  const click = (button) => chrome.evaluate(`document.dispatchEvent(new MouseEvent('mousedown', { button: ${button} })); document.dispatchEvent(new MouseEvent('mouseup', { button: ${button} }))`);
  const key = (code) => chrome.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}' })); document.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}' }))`);
  return { chrome, ev, shot, size, panel, click, key };
}

/** Enemy shoots `id` from beside them, trying another side when a bump of ground is in the way, until they are hit. */
async function shootAt(id, enemy) {
  for (const [dx, dz] of [[2.5, 0], [0, 2.5], [-2.5, 0], [0, -2.5], [7, 0], [0, 7], [-7, 0], [0, -7]]) {
    const t = (await ctl('/list')).players.find((q) => q.id === id);
    await ctl(`/ground?id=${enemy}&x=${t.position[0] + dx}&z=${t.position[2] + dz}`);
    await ctl(`/fire?at=${id}`);
    const hit = await until('hit', async () => {
      const q = (await ctl('/list')).players.find((x) => x.id === id);
      return !q.alive || q.downed || q.health < 100;
    }, 5000, 150).catch(() => false);
    if (hit) return;
    const l = await ctl('/list');
    say(`  no hit from ${dx},${dz}: target ${JSON.stringify(l.players.find((x) => x.id === id)?.position)} enemy ${JSON.stringify(l.players.find((x) => x.id === enemy))}`);
    await ctl('/fire?at=none');
  }
  throw new Error('no clear shot');
}

const watching = (p) => /Watching(?: \d+ \/ \d+)? (.+?)(?: Bot)? \d+ (?:Health|Downed)/i.exec(p.text ?? '')?.[1]?.toUpperCase() ?? null;

try {
  await until('server', () => ctl('/list'), 90000, 500);
  await until('vite', () => fetch(`http://localhost:${VITE}/`).then((r) => r.ok), 60000, 500);
  const ada = await page('Ada');
  if (!(await ada.chrome.waitFor(`!!document.querySelector('[data-act="start"]')`, 180000, 200))) throw new Error('no lobby');
  await until('enemy seated', async () => (await ctl('/list')).enemy, 20000);
  await ctl('/mate');
  await until('mate seated', async () => (await ctl('/list')).mate, 20000);
  await sleep(500);
  await ada.chrome.evaluate(`document.querySelector('[data-act="start"]').click()`);
  await until('preparation', () => ada.ev(`return duty.game.preparation`), 60000, 100);
  await ctl('/mate-say?t=loaded');
  await ctl('/mate-say?t=ready');
  await ctl('/all-say?t=ready');
  await ada.chrome.evaluate(`__find('Ready').click()`);
  await until('dropped', async () => (await ada.ev(`return duty.game.preparation === null && duty.game.player?.alive === true && !document.querySelector('.ds-prep:not([hidden])')`)) === true, 30000, 100);
  // Wait for Ada to land from the dive, then stand her and Enemy side by side.
  await until('Ada landed', async () => {
    const a = (await ctl('/list')).players.find((p) => p.name === 'Ada');
    return a && Math.abs(a.velocity[1]) < 0.5 && a.movement !== 'airborne' && a.movement !== 'dive' ? a : null;
  }, 60000, 400).catch(() => null);
  {
    const a = (await ctl('/list')).players.find((p) => p.name === 'Ada');
    await ctl(`/ground?id=${a.id}&x=${a.position[0]}&z=${a.position[2]}`);
  }
  await sleep(600);
  const list0 = await ctl('/list');
  const me = list0.players.find((p) => p.name === 'Ada');
  say(`  Ada at ${me.position.map((v) => v.toFixed(1))} ${me.movement}`);
  const mate = list0.mate;
  const enemy = list0.enemy;
  await ctl(`/guard?id=${mate}`);
  await ctl(`/guard?id=${enemy}`);
  // Enemy puts Ada out: down, then finished.
  await shootAt(me.id, enemy);
  await until('Ada out', async () => (await ctl('/list')).players.find((p) => p.id === me.id)?.alive === false, 40000, 200).catch(async (e) => {
    const l = await ctl('/list');
    say(`  Ada ${JSON.stringify(l.players.find((p) => p.id === me.id))}\n  Enemy ${JSON.stringify(l.players.find((p) => p.id === enemy))}`);
    throw e;
  });
  await ctl('/fire?at=none');
  await sleep(1500);
  let p = await until('panel', async () => {
    const v = await ada.panel();
    return v.text ? v : null;
  }, 10000, 100);
  say(`  panel: ${p.text}`);
  check('out, the panel says who you watch: your Squad first', watching(p) === 'MATE');
  check('with their health, weapon and Squad (you, Out)', /\d+ Health/.test(p.text) && /M4A1|Wasp 9|Harrow 12|Ridgeline \.308|Warden 9/i.test(p.text) && /Squad You ?Out/i.test(p.text));
  check('and the keys: RMB Previous, LMB Next, Space Their view', /RMB Previous/i.test(p.text) && /LMB Next/i.test(p.text) && /Space Their view/i.test(p.text));
  await ada.shot('01-follow-mate');

  await ada.click(0);
  await sleep(500);
  p = await ada.panel();
  const second = watching(p);
  check(`Next (left click) steps on: ${second}, ${/2 \/ \d+/.exec(p.text)?.[0]}`, second !== null && second !== 'MATE' && /Watching 2 \/ \d+/i.test(p.text));
  await ada.click(2);
  await sleep(400);
  check('Previous (right click) steps back to Mate', watching(await ada.panel()) === 'MATE');
  // Filler and Enemy are scripts: on until a bot.
  for (let i = 0; i < 8 && !/ Bot /i.test(p.text ?? ''); i++) {
    await ada.click(0);
    await sleep(400);
    p = await ada.panel();
  }
  check(`a bot is watched like anyone, and marked Bot (${watching(p)})`, / Bot /i.test(p.text));
  await ada.shot('02-next-bot');

  // A far bot: step until the one watched stands far from where Ada fell, then look at what is sent.
  let far = null;
  for (let i = 0; i < 70 && !far; i++) {
    await ada.click(0);
    await sleep(120);
    const v = await ada.panel();
    const name = watching(v);
    const l = await ctl('/list');
    const w = l.players.find((q) => q.name?.toUpperCase() === name);
    if (w && w.alive && flat(w.position, me.position) > 350) far = w;
  }
  check(`stepped to someone far from where Ada fell (${far?.name}, ${far ? Math.round(flat(far.position, me.position)) : '-'} m)`, far !== null);
  if (far) {
    await sleep(2500);
    const l = await ctl('/list');
    const w = l.players.find((q) => q.id === far.id);
    const near = l.players.filter((q) => q.alive && q.id !== w.id && q.id !== me.id && flat(q.position, w.position) < 50).map((q) => q.id);
    const byAda = l.players.filter((q) => q.alive && q.team !== me.team && flat(q.position, me.position) < 50 && flat(q.position, w.position) > 300).map((q) => q.id);
    const got = new Set((await ada.panel()).others.map((q) => q.id));
    say(`  near ${w.name}: ${near.length} seats, ${near.filter((id) => got.has(id)).length} on Ada's page; enemies where Ada fell: ${byAda.length}, ${byAda.filter((id) => got.has(id)).length} on her page`);
    check("the watched one's surroundings are sent, not Ada's", near.every((id) => got.has(id)) && got.has(w.id) && byAda.length > 0 && byAda.every((id) => !got.has(id)));
    await ada.shot('03-far-follow');
    await ada.key('Space');
    await sleep(700);
    p = await ada.panel();
    const them = await ada.ev(`const id = duty.game.driver.others(1).find((q) => q.id === ${JSON.stringify(far.id)}); return id && { movement: id.movement, ads: id.weapon.ads, downed: id.downed !== null, action: id.weapon.action };`);
    const hides = them && (them.movement === 'sprint' || them.movement === 'tacticalSprint' || them.ads > 0.35 || them.downed || them.action === 'inspect');
    say(`  eyes: crosshair opacity ${p.cross}, they: ${JSON.stringify(them)}`);
    check('Space: through their eyes, the crosshair theirs (hidden as theirs is when they sprint or aim), the key now says Follow', /Space Follow/i.test(p.text) && (Number(p.cross) > 0) === !hides);
    await ada.shot('04-far-eyes');
    await ada.size(390, 844, true);
    await sleep(800);
    await ada.shot('05-eyes-phone');
    await ada.size(1920, 1080);
    await ada.key('Space');
    await sleep(300);
  }

  // A controller: RT steps on, LT back.
  await ada.chrome.evaluate(`(() => {
    const pad = { id: 'Fake pad (STANDARD GAMEPAD)', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    globalThis.__pad = pad;
    navigator.getGamepads = () => [pad];
  })()`);
  const pad = async (i) => {
    await ada.chrome.evaluate(`__pad.buttons[${i}] = { pressed: true, value: 1 }`);
    await sleep(150);
    await ada.chrome.evaluate(`__pad.buttons[${i}] = { pressed: false, value: 0 }`);
    await sleep(250);
  };
  // Back to Mate first, on the pad.
  const before = watching(await ada.panel());
  await pad(7);
  p = await ada.panel();
  check(`RT on a controller steps on (${before} to ${watching(p)}), the hints in pad glyphs`, watching(p) !== before && /RT Next/i.test(p.text) && /LT Previous/i.test(p.text));
  await pad(6);
  check('LT steps back', watching(await ada.panel()) === before);
  for (let i = 0; i < 70 && watching(await ada.panel()) !== 'MATE'; i++) {
    await pad(6);
    if (i % 8 === 0) say(`  LT x${i + 1}: ${(await ada.panel()).text?.slice(0, 40)}`);
  }
  check('back on Mate', watching(await ada.panel()) === 'MATE');
  await ada.shot('06-pad');

  // The one watched is put out: the view moves on by itself, and says who did it.
  // Watch a bot in a fight and let the match do it.
  let notice = null;
  let victim = null;
  for (let round = 0; round < 8 && !notice; round++) {
    const l = await ctl('/list');
    const fighting = l.players.filter((q) => q.alive && q.bot && q.act === 'fight').sort((a, b) => a.health - b.health);
    if (!fighting.length) {
      await sleep(3000);
      continue;
    }
    const want = fighting[0].name.toUpperCase();
    for (let i = 0; i < 70 && watching(await ada.panel()) !== want; i++) {
      await ada.click(0);
      await sleep(100);
    }
    victim = want;
    say(`  watching ${want}, in a fight at ${Math.round(fighting[0].health)} HP`);
    const pattern = new RegExp(`${want} was eliminated by|${want} is out`, 'i');
    notice = await until('moved on', async () => {
      const v = await ada.panel();
      return v.text && pattern.test(v.text) ? v : null;
    }, 40000, 100).catch(() => null);
  }
  say(`  panel: ${notice?.text}`);
  check(`${victim} put out while watched: it moves on by itself (to ${notice && watching(notice)}) and says who did it`, notice !== null && /was eliminated by \S+/i.test(notice.text) && watching(notice) !== victim);
  await ada.shot('07-notice');
  await ada.size(390, 844, true);
  await sleep(600);
  await ada.shot('08-notice-phone');
  await ada.size(1920, 1080);

  // A late arrival spectates the match it came in on.
  const late = await page('Late');
  const lp = await until('late arrival watches', async () => {
    const v = await late.panel();
    return v.text ? v : null;
  }, 90000, 300);
  say(`  late: ${lp.text}`);
  check('a late arrival gets the panel and someone to watch', watching(lp) !== null && /LMB Next/i.test(lp.text));
  await late.click(0);
  await sleep(500);
  check('and steps through the match', watching(await late.panel()) !== watching(lp));
  await late.shot('09-late');
  for (const b of [ada, late]) {
    const errs = await b.ev(`return globalThis.__errors ?? []`);
    check(`no page errors (${errs.join(' | ')})`, errs.length === 0);
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  for (const c of children) c.kill();
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
}
