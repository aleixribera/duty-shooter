import { STATS, box, orientedBox, playerClip, type Material, type MantleBand, type PlayerSpawn, type Solid, type SpawnPoint, type Vec3 } from '@duty-shooter/fps-core';
import type { ModelPlacement } from '@duty-shooter/fps-client/surfaces';

/**
 * The one original map: a firing range (10/25/50 m lanes, static and rail
 * dummies), a 100 m sniping lane and a movement course, all built from
 * material-tagged solids. 1 unit = 1 metre, Y up; the range faces -Z.
 */

/** A sloped surface: drawn as a ramp, walked on as fine player clip steps, shot at as a sloped bullet surface. */
export interface Ramp {
  /** Footprint corners (x/z) and the low and high edge heights. Rises along -Z from `z0` to `z1`. */
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly h0: number;
  readonly h1: number;
  readonly material: Material;
}

/** A sign in the world, e.g. a lane distance board. */
export interface Label {
  readonly text: string;
  readonly position: Vec3;
  /** Yaw the sign faces (0 = facing +Z, toward a player looking down -Z). */
  readonly yaw: number;
  readonly size: number;
}

/** A test station on the course, for checking it plays as labelled. */
export interface LedgeStation {
  readonly band: MantleBand;
  readonly height: number;
  /** Where to stand, facing the ledge, within mantle reach. */
  readonly approach: SpawnPoint;
}

export interface DropStation {
  readonly outcome: 'safe' | 'damage' | 'lethal';
  readonly height: number;
  /** Standing at the edge, facing off it. */
  readonly edge: SpawnPoint;
}

export interface GapStation {
  readonly width: number;
  /** Sprint mode the gap is designed for. */
  readonly sprint: 'sprint' | 'tacticalSprint';
  /** A run-up start on the near platform, facing the gap. */
  readonly runUp: SpawnPoint;
  /** How far the run-up start is from the gap's near edge. */
  readonly runUpLength: number;
  /** Far edge Z: landing beyond it (smaller Z) clears the gap. */
  readonly farEdgeZ: number;
  readonly height: number;
}

/** Targets behind one panel each, to check wallbang damage against the stats file's penetration table. */
export interface PenetrationStation {
  /** Where to stand, facing the panels. */
  readonly shooter: SpawnPoint;
  readonly lanes: readonly { readonly material: Material; readonly thickness: number; readonly dummy: string }[];
  /** A mannequin whose head is a prop. */
  readonly mannequinHead: string;
}

/** Targets 25 to 100 m out, to read every weapon's falloff and to practise with the scope. */
export interface SnipingLane {
  /** Where to stand, facing down the lane. */
  readonly shooter: SpawnPoint;
  readonly targets: readonly { readonly distance: number; readonly dummy: string }[];
}

/** Where the loadout screen opens with the Use button: around `position`, within `radius` metres. */
export interface LoadoutStation {
  readonly position: Vec3;
  readonly radius: number;
}

export interface GameMap {
  /** Solids that are drawn and collided against. */
  readonly solids: readonly Solid[];
  /** The props drawn as models (tools/map/range.py) instead of their solids. */
  readonly models: readonly ModelPlacement[];
  /** Collision-only solids (the player clip steps and bullet surfaces under ramps). */
  readonly hiddenSolids: readonly Solid[];
  readonly ramps: readonly Ramp[];
  readonly labels: readonly Label[];
  /** Where an offline session starts: the range's firing line. */
  readonly rangeSpawn: SpawnPoint;
  /** Online on the range: one set per team, on the open grass either side of the lanes and the course. */
  readonly teamSpawns: readonly [readonly SpawnPoint[], readonly SpawnPoint[]];
  readonly dummies: readonly PlayerSpawn[];
  readonly course: {
    readonly ledges: readonly LedgeStation[];
    readonly drops: readonly DropStation[];
    readonly gaps: readonly GapStation[];
    /** Bottom of the stairs, facing up them, and the top height. */
    readonly stairs: { readonly start: SpawnPoint; readonly top: number };
    readonly ramp: { readonly start: SpawnPoint; readonly top: number };
  };
  readonly penetration: PenetrationStation;
  readonly sniping: SnipingLane;
  readonly loadoutStation: LoadoutStation;
}

