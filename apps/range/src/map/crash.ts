import type { SpawnPoint, Vec3 } from '@duty-shooter/fps-core';
import { normalize, type Finish, type Lighting } from '@duty-shooter/fps-client/surfaces';
import { Builder, groundTiles, type Opening, type Rect } from './builder';
import type { MapDefinition } from './definition';

/** Crash: a compact desert neighbourhood around a downed Sea Knight.
 * Game coordinates are metres, x east, z south. The tower lies northwest,
 * blue building west, main building east, arcade south and shop southeast
 * of the wreck, following the original CoD4 overhead. */
export const BOUNDARY: readonly (readonly [number, number])[] = [[-42, -38], [42, -38], [42, 38], [-42, 38]];
/** Hazy, desaturated afternoon light for the original urban setting. */
const CRASH_LIGHT: Lighting = {
  sunDirection: normalize([-0.45,0.68,0.57]), sunColor:[1,0.95,0.88], sunIntensity:1.9, sunSpread:0.06,
  skyZenith:[0.42,0.51,0.54], skyHorizon:[0.77,0.79,0.71], skyIntensity:0.9, ground:[0.32,0.30,0.25],
};
const FINISHES: Readonly<Record<string, Finish>> = {
  sand: { family: 'sand', color: 0xc6ad82 },
  road: { family: 'asphalt', color: 0x746e61 },
  concrete: { family: 'concrete', color: 0xb5a58d, accent: 0x96866f },
  plaster: { family: 'plaster', color: 0xcdbb9d },
  blue: { family: 'plaster', color: 0x809b9a },
  market: { family: 'plaster', color: 0xbca589 },
  awning: { family: 'paint', color: 0x895f4f },
  roof: { family: 'concrete', color: 0x9e9380 },
  wood: { family: 'floor', color: 0x806b50, accent: 0x5c4d3c },
  trim: { family: 'concrete', color: 0xe1d2b6 },
  shutter: { family: 'siding', color: 0x655b4c },
  'wreck.hull': { family: 'paint', color: 0x777a70, roughness: 0.85, metalness: 0.35 },
  'wreck.dark': { family: 'paint', color: 0x30332f, roughness: 0.9 },
  'wreck.metal': { family: 'sheetMetal', color: 0x999a90 },
  'wreck.glass': { family: 'glass', color: 0x202d30 },
  'rubble.stone': { family: 'concrete', color: 0xa79a82 },
  'rubble.dark': { family: 'concrete', color: 0x726b5d },
  'car.body': { family: 'paint', color: 0x70483b, roughness: 0.9, metalness: 0.2 },
  'car.dark': { family: 'paint', color: 0x282927, roughness: 0.95 },
  'car.glass': { family: 'glass', color: 0x333c3c },
  'pole.wood': { family: 'floor', color: 0x6c5b46 },
  'pole.metal': { family: 'paint', color: 0x454741, roughness:0.8, metalness:0.3 },
  'pole.insulator': { family: 'plastic', color: 0x82908a, roughness:0.3 },
  'pole.wire': { family: 'paint', color: 0x343633 },
  'roof.tank': { family: 'sheetMetal', color: 0x98958a, roughness:0.85, metalness:0.2 },
  'roof.metal': { family: 'sheetMetal', color: 0x605c50, roughness:0.8, metalness:0.35 },
  'fence.metal': { family: 'sheetMetal', color: 0x777970, roughness:0.85, metalness:0.45 },
};
const door = (from: number, width = 1.8): Opening => ({ from, to: from + width, bottom: 0, top: 2.2 });
const windowOpening = (from: number, width = 1.5): Opening => ({ from, to: from + width, bottom: 0.9, top: 2.25 });

/** A room for each storey, with an accessible outside stair and sightlines
 * through open windows. Each floor is 3 m high. */
