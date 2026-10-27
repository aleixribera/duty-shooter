import { describe, expect, it } from 'vitest';
import { STATS, anglesOf, bulletDamage, zoneCentre, type Material, type SimEvent, type Solid, type SpawnPoint, type TickOutput } from '@duty-shooter/fps-core';
import { box, createNetworkedMatch, playerClip, usercmd, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { SHOOTER, aimAt, drawn, eventsOf, lane } from './support/combat';
import { FLOOR, ticks } from './support/movement';

const TABLE = STATS.penetration.materials;

/** A wall across the lane, `thickness` metres deep, its near face at `z`. */
function wall(z: number, material: Material, thickness: number): Solid {
  return box({ min: [-10, 0, z - thickness], max: [10, 4, z], material });
}

/** The damage multiplier of a penetrable material. */
function multiplier(material: Material): number {
  const row = TABLE[material];
  if (row.stops) throw new Error(`${material} stops bullets`);
  return row.damage.value;
}

/** One aimed shot at the target's upper torso, 20 m down the lane through `solids`; every tick's outputs until it lands. */
function shootThrough(...solids: Solid[]): TickOutput[] {
  const match = lane(20, { solids: [FLOOR, ...solids] });
  drawn(match, usercmd({ buttons: ['Ads'] }));
  match.run(ticks(0.4), () => ({ [SHOOTER]: usercmd({ ...aimAt(match, 'upperTorso'), buttons: ['Ads'] }) }));
  const aim = aimAt(match, 'upperTorso');
  return [match.step({ [SHOOTER]: usercmd({ ...aim, buttons: ['Ads', 'Fire'], firePresses: [0] }) }), ...match.run(ticks(0.3), () => ({ [SHOOTER]: usercmd({ ...aim, buttons: ['Ads'] }) }))];
}

function onlyHit(outputs: readonly TickOutput[]) {
  const hits = eventsOf(outputs, 'hit');
  expect(hits).toHaveLength(1);
  return hits[0]!;
}

describe('bullet penetration', () => {
  it('a bullet through one wood wall does the table damage', () => {
    const hit = onlyHit(shootThrough(wall(-8, 'wood', 0.2)));

    expect(hit.damage).toBeCloseTo(bulletDamage(hit.distance, hit.zone) * multiplier('wood'), 9);
  });

  it('a bullet through two layers multiplies both', () => {
    const hit = onlyHit(shootThrough(wall(-6, 'plaster', 0.12), wall(-12, 'wood', 0.2)));

    expect(hit.damage).toBeCloseTo(bulletDamage(hit.distance, hit.zone) * multiplier('plaster') * multiplier('wood'), 9);
  });

  it('sheet metal, glass and plastic let bullets through at their own multipliers', () => {
    for (const [material, thickness] of [
      ['sheetMetal', 0.05],
      ['glass', 0.01],
      ['plastic', 0.1],
    ] as const) {
      const hit = onlyHit(shootThrough(wall(-8, material, thickness)));
      expect(hit.damage, material).toBeCloseTo(bulletDamage(hit.distance, hit.zone) * multiplier(material), 9);
    }
  });

  it('a layer thicker than the budget allows stops the bullet', () => {
    const row = TABLE.wood;
    if (row.stops) throw new Error('wood should be penetrable');
    const tooThick = (STATS.penetration.budget.value / row.cost.value) * 1.2;
    const out = shootThrough(wall(-8, 'wood', tooThick));

    expect(eventsOf(out, 'hit')).toHaveLength(0);
    expect(eventsOf(out, 'impact')).toHaveLength(1);
  });

  it('the budget is shared across layers', () => {
    const row = TABLE.wood;
    if (row.stops) throw new Error('wood should be penetrable');
    // Each layer costs 60 % of the budget: the first goes through, the second stops the bullet.
    const layer = (STATS.penetration.budget.value * 0.6) / row.cost.value;
    const out = shootThrough(wall(-6, 'wood', layer), wall(-12, 'wood', layer));

    expect(eventsOf(out, 'hit')).toHaveLength(0);
    expect(eventsOf(out, 'impact').map((e) => e.side)).toEqual(['entry', 'exit', 'entry']);
  });

  it('every stopping material stops the bullet', () => {
    const stoppers = Object.entries(TABLE).filter(([, row]) => row.stops).map(([m]) => m as Material);
    expect(stoppers.sort()).toEqual(['asphalt', 'brick', 'concrete', 'dirt', 'grass', 'gravel', 'metal', 'sand'].sort());
    for (const material of stoppers) {
      const out = shootThrough(wall(-8, material, 0.02));
      expect(eventsOf(out, 'hit'), material).toHaveLength(0);
      expect(eventsOf(out, 'impact'), material).toMatchObject([{ material, side: 'entry' }]);
    }
  });

  it('emits an impact on entry and on exit of each penetrated solid', () => {
    const out = shootThrough(wall(-8, 'wood', 0.2));
    const impacts = eventsOf(out, 'impact');

    expect(impacts.map((e) => e.side)).toEqual(['entry', 'exit']);
    const [entry, exit] = impacts as [(typeof impacts)[0], (typeof impacts)[0]];
    expect(entry.point[2]).toBeCloseTo(-8, 6);
    expect(entry.normal).toEqual([0, 0, 1]);
    expect(exit.point[2]).toBeCloseTo(-8.2, 6);
    expect(exit.normal).toEqual([0, 0, -1]);
    expect(entry.tick).toBeLessThanOrEqual(onlyHit(out).tick);
  });

  it('player clip in the path changes nothing', () => {
    const without = onlyHit(shootThrough(wall(-8, 'wood', 0.2)));
    const withClip = shootThrough(wall(-8, 'wood', 0.2), playerClip({ min: [-10, 0, -10.5], max: [10, 4, -10], material: 'concrete' }));

    expect(onlyHit(withClip).damage).toBe(without.damage);
    expect(eventsOf(withClip, 'impact')).toHaveLength(2);
  });
});

describe('props', () => {
  /** A mannequin head: a small plastic prop right in front of the target's chest. */
  const head = (id: string, z = -19.6) => box({ min: [-0.3, 0.5, z - 0.3], max: [0.3, 2, z], material: 'plastic', prop: id });

  it('a prop hit emits a prop event and the bullet behind it does full damage', () => {
    const out = shootThrough(head('mannequin-1'));
    const hit = onlyHit(out);

    expect(eventsOf(out, 'prop')).toMatchObject([{ prop: 'mannequin-1', shooter: SHOOTER }]);
    expect(hit.damage).toBeCloseTo(bulletDamage(hit.distance, hit.zone), 9);
    expect(eventsOf(out, 'impact')).toHaveLength(0);
  });

  it('a prop never uses up the budget', () => {
    const row = TABLE.wood;
    if (row.stops) throw new Error('wood should be penetrable');
    const allOfIt = (STATS.penetration.budget.value * 0.99) / row.cost.value;
    const hit = onlyHit(shootThrough(head('a', -4), head('b', -5), wall(-8, 'wood', allOfIt)));

    expect(hit.damage).toBeCloseTo(bulletDamage(hit.distance, hit.zone) * multiplier('wood'), 9);
  });
});

describe('props over the network', () => {
  const LANE: readonly SpawnPoint[] = [
    { position: [0, 0, 0], yaw: 0 },
    { position: [0, 0, -20], yaw: Math.PI },
  ];
  const BAD_NETWORK = { latency: 0.08, jitter: 0.02, loss: 0.05, seed: 11 } as const;

  function joinAll(m: NetworkedMatch, ...names: string[]): NetworkedClient[] {
    const clients = names.map((n) => m.join(n));
    for (let i = 0; i < ticks(3) && clients.some((c) => c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
    return clients;
  }

  /** Alice, at the first spawn, fires straight ahead through a prop 4 m in front of her. */
  function popFirst(m: NetworkedMatch): void {
    const [alice] = joinAll(m, 'alice');
    m.run(ticks(STATS.weapon.drawTime.value) + 5);
    expect(alice!.client.self?.position).toEqual([0, 0, 0]);
    m.step({ alice: usercmd({ buttons: ['Ads'] }) });
    m.run(ticks(0.4), () => ({ alice: usercmd({ buttons: ['Ads'] }) }));
    m.step({ alice: usercmd({ buttons: ['Ads', 'Fire'], firePresses: [0] }) });
    m.run(ticks(0.5));
  }

  const HEAD = box({ min: [-0.4, 1, -4.4], max: [0.4, 2, -4], material: 'plastic', prop: 'head-1' });

  it('a late joiner receives the popped set', () => {
    const m = createNetworkedMatch({ solids: [FLOOR, HEAD], spawns: LANE, ...BAD_NETWORK });
    popFirst(m);
    expect(m.server.popped).toEqual(['head-1']);

    const [carol] = joinAll(m, 'carol');
    m.run(ticks(0.5));
    expect(carol!.client.popped).toEqual(['head-1']);
  });

  it('the popped set is empty after match start', () => {
    const m = createNetworkedMatch({ solids: [FLOOR, HEAD], spawns: LANE, modes: { ffa: { killLimit: 1 } }, intermission: { nuke: 0.5, vote: 0.5 }, ...BAD_NETWORK });
    popFirst(m);
    const [bob] = joinAll(m, 'bob');
    expect(m.server.popped).toEqual(['head-1']);

    // Alice kills Bob, which ends the match; the next one starts a second later.
    const alice = m.client('alice');
    let aim = { yaw: 0, pitch: 0 };
    for (let i = 0; i < ticks(5) && !m.history.some((o) => o.events.some((e) => e.type === 'kill')); i++) {
      const me = alice.client.self!;
      const seen = alice.client.others().find((p) => p.id === bob!.client.id);
      if (!seen) {
        m.step();
        continue;
      }
      const centre = zoneCentre(seen, 'upperTorso');
      const want = anglesOf([centre[0] - me.position[0], centre[1] - me.position[1] - me.eyeHeight, centre[2] - me.position[2]]);
      aim = { yaw: want.yaw - (me.yaw - aim.yaw), pitch: want.pitch - (me.pitch - aim.pitch) };
      m.step({ alice: usercmd({ ...aim, buttons: ['Ads', 'Fire'] }) });
    }
    m.run(ticks(1.5));

    expect(m.history.flatMap((o) => o.events as readonly SimEvent[]).some((e) => e.type === 'kill')).toBe(true);
    expect(m.server.popped).toEqual([]);
    m.run(ticks(0.5));
    expect(bob!.client.popped).toEqual([]);
  });
});

describe('penetration over the network', () => {
  it('registers a lag-compensated wallbang on a strafing target through a wood wall', () => {
    const LANE: readonly SpawnPoint[] = [
      { position: [0, 0, 0], yaw: 0 },
      { position: [0, 0, -20], yaw: Math.PI },
    ];
    const m = createNetworkedMatch({ solids: [FLOOR, wall(-10, 'wood', 0.15)], spawns: LANE, latency: 0.08, jitter: 0.02, loss: 0.05, seed: 7, spawnProtection: 0 });
    const alice = m.join('alice');
    const bob = m.join('bob');
    for (let i = 0; i < ticks(3) && [alice, bob].some((c) => c.client.status !== 'joined' || !c.latest?.self); i++) m.step();

    let aim = { yaw: 0, pitch: 0 };
    const start = m.history.length;
    m.run(ticks(14), (t) => {
      const me = alice.client.self!;
      const seen = alice.client.others().find((p) => p.id === bob.client.id)!;
      const centre = zoneCentre(seen, 'upperTorso');
      const want = anglesOf([centre[0] - me.position[0], centre[1] - me.position[1] - me.eyeHeight, centre[2] - me.position[2]]);
      aim = { yaw: want.yaw - (me.yaw - aim.yaw), pitch: want.pitch - (me.pitch - aim.pitch) };
      // Held while Bob is down and waiting to respawn.
      const tap = t % 20 === 0 && t - start > 60 && seen.alive;
      return {
        alice: usercmd({ ...aim, buttons: tap ? ['Ads', 'Fire'] : ['Ads'] }),
        bob: usercmd({ yaw: Math.PI, right: Math.floor(t / 45) % 2 === 0 ? 1 : -1 }),
      };
    });
    const events = m.history.slice(start).flatMap((o) => o.events as readonly SimEvent[]);
    const shots = events.filter((e) => e.type === 'shot' && e.shooter === alice.client.id);
    const hits = events.filter((e): e is Extract<SimEvent, { type: 'hit' }> => e.type === 'hit' && e.shooter === alice.client.id);

    expect(shots.length).toBeGreaterThan(10);
    expect(hits.length / shots.length).toBeGreaterThan(0.9);
    for (const h of hits) expect(h.damage).toBeCloseTo(bulletDamage(h.distance, h.zone) * multiplier('wood'), 9);
  });
});
