// A whole Bot Match heard through the sound system's own state: does the score change scene at
// the right moments, do the countdown's siren and counter start with the last minute, do the
// voices stay under the cap, and what does the audio cost the main thread? Headless and muted.
// Needs the dev server.
//
//   node .scratch/next-level/audio/bot-match.mjs [match seconds] [base url]
//
// Writes bot-match.md and bot-match.json beside this script. Editing the game's source while it
// runs reloads the page and fails the run: run it again.
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const MATCH = Number(process.argv[2] ?? 75);
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const out = (name) => new URL(`./${name}`, import.meta.url);
const f = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '-');

const chrome = await launchChrome();
const report = { match: MATCH, checks: [], transitions: [], cues: {}, errors: [] };
const check = (name, ok, detail) => {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
};
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const music = () => js('duty.sound.state.music');
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);

try {
  // Other sessions edit the source while this runs, and a hot reload would end the run: this page takes no word from Vite.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate(`${BASE}?nolock&matchtime=${MATCH}`);
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.sound', 90_000))) throw new Error('page did not start');
  await sleep(1500);

  // Before any click or key: the browser has not allowed audio, and nothing may sound.
  const locked = await js('({ unlocked: duty.sound.state.unlocked, music: duty.sound.state.music, visible: document.visibilityState })');
  check('silent until audio is allowed', locked.unlocked === false && locked.music.sounding === 'silence' && locked.music.sources === 0, `unlocked ${locked.unlocked}, asked for '${locked.music.scene}', sounding '${locked.music.sounding}', ${locked.music.sources} sources (page ${locked.visible})`);

  // The audio calls the game makes each frame, timed where they are made.
  await chrome.evaluate(`(() => {
    const cost = (globalThis.__audioCost = { play: { calls: 0, ms: 0, worst: 0 }, frame: { calls: 0, ms: 0, worst: 0 }, slow: [] });
    const wrap = (obj, name, into) => {
      const real = obj[name];
      obj[name] = function (...args) {
        const t0 = performance.now();
        try { return real.apply(this, args); } finally {
          const ms = performance.now() - t0;
          into.calls++; into.ms += ms; if (ms > into.worst) into.worst = ms;
          if (ms > 8 && cost.slow.length < 60) cost.slow.push({ call: name, what: typeof args[0] === 'string' ? args[0] : '', weapon: args[1]?.weapon ?? '', ms: Math.round(ms * 10) / 10, at: Math.round(performance.now()) / 1000 });
        }
      };
    };
    wrap(duty.sound, 'play', cost.play);
    for (const name of ['setHealth', 'setListener', 'duckForVoice', 'tinnitus']) if (typeof duty.sound[name] === 'function') wrap(duty.sound, name, cost.frame);
    wrap(duty.sound.music, 'setScene', cost.frame);
    wrap(duty.sound.music, 'sting', cost.frame);
    return true;
  })()`);

  // A click on nothing: the first press is what lets audio start.
  const t0 = Date.now();
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  const unlocked = await chrome.waitFor('duty.sound.state.unlocked', 20_000);
  const unlockMs = Date.now() - t0;
  const ready = await chrome.waitFor('duty.sound.state.music.ready', 60_000);
  const readyMs = Date.now() - t0;
  report.unlockMs = unlockMs;
  report.stemsReadyMs = readyMs;
  check('audio starts on the first press', unlocked, `running ${unlockMs} ms after the press`);
  check('the stems come in', ready, `the score is ready ${readyMs} ms after the press (rendered off the main thread)`);
  await sleep(4000);
  const menu = await music();
  check('the menu has its theme', menu.sounding === 'menu' && menu.sources > 0, `sounding '${menu.sounding}', ${menu.sources} sources, cycle ${menu.cycle}`);

  // A hidden page plays nothing (the page's own handler, driven by a made-up visibilitychange).
  await chrome.evaluate(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
  await sleep(600);
  const hidden = await music();
  await chrome.evaluate(`(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
  await sleep(1500);
  const shown = await music();
  check('a hidden page plays nothing', hidden.hidden === true && hidden.sounding === 'silence' && hidden.sources === 0, `hidden: sounding '${hidden.sounding}', ${hidden.sources} sources`);
  check('back in view the theme starts again', shown.hidden === false && shown.sounding === 'menu' && shown.sources > 0, `shown: sounding '${shown.sounding}', ${shown.sources} sources`);

  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }

  // Watch the match: every scene change with the clock as it stood, every sting, and the countdown's cues.
  const sample = `(() => {
    const d = duty.driver, m = d?.match ?? null, s = duty.sound.state;
    const left = d && m && m.phase === 'playing' && m.timeLimit != null && m.phaseEnds != null ? Math.min(m.timeLimit, m.phaseEnds - d.serverTime) : null;
    const cues = duty.sound.log.filter((l) => l.event.startsWith('countdownSiren') || l.event === 'geigerTick' || l.event === 'heartbeat').map((l) => [l.event, Math.round((l.time + (l.params.when ?? 0)) * 1000), l.params.when ?? 0]);
    return { phase: m?.phase ?? null, result: m?.result ?? null, left, live: m ? !(m.countdownEnds != null && m.countdownEnds > d.serverTime) : null, asked: s.music.scene, sounding: s.music.sounding, stings: s.music.stings, sources: s.music.sources, voices: s.voices, peakVoices: s.peakVoices, cap: s.voiceCap, duck: s.musicDuck, lowHealth: s.lowHealth, cues, clock: performance.now() / 1000, fps: Math.round(duty.game.fps) };
  })()`;
  const cues = new Map();
  let last = null;
  let stings = 0;
  let maxSources = 0;
  let maxVoices = 0;
  let minFps = Infinity;
  let seenPlaying = false;
  let over = null;
  const started = Date.now();
  let s = null;
  while (Date.now() - started < (MATCH + 150) * 1000) {
    s = await js(sample);
    if (!s) {
      const why = await chrome.evaluate(`(() => { try { return 'duty ' + typeof globalThis.duty + ', sound ' + typeof globalThis.duty?.sound + ', driver ' + typeof globalThis.duty?.driver + ', loaded ' + Math.round(performance.now() / 1000) + ' s ago; ' + (() => { try { ${'return JSON.stringify(' + sample + ').length + " chars"'} } catch (e) { return String(e.stack ?? e); } })(); } catch (e) { return String(e); } })()`);
      throw new Error(`the page stopped answering (${why}): ${chrome.errors.slice(-2).join(' | ')}`);
    }
    // Seen first within a sample of being asked for; `when` is how far ahead of its sound that was.
    for (const [event, at, when] of s.cues) if (!cues.has(`${event}@${at}`)) cues.set(`${event}@${at}`, { event, at: at / 1000, left: s.left === null ? null : s.left - when });
    maxSources = Math.max(maxSources, s.sources);
    maxVoices = Math.max(maxVoices, s.voices);
    if (s.phase === 'playing') {
      seenPlaying = true;
      minFps = Math.min(minFps, s.fps);
    }
    if (!last || s.sounding !== last.sounding || s.phase !== last.phase || s.live !== last.live) {
      const row = { at: (Date.now() - started) / 1000, phase: s.phase, live: s.live, left: s.left, asked: s.asked, sounding: s.sounding, sources: s.sources };
      report.transitions.push(row);
      console.log(`     ${f(row.at).padStart(6)} s  phase ${String(s.phase).padEnd(8)} live ${String(s.live).padEnd(5)} left ${f(s.left).padStart(5)}  scene ${s.sounding}`);
    }
    if (s.stings.length !== stings) {
      for (const name of s.stings.slice(stings)) {
        report.transitions.push({ at: (Date.now() - started) / 1000, sting: name, phase: s.phase, left: s.left });
        console.log(`     ${f((Date.now() - started) / 1000).padStart(6)} s  sting ${name} (phase ${s.phase}, left ${f(s.left)})`);
      }
      stings = s.stings.length;
    }
    last = s;
    if (seenPlaying && s.phase !== 'playing' && over === null) {
      over = Date.now();
      report.result = s.result;
    }
    // Long enough after the end for the ending's sting, the siren winding down and the lobby.
    if (over !== null && Date.now() - over > 22_000) break;
    await sleep(150);
  }
  if (!seenPlaying) throw new Error('the match never started');

  const t = report.transitions;
  const scene = (name) => t.find((r) => r.sounding === name && r.phase === 'playing');
  const lastMinute = scene('lastMinute');
  const final10 = scene('final10');
  const startSting = t.find((r) => r.sting === 'matchStart');
  const ending = t.find((r) => r.sting === 'victory' || r.sting === 'defeat');
  const endScene = t.find((r) => r.sounding === 'victory' || r.sounding === 'defeat');
  const playingQuiet = t.find((r) => r.phase === 'playing' && r.live === true && r.sounding === 'match');
  check('the menu theme stops for the match', playingQuiet, playingQuiet ? `scene 'match' ${f(playingQuiet.left)} s from the end` : 'never');
  check('the match opens with its sting', startSting, startSting ? `matchStart at ${f(startSting.at)} s (${f(startSting.left)} s on the clock)` : 'no matchStart sting');
  check('the bed starts with the last minute', lastMinute && lastMinute.left <= 60 && lastMinute.left > 59, lastMinute ? `'lastMinute' first seen with ${f(lastMinute.left, 2)} s left` : 'never');
  check('the riser starts with the final ten', final10 && final10.left <= 10 && final10.left > 9, final10 ? `'final10' first seen with ${f(final10.left, 2)} s left` : 'never');
  // A drawn match has no winner to play for: it ends without a sting, by design.
  const drawn = report.result && (report.result.draw === true || report.result.winner === null);
  check('the match ends on its sting', drawn ? !ending && !endScene : ending || endScene, ending ? `${ending.sting} at ${f(ending.at)} s (phase ${ending.phase}); result ${JSON.stringify(report.result)}` : `no sting; result ${JSON.stringify(report.result)}${drawn ? ' (a draw: none is played)' : ''}`);

  const all = [...cues.values()].sort((a, b) => a.at - b.at);
  const of = (event) => all.filter((c) => c.event === event);
  const rise = of('countdownSirenRise');
  const holds = of('countdownSirenHold');
  const fall = of('countdownSirenFall');
  const ticks = of('geigerTick');
  // The log holds the last 200 sounds and is read 6 times a second: under heavy fire a few cues can fall out between reads.
  const gaps = holds.slice(1).map((h, k) => h.at - holds[k].at);
  const ticksIn = (from, to) => ticks.filter((c) => c.left !== null && c.left <= from && c.left > to).length;
  report.cues = { rise: rise.length, holds: holds.length, fall: fall.length, ticks: ticks.length, riseLeft: rise[0]?.left ?? null, holdGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null, ticksByTen: [60, 50, 40, 30, 20, 10].map((from) => ticksIn(from, from - 10)), heartbeats: of('heartbeat').length };
  check('the siren winds up as the last minute begins', rise.length === 1 && rise[0].left !== null && rise[0].left <= 60 && rise[0].left > 58.5, `${rise.length} wind-up, seen with ${f(rise[0]?.left, 2)} s left`);
  check('the siren holds to the end and winds down once', holds.length >= 12 && fall.length === 1, `${holds.length} held segments ${f(report.cues.holdGap, 2)} s apart, ${fall.length} wind-down`);
  const dense = report.cues.ticksByTen;
  check('the counter ticks faster and faster', dense[5] > dense[4] && dense[4] > dense[1] && ticks.length > 50, `ticks seen per ten seconds, 60 s to 0: ${dense.join(', ')}`);

  check('voices stay under the cap', s.peakVoices < s.cap, `most at once ${s.peakVoices} of ${s.cap} (largest seen in a sample ${maxVoices}); the score's sources at most ${maxSources}`);
  const cost = await js('globalThis.__audioCost');
  const sched = (await music()).scheduling;
  const seconds = (Date.now() - started) / 1000;
  report.cost = { ...cost, music: sched, seconds, minFps };
  for (const c of cost.slow) console.log(`     slow: ${c.call}(${c.what}${c.weapon ? ' ' + c.weapon : ''}) ${c.ms} ms at ${c.at} s`);
  // Two things, kept apart: what this arc calls every frame (scene, health, listener) with the score's own scheduling,
  // and starting a sound (a voice's nodes are built per sound: that cost was there before, and is reported as it is).
  const share = (ms) => f((ms / (seconds * 1000)) * 100, 3);
  check('the per-frame audio calls and the score cost next to nothing', cost.frame.ms < seconds * 5 && sched.worst < 16, `over ${f(seconds, 0)} s: ${cost.frame.calls} per-frame calls (scene, health, listener) in ${f(cost.frame.ms)} ms, ${share(cost.frame.ms)} % of the time (mean ${f((cost.frame.ms / Math.max(1, cost.frame.calls)) * 1000, 1)} us, worst ${f(cost.frame.worst, 2)} ms); of that the score's own scheduling ${sched.calls} calls, ${f(sched.ms, 2)} ms, worst ${f(sched.worst, 2)} ms`);
  check('no sound takes a frame to start', cost.play.worst < 16.7, `${cost.play.calls} sounds started in ${f(cost.play.ms)} ms, ${share(cost.play.ms)} % of the time (mean ${f((cost.play.ms / Math.max(1, cost.play.calls)) * 1000, 0)} us, worst ${f(cost.play.worst, 2)} ms); lowest fps while playing ${minFps} (the PC was busy with other work)`);
} catch (error) {
  report.error = String(error);
  console.log(`FAIL the run: ${error}`);
}
report.errors = chrome.errors.slice(0, 10);
check('the page logs no errors', report.errors.length === 0, report.errors.length ? report.errors.join(' | ') : 'none');
await chrome.close();

const failed = report.checks.filter((c) => !c.ok).length + (report.error ? 1 : 0);
const lines = ['# A Bot Match, heard through the sound system', '', `Survival Town, Team deathmatch, \`?matchtime=${MATCH}\`, headless and muted; read from \`duty.sound.state\` and \`duty.sound.log\` about six times a second.`, '', '| check | result | what was seen |', '|---|---|---|', ...report.checks.map((c) => `| ${c.name} | ${c.ok ? 'ok' : 'FAIL'} | ${String(c.detail).replace(/\|/g, '/')} |`), '', '## Scenes and stings as they happened', '', '| s into the watch | phase | live | s left | scene sounding | sting |', '|---|---|---|---|---|---|', ...report.transitions.map((r) => `| ${f(r.at)} | ${r.phase ?? '-'} | ${r.live ?? '-'} | ${f(r.left)} | ${r.sounding ?? ''} | ${r.sting ?? ''} |`), ''];
if (report.error) lines.push(`The run failed: ${report.error}`, '');
writeFileSync(out('bot-match.md'), lines.join('\n') + '\n');
writeFileSync(out('bot-match.json'), JSON.stringify(report, null, 2));
console.log(`${report.checks.length - failed} of ${report.checks.length} checks ok`);
process.exit(failed ? 1 : 0);
