import { WEAPON_IDS, type OpticId, type WeaponId } from '@duty-shooter/fps-core';

/**
 * How a player dresses their guns (PLAN item 7, Customizing): a camo on each
 * gun, earned by that gun's Weapon Mastery, and a reticle colour and shape for
 * each optic. Seen only by the player who picks them (the gun in first person
 * and on the Loadout screen); nothing here reaches the server.
 */

export type CamoId = 'sand' | 'forest' | 'urban' | 'night' | 'gold';
export const CAMO_IDS: readonly CamoId[] = ['sand', 'forest', 'urban', 'night', 'gold'];
export const CAMO_NAMES: { readonly [C in CamoId]: string } = { sand: 'Sand', forest: 'Forest', urban: 'Urban', night: 'Night', gold: 'Gold' };
/** The Weapon Mastery level that earns each camo on a gun: one a level, Gold for the mastered gun. */
export const CAMO_MASTERY: { readonly [C in CamoId]: number } = { sand: 1, forest: 2, urban: 3, night: 4, gold: 5 };

export type ReticleColour = 'red' | 'green' | 'amber' | 'cyan' | 'white';
export const RETICLE_COLOURS: readonly ReticleColour[] = ['red', 'green', 'amber', 'cyan', 'white'];
export const RETICLE_COLOUR_NAMES: { readonly [C in ReticleColour]: string } = { red: 'Red', green: 'Green', amber: 'Amber', cyan: 'Cyan', white: 'White' };

export type ReticleShape = 'dot' | 'ring' | 'chevron';
export const RETICLE_SHAPES: readonly ReticleShape[] = ['dot', 'ring', 'chevron'];
export const RETICLE_SHAPE_NAMES: { readonly [S in ReticleShape]: string } = { dot: 'Dot', ring: 'Ring', chevron: 'Chevron' };

export interface Reticle {
  readonly colour: ReticleColour;
  readonly shape: ReticleShape;
}

/** Each optic as it comes: the Reflex's red dot, the Prism's red ring. */
export const DEFAULT_RETICLES: { readonly [O in OpticId]: Reticle } = {
  reflex: { colour: 'red', shape: 'dot' },
  prism: { colour: 'red', shape: 'ring' },
};

export type Camos = Readonly<Partial<Record<WeaponId, CamoId>>>;
export type Reticles = Readonly<Partial<Record<OpticId, Reticle>>>;

/** The camo on gun `id` while its `level` of Mastery has earned it, else none. */
export function camoOn(camos: Camos, id: WeaponId, level: number): CamoId | null {
  const camo = camos[id];
  return camo && level >= CAMO_MASTERY[camo] ? camo : null;
}

/** The reticle on `optic`: the player's, else the optic's own. */
export function reticleOf(reticles: Reticles, optic: OpticId): Reticle {
  return reticles[optic] ?? DEFAULT_RETICLES[optic];
}

const oneOf = <T extends string>(value: unknown, of: readonly T[]): T | null => (of as readonly unknown[]).includes(value) ? (value as T) : null;
const record = (value: unknown): Record<string, unknown> | null => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** Camos saved in this browser, kept to known guns and camos. */
export function savedCamos(value: unknown): Partial<Record<WeaponId, CamoId>> {
  const r = record(value);
  const out: Partial<Record<WeaponId, CamoId>> = {};
  if (!r) return out;
  for (const id of WEAPON_IDS) {
    const camo = oneOf(r[id], CAMO_IDS);
    if (camo) out[id] = camo;
  }
  return out;
}

/** Reticles saved in this browser, kept to known optics, colours and shapes. */
export function savedReticles(value: unknown): Partial<Record<OpticId, Reticle>> {
  const r = record(value);
  const out: Partial<Record<OpticId, Reticle>> = {};
  if (!r) return out;
  for (const optic of Object.keys(DEFAULT_RETICLES) as OpticId[]) {
    const saved = record(r[optic]);
    if (!saved) continue;
    const colour = oneOf(saved['colour'], RETICLE_COLOURS);
    const shape = oneOf(saved['shape'], RETICLE_SHAPES);
    if (colour && shape) out[optic] = { colour, shape };
  }
  return out;
}
