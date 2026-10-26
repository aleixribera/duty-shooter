import { STATS } from './stats';

const F = STATS.fallDamage;

/**
 * Damage from a fall of `fallHeight` metres: none up to the minimum height,
 * rising linearly to max health (lethal) at the lethal height.
 */
export function fallDamage(fallHeight: number): number {
  const min = F.minHeight.value;
  const lethal = F.lethalHeight.value;
  if (fallHeight <= min) return 0;
  const fraction = Math.min(1, (fallHeight - min) / (lethal - min));
  return fraction * STATS.health.max.value;
}
