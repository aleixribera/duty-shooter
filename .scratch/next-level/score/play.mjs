// Plays one Bot Match to its end with a player that aims and fires, and
// screenshots the Score work on the way (tickets 11, 17, 25): a kill's lines
// with a headshot, a Medal, the held scoreboard, the match end with its XP
// strip, then (in a second Chrome on the same browser profile) the main menu
// with the Rank and the Profile screen holding that match's numbers. Every
// moment is shot at 1920x1080 and, the same instant, at 390x844.
//
//   node .scratch/next-level/score/play.mjs [mode] [seconds] [out dir]
//
// Needs the dev server on :5173. MODE defaults to tdm, the match to 70 s.
// VIEW=phone plays the whole match at 390x844 and shoots only that size: the lines beside the crosshair
// are gone before a window can be resized, so each size gets its own match for them.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const MODE = process.argv[2] ?? 'tdm';
const SECONDS = Number(process.argv[3] ?? 70);
const out = process.argv[4] ?? '.scratch/next-level/score/shots';
const BASE = 'http://localhost:5173/';
const NAMES = { tdm: 'Team deathmatch', ffa: 'Free-for-all', outposts: 'Outposts', charge: 'Charge', gungame: 'Gun game' };
mkdirSync(out, { recursive: true });
// PROFILE_DIR=<dir> SKIP_MATCH=1 revisits a browser profile an earlier run left, for the menu and the Profile screen alone.
const profile = process.env.PROFILE_DIR ?? mkdtempSync(join(tmpdir(), 'duty-score-'));
console.error('browser profile', profile);

const SIZES = { desktop: [1920, 1080], phone: [390, 844] };
const PHONE = process.env.VIEW === 'phone';
const HOME = PHONE ? SIZES.phone : SIZES.desktop;

// Other sessions edit the game's source while this runs, and Vite would reload the page mid-match for each save:
// the page's hot-reload socket is replaced by one that never opens, so the page keeps the code it loaded.
const NO_HMR = `(() => { const Real = WebSocket; globalThis.WebSocket = new Proxy(Real, { construct(target, args) {
  const p = args[1]; if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
  return new target(...args); } }); })()`;

function tools(chrome) {
  const size = ([width, height]) => chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const grab = async (name) => {
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${name}.png`, Buffer.from(shot.result.data, 'base64'));
  };
  return {
    size,
    /** The same moment at both sizes: desktop first (the page is at it), then the phone, then back. */
    async both(name, settle = 350) {
      if (PHONE) return grab(`${name}-390`);
      await grab(`${name}-1920`);
      await size(SIZES.phone);
      await sleep(settle);
      await grab(`${name}-390`);
      await size(SIZES.desktop);
      await sleep(150);
    },
    /** A moment that will not wait: the size the page is at. */
    one: (name) => grab(`${name}-${HOME[0]}`),
    click: (text) =>
      chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`),
    key: (type, code, vk) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code, windowsVirtualKeyCode: vk ?? code.charCodeAt(3) }),
    mouse: (type) => chrome.send('Input.dispatchMouseEvent', { type, x: HOME[0] / 2, y: HOME[1] / 2, button: 'left', clickCount: 1 }),
  };
}

