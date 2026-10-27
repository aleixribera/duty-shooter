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
  return { tick: 0, time: 0, matchTime: 0, players: out.players, spawns, teamSpawns, world, zones: [], sites: [], using: new Set() };
}

describe('spawn rules', () => {
  it('free-for-all spawns out of sight of living enemies, even when a seen spawn is farther away', () => {
    const seen = at(-40, 0);
    const hidden = at(14, 0);
    const ctx = context([{ position: [0, 0, 0], team: 1 }], [seen, hidden]);
    const ffa = new FreeForAll();
    ffa.start([{ id: 'p1', name: 'enemy', team: null }, { id: 'p9', name: 'me', team: null }]);
    ffa.chooseSpawn('p1', ctx);
    expect(ffa.chooseSpawn('p9', ctx)).toBe(hidden);
  });

  it('never spawns within 8 m of a living enemy while there is another spawn, out of sight or not', () => {
    // The hidden spawn is right behind the wall, 6 m from an enemy who has walked round to it.
    const close = at(12, 3);
    const seen = at(-30, 0);
    const ctx = context([{ position: [8, 0, 4], team: 1 }], [close, seen]);
    const ffa = new FreeForAll();
    ffa.start([{ id: 'p1', name: 'enemy', team: null }, { id: 'p9', name: 'me', team: null }]);
    ffa.chooseSpawn('p1', ctx);
    expect(ffa.chooseSpawn('p9', ctx)).toBe(seen);
  });

  it("doesn't put a player back on the spot of either of their last two spawns", () => {
    // All in the enemy's sight, so only distance and the player's own history tell them apart.
    const spawns = [at(30, 10), at(30, 20), at(30, -20), at(-10, 30)];
    const ctx = context([{ position: [-30, 0, 0], team: 1 }], spawns);
    const ffa = new FreeForAll();
    ffa.start([{ id: 'p1', name: 'enemy', team: null }, { id: 'p9', name: 'me', team: null }]);
    ffa.chooseSpawn('p1', ctx);
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
    tdm.chooseSpawn('p1', ctx);
    expect(tdm.chooseSpawn('p9', ctx)).toBe(blue[0]);
    // Later spawns: the home spawn is in plain view 30 m off; the one behind the wall wins.
    expect(tdm.chooseSpawn('p9', ctx)).toBe(hidden);
  });

  it("doesn't count players who haven't spawned yet this match: they still stand where the last one left them", () => {
    // The enemy stands on the only hidden spawn, left over from the last match.
    const hidden = at(14, 0);
    const seen = at(-40, 0);
    const ctx = context([{ position: [14, 0, 1], team: 1 }], [hidden, seen]);
    const ffa = new FreeForAll();
    ffa.start([{ id: 'p1', name: 'enemy', team: null }, { id: 'p9', name: 'me', team: null }]);
    expect(ffa.chooseSpawn('p9', ctx)).toBe(hidden);
  });

  it('sees through windows: a spawn behind glass is in sight', () => {
    const glass = createWorld([FLOOR, box({ min: [10, 0, -2], max: [10.1, 4, 2], material: 'glass' })]);
    const behindGlass = at(14, 0);
    const far = at(-40, 30);
    const ctx = { ...context([{ position: [0, 0, 0], team: 1 }], [behindGlass, far]), world: glass };
    const ffa = new FreeForAll();
    ffa.start([{ id: 'p1', name: 'enemy', team: null }, { id: 'p9', name: 'me', team: null }]);
    ffa.chooseSpawn('p1', ctx);
    // Both are in sight, so distance decides: the far one, not the near one behind the window.
    expect(ffa.chooseSpawn('p9', ctx)).toBe(far);
  });

  it('treats two spawn points at the same place as one when avoiding the last two spawns', () => {
    // The team's home spawn and a free-for-all point share a spot; both are in the enemy's sight.
    const home = at(30, 10);
    const copy = at(30, 10);
    const other = at(30, -12);
    const ctx = context([{ position: [-30, 0, 0], team: 2 }], [copy, other], [[home], [at(-30, 0)]]);
    const tdm = new TeamDeathmatch();
    tdm.start([{ id: 'p1', name: 'enemy', team: 2 }, { id: 'p9', name: 'me', team: 1 }]);
    tdm.chooseSpawn('p1', ctx);
    expect(tdm.chooseSpawn('p9', ctx)).toBe(home);
    expect(tdm.chooseSpawn('p9', ctx).position).toEqual(other.position);
  });

  it("a player joining mid-match whose team's spawns are overrun spawns elsewhere", () => {
    const home = at(0, 30);
    // The enemy stands in the home spawn's yard.
    const ctx = context([{ position: [0, 0, 26], team: 2 }], [at(14, 0)], [[home], [at(0, -30)]]);
    const tdm = new TeamDeathmatch();
    tdm.start([{ id: 'p1', name: 'enemy', team: 2 }]);
    tdm.chooseSpawn('p1', ctx);
    tdm.join('p9', 'me');
    const spawn = tdm.chooseSpawn('p9', ctx);
    expect(spawn).not.toBe(home);
    expect(Math.hypot(spawn.position[0], spawn.position[2] - 26)).toBeGreaterThan(8);
  });
});
