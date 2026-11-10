import { STATS, WEAPON_IDS, type WeaponId } from '../stats';

export type GrenadeId = 'frag';
/** A tactical (ticket 20): a smoke that hides what is past it, or a flash that blinds whoever looks at it. */
export type TacticalId = 'smoke' | 'flash';
/** Anything thrown: the frag or a tactical. */
export type ThrowableId = GrenadeId | TacticalId;
/** A perk (ticket 20): faster hands, quieter feet, or a vest against frags and flashes. */
export type PerkId = 'fastHands' | 'softSoles' | 'blastVest';

export const TACTICAL_IDS: readonly TacticalId[] = ['smoke', 'flash'];
export const PERK_IDS: readonly PerkId[] = ['fastHands', 'softSoles', 'blastVest'];

/**
 * What a player carries into a life: a primary, a secondary, a grenade (or
 * none), a tactical (or none) and a perk (or none). A loadout from before
 * tacticals and perks has neither: absent is the same as null.
 */
export interface Loadout {
  readonly primary: WeaponId;
  readonly secondary: WeaponId;
  readonly grenade: GrenadeId | null;
  readonly tactical?: TacticalId | null;
  readonly perk?: PerkId | null;
}

/** The loadout of a player who never chose one. */
export const DEFAULT_LOADOUT: Loadout = { primary: 'm4a1', secondary: 'pistol', grenade: 'frag', tactical: 'smoke', perk: null };

/** Weapons a loadout may carry in each slot. */
export function slotWeapons(slot: 'primary' | 'secondary'): WeaponId[] {
  return WEAPON_IDS.filter((id) => STATS.weapons[id].traits.slot === slot);
}

/** Whether `loadout` carries `perk`. */
export function hasPerk(loadout: Loadout, perk: PerkId): boolean {
  return loadout.perk === perk;
}

/** A loadout from untrusted data (a join message, a client's storage), or null if it isn't one. */
export function parseLoadout(value: unknown): Loadout | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const { primary, secondary, grenade, tactical = null, perk = null } = value as Record<string, unknown>;
  if (!slotWeapons('primary').includes(primary as WeaponId)) return null;
  if (!slotWeapons('secondary').includes(secondary as WeaponId)) return null;
  if (grenade !== null && grenade !== 'frag') return null;
  if (tactical !== null && !TACTICAL_IDS.includes(tactical as TacticalId)) return null;
  if (perk !== null && !PERK_IDS.includes(perk as PerkId)) return null;
  return { primary: primary as WeaponId, secondary: secondary as WeaponId, grenade, tactical: tactical as TacticalId | null, perk: perk as PerkId | null };
}
