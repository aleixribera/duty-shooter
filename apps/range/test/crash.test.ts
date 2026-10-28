import { describe, expect, it } from 'vitest';
import { STATS, TICK_SECONDS, createWorld, segmentSolid, type Vec3 } from '@duty-shooter/fps-core';
import { createHeadlessMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { decorationErrors, layoutSurfaces } from '@duty-shooter/fps-client/surfaces';
import { surfaceSpec } from '../src/bake/spec';
import { insidePolygon, mapSolids } from '../src/map/definition';
import { BOUNDARY, LANDMARKS, buildCrash } from '../src/map/crash';
import { botMap, reachable } from './support/bots';

const map = buildCrash();
const solids = mapSolids(map);
const world = createWorld(solids);

describe('Crash', () => {
  it('places the landmarks around the wreck as in the original overhead', () => {
    const wreck = map.models!.placements.find(p => p.asset === 'helicopter')!;
    expect(LANDMARKS.blue.x1).toBeLessThan(wreck.position[0]);
    expect(LANDMARKS.main.x0).toBeGreaterThan(wreck.position[0]);
    expect(LANDMARKS.tower.z1).toBeLessThan(wreck.position[2]);
    expect(LANDMARKS.arcade.z0).toBeGreaterThan(wreck.position[2]);
    expect(LANDMARKS.shop.x0).toBeGreaterThan(LANDMARKS.main.x0);
  });
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
  it('lets a player climb the tower to the roof', () => {
    const legs: Vec3[] = [[-15.35,0,-21],[-15.35,3,-31.3],[-17.55,3,-31.3],[-17.55,6,-22.55],[-15.8,6,-23.7],[-13,6,-23.7],[-15.8,6,-21.2],[-19.75,6,-21.2],[-19.75,9,-31.3],[-13,9,-31.3]];
    const m = createHeadlessMatch({solids,players:[{id:'p',team:1,position:legs[0]!,yaw:0}]});
    let out = m.step({p:usercmd({yaw:0})}).players[0]!;
    for (const target of legs.slice(1)) {
      let reached = false;
      for (let i=0;i<12/TICK_SECONDS;i++) {
        const p=out.position, dx=target[0]-p[0], dz=target[2]-p[2], distance=Math.hypot(dx,dz);
        if (distance<0.4 && Math.abs(target[1]-p[1])<0.35 && out.movement !== 'airborne' && out.movement !== 'mantle') { reached=true; break; }
        out=m.step({p:usercmd({yaw:Math.atan2(-dx,-dz),forward:distance<0.7 ? 0.4 : 1})}).players[0]!;
      }
      expect(reached, 'toward '+target+' at '+out.position).toBe(true);
    }
  });
  it('has valid surface finishes and the Blender wreck placement', () => {
    expect(map.looks).toHaveLength(map.solids.length);
    expect(map.decorations.length).toBeGreaterThan(50);
    expect(decorationErrors(map.solids,map.decorations)).toEqual([]);
    for (const face of layoutSurfaces(map.solids,surfaceSpec(map)).faces)
      expect(face.finish in map.finishes || face.finish.startsWith('default:'),face.finish).toBe(true);
    expect(map.models?.placements.map(p => p.asset)).toContain('helicopter');
  });
  it('connects the navigation graph in both directions', () => {
    const nav = botMap(map,BOUNDARY).nav;
    expect(nav.nodes.length).toBeGreaterThan(100);
    for (const [x0,x1,z0,z1,y] of [[-14,-4,-33,-22,6],[-27,-17,-3,10,3],[3,16,-20,3,3],[18,31,8,23,3],[-14,-4,-33,-22,9],[-27,-17,-3,10,6],[18,31,8,23,6]]) {
      expect(nav.nodes.some(n => n.position[0] > x0! && n.position[0] < x1! && n.position[2] > z0! && n.position[2] < z1! && Math.abs(n.position[1] - y!) < 0.1), 'upper floor ' + [x0,z0,y]).toBe(true);
    }
    expect(reachable(nav,false).size).toBe(nav.nodes.length);
    expect(reachable(nav,true).size).toBe(nav.nodes.length);
  });
});
