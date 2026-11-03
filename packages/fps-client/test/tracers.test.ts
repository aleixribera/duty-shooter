import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three/webgpu';
import { STATS, box, createWorld, type Vec3 } from '@duty-shooter/fps-core';
import { Tracers, flightEnd, type TracerBody } from '../src/tracers';

/** A wall across the x axis, 60 m out: its near face at x = 60. */
const world = createWorld([box({ min: [60, 0, -20], max: [61, 20, 20], material: 'concrete' })]);
const eye: Vec3 = [0, 1.5, 0];
const east: Vec3 = [1, 0, 0];
const body = (id: string, x: number, team = 1): TracerBody => ({ id, team, position: [x, 0, 0], yaw: Math.PI / 2, stance: 'stand', eyeHeight: 1.52, alive: true });

/** The head of every streak drawn last frame (the quad's centre plus half its length axis). */
function heads(t: Tracers): Vec3[] {
  const m = t.streaks;
  const a = m.instanceMatrix.array;
  const out: Vec3[] = [];
  for (let i = 0; i < m.count; i++) {
    const o = i * 16;
    out.push([a[o + 12]! + a[o + 4]! / 2, a[o + 13]! + a[o + 5]! / 2, a[o + 14]! + a[o + 6]! / 2]);
  }
  return out;
}

function camera(): PerspectiveCamera {
  const c = new PerspectiveCamera(70, 16 / 9, 0.05, 2000);
  c.position.set(0, 1.6, 3);
  c.updateMatrixWorld();
  return c;
}

describe('where a tracer ends', () => {
  it('stops at the first wall on the bullet’s ballistic path', () => {
    const end = flightEnd(world, eye, east, 628, [], null, 1000);
    expect(end.point[0]).toBeCloseTo(60, 3);
    // Gravity: 60 m at 628 m/s drops the bullet a few centimetres (the world is tested in straight steps, as the simulation's ticks are).
    const t = 60 / 628;
    expect(end.point[1]).toBeCloseTo(1.5 - 0.5 * STATS.weapon.projectileGravity.value * t * t, 2);
    expect(end.time).toBeCloseTo(t, 4);
  });

  it('stops at a body in front of the wall, but not at the shooter or a teammate', () => {
    expect(flightEnd(world, eye, east, 628, [body('enemy', 30, 2)], { id: 'me', team: 1 }, 1000).point[0]).toBeLessThan(31);
    expect(flightEnd(world, eye, east, 628, [body('ally', 30, 1)], { id: 'me', team: 1 }, 1000).point[0]).toBeCloseTo(60, 3);
    expect(flightEnd(world, eye, east, 628, [body('me', 0.2, 1)], { id: 'me', team: 1 }, 1000).point[0]).toBeCloseTo(60, 3);
    // Without teams, everyone else is a target.
    expect(flightEnd(world, eye, east, 628, [body('ally', 30, 1)], { id: 'me', team: null }, 1000).point[0]).toBeLessThan(31);
  });

  it('flies to the end of the bullet’s range when nothing is in the way', () => {
    const end = flightEnd(world, eye, [-1, 0, 0], 628, [], null, 1000);
    expect(Math.hypot(end.point[0], end.point[2])).toBeCloseTo(1000, 0);
  });
});

