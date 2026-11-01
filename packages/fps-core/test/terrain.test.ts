import { describe, expect, it } from 'vitest';
import { STATS, Terrain, createWorld, raycastWorld, sightBlocked, type TerrainData, type Vec3 } from '@duty-shooter/fps-core';
import { moveGrenade } from '../src/combat/grenade';
import { box, createHeadlessMatch, createNetworkedMatch, usercmd, type HeadlessMatch } from '@duty-shooter/fps-core/harness';
import { hold, horizontalSpeed, me, ticks } from './support/movement';

/** Terrain over x and z from -`half` to `half`, its height a function of position. */
function terrainOf(height: (x: number, z: number) => number, options: { half?: number; cell?: number; water?: (x: number, z: number) => number } = {}): TerrainData {
  const half = options.half ?? 40;
  const cell = options.cell ?? 1;
  const n = Math.round((2 * half) / cell);
  const grid = (f: (x: number, z: number) => number) => {
    const out = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) out[j * (n + 1) + i] = f(-half + i * cell, -half + j * cell);
    return out;
  };
  const water = options.water;
  return { origin: [-half, -half], cell, columns: n, rows: n, heights: grid(height), palette: ['dirt'], ...(water ? { water: grid(water) } : {}) };
}

/** Player 'p' on terrain, looking down -Z. */
function onTerrain(terrain: TerrainData, position: readonly [number, number, number] = [0, 5, 0], solids: Parameters<typeof createHeadlessMatch>[0]['solids'] = []): HeadlessMatch {
  return createHeadlessMatch({ solids, terrain, players: [{ id: 'p', team: 1, position }] });
}

const flat = (y: number) => () => y;
/** A slope that climbs toward -Z at `degrees`. */
const rising = (degrees: number) => (_x: number, z: number) => -z * Math.tan((degrees * Math.PI) / 180);
const forward = usercmd({ forward: 1 });

describe('terrain sampling', () => {
  const t = new Terrain({ origin: [10, 20], cell: 2, columns: 1, rows: 1, heights: [1, 3, 5, 9], palette: ['dirt'] });

  it('reads each corner', () => {
    expect(t.heightAt(10, 20)).toBe(1);
    expect(t.heightAt(12, 20)).toBe(3);
    expect(t.heightAt(10, 22)).toBe(5);
    expect(t.heightAt(12, 22)).toBe(9);
  });

  it('is flat across the two triangles either side of the diagonal from (x+1, z) to (x, z+1)', () => {
    // Near triangle: from corner 1, half of the 2 it climbs along x and a quarter of the 4 along z.
    expect(t.heightAt(11, 20.5)).toBeCloseTo(1 + 1 + 1, 9);
    // On the diagonal, the two corners either side of it average: (3 + 5) / 2.
    expect(t.heightAt(11, 21)).toBeCloseTo(4, 9);
    // Far triangle: from corner 9, a quarter of the 6 it falls along z and a quarter of the 4 along x.
    expect(t.heightAt(11.5, 21.5)).toBeCloseTo(9 - 0.25 * 6 - 0.25 * 4, 9);
  });

  it('has no ground outside its rectangle', () => {
    expect(t.heightAt(9.99, 21)).toBe(-Infinity);
    expect(t.heightAt(11, 22.01)).toBe(-Infinity);
  });
});

describe('standing and walking on terrain', () => {
  it('falls onto terrain and stands on it', () => {
    const match = onTerrain(terrainOf(flat(2)), [0, 3, 0]);

    const outputs = hold(match, ticks(1.5), usercmd({}));

    expect(outputs.some((p) => p.movement === 'airborne')).toBe(true);
    expect(outputs.at(-1)).toMatchObject({ movement: 'walk', position: [0, 2, 0], velocity: [0, 0, 0] });
  });

  it('comes up out of the ground if it starts under it', () => {
    const match = onTerrain(terrainOf(flat(2)), [0, 0, 0]);

    hold(match, 2, usercmd({}));

    expect(me(match.latest).position[1]).toBe(2);
  });

  it('walks up a slope at walk speed, feet on the ground', () => {
    const slope = terrainOf(rising(30));
    const terrain = new Terrain(slope);
    const match = onTerrain(slope, [0, 0, 0]);

    const outputs = hold(match, ticks(3), forward);

    expect(outputs.some((p) => p.movement === 'airborne')).toBe(false);
    const last = outputs.at(-1)!;
    expect(last.position[2]).toBeLessThan(-STATS.movement.walkSpeed.value * 2);
    expect(last.position[1]).toBeCloseTo(terrain.heightAt(last.position[0], last.position[2]), 6);
    expect(horizontalSpeed(last)).toBeCloseTo(STATS.movement.walkSpeed.value, 1);
  });

  it('walks down a slope without leaving the ground', () => {
    const slope = terrainOf(rising(30));
    const match = onTerrain(slope, [0, 0, 0]);
    hold(match, 2, usercmd({}));

    const outputs = hold(match, ticks(3), usercmd({ forward: -1 }));

    expect(outputs.some((p) => p.movement === 'airborne')).toBe(false);
    expect(outputs.at(-1)!.position[1]).toBeLessThan(-3);
  });

  it('falls off the edge of the terrain: a map needs a Boundary there', () => {
    const match = onTerrain(terrainOf(flat(0), { half: 2 }), [0, 0, 0]);

    hold(match, ticks(1.5), forward);

    expect(me(match.latest).position[1]).toBeLessThan(-1);
  });
});

