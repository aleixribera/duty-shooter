import type { SpawnPoint, Vec3 } from '@duty-shooter/fps-core';
import { LIGHTING, type Finish } from '@duty-shooter/fps-client/surfaces';
import { Builder, groundTiles, type Opening, type Rect } from './builder';
import type { MapDefinition } from './definition';

/** Crash: a compact desert neighbourhood around a downed Sea Knight.
 * Game coordinates are metres, x east, z south. The tower lies northwest,
 * blue building west, main building east, arcade south and shop southeast
 * of the wreck, following the original CoD4 overhead. */
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
  'wreck.hull': { family: 'paint', color: 0x777a70, roughness: 0.85, metalness: 0.35 },
  'wreck.dark': { family: 'paint', color: 0x30332f, roughness: 0.9 },
  'wreck.metal': { family: 'sheetMetal', color: 0x999a90 },
  'wreck.glass': { family: 'glass', color: 0x202d30 },
  'rubble.stone': { family: 'concrete', color: 0xa79a82 },
  'rubble.dark': { family: 'concrete', color: 0x726b5d },
  'car.body': { family: 'paint', color: 0x70483b, roughness: 0.9, metalness: 0.2 },
  'car.dark': { family: 'paint', color: 0x282927, roughness: 0.95 },
  'car.glass': { family: 'glass', color: 0x333c3c },
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
    b.add([x0 + 1.7, level * 3 - 0.18, landingZ], [r.x0, level * 3, landingZ + 2.35], 'concrete', { look: 'concrete' });
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

/** Landmark footprints, in metres, laid out against the original overhead. */
export const LANDMARKS = {
  tower: {x0:-14,x1:-4,z0:-33,z1:-22},
  blue: {x0:-27,x1:-17,z0:-3,z1:10},
  main: {x0:3,x1:16,z0:-20,z1:3},
  arcade: {x0:-11,x1:5,z0:13,z1:23},
  shop: {x0:18,x1:31,z0:8,z1:23},
} as const;

const point = (x: number, z: number, yaw: number): SpawnPoint => ({ position: [x, 0, z], yaw });
const west = [[-38,-34],[-32,-34],[-24,-34],[-38,-25],[-37,-19],[-38,-12]].map(([x,z]) => point(x!,z!,-Math.PI / 2));
const east = [[37,31],[32,34],[26,33],[35,26],[36,18],[38,12]].map(([x,z]) => point(x!,z!,Math.PI / 2));
const ffa = [...west, ...east, ...[[-20,-29],[8,-32],[37,-29],[-36,5],[35,-4],[-31,30],[4,32],[19,28]].map(([x,z]) => point(x!,z!,Math.atan2(x!,z!)))];