/** Every solid the simulation collides against. */
export function collisionSolids(map: GameMap): Solid[] {
  return [...map.solids, ...map.hiddenSolids];
}

const b = (min: Vec3, max: Vec3, material: Material) => box({ min, max, material });

const HALF = STATS.stance.hullHalfWidth.value;
const FACING_NEG_Z = 0;
const FACING_POS_X = -Math.PI / 2;
const FACING_NEG_X = Math.PI / 2;

export function buildMap(): GameMap {
  const solids: Solid[] = [];
  const hidden: Solid[] = [];
  const ramps: Ramp[] = [];
  const labels: Label[] = [];
  const models: ModelPlacement[] = [];
  const add: Add = Object.assign((min: Vec3, max: Vec3, material: Material) => void solids.push(b(min, max, material)), {
    model(asset: string, position: Vec3, yaw: number, fn: () => void) {
      const from = solids.length;
      fn();
      models.push({ asset, position, yaw, solids: Array.from({ length: solids.length - from }, (_, i) => from + i) });
    },
  });

  // Ground: separate tiles so each area has its own surface material. Top at y = 0.
  add([-80, -1, 8], [62, 0, 30], 'concrete'); // the strip behind the firing line: the course start and the penetration station
  add([-66, -1, -66], [-18, 0, 8], 'dirt'); // range lanes
  add([-18, -1, -66], [33, 0, 8], 'concrete'); // course
  add([-80, -1, -66], [-66, 0, 8], 'grass');
  add([33, -1, -66], [62, 0, 8], 'grass');
  add([-80, -1, -90], [62, 0, -66], 'grass');

  // Perimeter fence so nobody walks off the world.
  add([-80, 0, 29], [62, 3, 30], 'concrete');
  add([-80, 0, -90], [62, 3, -89], 'concrete');
  add([-81, 0, -90], [-80, 3, 30], 'concrete');
  add([61, 0, -89], [62, 3, 29], 'concrete');

  buildRange(add, labels);
  const course = buildCourse(add, hidden, ramps, labels);
  const penetration = buildPenetrationStation(add, solids, labels);
  const sniping = buildSnipingLane(add, labels);
  const loadoutStation = buildLoadoutStation(add, labels);

  const dummies: PlayerSpawn[] = [
    { id: 'dummy-10', team: 0, position: [-58, 0, -10], yaw: Math.PI, dummy: {} },
    { id: 'dummy-25', team: 0, position: [-48, 0, -25], yaw: Math.PI, dummy: {} },
    { id: 'dummy-50', team: 0, position: [-40, 0, -50], yaw: Math.PI, dummy: {} },
    { id: 'dummy-walk', team: 0, position: [-33, 0, -20], yaw: Math.PI, dummy: { rail: { to: [-22, 0, -20], speed: STATS.movement.walkSpeed.value } } },
    { id: 'dummy-sprint', team: 0, position: [-33, 0, -40], yaw: Math.PI, dummy: { rail: { to: [-22, 0, -40], speed: STATS.movement.sprintSpeed.value } } },
    ...penetration.lanes.map((lane, i): PlayerSpawn => ({ id: lane.dummy, team: 0, position: [PEN_X0 + i * PEN_LANE, 0, PEN_DUMMY_Z], yaw: Math.PI, dummy: {} })),
    ...sniping.targets.map((t): PlayerSpawn => ({ id: t.dummy, team: 0, position: snipingTarget(t.distance), yaw: FACING_NEG_X, dummy: {} })),
  ];

  return {
    solids,
    models,
    hiddenSolids: hidden,
    ramps,
    labels,
    rangeSpawn: { position: [-48, 0, 0], yaw: FACING_NEG_Z },
    teamSpawns: [
      [-10, -25, -40, -55].map((z): SpawnPoint => ({ position: [-73, 0, z], yaw: FACING_POS_X })),
      [-10, -25, -40, -55].map((z): SpawnPoint => ({ position: [54, 0, z], yaw: FACING_NEG_X })),
    ],
    dummies,
    course,
    penetration,
    sniping,
    loadoutStation,
  };
}

/** The sniping lane runs east along the strip south of the range, from a bench at its west end. */
const SNIPE_FROM: Vec3 = [-77, 0, -77.5];
/**
 * Each target's offset across the lane: the near ones to one side and the far
 * ones to the other, so every target is in clear view of the bench.
 */