function building(b: Builder, r: Rect, levels: number, finish: string, entrance: 'north' | 'south', roofAccess = false, style: 'plain' | 'arcade' | 'main' = 'plain'): void {
  const t = 0.25;
  for (let level = 0; level < levels; level++) {
    const y = level * 3;
    const midpoint = (r.x0 + r.x1) / 2;
    const openings: Opening[] = level === 0 ? [door(midpoint - 0.9)] : [windowOpening(r.x0 + 1.2), windowOpening(r.x1 - 2.7)];
    const arcadeOpenings: Opening[] = [door(r.x0 + 1.0, 3), door(r.x0 + 5.0, 3), door(r.x0 + 9.0, 3), door(r.x0 + 13.0, 2)];
    const westDoor = level ? door(level % 2 ? r.z0 + 0.8 : r.z1 - 2.6) : door(r.z1 - 3);
    const sideWindows = style === 'main' ? [windowOpening(r.z0 + 5), windowOpening(r.z0 + 10), windowOpening(r.z0 + 15)] : [];
    const westOpenings = [...sideWindows, westDoor].sort((a,b) => a.from-b.from);
    const common = { thickness: t, bottom: y, height: 3, material: 'concrete' as const, look: finish };
    b.wall({ ...common, along: 'x', at: r.z0, from: r.x0, to: r.x1, openings: style === 'arcade' && level === 0 ? arcadeOpenings : entrance === 'north' ? openings : [windowOpening(r.x0 + 1.2), windowOpening(r.x1 - 2.7)], trim: [{face:-1,frames:'trim',shutters:'shutter'}] });
    b.wall({ ...common, along: 'x', at: r.z1, from: r.x0, to: r.x1, openings: entrance === 'south' ? openings : [windowOpening(r.x0 + 1.2), windowOpening(r.x1 - 2.7)], trim: [{face:1,frames:'trim',shutters:'shutter'}] });
    // The west side gives the stair landing access to each upper floor.
    b.wall({ ...common, along: 'z', at: r.x0, from: r.z0 + t / 2, to: r.z1 - t / 2, openings: westOpenings, trim: [{face:-1,frames:'trim'}] });
    b.wall({ ...common, along: 'z', at: r.x1, from: r.z0 + t / 2, to: r.z1 - t / 2, openings: style === 'main' ? sideWindows : [windowOpening(r.z0 + 1)], trim: [{face:1,frames:'trim',shutters:'shutter'}] });
    if (level) b.add([r.x0, y - 0.18, r.z0], [r.x1, y, r.z1], 'concrete', { look: 'concrete' });
  }
  b.add([r.x0 - 0.12, levels * 3 - 0.18, r.z0 - 0.12], [r.x1 + 0.12, levels * 3, r.z1 + 0.12], 'concrete', { look: 'roof' });
  // Roof parapets have a gap at the final stair landing.
  const roofY = levels * 3;
  const p = { thickness:t, bottom:roofY, height:0.85, material:'concrete' as const, look:finish };
  b.wall({...p,along:'x',at:r.z0,from:r.x0,to:r.x1});
  b.wall({...p,along:'x',at:r.z1,from:r.x0,to:r.x1});
  b.wall({...p,along:'z',at:r.x1,from:r.z0+t/2,to:r.z1-t/2});
  const gap = levels % 2 ? r.z0 + 0.8 : r.z1 - 2.6;
  b.wall({...p,along:'z',at:r.x0,from:r.z0+t/2,to:r.z1-t/2,openings:roofAccess ? [{from:gap,to:gap+1.8,bottom:0,top:0.85}] : []});
  // Flights alternate direction; landings connect the adjacent flights.
  for (let level = 1; level < levels + (roofAccess ? 1 : 0); level++) {
    const x0 = r.x0 - 2.2 * level;
    const north = level % 2 === 1;
    b.paint('concrete', () => b.stairs({ along: 'z', from: north ? r.z1 - 0.2 : r.z0 + 1.7, to: north ? r.z0 + 1.7 : r.z1 - 0.2, across: [x0, x0 + 1.7], bottom: (level - 1) * 3, top: level * 3, material: 'concrete' }));
    const landingZ = north ? r.z0 + 0.45 : r.z1 - 2.8;
    b.add([x0 + 1.7, level * 3 - 0.18, landingZ], [r.x0, level * 3, landingZ + 2.35], 'concrete', { look: 'concrete' });
    if (level > 1) {
      const footY = (level - 1) * 3;
      if (north) {
        // Turn around the preceding stair's end, not above its rising steps.
        b.add([x0, footY - 0.18, r.z1], [r.x0, footY, r.z1 + 1.8], 'concrete', { look: 'concrete' });
        b.add([r.x0 - 2.7, footY - 0.18, r.z1 - 2.0], [r.x0, footY, r.z1 + 1.8], 'concrete', { look: 'concrete' });
      } else {
        b.add([x0, footY - 0.18, r.z0 + 0.45], [r.x0, footY, r.z0 + 2.8], 'concrete', { look: 'concrete' });
      }
    }
  }
}

