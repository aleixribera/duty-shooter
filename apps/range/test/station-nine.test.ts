import { describe, expect, it } from 'vitest';
import { MATERIALS, STATS, TICK_SECONDS, createWorld, raycastWorld, segmentSolid, sightBlocked, type PlayerOutput, type Solid, type SpawnPoint, type UserCmd, type Vec3 } from '@duty-shooter/fps-core';
import { createHeadlessMatch, createNetworkedMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { decorationErrors, layoutSurfaces } from '@duty-shooter/fps-client/surfaces';
import { surfaceSpec } from '../src/bake/spec';
import { insidePolygon, mapSolids } from '../src/map/definition';
import { buildSurvivalTown } from '../src/map/survival-town';
import { buildSwitchyard } from '../src/map/switchyard';
import { BOUNDARY, BUNKER, BUNKER_LADDER, DOCK, HOUSE, HOUSE_CRATES, HOUSE_CRATE_H, KICK_GAP, ROOF_CRATES, ROOF_CRATE_H, TOWER, TRENCH, buildStationNine } from '../src/map/station-nine';

const map = buildStationNine();
const solids = mapSolids(map);
const ladders = map.ladders!;
const world = createWorld(solids, { ladders });
const area = map.playArea!;
const HALF = STATS.stance.hullHalfWidth.value;
const HULL = STATS.stance.standHullHeight.value;
const EYE = STATS.stance.standEyeHeight.value;

/** Yaw that moves a player from `a` toward `b` (yaw 0 looks -Z). */
function yawToward(a: Vec3, b: Vec3): number {
  return Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
}

/** A one-player match on the station with the player at `position`. */
function standAt(position: Vec3, yaw = 0) {
  return createHeadlessMatch({ solids, ladders, players: [{ id: 'p', team: 1, position, yaw }] });
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
function walk(start: Vec3, legs: readonly Leg[], seconds = 10): PlayerOutput {
  const match = standAt(start, yawToward(start, legs[0]!.to));
  let out = step(match, usercmd({ yaw: yawToward(start, legs[0]!.to) }));
  for (const [n, leg] of legs.entries()) {
    let reached = false;
    for (let i = 0; i < seconds / TICK_SECONDS; i++) {
      const p = out.position;
      const flat = Math.hypot(leg.to[0] - p[0], leg.to[2] - p[2]);
      if (flat < 0.3 && Math.abs(leg.to[1] - p[1]) < 0.3 && out.movement !== 'mantle' && out.movement !== 'airborne' && out.movement !== 'ladder') {
        reached = true;
        break;
      }
      const yaw = out.movement === 'ladder' ? yawToward(start, leg.to) : yawToward(p, leg.to);
      const blocked = Math.hypot(out.velocity[0], out.velocity[2]) < 0.5 && out.movement !== 'airborne' && out.movement !== 'mantle' && out.movement !== 'ladder';
      const buttons: 'Jump'[] = leg.climb && blocked && i > 0 ? ['Jump'] : [];
      out = step(match, usercmd({ yaw, forward: flat < 0.6 && out.movement !== 'ladder' ? 0.4 : 1, buttons }));
      if (!out.alive) throw new Error(`died on leg ${n}`);
    }
    if (!reached) throw new Error(`stuck on leg ${n} toward ${leg.to.map((v) => v.toFixed(2)).join(', ')} at ${out.position.map((v) => v.toFixed(2)).join(', ')} (${out.movement})`);
  }
  return out;
}

/**
 * A run at a gap along one axis: sprint from `start` toward `edge` (the lip,
 * along `axis`, moving in direction `dir`), and either jump at the lip or
 * slide `kickAt` m before it and jump out of the slide there (the Kick).
 * Returns where the player is once settled.
 */
function leap(start: Vec3, axis: 0 | 2, dir: 1 | -1, edge: number, kickAt: number | null): PlayerOutput {
  const yaw = axis === 0 ? (dir > 0 ? -Math.PI / 2 : Math.PI / 2) : dir > 0 ? Math.PI : 0;
  const match = standAt(start, yaw);
  let out = step(match, usercmd({ yaw }));
  let jumped = false;
  for (let i = 0; i < 6 / TICK_SECONDS; i++) {
    const left = (edge - out.position[axis]) * dir;
    const buttons: ('Sprint' | 'Crouch' | 'Jump')[] = [];
    if (!jumped) {
      buttons.push('Sprint');
      if (kickAt !== null && left < kickAt) buttons.push('Crouch');
      if (left < 0.12) {
        buttons.push('Jump');
        jumped = true;
      }
    }
    out = step(match, usercmd({ yaw, forward: jumped && out.movement !== 'airborne' ? 0 : 1, buttons }));
    if (jumped && out.movement !== 'airborne' && i > 0) break;
  }
  for (let i = 0; i < 20; i++) out = step(match, usercmd({ yaw }));
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
  const b: Vec3 = [x, -2, z];
  const hit = world.movement.firstHit(a, b, (i) => segmentSolid(a, b, world.solids[i]!));
  return hit ? y + (-2 - y) * hit.t : 0;
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

describe('Station Nine: size and layout', () => {
  it('is mid-sized: larger than Survival Town, smaller than the Switchyard', () => {
    const size = polygonArea(area);
    expect(size).toBeGreaterThan(polygonArea(buildSurvivalTown().playArea!) * 1.2);
    expect(size).toBeLessThan(polygonArea(buildSwitchyard().playArea!) * 0.85);
  });

  it('no spawn sees an enemy team spawn: the screens at each end break every lane', () => {
    const [west, east] = map.spawns.teams!;
    const seen: string[] = [];
    for (const a of west) {
      for (const b of east) {
        const from: Vec3 = [a.position[0], a.position[1] + EYE, a.position[2]];
        const to: Vec3 = [b.position[0], b.position[1] + EYE, b.position[2]];
        if (!sightBlocked(world, from, to)) seen.push(`${a.position} / ${b.position}`);
      }
    }
    expect(seen).toEqual([]);
  });

  it('is mirrored east to west: every solid has its twin across x = 0', () => {
    const key = (s: Solid) => [s.min[0], s.min[1], s.min[2], s.max[0], s.max[1], s.max[2]].map((v) => v.toFixed(3)).join(',');
    const keys = new Set(map.solids.map(key));
    const lonely = map.solids.filter((s) => !keys.has(key({ ...s, min: [-s.max[0], s.min[1], s.min[2]], max: [-s.min[0], s.max[1], s.max[2]] })));
    // The spawn screens are staggered on purpose, so their gaps never line up.
    const screens = (s: Solid) => Math.abs(s.min[0]) >= 31 - 1e-6 && Math.abs(s.max[0]) <= 33.4 + 1e-6;
    // The ground's tiles are cut differently either side of the middle; they lie below y = 0.
    expect(lonely.filter((s) => !screens(s) && s.max[1] > 0).map((s) => `${s.material} ${s.min}..${s.max}`)).toEqual([]);
  });

  it('runs three lanes: one long sightline beside the trench, the bunker closing the middle, the docks broken up by the generator houses', () => {
    const clear = (z: number) => {
      const hit = raycastWorld(world, [-30, 1.6, z], [30, 1.6, z]);
      return hit ? hit.t * 60 : 60;
    };
    // The trench lane holds the map's one end-to-end line at eye height, and a long one along the trench itself.
    expect(clear(-14.9)).toBe(60);
    expect(clear(-25.9)).toBeGreaterThan(25);
    // The middle lane is blocked at eye height by the bunker, which has no way through east to west.
    expect(clear(-2)).toBeLessThan(60);
    // The dock lane is close quarters: the houses at its ends stop a long line down it.
    for (const z of [15.5, 20]) expect(clear(z), `z ${z}`).toBeLessThan(20);
  });
});

describe('Station Nine: spawns', () => {
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

  it('each team spawns at its own end, with room for six a side, the two sets mirrored', () => {
    const [west, east] = map.spawns.teams!;
    expect(west.length).toBeGreaterThanOrEqual(6);
    for (const s of west) expect(s.position[0]).toBeLessThan(-36);
    for (const s of east) expect(s.position[0]).toBeGreaterThan(36);
    expect(east.map((s) => [-s.position[0], s.position[2]])).toEqual(west.map((s) => [s.position[0], s.position[2]]));
  });

  it('spawns face into the map, with the view ahead open for 4 m', () => {
    for (const spawn of [...map.spawns.ffa, ...map.spawns.teams!.flat()]) {
      const [x, y, z] = spawn.position;
      const forward = [-Math.sin(spawn.yaw), -Math.cos(spawn.yaw)];
      expect(forward[0]! * -x + forward[1]! * -z, `${spawn.position}`).toBeGreaterThan(0);
      const eye: Vec3 = [x, y + EYE, z];
      const ahead: Vec3 = [x + forward[0]! * 4, eye[1], z + forward[1]! * 4];
      expect(sightBlocked(world, eye, ahead), `${spawn.position}`).toBe(false);
    }
  });

  it('team spawns look out through a gap in their end\'s screen, not at it: the view is open for 10 m', () => {
    const blocked: string[] = [];
    for (const spawn of map.spawns.teams!.flat()) {
      const [x, y, z] = spawn.position;
      const eye: Vec3 = [x, y + EYE, z];
      const ahead: Vec3 = [x - Math.sin(spawn.yaw) * 10, eye[1], z - Math.cos(spawn.yaw) * 10];
      if (sightBlocked(world, eye, ahead)) blocked.push(`${spawn.position}`);
    }
    expect(blocked).toEqual([]);
  });
});

describe('Station Nine: objectives', () => {
  it('puts both Charge sites in the defenders\' (team 2\'s, east) half, each with two ways on', () => {
    for (const site of map.sites) expect(site.min[0], site.name).toBeGreaterThan(5);
    // Site A, the camera tower: walked onto at its foot from the trench lane, or from the middle over the trench; its deck by the ladder.
    walk([8, 0, -25], [{ to: [19, 0, -22.2] }]);
    walk([19, 0, -12], [{ to: [19, 0, -16.2] }, { to: [19, TRENCH.floor, -19] }, { to: [19, 0, -22.2], climb: true }]);
    // Site B, the generator house: by its west door from the docks' end, and by its north door from the road.
    walk([14.5, 0, 16.1], [{ to: [18.5, 0, 16.1] }]);
    walk([23.6, 0, 9.5], [{ to: [23.6, 0, 13.5] }]);
  });

  it('puts each Outposts zone on its lane at the middle, where a player standing in it is counted', () => {
    expect(map.zones.map((z) => z.name)).toEqual(['Trench', 'Bunker', 'Docks']);
    for (const z of map.zones) expect(Math.abs(z.center[0])).toBeLessThan(1e-9);
    // The trench's zone counts a player on its floor; the docks' counts players on the docks and below them.
    const inZone = (z: (typeof map.zones)[number], p: Vec3) => Math.hypot(p[0] - z.center[0], p[2] - z.center[2]) < z.radius && p[1] - z.center[1] > -0.5 && p[1] - z.center[1] < z.height;
    expect(inZone(map.zones[0]!, [0, TRENCH.floor, -19])).toBe(true);
    expect(inZone(map.zones[2]!, [2.6, DOCK.top, 15.5])).toBe(true);
    expect(inZone(map.zones[2]!, [0, 0, 15.5])).toBe(true);
  });
});

describe('Station Nine: built for movement', () => {
  it('the trench and the gap between the docks are the Kick gap: wider than a sprint jump, narrower than a kicked one', () => {
    expect(TRENCH.z1 - TRENCH.z0).toBeCloseTo(KICK_GAP, 9);
    expect(-DOCK.x0 * -2).toBeCloseTo(KICK_GAP, 9);
    expect(KICK_GAP).toBeGreaterThan(4.1);
    expect(KICK_GAP).toBeLessThan(4.3);
  });

  it('a sprint jump over the trench falls in; the Kick clears it', () => {
    const start: Vec3 = [0, 0, -27.6];
    const fell = leap(start, 2, 1, TRENCH.z0, null);
    expect(fell.position[1], `sprint jump ${fell.position}`).toBeCloseTo(TRENCH.floor, 1);
    const kicked = leap(start, 2, 1, TRENCH.z0, 1.2);
    expect(kicked.position[1], `Kick ${kicked.position}`).toBeCloseTo(0, 1);
    expect(kicked.position[2]).toBeGreaterThan(TRENCH.z1);
  });

  it('a sprint jump between the docks falls short; the Kick lands on the far dock', () => {
    const start: Vec3 = [11.4, DOCK.top, 15.5];
    const fell = leap(start, 0, -1, DOCK.x0, null);
    expect(fell.position[1], `sprint jump ${fell.position}`).toBeCloseTo(0, 1);
    const kicked = leap(start, 0, -1, DOCK.x0, 1.2);
    expect(kicked.position[1], `Kick ${kicked.position}`).toBeCloseTo(DOCK.top, 1);
    expect(kicked.position[0]).toBeLessThan(-DOCK.x0);
  });

  it('drops into the trench and mantles out of it', () => {
    walk([-4, 0, -24], [{ to: [-4, TRENCH.floor, -19] }, { to: [-4, 0, -14.5], climb: true }]);
  });

  it('mantles onto the docks from the ground, and walks up their steps', () => {
    walk([6, 0, 10.5], [{ to: [6, DOCK.top, 13.4], climb: true }]);
    walk([-15, 0, 13.7], [{ to: [-10, DOCK.top, 13.7] }]);
    walk([15, 0, 13.7], [{ to: [10, DOCK.top, 13.7] }]);
  });

  it('climbs the crates onto the bunker roof, from the north and the south', () => {
    for (const [a, c, z0, z1] of ROOF_CRATES) {
      const x = (a + c) / 2;
      const out = z0 > 0 ? 1 : -1;
      const zc = (z0 + z1) / 2;
      walk([x + 1.5, 0, zc + out * 1.8], [{ to: [x, ROOF_CRATE_H, zc], climb: true }, { to: [x, BUNKER.roof, zc - out * 1.8], climb: true }]);
    }
  });

  it('climbs the crates onto each generator house roof', () => {
    for (const s of [-1, 1] as const) {
      for (const [a, c, z0, z1] of HOUSE_CRATES) {
        const x = (s * (a + c)) / 2;
        const zc = (z0 + z1) / 2;
        const outward: Vec3 = a > HOUSE.x1 - 0.5 ? [x + s * 1.6, 0, zc] : [x, 0, zc - 1.6];
        const onto: Vec3 = a > HOUSE.x1 - 0.5 ? [s * (HOUSE.x1 - 1.2), HOUSE.roof, zc] : [x, HOUSE.roof, HOUSE.z0 + 1.2];
        walk(outward, [{ to: [x, HOUSE_CRATE_H, zc], climb: true }, { to: onto, climb: true }]);
      }
    }
  });

  it('cannot mantle onto the bunker roof or a tower deck from the ground', () => {
    const bunker = walk([-8, 0, -2], [{ to: [-6.6, 0, -2] }]);
    expect(bunker.position[1]).toBeCloseTo(0, 2);
    const match = standAt([-6.6, 0, -2], -Math.PI / 2);
    let out!: PlayerOutput;
    for (let i = 0; i < 90; i++) out = step(match, usercmd({ yaw: -Math.PI / 2, forward: 1, buttons: i % 10 === 0 ? ['Jump'] : [] }));
    expect(out.position[1]).toBeLessThan(1);
  });

  it('walks through the bunker door to door, and through each generator house', () => {
    walk([-3, 0, -8], [{ to: [-3, 0, -2] }, { to: [3, 0, -2] }, { to: [3, 0, 4] }]);
    for (const s of [-1, 1] as const) {
      walk([s * 14.5, 0, 16.1], [{ to: [s * 19, 0, 16.1] }, { to: [s * 20.1, 0, 19.5] }, { to: [s * 20.1, 0, 22.4] }]);
      walk([s * 23.6, 0, 9.5], [{ to: [s * 23.6, 0, 14.5] }, { to: [s * 20, 0, 14.5] }, { to: [s * 14.5, 0, 16.1] }]);
    }
  });
});

describe('Station Nine: ladders', () => {
  it('has a ladder up each camera tower and each end of the bunker roof', () => {
    expect(ladders).toHaveLength(4);
  });

  for (const l of ladders) {
    const name = `${l.bottom[0] > 0 ? 'east' : 'west'} ${l.landing[1] > 4 ? 'tower' : 'bunker'}`;
    it(`climbs the ${name} ladder to its landing and back down without firing`, () => {
      const out = Math.sign(l.bottom[0] - l.landing[0]);
      const start: Vec3 = [l.bottom[0] + out * 1.2, 0, l.bottom[2]];
      const toward = yawToward(start, l.bottom);
      const m = standAt(start, toward);
      let p = step(m, usercmd({ yaw: toward }));
      for (let i = 0; i < 120 && p.movement !== 'ladder'; i++) p = step(m, usercmd({ yaw: toward, forward: 1 }));
      expect(p.movement).toBe('ladder');
      for (let i = 0; i < 10 / TICK_SECONDS && p.movement === 'ladder'; i++) {
        const o = m.step({ p: usercmd({ yaw: toward, forward: 1, buttons: ['Fire'] }) });
        const climbing = p.movement === 'ladder' && o.players[0]!.movement === 'ladder';
        p = o.players[0]!;
        if (climbing) expect(o.events.some((e) => e.type === 'shot')).toBe(false);
      }
      expect(p.position[1]).toBeCloseTo(l.landing[1], 1);
      expect(Math.hypot(p.position[0] - l.landing[0], p.position[2] - l.landing[2])).toBeLessThan(0.05);
      // Back down: walk to the ladder from the landing, facing out.
      const away = yawToward(l.landing, l.bottom);
      for (let i = 0; i < 12 / TICK_SECONDS && !(p.movement !== 'ladder' && p.position[1] < 0.05); i++) p = step(m, usercmd({ yaw: away, forward: 1 }));
      expect(p.position[1]).toBeLessThan(0.05);
      expect(Math.hypot(p.position[0] - l.bottom[0], p.position[2] - l.bottom[2])).toBeLessThan(0.6);
    });
  }

  it('predicts the tower ladder over a delayed network', () => {
    const l = ladders.find((x) => x.bottom[0] > 0 && x.landing[1] > 4)!;
    const yaw = Math.PI / 2;
    const m = createNetworkedMatch({ solids, ladders, spawns: [{ position: [l.bottom[0] + 0.3, 0, l.bottom[2]], yaw }], latency: 0.08, jitter: 0.02, loss: 0.05, seed: 7 });
    const client = m.join('climber');
    for (let i = 0; i < 180 && !client.latest?.self; i++) m.step();
    expect(client.latest?.self).toBeTruthy();
    let reached = false;
    for (let i = 0; i < 800; i++) {
      const out = m.step({ climber: usercmd({ yaw, forward: 1 }) });
      const p = out.players.find((q) => q.id === client.client.id);
      if (p && p.position[1] > TOWER.deck - 0.01 && p.position[0] < TOWER.landingX + 0.1) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);
    for (let i = 0; i < 90; i++) m.step({ climber: usercmd({ yaw }) });
    const server = m.server.latest.players.find((p) => p.id === client.client.id)!;
    const predicted = client.latest!.self!;
    expect(Math.hypot(...server.position.map((v, i) => v - predicted.position[i]!))).toBeLessThan(0.1);
  });

  it('the bunker ladders land on the roof clear of its sandbags, and the towers\' between the deck\'s rails', () => {
    for (const l of ladders) {
      const y = surfaceBelow(l.landing[0], l.landing[2], l.landing[1] + 0.5);
      expect(y, `${l.landing}`).toBeCloseTo(l.landing[1], 3);
    }
    expect(BUNKER_LADDER.landing).toBeLessThan(BUNKER.x1);
  });
});

describe('Station Nine: containment', () => {
  const escapes: [string, (i: number) => ('Jump' | 'Sprint' | 'Crouch')[]][] = [
    ['sprint-jumps', (i) => (i % 20 === 0 ? ['Sprint', 'Jump'] : ['Sprint'])],
    ['sprint slides', (i) => (i < 40 ? ['Sprint'] : i % 30 === 0 ? ['Crouch'] : [])],
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
        const inside: [number, number] = [x - n[0] * 0.04, z - n[1] * 0.04];
        if (clips.some((s) => inside[0] > s.min[0] && inside[0] < s.max[0] && inside[1] > s.min[2] && inside[1] < s.max[2])) gaps.push(`clip inside at ${inside}`);
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

describe('Station Nine: bullets, materials and invisible blockers', () => {
  it('every hidden solid is player clip, so no invisible wall stops a bullet', () => {
    expect(map.hiddenSolids.filter((s) => s.blocks !== 'players')).toEqual([]);
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

  it('the generator houses\' sheet metal and the tower rails can be shot through; the bunker and the docks cannot', () => {
    const first = (from: Vec3, to: Vec3) => {
      const hit = raycastWorld(world, from, to);
      return hit ? world.solids[hit.solid]!.material : null;
    };
    const pierces = (m: string | null) => m !== null && !STATS.penetration.materials[m as keyof typeof STATS.penetration.materials].stops;
    expect(first([21, 1.5, 9], [21, 1.5, 14])).toBe('sheetMetal');
    expect(first([19, TOWER.deck + 0.5, -21], [19, TOWER.deck + 0.5, -24])).toBe('sheetMetal');
    expect(pierces('sheetMetal')).toBe(true);
    for (const [from, to] of [
      [[-8, 1.5, -2], [0, 1.5, -2]],
      [[0, 0.7, 15.5], [6, 0.7, 15.5]],
    ] as const) {
      const m = first(from, to);
      expect(m, `${from}`).toBe('concrete');
      expect(pierces(m)).toBe(false);
    }
  });

  it('the ladders stop bullets but never block a player', () => {
    const ladderSolids = map.models!.placements.filter((p) => p.asset.startsWith('ladder-')).flatMap((p) => p.solids.map((i) => map.solids[i]!));
    expect(ladderSolids.length).toBeGreaterThan(40);
    for (const s of ladderSolids) expect(s.blocks).toBe('bullets');
  });

  it('no two drawn surfaces lie in the same plane facing the same way and overlapping (z-fighting)', () => {
    const modelled = new Set(map.models?.placements.flatMap((p) => p.solids));
    const boxes = map.solids.filter((s, i) => !s.orientation && !modelled.has(i));
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

describe('Station Nine: cameras, surfaces and the ending', () => {
  const insideSolid = (p: Vec3, margin = 0) => map.solids.some((s) => !s.orientation && p.every((v, i) => v > s.min[i]! - margin && v < s.max[i]! + margin));

  it('has at least 12 reference spots, each in open air with room round the lens', () => {
    expect(map.referenceSpots.length).toBeGreaterThanOrEqual(12);
    for (const spot of map.referenceSpots) expect(insideSolid(spot.position, 0.3), spot.name).toBe(false);
  });

  it('the benchmark path never passes through a wall', () => {
    const path = map.benchmarkPath;
    for (let i = 0; i + 1 < path.length; i++) expect(raycastWorld(world, path[i]!.position, path[i + 1]!.position), `leg ${i}`).toBeNull();
  });

  it('the fly-through stays above the station, in open air', () => {
    expect(map.flyThrough.length).toBeGreaterThan(8);
    for (const k of map.flyThrough) expect(insideSolid(k.position)).toBe(false);
  });

  it('the ending shot moves through open air with the cloud over the shot tower in view all the way', () => {
    const nuke = map.nuke!;
    const { from, to } = nuke.shot;
    const drawn = createWorld(map.solids);
    const cloud: Vec3 = [nuke.groundZero[0], 150, nuke.groundZero[2]];
    expect(raycastWorld(drawn, from, to)).toBeNull();
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      const p: Vec3 = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k];
      expect(raycastWorld(drawn, p, cloud), `${Math.round(k * 100)}% along`).toBeNull();
    }
    // The shot tower stands at ground zero, and the sun comes up behind it.
    expect(map.models!.placements.some((p) => p.asset === 'shot-tower' && p.visualOnly && p.position.every((v, i) => v === nuke.groundZero[i]))).toBe(true);
    const sun = map.lighting.sunDirection;
    const toward = Math.atan2(nuke.groundZero[0], -nuke.groundZero[2]);
    expect(Math.abs(Math.atan2(sun[0], -sun[2]) - toward)).toBeLessThan(0.1);
  });

  it('indoor zones cover the bunker and both generator houses', () => {
    for (const p of [[0, 1, -2], [-21.5, 1, 14], [21.5, 1, 14]] as Vec3[]) {
      expect(map.indoorZones.some((z) => p.every((v, i) => v >= z.min[i]! && v <= z.max[i]!)), `${p}`).toBe(true);
    }
  });

  it('keeps every decoration within 5 cm of the solid it decorates', () => {
    expect(map.decorations.length).toBeGreaterThan(20);
    expect(decorationErrors(map.solids, map.decorations).map((i) => map.decorations[i])).toEqual([]);
  });

  it('gives every drawn solid a look slot and every look a known finish', () => {
    expect(map.looks).toHaveLength(map.solids.length);
    const layout = layoutSurfaces(map.solids, surfaceSpec(map));
    for (const f of layout.faces) expect(f.finish in map.finishes || f.finish.startsWith('default:'), f.finish).toBe(true);
    expect(new Set(layout.faces.map((f) => f.finish)).size).toBeGreaterThan(15);
  });

  it('places every ambient source over the station or just beyond its walls', () => {
    for (const a of map.ambience) {
      if (a.kind === 'wind') continue;
      expect(Math.abs(a.position[0]), a.kind).toBeLessThan(60);
      expect(Math.abs(a.position[2]), a.kind).toBeLessThan(45);
    }
  });
});
