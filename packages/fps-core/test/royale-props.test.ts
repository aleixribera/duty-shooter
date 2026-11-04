import { describe, expect, it } from 'vitest';
import { STATS, box, buildNavGraph, createWorld, type BattleRoyaleState, type NavGraph, type SpawnPoint, type Vec3 } from '@duty-shooter/fps-core';
import { clearOf, royaleProps } from '@duty-shooter/fps-core/modes';
import { createNetworkedMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { raycastWorld, sightBlocked } from '../src/combat/projectiles';
import { hullBlocked } from '../src/movement/collision';
import { ticks } from './support/movement';

const GROUND = box({ min: [-300, -1, -300], max: [300, 0, 300], material: 'concrete' });
const WALL = box({ min: [10, 0, -5], max: [11, 3, 5], material: 'brick' });
const HULL = { halfWidth: STATS.stance.hullHalfWidth.value, height: 1.8 };

describe('props in a world', () => {
  for (const spatialIndex of [true, false]) {
    it(`stand, block bodies and bullets, and go again${spatialIndex ? '' : ' (no grid)'}`, () => {
      const world = createWorld([GROUND, WALL], { spatialIndex });
      const crate = box({ min: [-0.6, 0, 19.6], max: [0.6, 0.77, 20.4], material: 'metal' });
      const at: Vec3 = [0, 0, 20];
      expect(hullBlocked(world, at, HULL)).toBe(false);
      expect(raycastWorld(world, [0, 0.4, 0], [0, 0.4, 40])).toBeNull();
      world.props.set([crate]);
      expect(world.solids).toHaveLength(3);
      expect(hullBlocked(world, at, HULL)).toBe(true);
      expect(raycastWorld(world, [0, 0.4, 0], [0, 0.4, 40])!.point[2]).toBeCloseTo(19.6);
      expect(sightBlocked(world, [0, 0.4, 0], [0, 0.4, 40])).toBe(true);
      // The map's own still come first, nearest first.
      expect(raycastWorld(world, [20, 1, 0], [-20, 1, 0])!.point[0]).toBeCloseTo(11);
      world.props.set([]);
      expect(world.solids).toHaveLength(2);
      expect(hullBlocked(world, at, HULL)).toBe(false);
    });
  }
});

describe('a Battle Royale’s props', () => {
  const state = (lands: number) =>
    ({ kind: 'battle-royale', beacons: [{ position: [50, 0, 0] }], drops: [{ stage: 2, position: [0, 0, 20], announce: 0, lands }] }) as unknown as BattleRoyaleState;

  it('every Beacon, and a crate once it has landed', () => {
    expect(royaleProps(state(30), 10)).toHaveLength(2);
    expect(royaleProps(state(30), 30)).toHaveLength(3);
    expect(royaleProps(null, 30)).toEqual([]);
  });

  it('one landing on someone puts them beside it', () => {
    const solids = royaleProps(state(0), 1);
    const out = clearOf(solids, [0.3, 0, 20.1], HULL.halfWidth, 1.6)!;
    expect(out).not.toBeNull();
    expect(Math.abs(out[0]) > 0.6 + HULL.halfWidth || Math.abs(out[2] - 20) > 0.4 + HULL.halfWidth).toBe(true);
    expect(clearOf(solids, [5, 0, 20], HULL.halfWidth, 1.6)).toBeNull();
    // Standing on top is no trouble.
    expect(clearOf(solids, [0, 0.77, 20], HULL.halfWidth, 1.6)).toBeNull();
  });

  it('go on down into the ground, so a body down a slope beside one can’t walk under its edge', () => {
    const world = createWorld([WALL]);
    world.props.set(royaleProps(state(0), 1));
    // A body whose head is just under the crate's base: the ground beside it falls away by more than a body's height.
    expect(hullBlocked(world, [0, -HULL.height - 0.05, 20], HULL)).toBe(true);
    expect(hullBlocked(world, [0, -HULL.height - 1.05, 20], HULL)).toBe(false);
  });
});

describe('on the server', () => {
  const NAV: NavGraph = buildNavGraph(createWorld([GROUND]), { area: [[-240, -240], [240, -240], [240, 240], [-240, 240]], spacing: 4 });
  const SPAWNS: readonly SpawnPoint[] = [{ position: [0, 0, 0], yaw: 0 }];

  it('a crate lands solid: whoever stood there is beside it, and nobody walks through it', () => {
    const m = createNetworkedMatch({
      solids: [GROUND],
      spawns: SPAWNS,
      mode: 'battle-royale',
      modes: { battleRoyale: { squadSize: 1, seed: 3, timeLimit: 120 } },
      bots: { nav: NAV, perTeam: 0, maxPerTeam: 0 },
      countdown: 0.1,
      latency: 0.03,
    });
    const c = m.join('alice');
    m.run(ticks(0.5));
    c.client.loaded();
    const id = c.client.id!;
    const objective = () => m.server.matchStatus().objective as BattleRoyaleState;
    for (let i = 0; i < ticks(60) && !objective().drops?.length; i++) m.step();
    const drop = objective().drops![0]!;
    const sim = m.server.simulation;
    while (sim.time < drop.lands - 0.2) m.step();
    sim.respawn(id, [drop.position[0] + 0.1, drop.position[1], drop.position[2]], 0);
    m.run(ticks(0.5));
    const me = () => m.server.latest.players.find((p) => p.id === id)!;
    const flat = (p: Vec3) => [Math.abs(p[0] - drop.position[0]), Math.abs(p[2] - drop.position[2])] as const;
    const [dx, dz] = flat(me().position);
    expect(dx > 0.6 || dz > 0.4).toBe(true);
    // Walk at it from 3 m east: stopped at its side.
    sim.respawn(id, [drop.position[0] + 3, drop.position[1], drop.position[2]], Math.PI / 2);
    m.run(ticks(2), () => ({ alice: usercmd({ forward: 1, yaw: Math.PI / 2 }) }));
    expect(me().position[0] - drop.position[0]).toBeGreaterThan(0.6 + HULL.halfWidth - 0.05);
  });
});