const SNIPE_OFFSET: Readonly<Record<number, number>> = { 25: 6, 50: 2, 75: -2, 100: -6 };
/** A sign's yaw turns its face from +Z: this one faces back up the lane (-X), toward the bench. */
const TOWARD_BENCH = -Math.PI / 2;

/** Where the target `distance` metres from the bench stands. */
function snipingTarget(distance: number): Vec3 {
  const offset = SNIPE_OFFSET[distance] ?? 0;
  return [SNIPE_FROM[0] + Math.sqrt(distance * distance - offset * offset), 0, SNIPE_FROM[2] + offset];
}

/**
 * The sniping lane, on the grass strip behind the range's backstop: a bench
 * at the west end and targets at 25, 50, 75 and 100 m, each standing in front
 * of a board that shows its distance and catches the misses, then an earth
 * bank to stop the rounds.
 */
function buildSnipingLane(add: Add, labels: Label[]): SnipingLane {
  const [x, , z] = SNIPE_FROM;
  add([x - 1.5, 0, z - 3], [x + 1, 0.02, z + 3], 'concrete');
  add.model('bench-500x50', [x + 1.25, 0, z], TOWARD_BENCH, () => add([x + 1, 0, z - 2.5], [x + 1.5, 0.95, z + 2.5], 'wood'));
  labels.push({ text: 'SNIPING LANE', position: [x + 0.98, 0.75, z], yaw: TOWARD_BENCH, size: 0.35 });
  const targets = [25, 50, 75, 100].map((distance) => ({ distance, dummy: `dummy-snipe-${distance}` }));
  for (const { distance } of targets) {
    const [tx, , tz] = snipingTarget(distance);
    add.model('target-board', [tx + 0.9, 0, tz], TOWARD_BENCH, () => add([tx + 0.8, 0, tz - 0.8], [tx + 1, 2.6, tz + 0.8], 'wood'));
    // The figures grow with distance, so each reads through the scope from the bench.
    labels.push({ text: `${distance} m`, position: [tx + 0.78, 2.25, tz], yaw: TOWARD_BENCH, size: 0.2 + distance * 0.004 });
  }
  add([30, 0, -88], [33, 4, -67], 'dirt');
  // A sign beside the firing line, pointing the way.
  add.model('signpost', [-72, 0, -2], 0, () => {
    add([-72.05, 0, -2.05], [-71.95, 2, -1.95], 'wood');
    add([-73, 1.4, -2.02], [-71, 2.2, -1.98], 'wood');
  });
  labels.push({ text: 'SNIPING 100 m', position: [-72, 1.8, -1.96], yaw: 0, size: 0.3 });
  return { shooter: { position: SNIPE_FROM, yaw: FACING_POS_X }, targets };
}

/** The loadout station: a rack table just behind the firing line, where Use opens the loadout screen. */
function buildLoadoutStation(add: Add, labels: Label[]): LoadoutStation {
  const [x, z] = [-44, 3.5];
  // Its front, where the labels are, faces -Z (toward the firing line).
  add.model('loadout-rack', [x, 0, z], Math.PI, () => {
    add([x - 1.2, 0, z - 0.4], [x + 1.2, 0.9, z + 0.4], 'metal');
    add([x - 1.2, 0.9, z + 0.3], [x + 1.2, 2, z + 0.4], 'wood');
  });
  labels.push({ text: 'LOADOUT', position: [x, 1.7, z + 0.28], yaw: Math.PI, size: 0.35 });
  labels.push({ text: 'USE', position: [x, 1.35, z + 0.28], yaw: Math.PI, size: 0.22 });
  return { position: [x, 0, z], radius: 2.5 };
}

/** Adds a drawn solid; `model` draws the solids added inside `fn` as one placement of a model instead. */
type Add = ((min: Vec3, max: Vec3, material: Material) => void) & { model(asset: string, position: Vec3, yaw: number, fn: () => void): void };

/**
 * The firing range, x from -64 to -20. The shooter stands on the firing line
 * at z = 0 with a bench just in front; dummies stand 10, 25 and 50 m down range.
 */
