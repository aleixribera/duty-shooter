import { describe, expect, it } from 'vitest';
import { STATS, TICK_SECONDS, anglesOf, bulletDamage, zoneCentre, type PlayerOutput, type SpawnPoint, type UserCmd } from '@duty-shooter/fps-core';
import { createHeadlessMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { buildMap, collisionSolids } from '../src/map/map';

const map = buildMap();
const solids = collisionSolids(map);

/** A match on the real map with one player standing at `at`. */
function standAt(at: SpawnPoint) {
  return createHeadlessMatch({ solids, players: [{ id: 'p', team: 1, position: at.position, yaw: at.yaw }] });
}

function run(match: ReturnType<typeof standAt>, seconds: number, cmd: (i: number) => UserCmd): PlayerOutput[] {
  const out: PlayerOutput[] = [];
  for (let i = 0; i < Math.round(seconds / TICK_SECONDS); i++) out.push(match.step({ p: cmd(i) }).players[0]!);
  return out;
}

describe('map: movement course', () => {
  it('has a ledge in each mantle band', () => {
    expect(map.course.ledges.map((l) => l.band).sort()).toEqual(['highClimb', 'lowVault', 'waist']);
  });

  for (const ledge of map.course.ledges) {
    it(`the ${ledge.band} ledge (${ledge.height.toFixed(2)} m) mantles in its band`, () => {
      const match = standAt(ledge.approach);
      const yaw = ledge.approach.yaw;
      run(match, 0.2, () => usercmd({ yaw }));

      const out = run(match, 2, (i) => (i === 0 ? usercmd({ yaw, forward: 1, buttons: ['Jump'] }) : usercmd({ yaw })));

      expect(out[0]).toMatchObject({ movement: 'mantle', mantle: ledge.band });
      expect(out.at(-1)!.position[1]).toBeCloseTo(ledge.height, 6);
    });
  }

  for (const drop of map.course.drops) {
    it(`the ${drop.height} m drop is ${drop.outcome}`, () => {
      const match = standAt(drop.edge);
      const yaw = drop.edge.yaw;

      const out = run(match, 3, () => usercmd({ yaw, forward: 1 }));

      const landing = out.find((p) => p.landing)!.landing!;
      expect(landing.fallHeight).toBeCloseTo(drop.height, 1);
      if (drop.outcome === 'safe') expect(landing.damage).toBe(0);
      if (drop.outcome === 'damage') {
        expect(landing.damage).toBeGreaterThan(0);
        expect(out.at(-1)!.alive).toBe(true);
      }
      if (drop.outcome === 'lethal') expect(out.at(-1)!.alive).toBe(false);
    });
  }

  it('drops span the fall-damage thresholds', () => {
    const heights = Object.fromEntries(map.course.drops.map((d) => [d.outcome, d.height]));
    expect(heights['safe']).toBeLessThan(STATS.fallDamage.minHeight.value);
    expect(heights['damage']).toBeGreaterThan(STATS.fallDamage.minHeight.value);
    expect(heights['damage']).toBeLessThan(STATS.fallDamage.lethalHeight.value);
    expect(heights['lethal']).toBeGreaterThan(STATS.fallDamage.lethalHeight.value);
  });

  for (const [name, station] of [
    ['stairs', map.course.stairs],
    ['ramp', map.course.ramp],
  ] as const) {
    it(`the ${name} can be walked up without jumping`, () => {
      const match = standAt(station.start);
      const out = run(match, 4, () => usercmd({ yaw: station.start.yaw, forward: 1 }));

      expect(Math.max(...out.map((p) => p.position[1]))).toBeCloseTo(station.top, 6);
      expect(out.some((p) => p.movement === 'airborne' && p.velocity[1] > 0)).toBe(false);
    });
  }

  for (const gap of map.course.gaps) {
    const jumpAcross = (buttons: readonly ('Sprint' | 'TacticalSprint')[]) => {
      const match = standAt(gap.runUp);
      const yaw = gap.runUp.yaw;
      const nearEdge = gap.runUp.position[2] - gap.runUpLength;
      let jumped = false;
      const out = run(match, 3, () => {
        const me = match.latest.players[0]!;
        // Jump on the last grounded tick before the edge.
        const jump = !jumped && me.position[2] < nearEdge - 0.05;
        if (jump) jumped = true;
        return usercmd({ yaw, forward: 1, buttons: [...buttons, ...(jump ? (['Jump'] as const) : [])] });
      });
      const end = out.at(-1)!;
      return end.position[1] > gap.height - 0.01 && end.position[2] < gap.farEdgeZ;
    };

    it(`the ${gap.width} m gap needs a ${gap.sprint} jump`, () => {
      expect(jumpAcross(gap.sprint === 'sprint' ? ['Sprint'] : ['Sprint', 'TacticalSprint'])).toBe(true);
      expect(jumpAcross(gap.sprint === 'sprint' ? [] : ['Sprint'])).toBe(false);
    });
  }
});

describe('map: penetration station', () => {
  /** One aimed shot from the station's firing line, square to the lane, at its dummy; the hit, if any. */
  function shootLane(dummy: string) {
    const target = map.dummies.find((d) => d.id === dummy)!;
    const from = map.penetration.shooter;
    const match = createHeadlessMatch({ solids, players: [{ id: 'p', team: 1, position: [target.position[0], from.position[1], from.position[2]], yaw: from.yaw }, target] });
    const eye = (): [number, number, number] => {
      const me = match.latest.players[0]!;
      return [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
    };
    const aim = () => {
      const centre = zoneCentre(match.latest.players[1]!, 'upperTorso');
      const e = eye();
      return anglesOf([centre[0] - e[0], centre[1] - e[1], centre[2] - e[2]]);
    };
    run(match, STATS.weapon.drawTime.value + 0.5, () => usercmd({ ...aim(), buttons: ['Ads'] }));
    const a = aim();
    const out = [match.step({ p: usercmd({ ...a, buttons: ['Ads', 'Fire'], firePresses: [0] }) }), ...Array.from({ length: 20 }, () => match.step({ p: usercmd({ ...a, buttons: ['Ads'] }) }))];
    return out.flatMap((o) => o.events).find((e) => e.type === 'hit') ?? null;
  }

  for (const lane of map.penetration.lanes) {
    it(`the ${lane.material} lane lets through what the table says`, () => {
      const row = STATS.penetration.materials[lane.material];
      const hit = shootLane(lane.dummy);
      if (row.stops) {
        expect(hit).toBeNull();
        return;
      }
      expect(hit?.type).toBe('hit');
      if (hit?.type !== 'hit') return;
      expect(hit.damage).toBeCloseTo(bulletDamage(hit.distance, hit.zone) * row.damage.value, 6);
    });
  }

  it('covers wood, plaster, sheet metal and brick', () => {
    expect(map.penetration.lanes.map((l) => l.material)).toEqual(['wood', 'plaster', 'sheetMetal', 'brick']);
  });
});

describe('map: sniping lane', () => {
  /** One aimed shot with `weapon` from the lane's firing point at a target's upper torso; the hit, if any. */
  function shootTarget(dummy: string, weapon: 'sniper' | 'm4a1') {
    const target = map.dummies.find((d) => d.id === dummy)!;
    const from = map.sniping.shooter;
    const match = createHeadlessMatch({ solids, players: [{ id: 'p', team: 1, position: from.position, yaw: from.yaw, loadout: { primary: weapon, secondary: 'pistol', grenade: null } }, target] });
    const aim = () => {
      const me = match.latest.players[0]!;
      const centre = zoneCentre(match.latest.players[1]!, 'upperTorso');
      return anglesOf([centre[0] - me.position[0], centre[1] - me.position[1] - me.eyeHeight, centre[2] - me.position[2]]);
    };
    // Aimed and settled (the scope's sway dies down standing still).
    run(match, 4, () => usercmd({ ...aim(), buttons: ['Ads'] }));
    // Shots leave along the aim plus the scope's sway: aim against it, as a player does.
    const me = match.latest.players[0]!;
    const a = { yaw: aim().yaw - me.weapon.sway[0], pitch: aim().pitch - me.weapon.sway[1] };
    const out = [match.step({ p: usercmd({ ...a, buttons: ['Ads', 'Fire'], firePresses: [0] }) }), ...Array.from({ length: 30 }, () => match.step({ p: usercmd({ ...a, buttons: ['Ads'] }) }))];
    return out.flatMap((o) => o.events).find((e) => e.type === 'hit') ?? null;
  }

  it('has targets 25, 50, 75 and 100 m from its firing point', () => {
    const from = map.sniping.shooter.position;
    const distances = map.sniping.targets.map((t) => {
      const d = map.dummies.find((x) => x.id === t.dummy)!.position;
      return Math.hypot(d[0] - from[0], d[2] - from[2]);
    });
    expect(distances.map((d) => Math.round(d))).toEqual([25, 50, 75, 100]);
    expect(map.sniping.targets.map((t) => t.distance)).toEqual([25, 50, 75, 100]);
  });

  for (const distance of [25, 50, 75, 100]) {
    it(`gives a clear shot at the ${distance} m target, one sniper round to the body, and the rifle's damage at that range`, () => {
      const dummy = map.sniping.targets.find((t) => t.distance === distance)!.dummy;
      const snipe = shootTarget(dummy, 'sniper');
      expect(snipe).toMatchObject({ type: 'hit', killed: true });
      const rifle = shootTarget(dummy, 'm4a1');
      expect(rifle?.type).toBe('hit');
      if (rifle?.type !== 'hit') return;
      expect(rifle.damage).toBeCloseTo(bulletDamage(rifle.distance, rifle.zone), 6);
    });
  }
});

describe('map: loadout station', () => {
  it('stands beside the firing line, where a player can walk up to it', () => {
    const s = map.loadoutStation;
    expect(Math.hypot(s.position[0] - map.rangeSpawn.position[0], s.position[2] - map.rangeSpawn.position[2])).toBeLessThan(10);
    const spot: SpawnPoint = { position: [s.position[0], 0, s.position[2] + s.radius * 0.6], yaw: 0 };
    const out = run(standAt(spot), 0.5, () => usercmd({ yaw: 0 }));
    expect(out.at(-1)!.position).toEqual(spot.position);
  });
});

describe('map: range', () => {
  it('has static dummies 10, 25 and 50 m from the firing line', () => {
    const lanes = map.dummies.filter((d) => !d.dummy?.rail && !d.id.startsWith('dummy-pen-') && !d.id.startsWith('dummy-snipe-')).map((d) => -d.position[2] + map.rangeSpawn.position[2]);
    expect(lanes).toEqual([10, 25, 50]);
  });

  it('has rail dummies at walk and sprint speed', () => {
    expect(map.dummies.filter((d) => d.dummy?.rail).map((d) => d.dummy!.rail!.speed)).toEqual([STATS.movement.walkSpeed.value, STATS.movement.sprintSpeed.value]);
  });

  it('gives every box a material tag', () => {
    expect(solids.every((b) => typeof b.material === 'string' && b.material.length > 0)).toBe(true);
  });

  it('spawns players standing on the ground, not inside geometry', () => {
    for (const spawn of [map.rangeSpawn, ...map.teamSpawns.flat()]) {
      const match = standAt(spawn);
      const out = run(match, 0.5, () => usercmd({ yaw: spawn.yaw }));
      expect(out.at(-1)!.position).toEqual(spawn.position);
    }
  });
});
