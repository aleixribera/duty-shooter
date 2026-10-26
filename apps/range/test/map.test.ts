import { describe, expect, it } from 'vitest';
import { STATS, TICK_SECONDS, type PlayerOutput, type SpawnPoint, type UserCmd } from '@duty-shooter/fps-core';
import { createHeadlessMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { buildMap, collisionBoxes } from '../src/map/map';

const map = buildMap();
const boxes = collisionBoxes(map);

/** A match on the real map with one player standing at `at`. */
function standAt(at: SpawnPoint) {
  return createHeadlessMatch({ boxes, players: [{ id: 'p', team: 1, position: at.position, yaw: at.yaw }] });
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

describe('map: range', () => {
  it('has static dummies 10, 25 and 50 m from the firing line', () => {
    const lanes = map.dummies.filter((d) => !d.dummy?.rail).map((d) => -d.position[2] + map.rangeSpawn.position[2]);
    expect(lanes).toEqual([10, 25, 50]);
  });

  it('has rail dummies at walk and sprint speed', () => {
    expect(map.dummies.filter((d) => d.dummy?.rail).map((d) => d.dummy!.rail!.speed)).toEqual([STATS.movement.walkSpeed.value, STATS.movement.sprintSpeed.value]);
  });

  it('gives every box a material tag', () => {
    expect(boxes.every((b) => typeof b.material === 'string' && b.material.length > 0)).toBe(true);
  });

  it('spawns players standing on the ground, not inside geometry', () => {
    for (const spawn of [map.rangeSpawn, ...map.arenaSpawns]) {
      const match = standAt(spawn);
      const out = run(match, 0.5, () => usercmd({ yaw: spawn.yaw }));
      expect(out.at(-1)!.position).toEqual(spawn.position);
    }
  });
});
