import { describe, expect, it } from 'vitest';
import { STATS, TICK_SECONDS, createWorld, raycastWorld, segmentSolid, type Vec3 } from '@duty-shooter/fps-core';
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
    const middle = map.zones.find(zone => zone.id === 'B')!;
    expect(Math.hypot(middle.center[0]-wreck.position[0],middle.center[2]-wreck.position[2])).toBeLessThan(1);
  });
  it('lets a player cross through the wreck cabin while its side panels provide cover', () => {
    expect(raycastWorld(world,[-9,1.6,-1.5],[-3,1.6,-1.5])).toBeNull();
    expect(raycastWorld(world,[-9,1.6,-3],[-3,1.6,-3])).not.toBeNull();
    const legs: Vec3[] = [[-9,0,-1.5],[-6,0.25,-1.5],[-3,0,-1.5]];
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
  it('keeps all spawns in bounds, on the ground and clear of collision', () => {
    // The two team starting areas straddle the map on the original diagonal.
    for (const spawn of map.spawns.teams![0]) expect(spawn.position[0] < 0 && spawn.position[2] > 0).toBe(true);
    for (const spawn of map.spawns.teams![1]) expect(spawn.position[0] > 0 && spawn.position[2] < 0).toBe(true);
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
    const legs: Vec3[] = [[-9,0,-20.5],[-9,0,-23.0]];
    for (const y of [0,3,6]) {
      legs.push([-12.9,y,-23.0],[-12.9,y+1.5,-28.8],[-11.1,y+1.5,-28.8],[-11.1,y+3,-23.0],[-9.5,y+3,-23.0]);
    }
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
  it('keeps the tower roof fence solid to movement but open to shots', () => {
    const inside: Vec3 = [-9,10.6,-23], outside: Vec3 = [-9,10.6,-21];
    expect(raycastWorld(world,inside,outside)).toBeNull();
    expect(world.movement.firstHit(inside,outside,i => segmentSolid(inside,outside,solids[i]!))).toBeTruthy();
  });
  it('lets a player enter the tower from its outside stair and ground-floor door', () => {
    for (const legs of [
      [[-1.55,0,-20.5],[-1.55,3,-29.6],[-3,3,-29.6],[-5,3,-29.6]],
      [[-3,0,-24],[-3,0,-26.8],[-5,0,-26.8]],
    ] as Vec3[][]) {
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
    }
  });
  it('opens the blue building on three sides and lets a player climb its interior stairs', () => {
    for (const [outside,inside] of [
      [[-22,1.6,-4],[-22,1.6,-2]],
      [[-22,1.6,11],[-22,1.6,9]],
      [[-16,1.6,4],[-18,1.6,4]],
    ] as [Vec3,Vec3][]) expect(raycastWorld(world,outside,inside), String(outside)).toBeNull();
    const legs: Vec3[] = [[-22,0,11],[-22,0,8.7],[-25.6,0,8.7]];
    for (const y of [0,3]) legs.push([-25.6,y,8.7],[-25.6,y+1.5,1.2],[-23.8,y+1.5,1.2],[-23.8,y+3,8.7],[-22,y+3,8.7]);
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
  it('opens the blue building upper room to the sky through its broken roof', () => {
    expect(raycastWorld(world,[-20,4.6,4],[-20,8,4])).toBeNull();
    expect(raycastWorld(world,[-20,4.6,-1],[-20,8,-1])).not.toBeNull();
  });
  it('connects the shop entrances, interior stairs and rooftop', () => {
    for (const [outside,inside] of [
      [[24,1.6,7],[24,1.6,9]],
      [[21.3,1.6,24],[21.3,1.6,22]],
      [[32,1.6,21.8],[30,1.6,21.8]],
    ] as [Vec3,Vec3][]) expect(raycastWorld(world,outside,inside), String(outside)).toBeNull();
    const legs: Vec3[] = [[24,0,7],[24,0,9],[25.5,0,21.3]];
    for (const y of [0,3]) legs.push([27.7,y,21.3],[27.7,y+1.5,10.5],[29.5,y+1.5,10.5],
      [29.5,y+3,21.3],[25.8,y+3,21.3]);
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
  it('allows players through the three lane openings while the walls screen the gaps between them', () => {
    const routes: [Vec3,Vec3][] = [[[29,0,-12],[35,0,-12]],[[9,0,23],[9,0,28]],[[-34,0,0],[-30.2,0,0]]];
    for (const [start,target] of routes) {
      const m = createHeadlessMatch({solids,players:[{id:'p',team:1,position:start,yaw:0}]});
      let out = m.step({p:usercmd({yaw:0})}).players[0]!;
      for (let i=0;i<360;i++) {
        const dx=target[0]-out.position[0], dz=target[2]-out.position[2];
        if (Math.hypot(dx,dz)<0.45) break;
        out=m.step({p:usercmd({yaw:Math.atan2(-dx,-dz),forward:1})}).players[0]!;
      }
      expect(Math.hypot(target[0]-out.position[0],target[2]-out.position[2]), String(out.position)).toBeLessThan(0.45);
    }
    expect(raycastWorld(world,[30,1.6,-5],[34,1.6,-5])).not.toBeNull();
    expect(raycastWorld(world,[15,1.6,24],[15,1.6,27])).not.toBeNull();
  });
  it('connects the garage spawn through its vehicle bay toward the blue building', () => {
    for (const legs of [
      [[-33,0.6,26],[-33,0.6,22],[-33,0.45,14],[-22,0,13],[-22,0,11]],
      [[-23.5,0,21],[-26,0.3,21],[-29,0.6,21]],
    ] as Vec3[][]) {
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
    }
  });
  it('opens the covered arcade to a walking player and the main upper windows to the plaza', () => {
    const m = createHeadlessMatch({solids,players:[{id:'p',team:1,position:[-8.5,0,8],yaw:Math.PI}]});
    let out = m.step({p:usercmd({yaw:Math.PI})}).players[0]!;
    for (let i=0;i<360 && out.position[2]<14;i++) out=m.step({p:usercmd({yaw:Math.PI,forward:1})}).players[0]!;
    expect(out.position[2],String(out.position)).toBeGreaterThan(14);
    expect(raycastWorld(world,[-0.5,4.6,-14.25],[4,4.6,-14.25])).toBeNull();
  });
  it('lets a player climb to the main building roof from the plaza', () => {
    const legs: Vec3[] = [[1.65,0,2.8],[1.65,3,-18.3],[-0.55,3,-18.3],[-0.55,6,2.8],[1,6,1.3],[4,6,1.3]];
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
  it('places rooftop equipment on a supporting roof, clear of stair openings', () => {
    const equipment = map.models!.placements.filter(p => p.asset === 'water-tank' || p.asset === 'satellite-dish');
    const modelSolids = new Set(map.models!.placements.flatMap(p => p.solids));
    const buildingWorld = createWorld(map.solids.filter((_,i) => !modelSolids.has(i)));
    expect(equipment).toHaveLength(5);
    for (const {asset,position:[x,y,z]} of equipment) {
      const radius = asset === 'water-tank' ? 0.6 : 0.2;
      for (const [dx,dz] of [[-radius,-radius],[-radius,radius],[radius,-radius],[radius,radius]]) {
        expect(raycastWorld(buildingWorld,[x+dx!,y+0.01,z+dz!],[x+dx!,y-0.3,z+dz!]), `${asset} at ${x},${y},${z}`).not.toBeNull();
      }
    }
  });
  it('connects the navigation graph in both directions', () => {
    const nav = botMap(map,BOUNDARY).nav;
    expect(nav.nodes.length).toBeGreaterThan(100);
    expect(nav.nodes.some(n => n.position[0] > -6.8 && n.position[0] < -5.2 && n.position[2] > -1.9 && n.position[2] < -1.1 && Math.abs(n.position[1]-0.25) < 0.1), 'wreck cabin').toBe(true);
    for (const [x0,x1,z0,z1,y] of [[-14,-4,-33,-22,6],[-27,-17,-3,10,3],[3,16,-20,3,3],[18,31,8,23,3],[-14,-4,-33,-22,9],[-27,-17,-3,10,6],[3,16,-20,3,6],[18,31,8,23,6]]) {
      expect(nav.nodes.some(n => n.position[0] > x0! && n.position[0] < x1! && n.position[2] > z0! && n.position[2] < z1! && Math.abs(n.position[1] - y!) < 0.1), 'upper floor ' + [x0,z0,y]).toBe(true);
    }
    expect(reachable(nav,false).size).toBe(nav.nodes.length);
    expect(reachable(nav,true).size).toBe(nav.nodes.length);
  });
});
