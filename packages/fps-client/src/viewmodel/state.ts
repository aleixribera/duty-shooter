import type { MovementState, ReloadKind, Stance, WeaponAction, WeaponId } from '@duty-shooter/fps-core';

/**
 * Everything the first-person viewmodel needs from the game, per rendered
 * frame. The range app feeds it from fps-core's weapon and movement output;
 * the dev viewer feeds it scripted values.
 */
export interface ViewmodelState {
  /** The weapon in hand; the M4A1 when absent. */
  readonly weapon?: WeaponId;
  readonly action: WeaponAction;
  /** Seconds into the current action. */
  readonly actionTime: number;
  readonly reload: ReloadKind | null;
  readonly ammo: number;
  /** ADS fraction: 0 hipfire, 1 fully aimed. */
  readonly ads: number;
  readonly movement: MovementState;
  readonly stance: Stance;
  /** Horizontal speed (m/s), scaling the walk and sprint bob. */
  readonly speed: number;
  readonly grounded: boolean;
  /** How far the view turned this frame (radians), for sway and turn inertia. */
  readonly lookDelta: { readonly yaw: number; readonly pitch: number };
  readonly alive: boolean;
  /** A grenade in hand: cooking, or just thrown, and for how long (s). */
  readonly grenade?: { readonly phase: 'cook' | 'throw'; readonly time: number } | null;
}
