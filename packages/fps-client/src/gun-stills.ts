import type { WeaponId } from '@duty-shooter/fps-core';

/**
 * Each gun's still, side on in its stock build (`apps/range/scripts/gun-stills.mjs` makes them from the gun stage):
 * the loadout screen shows one the moment it asks for a gun, until its model is drawn, which on a fresh page waits
 * seconds on shaders; the death screen's loadout plates cut their silhouettes out of them.
 */
const STILLS: Readonly<Record<WeaponId, URL>> = {
  m4a1: new URL('./viewmodel/assets/stills/m4a1.webp', import.meta.url),
  smg: new URL('./viewmodel/assets/stills/smg.webp', import.meta.url),
  shotgun: new URL('./viewmodel/assets/stills/shotgun.webp', import.meta.url),
  sniper: new URL('./viewmodel/assets/stills/sniper.webp', import.meta.url),
  pistol: new URL('./viewmodel/assets/stills/pistol.webp', import.meta.url),
  lmg: new URL('./viewmodel/assets/stills/lmg.webp', import.meta.url),
  dmr: new URL('./viewmodel/assets/stills/dmr.webp', import.meta.url),
  burst: new URL('./viewmodel/assets/stills/burst.webp', import.meta.url),
  revolver: new URL('./viewmodel/assets/stills/revolver.webp', import.meta.url),
};

/** The still's address. */
export const gunStill = (id: WeaponId): string => STILLS[id].href;

/**
 * Where the gun lies in its still (alpha over 40 of 255), as shares of the still's width and height: left, top,
 * right, bottom. Measured from the stills above (840 x 472); a still made again needs measuring again.
 */
export const GUN_FRAMES: Readonly<Record<WeaponId, readonly [number, number, number, number]>> = {
  m4a1: [53 / 840, 116 / 472, 785 / 840, 356 / 472],
  smg: [89 / 840, 43 / 472, 746 / 840, 429 / 472],
  shotgun: [54 / 840, 175 / 472, 784 / 840, 298 / 472],
  sniper: [58 / 840, 171 / 472, 781 / 840, 302 / 472],
  pistol: [177 / 840, 44 / 472, 663 / 840, 429 / 472],
  lmg: [55 / 840, 153 / 472, 784 / 840, 320 / 472],
  dmr: [55 / 840, 153 / 472, 784 / 840, 320 / 472],
  burst: [51 / 840, 102 / 472, 786 / 840, 370 / 472],
  revolver: [143 / 840, 44 / 472, 699 / 840, 427 / 472],
};

/**
 * The gun cut out of its still as a CSS mask, for an element of the gun's own shape: `aspect` is the gun's width over
 * its height, and `style` sets `--still`, `--mask-size` and `--mask-at` so the mask crops the still's margin away.
 */
export function gunMask(id: WeaponId): { readonly aspect: number; readonly style: string } {
  const [l, t, r, b] = GUN_FRAMES[id];
  const w = r - l;
  const h = b - t;
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  return {
    aspect: (w * 840) / (h * 472),
    style: `--still:url('${gunStill(id)}');--mask-size:${pct(1 / w)} ${pct(1 / h)};--mask-at:${pct(l / (1 - w))} ${pct(t / (1 - h))}`,
  };
}