describe('the slope limit', () => {
  const limit = STATS.terrain.slopeLimit.value;
  /** Level ground around the origin, then a slope of `degrees` up toward -Z from z = -5. */
  const foot = (degrees: number) => (_x: number, z: number) => Math.max(0, (-5 - z) * Math.tan((degrees * Math.PI) / 180));
  const sprint = usercmd({ forward: 1, buttons: ['Sprint'] });

  it('walks up ground just under the limit', () => {
    const match = onTerrain(terrainOf(foot(limit - 1)), [0, 0, 0]);

    hold(match, ticks(4), sprint);

    expect(me(match.latest).position[1]).toBeGreaterThan(10);
  });

  it('is stopped at the foot of ground just over the limit, still on its feet', () => {
    const match = onTerrain(terrainOf(foot(limit + 1)), [0, 0, 0]);

    const outputs = hold(match, ticks(4), sprint);

    const last = outputs.at(-1)!;
    expect(last.position[1]).toBeLessThan(0.3);
    expect(last.position[2]).toBeGreaterThan(-5.5);
    expect(last.movement).not.toBe('airborne');
    expect(horizontalSpeed(last)).toBeLessThan(0.5);
  });

  it('runs along the foot of a steep slope when heading across it', () => {
    const match = onTerrain(terrainOf(foot(70)), [0, 0, -4]);

    hold(match, ticks(2), usercmd({ forward: 1, yaw: -Math.PI / 4, buttons: ['Sprint'] }));

    const last = me(match.latest);
    expect(last.position[0]).toBeGreaterThan(3);
    expect(last.position[1]).toBeLessThan(0.3);
  });

  it('slides down ground past the limit to the bottom, and stands up there unhurt', () => {
    const match = onTerrain(terrainOf(foot(60)), [0, 30, -20]);

    const outputs = hold(match, ticks(6), usercmd({}));

    const moving = outputs.filter((p) => p.position[2] > -20 && p.position[2] < -6);
    expect(moving.length).toBeGreaterThan(10);
    expect(moving.every((p) => p.movement === 'airborne')).toBe(true);
    expect(Math.max(...moving.map((p) => Math.hypot(...p.velocity)))).toBeLessThanOrEqual(STATS.terrain.slopeSlideSpeed.value + 1e-6);
    const last = outputs.at(-1)!;
    expect(last.position[1]).toBe(0);
    expect(last.movement).toBe('walk');
    expect(last.health).toBe(STATS.health.max.value);
  });

  it('counts a long fall onto a steep slope as a fall', () => {
    const match = onTerrain(terrainOf(foot(60)), [0, 60, -20]);

    hold(match, ticks(3), usercmd({}));

    expect(me(match.latest).health).toBeLessThan(STATS.health.max.value);
  });

  it('cannot jump or run up ground past the limit', () => {
    const match = onTerrain(terrainOf(foot(60)), [0, 26, -20]);
    let peak = -Infinity;

    for (let i = 0; i < ticks(3); i++) peak = Math.max(peak, me(match.step({ p: usercmd({ forward: 1, buttons: i % 2 ? ['Jump', 'Sprint'] : ['Sprint'] }) })).position[1]);

    expect(peak).toBeLessThan(26.1);
  });

  it('never climbs a cliff in a sprinting jump: the most it gets is the jump', () => {
    const match = onTerrain(terrainOf(foot(80)), [0, 0, 0]);
    hold(match, ticks(0.6), sprint);

    const outputs = hold(match, ticks(1), usercmd({ forward: 1, buttons: ['Sprint', 'Jump'] }));

    expect(Math.max(...outputs.map((p) => p.position[1]))).toBeLessThan(STATS.movement.jumpHeight.value + 0.1);
  });

  it('keeps every way of moving off a summit ringed by steep ground', () => {
    const hill = terrainOf((x, z) => {
      const r = Math.hypot(x, z);
      return r < 20 ? 30 - r * 0.2 : Math.max(0, 26 - (r - 20) * 2);
    });
    const yaws = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

    for (const yaw of yaws) {
      const match = onTerrain(hill, [Math.sin(yaw) * 36, 0, Math.cos(yaw) * 36]);
      let peak = 0;
      for (let i = 0; i < ticks(6); i++) peak = Math.max(peak, me(match.step({ p: usercmd({ forward: 1, yaw, buttons: i % 20 < 2 ? ['Jump', 'TacticalSprint'] : ['TacticalSprint'] }) })).position[1]);
      expect(peak).toBeLessThan(3);
    }
  });
});