/** Thin treads leave headroom for the next flight stacked above. */
function towerFlight(b: Builder, x0: number, x1: number, z0: number, z1: number, bottom: number): void {
  const count = 8;
  for (let i=0; i<count; i++) {
    const a = z0 + (z1-z0)*i/count, c = z0 + (z1-z0)*(i+1)/count;
    const top = bottom + 1.5*(i+1)/count;
    b.add([x0,top-0.35,Math.min(a,c)],[x1,top,Math.max(a,c)],'concrete',{look:'concrete'});
  }
}

/** The three-storey tower has a compact interior switchback stairwell.
 * Floor slabs leave the stairwell open, including the opening onto the roof. */
function buildTower(b: Builder): void {
  const r = LANDMARKS.tower, t = 0.25;
  for (let level = 0; level < 3; level++) {
    const common = {thickness:t,bottom:level*3,height:3,material:'concrete' as const,look:'plaster'};
    const south = level === 0 ? [door(-10.1,2.2)] : [windowOpening(-12.5),windowOpening(-7.2)];
    b.wall({...common,along:'x',at:r.z1,from:r.x0,to:r.x1,openings:south,trim:[{face:1,frames:'trim',shutters:'shutter'}]});
    b.wall({...common,along:'x',at:r.z0,from:r.x0,to:r.x1,openings:[windowOpening(-12.5),windowOpening(-7.2)],trim:[{face:-1,frames:'trim',shutters:'shutter'}]});
    b.wall({...common,along:'z',at:r.x0,from:r.z0+t/2,to:r.z1-t/2,openings:[windowOpening(-31.0),windowOpening(-26.5)],trim:[{face:-1,frames:'trim',shutters:'shutter'}]});
    const east = level === 0 ? [door(-27.8,2)] : [windowOpening(-30.5),windowOpening(-25.5)];
    b.wall({...common,along:'z',at:r.x1,from:r.z0+t/2,to:r.z1-t/2,openings:east,trim:[{face:1,frames:'trim',shutters:'shutter'}]});
  }
  // The stairwell occupies the west side; its top landing opens east onto each floor.
  for (const y of [3,6,9]) {
    b.add([r.x0,y-0.18,r.z0],[r.x1,y,-30.0],'concrete',{look:'concrete'});
    b.add([-10.2,y-0.18,-30.0],[r.x1,y,r.z1],'concrete',{look:y===9?'roof':'concrete'});
    b.add([r.x0,y-0.18,-30.0],[-13.8,y,r.z1],'concrete',{look:'concrete'});
    b.add([r.x0,y-0.18,-23.3],[-10.2,y,r.z1],'concrete',{look:y===9?'roof':'concrete'});
  }
  for (const y of [0,3,6]) {
    towerFlight(b,-13.6,-12.2,-23.5,-28.2,y);
    towerFlight(b,-11.8,-10.4,-28.2,-23.5,y+1.5);
    b.add([-13.6,y+1.32,-29.9],[-10.4,y+1.5,-28.2],'concrete',{look:'concrete'});
  }
  const parapet = {thickness:t,bottom:9,height:0.85,material:'concrete' as const,look:'plaster'};
  b.wall({...parapet,along:'x',at:r.z0,from:r.x0,to:r.x1});
  b.wall({...parapet,along:'x',at:r.z1,from:r.x0,to:r.x1});
  b.wall({...parapet,along:'z',at:r.x0,from:r.z0+t/2,to:r.z1-t/2});
  b.wall({...parapet,along:'z',at:r.x1,from:r.z0+t/2,to:r.z1-t/2});
}

