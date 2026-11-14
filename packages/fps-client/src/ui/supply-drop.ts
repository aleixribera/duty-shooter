import { DROP_WEAPON, STATS, type BattleRoyaleState, type DropHolds, type LooseWeaponState, type PlayerOutput, type SupplyDropState, type Vec3, type WeaponId } from '@duty-shooter/fps-core';
import type { MapBounds } from './island-map';

/**
 * What the client reads off a Battle Royale's Supply Drops and the weapons on
 * the ground: where each crate is in its fall, the marks the HUD and the map
 * draw, the map square it lands in and the use prompt. Plain numbers, no DOM
 * and no three.js, so the world, the HUD and tests agree.
 */

const D = STATS.royale.supplyDrop;

/** How fast (m/s) a crate comes down under its canopy, in its last {@link D.fall} seconds. */
export const FALL_SPEED = 6;
/** Seconds the canopy takes to fold onto the ground once the crate lands. */
const CHUTE_FOLD = 1.6;

/** Where a crate is at simulation time `time`: metres above where it lands (null before it shows in the sky), and how open its canopy still is. */
export function dropPose(drop: SupplyDropState, time: number): { readonly height: number | null; readonly chute: number } {
  const left = drop.lands - time;
  if (left > D.fall.value) return { height: null, chute: 1 };
  if (left > 0) return { height: left * FALL_SPEED, chute: 1 };
  return { height: 0, chute: Math.max(0, 1 + left / CHUTE_FOLD) };
}

/** The island map's square at ground point (x, z): a letter per 100 m column west to east, a number per row north to south, as the map labels them. */
export function gridCell(bounds: MapBounds, x: number, z: number): string {
  const cells = Math.floor(bounds.size / 100);
  const col = Math.max(0, Math.min(cells - 1, Math.floor((x - bounds.x0) / 100)));
  const row = Math.max(0, Math.min(cells - 1, Math.floor((z - bounds.z0) / 100)));
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

/** A crate as the HUD marks it. */
export interface DropMark {
  readonly stage: number;
  readonly x: number;
  readonly z: number;
  /** Seconds until it lands; 0 once down. */
  readonly landsIn: number;
  readonly opened: boolean;
  /** Its map square, or '' without a map. */
  readonly cell: string;
}

/** The crates the HUD marks: every one announced, until it is opened. */
export function dropMarks(state: BattleRoyaleState, time: number, bounds: MapBounds | null): DropMark[] {
  return (state.drops ?? []).map((d) => ({
    stage: d.stage,
    x: d.position[0],
    z: d.position[2],
    landsIn: Math.max(0, d.lands - time),
    opened: d.opened !== undefined,
    cell: bounds ? gridCell(bounds, d.position[0], d.position[2]) : '',
  }));
}

/** The announcement when a crate is called in: what it holds, the only sniper or (on loadouts) a resupply. */
export function dropAnnouncement(cell: string, landsIn: number, holds: DropHolds = 'sniper'): string {
  const where = cell ? ` in ${cell}` : '';
  const what = holds === 'resupply' ? 'frags, tacticals and full health' : 'the only sniper';
  return `Supply Drop incoming${where}: ${what}, landing in ${Math.max(1, Math.round(landsIn))} s.`;
}

const flat = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** What use does for `self` here: open a landed crate (held), or take a weapon off the ground (pressed); null when neither is in reach. */
function dropAction(self: PlayerOutput, state: BattleRoyaleState, primary: WeaponId | null): { readonly kind: 'open' | 'opening' | 'take'; readonly weapon?: WeaponId } | null {
  if (!self.alive || self.downed) return null;
  for (const d of state.drops ?? []) {
    if (d.opened !== undefined) continue;
    if (flat(self.position, d.position) > D.reach.value || Math.abs(self.position[1] - d.position[1]) > D.reach.value) continue;
    if (d.opening?.by === self.id) return { kind: 'opening' };
    // Under the loot rules a crate has nothing for someone holding its sniper; a resupply is for anyone.
    if ((state.holds === 'resupply' || primary !== DROP_WEAPON) && !d.opening) return { kind: 'open', weapon: DROP_WEAPON };
  }
  let best: LooseWeaponState | null = null;
  for (const l of state.loose ?? []) {
    if (l.weapon === primary || flat(l.position, self.position) > D.pickupReach.value || Math.abs(l.position[1] - self.position[1]) > 2) continue;
    if (!best || flat(l.position, self.position) < flat(best.position, self.position)) best = l;
  }
  return best ? { kind: 'take', weapon: best.weapon } : null;
}

/** The prompt line for {@link dropAction}, or null. Only a landed crate can be opened, so `time` keeps a falling one out of it. */
export function dropPrompt(self: PlayerOutput, state: BattleRoyaleState, time: number, primary: WeaponId | null, useLabel: string): string | null {
  const landed = { ...state, drops: (state.drops ?? []).filter((d) => d.lands <= time) };
  const action = dropAction(self, landed, primary);
  if (!action) return null;
  if (action.kind === 'opening') return 'Opening Supply Drop';
  const name = STATS.weapons[action.weapon ?? DROP_WEAPON].traits.name;
  return action.kind === 'open' ? `Hold ${useLabel}  Open Supply Drop` : `${useLabel}  Take ${name}`;
}