describe('terrain and solids together', () => {
  const stand = STATS.stance.standHullHeight.value;

  it('stands on a solid above the ground: a bridge, with the ground below it', () => {
    const deck = box({ min: [-3, 3, -30], max: [3, 3.5, 30], material: 'concrete' });
    const match = onTerrain(terrainOf(flat(0)), [0, 4, 0], [deck]);

    hold(match, ticks(3), usercmd({ forward: 1 }));

    const last = me(match.latest);
    expect(last.position[1]).toBe(3.5);
    expect(last.position[2]).toBeLessThan(-8);
  });

  it('is stopped by a wall standing on a slope', () => {
    const wall = box({ min: [-20, -20, -11], max: [20, 20, -10], material: 'brick' });
    const match = onTerrain(terrainOf(rising(20)), [0, 0, 0], [wall]);

    hold(match, ticks(4), usercmd({ forward: 1 }));

    expect(me(match.latest).position[2]).toBeCloseTo(-10 + STATS.stance.hullHalfWidth.value, 6);
  });

  it('stands on a solid on a steep slope, a ledge cut into it', () => {
    const ledge = box({ min: [-3, -5, -24], max: [3, 33, -20], material: 'concrete' });
    const slope = terrainOf((_x, z) => -z * 1.5);
    const match = onTerrain(slope, [0, 33.5, -22], [ledge]);

    hold(match, ticks(1), usercmd({}));

    expect(me(match.latest)).toMatchObject({ movement: 'walk', position: [0, 33, -22] });
  });

  it('will not walk uphill into a gap too low for the hull', () => {
    const roof = box({ min: [-20, 2 + stand, -30], max: [20, 2 + stand + 1, -5], material: 'concrete' });
    const match = onTerrain(terrainOf(rising(20)), [0, 0, 0], [roof]);

    hold(match, ticks(4), usercmd({ forward: 1 }));

    const last = me(match.latest);
    expect(last.position[1] + stand).toBeLessThanOrEqual(2 + stand + 1e-6);
  });
});

