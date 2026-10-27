import { STATS, type WeaponId } from '../stats';
import type { HitZone } from './hitboxes';

/** Torso damage of one bullet (or pellet) that travelled `distance` metres (each band includes its upper range). */
export function rangeDamage(distance: number, weapon: WeaponId = 'm4a1'): number {
  const bands = Object.values(STATS.weapons[weapon].damage.bands);
  for (const band of bands) {
    if (!band.range || distance <= band.range.value) return band.damage.value;
  }
  return bands.at(-1)?.damage.value ?? 0;
}

export function zoneMultiplier(zone: HitZone, weapon: WeaponId = 'm4a1'): number {
  const D = STATS.weapons[weapon].damage;
  switch (zone) {
    case 'head':
      return D.headMultiplier.value;
    case 'neck':
      return D.neckMultiplier.value;
    case 'upperTorso':
      return D.upperTorsoMultiplier.value;
    case 'lowerTorso':
      return D.lowerTorsoMultiplier.value;
    case 'arm':
      return D.armMultiplier.value;
    case 'leg':
      return D.legMultiplier.value;
    case 'foot':
      return (D.footMultiplier ?? D.legMultiplier).value;
  }
}

/** Damage of one bullet (or pellet) hitting `zone` after `distance` metres. */
export function bulletDamage(distance: number, zone: HitZone, weapon: WeaponId = 'm4a1'): number {
  return rangeDamage(distance, weapon) * zoneMultiplier(zone, weapon);
}