/** The blue building has entrances on three sides and stairs inside, rather
 * than the generic exterior flights used for the less prominent buildings. */
function buildBlue(b: Builder): void {
  const r = LANDMARKS.blue, t = 0.25;
  for (let level = 0; level < 2; level++) {
    const common = {thickness:t,bottom:level*3,height:3,material:'concrete' as const,look:'blue'};
    const ends = level === 0 ? [door(-22.9,1.8)] : [windowOpening(-25.5),windowOpening(-20.2)];
    const east = level === 0 ? [door(3,2)] : [windowOpening(-1.5,2),windowOpening(4,2)];
    b.wall({...common,along:'x',at:r.z0,from:r.x0,to:r.x1,openings:ends,trim:[{face:-1,frames:'trim',shutters:'shutter'}]});
    b.wall({...common,along:'x',at:r.z1,from:r.x0,to:r.x1,openings:ends,trim:[{face:1,frames:'trim',shutters:'shutter'}]});
    b.wall({...common,along:'z',at:r.x0,from:r.z0+t/2,to:r.z1-t/2,openings:[windowOpening(-1.5),windowOpening(5)],trim:[{face:-1,frames:'trim',shutters:'shutter'}]});
    b.wall({...common,along:'z',at:r.x1,from:r.z0+t/2,to:r.z1-t/2,openings:east,trim:[{face:1,frames:'trim',shutters:'shutter'}]});
  }
  // Two floors surround the stairwell; each has a landing at its south end.
  for (const y of [3,6]) {
    const look = y === 6 ? 'roof' : 'concrete';
    b.add([r.x0,y-0.18,r.z0],[r.x1,y,0.5],'concrete',{look});
    b.add([-22.9,y-0.18,0.5],[r.x1,y,r.z1],'concrete',{look});
    b.add([r.x0,y-0.18,0.5],[-26.5,y,r.z1],'concrete',{look});
    b.add([r.x0,y-0.18,8.2],[-22.9,y,r.z1],'concrete',{look});
  }
  for (const y of [0,3]) {
    towerFlight(b,-26.3,-24.9,8,2,y);
    towerFlight(b,-24.5,-23.1,2,8,y+1.5);
    b.add([-26.3,y+1.32,0.5],[-23.1,y+1.5,2],'concrete',{look:'concrete'});
  }
  const p = {thickness:t,bottom:6,height:0.85,material:'concrete' as const,look:'blue'};
  b.wall({...p,along:'x',at:r.z0,from:r.x0,to:r.x1});
  b.wall({...p,along:'x',at:r.z1,from:r.x0,to:r.x1});
  b.wall({...p,along:'z',at:r.x0,from:r.z0+t/2,to:r.z1-t/2});
  b.wall({...p,along:'z',at:r.x1,from:r.z0+t/2,to:r.z1-t/2});
}

function blueHints(): Vec3[] {
  const hints: Vec3[] = [[-22,0,11],[-22,0,9],[-22,0,8.5],[-16,0,4],[-18,0,4],[-22,0,-4],[-22,0,-2]];
  for (const y of [0,3]) hints.push([-25.6,y,8.5],[-25.6,y+0.75,5],[-25.6,y+1.5,1.2],
    [-23.8,y+1.5,1.2],[-23.8,y+2.25,5],[-23.8,y+3,8.5],[-22,y+3,8.5]);
  return hints;
}

