import { buildMap, FACING_NEG_Z } from './map';
import type { MapDefinition, MapId } from './definition';
import { buildSurvivalTown } from './survival-town';

/** The Practice Range as a map definition: lanes, dummies, the movement course and (until the release) the arena. */
export function buildRange(): MapDefinition {
  const map = buildMap();
  const pen = map.penetration.shooter.position;
  return {
    id: 'range',
    name: 'Practice Range',
    solids: map.solids,
    hiddenSolids: map.hiddenSolids,
    ramps: map.ramps,
    labels: map.labels,
    spawns: { ffa: map.arenaSpawns, teams: null },
    offlineSpawn: map.rangeSpawn,
    overview: { name: 'overview', position: [-42, 7, 14], yaw: 0.25, pitch: -0.28 },
    dummies: map.dummies,
    indoorZones: [],
    referenceSpots: [
      { name: 'firing line', position: [-48, 1.6, 0], yaw: FACING_NEG_Z, pitch: 0 },
      { name: 'movement course', position: [0, 1.6, 4], yaw: FACING_NEG_Z, pitch: -0.05 },
      { name: 'penetration station', position: [pen[0], 1.6, pen[2]], yaw: FACING_NEG_Z, pitch: -0.05 },
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
    measurements: [],
  };
}

export const MAP_IDS: readonly MapId[] = ['survival-town', 'range'];

const BUILDERS: Readonly<Record<MapId, () => MapDefinition>> = { 'survival-town': buildSurvivalTown, range: buildRange };

/** Builds a map by id. Each call builds afresh. */
export function buildMapById(id: MapId): MapDefinition {
  return BUILDERS[id]();
}

export type { CameraKey, CameraSpot, IndoorZone, MapDefinition, MapId, Measured } from './definition';
export { insidePolygon, mapSolids } from './definition';
