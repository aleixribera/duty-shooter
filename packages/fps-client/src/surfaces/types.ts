import type { Material, Vec3 } from '@duty-shooter/fps-core';

/**
 * A family of code-generated surface material: the pattern it draws in world
 * space (lap siding, shingles, running-bond brick...) and how it shines.
 */
export type Family =
  | 'grid'
  | 'siding'
  | 'shingles'
  | 'brick'
  | 'asphalt'
  | 'grass'
  | 'sand'
  | 'concrete'
  | 'paint'
  | 'sheetMetal'
  | 'fence'
  | 'glass'
  | 'plastic'
  | 'floor'
  | 'plaster'
  | 'dirt'
  | 'gravel'
  | 'tile'
  /** A lit lamp: it glows in its colour, whatever light falls on it. */
  | 'lamp';

/** One finish: a family in a colour (sRGB hex), with an optional second colour some families use (mortar, grooves, stripes). */
export interface Finish {
  readonly family: Family;
  readonly color: number;
  readonly accent?: number;
  /** How a map model in this finish shines, where it differs from its family's (glass, chrome); baked surfaces ignore these. */
  readonly roughness?: number;
  readonly metalness?: number;
}

/**
 * Which finish a solid wears on which faces. Faces looking up or down wear
 * `top` or `bottom`; a wall's narrow ends (the reveals of its doors and
 * windows) wear `edge`; a face looking into an indoor zone wears `inside`;
 * everything else wears `side`. Keys name entries of the map's finishes.
 */
export interface Look {
  readonly side: string;
  readonly inside?: string;
  readonly edge?: string;
  readonly top?: string;
  readonly bottom?: string;
}

/**
 * Visual-only geometry tied to one solid (trim, window frames, porch
 * details): a box, yawed about its centre, that must stay within 5 cm of
 * the solid it decorates.
 */
export interface Decoration {
  readonly center: Vec3;
  readonly size: Vec3;
  readonly yaw: number;
  readonly finish: string;
  /** Index into the map's drawn solids. */
  readonly solid: number;
}

/**
 * A model from the map's model file, placed in the world: its asset (a
 * top-level node of the file, by name), turned `yaw` about +y (radians;
 * its +x then looks along (cos yaw, 0, -sin yaw)) and moved to `position`.
 * It draws `solids` (indices into the map's drawn solids) in their place:
 * they keep colliding and casting shadows in the bake but get no faces of
 * their own, and every vertex of the model lies within the decoration
 * tolerance of one of them.
 */
export interface ModelPlacement {
  readonly asset: string;
  readonly position: Vec3;
  readonly yaw: number;
  readonly solids: readonly number[];
}

/** A map's models: the GLB file (a URL the page loads) and where each goes. */
export interface MapModels {
  readonly url: string;
  readonly placements: readonly ModelPlacement[];
}

/**
 * A freight train that runs past a map at the end of a match, drawn and
 * heard only. It runs west along its line (z) from `start` (the head's x
 * as the match ends) at `speed` m/s, the wagons trailing east of the head.
 * Its models are placed relative to the head, on the ground at its line;
 * its bogies and headlights are measured back from the head along it.
 */
export interface FreightTrain {
  readonly models: MapModels;
  readonly z: number;
  readonly start: number;
  readonly speed: number;
  /** Head to tail (m). */
  readonly length: number;
  /** Each bogie's distance behind the head (m), head first. */
  readonly bogies: readonly number[];
  /** The leading loco's headlights, relative to the head. */
  readonly headlights: readonly Vec3[];
  /** Seconds after the match ends that the horn sounds. */
  readonly horns: readonly number[];
}

/** How far decoration may stand proud of the solid it decorates (m). */
export const DECORATION_TOLERANCE = 0.05;

/** What the surface pipeline needs from a map beyond its solids. */
export interface SurfaceSpec {
  readonly finishes: Readonly<Record<string, Finish>>;
  /** Per drawn solid, in order: its look, or null for its material's default finish. */
  readonly looks: readonly (Look | null)[];
  readonly decorations: readonly Decoration[];
  /** Boxes that count as indoors, for choosing inside finishes. */
  readonly indoor: readonly { readonly min: Vec3; readonly max: Vec3 }[];
  /** Drawn solids a map model draws instead (see ModelPlacement): they get no faces. */
  readonly modelled?: readonly number[];
}

/** The finish a solid of each material wears when its map gives it no look. */
export const DEFAULT_FINISHES: Readonly<Record<Material, Finish>> = {
  concrete: { family: 'concrete', color: 0xb9b6ae },
  plaster: { family: 'plaster', color: 0xe4ddcf },
  metal: { family: 'paint', color: 0x5d666e },
  wood: { family: 'floor', color: 0xa8774a, accent: 0x7a5232 },
  dirt: { family: 'dirt', color: 0x8c7258 },
  grass: { family: 'grass', color: 0x7f9a52 },
  glass: { family: 'glass', color: 0x9fc0cc },
  brick: { family: 'brick', color: 0xa65a42, accent: 0xcfc6b8 },
  asphalt: { family: 'asphalt', color: 0x4a4c4f },
  gravel: { family: 'gravel', color: 0x958b7c },
  sand: { family: 'sand', color: 0xd6bd8c },
  sheetMetal: { family: 'sheetMetal', color: 0xb8bfc4 },
  plastic: { family: 'plastic', color: 0xe9e2d6 },
};

/** The key a material's default finish is filed under. */
export function defaultFinishKey(material: Material): string {
  return `default:${material}`;
}