describe('bullets and terrain', () => {
  const hill = terrainOf((x) => Math.max(0, 3 - Math.abs(x) / 2));
  const world = (solids: Parameters<typeof createWorld>[0] = []) => createWorld(solids, { terrain: hill });

  it('stops a ray at the ground, reporting the point, the normal and the material', () => {
    const hit = raycastWorld(world(), [-10, 1, 0], [10, 1, 0]);

    expect(hit?.point[0]).toBeCloseTo(-4, 6);
    expect(hit?.point[1]).toBeCloseTo(1, 6);
    expect(hit?.normal[0]).toBeLessThan(0);
    expect(hit?.normal[1]).toBeGreaterThan(0);
    expect(hit?.material).toBe('dirt');
  });

  it('finds the ground from straight above and against a slope, between corners', () => {
    const down = raycastWorld(world(), [1.25, 9, 3.4], [1.25, -1, 3.4]);
    expect(down?.point[1]).toBeCloseTo(2.375, 5);

    const shallow = raycastWorld(world(), [-20, 2.6, 0.3], [0, 2.6, 0.7]);
    expect(shallow?.point[0]).toBeCloseTo(-0.8, 5);
  });

  it('passes over the crest, and misses ground it never reaches', () => {
    expect(raycastWorld(world(), [-10, 3.2, 0], [10, 3.2, 0])).toBeNull();
    expect(raycastWorld(world(), [-10, 1, 0], [-5, 1, 0])).toBeNull();
  });

  it('counts a ray ending exactly on the ground as a miss, so a foot in view stays in view', () => {
    expect(sightBlocked(world(), [-10, 1, 0], [-4, 1, 0])).toBe(false);
  });

  it('takes whichever comes first of a solid and the ground', () => {
    const near = box({ min: [-8, 0, -1], max: [-7, 2, 1], material: 'wood' });
    const far = box({ min: [8, 0, -1], max: [9, 2, 1], material: 'wood' });

    expect(raycastWorld(world([near]), [-10, 1, 0], [10, 1, 0])?.material).toBe('wood');
    expect(raycastWorld(world([far]), [-10, 1, 0], [10, 1, 0])?.material).toBe('dirt');
  });

  it('hides what is behind a hill, and not what is over it', () => {
    expect(sightBlocked(world(), [-8, 1.6, 0], [8, 1.6, 0])).toBe(true);
    expect(sightBlocked(world(), [-8, 5, 0], [8, 5, 0])).toBe(false);
  });

  it('has no ground to hit past its rectangle, and enters it from outside', () => {
    expect(raycastWorld(world(), [-100, 1, 100], [100, 1, 100])).toBeNull();
    expect(raycastWorld(world(), [-100, 1, 0], [100, 1, 0])?.point[0]).toBeCloseTo(-4, 5);
  });

  /** One player firing level at another 16 m away, over this ground: everything that happened. */
  const shootAcross = (ground: TerrainData) => {
    const east = usercmd({ yaw: -Math.PI / 2 });
    const match = createHeadlessMatch({
      solids: [],
      terrain: ground,
      players: [{ id: 'a', team: 1, position: [-8, 0, 0], yaw: -Math.PI / 2 }, { id: 'b', team: 2, position: [8, 0, 0], yaw: Math.PI / 2 }],
    });
    match.run(ticks(1.5), () => ({ a: east }));
    const fired = [match.step({ a: usercmd({ yaw: -Math.PI / 2, buttons: ['Fire'], firePresses: [0] }) }), ...match.run(ticks(0.3), () => ({ a: east }))];
    return fired.flatMap((o) => o.events);
  };

  it('reaches the player across level ground', () => {
    expect(shootAcross(terrainOf(flat(0))).filter((e) => e.type === 'hit')).toHaveLength(1);
  });

  it('stops a shot in the ground, with an impact there, and no hit on the player behind the hill', () => {
    const events = shootAcross(hill);

    expect(events.filter((e) => e.type === 'hit')).toEqual([]);
    const impacts = events.flatMap((e) => (e.type === 'impact' ? [e] : []));
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({ material: 'dirt', side: 'entry' });
    expect(impacts[0]!.point[0]).toBeGreaterThan(-8);
    expect(impacts[0]!.point[0]).toBeLessThan(0);
  });

  it('never lets a bullet through the ground, whatever its material', () => {
    expect(shootAcross({ ...hill, palette: ['glass'] }).filter((e) => e.type === 'hit')).toEqual([]);
  });

  it('lands and rests a frag on the ground', () => {
    const w = world();
    const g = { id: 1, thrower: 'a', team: 1, position: [-9, 2, 0] as Vec3, velocity: [1, 0, 0] as Vec3, explodeAt: 99, resting: false };

    for (let i = 0; i < ticks(6) && !g.resting; i++) moveGrenade(g, w, 1 / 60);

    expect(g.resting).toBe(true);
    expect(g.position[1]).toBeGreaterThanOrEqual(w.terrain!.heightAt(g.position[0], g.position[2]));
    expect(g.position[1]).toBeLessThan(w.terrain!.heightAt(g.position[0], g.position[2]) + 0.01);
  });

  it('bounces a frag off a slope, away from it', () => {
    const w = world();
    const g = { id: 1, thrower: 'a', team: 1, position: [-5, 1.2, 0] as Vec3, velocity: [12, 0, 0] as Vec3, explodeAt: 99, resting: false };

    for (let i = 0; i < 20; i++) moveGrenade(g, w, 1 / 60);

    expect(g.velocity[0]).toBeLessThan(12);
    expect(g.position[1]).toBeGreaterThanOrEqual(w.terrain!.heightAt(g.position[0], g.position[2]));
  });
});

