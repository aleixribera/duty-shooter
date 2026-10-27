import { STATS, WEAPON_IDS, type WeaponId } from '../stats';

export type GrenadeId = 'frag';

/** What a player carries into a life: a primary, a secondary and a grenade (or none). */
export interface Loadout {
  readonly primary: WeaponId;
  readonly secondary: WeaponId;
  readonly grenade: GrenadeId | null;
}

/** The loadout of a player who never chose one. */
export const DEFAULT_LOADOUT: Loadout = { primary: 'm4a1', secondary: 'pistol', grenade: 'frag' };

/** Weapons a loadout may carry in each slot. */
export function slotWeapons(slot: 'primary' | 'secondary'): WeaponId[] {
  return WEAPON_IDS.filter((id) => STATS.weapons[id].traits.slot === slot);
}

/** A loadout from untrusted data (a join message, a client's storage), or null if it isn't one. */
export function parseLoadout(value: unknown): Loadout | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const { primary, secondary, grenade } = value as Record<string, unknown>;
  if (!slotWeapons('primary').includes(primary as WeaponId)) return null;
  if (!slotWeapons('secondary').includes(secondary as WeaponId)) return null;
  if (grenade !== null && grenade !== 'frag') return null;
  return { primary: primary as WeaponId, secondary: secondary as WeaponId, grenade };
}
