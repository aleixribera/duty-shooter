import { INTERMISSION, Terrain, yawBox, type SpawnPoint, type Vec3 } from '@duty-shooter/fps-core';
import { normalize, type EndingShot, type Finish, type Lighting } from '@duty-shooter/fps-client/surfaces';
import { Builder } from './builder';
import { insidePolygon, type CameraKey, type CameraSpot, type MapDefinition } from './definition';
import { placeCover, type CoverPiece } from './zero-island-cover';
import { placePlants, type DressedPiece } from './zero-island-plants';
import { BRIDGES, CORES, REGION_IDS, RUNWAY, TERRAIN_COLORS, TERRAIN_LAYERS, zeroIslandBoundary, zeroIslandGround, type Core, type RegionId } from './zero-island-terrain';

/** The one low sun, out over the sea to the south-west. */
export const ZERO_ISLAND_LIGHT: Lighting = {
  sunDirection: normalize([-0.62, 0.2, 0.76]),
  sunColor: [1.0, 0.58, 0.32],
  sunIntensity: 2.4,
  sunSpread: 0.025,
  skyZenith: [0.12, 0.17, 0.38],
  skyHorizon: [1.0, 0.58, 0.36],
  skyIntensity: 0.8,
  // Past the far plane the sky shows below the horizon: the colour the far sea has faded to, so no line shows.
  ground: [0.72, 0.5, 0.42],
};

/** The blockout's one finish: scale, not art. Each Region's ticket replaces it. */
const FINISHES: Readonly<Record<string, Finish>> = {
  block: { family: 'concrete', color: 0x9b9b98, accent: 0x7c7c7a },
  // One per Region: a mesh per finish, so a Region out of view is culled whole.
  ...Object.fromEntries([...REGION_IDS, 'sea'].map((id) => [`cover-${id}`, { family: 'concrete', color: 0x8f8f8c, accent: 0x737371 } satisfies Finish])),
};

/** Boundary clip reaches this high: past any jump, and past the summit. */
const SKY = 320;
const CLIP_THICKNESS = 2;
const LIP = 0.04;

/** One grey box of a Core: offset from its middle (x, z), footprint, height above the ground, and a turn. */
type Block = readonly [dx: number, dz: number, width: number, depth: number, height: number, yaw?: number];

/** Enough grey to read each Core's scale, placed as the art places its landmarks. */
const BLOCKS: Readonly<Record<RegionId, readonly Block[]>> = {
  'ground-zero': [
    // The core, its ring of blast barriers, and the bunkers.
    [0, 0, 9, 9, 11],
    ...[[24, 0], [17, 17], [0, 24], [-17, 17], [-24, 0], [-17, -17], [0, -24], [17, -17]].map(([x, z], i): Block => [x!, z!, 7, 1, 1.3, ((i + 2) * Math.PI) / 4]),
    [38, 14, 10, 7, 3],
    [-36, 20, 10, 7, 3],
    [-20, -38, 7, 10, 3],
    [24, -36, 7, 10, 3],
  ],
  'the-dustlands': [
    // The crashed jet, its wings, and the shacks and wrecks round it.
    [0, 0, 34, 5, 4.5, 0.5],
    [-2, 10, 7, 22, 1.2, 0.5],
    [-28, -12, 3, 8, 7, 0.5],
    [30, 22, 7, 5, 3],
    [34, -12, 6, 5, 3],
    [-30, 26, 5, 6, 3],
    [8, 32, 4, 2, 1.6, 0.3],
    [-10, -30, 4, 2, 1.6, 1.1],
  ],
  'frostbite-peaks': [
    // The radar base, the dish plinths, the watchtower and an ice wall.
    [0, 0, 16, 10, 4.5],
    [-26, 12, 6, 6, 8],
    [-30, -14, 6, 6, 8],
    [26, -18, 3, 3, 12],
    [20, 24, 18, 1.5, 3, 0.4],
    [-6, 32, 9, 6, 3],
  ],
  'mutant-jungle': [
    // The giant tree, and the stone ruins in the clearing.
    [0, 0, 9, 9, 30],
    [-28, 16, 6, 2, 5, 0.3],
    [-34, 6, 2, 8, 4, 0.3],
    [24, 26, 7, 2, 4.5, -0.4],
    [30, -20, 3, 3, 6],
    [-14, -32, 8, 2, 3],
  ],
  'neon-city': [
    // Streets between towers: the tall ones outer shells, the low ones the enterable blocks to come.
    [-30, -30, 18, 18, 62],
    [0, -32, 16, 16, 34],
    [30, -30, 18, 18, 78],
    [-32, 2, 16, 20, 18],
    [32, 2, 16, 20, 22],
    [-30, 32, 18, 18, 44],
    [0, 32, 16, 16, 12],
    [30, 32, 18, 18, 54],
  ],
  'rogue-harbor': [
    // Warehouses, container stacks and a crane's legs.
    [-26, -24, 24, 14, 8],
    [20, -28, 20, 12, 8],
    [-28, 12, 12, 2.5, 5.2],
    [-28, 18, 12, 2.5, 2.6],
    [-12, 22, 12, 2.5, 5.2],
    [12, 8, 2, 2, 22],
    [26, 8, 2, 2, 22],
    [26, 30, 12, 2.5, 2.6, 0.5],
  ],
};

