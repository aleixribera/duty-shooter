import { describe, expect, it } from 'vitest';
import { MATERIALS, STATS, TICK_SECONDS, createWorld, raycastWorld, segmentSolid, sightBlocked, type PlayerOutput, type Solid, type SpawnPoint, type UserCmd, type Vec3 } from '@duty-shooter/fps-core';
import { createHeadlessMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { decorationErrors, layoutSurfaces } from '@duty-shooter/fps-client/surfaces';
import { insidePolygon, mapSolids } from '../src/map/definition';
import { buildSurvivalTown } from '../src/map/survival-town';
import { BOUNDARY, CAR_FLOOR, CLIMB_HIGH, CLIMB_LOW, CAR_ROOF, OPEN_BOXCARS, ROOF_CLIMBS, SIGNAL_BOX, SIGNAL_STAIRS, TRACKS, buildSwitchyard } from '../src/map/switchyard';

const map = buildSwitchyard();
const solids = mapSolids(map);
const world = createWorld(solids);
const area = map.playArea!;
const HALF = STATS.stance.hullHalfWidth.value;
const HULL = STATS.stance.standHullHeight.value;

/** Yaw that moves a player from `a` toward `b` (yaw 0 looks -Z). */
function yawToward(a: Vec3, b: Vec3): number {
  return Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
}

/** A one-player match on the yard with the player at `position`. */
function standAt(position: Vec3, yaw = 0) {
  return createHeadlessMatch({ solids, players: [{ id: 'p', team: 1, position, yaw }] });
}

function step(match: ReturnType<typeof standAt>, cmd: UserCmd): PlayerOutput {
  return match.step({ p: cmd }).players[0]!;
}

interface Leg {
  /** Where to get to (y checked within 0.3 m). */
  readonly to: Vec3;
  /** Press jump when blocked (mantles and climbs). */
  readonly climb?: boolean;
}

/** Walks a route leg by leg, steering straight at each point; throws where it got stuck. */
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
      const blocked = Math.hypot(out.velocity[0], out.velocity[2]) < 0.5 && out.movement !== 'airborne' && out.movement !== 'mantle';
      const buttons: 'Jump'[] = leg.climb && blocked && i > 0 ? ['Jump'] : [];
      out = step(match, usercmd({ yaw, forward: flat < 0.6 ? 0.4 : 1, buttons }));
      if (!out.alive) throw new Error(`died on leg ${n}`);
    }
    if (!reached) throw new Error(`stuck on leg ${n} toward ${leg.to.map((v) => v.toFixed(2)).join(', ')} at ${out.position.map((v) => v.toFixed(2)).join(', ')} (${out.movement})`);
  }
  return out;
}

/** Whether a standing hull at `p` (feet) overlaps axis-aligned solid `s`, with `margin` of clearance. */
function hullTouches(s: Solid, p: Vec3, margin = 0): boolean {
  const h = HALF + margin;
  if (s.max[1] <= p[1] + 1e-3 || s.min[1] >= p[1] + HULL) return false;
  return s.max[0] > p[0] - h && s.min[0] < p[0] + h && s.max[2] > p[2] - h && s.min[2] < p[2] + h;
}

/** The highest surface that holds players up at (x, z), at or below `y`. */
function surfaceBelow(x: number, z: number, y = 30): number {
  const a: Vec3 = [x, y, z];
  const b: Vec3 = [x, -1, z];
  const hit = world.movement.firstHit(a, b, (i) => segmentSolid(a, b, world.solids[i]!));
  return hit ? y + (-1 - y) * hit.t : 0;
}