describe('Tracers', () => {
  it('leaves the muzzle, converges on the eye’s path and lands exactly on the hit', () => {
    const t = new Tracers(new Scene(), world);
    const muzzle: Vec3 = [0.6, 1.3, 0.25];
    t.fire('me', 'm4a1', eye, east, muzzle, [], null);
    const cam = camera();
    t.update(0.004, cam);
    const [first] = heads(t);
    // 4 ms out at 628 m/s: 2.5 m along, still well off the eye line toward the muzzle's side.
    expect(first![0]).toBeCloseTo(0.6 + 0.004 * 628, 0);
    expect(first![2]).toBeGreaterThan(0.1);
    let last = first!;
    for (let i = 0; i < 40 && t.flying > 0; i++) {
      t.update(0.004, cam);
      if (t.streaks.count) last = heads(t)[0]!;
    }
    expect(t.flying).toBe(0);
    expect(last[0]).toBeCloseTo(60, 2);
    expect(Math.abs(last[2])).toBeLessThan(1e-6);
  });

  it('is drawn at least once even when the frame is longer than the whole flight', () => {
    const t = new Tracers(new Scene(), createWorld([box({ min: [3, 0, -2], max: [4, 3, 2], material: 'concrete' })]));
    t.fire('me', 'm4a1', eye, east, eye, [], null);
    t.update(0.1, camera());
    expect(t.streaks.count).toBe(1);
    t.update(0.1, camera());
    expect(t.streaks.count).toBe(0);
  });

  it('moves its landing to the hit the server reports for that shooter', () => {
    const t = new Tracers(new Scene(), world);
    t.fire('bot', 'm4a1', eye, east, eye, [], null);
    t.fire('other', 'm4a1', eye, east, eye, [], null);
    // The server says the bot's bullet struck a body at 40 m (it moved into the path).
    t.land('bot', [40, 1.49, 0.05]);
    const cam = camera();
    const ends: Vec3[] = [];
    for (let i = 0; i < 60 && t.flying > 0; i++) {
      t.update(0.005, cam);
      for (const h of heads(t)) if (h[0] > 39) ends.push(h);
    }
    expect(ends.some((h) => Math.abs(h[0] - 40) < 1e-6 && Math.abs(h[2] - 0.05) < 1e-6)).toBe(true);
    // The other shooter's tracer still reaches the wall.
    expect(ends.some((h) => Math.abs(h[0] - 60) < 0.01)).toBe(true);
  });

  it('ignores a reported hit far off every tracer of that shooter', () => {
    const t = new Tracers(new Scene(), world);
    t.fire('bot', 'm4a1', eye, east, eye, [], null);
    t.land('bot', [20, 1.5, 15]);
    const cam = camera();
    let far = 0;
    for (let i = 0; i < 60 && t.flying > 0; i++) {
      t.update(0.005, cam);
      for (const h of heads(t)) far = Math.max(far, h[0]);
    }
    expect(far).toBeCloseTo(60, 2);
  });

  it('leaves a drifting smoke trail behind a sniper round only, which fades in about a second', () => {
    const t = new Tracers(new Scene(), world);
    const cam = camera();
    t.fire('me', 'm4a1', eye, east, eye, [], null);
    for (let i = 0; i < 10; i++) t.update(0.016, cam);
    expect(t.smoke).toBe(0);
    t.fire('me', 'sniper', eye, east, eye, [], null);
    t.update(0.016, cam);
    expect(t.smoke).toBeGreaterThan(2);
    // The round reaches the wall in under a tenth of a second; the whole trail is laid by then.
    for (let i = 0; i < 9; i++) t.update(0.016, cam);
    const n = t.smoke;
    expect(n).toBeGreaterThan(10);
    const a = t.trails.instanceMatrix.array;
    const y0 = a[13]!;
    for (let i = 0; i < 20; i++) t.update(0.016, cam);
    expect(t.smoke).toBe(n);
    // It drifts: up a little, with the wind.
    expect(a[13]!).toBeGreaterThan(y0);
    for (let i = 0; i < 80; i++) t.update(0.016, cam);
    expect(t.smoke).toBe(0);
  });

  it('keeps a fixed pool: a long burst of fire reuses the oldest slots', () => {
    const t = new Tracers(new Scene(), world);
    for (let i = 0; i < 1000; i++) t.fire('me', 'sniper', eye, east, eye, [], null);
    t.update(0.05, camera());
    expect(t.flying).toBeLessThanOrEqual(t.streaks.instanceMatrix.count);
    expect(t.smoke).toBeLessThanOrEqual(t.trails.instanceMatrix.count);
  });
});
