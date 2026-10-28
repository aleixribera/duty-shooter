import type { SpawnPoint, Vec3 } from '@duty-shooter/fps-core';
import { LIGHTING, type Finish } from '@duty-shooter/fps-client/surfaces';
import { Builder, groundTiles, type Opening, type Rect } from './builder';
import type { MapDefinition } from './definition';

/** Crash: a compact desert neighbourhood around a downed Sea Knight.
 * Game coordinates are metres, x east, z south. The west three-storey and
 * eastern blue building watch the crash site; the market and long alley
 * form the southern flank. */
export const BOUNDARY: readonly (readonly [number, number])[] = [[-42, -38], [42, -38], [42, 38], [-42, 38]];
const FINISHES: Readonly<Record<string, Finish>> = {
  sand: { family: 'sand', color: 0xc6ad82 },
  road: { family: 'asphalt', color: 0x746e61 },
  concrete: { family: 'concrete', color: 0xb5a58d, accent: 0x96866f },
  plaster: { family: 'plaster', color: 0xcdbb9d },
  blue: { family: 'plaster', color: 0x809b9a },
  market: { family: 'plaster', color: 0xbca589 },
  roof: { family: 'concrete', color: 0x9e9380 },
  wood: { family: 'floor', color: 0x806b50, accent: 0x5c4d3c },
  'wreck.hull': { family: 'paint', color: 0x454b43, roughness: 0.85, metalness: 0.35 },
  'wreck.dark': { family: 'paint', color: 0x252a27, roughness: 0.9 },
  'wreck.metal': { family: 'sheetMetal', color: 0x73746b },
  'wreck.glass': { family: 'glass', color: 0x202d30 },
};
const door = (from: number, width = 1.8): Opening => ({ from, to: from + width, bottom: 0, top: 2.2 });
const windowOpening = (from: number, width = 1.5): Opening => ({ from, to: from + width, bottom: 0.9, top: 2.25 });

/** A room for each storey, with an accessible outside stair and sightlines
 * through open windows. Each floor is 3 m high. */
function building(b: Builder, r: Rect, levels: number, finish: string, entrance: 'north' | 'south'): void {
  const t = 0.25;
  for (let level = 0; level < levels; level++) {
    const y = level * 3;
    const midpoint = (r.x0 + r.x1) / 2;
    const openings: Opening[] = level === 0 ? [door(midpoint - 0.9)] : [windowOpening(r.x0 + 1.2), windowOpening(r.x1 - 2.7)];
    const common = { thickness: t, bottom: y, height: 3, material: 'concrete' as const, look: finish };
    b.wall({ ...common, along: 'x', at: r.z0, from: r.x0, to: r.x1, openings: entrance === 'north' ? openings : [windowOpening(r.x0 + 1.2), windowOpening(r.x1 - 2.7)] });
    b.wall({ ...common, along: 'x', at: r.z1, from: r.x0, to: r.x1, openings: entrance === 'south' ? openings : [windowOpening(r.x0 + 1.2), windowOpening(r.x1 - 2.7)] });
    // The west side gives the stair landing access to each upper floor.
    b.wall({ ...common, along: 'z', at: r.x0, from: r.z0 + t / 2, to: r.z1 - t / 2, openings: level ? [door(level % 2 ? r.z0 + 0.8 : r.z1 - 2.6)] : [door(r.z1 - 3)] });
    b.wall({ ...common, along: 'z', at: r.x1, from: r.z0 + t / 2, to: r.z1 - t / 2, openings: [windowOpening(r.z0 + 1)] });
    if (level) b.add([r.x0, y - 0.18, r.z0], [r.x1, y, r.z1], 'concrete', { look: 'concrete' });
  }
  b.add([r.x0 - 0.12, levels * 3 - 0.18, r.z0 - 0.12], [r.x1 + 0.12, levels * 3, r.z1 + 0.12], 'concrete', { look: 'roof' });
  // Each flight runs north from the street to the upper doorway. Two
  // flights are separated laterally so the first stays clear underneath.
  for (let level = 1; level < levels; level++) {
    const x0 = r.x0 - 2.2 * level;
    const north = level % 2 === 1;
    b.paint('concrete', () => b.stairs({ along: 'z', from: north ? r.z1 - 0.2 : r.z0 + 1.7, to: north ? r.z0 + 1.7 : r.z1 - 0.2, across: [x0, x0 + 1.7], bottom: (level - 1) * 3, top: level * 3, material: 'concrete' }));
    const landingZ = north ? r.z0 + 0.45 : r.z1 - 2.8;
    b.add([x0, level * 3 - 0.18, landingZ], [r.x0, level * 3, landingZ + 2.35], 'concrete', { look: 'concrete' });
    if (level > 1) b.add([x0, (level - 1) * 3 - 0.18, r.z0 + 0.45], [r.x0, (level - 1) * 3, r.z0 + 2.4], 'concrete', { look: 'concrete' });
  }
}

