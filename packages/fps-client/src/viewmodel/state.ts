import type { MovementState, ReloadKind, Stance, WeaponAction } from '@duty-shooter/fps-core';

/**
 * Everything the first-person viewmodel needs from the game, per rendered
 * frame. The range app feeds it from fps-core's weapon and movement output;
 * the dev viewer feeds it scripted values.
 */
export interface ViewmodelState {
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
}
