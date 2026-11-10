import { STATS, WEAPON_IDS, type WeaponId, type WeaponRow } from '../stats';
import { isStock, moddedRow, parseAttachments, type Attachments } from './attachments';

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
  /** What is on each gun (ticket 19); a gun left out, or a loadout from before attachments, is stock. */
  readonly attachments?: LoadoutAttachments;
}

/** The attachments of a loadout's two guns. */
export interface LoadoutAttachments {
  readonly primary?: Attachments;
  readonly secondary?: Attachments;
}

/** What is on the gun in hand (`slot` 0 the primary, 1 the secondary), if the gun there is still the loadout's; no loadout, stock. */
export function kitInHand(loadout: Loadout | undefined, weapon: { readonly id: WeaponId; readonly slot: number }): Attachments | undefined {
  const gun = weapon.slot === 0 ? 'primary' : 'secondary';
  return loadout && loadout[gun] === weapon.id ? kitOf(loadout, gun) : undefined;
}

/** The row the gun in a player's hands works by: what is on it, from their loadout. */
export function heldRow(p: { readonly weapon: { readonly id: WeaponId; readonly slot: number }; readonly loadout?: Loadout }): WeaponRow {
  return moddedRow(p.weapon.id, kitInHand(p.loadout, p.weapon));
}

/** What is on a loadout's primary or secondary. */
export function kitOf(loadout: Loadout, gun: 'primary' | 'secondary'): Attachments | undefined {
  const a = loadout.attachments?.[gun];
  return isStock(a) ? undefined : a;
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
  const { primary, secondary, grenade, tactical = null, perk = null, attachments } = value as Record<string, unknown>;
  if (!slotWeapons('primary').includes(primary as WeaponId)) return null;
  if (!slotWeapons('secondary').includes(secondary as WeaponId)) return null;
  if (grenade !== null && grenade !== 'frag') return null;
  if (tactical !== null && !TACTICAL_IDS.includes(tactical as TacticalId)) return null;
  if (perk !== null && !PERK_IDS.includes(perk as PerkId)) return null;
  const loadout: Loadout = { primary: primary as WeaponId, secondary: secondary as WeaponId, grenade, tactical: tactical as TacticalId | null, perk: perk as PerkId | null };
  const kit = parseLoadoutAttachments(loadout, attachments);
  return kit ? { ...loadout, attachments: kit } : loadout;
}

/**
 * A loadout's attachments from untrusted data. A gun whose attachments are
 * not ones it takes (a save from before a gun's slots changed, or a forged
 * one) goes stock; the rest of the loadout stands. Nothing to carry: undefined.
 */
function parseLoadoutAttachments(loadout: Loadout, value: unknown): LoadoutAttachments | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const primary = parseAttachments(loadout.primary, record.primary);
  const secondary = parseAttachments(loadout.secondary, record.secondary);
  const out = { ...(primary && !isStock(primary) ? { primary } : {}), ...(secondary && !isStock(secondary) ? { secondary } : {}) };
  return out.primary || out.secondary ? out : undefined;
}
