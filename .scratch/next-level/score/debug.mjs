import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const NO_HMR = `(() => { const Real = WebSocket; globalThis.WebSocket = new Proxy(Real, { construct(target, args) {
  const p = args[1]; if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
  return new target(...args); } }); })()`;

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
    const dy = to.position[1] + to.eyeHeight - 0.03 - eye[1];
    g.input.setAngles(Math.atan2(-dx, -dz), seen ? Math.atan2(dy, Math.hypot(dx, dz)) : 0);
  }, 8);
  return true;
})()`;


const chrome = await launchChrome();
const click = (text) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
await chrome.navigate('http://localhost:5173/?nolock&matchtime=60');
await chrome.waitFor('globalThis.duty?.game && location.protocol === "http:"', 90000);
await sleep(1500);
for (const p of ['Bot Match', 'Survival Town', 'Free-for-all', 'Start']) { await click(p); await sleep(300); }
console.log('playing', await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive`, 180000));
console.log('aim', await chrome.evaluate(AIM));
console.log('fire', await chrome.waitFor('globalThis.__fire === true', 40000, 50));
await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 960, y: 540, button: 'left', clickCount: 1 });
for (let i = 0; i < 4; i++) {
  await sleep(400);
  const shot = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(`.scratch/next-level/score/debug-${i}.jpg`, Buffer.from(shot.result.data, 'base64'));
  console.log(await chrome.evaluate(`JSON.stringify({ fire: globalThis.__fire, a: duty.game.input.angles, me: duty.game.player.position, yaw: duty.game.player.yaw, pitch: duty.game.player.pitch, ammo: duty.game.player.weapon.ammo ?? duty.game.player.weapon, others: duty.driver.others(1).filter(o => o.alive).map(o => o.position.map(v => +v.toFixed(1))) })`));
}
console.log('errors', chrome.errors);
await chrome.close();
