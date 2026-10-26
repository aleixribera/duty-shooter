import { describe, expect, it } from 'vitest';
import { MATERIALS, STATS, TICK_SECONDS, createWorld, raycastWorld, segmentSolid, type PlayerOutput, type Solid, type SpawnPoint, type UserCmd, type Vec3 } from '@duty-shooter/fps-core';
import { createHeadlessMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { insidePolygon, mapSolids } from '../src/map/definition';
import { buildSurvivalTown } from '../src/map/survival-town';
import { REFERENCE, TOLERANCE } from '../src/map/survival-town-reference';

const map = buildSurvivalTown();
const solids = mapSolids(map);
const world = createWorld(solids);
const area = map.playArea!;
const HALF = STATS.stance.hullHalfWidth.value;
const HULL = STATS.stance.standHullHeight.value;

/** Yaw that moves a player from `a` toward `b` (yaw 0 looks -Z). */
function yawToward(a: Vec3, b: Vec3): number {
  return Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
}

/** A one-player match on the town with the player at `position`. */
function standAt(position: Vec3, yaw = 0) {
  return createHeadlessMatch({ solids, players: [{ id: 'p', team: 1, position, yaw }] });
}

function step(match: ReturnType<typeof standAt>, cmd: UserCmd): PlayerOutput {
  return match.step({ p: cmd }).players[0]!;
}

interface Leg {
  /** Where to get to (y checked within 0.3 m when given). */
  readonly to: Vec3;
  /** Press jump when blocked (mantles and climbs). */
  readonly climb?: boolean;
  readonly sprint?: boolean;
}

/** Walks a route leg by leg, steering straight at each point; returns where each leg ended, or throws where it got stuck. */
function walk(start: Vec3, legs: readonly Leg[], seconds = 8): PlayerOutput {
  const match = standAt(start, yawToward(start, legs[0]!.to));
  let out = step(match, usercmd({ yaw: yawToward(start, legs[0]!.to) }));
  for (const [n, leg] of legs.entries()) {
    let reached = false;
    for (let i = 0; i < seconds / TICK_SECONDS; i++) {
      const p = out.position;
      const flat = Math.hypot(leg.to[0] - p[0], leg.to[2] - p[2]);
      if (flat < 0.3 && Math.abs(leg.to[1] - p[1]) < 0.3 && out.movement !== 'mantle' && out.movement !== 'airborne') {
        reached = true;
        break;
      }
      const yaw = yawToward(p, leg.to);
      const buttons: ('Jump' | 'Sprint')[] = [];
      const blocked = Math.hypot(out.velocity[0], out.velocity[2]) < 0.5 && out.movement !== 'airborne' && out.movement !== 'mantle';
      if (leg.climb && blocked && i > 0) buttons.push('Jump');
      if (leg.sprint) buttons.push('Sprint');
      // Ease off near the point so the player stops on it.
      out = step(match, usercmd({ yaw, forward: flat < 0.6 ? 0.4 : 1, buttons }));
      if (!out.alive) throw new Error(`died on leg ${n}`);
    }
    if (!reached) throw new Error(`stuck on leg ${n} toward ${leg.to.map((v) => v.toFixed(2)).join(', ')} at ${out.position.map((v) => v.toFixed(2)).join(', ')} (${out.movement})`);
  }
  return out;
}

/** Whether a standing hull at `p` (feet) overlaps solid `s`, with `margin` of clearance. */
function hullTouches(s: Solid, p: Vec3, margin = 0): boolean {
  const h = HALF + margin;
  if (s.max[1] <= p[1] + 1e-3 || s.min[1] >= p[1] + HULL) return false;
  const o = s.orientation;
  if (!o) return s.max[0] > p[0] - h && s.min[0] < p[0] + h && s.max[2] > p[2] - h && s.min[2] < p[2] + h;
  // Separating axes in plan: the world x and z axes, and the solid's own x and z axes.
  const ax = o.axes[0];
  const az = o.axes[2];
  for (const axis of [[1, 0], [0, 1], [ax[0], ax[2]], [az[0], az[2]]] as const) {
    const l = Math.hypot(axis[0], axis[1]);
    const n = [axis[0] / l, axis[1] / l] as const;
    const hullR = h * (Math.abs(n[0]) + Math.abs(n[1]));
    const solidR = o.half[0] * Math.abs(ax[0] * n[0] + ax[2] * n[1]) + o.half[2] * Math.abs(az[0] * n[0] + az[2] * n[1]);
    const gap = Math.abs((o.center[0] - p[0]) * n[0] + (o.center[2] - p[2]) * n[1]);
    if (gap >= hullR + solidR) return false;
  }
  return true;
}

/** A point at distance `d` from the street axis on the north (s = -1) or south (s = 1) side. */
const at = (s: -1 | 1, x: number, y: number, d: number): Vec3 => [x, y, s * d];

/** The highest surface that holds players up at (x, z), at or below `y`. */
function surfaceBelow(x: number, z: number, y = 30): number {
  const a: Vec3 = [x, y, z];
  const b: Vec3 = [x, -1, z];
  const hit = world.movement.firstHit(a, b, (i) => segmentSolid(a, b, world.solids[i]!));
  return hit ? y + (-1 - y) * hit.t : 0;
}

describe('Survival Town: reference measurements', () => {
  for (const ref of REFERENCE) {
    it(`${ref.id} (${ref.value.toFixed(2)} m, ${ref.tolerance}) is within ±${TOLERANCE[ref.tolerance]} m`, () => {
      const measured = map.measurements.find((m) => m.id === ref.id);
      expect(measured, `the map does not measure ${ref.id}`).toBeDefined();
      expect(Math.abs(measured!.value - ref.value)).toBeLessThanOrEqual(TOLERANCE[ref.tolerance]);
    });
  }

  it('measures nothing the reference file lacks', () => {
    expect(map.measurements.map((m) => m.id).sort()).toEqual(REFERENCE.map((r) => r.id).sort());
  });
});

describe('Survival Town: spawns', () => {
  const sets: [string, readonly SpawnPoint[]][] = [
    ['FFA', map.spawns.ffa],
    ['team 1', map.spawns.teams![0]],
    ['team 2', map.spawns.teams![1]],
  ];
  for (const [name, set] of sets) {
    it(`every ${name} spawn is inside the play area, clear of geometry and on the ground`, () => {
      expect(set.length).toBeGreaterThanOrEqual(6);
      for (const spawn of set) {
        expect(insidePolygon(area, spawn.position[0], spawn.position[2])).toBe(true);
        const match = standAt(spawn.position, spawn.yaw);
        let out!: PlayerOutput;
        for (let i = 0; i < 30; i++) out = step(match, usercmd({ yaw: spawn.yaw }));
        expect(out.position[0]).toBeCloseTo(spawn.position[0], 6);
        expect(out.position[2]).toBeCloseTo(spawn.position[2], 6);
        expect(out.position[1]).toBeCloseTo(spawn.position[1], 6);
        expect(out.movement).not.toBe('airborne');
        // Nothing within 5 cm of the spawn's hull.
        const [x, , z] = spawn.position;
        const near = world.movement.inRect(x - HALF - 0.05, z - HALF - 0.05, x + HALF + 0.05, z + HALF + 0.05).filter((i) => hullTouches(world.solids[i]!, spawn.position, 0.05));
        expect(near.map((i) => `${spawn.position.join(',')}: ${world.solids[i]!.material} ${world.solids[i]!.min.map((v) => v.toFixed(2))}..${world.solids[i]!.max.map((v) => v.toFixed(2))}`)).toEqual([]);
      }
    });
  }

  it('each team spawns in its own back yard, the two sets mirrored across the street', () => {
    const [blue, orange] = map.spawns.teams!;
    for (const s of blue) expect(s.position[2]).toBeLessThan(-32);
    for (const s of orange) expect(s.position[2]).toBeGreaterThan(32);
    expect(orange.map((s) => [s.position[0], -s.position[2]])).toEqual(blue.map((s) => [s.position[0], s.position[2]]));
  });

  it('spawns face into the map', () => {
    for (const spawn of [...map.spawns.ffa, ...map.spawns.teams!.flat()]) {
      const [x, , z] = spawn.position;
      const forward = [-Math.sin(spawn.yaw), -Math.cos(spawn.yaw)];
      expect(forward[0]! * -x + forward[1]! * -z).toBeGreaterThan(0);
    }
  });
});

describe('Survival Town: routes', () => {
  for (const [s, side] of [
    [-1, 'north'],
    [1, 'south'],
  ] as const) {
    it(`${side}: up the yard stairs, across the deck, through the upper floor, down the inside stairs and out the front door`, () => {
      const end = walk(at(s, -14, 0, 34.55), [
        { to: at(s, -12.7, 0, 34.55) },
        { to: at(s, -7.3, 3, 34.55) },
        { to: at(s, 0.455, 3, 33.3) },
        { to: at(s, 0.455, 3, 30) },
        { to: at(s, 3.455, 3, 25) },
        { to: at(s, 3.455, 3, 22.8) },
        { to: at(s, 2.25, 3, 16) },
        { to: at(s, -0.2, 3, 22.3) },
        { to: at(s, -1.35, 3, 22.3) },
        { to: at(s, -1.35, 0, 15.2) },
        { to: at(s, 0.955, 0, 15.0) },
        { to: at(s, 0.955, 0, 12.6) },
        { to: at(s, 0.955, 0, 9.5) },
      ]);
      expect(end.alive).toBe(true);
    });

    it(`${side}: in through the garage, the utility room and the den, out the back door to the yard`, () => {
      walk(at(s, -12.5, 0, 7), [
        { to: at(s, -12.5, 0, 15) },
        { to: at(s, -13.545, 0, 18.5) },
        { to: at(s, -13.545, 0, 21.5) },
        { to: at(s, -9.2, 0, 25.455) },
        { to: at(s, -6.5, 0, 25.455) },
        { to: at(s, -3.545, 0, 29.5) },
        { to: at(s, -3.545, 0, 33) },
        { to: at(s, -3.5, 0, 38) },
      ]);
    });

    it(`${side}: from the garage into the house, and out the utility room's back door`, () => {
      walk(at(s, -12.5, 0, 7), [
        { to: at(s, -12.5, 0, 16.455) },
        { to: at(s, -6.5, 0, 16.455) },
        { to: at(s, -9.2, 0, 25.455) },
        { to: at(s, -11.545, 0, 25.5) },
        { to: at(s, -11.545, 0, 29.5) },
      ]);
    });

    it(`${side}: in through the front window by the planter and the porch roof`, () => {
      const end = walk(at(s, 3.8, 0, 9.6), [
        { to: at(s, 3.8, 0.8, 11.4), climb: true },
        { to: at(s, 3.5, 2.7, 13.2), climb: true },
        { to: at(s, 3.0, 3, 15.5), climb: true },
      ]);
      expect(end.position[1]).toBeCloseTo(3, 6);
    });

    it(`${side}: onto the garage roof from the air-conditioning unit`, () => {
      const end = walk(at(s, -15, 0, 31), [
        { to: at(s, -15, 1.2, 28.1), climb: true },
        { to: at(s, -15, surfaceBelow(-15, s * 26.5), 26.5), climb: true },
        { to: at(s, -12, 4.5, 20) },
      ]);
      expect(end.position[1]).toBeGreaterThan(4.3);
    });

    it(`${side}: from the deck over the den roof to the ridge of the main roof, and across to the garage roof`, () => {
      const start = at(s, -5, 3, 33.5);
      walk(start, [
        { to: at(s, -5, surfaceBelow(-5, s * 30), 30), climb: true },
        { to: at(s, -3.2, surfaceBelow(-3.2, s * 25), 25) },
        { to: at(s, -1, surfaceBelow(-1, s * 25), 25), climb: true },
        { to: at(s, 2, 7.0, 25) },
      ]);
      walk(at(s, -6, surfaceBelow(-6, s * 22), 22), [{ to: at(s, -10, surfaceBelow(-10, s * 22), 22), climb: true }]);
    });
  }

  it('onto the bus roof over its hood', () => {
    const u: [number, number] = [Math.cos(0.28), -Math.sin(0.28)];
    const c = [5.4, 2.2] as const;
    const p = (k: number): Vec3 => [c[0] + u[0] * k, surfaceBelow(c[0] + u[0] * k, c[1] + u[1] * k), c[1] + u[1] * k];
    const end = walk([c[0] + u[0] * 7.5, 0, c[1] + u[1] * 7.5], [
      { to: p(5.2), climb: true },
      { to: p(3.0), climb: true },
      { to: p(-4) },
    ]);
    expect(end.position[1]).toBeCloseTo(3.1, 6);
  });

  it('onto the moving van over its cab', () => {
    const u: [number, number] = [Math.cos(0.05), -Math.sin(0.05)];
    const c = [-6.3, -3.0] as const;
    const p = (k: number): Vec3 => [c[0] + u[0] * k, surfaceBelow(c[0] + u[0] * k, c[1] + u[1] * k), c[1] + u[1] * k];
    const end = walk([c[0] + u[0] * 5.6, 0, c[1] + u[1] * 5.6], [
      { to: p(4.0), climb: true },
      { to: p(2.7), climb: true },
      { to: p(0), climb: true },
      { to: p(-3) },
    ]);
    expect(end.position[1]).toBeCloseTo(3.4, 6);
  });
});

/** Points just inside every edge of the play area, every `spacing` m, with the outward direction. */
function edgeSamples(spacing: number, inset: number): { point: [number, number]; out: [number, number] }[] {
  const samples: { point: [number, number]; out: [number, number] }[] = [];
  for (let i = 0; i < area.length; i++) {
    const [ax, az] = area[i]!;
    const [bx, bz] = area[(i + 1) % area.length]!;
    const len = Math.hypot(bx - ax, bz - az);
    let n: [number, number] = [-(bz - az) / len, (bx - ax) / len];
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if (insidePolygon(area, mx + n[0] * 0.1, mz + n[1] * 0.1)) n = [-n[0], -n[1]];
    for (let t = spacing / 2; t < len; t += spacing) {
      const x = ax + ((bx - ax) * t) / len - n[0] * inset;
      const z = az + ((bz - az) * t) / len - n[1] * inset;
      if (insidePolygon(area, x, z)) samples.push({ point: [x, z], out: n });
    }
  }
  return samples;
}

describe('Survival Town: containment', () => {
  const escapes: [string, (i: number) => ('Jump' | 'Sprint' | 'TacticalSprint' | 'Crouch')[]][] = [
    ['sprint-jumps', (i) => (i % 20 === 0 ? ['Sprint', 'Jump'] : ['Sprint'])],
    ['tactical sprint slides', (i) => (i < 40 ? ['TacticalSprint'] : i % 30 === 0 ? ['Crouch'] : [])],
    ['mantles', (i) => (i % 10 === 0 ? ['Jump'] : [])],
  ];

  for (const [name, buttons] of escapes) {
    it(`${name} toward the boundary, from the ground, fences and roofs, never leave the play area`, () => {
      const escaped: string[] = [];
      for (const { point, out } of edgeSamples(2, 1.2)) {
        const [x, z] = point;
        const y = surfaceBelow(x, z);
        const start: Vec3 = [x, y + 0.02, z];
        // Skip points inside something (a wall or a roof's clip column).
        const blocked = world.movement.inRect(x - HALF, z - HALF, x + HALF, z + HALF).some((i) => hullTouches(world.solids[i]!, [start[0], start[1] + 0.05, start[2]]));
        if (blocked) continue;
        const yaw = Math.atan2(-out[0], -out[1]);
        const match = standAt(start, yaw);
        let p!: PlayerOutput;
        for (let i = 0; i < 4 / TICK_SECONDS; i++) p = step(match, usercmd({ yaw, forward: 1, buttons: buttons(i) }));
        if (!insidePolygon(area, p.position[0], p.position[2])) escaped.push(`${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)} -> ${p.position.map((v) => v.toFixed(1)).join(', ')}`);
      }
      expect(escaped).toEqual([]);
    });
  }
});

describe('Survival Town: bullets and invisible blockers', () => {
  it('every hidden solid is player clip, so no invisible wall stops a bullet', () => {
    expect(map.hiddenSolids.filter((s) => s.blocks !== 'players')).toEqual([]);
  });

  it('a bullet fired along and through every player clip solid is never stopped by one', () => {
    for (const s of map.hiddenSolids) {
      const c: Vec3 = [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2];
      for (const axis of [0, 1, 2] as const) {
        const a: [number, number, number] = [...c];
        const b: [number, number, number] = [...c];
        a[axis] = s.min[axis] - 0.5;
        b[axis] = s.max[axis] + 0.5;
        const hit = raycastWorld(world, a, b);
        if (hit) expect(world.solids[hit.solid]!.blocks).not.toBe('players');
      }
    }
  });

  it('shots fired out across the boundary land beyond it', () => {
    for (const { point, out } of edgeSamples(3, 1)) {
      const from: Vec3 = [point[0], surfaceBelow(point[0], point[1]) + 1.6, point[1]];
      const to: Vec3 = [from[0] + out[0] * 60, from[1] - 60 * Math.tan(0.12), from[2] + out[1] * 60];
      const hit = raycastWorld(world, from, to);
      // Either it lands on the ground or scenery outside, or it hit drawn geometry before the edge.
      if (hit && insidePolygon(area, hit.point[0], hit.point[2])) expect(world.solids[hit.solid]!.blocks).toBe('both');
    }
  });
});

describe('Survival Town: materials and surfaces', () => {
  it('every solid has a footstep material and a penetration row', () => {
    for (const s of solids) {
      expect(MATERIALS).toContain(s.material);
      expect(STATS.penetration.materials[s.material]).toBeDefined();
    }
  });

  it('no two drawn surfaces lie in the same plane facing the same way and overlapping (z-fighting)', () => {
    const boxes = map.solids.filter((s) => !s.orientation);
    const fights: string[] = [];
    for (const axis of [0, 1, 2] as const) {
      const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
      for (const side of ['min', 'max'] as const) {
        const planes = new Map<string, Solid[]>();
        for (const s of boxes) {
          const key = s[side][axis].toFixed(4);
          planes.set(key, [...(planes.get(key) ?? []), s]);
        }
        for (const group of planes.values()) {
          for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
              const a = group[i]!;
              const b = group[j]!;
              const overlapU = Math.min(a.max[u]!, b.max[u]!) - Math.max(a.min[u]!, b.min[u]!);
              const overlapV = Math.min(a.max[v]!, b.max[v]!) - Math.max(a.min[v]!, b.min[v]!);
              if (overlapU > 1e-4 && overlapV > 1e-4) fights.push(`${side}${'xyz'[axis]} ${a.min.join(',')}..${a.max.join(',')} / ${b.min.join(',')}..${b.max.join(',')}`);
            }
          }
        }
      }
    }
    expect(fights.slice(0, 40)).toEqual([]);
  });
});

describe('Survival Town: camera spots and paths', () => {
  const insideSolid = (p: Vec3) => map.solids.some((s) => !s.orientation && p.every((v, i) => v > s.min[i]! && v < s.max[i]!));

  it('has at least 12 reference spots, each in open air', () => {
    expect(map.referenceSpots.length).toBeGreaterThanOrEqual(12);
    for (const spot of map.referenceSpots) expect(insideSolid(spot.position), spot.name).toBe(false);
  });

  it('the benchmark path never passes through a wall', () => {
    const path = map.benchmarkPath;
    for (let i = 0; i + 1 < path.length; i++) {
      const hit = raycastWorld(world, path[i]!.position, path[i + 1]!.position);
      expect(hit, `leg ${i}`).toBeNull();
    }
  });

  it('indoor zones cover both houses and garages', () => {
    for (const p of [at(-1, 0, 1, 20), at(1, 0, 1, 20), at(-1, 2, 4, 20), at(1, 2, 4, 20), at(-1, -12, 1, 16), at(1, -12, 1, 16)]) {
      expect(map.indoorZones.some((z) => p.every((v, i) => v >= z.min[i]! && v <= z.max[i]!))).toBe(true);
    }
  });
});