/** The cargo ship moored south of the Harbor, and its two piers. */
const SHIP = { x: 115, z: 518, length: 72, beam: 12, height: 9 } as const;
const PIERS: readonly (readonly [x: number, z0: number, z1: number])[] = [
  [40, 465, 510],
  [150, 471, 510],
];

/** The ground's lowest and highest points under a footprint. */
function footprint(terrain: Terrain, x: number, z: number, width: number, depth: number, yaw: number): { low: number; high: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  let low = Infinity;
  let high = -Infinity;
  for (let u = -0.5; u <= 0.5; u += 0.25) {
    for (let v = -0.5; v <= 0.5; v += 0.25) {
      const y = terrain.heightAt(x + u * width * c + v * depth * s, z - u * width * s + v * depth * c);
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
  }
  return { low, high };
}

function coreBlocks(b: Builder, terrain: Terrain, core: Core, blocks: readonly Block[]): void {
  for (const [dx, dz, width, depth, height, yaw = 0] of blocks) {
    const x = core.x + dx;
    const z = core.z + dz;
    const { low, high } = footprint(terrain, x, z, width, depth, yaw);
    // Sunk past its lowest corner, so it never floats; its top is measured from the highest.
    const bottom = low - 0.6;
    const top = high + height;
    b.turned([x, (bottom + top) / 2, z], [width, top - bottom, depth], yaw, 'concrete', 'block');
  }
}

/** Stands the generator's grey solids on the ground, or on a bridge's deck; returns the rocks and trunks, for the kit to dress. */
function cover(b: Builder, terrain: Terrain, pieces: readonly CoverPiece[]): DressedPiece[] {
  const dressed: DressedPiece[] = [];
  for (const { kind, x, z, width, depth, height, yaw, material, region, deck } of pieces) {
    const { low, high } = deck === undefined ? footprint(terrain, x, z, width, depth, yaw) : { low: deck + 0.6, high: deck };
    const bottom = low - 0.6;
    const top = high + height;
    const index = b.solids.length;
    b.turned([x, (bottom + top) / 2, z], [width, top - bottom, depth], yaw, material, `cover-${region}`);
    if (kind === 'rock' || kind === 'trunk') dressed.push({ kind, region, index, x, z, width, depth, yaw, bottom, top, ground: low });
  }
  return dressed;
}

function bridges(b: Builder, terrain: Terrain): void {
  for (const bridge of BRIDGES) {
    const [ax, az] = bridge.from;
    const [bx, bz] = bridge.to;
    const length = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(-(bz - az), bx - ax);
    const thick = 0.6;
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    // A finger above the road it lands on, so the two don't flicker where they overlap.
    b.turned([x, bridge.deck + LIP - thick / 2, z], [length, thick, bridge.width], yaw, 'concrete', 'block');
    const piers = Math.max(1, Math.round(length / 28));
    for (let i = 1; i <= piers; i++) {
      const k = i / (piers + 1);
      const px = ax + (bx - ax) * k;
      const pz = az + (bz - az) * k;
      const ground = terrain.heightAt(px, pz);
      const top = bridge.deck - thick;
      b.turned([px, (ground - 1 + top) / 2, pz], [1.4, top - ground + 1, bridge.width - 1], yaw, 'concrete', 'block');
    }
  }
}

function harbor(b: Builder, terrain: Terrain): void {
  const { x, z, length, beam, height } = SHIP;
  const ground = terrain.heightAt(x, z);
  b.add([x - length / 2, ground - 1, z - beam / 2], [x + length / 2, height, z + beam / 2], 'metal', { look: 'block' });
  for (const [px, z0, z1] of PIERS) b.add([px - 3, 1.2, z0], [px + 3, 1.8, z1], 'concrete', { look: 'block' });
}

/** Player clip along every edge of the Boundary, just outside it. */
function boundary(b: Builder, outline: readonly (readonly [number, number])[]): void {
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = outline[i]!;
    const [bx, bz] = outline[(i + 1) % n]!;
    const length = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / length;
    const dz = (bz - az) / length;
    // The polygon winds so that its outside is to this side of every edge: away from the island's middle.
    const facing = (ax + bx) * -dz + (az + bz) * dx > 0 ? 1 : -1;
    const nx = -dz * facing;
    const nz = dx * facing;
    b.hidden.push(
      yawBox({
        center: [(ax + bx) / 2 + (nx * CLIP_THICKNESS) / 2, SKY / 2 - 20, (az + bz) / 2 + (nz * CLIP_THICKNESS) / 2],
        // A little past each end, so no gap opens at an outside corner.
        size: [length + 2 * CLIP_THICKNESS, SKY, CLIP_THICKNESS],
        yaw: Math.atan2(-dz, dx),
        material: 'concrete',
        blocks: 'players',
      }),
    );
  }
}