describe('mantling onto terrain', () => {
  const jump = usercmd({ buttons: ['Jump'] });
  const AT_BANK: Vec3 = [0, 0, -0.5];
  /** Level ground, then a bank `height` tall from z = -1 to z = -1.5, then level again: a shelf the player looks at from `AT_BANK`. */
  const shelf = (height: number) => terrainOf((_x, z) => (z >= -1 ? 0 : z <= -1.5 ? height : height * (-1 - z) * 2), { cell: 0.5, half: 20 });

  it('mantles up a bank too steep to walk and ends standing on the shelf', () => {
    const height = 1;
    const match = onTerrain(shelf(height), AT_BANK);

    const outputs = hold(match, ticks(2), jump);

    expect(outputs.some((p) => p.movement === 'mantle')).toBe(true);
    expect(outputs.at(-1)).toMatchObject({ movement: 'walk' });
    expect(outputs.at(-1)!.position[1]).toBe(height);
    expect(outputs.at(-1)!.position[2]).toBeLessThan(-1.5);
  });

  it('does not mantle a bank above the highest band: that is a plain jump', () => {
    const match = onTerrain(shelf(STATS.mantle.highClimbMaxHeight.value + 0.3), AT_BANK);

    const outputs = hold(match, ticks(1.5), jump);

    expect(outputs.some((p) => p.movement === 'mantle')).toBe(false);
    expect(outputs.at(-1)!.position[1]).toBe(0);
  });

  it('does not mantle up a long steep face, where there is no top to stand on', () => {
    const match = onTerrain(terrainOf((_x, z) => Math.max(0, (-1 - z) * 2)), AT_BANK);

    const outputs = hold(match, ticks(1.5), jump);

    expect(outputs.some((p) => p.movement === 'mantle')).toBe(false);
  });

  it('jumps, not mantles, on a slope it can walk', () => {
    const match = onTerrain(terrainOf(rising(40)), [0, 0, 0]);
    hold(match, 2, usercmd({}));

    const outputs = hold(match, ticks(0.5), jump);

    expect(outputs.some((p) => p.movement === 'mantle')).toBe(false);
    expect(outputs.some((p) => p.movement === 'airborne')).toBe(true);
  });

  it('will not mantle where a solid fills the shelf', () => {
    const wall = box({ min: [-5, 0, -8], max: [5, 6, -1.7], material: 'brick' });
    const match = onTerrain(shelf(1), AT_BANK, [wall]);

    const outputs = hold(match, ticks(1.5), jump);

    expect(outputs.some((p) => p.movement === 'mantle')).toBe(false);
  });

  it('mantles a solid from ground level as it always did', () => {
    const crate = box({ min: [-1, 0, -2], max: [1, 1, -0.5], material: 'wood' });
    const match = onTerrain(terrainOf(flat(0)), [0, 0, 0], [crate]);

    const outputs = hold(match, ticks(2), jump);

    expect(outputs.some((p) => p.movement === 'mantle')).toBe(true);
    expect(outputs.at(-1)!.position[1]).toBe(1);
  });
});

describe('wading', () => {
  const { walkSpeed, sprintSpeed } = STATS.movement;
  const { wadeDepth, wadeMultiplier } = STATS.terrain;
  /** Speed after a good run at it over flat ground under water `depth` deep. */
  const speedIn = (depth: number, cmd = forward, extra: Parameters<typeof onTerrain>[2] = []) => {
    const match = onTerrain(terrainOf(flat(0), { water: flat(depth) }), [0, 0, 0], extra);
    return horizontalSpeed(hold(match, ticks(2), cmd).at(-1)!);
  };

  it('walks on the bed of the water, slowed slightly', () => {
    const match = onTerrain(terrainOf(flat(0), { water: flat(0.6) }), [0, 0, 0]);

    const last = hold(match, ticks(2), forward).at(-1)!;

    expect(last.position[1]).toBe(0);
    expect(horizontalSpeed(last)).toBeCloseTo(walkSpeed.value * wadeMultiplier.value, 1);
    expect(speedIn(0.6, usercmd({ forward: 1, buttons: ['Sprint'] }))).toBeCloseTo(sprintSpeed.value * wadeMultiplier.value, 1);
  });

  it('is not slowed by a wet bank, or at a level below the feet', () => {
    expect(speedIn(wadeDepth.value / 2)).toBeCloseTo(walkSpeed.value, 1);
    expect(speedIn(-1)).toBeCloseTo(walkSpeed.value, 1);
  });

  it('is not slowed on a bridge above the water', () => {
    const deck = box({ min: [-3, 1, -30], max: [3, 1.5, 30], material: 'wood' });
    const match = onTerrain(terrainOf(flat(0), { water: flat(0.6) }), [0, 1.5, 0], [deck]);

    expect(horizontalSpeed(hold(match, ticks(2), forward).at(-1)!)).toBeCloseTo(walkSpeed.value, 1);
  });
});

