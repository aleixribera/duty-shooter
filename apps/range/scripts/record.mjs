// Records a short gameplay clip of a Bot Match: the player tags along behind
// a teammate bot (bots know the way round the walls) and turns to fight any
// enemy within 25 m; in free-for-all it heads for the nearest enemy. Frames are screenshots
// (about 10 a second) saved as JPEGs; FFMPEG=<path to ffmpeg> also joins them
// into <out dir>/clip.mp4. Needs the dev server.
//
//   node apps/range/scripts/record.mjs <out dir> [seconds] [map] [mode] [base url]
//   (defaults: 30 s, switchyard, tdm, http://localhost:5173/)
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from './chrome.mjs';

const [out, seconds = '30', map = 'switchyard', mode = 'tdm', base = 'http://localhost:5173/'] = process.argv.slice(2);
if (!out) {
  console.error('usage: node record.mjs <out dir> [seconds] [map] [mode] [base url]');
  process.exit(2);
}
const NAMES = { 'survival-town': 'Survival Town', switchyard: 'Switchyard', tdm: 'Team deathmatch', ffa: 'Free-for-all', outposts: 'Outposts', charge: 'Charge', gungame: 'Gun game' };
const frames = `${out}/frames`;
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const chrome = await launchChrome();
await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: code.charCodeAt(3) });
const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 640, y: 360, button: 'left', clickCount: 1 });
await chrome.navigate(`${base}?nolock`);
await chrome.waitFor('globalThis.duty?.game', 60_000);
await sleep(1000);
for (const p of ['Bot Match', NAMES[map], NAMES[mode], ...(mode === 'ffa' || mode === 'gungame' ? [] : ['Mixed teams']), 'Start']) {
  if (!(await click(p))) throw new Error(`no "${p}" button`);
  await sleep(300);
}
await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000);
await sleep(1500);

// Each step: face an enemy within 25 m and fire, else face the teammate to follow and walk while 4 m or more behind.
// Yaw 0 looks down -Z. Returns { walk, fire }.
const steer = `(() => {
  const g = duty.game, d = g.driver, me = g.player;
  if (!me || !me.alive) return { walk: false, fire: false };
  const team = d.scores.find((s) => s.id === d.selfId)?.team;
  const ffa = ${mode === 'ffa' || mode === 'gungame'};
  const live = d.others(0).filter((p) => p.kind === 'player' && p.alive);
  const flat = (p) => Math.hypot(p.position[0] - me.position[0], p.position[2] - me.position[2]);
  const nearest = (list) => list.reduce((a, p) => (!a || flat(p) < flat(a) ? p : a), null);
  const foe = nearest(live.filter((p) => ffa || p.team !== team));
  const mate = ffa ? foe : nearest(live.filter((p) => p.team === team));
  const fight = foe && flat(foe) < 25;
  const at = fight ? foe : mate;
  if (!at) return { walk: false, fire: false };
  const dx = at.position[0] - me.position[0], dz = at.position[2] - me.position[2], dy = at.position[1] - me.position[1];
  g.input.setAngles(Math.atan2(-dx, -dz), fight ? Math.atan2(dy, flat(at)) * 0.8 : 0);
  return { walk: !fight && flat(at) > 4, fire: !!fight };
})()`;
let walking = false;
let firing = false;
const start = Date.now();
let n = 0;
while (Date.now() - start < Number(seconds) * 1000) {
  const { walk, fire } = await chrome.evaluate(steer);
  if (walk !== walking) await key(walk ? 'keyDown' : 'keyUp', 'KeyW');
  if (fire !== firing) await mouse(fire ? 'mousePressed' : 'mouseReleased');
  walking = walk;
  firing = fire;
  const shot = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(`${frames}/${String(n++).padStart(5, '0')}.jpg`, Buffer.from(shot.result.data, 'base64'));
}
const fps = n / ((Date.now() - start) / 1000);
console.log(JSON.stringify({ frames: n, fps: Math.round(fps * 10) / 10, errors: chrome.errors.slice(0, 5) }));
await chrome.close();

if (process.env.FFMPEG) {
  // An H.264 encoder that this ffmpeg build has: libx264, else a hardware one.
  const encoders = execFileSync(process.env.FFMPEG, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const codec = ['libx264', 'h264_nvenc', 'h264_amf', 'h264_qsv'].find((c) => encoders.includes(` ${c} `));
  if (!codec) throw new Error('this ffmpeg has no H.264 encoder');
  const quality = codec === 'libx264' ? ['-crf', '26', '-preset', 'slow'] : ['-b:v', '1100k', '-maxrate', '1600k', '-bufsize', '3000k'];
  execFileSync(process.env.FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${frames}/%05d.jpg`, '-vf', 'fps=30,format=yuv420p', '-c:v', codec, ...quality, '-movflags', '+faststart', `${out}/clip.mp4`]);
  console.log(`${out}/clip.mp4 (${codec})`);
}
