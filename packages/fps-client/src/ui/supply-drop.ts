import { STATS, type BattleRoyaleState, type PlayerOutput, type SupplyDropState, type Vec3 } from '@duty-shooter/fps-core';
import type { MapBounds } from './island-map';

/**
 * What the client reads off a Battle Royale's Supply Drops: where each crate is in its fall, the marks the HUD and the map
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

/** The announcement when a crate is called in: what it holds, a resupply, and where and when it lands. */
export function dropAnnouncement(cell: string, landsIn: number): string {
  const where = cell ? ` in ${cell}` : '';
  return `Supply Drop incoming${where}: frags, tacticals and full health, landing in ${Math.max(1, Math.round(landsIn))} s.`;
}

const flat = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

/**
 * The use prompt for `self` at a landed crate in reach: hold to open it, or
 * that it is opening; null when none is in reach or someone else is opening it.
 * Only a landed crate can be opened, so `time` keeps a falling one out of it.
 */
export function dropPrompt(self: PlayerOutput, state: BattleRoyaleState, time: number, useLabel: string): string | null {
  if (!self.alive || self.downed) return null;
  for (const d of state.drops ?? []) {
    if (d.opened !== undefined || d.lands > time) continue;
    if (flat(self.position, d.position) > D.reach.value || Math.abs(self.position[1] - d.position[1]) > D.reach.value) continue;
    if (d.opening?.by === self.id) return 'Opening Supply Drop';
    if (!d.opening) return `Hold ${useLabel}  Open Supply Drop`;
  }
  return null;
}