/** Points just inside every edge of the play area, every `spacing` m, with the outward direction. */
function edgeSamples(spacing: number, inset: number): { point: [number, number]; out: [number, number] }[] {
  const samples: { point: [number, number]; out: [number, number] }[] = [];
  for (let i = 0; i < area.length; i++) {
    const [ax, az] = area[i]!;
    const [bx, bz] = area[(i + 1) % area.length]!;
    const len = Math.hypot(bx - ax, bz - az);
    let n: [number, number] = [-(bz - az) / len, (bx - ax) / len];
    if (insidePolygon(area, (ax + bx) / 2 + n[0] * 0.1, (az + bz) / 2 + n[1] * 0.1)) n = [-n[0], -n[1]];
    for (let t = spacing / 2; t < len; t += spacing) {
      const x = ax + ((bx - ax) * t) / len - n[0] * inset;
      const z = az + ((bz - az) * t) / len - n[1] * inset;
      if (insidePolygon(area, x, z)) samples.push({ point: [x, z], out: n });
    }
  }
  return samples;
}

/** The area of a polygon (x, z). */
function polygonArea(p: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i]!;
    const [x1, z1] = p[(i + 1) % p.length]!;
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
}

describe('Switchyard: size and layout', () => {
  it('is about 1.5 to 2 times the size of Survival Town', () => {
    const ratio = polygonArea(area) / polygonArea(buildSurvivalTown().playArea!);
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2);
  });

  it('has the long lane open for 60 m and more at eye height, over its low cover', () => {
    // Down the six-foot between the running tracks, and along the strip south of them.
    for (const z of [(TRACKS.north + TRACKS.south) / 2, -14]) {
      const from: Vec3 = [-40, 1.6, z];
      const hit = raycastWorld(world, from, [40, 1.6, z]);
      expect(hit ? hit.t * 80 : 80, `z ${z}`).toBeGreaterThan(60);
    }
  });

  it('no spawn sees an enemy team spawn: the screens at each end break every lane', () => {
    const eye = STATS.stance.standEyeHeight.value;
    const [west, east] = map.spawns.teams!;
    const seen: string[] = [];
    for (const a of west) {
      for (const b of east) {
        const from: Vec3 = [a.position[0], a.position[1] + eye, a.position[2]];
        const to: Vec3 = [b.position[0], b.position[1] + eye, b.position[2]];
        if (!sightBlocked(world, from, to)) seen.push(`${a.position} / ${b.position}`);
      }
    }
    expect(seen).toEqual([]);
  });
});

describe('Switchyard: spawns', () => {
  const sets: [string, readonly SpawnPoint[]][] = [
    ['FFA', map.spawns.ffa],
    ['team 1', map.spawns.teams![0]],
    ['team 2', map.spawns.teams![1]],
  ];
  for (const [name, set] of sets) {
    it(`every ${name} spawn is inside the play area, clear of geometry and on the ground`, () => {
      expect(set.length).toBeGreaterThanOrEqual(6);
      for (const spawn of set) {
        expect(insidePolygon(BOUNDARY, spawn.position[0], spawn.position[2])).toBe(true);
        const match = standAt(spawn.position, spawn.yaw);
        let out!: PlayerOutput;
        for (let i = 0; i < 30; i++) out = step(match, usercmd({ yaw: spawn.yaw }));
        expect(out.position[0]).toBeCloseTo(spawn.position[0], 6);
        expect(out.position[2]).toBeCloseTo(spawn.position[2], 6);
        expect(out.position[1]).toBeCloseTo(spawn.position[1], 6);
        expect(out.movement).not.toBe('airborne');
        const [x, , z] = spawn.position;
        const near = world.movement.inRect(x - HALF - 0.05, z - HALF - 0.05, x + HALF + 0.05, z + HALF + 0.05).filter((i) => !world.solids[i]!.orientation && hullTouches(world.solids[i]!, spawn.position, 0.05));
        expect(near.map((i) => `${spawn.position.join(',')}: ${world.solids[i]!.material} ${world.solids[i]!.min}..${world.solids[i]!.max}`)).toEqual([]);
      }
    });

    it(`no two ${name} spawns are within 3 m of each other`, () => {
      for (const [i, a] of set.entries()) {
        for (const b of set.slice(i + 1)) expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])).toBeGreaterThan(3);
      }
    });
  }

  it('each team spawns at its own end of the yard, with room for six a side, the two sets mirrored', () => {
    const [west, east] = map.spawns.teams!;
    expect(west.length).toBeGreaterThanOrEqual(6);
    for (const s of west) expect(s.position[0]).toBeLessThan(-45);
    for (const s of east) expect(s.position[0]).toBeGreaterThan(45);
    expect(east.map((s) => [-s.position[0], s.position[2]])).toEqual(west.map((s) => [s.position[0], s.position[2]]));
  });

  it('spawns face into the map, with the view ahead open for 4 m', () => {
    for (const spawn of [...map.spawns.ffa, ...map.spawns.teams!.flat()]) {
      const [x, y, z] = spawn.position;
      const forward = [-Math.sin(spawn.yaw), -Math.cos(spawn.yaw)];
      expect(forward[0]! * -x + forward[1]! * -z, `${spawn.position}`).toBeGreaterThan(0);
      const eye: Vec3 = [x, y + STATS.stance.standEyeHeight.value, z];
      const ahead: Vec3 = [x + forward[0]! * 4, eye[1], z + forward[1]! * 4];
      expect(sightBlocked(world, eye, ahead), `${spawn.position}`).toBe(false);
    }
  });
});

