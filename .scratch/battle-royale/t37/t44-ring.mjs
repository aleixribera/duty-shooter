// Ticket 44: the Ring wall where it crosses high ground, before and after.
// Joins a Solos Battle Royale alone (Vite 5241 -> server 3241), waits out the drop, then turns
// to the highest ground the wall crosses near the player and to a low stretch, and shoots both.
// Usage: node .scratch/battle-royale/t37/t44-ring.mjs <tag>
import * as L from '../bugs/lib.mjs';

const tag = process.argv[2] ?? 'before';
const URL_ = 'http://localhost:5241/?online&nolock';
const c = await L.open('ring', { url: URL_, width: 1920, height: 1080 });

const HEIGHT = `(x, z) => { const t = duty.map.terrain; const gx = (x - t.origin[0]) / t.cell, gz = (z - t.origin[1]) / t.cell; if (gx < 0 || gz < 0 || gx >= t.columns || gz >= t.rows) return 0; const i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j, s = t.columns + 1, h = t.heights; const a = h[j * s + i], b = h[j * s + i + 1], c = h[(j + 1) * s + i], d = h[(j + 1) * s + i + 1]; return Math.max(0, (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v); }`;

async function aim(yaw, pitch) {
  for (let k = 0; k < 16; k++) {
    const [y, p] = JSON.parse(await c.evaluate('JSON.stringify([duty.game.player.yaw, duty.game.player.pitch])'));
    let dy = Math.atan2(Math.sin(yaw - y), Math.cos(yaw - y));
    const dp = pitch - p;
    if (Math.abs(dy) < 0.01 && Math.abs(dp) < 0.01) return;
    await L.look(c, -dy * 400, -dp * 400, 2);
  }
}

try {
  await c.must(`!!duty.menu && duty.menu.open`, 60000);
  await L.sleep(1500);
  await L.click(c, 'Battle Royale');
  await c.must(`!![...document.querySelectorAll('.ds-royale input[name=name]')].find((i) => i.getClientRects().length)`, 30000);
  await c.evaluate(`(() => { const i = document.querySelector('.ds-royale input[name=name]'); i.value = 'Ringside'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await L.click(c, 'Solos').catch(() => {});
  await L.click(c, 'Join server');
  await c.must(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Start match' && !b.disabled)`, 120000, 500);
  await L.click(c, 'Start match');
  await c.must(`[...document.querySelectorAll('button')].some((b) => /Join the match/.test(b.textContent) && !b.disabled) || (duty.game.player?.alive && !duty.game.paused)`, 120000, 500);
  if (await L.has(c, 'Join the match')) await L.click(c, 'Join the match');
  await L.sleep(22000);
  // The wall's highest ground near the player: run to within ~110 m of it, then look along the wall there.
  const pick = async () =>
    JSON.parse(
      await c.evaluate(`(() => { const H = ${HEIGHT}; const o = duty.game.driver.match.objective.circle; const p = duty.game.player.position; const out = []; for (let k = 0; k < 720; k++) { const a = (k / 720) * Math.PI * 2; const x = o.x + Math.sin(a) * o.radius, z = o.z + Math.cos(a) * o.radius; out.push({ x, z, h: H(x, z), d: Math.hypot(x - p[0], z - p[2]) }); } const high = out.filter((s) => s.h > 18).sort((m, n) => m.d - n.d)[0]; return JSON.stringify({ p, ring: o, high }); })()`),
    );
  let spot = await pick();
  L.log(JSON.stringify(spot));
  const t0 = Date.now();
  while (spot.high && spot.high.d > 170 && Date.now() - t0 < 150_000) {
    const p = spot.p;
    // Aim a little inside the wall, so the run doesn't leave the Ring.
    const k = 0.85;
    const tx = spot.ring.x + (spot.high.x - spot.ring.x) * k, tz = spot.ring.z + (spot.high.z - spot.ring.z) * k;
    await aim(Math.atan2(-(tx - p[0]), -(tz - p[2])), 0);
    await L.keyDown(c, 'KeyW');
    await L.keyDown(c, 'ShiftLeft');
    await L.sleep(4000);
    await L.keyUp(c, 'ShiftLeft');
    await L.keyUp(c, 'KeyW');
    if (Math.random() < 0.3) await L.tap(c, 'Space');
    spot = await pick();
    L.log('run', JSON.stringify({ p: spot.p.map(Math.round), d: Math.round(spot.high?.d ?? -1), h: Math.round(spot.high?.h ?? -1), alive: (await L.state(c)).alive }));
  }
  const p = spot.p;
  const s = spot.high;
  const yaw = Math.atan2(-(s.x - p[0]), -(s.z - p[2]));
  await aim(yaw, Math.atan2(s.h + 4 - (p[1] + 1.6), s.d));
  await L.sleep(1500);
  await L.shoot(c, `t44/${tag}-ring-high`);
  // And a little to each side, so the wall is seen running over the slope.
  for (const [name, turn] of [['left', 0.35], ['right', -0.35]]) {
    await aim(yaw + turn, Math.atan2(s.h + 4 - (p[1] + 1.6), s.d));
    await L.sleep(1000);
    await L.shoot(c, `t44/${tag}-ring-high-${name}`);
  }
} finally {
  await c.close();
}
