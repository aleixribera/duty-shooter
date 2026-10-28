// Plays a Bot Match of every mode on both maps, plus humans vs bots, each
// started through the menu in a fresh headless Chrome, and checks it runs:
// the match clock moves every 5 s (no stall), the page logs no errors, and
// bot-only matches get kills. Prints one JSON line per run and saves a
// screenshot of each into the output directory. Needs the dev server.
//
//   node apps/range/scripts/bot-runs.mjs <out dir> [seconds] [base url]
//
// ONLY=map/mode[/hvb],... runs some of them (e.g. ONLY=switchyard/charge/hvb).
// MOVE=1 has the player walk and fire. Without it, kills are expected only
// where bots fight bots: in humans vs bots they find a player who stands
// still only by chance, and in Charge the attackers escort the carrier,
// which is often the idle player.
//
// One page per Chrome: a second navigation in the same browser can hang at
// "Starting renderer". Editing the game's source while this runs makes Vite
// reload the page and fails the run under way.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from './chrome.mjs';

const out = process.argv[2];
if (!out) {
  console.error('usage: node bot-runs.mjs <out dir> [seconds] [base url]');
  process.exit(2);
}
const SECONDS = Number(process.argv[3] ?? 90);
const BASE = process.argv[4] ?? 'http://localhost:5173/';
const MOVE = process.env.MOVE === '1';
const NAMES = { 'survival-town': 'Survival Town', switchyard: 'Switchyard', tdm: 'Team deathmatch', ffa: 'Free-for-all', outposts: 'Outposts', charge: 'Charge', gungame: 'Gun game' };
mkdirSync(out, { recursive: true });

const runs = [];
for (const map of ['survival-town', 'switchyard']) for (const mode of ['tdm', 'ffa', 'outposts', 'charge', 'gungame']) runs.push({ map, mode, hvb: false });
for (const map of ['survival-town', 'switchyard']) for (const mode of ['tdm', 'outposts', 'charge']) runs.push({ map, mode, hvb: true });
const only = process.env.ONLY?.split(',');
const chosen = only ? runs.filter((r) => only.includes(`${r.map}/${r.mode}${r.hvb ? '/hvb' : ''}`)) : runs;

let failed = 0;
for (const run of chosen) {
  const chrome = await launchChrome();
  const result = { ...run, ok: false };
  try {
    const click = (text) =>
      chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
    const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: code.charCodeAt(3) });
    const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', clickCount: 1 });
    await chrome.navigate(`${BASE}?nolock`);
    if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
    await sleep(1000);
    const picks = ['Bot Match', NAMES[run.map], NAMES[run.mode], ...(run.mode === 'ffa' || run.mode === 'gungame' ? [] : [run.hvb ? 'Humans vs bots' : 'Mixed teams']), 'Start'];
    for (const p of picks) {
      if (!(await click(p))) throw new Error(`no "${p}" button`);
      await sleep(300);
    }
    if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
    if (MOVE) await key('keyDown', 'KeyW');
    const samples = [];
    let stalls = 0;
    let last = -1;
    for (let t = 0; t < SECONDS; t += 5) {
      if (MOVE) {
        // A strafe and a burst every 5 s, so the player wanders into the fight.
        const side = t % 10 === 0 ? 'KeyA' : 'KeyD';
        await key('keyDown', side);
        await mouse('mousePressed');
        await sleep(1200);
        await mouse('mouseReleased');
        await key('keyUp', side);
        await sleep(3800);
      } else await sleep(5000);
      const s = JSON.parse(
        await chrome.evaluate(
          `JSON.stringify({ time: duty.driver.serverTime, phase: duty.driver.match?.phase, map: duty.driver.match?.map, kills: duty.driver.scores.reduce((n, s) => n + s.kills, 0), players: duty.driver.scores.length, fps: Math.round(duty.game.fps) })`,
        ),
      );
      if (s.time <= last) stalls += 1;
      last = s.time;
      samples.push(s);
      if (t === Math.min(60, SECONDS - 5)) {
        const shot = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
        writeFileSync(`${out}/${run.map}-${run.mode}${run.hvb ? '-hvb' : ''}.jpg`, Buffer.from(shot.result.data, 'base64'));
      }
    }
    const end = samples.at(-1);
    const teams = JSON.parse(await chrome.evaluate(`JSON.stringify(duty.driver.scores.map((s) => (s.bot ? 'bot' : 'you') + s.team))`));
    const needKills = MOVE || (!run.hvb && run.mode !== 'charge');
    Object.assign(result, {
      ok: stalls === 0 && end.map === run.map && (!needKills || end.kills > 0),
      stalls,
      kills: end.kills,
      players: end.players,
      phases: [...new Set(samples.map((s) => s.phase))],
      minFps: Math.min(...samples.map((s) => s.fps)),
      teams,
    });
  } catch (e) {
    result.error = String(e);
  }
  result.errors = chrome.errors.slice(0, 5);
  if (result.errors.length) result.ok = false;
  if (!result.ok) failed += 1;
  console.log(JSON.stringify(result));
  await chrome.close();
}
console.log(`${chosen.length - failed} of ${chosen.length} runs ok`);
process.exit(failed ? 1 : 0);