// The player: every frame, looks at the head of the nearest living enemy it has a clear line to (the page's own
// collision world says so) and asks for fire; with none in sight it turns towards the nearest and walks.
const ROOT = '/@fs/' + process.cwd().split(/[\\/]/).join('/') + '/';
const AIM = `(async () => {
  const core = await import(${JSON.stringify(ROOT + 'packages/fps-core/src/index.ts')});
  const maps = await import('/src/map/maps.ts');
  const map = duty.map;
  const world = core.createWorld(maps.mapSolids(map), { ladders: map.ladders ?? [], terrain: map.terrain });
  clearInterval(globalThis.__aim);
  globalThis.__fire = false;
  globalThis.__aim = setInterval(() => {
    const g = duty.game, d = duty.driver, me = g.player;
    if (!me || !me.alive || !d) { globalThis.__fire = false; return; }
    const team = (id) => d.scores.find((s) => s.id === id)?.team;
    const mine = team(d.selfId);
    const teams = ['tdm', 'outposts', 'charge'].includes(d.match?.mode);
    const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
    let seen = null, near = 1e9, any = null, anyNear = 1e9;
    for (const o of d.others(1)) {
      if (!o.alive || (teams && team(o.id) === mine)) continue;
      const dist = Math.hypot(o.position[0] - me.position[0], o.position[2] - me.position[2]);
      if (dist < anyNear) { anyNear = dist; any = o; }
      const head = [o.position[0], o.position[1] + o.eyeHeight - 0.03, o.position[2]];
      if (dist < near && !core.sightBlocked(world, eye, head)) { near = dist; seen = o; }
    }
    const to = seen ?? any;
    globalThis.__fire = seen !== null;
    if (!to) return;
    const dx = to.position[0] - eye[0], dz = to.position[2] - eye[2];
    const dy = to.position[1] + to.eyeHeight + 0.08 - eye[1];
    // What recoil has added to the view since the angles were last set is taken off again, so a held trigger stays on the head.
    const a = g.input.angles;
    const kickYaw = Math.atan2(Math.sin(me.yaw - a.yaw), Math.cos(me.yaw - a.yaw));
    const kickPitch = me.pitch - a.pitch;
    g.input.setAngles(Math.atan2(-dx, -dz) - (seen ? kickYaw : 0), seen ? Math.atan2(dy, Math.hypot(dx, dz)) - kickPitch : 0);
  }, 8);
  return true;
})()`;

const STATE = `(() => { try { return JSON.stringify({
  phase: duty.driver?.match?.phase ?? null,
  time: duty.driver?.serverTime ?? 0,
  lines: [...document.querySelectorAll('.ds-score .lines div')].map((e) => e.textContent),
  medal: document.querySelector('.ds-score .medal.on')?.textContent ?? null,
  total: document.querySelector('.ds-score .total.on')?.textContent ?? null,
  me: duty.driver?.scores.find((s) => s.id === duty.driver.selfId) ?? null,
  gain: document.querySelector('.ds-end .mine .rank')?.textContent ?? null,
  end: getComputedStyle(document.querySelector('.ds-end')).display,
  fire: globalThis.__fire === true,
}); } catch (e) { return JSON.stringify({ error: String(e) }); } })()`;

