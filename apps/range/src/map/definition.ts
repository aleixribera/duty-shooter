import type { PlayerSpawn, Solid, SpawnPoint, Vec3 } from '@duty-shooter/fps-core';
import type { Label, Ramp } from './map';

/** The maps the app ships. */
export type MapId = 'survival-town' | 'range';

/** A box the audio treats as indoors (reverb). */
export interface IndoorZone {
  readonly name: string;
  readonly min: Vec3;
  readonly max: Vec3;
}

/** A named camera placement, for repeatable screenshots and the benchmark. */
export interface CameraSpot {
  readonly name: string;
  readonly position: Vec3;
  readonly yaw: number;
  readonly pitch: number;
}

/** One key of a camera path; the camera moves between keys at a steady speed. */
export interface CameraKey {
  readonly position: Vec3;
  readonly yaw: number;
  readonly pitch: number;
}

/** A measurement taken from the map's own geometry, to compare against the reference file. */
export interface Measured {
  readonly id: string;
  readonly value: number;
}

/**
 * Everything the app needs to run a map: collision, what is drawn, where
 * players start, and the camera spots and paths. The core never imports
 * this; the app hands it the parts it needs.
 */
export interface MapDefinition {
  readonly id: MapId;
  readonly name: string;
  /** Solids that are drawn and collided against. */
  readonly solids: readonly Solid[];
  /** Collision-only solids: player clip (the boundary, the steps under sloped roofs) and hidden bullet surfaces. */
  readonly hiddenSolids: readonly Solid[];
  readonly ramps: readonly Ramp[];
  readonly labels: readonly Label[];
  readonly spawns: {
    readonly ffa: readonly SpawnPoint[];
    /** One set per team (team 1, team 2), each at its own side of the map; null where the map has no team spawns. */
    readonly teams: readonly [readonly SpawnPoint[], readonly SpawnPoint[]] | null;
  };
  /** Where an offline session starts. */
  readonly offlineSpawn: SpawnPoint;
  /** Where the camera waits when there is no player to follow. */
  readonly overview: CameraSpot;
  readonly dummies: readonly PlayerSpawn[];
  readonly indoorZones: readonly IndoorZone[];
  readonly referenceSpots: readonly CameraSpot[];
  readonly benchmarkPath: readonly CameraKey[];
  /** The main menu's slow camera loop. */
  readonly flyThrough: readonly CameraKey[];
  /** The playable area's outline (x, z), counter-clockwise, or null for a map walled in by its own geometry. */
  readonly playArea: readonly (readonly [number, number])[] | null;
  /** The map's own value for every entry of its reference file. */
  readonly measurements: readonly Measured[];
}

/** Every solid the simulation collides against. */
export function mapSolids(map: Pick<MapDefinition, 'solids' | 'hiddenSolids'>): Solid[] {
  return [...map.solids, ...map.hiddenSolids];
}

/** Whether (x, z) lies inside a polygon (even-odd rule). */
export function insidePolygon(polygon: readonly (readonly [number, number])[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