function buildRange(add: Add, labels: Label[]): void {
  // Benches in front of the firing line, one per lane, with gaps to walk through.
  for (const [x0, x1] of [
    [-63, -53],
    [-51, -45],
    [-43, -37],
    [-35, -21],
  ] as const) {
    // Their panels face the shooter (+Z).
    add.model(`bench-${(x1 - x0) * 100}x60`, [(x0 + x1) / 2, 0, -HALF - 0.3], 0, () => add([x0, 0, -HALF - 0.6], [x1, 0.95, -HALF], 'wood'));
  }
  // Lane dividers: low walls you can see over.
  for (const x of [-52, -44, -36]) add([x - 0.15, 0, -55], [x + 0.15, 1.1, -2.5], 'concrete');
  // Side walls and the backstop.
  add([-65, 0, -64], [-64, 4, 8], 'concrete');
  add([-20, 0, -64], [-19, 4, -3], 'concrete');
  add([-65, 0, -66], [-19, 9, -64], 'concrete');
  // Distance boards on the left of each lane and along the moving lane.
  for (const [x, z, text] of [
    [-62.5, -10, '10 m'],
    [-50.5, -25, '25 m'],
    [-42.5, -50, '50 m'],
    [-34.5, -20, 'WALK'],
    [-34.5, -40, 'SPRINT'],
  ] as const) {
    add.model('distance-board', [x, 0, z], 0, () => add([x - 0.6, 0, z - 0.05], [x + 0.6, 1.6, z + 0.05], 'wood'));
    labels.push({ text, position: [x, 1.25, z + 0.06], yaw: 0, size: 0.5 });
  }
  // Rail tracks for the moving dummies (flush, cosmetic).
  for (const z of [-20, -40]) add([-34, 0, z - 0.6], [-21, 0.02, z + 0.6], 'metal');
  // Floor distance markers every 5 m in the moving lane.
  for (let d = 5; d <= 55; d += 5) {
    add([-35.8, 0, -d - 0.04], [-21, 0.01, -d + 0.04], 'plaster');
    if (d % 10 === 0) labels.push({ text: `${d}`, position: [-21.4, 0.5, -d], yaw: FACING_NEG_X, size: 0.35 });
  }
  labels.push({ text: 'FIRING RANGE', position: [-42, 3.2, 7.9], yaw: Math.PI, size: 0.8 });
}

/**
 * The movement course, x from -16 to 28: mantle ledges in each band, stairs
 * and a ramp up to a gap run, a climb up two towers with a damaging and a
 * lethal drop, and a slide lane.
 */