const report = { mode: MODE, shots: [], errors: [] };
if (!process.env.SKIP_MATCH) {
  const chrome = await launchChrome({ profile });
  const t = tools(chrome);
  try {
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
    await t.size(HOME);
    await chrome.navigate(`${BASE}?nolock&matchtime=${SECONDS}`);
    if (!(await chrome.waitFor('globalThis.duty?.game && location.protocol === "http:"', 90_000))) throw new Error('page did not start');
    await sleep(1500);
    await t.both('menu-before');
    report.shots.push('menu-before');
    const picks = ['Bot Match', 'Survival Town', NAMES[MODE], ...(MODE === 'ffa' || MODE === 'gungame' ? [] : ['Mixed teams']), 'Start'];
    for (const p of picks) {
      if (!(await t.click(p))) throw new Error(`no "${p}" button`);
      await sleep(300);
    }
    if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive`, 180_000))) throw new Error('match did not start');
    if (!(await chrome.evaluate(AIM))) throw new Error('the aiming player did not start');
    const want = { headshot: true, medal: true, lines: true, board: true };
    const started = Date.now();
    let ended = null;
    let firing = false;
    let beat = -1;
    await chrome.evaluate('globalThis.__mark = 1');
    let state = null;
    while (Date.now() - started < (SECONDS + 60) * 1000) {
      state = JSON.parse(await chrome.evaluate(STATE));
      const elapsed = (Date.now() - started) / 1000;
      if (state.error) throw new Error(`${state.error} at ${elapsed.toFixed(1)} s (page mark ${await chrome.evaluate('globalThis.__mark ?? null')}, ${await chrome.evaluate('location.href + " :: " + document.body.innerText.slice(0, 200)')})`);
      if (Math.floor(elapsed / 5) !== beat) {
        beat = Math.floor(elapsed / 5);
        console.error(elapsed.toFixed(0), state.phase, 'fire', state.fire, 'kills', state.me?.kills, 'deaths', state.me?.deaths, 'score', state.me?.score, state.lines.join(' | '));
      }
      if (state.phase === 'playing') {
        // Fire with an enemy in sight, walk on with none.
        if (state.fire !== firing) {
          firing = state.fire;
          await t.mouse(firing ? 'mousePressed' : 'mouseReleased');
          await t.key(firing ? 'keyUp' : 'keyDown', 'KeyW');
        }
        if (want.medal && state.medal) {
          await t.one('medal');
          report.medal = state.medal;
          report.shots.push('medal');
          want.medal = false;
        } else if (want.headshot && state.lines.some((l) => l.includes('Headshot'))) {
          await t.one('kill-headshot');
          report.headshot = state.lines;
          report.shots.push('kill-headshot');
          want.headshot = false;
        } else if (want.lines && state.lines.length > 0) {
          await t.one('kill');
          report.kill = state.lines;
          report.shots.push('kill');
          want.lines = false;
        } else if (want.board && elapsed > SECONDS * 0.6) {
          await t.key('keyDown', 'Tab', 9);
          await sleep(250);
          await t.both('scoreboard');
          await t.key('keyUp', 'Tab', 9);
          report.shots.push('scoreboard');
          want.board = false;
        }
      } else if (state.phase === 'nuke' || state.phase === 'vote') {
        if (ended === null) {
          ended = Date.now();
          report.me = state.me;
          await t.mouse('mouseReleased');
          await t.key('keyUp', 'KeyW');
        }
        const since = (Date.now() - ended) / 1000;
        if (!report.shots.includes('end-early') && state.end === 'block' && since > 0.9) {
          await t.both('end-early', 200);
          report.shots.push('end-early');
        } else if (!report.shots.includes('end') && state.end === 'block' && since > 4) {
          await t.both('end');
          report.gain = state.gain;
          report.shots.push('end');
        } else if (!report.shots.includes('end-vote') && state.phase === 'vote' && state.end === 'block') {
          await sleep(600);
          await t.both('end-vote');
          report.shots.push('end-vote');
          break;
        }
      } else if (ended !== null) break;
      await sleep(90);
    }
    report.final = state;
    report.stored = await chrome.evaluate(`localStorage.getItem('duty-shooter.profile.v2')`);
    // Let the page write, then leave.
    await sleep(500);
  } catch (e) {
    report.error = String(e);
  }
  report.errors.push(...chrome.errors.slice(0, 8));
  await chrome.close();
}

// A second visit on the same browser profile: the main menu with the Rank, and the Profile screen.
if (!report.error) {
  // The first Chrome may still hold the profile's lock for a moment.
  let chrome = null;
  for (let i = 0; i < 4 && !chrome; i++) {
    await sleep(2500);
    chrome = await launchChrome({ profile }).catch(() => null);
  }
  if (!chrome) throw new Error('Chrome did not start for the second visit');
  const t = tools(chrome);
  try {
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
    await t.size(HOME);
    await chrome.navigate(`${BASE}?nolock`);
    if (!(await chrome.waitFor('globalThis.duty?.game && location.protocol === "http:"', 90_000))) throw new Error('page did not start (second visit)');
    await sleep(1500);
    await t.both('menu-rank');
    report.rankLine = await chrome.evaluate(`document.querySelector('.ds-rankline')?.innerText ?? null`);
    if (!(await chrome.evaluate(`(() => { const b = document.querySelector('.ds-rankline'); if (!b) return false; b.click(); return true; })()`))) throw new Error('no Rank line on the main menu');
    await sleep(400);
    await t.both('profile');
    report.profile = await chrome.evaluate(`document.querySelector('.ds-prof')?.innerText ?? null`);
    // The phone's page scrolled to its foot, for the weapons.
    await t.size(SIZES.phone);
    await sleep(300);
    await chrome.evaluate(`document.querySelector('.ds-page > .body').scrollTo(0, 99999)`);
    await sleep(200);
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/profile-foot-390.png`, Buffer.from(shot.result.data, 'base64'));
    await t.size(HOME);
    await sleep(200);
    await t.click('Reset profile');
    await sleep(300);
    await t.both('profile-reset-ask');
    report.shots.push('menu-rank', 'profile', 'profile-reset-ask');
  } catch (e) {
    report.error = String(e);
  }
  report.errors.push(...chrome.errors.slice(0, 8));
  await chrome.close();
}
console.log(JSON.stringify(report, null, 1));
process.exit(report.error ? 1 : 0);
