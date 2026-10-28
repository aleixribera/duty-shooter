import { describe, expect, it } from 'vitest';
import { STATS, createWorld, segmentSolid, type Vec3 } from '@duty-shooter/fps-core';
import { layoutSurfaces } from '@duty-shooter/fps-client/surfaces';
import { surfaceSpec } from '../src/bake/spec';
import { insidePolygon, mapSolids } from '../src/map/definition';
import { BOUNDARY, buildCrash } from '../src/map/crash';
import { botMap, reachable } from './support/bots';

const map = buildCrash();
const solids = mapSolids(map);
const world = createWorld(solids);

describe('Crash', () => {
  it('keeps all spawns in bounds, on the ground and clear of collision', () => {
    for (const spawn of [...map.spawns.ffa, ...map.spawns.teams!.flat()]) {
      const [x,y,z] = spawn.position;
      expect(insidePolygon(BOUNDARY,x,z), String(spawn.position)).toBe(true);
      const h = STATS.stance.hullHalfWidth.value;
      const overlap = solids.filter(s => s.max[0] > x-h && s.min[0] < x+h && s.max[2] > z-h && s.min[2] < z+h && s.max[1] > y+0.01 && s.min[1] < y+STATS.stance.standHullHeight.value);
      expect(overlap, String(spawn.position)).toEqual([]);
      const a: Vec3 = [x,y+0.1,z], c: Vec3 = [x,y-1,z];
      expect(world.movement.firstHit(a,c,i => segmentSolid(a,c,solids[i]!)), String(spawn.position)).toBeTruthy();
    }
  });
  it('has valid surface finishes and the Blender wreck placement', () => {
    expect(map.looks).toHaveLength(map.solids.length);
    for (const face of layoutSurfaces(map.solids,surfaceSpec(map)).faces)
      expect(face.finish in map.finishes || face.finish.startsWith('default:'),face.finish).toBe(true);
    expect(map.models?.placements.map(p => p.asset)).toContain('helicopter');
  });
  it('connects the navigation graph in both directions', () => {
    const nav = botMap(map,BOUNDARY).nav;
    expect(nav.nodes.length).toBeGreaterThan(100);
    for (const [x0,x1,z0,z1,y] of [[-26,-15,-23,-11,6],[15,27,-20,-9,3],[13,27,13,25,3]]) {
      expect(nav.nodes.some(n => n.position[0] > x0! && n.position[0] < x1! && n.position[2] > z0! && n.position[2] < z1! && Math.abs(n.position[1] - y!) < 0.1), 'upper floor ' + [x0,z0,y]).toBe(true);
    }
    expect(reachable(nav,false).size).toBe(nav.nodes.length);
    expect(reachable(nav,true).size).toBe(nav.nodes.length);
  });
});
