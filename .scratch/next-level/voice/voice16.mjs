// node voice16.mjs <out dir>   Range Control through a 75 s Bot Match: every line it is asked to say, with the clock at that
// moment, whether the recording said it, what the caption read, how far everything else was ducked, and the soldiers' own
// voices (pain, death) from the sound log. MODE picks the mode (default Team Deathmatch), URL the page.
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'voice16';
mkdirSync(OUT, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const click = (chrome, label) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const W = Number(process.env.W ?? 1920), H = Number(process.env.H ?? 1080);
const URL_ = process.env.URL ?? 'http://localhost:5173/';
const MODE = process.env.MODE ?? 'Team Deathmatch';
const chrome = await launchChrome();
const shot = async (name) => writeFileSync(`${OUT}/${name}-${W}.png`, Buffer.from((await chrome.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${URL_}?nolock&matchtime=${process.env.TIME ?? 75}`);
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.sound', 120000))) throw new Error('page did not start');
  await sleep(1500);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  // Every line asked of the recording, as it is asked.
  await chrome.evaluate(`(() => {
    const speech = duty.sound.speech, say = speech.say.bind(speech);
    const left = () => { const m = duty.driver?.match; return m && m.phase === 'playing' && m.phaseEnds != null ? Math.round(Math.min(m.timeLimit, m.phaseEnds - duty.driver.serverTime) * 100) / 100 : null; };
    globalThis.__said = [];
    globalThis.__voices = {}; const play = duty.sound.play.bind(duty.sound); duty.sound.play = (event, params) => { if (event === 'pain' || event === 'death') { const k = event + (params?.local ? ':own' : ''); globalThis.__voices[k] = (globalThis.__voices[k] ?? 0) + 1; } return play(event, params); };
    speech.say = (id, cuts) => { const r = say(id, cuts); globalThis.__said.push({ id, left: left(), phase: duty.driver?.match?.phase ?? null, said: r !== null, wait: r ? Math.round(r.wait * 100) / 100 : null, seconds: r?.seconds ?? null, cuts: !!cuts }); setTimeout(() => { const row = globalThis.__said.find((x) => x.id === id && x.caption === undefined); if (row) { const c = document.querySelector('.ds-caption.on'); row.caption = c ? c.innerText : null; row.duck = Math.round(duty.sound.state.voiceDuck * 100) / 100; } }, 250); return r; };
  })()`);
  // The recording as this browser decodes it: is each line's window silent at both ends (nothing cut, nothing of a neighbour)?
  let windows = null;
  try { windows = JSON.parse(await chrome.evaluate(`(async () => {
    const audio = '/@fs/C:/Users/Aleix/Documents/CLAUDE/duty-shooter/packages/fps-client/src/audio/assets/';
    const index = await (await fetch(audio + 'controller.json')).json();
    const ctx = new OfflineAudioContext(1, 48000, 48000);
    const data = (await ctx.decodeAudioData(await (await fetch(audio + 'controller.mp3')).arrayBuffer())).getChannelData(0);
    const edge = Math.round(48000 * 0.012);
    const loud = (a, b) => { let m = 0; for (let i = Math.max(0, a); i < Math.min(data.length, b); i++) m = Math.max(m, Math.abs(data[i])); return m; };
    const rows = Object.entries(index.lines).map(([id, l]) => { const a = Math.round(l.start * 48000), b = a + Math.round(l.seconds * 48000); return { id, head: loud(a, a + edge), tail: loud(b - edge, b), peak: loud(a, b) }; });
    return JSON.stringify({ lines: rows.length, seconds: data.length / 48000, indexSeconds: index.seconds, loudEdges: rows.filter((r) => r.head > 0.03 || r.tail > 0.03), quietest: Math.min(...rows.map((r) => r.peak)), loudest: Math.max(...rows.map((r) => r.peak)) });
  })()`)); } catch { windows = 'unavailable on this server'; }
  for (const p of ['Bot Match', process.env.MAP ?? 'Survival Town', MODE, 'Start']) {
    if (!(await click(chrome, p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive`, 240000))) throw new Error('match did not start');
  const speechAtStart = JSON.parse(await chrome.evaluate(`JSON.stringify(duty.sound.state.speech)`));
  // END=<reason> ends the match early as the server would for that reason (killLimit, timeLimit...), ten seconds in: what
  // Range Control makes of a match that was stopped, without playing to a limit.
  const endAt = process.env.END ? Date.now() + 10000 : Infinity;
  let ended = false;
  let shots = 0;
  const seen = new Set();
  const until = Date.now() + (Number(process.env.TIME ?? 75) + 25) * 1000;
  while (Date.now() < until) {
    const state = JSON.parse(await chrome.evaluate(`JSON.stringify({ phase: duty.driver?.match?.phase ?? null, n: globalThis.__said.length, last: globalThis.__said.at(-1)?.id ?? null, caption: document.querySelector('.ds-caption.on')?.innerText ?? null })`));
    if (state.caption && !seen.has(state.caption) && shots < 4) {
      seen.add(state.caption);
      await shot(`caption-${++shots}`);
    }
    if (!ended && Date.now() > endAt) {
      ended = true;
      await chrome.evaluate(`(() => { const d = duty.driver, m = d.match; Object.defineProperty(d, 'match', { configurable: true, get: () => ({ ...m, phase: 'nuke', result: { winner: null, winnerName: null, draw: true, reason: ${JSON.stringify(process.env.END)} } }) }); })()`);
      await sleep(4000);
      await shot('ended');
      break;
    }
    if (state.phase && state.phase !== 'playing' && state.phase !== 'nuke') break;
    await sleep(120);
  }
  const voices = JSON.parse(await chrome.evaluate(`JSON.stringify({ ...globalThis.__voices, kills: duty.driver?.match ? (duty.driver.scores ?? []).reduce((n, x) => n + (x.kills ?? 0), 0) : null })`));
  console.log(JSON.stringify({ windows, speechAtStart, said: JSON.parse(await chrome.evaluate('JSON.stringify(globalThis.__said)')), speech: JSON.parse(await chrome.evaluate('JSON.stringify(duty.sound.state.speech)')), voices, errors: chrome.errors.slice(0, 8) }, null, 1));
} finally { await chrome.close(); }
