import { describe, expect, it } from 'vitest';
import { box, createWorld, type SpawnPoint } from '@duty-shooter/fps-core';
import { buildMapById, mapSolids, MATCH_MAPS } from '../src/map/maps';
import { FILL, HALF_VIEW, SHUT, closeView, facingOpen, openFacing, screenShut, viewDepth } from '../src/map/spawn-facing';

/** Yaw 0 looks along -z; a quarter turn (+π/2) looks along -x. */
const NORTH = 0;

describe('spawn facing', () => {
  // A wall 3 m north of the spawn, 4 m wide, with open ground beyond its west end.
  const wall = box({ min: [-2, 0, -3.5], max: [2, 3, -3], material: 'concrete' });
  const world = createWorld([wall]);
  const spawn: SpawnPoint = { position: [0, 0, 0], yaw: NORTH };

  it('a spawn that looks into a wall in its face turns, by the least it can, to look into the open', () => {
    expect(viewDepth(world, spawn.position, NORTH)).toBeLessThan(SHUT);
    const yaw = openFacing(world, spawn);
    expect(viewDepth(world, spawn.position, yaw)).toBeGreaterThanOrEqual(SHUT);
    expect(Math.abs(yaw)).toBeGreaterThan(0);
    expect(Math.abs(yaw)).toBeLessThanOrEqual(Math.PI / 3 + 1e-9);
    // Every smaller turn, either way, still looks into the wall.
    const step = (5 * Math.PI) / 180;
    for (let turn = step; turn < Math.abs(yaw) - 1e-9; turn += step) {
      expect(viewDepth(world, spawn.position, turn, null, HALF_VIEW)).toBeLessThan(SHUT);
      expect(viewDepth(world, spawn.position, -turn, null, HALF_VIEW)).toBeLessThan(SHUT);
    }
  });

  it('a window is not a wall: a spawn looking out through glass keeps its facing', () => {
    const pane = box({ min: [-2, 0, -3.5], max: [2, 3, -3], material: 'glass' });
    expect(openFacing(createWorld([pane]), spawn)).toBe(NORTH);
  });

  it('a spawn that already looks into the open keeps its facing', () => {
    const open: SpawnPoint = { position: [0, 0, 0], yaw: Math.PI };
    expect(openFacing(world, open)).toBe(Math.PI);
  });

  it('a look out past the play area, over a low boundary, is not a look into the open', () => {
    // The play area ends just beyond the wall: the ground past its ends is outside the map.
    const area = [[-10, -3.6], [10, -3.6], [10, 10], [-10, 10]] as const;
    const turned = openFacing(world, spawn);
    expect(viewDepth(world, spawn.position, turned)).toBeGreaterThanOrEqual(SHUT);
    expect(viewDepth(world, spawn.position, turned, area)).toBeLessThan(SHUT);
    expect(openFacing(world, spawn, area)).not.toBe(turned);
  });

  const DEG = Math.PI / 180;

  it('a spawn with something under its nose beside the crosshair, a mannequin or a post, turns the least it can from it', () => {
    // A post 2 m off, 15° left of the crosshair (+yaw turns left), with open ground all round: the crosshair's line is clear.
    const post = box({ min: [-0.72, 0, -2.13], max: [-0.32, 1.8, -1.73], material: 'wood' });
    const at = createWorld([post]);
    expect(viewDepth(at, spawn.position, NORTH)).toBeGreaterThanOrEqual(SHUT);
    expect(closeView(at, spawn.position, NORTH).nose).toBe(true);
    const yaw = openFacing(at, spawn);
    expect(yaw).toBeLessThan(0);
    expect(yaw).toBeGreaterThanOrEqual(-30 * DEG - 1e-9);
    expect(screenShut(at, spawn.position, yaw)).toBe(false);
    for (let turn = 5 * DEG; turn < Math.abs(yaw) - 1e-9; turn += 5 * DEG) {
      expect(screenShut(at, spawn.position, turn)).toBe(true);
      expect(screenShut(at, spawn.position, -turn)).toBe(true);
    }
  });

  it('a spawn whose screen opens mostly on a wall beside the view turns from it', () => {
    // A wall 3.3 m ahead across the left of the screen, short of the crosshair's line.
    const side = createWorld([box({ min: [-6, 0, -3.5], max: [-0.5, 3, -3.3], material: 'concrete' })]);
    expect(viewDepth(side, spawn.position, NORTH)).toBeGreaterThanOrEqual(SHUT);
    expect(closeView(side, spawn.position, NORTH).fill).toBeGreaterThan(0.4);
    const yaw = openFacing(side, spawn);
    expect(yaw).toBeLessThan(0);
    expect(yaw).toBeGreaterThanOrEqual(-30 * DEG - 1e-9);
    expect(screenShut(side, spawn.position, yaw)).toBe(false);
  });

  it('a spawn looking down an alley keeps its facing: no turn opens the screen, and turning would face the wall', () => {
    const alley = createWorld([
      box({ min: [-1.4, 0, -20], max: [-1.2, 3, 2], material: 'brick' }),
      box({ min: [1.2, 0, -20], max: [1.4, 3, 2], material: 'brick' }),
    ]);
    expect(screenShut(alley, spawn.position, NORTH)).toBe(true);
    expect(openFacing(alley, spawn)).toBe(NORTH);
  });

  it('turns every set and keeps where each spawn stands', () => {
    const turned = facingOpen({ ffa: [spawn], teams: [[spawn], [spawn]] }, [wall], null);
    for (const s of [turned.ffa[0]!, turned.teams![0][0]!, turned.teams![1][0]!]) {
      expect(s.position).toEqual(spawn.position);
      expect(s.yaw).not.toBe(NORTH);
    }
  });
});

describe('spawn facing: the match maps', () => {
  for (const id of MATCH_MAPS) {
    it(`no ${id} spawn starts a life looking into a wall within ${SHUT} m or out of the map`, () => {
      const map = buildMapById(id);
      const world = createWorld(mapSolids(map));
      const sets: [string, readonly SpawnPoint[]][] = [['FFA', map.spawns.ffa], ...(map.spawns.teams ?? []).map((s, i): [string, readonly SpawnPoint[]] => [`team ${i + 1}`, s])];
      const shut = sets.flatMap(([name, set]) =>
        set.filter((s) => viewDepth(world, s.position, s.yaw, map.playArea) < SHUT).map((s) => `${name} ${s.position[0]},${s.position[2]}: ${viewDepth(world, s.position, s.yaw, map.playArea).toFixed(1)} m`),
      );
      expect(shut).toEqual([]);
    });

    it(`no ${id} spawn starts a life with something under its nose`, () => {
      const map = buildMapById(id);
      const world = createWorld(mapSolids(map));
      const all = [...map.spawns.ffa, ...(map.spawns.teams ?? []).flat()];
      expect(all.filter((s) => closeView(world, s.position, s.yaw).nose).map((s) => `${s.position[0]},${s.position[2]}`)).toEqual([]);
    });
  }

  it('no Switchyard team spawn opens on an end screen filling its view: they stand back from them', () => {
    const map = buildMapById('switchyard');
    const world = createWorld(mapSolids(map));
    const shut = (map.spawns.teams ?? []).flat().filter((s) => closeView(world, s.position, s.yaw).fill > FILL);
    expect(shut.map((s) => `${s.position[0]},${s.position[2]}`)).toEqual([]);
  });
});