function buildCourse(add: Add, hidden: Solid[], ramps: Ramp[], labels: Label[]): GameMap['course'] {
  const M = STATS.mantle;
  // Mantle ledges, centred in their bands, 2 m deep, faces at z = -6.
  const ledgeHeights: Record<MantleBand, number> = {
    lowVault: (STATS.movement.stepHeight.value + M.lowVaultMaxHeight.value) / 2,
    waist: (M.lowVaultMaxHeight.value + M.waistMantleMaxHeight.value) / 2,
    highClimb: (M.waistMantleMaxHeight.value + M.highClimbMaxHeight.value) / 2,
  };
  const ledges: LedgeStation[] = [];
  for (const [band, x0, material] of [
    ['lowVault', -14, 'wood'],
    ['waist', -8, 'concrete'],
    ['highClimb', -2, 'concrete'],
  ] as const) {
    const height = ledgeHeights[band];
    add([x0, 0, -8], [x0 + 4, height, -6], material);
    ledges.push({ band, height, approach: { position: [x0 + 2, 0, -6 + HALF + 0.2], yaw: FACING_NEG_Z } });
    labels.push({ text: band === 'lowVault' ? 'VAULT' : band === 'waist' ? 'MANTLE' : 'CLIMB', position: [x0 + 2, height + 0.4, -6.95], yaw: 0, size: 0.4 });
  }

  // Stairs: 10 steps of 0.2 m (well under the step height) up to a 2 m deck.
  const deck = 2;
  for (let i = 0; i < 10; i++) add([6, 0, -2 - 0.35 * (i + 1)], [10, 0.2 * (i + 1), -2 - 0.35 * i], 'concrete');
  add([6, 0, -12], [10, deck, -5.5], 'concrete');
  // Ramp beside it: drawn as a slope, walked on as 0.1 m player clip steps, shot at as a sloped bullet surface.
  ramps.push({ x0: 12, x1: 16, z0: -2, z1: -12, h0: 0, h1: deck, material: 'concrete' });
  const rampSteps = 20;
  for (let i = 0; i < rampSteps; i++) {
    const z1 = -2 - (10 / rampSteps) * i;
    hidden.push(playerClip({ min: [12, 0, z1 - 10 / rampSteps], max: [16, (deck / rampSteps) * (i + 1), z1], material: 'concrete' }));
  }
  const pitch = Math.atan2(deck, 10);
  const thickness = 0.5;
  hidden.push(
    orientedBox({
      center: [14, deck / 2 - (Math.cos(pitch) * thickness) / 2, -7 - (Math.sin(pitch) * thickness) / 2],
      size: [4, thickness, Math.hypot(10, deck)],
      yaw: 0,
      pitch,
      roll: 0,
      material: 'concrete',
      blocks: 'bullets',
    }),
  );
  // Deck joining stairs and ramp, then the gap run along -Z at 2 m.
  add([10, 0, -18], [16, deck, -12], 'concrete');
  add([6, 0, -18], [10, deck, -12], 'concrete');
  const gaps: GapStation[] = [];
  // Widths chosen so a walking jump falls short, the first needs a sprint and the second a tactical sprint.
  const gapWidths = [
    { width: 3.9, sprint: 'sprint' as const },
    { width: 4.95, sprint: 'tacticalSprint' as const },
  ];
  let z = -18;
  for (const g of gapWidths) {
    const runUp = 8;
    gaps.push({
      width: g.width,
      sprint: g.sprint,
      runUp: { position: [8, deck, z + runUp], yaw: FACING_NEG_Z },
      runUpLength: runUp,
      farEdgeZ: z - g.width,
      height: deck,
    });
    labels.push({ text: `${g.width} m`, position: [11, deck + 0.02, z + 0.6], yaw: 0, size: 0.4 });
    z -= g.width;
    add([6, 0, z - 9], [16, deck, z], 'metal');
    z -= 9;
  }
  // z is now the far end of the last platform. Climb: two high climbs and a waist mantle up to the 6.5 m tower.
  const tower1 = 6.5;
  add([6, 0, z - 1.5], [16, deck + 1.8, z], 'concrete');
  add([6, 0, z - 3], [16, deck + 3.6, z - 1.5], 'concrete');
  add([2, 0, z - 9], [16, tower1, z - 3], 'concrete');
  // Second climb to the 10 m tower.
  const tower2 = 10;
  add([6, 0, z - 10.5], [16, tower1 + 1.75, z - 9], 'concrete');
  add([6, 0, z - 12], [16, tower1 + 3.5, z - 10.5], 'concrete');
  add([2, 0, z - 17], [16, tower2, z - 12], 'concrete');
  const drops: DropStation[] = [
    { outcome: 'safe', height: deck, edge: { position: [6 + HALF + 0.05, deck, -15], yaw: FACING_NEG_X } },
    { outcome: 'damage', height: tower1, edge: { position: [2 + HALF + 0.05, tower1, z - 6], yaw: FACING_NEG_X } },
    { outcome: 'lethal', height: tower2, edge: { position: [2 + HALF + 0.05, tower2, z - 14.5], yaw: FACING_NEG_X } },
  ];
  labels.push({ text: `${tower1} m DROP`, position: [1.95, tower1 - 0.6, z - 6], yaw: FACING_NEG_X, size: 0.45 });
  labels.push({ text: `${tower2} m LETHAL`, position: [1.95, tower2 - 0.6, z - 14.5], yaw: FACING_NEG_X, size: 0.45 });

  // Slide lane: wood strip with a stripe every metre.
  add([20, 0, -50], [26, 0.02, 6], 'wood');
  for (let d = 0; d <= 50; d += 5) {
    add([20, 0.02, 2 - d - 0.05], [26, 0.03, 2 - d + 0.05], 'plaster');
    labels.push({ text: `${d} m`, position: [26.4, 0.6, 2 - d], yaw: FACING_NEG_X, size: 0.3 });
  }
  labels.push({ text: 'SLIDE LANE', position: [23, 2.6, 7.9], yaw: Math.PI, size: 0.6 });
  labels.push({ text: 'MOVEMENT COURSE', position: [0, 3.2, 7.9], yaw: Math.PI, size: 0.8 });
  // The signs over each area, their faces toward -Z.
  for (const [x0, x1, top] of [
    [-1, 1, 3.8],
    [-43.5, -40.5, 3.8],
    [21.5, 24.5, 3.2],
  ] as const) {
    add.model(`sign-${(x1 - x0) * 100}x${Math.round(top * 100)}`, [(x0 + x1) / 2, 0, 7.95], Math.PI, () => add([x0, 0, 7.9], [x1, top, 8], 'wood'));
  }

  return {
    ledges,
    drops,
    gaps,
    stairs: { start: { position: [8, 0, -1], yaw: FACING_NEG_Z }, top: deck },
    ramp: { start: { position: [14, 0, -1], yaw: FACING_NEG_Z }, top: deck },
  };
}

