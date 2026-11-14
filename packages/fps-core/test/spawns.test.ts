import { describe, expect, it } from 'vitest';
import { Simulation, createWorld, type Vec3 } from '@duty-shooter/fps-core';
import { box } from '@duty-shooter/fps-core/harness';
import { FreeForAll, Outposts, TeamDeathmatch, type ModeContext, type SpawnPoint } from '@duty-shooter/fps-core/modes';
import { FLOOR } from './support/movement';

/** A seeded stream of values in [0, 1), so the draws below are the same every run. */
function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tall wall along x = 10, from z = -2 to 2: whoever stands west of it can't see east of it. */
const world = createWorld([FLOOR, box({ min: [10, 0, -2], max: [10.4, 4, 2], material: 'brick' })]);

/** Draws that keep each team at its own set's end of the map (and take the first of every other draw). */
const KEEP_ENDS = () => 0;

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
    const tdm = new TeamDeathmatch({ random: KEEP_ENDS });
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
    // With no living enemy every spawn is as safe and one is drawn: this draw takes the first, the one the stale enemy stands on.
    const ffa = new FreeForAll({ random: () => 0 });
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
    const tdm = new TeamDeathmatch({ random: KEEP_ENDS });
    tdm.start([{ id: 'p1', name: 'enemy', team: 2 }, { id: 'p9', name: 'me', team: 1 }]);
    tdm.chooseSpawn('p1', ctx);
    expect(tdm.chooseSpawn('p9', ctx)).toBe(home);
    expect(tdm.chooseSpawn('p9', ctx).position).toEqual(other.position);
  });

  it("a player joining mid-match whose team's spawns are overrun spawns elsewhere", () => {
    const home = at(0, 30);
    // The enemy stands in the home spawn's yard.
    const ctx = context([{ position: [0, 0, 26], team: 2 }], [at(14, 0)], [[home], [at(0, -30)]]);
    const tdm = new TeamDeathmatch({ random: KEEP_ENDS });
    tdm.start([{ id: 'p1', name: 'enemy', team: 2 }]);
    tdm.chooseSpawn('p1', ctx);
    tdm.join('p9', 'me');
    const spawn = tdm.chooseSpawn('p9', ctx);
    expect(spawn).not.toBe(home);
    expect(Math.hypot(spawn.position[0], spawn.position[2] - 26)).toBeGreaterThan(8);
  });

  describe("a free-for-all's opening spawns are dealt together (ticket 100)", () => {
    // B and C stand either side of the wall and can't see each other; A, north of the wall's end, sees both.
    const A = at(10, 30);
    const B = at(0, 0);
    const C = at(20, 0);
    const entrants = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `p${i + 1}`, team: null }));

    it('two players open out of each other\'s sight whichever spawn the draw starts from, where one at a time could not', () => {
      const ctx = context([], [A, B, C]);
      for (let s = 1; s <= 20; s++) {
        const ffa = new FreeForAll({ random: seeded(s) });
        ffa.start(entrants(2), ctx);
        const dealt = [ffa.chooseSpawn('p1', ctx), ffa.chooseSpawn('p2', ctx)];
        expect(new Set(dealt)).toEqual(new Set([B, C]));
      }
      // Placed one at a time, the first to land on A leaves the second only a spawn A sees.
      const old = new FreeForAll({ random: () => 0 });
      old.start(entrants(2));
      expect(old.chooseSpawn('p1', ctx)).toBe(A);
    });

    it('counts two spawns within 8 m as seen, across a wall or not', () => {
      // West and East stand 3 m apart either side of the wall; North sees both from 30 m.
      const west = at(8.5, 0);
      const east = at(11.5, 0);
      const north = at(8.5, 30);
      const ctx = context([], [west, east, north]);
      for (let s = 1; s <= 10; s++) {
        const ffa = new FreeForAll({ random: seeded(s) });
        ffa.start(entrants(2), ctx);
        expect([ffa.chooseSpawn('p1', ctx), ffa.chooseSpawn('p2', ctx)]).toContain(north);
      }
    });

    it('more players than hidden spawns open on different spawns, then later spawns follow the usual rules', () => {
      const ctx = context([], [A, B, C, at(0, 0.1)]);
      const ffa = new FreeForAll({ random: seeded(7) });
      ffa.start(entrants(3), ctx);
      const dealt = ['p1', 'p2', 'p3'].map((id) => ffa.chooseSpawn(id, ctx));
      expect(new Set(dealt.map((s) => s.position.join()))).toEqual(new Set([A, B, C].map((s) => s.position.join())));
      // The deal is spent: a respawn avoids the player's own last spawn.
      expect(ffa.chooseSpawn('p1', ctx)).not.toBe(dealt[0]);
    });
  });

  describe('drawn, not always the same spot (ticket 31)', () => {
    it('respawns in the same situation land on different safe spots, never seen, never close to an enemy, never a much less safe one', () => {
      // A long wall along x = 10 and the enemy at the origin, west of it. Four spots behind the wall far enough off, one behind it but only 11 m off (much less safe), one seen, one too close.
      const wall = createWorld([FLOOR, box({ min: [10, 0, -40], max: [10.4, 4, 40], material: 'brick' })]);
      const safe = [at(30, 0), at(30, 12), at(34, -10), at(26, 6)];
      const lessSafe = at(11, 3);
      const seen = at(-40, 0);
      const close = at(4, 4);
      const ctx = { ...context([{ position: [0, 0, 0], team: 1 }], [lessSafe, seen, close, ...safe]), world: wall };
      const ffa = new FreeForAll({ random: seeded(31) });
      ffa.start([{ id: 'p1', name: 'enemy', team: null }, { id: 'p9', name: 'me', team: null }]);
      ffa.chooseSpawn('p1', ctx);
      const picks = Array.from({ length: 40 }, () => ffa.chooseSpawn('p9', ctx));
      for (const p of picks) expect(safe).toContain(p);
      expect(new Set(picks).size).toBe(safe.length);
    });

    it("a team's first spawns of a match come in a different order each match, all from one end, and each match draws which end", () => {
      const blue = [at(0, 30), at(4, 30), at(8, 30), at(12, 30), at(16, 30)];
      const orange = [at(0, -30), at(4, -30), at(8, -30), at(12, -30), at(16, -30)];
      const ctx = context([], [at(40, 0)], [blue, orange]);
      const tdm = new TeamDeathmatch({ random: seeded(31) });
      const firsts = Array.from({ length: 12 }, () => {
        tdm.start([{ id: 'p9', name: 'me', team: 1 }, { id: 'p8', name: 'mate', team: 1 }, { id: 'p1', name: 'enemy', team: 2 }]);
        const mine = tdm.chooseSpawn('p9', ctx);
        const mate = tdm.chooseSpawn('p8', ctx);
        const enemy = tdm.chooseSpawn('p1', ctx);
        // Two players of a team never share a first spot; a team starts together at one end, the other team at the other.
        expect(mate).not.toBe(mine);
        const [own, theirs] = blue.includes(mine) ? [blue, orange] : [orange, blue];
        expect(own).toContain(mine);
        expect(own).toContain(mate);
        expect(theirs).toContain(enemy);
        return mine;
      });
      expect(new Set(firsts).size).toBeGreaterThanOrEqual(4);
      // Neither end is Blue's for good: over 12 matches Blue starts at each.
      expect(firsts.filter((f) => blue.includes(f)).length).toBeGreaterThanOrEqual(3);
      expect(firsts.filter((f) => orange.includes(f)).length).toBeGreaterThanOrEqual(3);
    });

    it("Outposts draws the ends too; a random of 0 keeps the map's order", () => {
      const blue = [at(0, 30), at(4, 30)];
      const orange = [at(0, -30), at(4, -30)];
      const ctx = context([], [at(40, 0)], [blue, orange]);
      const entrants = [{ id: 'p9', name: 'me', team: 1 }, { id: 'p1', name: 'enemy', team: 2 }] as const;
      const kept = new Outposts({ random: () => 0 });
      kept.start(entrants);
      expect(blue).toContain(kept.chooseSpawn('p9', ctx));
      const drawn = new Outposts({ random: () => 0.75 });
      drawn.start(entrants);
      expect(orange).toContain(drawn.chooseSpawn('p9', ctx));
      expect(blue).toContain(drawn.chooseSpawn('p1', ctx));
    });
  });
});