describe('Switchyard: routes', () => {
  for (const [x0, x1, c] of OPEN_BOXCARS) {
    const x = (x0 + x1) / 2;
    it(`walks through the open boxcar at x ${x}, up the pallet steps and out the other side`, () => {
      const out = walk([x, 0, c - 4], [{ to: [x, CAR_FLOOR, c] }, { to: [x, 0, c + 4] }]);
      expect(out.position[2]).toBeGreaterThan(c + 3);
    });
  }

  for (const { low, high, z } of ROOF_CLIMBS) {
    it(`climbs the crates at x ${low[0]} onto the boxcar roof`, () => {
      const zc = (z[0] + z[1]) / 2;
      const out = Math.sign(zc);
      const roof = zc < 0 ? TRACKS.rowA : TRACKS.rowB;
      const lx = (low[0] + low[1]) / 2;
      const hx = (high[0] + high[1]) / 2;
      walk([lx, 0, zc + out * 1.6], [{ to: [lx, CLIMB_LOW, zc], climb: true }, { to: [hx, CLIMB_HIGH, zc], climb: true }, { to: [hx, CAR_ROOF, roof], climb: true }]);
    });
  }

  it('goes through the relay room, then up the west stairs, through the lever room and down the east stairs', () => {
    const up = SIGNAL_BOX.floor;
    const w = (SIGNAL_STAIRS.west[0] + SIGNAL_STAIRS.west[1]) / 2;
    const e = (SIGNAL_STAIRS.east[0] + SIGNAL_STAIRS.east[1]) / 2;
    walk([23.1, 0, -6.5], [{ to: [23.1, 0, -10.5] }, { to: [25.2, 0, -10.5] }, { to: [25.2, 0, -14] }]);
    walk([w, 0, -1.4], [{ to: [w, up / 2, -5.9] }, { to: [w, up, -10.1] }, { to: [23.5, up, -9.9] }, { to: [e, up, -10.1] }, { to: [e, up / 2, -5.9] }, { to: [e, 0, -1.4] }]);
  });

  it('climbs onto the shed platform, the coaling stage and the loading dock by their steps', () => {
    walk([-7, 0, 22.7], [{ to: [-2, CAR_FLOOR, 22.7] }, { to: [11, CAR_FLOOR, 22.7] }, { to: [14.4, 0, 22.7] }]);
    walk([-12.5, 0, 22], [{ to: [-18, CAR_FLOOR, 22] }]);
    walk([38.6, 0, 22.2], [{ to: [42.5, CAR_FLOOR, 22.2] }]);
  });

  it('walks through the workshop door to door, and through the engine shed along the shed road', () => {
    walk([-29.9, 0, 10], [{ to: [-29.9, 0, 17.6] }, { to: [-36, 0, 17.6] }, { to: [-43, 0, 17.6] }]);
    walk([-12, 0, 17], [{ to: [-5, 0, 17] }, { to: [-5, 0, 15] }, { to: [14, 0, 15] }, { to: [14, 0, 17] }, { to: [20, 0, 17] }]);
  });
});

