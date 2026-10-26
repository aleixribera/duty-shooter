/** Button bits carried in {@link UserCmd.buttons}. */
export const Button = {
  Fire: 1 << 0,
  Ads: 1 << 1,
  Sprint: 1 << 2,
  Crouch: 1 << 3,
  Prone: 1 << 4,
  Jump: 1 << 5,
  Reload: 1 << 6,
  Melee: 1 << 7,
  /**
   * Tactical sprint. Its press starts a tactical sprint (when sprinting is
   * possible and stamina remains); holding it keeps it going. The client sets
   * it on a double-tap of the sprint key and holds it while the key is held.
   */
  TacticalSprint: 1 << 8,
} as const;

export type ButtonName = keyof typeof Button;

/**
 * One tick of player input, produced by the client at the simulation rate.
 */
export interface UserCmd {
  /** Bitmask of held buttons, see {@link Button}. */
  readonly buttons: number;
  /** Forward axis in [-1, 1]; positive moves forward. */
  readonly forward: number;
  /** Strafe axis in [-1, 1]; positive moves right. */
  readonly right: number;
  /** View yaw in radians; 0 looks down -Z, positive turns left (counter-clockwise from above). */
  readonly yaw: number;
  /** View pitch in radians; positive looks up. */
  readonly pitch: number;
  /**
   * When fire was pressed within this tick, as fractions of the tick in
   * [0, 1), in press order. Lets shots resolve between ticks.
   */
  readonly firePresses: readonly number[];
  /**
   * The server tick (fractional) at which this client was drawing the other
   * players when it produced the usercmd. The server rewinds hitboxes to it
   * for lag compensation, within a capped window. Omitted offline.
   */
  readonly viewTick?: number;
}

/** Builds a usercmd, defaulting every field to "no input". */
export function usercmd(
  partial: Partial<Omit<UserCmd, 'buttons'>> & { buttons?: number | readonly ButtonName[] } = {},
): UserCmd {
  const { buttons = 0, ...rest } = partial;
  return {
    forward: 0,
    right: 0,
    yaw: 0,
    pitch: 0,
    firePresses: [],
    ...rest,
    buttons: typeof buttons === 'number' ? buttons : buttons.reduce((bits, name) => bits | Button[name], 0),
  };
}

export function isPressed(cmd: UserCmd, button: ButtonName): boolean {
  return (cmd.buttons & Button[button]) !== 0;
}
