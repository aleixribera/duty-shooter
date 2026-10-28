import type { ChargeSite, NavOptions, PlayerSpawn, Solid, SpawnPoint, Vec3, Zone } from '@duty-shooter/fps-core';
import type { Decoration, EndingShot, Finish, FreightTrain, Lamp, Lighting, Look, MapModels } from '@duty-shooter/fps-client/surfaces';
import type { Label, Ramp } from './map';

/** The maps the app ships. */
export type MapId = 'survival-town' | 'switchyard' | 'crash' | 'range';

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
  /** The map's named finishes (colour and pattern), beside the per-material defaults. */
  readonly finishes: Readonly<Record<string, Finish>>;
  /** Per drawn solid, how its faces look; null where its material's default finish will do. */
  readonly looks: readonly (Look | null)[];
  /** Visual-only trim, each within 5 cm of the solid it sits on. */
  readonly decorations: readonly Decoration[];
  /** Modelled things (Blender models) drawn in place of the solids they stand for, or null for a map without any. */
  readonly models: MapModels | null;
  readonly ramps: readonly Ramp[];
  readonly labels: readonly Label[];
  /**
   * Where the population sign's live display goes (the board's front face:
   * its centre, facing `yaw`, and its size), or null for a map without one.
   */
  readonly populationSign: { readonly center: Vec3; readonly yaw: number; readonly width: number; readonly height: number } | null;
  /**
   * The far world, drawn but never collided with: ground in the finish
   * `ground` from the edge of the map's own ground (`inner`, x0..x1 by
   * z0..z1) out to mountains on the horizon. It is lit like the open
   * ground at `light` (x, z), which must see the sun.
   */
  readonly horizon: {
    readonly ground: string;
    readonly inner: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number };
    readonly light: readonly [number, number];
    /** A town out on the plain, beyond the boundary: where its blocks stand and a seed for their layout. */
    readonly town?: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number; readonly seed: number };
  };
  /** The map's sun and sky, for its bake and its drawing. */
  readonly lighting: Lighting;
  /** Lamps baked into its lighting (their glowing heads are the map's own geometry). */
  readonly lamps: readonly Lamp[];
  /**
   * The end-of-match nuke (drawn and heard only): where the bomb goes off,
   * on the ground out in the desert, and where the town's air-raid siren
   * sounds from, and the camera's shot of it, which everyone watches through
   * the intermission (like a cut scene); null for a map that never ends in one.
   */
  readonly nuke: { readonly groundZero: Vec3; readonly siren: Vec3; readonly shot: EndingShot } | null;
  /** The end-of-match freight train (drawn and heard only), or null for a map that never ends in one. */
  readonly train: FreightTrain | null;
  /** What the map makes heard: the wind everywhere, and at a place birds, a sign, a radio, a far horn, shunting or a humming lamp. */
  readonly ambience: readonly ({ readonly kind: 'wind' } | { readonly kind: 'birds' | 'sign' | 'radio' | 'horn' | 'couplings' | 'hum'; readonly position: Vec3 })[];
  readonly spawns: {
    readonly ffa: readonly SpawnPoint[];
    /** One set per team (team 1, team 2), each at its own side of the map; null where the map has no team spawns. */
    readonly teams: readonly [readonly SpawnPoint[], readonly SpawnPoint[]] | null;
  };
  /** The Outposts zones (none on a map that doesn't play it). */
  readonly zones: readonly Zone[];
  /** The two Charge sites, on the second team set's half (the defenders start there); none on a map that doesn't play it. */
  readonly sites: readonly ChargeSite[];
  /** Where an offline session starts. */
  readonly offlineSpawn: SpawnPoint;
  /** Where the camera waits when there is no player to follow. */
  readonly overview: CameraSpot;
  readonly dummies: readonly PlayerSpawn[];
  /** Where the Use button opens the loadout screen (the range's station), or null. */
  readonly loadoutStation: { readonly position: Vec3; readonly radius: number } | null;
  /** The range's firing lanes, west of this x, where the TTK overlay shows; null on a map without them. */
  readonly rangeLanesWestOf: number | null;
  readonly indoorZones: readonly IndoorZone[];
  readonly referenceSpots: readonly CameraSpot[];
  readonly benchmarkPath: readonly CameraKey[];
  /** The main menu's slow camera loop. */
  readonly flyThrough: readonly CameraKey[];
  /** The playable area's outline (x, z), counter-clockwise, or null for a map walled in by its own geometry. */
  readonly playArea: readonly (readonly [number, number])[] | null;
  /** How bots' nav graph is generated from the collision, or null for a map bots don't play. */
  readonly nav: NavOptions | null;
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
