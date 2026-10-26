import { STATS } from '../stats';
import type { HitZone } from './hitboxes';

const D = STATS.damage;

/** Torso damage of one bullet that travelled `distance` metres (each band includes its upper range). */
export function rangeDamage(distance: number): number {
  if (distance <= D.closeRange.value) return D.closeDamage.value;
  if (distance <= D.midRange.value) return D.midDamage.value;
  return D.farDamage.value;
}

export function zoneMultiplier(zone: HitZone): number {
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
  }
}

/** Damage of one bullet hitting `zone` after `distance` metres. */
export function bulletDamage(distance: number, zone: HitZone): number {
  return rangeDamage(distance) * zoneMultiplier(zone);
}