/** The offline spawn, then four round each Core, outside what stands in it: where the map's own spawns stand, kept clear of cover. */
function spawnPlaces(): (readonly [x: number, z: number])[] {
  const round = REGION_IDS.flatMap((id) => {
    const { x, z, radius } = CORES[id];
    return [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dz]) => [x + dx! * (radius + 8), z + dz! * (radius + 8)] as const);
  });
  return [[CORES['ground-zero'].x, 150], ...round];
}

/**
 * The ending: the bomb goes off over the crater at Ground Zero, and everyone
 * watches it from the edge of the Dustlands to the south-west, with the low
 * sun behind the camera lighting the cloud's near side. The camera stands
 * well outside the base surge (about 300 m out at its widest), pulls back
 * and up while the siren sounds, tilts up after the cloud as it climbs, and
 * holds on it behind the scoreboard. A Battle Royale runs a lobby, so its
 * ending is the nuke and then the scoreboard.
 */
function nukeEnding(terrain: Terrain): { groundZero: Vec3; siren: Vec3; shot: EndingShot } {
  const { x, z } = CORES['ground-zero'];
  const ground = terrain.heightAt(x, z);
  const shot: EndingShot = {
    from: [-300, terrain.heightAt(-300, 215) + 14, 215],
    to: [-335, terrain.heightAt(-335, 250) + 40, 250],
    lookFrom: [x, ground + 30, z],
    lookTo: [x, ground + 200, z],
    seconds: INTERMISSION.nuke + INTERMISSION.scoreboard,
    fov: 62,
  };
  // The siren on a pylon at the Dustlands' edge, beside the shot.
  return { groundZero: [x, ground, z], siren: [-285, terrain.heightAt(-285, 195) + 12, 195], shot };
}

const down = -0.32;
const south = Math.PI;
const west = Math.PI / 2;
const east = -Math.PI / 2;

