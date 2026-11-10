// Ticket 13 in the real game, with a simulated DualShock whose motors record what they are asked to play:
// the look stick slows over a target dummy and not over open ground, and a burst of fire and its hits rumble.
//   node .scratch/next-level/pad/rumble.mjs
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const PAD = `(() => { const pad = (window.__pad = { buttons: Array(18).fill(0), axes: [0, 0, 0, 0] }); window.__rumbles = [];
  const motors = { playEffect: (type, p) => { window.__rumbles.push({ t: Math.round(performance.now()), type, ...p }); return Promise.resolve('complete'); }, reset: () => { window.__rumbles.push({ t: Math.round(performance.now()), type: 'reset' }); return Promise.resolve('complete'); } };
  navigator.getGamepads = () => [{ id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: pad.axes.slice(), buttons: pad.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })), vibrationActuator: motors }];
  Document.prototype.hasFocus = () => true;
})()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PAD });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${BASE}?explore=range&nolock`);
  if (!(await chrome.waitFor('window.duty?.game?.player && !duty.game.paused', 240_000))) throw new Error('never playing');
  const js = (e) => chrome.evaluate(e);
  await sleep(2500);
  // A press of a face button that does nothing much (Triangle swaps; press it twice) makes the pad the input in use.
  for (const v of [1, 0, 1, 0]) {
    await js(`__pad.buttons[3] = ${v}`);
    await sleep(250);
  }
  await sleep(1200);
  console.log('pad mode', await js('duty.game.input.padMode'));

  /** How far (rad) a short push of the look stick to the right turns the view from here. */
  const turn = async () => {
    const a = await js('duty.game.player.yaw');
    await js('__pad.axes[2] = 0.3');
    await sleep(110);
    await js('__pad.axes[2] = 0');
    await sleep(300);
    const b = await js('duty.game.player.yaw');
    return Math.abs(b - a);
  };
  // The spawn looks down the lane at a dummy; first a look at what is under the crosshair.
  const aim = await js(`(() => { const p = duty.game.player; const f = [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)]; return { yaw: p.yaw, pitch: p.pitch, f }; })()`);
  console.log('spawn view', aim);
  // Onto the nearest dummy's chest: the burst and the first push start on a target.
  const target = await js(`(() => { const me = duty.game.player; const ds = (duty.driver?.others(1) ?? []).filter((o) => o.kind === 'dummy' && o.alive);
    const d = ds.map((o) => ({ o, r: Math.hypot(o.position[0] - me.position[0], o.position[2] - me.position[2]) })).sort((a, b) => a.r - b.r)[0];
    if (!d) return null; const p = [d.o.position[0], d.o.position[1] + d.o.eyeHeight * 0.72, d.o.position[2]];
    const dx = p[0] - me.position[0], dy = p[1] - (me.position[1] + me.eyeHeight), dz = p[2] - me.position[2];
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz)); duty.game.input.setAngles(yaw, pitch);
    return { id: d.o.id, range: d.r.toFixed(1), yaw, pitch }; })()`);
  console.log('aimed at', target);
  await sleep(400);
  // A burst at the dummy down the lane first: R2 held half a second.
  await js('window.__rumbles.length = 0');
  await js('__pad.buttons[7] = 1');
  await sleep(600);
  await js('__pad.buttons[7] = 0');
  await sleep(1500);
  const burst = await js('window.__rumbles');
  const kinds = {};
  for (const r of burst) kinds[`${r.strongMagnitude.toFixed(2)}/${r.weakMagnitude.toFixed(2)}/${r.duration}`] = (kinds[`${r.strongMagnitude.toFixed(2)}/${r.weakMagnitude.toFixed(2)}/${r.duration}`] ?? 0) + 1;
  console.log('rumbles in the burst at the dummy', burst.length, kinds);
  // Back onto it for the slowdown's push.
  await js(`duty.game.input.setAngles(${target.yaw}, ${target.pitch})`);
  await sleep(400);
  const onTarget = await turn();
  // Turn well away from the lane (the stick at full for a moment), then the same push over empty ground.
  await js('__pad.axes[2] = -1');
  await sleep(500);
  await js('__pad.axes[2] = 0');
  await sleep(500);
  const offTarget = await turn();
  console.log('turn on target', onTarget.toFixed(4), 'off target', offTarget.toFixed(4), 'ratio', (onTarget / offTarget).toFixed(2));

  // The pause stops the motors.
  await js('window.__rumbles.length = 0');
  await js('__pad.buttons[7] = 1');
  await sleep(150);
  await js('__pad.buttons[9] = 1');
  await sleep(200);
  await js('__pad.buttons[9] = 0; __pad.buttons[7] = 0');
  await sleep(400);
  console.log('paused', await js('duty.game.paused'), 'after the pause', JSON.stringify(await js('window.__rumbles')));
  console.log('errors', (chrome.errors ?? []).slice(0, 5));
} finally {
  await chrome.close();
}