const PEN_X0 = 33;
const PEN_LANE = 6;
const PEN_PANEL_Z = 18;
const PEN_DUMMY_Z = 13;

/**
 * The penetration station, in the open strip behind the firing line east of
 * the course: four lanes with a dummy behind a wood panel, a plaster wall, a
 * sheet-metal panel and a brick wall, each signed with the damage that gets
 * through. Beside it, a mannequin whose head can be shot off.
 */
function buildPenetrationStation(add: Add, solids: Solid[], labels: Label[]): PenetrationStation {
  const lanes = [
    { material: 'wood', thickness: 0.2 },
    { material: 'plaster', thickness: 0.12 },
    { material: 'sheetMetal', thickness: 0.05 },
    { material: 'brick', thickness: 0.25 },
  ] as const;
  const out: { material: Material; thickness: number; dummy: string }[] = [];
  lanes.forEach(({ material, thickness }, i) => {
    const x = PEN_X0 + i * PEN_LANE;
    add([x - 1.5, 0, PEN_PANEL_Z - thickness], [x + 1.5, 2.4, PEN_PANEL_Z], material);
    const row = STATS.penetration.materials[material];
    const through = row.stops ? 'STOPS' : `${Math.round(row.damage.value * 100)} %`;
    labels.push({ text: `${material.toUpperCase()} ${through}`, position: [x, 2.7, PEN_PANEL_Z + 0.01], yaw: FACING_NEG_Z, size: 0.35 });
    out.push({ material, thickness, dummy: `dummy-pen-${material}` });
  });
  // Lane dividers, so a stray shot does not land in the next lane.
  for (let i = 0; i <= lanes.length; i++) {
    const x = PEN_X0 - PEN_LANE / 2 + i * PEN_LANE;
    add([x - 0.15, 0, PEN_DUMMY_Z - 2], [x + 0.15, 2.4, PEN_PANEL_Z], 'concrete');
  }
  add([PEN_X0 - PEN_LANE / 2, 0, PEN_DUMMY_Z - 2.3], [PEN_X0 - PEN_LANE / 2 + PEN_LANE * lanes.length, 3, PEN_DUMMY_Z - 2], 'concrete');
  labels.push({ text: 'PENETRATION', position: [PEN_X0 + (PEN_LANE * (lanes.length - 1)) / 2, 3.4, PEN_DUMMY_Z - 1.99], yaw: FACING_NEG_Z, size: 0.6 });

  // A mannequin on a stand: plastic body, its head a prop that a shot knocks off.
  const mx = PEN_X0 + PEN_LANE * lanes.length + 1;
  const mz = PEN_PANEL_Z - 2;
  add.model('mannequin-stand', [mx, 0, mz], 0, () => add([mx - 0.25, 0, mz - 0.15], [mx + 0.25, 1.45, mz + 0.15], 'plastic'));
  const mannequinHead = 'range-mannequin-head';
  solids.push(box({ min: [mx - 0.12, 1.47, mz - 0.12], max: [mx + 0.12, 1.75, mz + 0.12], material: 'plastic', prop: mannequinHead }));

  return { shooter: { position: [PEN_X0 + PEN_LANE * 1.5, 0, 26], yaw: FACING_NEG_Z }, lanes: out, mannequinHead };
}

export { FACING_NEG_X, FACING_NEG_Z, FACING_POS_X };