export function buildCrash(): MapDefinition {
  const b = new Builder();
  const layers: { rect: Rect; material: 'sand' | 'asphalt'; look: string }[] = [
    { rect: { x0: -42, x1: 42, z0: -7, z1: 8 }, material: 'asphalt', look: 'road' },
    { rect: { x0: -10, x1: 9, z0: -38, z1: 38 }, material: 'asphalt', look: 'road' },
    { rect: { x0: -100, x1: 100, z0: -100, z1: 100 }, material: 'sand', look: 'sand' },
  ];
  for (const {rect, material, look} of groundTiles(layers)) b.add([rect.x0,-0.5,rect.z0],[rect.x1,0,rect.z1],material,{look});
  // Original neighbourhood arrangement: the main building divides the
  // central crash site from the eastern back street; the arcade closes the
  // south side and leaves an alley behind it.
  building(b, LANDMARKS.tower, 3, 'plaster', 'south');
  building(b, LANDMARKS.blue, 2, 'blue', 'south');
  building(b, LANDMARKS.main, 2, 'plaster', 'south');
  building(b, LANDMARKS.arcade, 1, 'market', 'north');
  building(b, LANDMARKS.shop, 2, 'market', 'north');
  building(b, {x0:-38,x1:-29,z0:-21,z1:-10}, 1, 'plaster', 'south');
  building(b, {x0:-38,x1:-28,z0:16,z1:24}, 1, 'plaster', 'north');
  building(b, {x0:23,x1:34,z0:-33,z1:-24}, 1, 'plaster', 'south');
  // The crashed tandem-rotor aircraft runs roughly north to south, with
  // a broken rear section separated from the main fuselage.
  b.model('helicopter', [-6,0,-2], Math.PI / 2, () => {
    for (const [min,max] of [
      [[-3.5,0,-1.42],[2.2,2.72,1.42]], [[2.2,0,-1.08],[4.25,2.2,1.08]],
      [[-6.55,0,-1.05],[-4.55,2.5,1.05]], [[-6.2,2.5,-2.8],[-5.05,3.15,2.8]],
      [[1.1,2.7,-2.7],[1.9,3.15,2.7]],
    ] as [Vec3,Vec3][]) {
      const centre: Vec3 = [-6 + (min[2]+max[2])/2, (min[1]+max[1])/2, -2 - (min[0]+max[0])/2];
      b.turned(centre, [max[0]-min[0],max[1]-min[1],max[2]-min[2]], Math.PI / 2, 'metal', 'wreck.hull');
    }
  });
  // Scattered masonry around the impact and an abandoned sedan by blue.
  for (const [x,z,yaw] of [[-10,-5,0],[-10,2,0.5],[-3,-7,-0.4],[-3,6,0.9],[-13,8,0.2],[0,9,-0.7]] as const) {
    b.model('rubble',[x,0,z],yaw,() => b.turned([x,0.15,z],[2.4,0.3,1.8],yaw,'concrete','rubble.stone'));
  }
  b.model('burned-car',[-14,0,-9],0,() => {
    b.add([-16.4,0,-10],[-11.6,1.08,-8],'metal',{look:'car.body'});
    b.add([-15.3,1.08,-9.82],[-12.7,1.8,-8.18],'metal',{look:'car.body'});
  });
  // Low cover interrupts the central crossings and the long market alley.
  for (const [x,z] of [[-12,4],[-2,6],[7,8],[-12,-12],[35,2],[-34,8],[10,27]] as const)
    b.add([x-1.3,0,z-0.4],[x+1.3,1,z+0.4],'concrete',{look:'concrete'});
  // Visible wall and full-height player clip on the playable edge.
  for (const [min,max] of [
    [[-42.4,0,-38.4],[42.4,3,-38]], [[-42.4,0,38],[42.4,3,38.4]],
    [[-42.4,0,-38],[-42,3,38]], [[42,0,-38],[42.4,3,38]],
  ] as [Vec3,Vec3][]) b.add(min,max,'concrete',{look:'plaster'});
  b.clip([-43,-1,-39],[43,100,-38]); b.clip([-43,-1,38],[43,100,39]);
  b.clip([-43,-1,-39],[-42,100,39]); b.clip([42,-1,-39],[43,100,39]);
  const spots = [
    {name:'crash site',position:[-14,1.6,7] as Vec3,yaw:-0.8,pitch:-0.06},
    {name:'overview',position:[-38,32,35] as Vec3,yaw:-0.8,pitch:-0.55},
    {name:'three story',position:[-9,7.6,-23.5] as Vec3,yaw:Math.PI,pitch:-0.12},
    {name:'blue building',position:[-19,4.6,4] as Vec3,yaw:-Math.PI/2,pitch:-0.1},
    {name:'market',position:[24,1.6,6] as Vec3,yaw:Math.PI,pitch:0},
  ];
  return {
    id:'crash', name:'Crash', solids:b.solids, hiddenSolids:b.hidden, finishes:FINISHES, looks:b.looks, decorations:b.decorations,
    models:{url:'models/crash.glb',placements:b.models}, ramps:[], labels:[], populationSign:null,
    horizon:{ground:'sand',inner:{x0:-100,x1:100,z0:-100,z1:100},light:[-80,-80]}, lighting:LIGHTING, lamps:[], nuke:null, train:null,
    ambience:[{kind:'wind'}], spawns:{ffa,teams:[west,east]},
    zones:[{id:'A',name:'Tower',center:[-9,0,-20],radius:3,height:3},{id:'B',name:'Crash site',center:[-6,0,5],radius:3,height:3},{id:'C',name:'Shop',center:[24,0,5],radius:3,height:3}],
    sites:[{id:'A',name:'Main building',min:[3,0,-20],max:[16,3,3]},{id:'B',name:'Shop',min:[18,0,8],max:[31,3,23]}],
    offlineSpawn:west[0]!, overview:spots[1]!, dummies:[], loadoutStation:null, rangeLanesWestOf:null,
    indoorZones:[{name:'tower',min:[-14,0,-33],max:[-4,9,-22]},{name:'blue building',min:[-27,0,-3],max:[-17,6,10]},{name:'main building',min:[3,0,-20],max:[16,6,3]},{name:'shop',min:[18,0,8],max:[31,6,23]}],
    referenceSpots:spots, benchmarkPath:spots.map(({position,yaw,pitch})=>({position,yaw,pitch})), flyThrough:[], playArea:BOUNDARY,
    nav:{area:BOUNDARY,spacing:2,ceiling:10,hints:[
      ...stairHints(LANDMARKS.tower,3),
      ...stairHints(LANDMARKS.blue,2),
      ...stairHints(LANDMARKS.main,2),
      ...stairHints(LANDMARKS.shop,2),
    ]}, measurements:[],
  };
}
