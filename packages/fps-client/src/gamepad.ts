import type { Action } from './settings';

/**
 * Button indices of the W3C "standard" gamepad mapping, named for a
 * DualShock 4. Chrome, Edge and Firefox report a DualShock 4 (and most
 * XInput pads) with this mapping.
 */
export const PAD = {
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  share: 8,
  options: 9,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  ps: 16,
  touchpad: 17,
} as const;

export type PadButton = keyof typeof PAD;

export type PadLayout = 'default' | 'tactical';

/**
 * MW2019's controller button layouts. Movement and look are on the sticks,
 * prone is a hold of the crouch button and Options opens the menu.
 */
export const PAD_LAYOUTS: Readonly<Record<PadLayout, Readonly<Partial<Record<Action, PadButton>>>>> = {
  default: { fire: 'r2', ads: 'l2', sprint: 'l3', crouch: 'circle', jump: 'cross', reload: 'square', melee: 'r3', scoreboard: 'touchpad' },
  tactical: { fire: 'r2', ads: 'l2', sprint: 'l3', crouch: 'r3', jump: 'cross', reload: 'square', melee: 'circle', scoreboard: 'touchpad' },
};

/** Menu navigation from the pad. */
export type PadNav = 'up' | 'down' | 'left' | 'right' | 'accept' | 'back' | 'start';

/** One reading of the first connected pad. */
export interface PadReading {
  /** The browser's name for the pad. */
  readonly id: string;
  /** Pressed state per standard button index. */
  readonly pressed: readonly boolean[];
  readonly leftStick: readonly [x: number, y: number];
  readonly rightStick: readonly [x: number, y: number];
}

/** How far a trigger travels before it counts as pressed. */
const TRIGGER_THRESHOLD = 0.12;

/** The first connected pad, or null. */
export function readPad(): PadReading | null {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const pressed = pad.buttons.map((b, i) => (i === PAD.l2 || i === PAD.r2 ? b.value > TRIGGER_THRESHOLD || b.pressed : b.pressed));
    const axis = (i: number) => {
      const v = pad.axes[i] ?? 0;
      return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    };
    return { id: pad.id, pressed, leftStick: [axis(0), axis(1)], rightStick: [axis(2), axis(3)] };
  }
  return null;
}

/**
 * A radial deadzone: inside `inner` reads as zero, and the rest of the travel
 * is rescaled to 0..1 so small deflections past the deadzone stay usable.
 */
export function deadzone(x: number, y: number, inner: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= inner) return [0, 0];
  const scaled = Math.min(1, (m - inner) / (1 - inner));
  return [(x / m) * scaled, (y / m) * scaled];
}

/** The pad's display name: the browser's id without its vendor and product details. */
export function padName(id: string): string {
  return id.replace(/\s*\(.*$/, '').trim() || 'Controller';
}