/** Precise nodes follow the outside flights and lead through each landing door. */
function stairHints(r: Rect, levels: number): Vec3[] {
  const hints: Vec3[] = [];
  for (let level = 1; level < levels; level++) {
    const north = level % 2 === 1;
    const from = north ? r.z1 - 0.2 : r.z0 + 1.7;
    const to = north ? r.z0 + 1.7 : r.z1 - 0.2;
    const x = r.x0 - 2.2 * level + 0.85;
    for (let k = 0; k <= 5; k++) hints.push([x, (level - 1) * 3 + 3 * k / 5, from + (to - from) * k / 5]);
    const doorway = north ? r.z0 + 1.7 : r.z1 - 1.7;
    hints.push([x, level * 3, doorway], [r.x0 - 0.8, level * 3, doorway], [r.x0 + 0.8, level * 3, doorway], [r.x0 + 2.5, level * 3, doorway]);
  }
  return hints;
}

const point = (x: number, z: number, yaw: number): SpawnPoint => ({ position: [x, 0, z], yaw });
const west = [[-37,-31],[-33,-34],[-27,-33],[-35,-26],[-36,-19],[-38,-12]].map(([x,z]) => point(x!,z!,-Math.PI / 2));
const east = [[37,31],[32,34],[26,33],[35,26],[36,18],[38,12]].map(([x,z]) => point(x!,z!,Math.PI / 2));
const ffa = [...west, ...east, ...[[-10,-30],[8,-32],[28,-29],[-36,5],[35,-4],[-31,30],[4,32],[19,28]].map(([x,z]) => point(x!,z!,Math.atan2(x!,z!)))];

