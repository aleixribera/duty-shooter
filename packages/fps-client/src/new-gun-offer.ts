import { WEAPON_IDS, type Loadout, type WeaponId } from '@duty-shooter/fps-core';
import { GUN_RANKS, gunOpen } from './profile/model';

/**
 * The death screen's new-gun plate (PLAN item 9d): a gun this Profile has opened by rank and carries in none of its
 * kept loadouts is offered beside the three plates, "New: Trident", key 4, so a player who never opens the menus still
 * meets it. Taken, it goes into the lit loadout's slot for it (the primary, or the secondary for the revolver) with its
 * gunsmith build. It goes once taken, or once it has been passed on three deaths, and the next one opened waits behind it.
 *
 * What was passed is kept in local storage beside the hints, per gun, so a gun passed three times stays gone.
 */
const KEY = 'duty-shooter.new-guns.v1';

/** Deaths a gun's plate stands before it is passed for good. */
export const NEW_GUN_PASSES = 3;

/** Per gun, the deaths its plate stood untaken (NEW_GUN_PASSES once taken). */
export type NewGunPasses = Readonly<Partial<Record<WeaponId, number>>>;

/** Reads a stored record, dropping anything that is not one: a damaged save offers the guns again, never a crash. */
export function parseNewGunPasses(raw: unknown): NewGunPasses {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Partial<Record<WeaponId, number>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (WEAPON_IDS.includes(k as WeaponId) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k as WeaponId] = Math.min(NEW_GUN_PASSES, Math.floor(v));
  }
  return out;
}

/**
 * The gun the death screen offers, or null: one opened by rank (the starting guns are not new), open now, in neither
 * slot of any kept loadout, and passed on fewer than three deaths; of those, the first to open.
 */
export function newGunOffer(loadouts: readonly Loadout[], xp: number, passes: NewGunPasses): WeaponId | null {
  const carried = new Set<WeaponId>(loadouts.flatMap((l) => [l.primary, l.secondary]));
  const offers = WEAPON_IDS.filter((id) => GUN_RANKS[id] > 1 && gunOpen(id, xp) && !carried.has(id) && (passes[id] ?? 0) < NEW_GUN_PASSES);
  return offers.sort((a, b) => GUN_RANKS[a] - GUN_RANKS[b])[0] ?? null;
}

let passes: NewGunPasses | null = null;

export function newGunPasses(): NewGunPasses {
  if (passes) return passes;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    passes = raw ? parseNewGunPasses(JSON.parse(raw)) : {};
  } catch {
    // Storage blocked or the save unreadable: the guns are offered again.
    passes = {};
  }
  return passes;
}

function save(next: NewGunPasses): void {
  passes = next;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: remembered for this visit only.
  }
}

/** A death on which `id`'s plate stood and the next life began without it. */
export function passNewGun(id: WeaponId): void {
  const now = newGunPasses();
  save({ ...now, [id]: Math.min(NEW_GUN_PASSES, (now[id] ?? 0) + 1) });
}

/** `id` taken from its plate: never offered again, even if it later leaves every loadout. */
export function tookNewGun(id: WeaponId): void {
  save({ ...newGunPasses(), [id]: NEW_GUN_PASSES });
}