describe('Switchyard: containment', () => {
  const escapes: [string, (i: number) => ('Jump' | 'Sprint' | 'TacticalSprint' | 'Crouch')[]][] = [
    ['sprint-jumps', (i) => (i % 20 === 0 ? ['Sprint', 'Jump'] : ['Sprint'])],
    ['tactical sprint slides', (i) => (i < 40 ? ['TacticalSprint'] : i % 30 === 0 ? ['Crouch'] : [])],
    ['mantles', (i) => (i % 10 === 0 ? ['Jump'] : [])],
  ];

  for (const [name, buttons] of escapes) {
    it(`${name} toward the boundary never leave the play area`, () => {
      const escaped: string[] = [];
      for (const { point, out } of edgeSamples(3, 1.2)) {
        const [x, z] = point;
        const y = surfaceBelow(x, z);
        const start: Vec3 = [x, y + 0.02, z];
        if (world.movement.inRect(x - HALF, z - HALF, x + HALF, z + HALF).some((i) => hullTouches(world.solids[i]!, [start[0], start[1] + 0.05, start[2]]))) continue;
        const yaw = Math.atan2(-out[0], -out[1]);
        const match = standAt(start, yaw);
        let p!: PlayerOutput;
        for (let i = 0; i < 4 / TICK_SECONDS; i++) p = step(match, usercmd({ yaw, forward: 1, buttons: buttons(i) }));
        if (!insidePolygon(BOUNDARY, p.position[0], p.position[2])) escaped.push(`${x.toFixed(1)}, ${z.toFixed(1)} -> ${p.position.map((v) => v.toFixed(1)).join(', ')}`);
      }
      expect(escaped).toEqual([]);
    });
  }

  it('the edge cuts through nothing: every drawn solid but the ground lies wholly inside it or wholly outside', () => {
    const corners = (s: Solid): [number, number][] => [[s.min[0], s.min[2]], [s.max[0], s.min[2]], [s.max[0], s.max[2]], [s.min[0], s.max[2]]];
    const cut = map.solids.filter((s) => !(s.max[1] === 0 && s.min[1] < 0)).filter((s) => new Set(corners(s).map(([x, z]) => insidePolygon(area, x, z))).size > 1);
    expect(cut.map((s) => `${s.material} ${s.min}..${s.max}`)).toEqual([]);
  });

  it('the boundary clip stands wholly outside the walls\' inner faces and closes them', () => {
    const clips = map.hiddenSolids.filter((s) => s.max[1] > 50);
    expect(clips.length).toBeGreaterThan(0);
    for (const s of clips) {
      for (const [x, z] of [[s.min[0], s.min[2]], [s.max[0], s.max[2]], [(s.min[0] + s.max[0]) / 2, (s.min[2] + s.max[2]) / 2]] as const) {
        const nudged: [number, number] = [x + Math.sign(-x) * 1e-3, z + Math.sign(-z) * 1e-3];
        if (insidePolygon(BOUNDARY, nudged[0], nudged[1])) {
          // A corner on the line is fine; anything further in is not.
          const inX = Math.abs(x) < BOUNDARY[1]![0] - 1e-6;
          const inZ = Math.abs(z) < BOUNDARY[2]![1] - 1e-6;
          expect(inX && inZ, `${s.min}..${s.max}`).toBe(false);
        }
      }
    }
    const gaps: string[] = [];
    for (let i = 0; i < BOUNDARY.length; i++) {
      const [ax, az] = BOUNDARY[i]!;
      const [bx, bz] = BOUNDARY[(i + 1) % BOUNDARY.length]!;
      const len = Math.hypot(bx - ax, bz - az);
      let n: [number, number] = [-(bz - az) / len, (bx - ax) / len];
      if (insidePolygon(BOUNDARY, (ax + bx) / 2 + n[0] * 0.1, (az + bz) / 2 + n[1] * 0.1)) n = [-n[0], -n[1]];
      for (let t = 0; t <= len; t += 0.25) {
        const x = ax + ((bx - ax) * t) / len + n[0] * 0.02;
        const z = az + ((bz - az) * t) / len + n[1] * 0.02;
        if (!clips.some((s) => x > s.min[0] && x < s.max[0] && z > s.min[2] && z < s.max[2])) gaps.push(`${x.toFixed(2)}, ${z.toFixed(2)}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it('a drawn wall or barrier shows the edge everywhere, before the invisible boundary', () => {
    const unmarked: string[] = [];
    for (const { point, out } of edgeSamples(1, 1.2)) {
      const [x, z] = point;
      if (world.movement.inRect(x - HALF, z - HALF, x + HALF, z + HALF).some((i) => hullTouches(world.solids[i]!, [x, 0.05, z]))) continue;
      const from: Vec3 = [x, 0.45, z];
      const hit = raycastWorld(world, from, [from[0] + out[0] * 1.2, 0.45, from[2] + out[1] * 1.2]);
      if (!hit || world.solids[hit.solid]!.blocks === 'players') unmarked.push(`${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
    expect(unmarked).toEqual([]);
  });
});

describe('Switchyard: bullets, materials and invisible blockers', () => {
  it('every hidden solid is player clip, so no invisible wall stops a bullet', () => {
    expect(map.hiddenSolids.filter((s) => s.blocks !== 'players')).toEqual([]);
  });

  it('a bullet fired along and through every player clip solid is never stopped by one', () => {
    for (const s of map.hiddenSolids) {
      const c: Vec3 = [(s.min[0] + s.max[0]) / 2, Math.min(5, (s.min[1] + s.max[1]) / 2), (s.min[2] + s.max[2]) / 2];
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

  it('shots fired out over the barrier and walls land beyond them or on drawn geometry, never on clip', () => {
    for (const { point, out } of edgeSamples(3, 1)) {
      const from: Vec3 = [point[0], surfaceBelow(point[0], point[1]) + 1.6, point[1]];
      for (const pitch of [-0.12, 0, 0.05, 0.3]) {
        const to: Vec3 = [from[0] + out[0] * 200, from[1] + 200 * Math.tan(pitch), from[2] + out[1] * 200];
        const hit = raycastWorld(world, from, to);
        if (hit) expect(world.solids[hit.solid]!.blocks).not.toBe('players');
      }
    }
  });

  it('every solid has a footstep material and a penetration row', () => {
    for (const s of solids) {
      expect(MATERIALS).toContain(s.material);
      expect(STATS.penetration.materials[s.material]).toBeDefined();
    }
  });

  /** The material of the first solid a level shot from `from` toward `to` hits. */
  const firstMaterial = (from: Vec3, to: Vec3) => {
    const hit = raycastWorld(world, from, to);
    return hit ? world.solids[hit.solid]!.material : null;
  };

  it('sheet-metal boxcars and the timber workshop and lever room can be shot through; the locomotive, the shed\'s brick, the tanks and the rails cannot', () => {
    const pierces = (m: string | null) => m !== null && !STATS.penetration.materials[m as keyof typeof STATS.penetration.materials].stops;
    // A closed boxcar's side, from the alley.
    expect(firstMaterial([7, 2.5, -3], [7, 2.5, -12])).toBe('sheetMetal');
    expect(pierces('sheetMetal')).toBe(true);
    // The workshop's wall, from the road.
    expect(firstMaterial([-37.5, 1.5, 10], [-37.5, 1.5, 15])).toBe('wood');
    // The lever room's timber, from the long lane.
    expect(firstMaterial([23.5, 3.6, -16], [23.5, 3.6, -10])).toBe('wood');
    expect(pierces('wood')).toBe(true);
    // The locomotive, the shed's walls, the tank cars and a rail.
    for (const [from, to] of [
      [[3, 2.5, 14.5], [3, 2.5, 21]],
      [[2, 3, 10.5], [2, 3, 14]],
      [[-8, 2.5, -3], [-8, 2.5, -12]],
      [[0, 0.2, TRACKS.north - 1.2], [0, 0.2, TRACKS.north + 1.2]],
    ] as const) {
      const m = firstMaterial(from, to);
      expect(m === 'metal' || m === 'brick', `${from} → ${m}`).toBe(true);
      expect(pierces(m)).toBe(false);
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
              if (overlapU > 1e-4 && overlapV > 1e-4) fights.push(`${side}${'xyz'[axis]} ${a.min}..${a.max} / ${b.min}..${b.max}`);
            }
          }
        }
      }
    }
    expect(fights.slice(0, 40)).toEqual([]);
  });
});

describe('Switchyard: cameras and surfaces', () => {
  const insideSolid = (p: Vec3) => map.solids.some((s) => !s.orientation && p.every((v, i) => v > s.min[i]! && v < s.max[i]!));

  it('has at least 12 reference spots, each in open air', () => {
    expect(map.referenceSpots.length).toBeGreaterThanOrEqual(12);
    for (const spot of map.referenceSpots) expect(insideSolid(spot.position), spot.name).toBe(false);
  });

  it('the benchmark path never passes through a wall', () => {
    const path = map.benchmarkPath;
    for (let i = 0; i + 1 < path.length; i++) expect(raycastWorld(world, path[i]!.position, path[i + 1]!.position), `leg ${i}`).toBeNull();
  });

  it('the fly-through stays above the yard, in open air', () => {
    expect(map.flyThrough.length).toBeGreaterThan(8);
    for (const k of map.flyThrough) expect(insideSolid(k.position)).toBe(false);
  });

  it('indoor zones cover the workshop, the shed, both floors of the signal box and the pump house', () => {
    for (const p of [[-38, 1, 18], [2, 1, 14.5], [23.5, 1, -10], [23.5, 4, -10], [42, 1, 16.5]] as Vec3[]) {
      expect(map.indoorZones.some((z) => p.every((v, i) => v >= z.min[i]! && v <= z.max[i]!)), `${p}`).toBe(true);
    }
  });

  it('keeps every decoration within 5 cm of the solid it decorates', () => {
    expect(map.decorations.length).toBeGreaterThan(100);
    expect(decorationErrors(map.solids, map.decorations).map((i) => map.decorations[i])).toEqual([]);
  });

  it('gives every drawn solid a look slot and every look a known finish', () => {
    expect(map.looks).toHaveLength(map.solids.length);
    const layout = layoutSurfaces(map.solids, { finishes: map.finishes, looks: map.looks, decorations: map.decorations, indoor: map.indoorZones });
    for (const f of layout.faces) expect(f.finish in map.finishes || f.finish.startsWith('default:'), f.finish).toBe(true);
    expect(new Set(layout.faces.map((f) => f.finish)).size).toBeGreaterThan(20);
  });

  it('places every ambient source with a position over the yard or just beyond its barrier', () => {
    for (const a of map.ambience) {
      if (a.kind === 'wind') continue;
      expect(Math.abs(a.position[0])).toBeLessThan(80);
      expect(Math.abs(a.position[2])).toBeLessThan(40);
    }
  });
});