/** A shop at ground level with an upstairs room and a back-street entrance. */
function buildShop(b: Builder): void {
  const r = LANDMARKS.shop, t = 0.25;
  for (let level = 0; level < 2; level++) {
    const common = {thickness:t,bottom:level*3,height:3,material:'concrete' as const,look:'market'};
    const north = level === 0 ? [door(22,4)] : [windowOpening(19.4,2),windowOpening(25.5,2)];
    const south = level === 0 ? [door(20.3,2)] : [windowOpening(20),windowOpening(25.5)];
    const east = level === 0 ? [door(20.8,2)] : [windowOpening(10),windowOpening(15),windowOpening(20)];
    const west = [windowOpening(10),windowOpening(15),windowOpening(20)];
    b.wall({...common,along:'x',at:r.z0,from:r.x0,to:r.x1,openings:north,trim:[{face:-1,frames:'trim',shutters:'shutter'}]});
    b.wall({...common,along:'x',at:r.z1,from:r.x0,to:r.x1,openings:south,trim:[{face:1,frames:'trim',shutters:'shutter'}]});
    b.wall({...common,along:'z',at:r.x0,from:r.z0+t/2,to:r.z1-t/2,openings:west,trim:[{face:-1,frames:'trim',shutters:'shutter'}]});
    b.wall({...common,along:'z',at:r.x1,from:r.z0+t/2,to:r.z1-t/2,openings:east,trim:[{face:1,frames:'trim',shutters:'shutter'}]});
  }
  // A clear stairwell connects the retail floor, upper room and roof.
  for (const y of [3,6]) {
    const look = y === 6 ? 'roof' : 'concrete';
    b.add([r.x0,y-0.18,r.z0],[r.x1,y,9.8],'concrete',{look});
    b.add([r.x0,y-0.18,9.8],[26.8,y,r.z1],'concrete',{look});
    b.add([30.4,y-0.18,9.8],[r.x1,y,r.z1],'concrete',{look});
    b.add([26.8,y-0.18,20.8],[30.4,y,r.z1],'concrete',{look});
  }
  for (const y of [0,3]) {
    towerFlight(b,27,28.4,20.5,11.5,y);
    towerFlight(b,28.8,30.2,11.5,20.5,y+1.5);
    b.add([27,y+1.32,9.8],[30.2,y+1.5,11.5],'concrete',{look:'concrete'});
  }
  const p = {thickness:t,bottom:6,height:0.85,material:'concrete' as const,look:'market'};
  b.wall({...p,along:'x',at:r.z0,from:r.x0,to:r.x1});
  b.wall({...p,along:'x',at:r.z1,from:r.x0,to:r.x1});
  b.wall({...p,along:'z',at:r.x0,from:r.z0+t/2,to:r.z1-t/2});
  b.wall({...p,along:'z',at:r.x1,from:r.z0+t/2,to:r.z1-t/2});
  // A shallow canopy and counter establish the shop without closing its entrances.
  b.add([20.3,2.5,6.5],[27.7,2.65,8],'wood',{look:'awning'});
  b.add([19,0,12],[21.6,1.05,12.7],'wood',{look:'wood'});
  b.add([18.3,0,16],[19,1.4,19.2],'wood',{look:'wood'});
}

function shopHints(): Vec3[] {
  const hints: Vec3[] = [[24,0,6.8],[24,0,9.2],[21.3,0,22],[21.3,0,24],
    [30,0,21.8],[32,0,21.8],[27.7,0,21.3]];
  for (const y of [0,3]) {
    hints.push([27.7,y,21.3],[27.7,y+1.5,10.5],[29.5,y+1.5,10.5],[29.5,y+3,21.3],[25.8,y+3,21.3]);
    for (let i=0; i<=6; i++) {
      hints.push([27.7,y+1.5*i/6,20.5-9*i/6],[29.5,y+1.5+1.5*i/6,11.5+9*i/6]);
    }
  }
  return hints;
}

function towerHints(): Vec3[] {
  const hints: Vec3[] = [[-9,0,-20.8],[-9,0,-22.8],[-9,0,-24],[-5,0,-26.8],[-3,0,-26.8]];
  for (const y of [0,3,6]) {
    hints.push([-12.9,y,-23.5],[-12.9,y+0.75,-25.8],[-12.9,y+1.5,-28.8],
      [-11.1,y+1.5,-28.8],[-11.1,y+2.25,-25.8],[-11.1,y+3,-23.5],[-9.5,y+3,-23.5]);
  }
  return hints;
}

