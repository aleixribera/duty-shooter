import type { Material, Vec3 } from '@duty-shooter/fps-core';

/**
 * A family of code-generated surface material: the pattern it draws in world
 * space (lap siding, shingles, running-bond brick...) and how it shines.
 */
export type Family =
  | 'grid'
  | 'room'
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
  /** Louvred shutter slats, 5 cm apart. */
  | 'louvre'
  | 'glass'
  | 'plastic'
  | 'floor'
  | 'plaster'
  | 'wornPlaster'
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
  /** Glass: how much of what is behind it a pane hides, seen square on (0.14 if unset; more at a slant, where it mirrors the sky). */
  readonly opacity?: number;
  /**
   * A map model's glass with no room modelled behind it (a vehicle's windows): drawn solid, showing the sky beyond in its
   * colour dimmed by this much, as the light through the windows across the cab or the aisle, under a stronger mirror of
   * the sky than a house pane's (see `vehicleGlassMaterial`). Baked surfaces ignore it.
   */
  readonly through?: number;
  /**
   * Ground that thins out toward the edge of the patch it covers (a lawn into the desert round it): within `width`
   * metres of the rectangle's edge it gives way to the colour `into`, along a ragged line rather than a ruled one.
   */
  readonly fringe?: { readonly rect: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }; readonly width: number; readonly into: number };
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
 * Lettering painted on a face (a test site's survey marks), drawn just over it. It multiplies the face's colour rather than
 * lighting itself, so the paint keeps that face's light, shade and grain, as the bullet holes do.
 */
export interface Stencil {
  /** The centre of the lettering, on the face. */
  readonly center: Vec3;
  /** Which way the face looks: 0 along +z, turning toward +x. */
  readonly yaw: number;
  /** The area the lines are fitted into (m); a line too wide for it is narrowed. */
  readonly width: number;
  readonly height: number;
  /** The lines, top to bottom, each with its capital height (m). */
  readonly lines: readonly { readonly text: string; readonly size: number }[];
  /** The paint's colour and the colour of the face it is painted on (sRGB). */
  readonly ink: number;
  readonly on: number;
  /** Seeds the wear, so each stencil wears its own way. */
  readonly seed: number;
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
 * tolerance of one of them. Visual-only scenery has no collision solids and
 * is marked explicitly (for example thin tree foliage).
 */
export interface ModelPlacement {
  readonly asset: string;
  readonly position: Vec3;
  readonly yaw: number;
  readonly solids: readonly number[];
  readonly visualOnly?: true;
}

/** A map's models: the GLB file (a URL the page loads) and where each goes. */
export interface MapModels {
  readonly url: string;
  readonly placements: readonly ModelPlacement[];
}

/** Numbers per plant in `PlantKind.instances`: x, y, z, yaw, scale x, y, z, colour (0xrrggbb), snow (0 to 1). */
export const PLANT_STRIDE = 9;

/**
 * One kind of plant or rock (ticket 29): a model of the vegetation kit
 * (tools/map/vegetation.py) and every place it stands. Drawn instanced, the
 * full model out to `near` m from the camera, `lod` out to `far`, and nothing
 * past that.
 */
export interface PlantKind {
  readonly asset: string;
  readonly lod: string | null;
  readonly near: number;
  readonly far: number;
  /** Blades and fronds, seen from both sides. */
  readonly thin: boolean;
  /** How far its top sways in the wind, as a share of its height. */
  readonly sway: number;
  /** The GLB its models come from, when not the plants' own: a Region's kit (ticket 17). */
  readonly url?: string;
  /**
   * Something built (a Region's kit), not grown: each part of it wears the
   * ground photo layer its material names (`<finish>@<layer>`) from three
   * sides, and a part with an emissive colour glows.
   */
  readonly built?: true;
  /** The ground photo layer a rock wears from three sides (ticket 78): `rock` when absent. */
  readonly layer?: string;
  /** Per plant, `PLANT_STRIDE` numbers. Its colour tints the model's own. */
  readonly instances: Float32Array;
}

/** A map's vegetation and rocks: the kit's GLB, its kinds, and the solids it draws instead of their faces. */
export interface Plants {
  readonly url: string;
  /** The foliage atlas the kit's leaf cards show (tools/textures/foliage.py). */
  readonly atlas: string;
  readonly kinds: readonly PlantKind[];
  /** Solids (rocks, trunks) a plant stands for: they collide and stop bullets as before, but get no faces. */
  readonly modelled: readonly number[];
}

/**
 * The camera's move over a map's ending, shown instead of the player's view
 * from the match's end through the scoreboard: from `from` to `to`, looking
 * from `lookFrom` to `lookTo`, easing out over `seconds` and then holding,
 * with a vertical field of view of `fov` degrees.
 */
export interface EndingShot {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly lookFrom: Vec3;
  readonly lookTo: Vec3;
  readonly seconds: number;
  readonly fov: number;
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
  /** The ending's shot of it running past, which everyone watches instead of their own view. */
  readonly shot: EndingShot;
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