describe('a client on terrain', () => {
  it('predicts walking over hills as the server moves it, with no correction', () => {
    const hills = terrainOf((x, z) => 3 * Math.sin(x / 5) * Math.cos(z / 6));
    const match = createNetworkedMatch({ solids: [], terrain: hills, spawns: [{ position: [0, 5, 0], yaw: 0 }], latency: 0.05 });
    const walker = match.join('walker');
    match.run(ticks(1));

    let worst = 0;
    for (let t = 0; t < ticks(4); t++) {
      match.step({ walker: usercmd({ forward: 1, yaw: Math.sin(t / 40), buttons: t % 70 === 0 && t < 200 ? ['Jump'] : ['Sprint'] }) });
      worst = Math.max(worst, Math.hypot(...walker.client.correction));
    }

    expect(worst).toBeLessThan(1e-6);
    const seat = match.server.simulation.output().players[0]!;
    expect(seat.position[1]).toBeCloseTo(new Terrain(hills).heightAt(seat.position[0], seat.position[2]), 3);
  });
});

/** Cost at the island's size: 1 km at a metre a cell. `BENCH=1` to run. */
describe.skipIf(!process.env.BENCH)('terrain cost', () => {
  const rolling = (x: number, z: number) => 12 * Math.sin(x / 37) * Math.cos(z / 29) + 2 * Math.sin(x / 7 + z / 9);
  const island = terrainOf(rolling, { half: 500 });
  const nanos = (label: string, runs: number, work: (i: number) => void) => {
    for (let i = 0; i < runs; i++) work(i);
    const start = performance.now();
    for (let i = 0; i < runs; i++) work(i);
    const ns = ((performance.now() - start) * 1e6) / runs;
    console.log(`BENCH ${label}: ${ns.toFixed(0)} ns`);
    return ns;
  };

  it('samples and casts', () => {
    const t = new Terrain(island);
    const world = createWorld([], { terrain: island });
    let sink = 0;
    const spot = (i: number) => [((i * 7919) % 900) - 450, ((i * 104729) % 900) - 450] as const;
    nanos('heightAt', 2_000_000, (i) => (sink += t.heightAt(...spot(i))));
    nanos('steepAt', 2_000_000, (i) => (sink += t.steepAt(...spot(i)) ? 1 : 0));
    for (const reach of [13, 100, 300]) {
      nanos(`sight ray along the ground, ${reach} m`, 200_000, (i) => {
        const [x, z] = spot(i);
        const y = t.heightAt(x, z) + 1.6;
        const ex = x + reach * Math.cos(i);
        const ez = z + reach * Math.sin(i);
        sink += sightBlocked(world, [x, y, z], [ex, t.heightAt(ex, ez) + 1.6, ez]) ? 1 : 0;
      });
    }
    expect(sink).not.toBe(0);
  });

  it('moves 60 seats', () => {
    const players = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, team: 1 + (i % 2), position: [((i * 37) % 200) - 100, 40, ((i * 91) % 200) - 100] as const }));
    const tickMs = (options: { solids: Parameters<typeof createWorld>[0]; terrain?: TerrainData }) => {
      const match = createHeadlessMatch({ ...options, players: players.map((p) => ({ ...p, position: [...p.position] as Vec3 })) });
      const cmds = (t: number) => Object.fromEntries(players.map((p, i) => [p.id, usercmd({ forward: 1, yaw: i + t / 200, buttons: ['Sprint'] })]));
      match.run(300, cmds);
      const start = performance.now();
      match.run(1200, cmds);
      return (performance.now() - start) / 1200;
    };
    const floor = box({ min: [-500, -40, -500], max: [500, -20, 500], material: 'dirt' });
    tickMs({ solids: [floor] });
    const plain = tickMs({ solids: [floor] });
    tickMs({ solids: [], terrain: island });
    const ground = tickMs({ solids: [], terrain: island });
    console.log(`BENCH tick, 60 seats running: flat solid ${plain.toFixed(3)} ms, terrain ${ground.toFixed(3)} ms`);
  }, 120_000);
});
