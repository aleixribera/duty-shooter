import { describe, expect, it } from 'vitest';
import { Terrain, createWorld, findPath, nearestNode, type MatchResult, type ModeContext, type SpawnPoint } from '@duty-shooter/fps-core';
import { BattleRoyale, playGround, type SquadSize } from '@duty-shooter/fps-core/modes';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { buildMapById, insidePolygon, mapSolids } from '../src/map/maps';
import { islandNav } from './support/island-nav';

const map = buildMapById('zero-island');
const solids = mapSolids(map);
const terrain = new Terrain(map.terrain!);
const world = createWorld(solids, { terrain: map.terrain });
const nav = islandNav(map);
const ground = playGround(nav, world, map.towns);
const SIZES = [[1, 60], [2, 30], [3, 20]] as const;
/** Seconds of the soak's match: ROYALE_FULL=1 plays the whole ten minutes, which takes minutes at each size. */
const LENGTH = process.env['ROYALE_FULL'] ? 600 : 120;

/** A match's spawns and circles, from the mode alone. */
function opening(size: SquadSize, squads: number, seed: number) {
  const mode = new BattleRoyale({ squadSize: size, seed });
  const seats = Array.from({ length: 60 }, (_, i) => ({ id: `p${i + 1}`, name: `n${i + 1}`, team: null }));
  const ctx = { spawns: map.spawns.ffa, world, ground } as unknown as ModeContext;
  const teams = mode.start(seats, ctx);
  expect(new Set(teams.values()).size).toBe(squads);
  return { ring: mode.ring, spawns: seats.map((s) => ({ team: teams.get(s.id)!, spawn: mode.chooseSpawn(s.id, ctx) })) };
}

const apart = (a: SpawnPoint, b: SpawnPoint) => Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);

describe('a Battle Royale on Zero Island', () => {
  it.each(SIZES)('Squads of %i start 100 m from any other Squad, on land inside the Boundary', (size, squads) => {
    for (let seed = 0; seed < 40; seed++) {
      const { spawns } = opening(size, squads, seed);
      for (const [i, a] of spawns.entries()) {
        const [x, y, z] = a.spawn.position;
        expect(insidePolygon(map.playArea!, x, z), `${x}, ${z}`).toBe(true);
        expect(terrain.waterAbove(x, y, z)).toBeLessThan(0);
        expect(Math.abs(y - terrain.heightAt(x, z))).toBeLessThan(0.6);
        for (const b of spawns.slice(i + 1)) {
          if (a.team === b.team) expect(apart(a.spawn, b.spawn)).toBeLessThan(11);
          else expect(apart(a.spawn, b.spawn), `seed ${seed}`).toBeGreaterThanOrEqual(100);
        }
      }
    }
  });

  it('every spawn has a way to the middle of the island', () => {
    const middle = nearestNode(nav, world, [...ground.spot(ground.near(ground.centre[0], ground.centre[1], 80)[0]!)]);
    for (let seed = 0; seed < 8; seed++) {
      for (const { spawn } of opening(1, 60, seed).spawns) expect(findPath(nav, nearestNode(nav, world, spawn.position), middle), `${spawn.position}`).not.toBeNull();
    }
  });

  it('closes where a route goes both ways between it and the middle of the island (review, ticket 68)', () => {
    const middle = nearestNode(nav, world, [...ground.spot(ground.near(ground.centre[0], ground.centre[1], 80)[0]!)]);
    for (let seed = 0; seed < 30; seed++) {
      const end = opening(1, 60, seed).ring.at(-1)!.to;
      const there = nearestNode(nav, world, [end.x, terrain.heightAt(end.x, end.z), end.z]);
      expect(findPath(nav, there, middle), `seed ${seed}`).not.toBeNull();
      expect(findPath(nav, middle, there), `seed ${seed}`).not.toBeNull();
    }
  });

  it('closes on land', () => {
    for (let seed = 0; seed < 100; seed++) {
      const end = opening(1, 60, seed).ring.at(-1)!.to;
      expect(end.radius).toBe(0);
      expect(ground.near(end.x, end.z, 1)).not.toHaveLength(0);
    }
  });

  it('a sprint from anywhere in a circle reaches the next before the wall does', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const s of opening(1, 60, seed).ring) {
        const run = Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z) + s.from.radius - s.to.radius;
        expect(run / 6.22).toBeLessThan(s.shrinkEnd - s.start);
      }
    }
  });

  it.each(SIZES)(`bots play a whole match in Squads of %i to a result within its ${LENGTH} s`, (size, squads) => {
    const m = createNetworkedMatch({
      solids,
      terrain: map.terrain!,
      spawns: map.spawns.ffa,
      mode: 'battle-royale',
      modes: { battleRoyale: { squadSize: size, seed: size, timeLimit: LENGTH } },
      bots: { nav, perTeam: 30, alwaysOn: true },
      teamSize: { 'battle-royale': 30 },
    });
    expect(m.server.latest.players).toHaveLength(0);
    m.step();
    expect(m.server.bots.size).toBe(60);
    let result: MatchResult | null = null;
    let kills = 0;
    let byRing = 0;
    let outside = 0;
    let stages = 0;
    for (let tick = 0; tick < (LENGTH + 1) * 60 && !result; tick++) {
      const out = m.step();
      for (const e of out.events) if (e.type === 'kill') (kills += 1), (byRing += e.cause === 'ring' ? 1 : 0);
      for (const e of m.server.modeEvents) {
        if (e.type === 'matchEnd') result = e;
        if (e.type === 'stage') stages += 1;
      }
      if (tick % 60 === 0) for (const p of out.players) if (p.alive && !insidePolygon(map.playArea!, p.position[0], p.position[2])) outside += 1;
    }
    console.log(`Squads of ${size}: ${JSON.stringify(result)} after ${m.server.simulation.time.toFixed(0)} s; ${kills} deaths, ${byRing} to the Ring`);
    expect(result).toMatchObject({ draw: false, reason: 'lastSquad' });
    expect(result!.winner).toBeGreaterThanOrEqual(1);
    expect(result!.winner).toBeLessThanOrEqual(squads);
    expect(kills).toBeGreaterThanOrEqual(60 - size);
    expect(stages).toBeGreaterThanOrEqual(2);
    expect(outside).toBe(0);
    expect(m.server.mode.scores().filter((s) => s.place === 1)).toHaveLength(m.server.mode.scores().filter((s) => s.team === result!.winner).length);
  }, 900_000);
});
