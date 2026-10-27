import { describe, expect, it } from 'vitest';
import { Simulation, createWorld, type Vec3 } from '@duty-shooter/fps-core';
import { box } from '@duty-shooter/fps-core/harness';
import { FreeForAll, TeamDeathmatch, type ModeContext, type SpawnPoint } from '@duty-shooter/fps-core/modes';
import { FLOOR } from './support/movement';

/** A tall wall along x = 10, from z = -2 to 2: whoever stands west of it can't see east of it. */
const world = createWorld([FLOOR, box({ min: [10, 0, -2], max: [10.4, 4, 2], material: 'brick' })]);

const at = (x: number, z: number): SpawnPoint => ({ position: [x, 0, z], yaw: 0 });

/** A mode context with the given players standing about (ids p1, p2, … in order; `team` per player). */
function context(players: { position: Vec3; team: number }[], spawns: readonly SpawnPoint[], teamSpawns: ModeContext['teamSpawns'] = null): ModeContext {
  const sim = new Simulation(world);
  players.forEach((p, i) => sim.addPlayer({ id: `p${i + 1}`, team: p.team, position: p.position }));
  const out = sim.output();
  return { tick: 0, time: 0, matchTime: 0, players: out.players, spawns, teamSpawns, world };
}

describe('spawn rules', () => {
  it('free-for-all spawns out of sight of living enemies, even when a seen spawn is farther away', () => {
    const seen = at(-40, 0);
    const hidden = at(14, 0);
    const ctx = context([{ position: [0, 0, 0], team: 1 }], [seen, hidden]);
    const ffa = new FreeForAll();
    ffa.start([{ id: 'p1', name: 'enemy', team: null }, { id: 'p9', name: 'me', team: null }]);
    expect(ffa.chooseSpawn('p9', ctx)).toBe(hidden);
  });

  it('never spawns within 8 m of a living enemy while there is another spawn, out of sight or not', () => {
    // The hidden spawn is right behind the wall, 6 m from an enemy who has walked round to it.
    const close = at(12, 3);
    const seen = at(-30, 0);
    const ctx = context([{ position: [8, 0, 4], team: 1 }], [close, seen]);
    const ffa = new FreeForAll();
    ffa.start([{ id: 'p1', name: 'enemy', team: null }, { id: 'p9', name: 'me', team: null }]);
    expect(ffa.chooseSpawn('p9', ctx)).toBe(seen);
  });

  it("doesn't put a player back on the spot of either of their last two spawns", () => {
    // All in the enemy's sight, so only distance and the player's own history tell them apart.
    const spawns = [at(30, 10), at(30, 20), at(30, -20), at(-10, 30)];
    const ctx = context([{ position: [-30, 0, 0], team: 1 }], spawns);
    const ffa = new FreeForAll();
    ffa.start([{ id: 'p1', name: 'enemy', team: null }, { id: 'p9', name: 'me', team: null }]);
    const picks = [0, 1, 2, 3].map(() => ffa.chooseSpawn('p9', ctx));
    expect(picks[1]).not.toBe(picks[0]);
    expect(picks[2]).not.toBe(picks[0]);
    expect(picks[2]).not.toBe(picks[1]);
    expect(picks[3]).not.toBe(picks[2]);
  });

  it('team deathmatch keeps the same rules after the first spawn at home', () => {
    const blue = [at(0, 30)];
    const orange = [at(0, -30)];
    const hidden = at(14, 0);
    const ctx = context([{ position: [0, 0, 0], team: 2 }], [hidden, at(-40, 0)], [blue, orange]);
    const tdm = new TeamDeathmatch();
    tdm.start([{ id: 'p1', name: 'enemy', team: 2 }, { id: 'p9', name: 'me', team: 1 }]);
    expect(tdm.chooseSpawn('p9', ctx)).toBe(blue[0]);
    // Later spawns: the home spawn is in plain view 30 m off; the one behind the wall wins.
    expect(tdm.chooseSpawn('p9', ctx)).toBe(hidden);
  });
});
