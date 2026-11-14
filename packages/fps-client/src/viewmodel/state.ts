import type { Attachments, MovementState, OpticId, ReloadKind, Stance, Vec3, WeaponAction, WeaponId } from '@duty-shooter/fps-core';
import type { CamoId } from '../customize';

/**
 * Everything the first-person viewmodel needs from the game, per rendered
 * frame. The range app feeds it from fps-core's weapon and movement output;
 * the dev viewer feeds it scripted values.
 */
export interface ViewmodelState {
  /** The weapon in hand; the M4A1 when absent. */
  readonly weapon?: WeaponId;
  /** The optic on the weapon in hand (ticket 19): the gun carries it on its rail and aims through it. Irons when absent. */
  readonly optic?: OpticId | null;
  /** Everything fitted on the weapon in hand (PLAN item 7): its muzzle device, grip and magazine show on it. */
  readonly attachments?: Attachments | null;
  /** The camo on the weapon in hand; its own finish when absent. */
  readonly camo?: CamoId | null;
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
  /** The holder's velocity (m/s, world) and the view's yaw: the gun tilts into a strafe and hangs back through a jump and a fall. Still without them. */
  readonly velocity?: Vec3;
  readonly yaw?: number;
  /** The camera-motion setting, 0 to 1: how much of the gun's motion with the body is shown. All of it when absent. */
  readonly motion?: number;
  readonly alive: boolean;
  /** A grenade in hand: cooking, or just thrown, and for how long (s). */
  readonly grenade?: { readonly phase: 'cook' | 'throw'; readonly time: number; readonly kind?: 'frag' | 'smoke' | 'flash' } | null;
}