/** A covered, columned arcade facing the helicopter plaza. */
function buildArcadeWalkway(b: Builder): void {
  const r = LANDMARKS.arcade;
  b.add([r.x0,2.55,r.z0-3.0],[r.x1,2.8,r.z0],'concrete',{look:'trim'});
  for (const x of [r.x0+0.5,r.x0+4.5,r.x0+8.5,r.x0+12.5,r.x1-0.5]) {
    b.add([x-0.16,0,r.z0-2.8],[x+0.16,2.55,r.z0-2.48],'concrete',{look:'plaster'});
    b.add([x-0.28,2.28,r.z0-2.92],[x+0.28,2.55,r.z0-2.36],'concrete',{look:'trim'});
  }
}

/** Walls and openings form the back street, backyard and south alley.
 * Openings are full height so movement and sightlines follow the same gaps. */
function buildLanes(b: Builder): void {
  const gap = (from: number, to: number): Opening => ({from,to,bottom:0,top:3});
  const wall = {thickness:0.3,bottom:0,height:3,material:'concrete' as const,look:'plaster'};
  b.wall({...wall,along:'z',at:32,from:-23,to:6,openings:[gap(-14,-10),gap(0,3)]});
  b.wall({...wall,along:'x',at:25.5,from:-10,to:30,openings:[gap(-8,-4),gap(7,11),gap(24,28)]});
  b.wall({...wall,along:'z',at:-31,from:-8,to:13,openings:[gap(-2,2),gap(8,11)]});
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
    { rect: { x0: 31, x1: 42, z0: -24, z1: 30 }, material: 'asphalt', look: 'road' },
    { rect: { x0: -38, x1: 32, z0: 26, z1: 31 }, material: 'asphalt', look: 'road' },
    { rect: { x0: -42, x1: 42, z0: -7, z1: 8 }, material: 'asphalt', look: 'road' },
    { rect: { x0: -10, x1: 9, z0: -38, z1: 38 }, material: 'asphalt', look: 'road' },
    { rect: { x0: -100, x1: 100, z0: -100, z1: 100 }, material: 'sand', look: 'sand' },
  ];
  for (const {rect, material, look} of groundTiles(layers)) b.add([rect.x0,-0.5,rect.z0],[rect.x1,0,rect.z1],material,{look});
  // Original neighbourhood arrangement: the main building divides the
  // central crash site from the eastern back street; the arcade closes the
  // south side and leaves an alley behind it.
  buildTower(b);
  // The tower's crash-facing roof edge has an open steel mesh enclosure.
  // The panel blocks players while shots can pass through the wire.
  for (const x of [-14,-12,-10,-8,-6])
    b.model('rooftop-fence',[x,9.85,-22],0,() => b.add([x,9.85,-22.05],[x+2,11.35,-21.95],'metal',{look:'fence.metal',blocks:'players'}));
  for (const z of [-22,-24,-26,-28,-30])
    b.model('rooftop-fence',[-4,9.85,z],Math.PI/2,() => b.add([-4.05,9.85,z-2],[-3.95,11.35,z],'metal',{look:'fence.metal',blocks:'players'}));
  buildBlue(b);
  building(b, LANDMARKS.main, 2, 'plaster', 'south', false, 'main');
  building(b, LANDMARKS.arcade, 1, 'market', 'north', false, 'arcade');
  buildArcadeWalkway(b);
  buildShop(b);
  building(b, {x0:-38,x1:-29,z0:-21,z1:-10}, 1, 'plaster', 'south');
  building(b, {x0:-38,x1:-28,z0:16,z1:24}, 1, 'plaster', 'north');
  building(b, {x0:23,x1:34,z0:-33,z1:-24}, 1, 'plaster', 'south');
  buildLanes(b);
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
  // Utility poles and the overhead lines frame the two outside streets.
  for (const [x,z] of [[-37,-7],[-37,10],[35,-18],[35,14]] as const) {
    b.model('utility-pole',[x,0,z],0,() => {
      b.add([x-0.15,0,z-0.15],[x+0.15,6.4,z+0.15],'wood',{look:'pole.wood'});
      b.add([x-1,5.98,z-0.07],[x+1,6.12,z+0.07],'wood',{look:'pole.wood'});
      for (const dx of [-0.7,0.7]) b.add([x+dx-0.095,6.12,z-0.095],[x+dx+0.095,6.28,z+0.095],'plastic',{look:'pole.insulator'});
    });
  }
  for (const [x,z0,z1] of [[-37,-7,10],[35,-18,14]] as const) for (const dx of [-0.7,0.7])
    b.add([x+dx-0.015,6.22,z0],[x+dx+0.015,6.25,z1],'metal',{look:'pole.wire',blocks:'bullets'});
  // Rooftop water storage and dishes add recognizable silhouettes and cover.
  for (const [x,y,z] of [[-20,6,-1],[12,6,-14],[21,6,20]] as const)
    b.model('water-tank',[x,y,z],0,() => b.add([x-0.8,y,z-0.8],[x+0.8,y+1.6,z+0.8],'metal',{look:'roof.tank'}));
  for (const [x,y,z] of [[-6,9,-30],[-20,6,7]] as const)
    b.model('satellite-dish',[x,y,z],0,() => b.add([x-0.32,y,z-0.54],[x+0.50,y+1.76,z+0.54],'metal',{look:'roof.metal'}));
  // Low cover interrupts the central crossings and the long market alley.
  for (const [x,z] of [[-12,4],[-2,6],[7,8],[-12,-12],[35,2],[-34,8],[14,29]] as const)
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
    {name:'tower stairs',position:[-9,1.6,-24] as Vec3,yaw:Math.PI/2,pitch:0},
    {name:'blue building',position:[-19,4.6,4] as Vec3,yaw:-Math.PI/2,pitch:-0.1},
    {name:'market',position:[24,1.6,6] as Vec3,yaw:Math.PI,pitch:0},
    {name:'arcade',position:[-3,1.6,5] as Vec3,yaw:Math.PI,pitch:0},
  ];
  return {
    id:'crash', name:'Crash', solids:b.solids, hiddenSolids:b.hidden, finishes:FINISHES, looks:b.looks, decorations:b.decorations,
    models:{url:'models/crash.glb',placements:b.models}, ramps:[], labels:[], populationSign:null,
    horizon:{ground:'sand',inner:{x0:-100,x1:100,z0:-100,z1:100},light:[-80,-80]}, lighting:CRASH_LIGHT, lamps:[], nuke:null, train:null,
    ambience:[{kind:'wind'}], spawns:{ffa,teams:[west,east]},
    zones:[{id:'A',name:'Tower',center:[-9,0,-20],radius:3,height:3},{id:'B',name:'Crash site',center:[-6,0,5],radius:3,height:3},{id:'C',name:'Shop',center:[24,0,5],radius:3,height:3}],
    sites:[{id:'A',name:'Main building',min:[3,0,-20],max:[16,3,3]},{id:'B',name:'Shop',min:[18,0,8],max:[31,3,23]}],
    offlineSpawn:west[0]!, overview:spots[1]!, dummies:[], loadoutStation:null, rangeLanesWestOf:null,
    indoorZones:[{name:'tower',min:[-14,0,-33],max:[-4,9,-22]},{name:'blue building',min:[-27,0,-3],max:[-17,6,10]},{name:'main building',min:[3,0,-20],max:[16,6,3]},{name:'shop',min:[18,0,8],max:[31,6,23]}],
    referenceSpots:spots, benchmarkPath:spots.map(({position,yaw,pitch})=>({position,yaw,pitch})), flyThrough:[], playArea:BOUNDARY,
    nav:{area:BOUNDARY,spacing:2,ceiling:12,hints:[
      ...towerHints(),
      ...blueHints(),
      ...stairHints(LANDMARKS.main,2),
      ...shopHints(),
      ...[-8.5,-4.5,-0.5,2.5].flatMap((x): Vec3[] => [[x,0,9.5],[x,0,11.3],[x,0,14.0]]),
      ...[-12,1.5].flatMap((z): Vec3[] => [[30.8,0,z],[33.2,0,z]]),
      ...[-6,9,26].flatMap((x): Vec3[] => [[x,0,24.3],[x,0,26.7]]),
      ...[0,9.5].flatMap((z): Vec3[] => [[-32.2,0,z],[-30.2,0,z]]),
    ]}, measurements:[],
  };
}
