// Plays a short Bot Match on a map through the menu and records, every frame
// from the match's last seconds to the lobby, the end-of-match train (visible,
// x, children) and the camera; screenshots each second of the ending.
//
//   node .scratch/battle-royale/train/train-probe.mjs <out dir> [map] [mode] [extra query]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/battle-royale/train/run';
const map = process.argv[3] ?? 'switchyard';
const mode = process.argv[4] ?? 'tdm';
const extra = process.argv[5] ?? '';
const online = extra.includes('online');
const NAMES = { 'survival-town': 'Survival Town', switchyard: 'Switchyard', tdm: 'Team deathmatch', ffa: 'Free-for-all' };
mkdirSync(out, { recursive: true });

const chrome = await launchChrome();
try {
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  // A controller plugged into this PC reaches headless Chrome too and drives the menus: hide it.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: 'navigator.getGamepads = () => [];' });
  await chrome.navigate(`http://localhost:5173/?nolock&matchtime=12${extra}`);
  if (!(await chrome.waitFor(`location.protocol === 'http:' && globalThis.duty?.game && duty.menu.screen === 'main'`, 90_000))) throw new Error('page did not start');
  await sleep(1000);
  if (online) {
    await click('Play Online');
    await sleep(500);
    await chrome.evaluate(`(() => { const i = document.activeElement; if (i?.tagName === 'INPUT') { i.value = 'Probe'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
    await click('Play Online');
    if (!(await chrome.waitFor(`duty.driver?.match`, 60_000))) { console.log(await chrome.evaluate(`document.body.innerText.slice(0, 600)`)); throw new Error('did not join'); }
    await sleep(2000);
    // The host's Start, in the lobby, if the server is in its lobby.
    if (await chrome.evaluate(`duty.driver.match.phase === 'lobby'`)) await click('Start');
  } else
    for (const p of ['Bot Match', NAMES[map], NAMES[mode], ...(mode === 'ffa' ? [] : ['Mixed teams']), 'Start']) {
      if (!(await click(p))) throw new Error(`no "${p}" button`);
      await sleep(400);
    }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  // The recorder: captures the scene from the renderer, then logs every frame.
  await chrome.evaluate(`(() => {
    const r = duty.renderer;
    const render = r.render.bind(r);
    const renderAsync = r.renderAsync?.bind(r);
    r.render = (s, c) => { if (s.isScene) { (globalThis.__scenes ??= new Set()).add(s); if (c?.isPerspectiveCamera) s.userData.probeCam = c; } return render(s, c); };
    if (renderAsync) r.renderAsync = (s, c) => { if (s.isScene) (globalThis.__scenes ??= new Set()).add(s); return renderAsync(s, c); };
    globalThis.__log = []; globalThis.__sounds = [];
    const play = duty.sound.play.bind(duty.sound);
    duty.sound.play = (e, p) => { if (/train|nuke/i.test(e)) globalThis.__sounds.push({ t: performance.now() | 0, e, when: p?.when ?? 0, server: +duty.driver.serverTime.toFixed(2) }); return play(e, p); };
    const loop = () => {
      const scenes = [...(globalThis.__scenes ?? [])];
      const trains = scenes.map((x) => x.getObjectByName('train')).filter(Boolean);
      const train = trains.at(-1); const s = null; let sc = train; while (sc?.parent) sc = sc.parent; const cam = sc?.userData.probeCam ?? null;
      const d = duty.driver; const m = d?.match;
      globalThis.__log.push({ t: performance.now() | 0, phase: m?.phase ?? null, phaseEnds: m?.phaseEnds ?? null, server: d ? +d.serverTime.toFixed(2) : null, lobby: !!m?.lobby,
        found: trains.length, scenes: scenes.length, mapId: duty.map?.id, matchMap: m?.map ?? null, visible: train?.visible ?? null, x: train ? +train.position.x.toFixed(1) : null, kids: train?.children.length ?? null,
        overview: duty.game.overviewOnly, pos: duty.game.player ? duty.game.player.position.map((v) => +v.toFixed(1)) : null, onScreen: (() => { const c = cam; if (!c || !train?.visible) return 0; const V = train.position.constructor; let n = 0; for (let k = 0; k <= 300; k += 12) { const v = new V(train.position.x + k, 2.5, train.position.z).project(c); if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1 && v.z > -1) n++; } return n; })(), camPos: cam ? cam.position.toArray().map((v) => +v.toFixed(2)) : null, camDir: cam ? cam.getWorldDirection(new train.position.constructor()).toArray().map((v) => +v.toFixed(4)) : null, camUp: cam ? new train.position.constructor(0, 1, 0).applyQuaternion(cam.quaternion).toArray().map((v) => +v.toFixed(4)) : null, fov: cam?.fov ?? null, aspect: cam?.aspect ?? null, trainZ: train?.position.z ?? null, paused: duty.game.paused, over: d?.over ?? null, gameDriver: !!duty.game.driver });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return true;
  })()`);
  const shots = [];
  const start = Date.now();
  let lobbyAt = null;
  while (Date.now() - start < 60_000) {
    const last = JSON.parse(await chrome.evaluate(`JSON.stringify(globalThis.__log.at(-1) ?? null)`));
    if (last && last.phase !== 'playing') {
      const shot = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 });
      const name = `${String(shots.length).padStart(2, '0')}-${last.phase}-x${last.x}-vis${last.visible}.jpg`;
      writeFileSync(`${out}/${name}`, Buffer.from(shot.result.data, 'base64'));
      shots.push(name);
      if (last.phase === 'lobby') lobbyAt ??= Date.now();
    }
    if (lobbyAt && Date.now() - lobbyAt > 3000) break;
    await sleep(1000);
  }
  const log = JSON.parse(await chrome.evaluate(`JSON.stringify(globalThis.__log)`));
  writeFileSync(`${out}/frames.json`, JSON.stringify(log));
  const sounds = JSON.parse(await chrome.evaluate(`JSON.stringify(globalThis.__sounds)`));
  writeFileSync(`${out}/sounds.json`, JSON.stringify(sounds));
  // Summary: frames per phase, how many had the train visible, its x range.
  const byPhase = {};
  for (const f of log) {
    const p = (byPhase[f.phase] ??= { onScreen: 0, maps: new Set(), scenes: new Set(), frames: 0, visible: 0, xs: new Set(), kids: new Set(), found: 0, overview: 0 });
    p.frames++; p.maps.add(f.mapId + '/' + f.matchMap); p.scenes.add(f.scenes);
    if (f.visible) p.visible++; if (f.onScreen > 0) p.onScreen++;
    if (f.found) p.found++;
    if (f.overview) p.overview++;
    p.xs.add(f.x);
    p.kids.add(f.kids);
  }
  const summary = Object.fromEntries(Object.entries(byPhase).map(([k, v]) => [k, { ...v, xs: [Math.min(...v.xs), Math.max(...v.xs)], kids: [...v.kids], maps: [...v.maps], scenes: [...v.scenes] }]));
  console.log(JSON.stringify({ map, mode, extra, summary, sounds: Object.entries(Object.groupBy(sounds, (x) => x.e)).map(([k, v]) => k + ':' + v.length).join(' '), shots: shots.length, errors: chrome.errors.slice(0, 5) }, null, 1));
} finally {
  await chrome.close();
}
