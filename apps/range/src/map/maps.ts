import { buildMap, FACING_NEG_Z } from './map';
import type { TeamSizes } from '@duty-shooter/fps-core';
import { LIGHTING, type Finish } from '@duty-shooter/fps-client/surfaces';
import type { MapDefinition, MapId } from './definition';
import { buildSurvivalTown } from './survival-town';
import { buildSwitchyard } from './switchyard';
import { buildCrash } from './crash';

/** The range keeps its measuring grid: every material in a grid finish (base tint, line colour). */
const GRID_FINISHES: Readonly<Record<string, Finish>> = Object.fromEntries(
  (
    [
      ['concrete', 0xb9bcc0, 0x6f7378],
      ['plaster', 0xd9d6cf, 0x9a968e],
      ['metal', 0x6f7c88, 0x3c4650],
      ['wood', 0xc08a52, 0x7a5530],
      ['dirt', 0x8c7a62, 0x5e5040],
      ['grass', 0x6f8a58, 0x4c6340],
      ['glass', 0x9fc4d4, 0x6a8c99],
      ['brick', 0xa8624c, 0x6e3e30],
      ['asphalt', 0x55585c, 0x35373a],
      ['gravel', 0x8f887c, 0x625c52],
      ['sand', 0xc9b48a, 0x9a8662],
      ['sheetMetal', 0x9aa4ae, 0x5c666e],
      ['plastic', 0xe6e0d4, 0xa8a294],
    ] as const
  ).map(([material, color, accent]) => [`grid:${material}`, { family: material === 'glass' ? 'glass' : 'grid', color, accent }]),
);

/** The range's props (tools/map/range.py), modelled in real finishes on the grid. */
const PROP_FINISHES: Readonly<Record<string, Finish>> = {
  'prop.wood': { family: 'floor', color: 0x8a6644, accent: 0x6e5034 },
  'prop.plywood': { family: 'floor', color: 0xc4a575, accent: 0xa88a5c },
  'prop.steel': { family: 'paint', color: 0x3a3f45, roughness: 0.5, metalness: 0.4 },
  'prop.frame': { family: 'paint', color: 0x2e3a2f },
  'prop.sandbag': { family: 'dirt', color: 0x8b7d5c, roughness: 0.95 },
  'prop.rubber': { family: 'paint', color: 0x1f2022, roughness: 0.9, metalness: 0 },
  'prop.plastic': { family: 'plastic', color: 0xe6e0d4, roughness: 0.45 },
  'prop.pegboard': { family: 'floor', color: 0xb59c78, accent: 0x9a8262 },
};

/** The Practice Range as a map definition: lanes, dummies and the movement course. */
export function buildRange(): MapDefinition {
  const map = buildMap();
  const pen = map.penetration.shooter.position;
  const snipe = map.sniping.shooter.position;
  return {
    id: 'range',
    name: 'Practice Range',
    solids: map.solids,
    hiddenSolids: map.hiddenSolids,
    finishes: { ...GRID_FINISHES, ...PROP_FINISHES },
    // The mannequin's head, a prop that a shot knocks off, matches its body.
    looks: map.solids.map((s) => ({ side: s.prop ? 'prop.plastic' : `grid:${s.material}` })),
    decorations: [],
    models: { url: 'models/range.glb', placements: map.models },
    ramps: map.ramps,
    labels: map.labels,
    populationSign: null,
    horizon: { ground: 'grid:grass', inner: { x0: -80, x1: 62, z0: -90, z1: 30 }, light: [-40, -80] },
    lighting: LIGHTING,
    lamps: [],
    nuke: null,
    train: null,
    ambience: [{ kind: 'wind' }],
    spawns: { ffa: [map.rangeSpawn, ...map.teamSpawns.flat()], teams: map.teamSpawns },
    zones: [],
    sites: [],
    offlineSpawn: map.rangeSpawn,
    overview: { name: 'overview', position: [-42, 7, 14], yaw: 0.25, pitch: -0.28 },
    dummies: map.dummies,
    loadoutStation: map.loadoutStation,
    rangeLanesWestOf: -18,
    indoorZones: [],
    referenceSpots: [
      { name: 'firing line', position: [-48, 1.6, 0], yaw: FACING_NEG_Z, pitch: 0 },
      { name: 'movement course', position: [0, 1.6, 4], yaw: FACING_NEG_Z, pitch: -0.05 },
      { name: 'penetration station', position: [pen[0], 1.6, pen[2]], yaw: FACING_NEG_Z, pitch: -0.05 },
      { name: 'sniping lane', position: [snipe[0], 1.6, snipe[2]], yaw: map.sniping.shooter.yaw, pitch: -0.01 },
      { name: 'loadout station', position: [map.loadoutStation.position[0] + 1.5, 1.6, map.loadoutStation.position[2] - 3], yaw: Math.PI - 0.4, pitch: -0.12 },
    ],
    // Along the open strip behind the firing line, looking down the lanes and over the course.
    benchmarkPath: [
      { position: [-58, 1.6, 12], yaw: FACING_NEG_Z, pitch: -0.05 },
      { position: [-42, 1.6, 12], yaw: FACING_NEG_Z + 0.3, pitch: -0.02 },
      { position: [-12, 1.6, 12], yaw: FACING_NEG_Z - 0.4, pitch: -0.05 },
      { position: [14, 1.6, 12], yaw: FACING_NEG_Z + 0.5, pitch: -0.08 },
      { position: [27, 1.6, 24], yaw: Math.PI / 2, pitch: 0 },
    ],
    flyThrough: [],
    playArea: null,
    nav: null,
    measurements: [],
  };
}

export const MAP_IDS: readonly MapId[] = ['survival-town', 'switchyard', 'crash', 'range'];

/** `id` as a map id, or undefined when it names no map. */
export const asMapId = (id: string | null | undefined): MapId | undefined => MAP_IDS.find((m) => m === id);
/** The maps an online lobby plays: those built for matches (not the Practice Range). */
export const LOBBY_MAPS: readonly MapId[] = ['survival-town', 'switchyard', 'crash'];

/**
 * The team size each map plays at, by mode: with bots on, a lobby fills to
 * it (a mode without teams holds twice it). The switchyard's long open yard
 * takes 6v6, Survival Town's streets 4v4. Modes where everyone is an enemy
 * (free-for-all, gun game) play emptier: 6 players on Survival Town and 8 on
 * the switchyard, so a spawn isn't a crossfire from every side. A new mode without teams takes these too.
 */
export const TEAM_SIZES: Readonly<Record<MapId, TeamSizes>> = {
  'survival-town': { tdm: 4, ffa: 3, outposts: 4, charge: 4, gungame: 3 },
  switchyard: { tdm: 6, ffa: 4, outposts: 6, charge: 6, gungame: 4 },
  crash: { tdm: 4, ffa: 3, outposts: 4, charge: 4, gungame: 3 },
  range: {},
};

const BUILDERS: Readonly<Record<MapId, () => MapDefinition>> = { 'survival-town': buildSurvivalTown, switchyard: buildSwitchyard, crash: buildCrash, range: buildRange };

/** Builds a map by id. Each call builds afresh. */
export function buildMapById(id: MapId): MapDefinition {
  return BUILDERS[id]();
}

export type { CameraKey, CameraSpot, IndoorZone, MapDefinition, MapId, Measured } from './definition';
export { insidePolygon, mapSolids } from './definition';