/** Zero Island as a map: its ground, the Boundary, and grey blocks at each Core. */
export function buildZeroIsland(): MapDefinition {
  const ground = zeroIslandGround();
  const terrain = new Terrain(ground.data);
  const outline = zeroIslandBoundary();
  const b = new Builder();
  for (const id of REGION_IDS) coreBlocks(b, terrain, CORES[id], BLOCKS[id]);
  harbor(b, terrain);
  const inside = (x: number, z: number) => insidePolygon(outline, x, z);
  const routes = [
    ...ground.railway.map((line) => ({ line, half: 3 })),
    ...ground.roads.map((line) => ({ line, half: 3.5 })),
    ...ground.trails.map((line) => ({ line, half: 3 })),
    { line: ground.stream, half: 5 },
  ];
  const clear = spawnPlaces().map(([x, z]) => [x, z, 5] as const);
  const runway = [RUNWAY.from, RUNWAY.to, RUNWAY.half] as const;
  const dressed = cover(
    b,
    terrain,
    placeCover({
      terrain,
      inside,
      routes,
      railway: ground.railway,
      roads: ground.roads,
      spots: clear,
      built: b.solids.map((s) => [s.min[0], s.min[2], s.max[0], s.max[2]] as const),
      runway,
    }),
  );
  bridges(b, terrain);
  boundary(b, outline);
  const { plants, soft } = placePlants({ terrain, data: ground.data, inside, routes, spots: clear, runway, built: b.solids.map((s) => [s.min[0], s.min[2], s.max[0], s.max[2]] as const) }, dressed);
  const at = (x: number, z: number, above: number) => terrain.heightAt(x, z) + above;
  /** A spot `from` a Core, looking back at it. */
  const lookAt = (id: RegionId, dx: number, dz: number, yaw: number, name = CORES[id].name): CameraSpot => {
    const c = CORES[id];
    return { name, position: [c.x + dx, at(c.x + dx, c.z + dz, 5), c.z + dz], yaw, pitch: -0.08 };
  };
  const spots: readonly CameraSpot[] = [
    { name: 'overhead', position: [10, 1150, 120], yaw: 0, pitch: -1.53 },
    { name: 'from the south-west', position: [-640, 240, 640], yaw: -0.72, pitch: -0.3 },
    lookAt('ground-zero', 2, 100, 0),
    lookAt('the-dustlands', 75, 60, 0.9),
    lookAt('frostbite-peaks', 60, 85, 0.6),
    lookAt('mutant-jungle', 10, 88, 0),
    lookAt('neon-city', -105, 15, east),
    lookAt('rogue-harbor', 0, -90, south),
  ];
  const [spawn, ...roundCores] = spawnPlaces().map(([x, z]): SpawnPoint => ({ position: [x, at(x, z, 0), z], yaw: 0 }));
  const flight = (x: number, z: number, yaw: number): CameraKey => ({ position: [x, at(x, z, 3), z], yaw, pitch: -0.05 });
  // The widest views there are: over the crater to the peaks, the city in front of the island, and back along the south coast.
  const benchmarkPath: CameraKey[] = [
    flight(-60, 170, 0.3),
    flight(120, 190, -0.6),
    flight(300, 90, east),
  ];
  return {
    id: 'zero-island',
    name: 'Zero Island',
    solids: b.solids,
    hiddenSolids: b.hidden,
    terrain: ground.data,
    terrainColors: TERRAIN_COLORS,
    terrainLayers: TERRAIN_LAYERS,
    places: REGION_IDS.map((id) => ({ name: CORES[id].name, x: CORES[id].x, z: CORES[id].z })),
    finishes: FINISHES,
    looks: b.looks,
    decorations: b.decorations,
    models: null,
    plants,
    soft,
    ramps: [],
    labels: [],
    populationSign: null,
    horizon: null,
    lighting: ZERO_ISLAND_LIGHT,
    lamps: [],
    nuke: nukeEnding(terrain),
    train: null,
    ambience: [{ kind: 'wind' }],
    spawns: { ffa: [spawn!, ...roundCores], teams: null },
    zones: [],
    sites: [],
    offlineSpawn: spawn!,
    overview: spots[1]!,
    dummies: [],
    loadoutStation: null,
    rangeLanesWestOf: null,
    indoorZones: [],
    referenceSpots: spots,
    benchmarkPath,
    flyThrough: [],
    playArea: outline,
    nav: null,
    navFile: 'nav/zero-island.nav',
    measurements: [],
  };
}