export function buildCrash(): MapDefinition {
  const b = new Builder();
  const layers: { rect: Rect; material: 'sand' | 'asphalt'; look: string }[] = [
    { rect: { x0: -42, x1: 42, z0: -7, z1: 8 }, material: 'asphalt', look: 'road' },
    { rect: { x0: -10, x1: 9, z0: -38, z1: 38 }, material: 'asphalt', look: 'road' },
    { rect: { x0: -100, x1: 100, z0: -100, z1: 100 }, material: 'sand', look: 'sand' },
  ];
  for (const {rect, material, look} of groundTiles(layers)) b.add([rect.x0,-0.5,rect.z0],[rect.x1,0,rect.z1],material,{look});
  // Three major landmarks; open lanes are left between their footprints.
  building(b, {x0:-26,x1:-15,z0:-23,z1:-11}, 3, 'plaster', 'south');
  building(b, {x0:15,x1:27,z0:-20,z1:-9}, 2, 'blue', 'south');
  building(b, {x0:13,x1:27,z0:13,z1:25}, 2, 'market', 'north');
  building(b, {x0:-24,x1:-13,z0:15,z1:26}, 2, 'plaster', 'north');
  // Lower outlying structures mark the approaches without closing the alleys.
  building(b, {x0:29,x1:39,z0:-33,z1:-24}, 1, 'plaster', 'south');
  building(b, {x0:-9,x1:2,z0:-35,z1:-26}, 1, 'market', 'south');
  building(b, {x0:-10,x1:1,z0:25,z1:35}, 1, 'plaster', 'north');
  b.model('helicopter', [0,0,0], 0, () => {
    for (const [min,max] of [
      [[-3.5,0,-1.42],[2.2,2.72,1.42]], [[2.2,0,-1.08],[4.25,2.2,1.08]],
      [[-5.5,0,-1.05],[-3.9,2.5,1.05]], [[-3.5,2.7,-2.8],[-2.5,3.15,2.8]],
      [[1.1,2.7,-2.7],[1.9,3.15,2.7]],
    ] as [Vec3,Vec3][]) b.add(min,max,'metal',{look:'wreck.hull'});
  });
  // Low cover interrupts the central crossings and the long market alley.
  for (const [x,z] of [[-9,3],[8,-4],[5,13],[-12,-7],[31,5],[-33,9],[6,22]] as const)
    b.add([x-1.3,0,z-0.4],[x+1.3,1,z+0.4],'concrete',{look:'concrete'});
  // Visible wall and full-height player clip on the playable edge.
  for (const [min,max] of [
    [[-42.4,0,-38.4],[42.4,3,-38]], [[-42.4,0,38],[42.4,3,38.4]],
    [[-42.4,0,-38],[-42,3,38]], [[42,0,-38],[42.4,3,38]],
  ] as [Vec3,Vec3][]) b.add(min,max,'concrete',{look:'plaster'});
  b.clip([-43,-1,-39],[43,100,-38]); b.clip([-43,-1,38],[43,100,39]);
  b.clip([-43,-1,-39],[-42,100,39]); b.clip([42,-1,-39],[43,100,39]);
  const spots = [
    {name:'crash site',position:[-10,1.6,7] as Vec3,yaw:-0.9,pitch:-0.06},
    {name:'overview',position:[-38,32,35] as Vec3,yaw:-0.8,pitch:-0.55},
    {name:'three story',position:[-20,7.6,-13] as Vec3,yaw:Math.PI,pitch:-0.12},
    {name:'blue building',position:[20,4.6,-11] as Vec3,yaw:Math.PI,pitch:-0.1},
    {name:'market',position:[20,1.6,11] as Vec3,yaw:Math.PI,pitch:0},
  ];
  return {
    id:'crash', name:'Crash', solids:b.solids, hiddenSolids:b.hidden, finishes:FINISHES, looks:b.looks, decorations:b.decorations,
    models:{url:'models/crash.glb',placements:b.models}, ramps:[], labels:[], populationSign:null,
    horizon:{ground:'sand',inner:{x0:-100,x1:100,z0:-100,z1:100},light:[-80,-80]}, lighting:LIGHTING, lamps:[], nuke:null, train:null,
    ambience:[{kind:'wind'}], spawns:{ffa,teams:[west,east]},
    zones:[{id:'A',name:'Three story',center:[-20,0,-9],radius:3,height:3},{id:'B',name:'Crash site',center:[0,0,5],radius:3,height:3},{id:'C',name:'Market',center:[21,0,10],radius:3,height:3}],
    sites:[{id:'A',name:'Blue building',min:[15,0,-20],max:[27,3,-9]},{id:'B',name:'Market',min:[13,0,13],max:[27,3,25]}],
    offlineSpawn:west[0]!, overview:spots[1]!, dummies:[], loadoutStation:null, rangeLanesWestOf:null,
    indoorZones:[{name:'three story',min:[-26,0,-23],max:[-15,9,-11]},{name:'blue building',min:[15,0,-20],max:[27,6,-9]},{name:'market',min:[13,0,13],max:[27,6,25]}],
    referenceSpots:spots, benchmarkPath:spots.map(({position,yaw,pitch})=>({position,yaw,pitch})), flyThrough:[], playArea:BOUNDARY,
    nav:{area:BOUNDARY,spacing:2,ceiling:10,hints:[
      ...stairHints({x0:-26,x1:-15,z0:-23,z1:-11},3),
      ...stairHints({x0:15,x1:27,z0:-20,z1:-9},2),
      ...stairHints({x0:13,x1:27,z0:13,z1:25},2),
      ...stairHints({x0:-24,x1:-13,z0:15,z1:26},2),
    ]}, measurements:[],
  };
}
