import type { Action } from './settings';
import type { Actuator } from './rumble';

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
  default: { fire: 'r2', ads: 'l2', sprint: 'l3', crouch: 'circle', jump: 'cross', reload: 'square', melee: 'r3', switchWeapon: 'triangle', grenade: 'r1', tactical: 'down', use: 'l1', scoreboard: 'touchpad', map: 'share', ping: 'up' },
  tactical: { fire: 'r2', ads: 'l2', sprint: 'l3', crouch: 'r3', jump: 'cross', reload: 'square', melee: 'circle', switchWeapon: 'triangle', grenade: 'r1', tactical: 'down', use: 'l1', scoreboard: 'touchpad', map: 'share', ping: 'up' },
};

/** The buttons play keeps for itself, so no action is bound to them: Options opens the menu, d-pad left and right vote for the next mode. */
export const PAD_KEPT_IN_PLAY: readonly number[] = [PAD.options, PAD.left, PAD.right];

/**
 * Menu navigation from the pad: the d-pad or left stick moves, Cross accepts, Circle goes back, Options is start,
 * Square erases (the on-screen keyboard), Triangle is the screen's second action, L1 and R1 page between tabs.
 */
export type PadNav = 'up' | 'down' | 'left' | 'right' | 'accept' | 'back' | 'start' | 'erase' | 'alt' | 'prev' | 'next';

/** Stick travel that counts as a menu move, and the delay before a held move repeats (ms). */
const MENU_STICK = 0.6;
const MENU_REPEAT_MS = 220;

/** The buttons that are one menu press each. */
const MENU_PRESSES: readonly (readonly [number, PadNav])[] = [
  [PAD.cross, 'accept'],
  [PAD.circle, 'back'],
  [PAD.options, 'start'],
  [PAD.square, 'erase'],
  [PAD.triangle, 'alt'],
  [PAD.l1, 'prev'],
  [PAD.r1, 'next'],
];

/** Turns pad readings into menu moves: a press each, and a held direction (d-pad or left stick) repeating. */
export class PadMenuReader {
  #nav: PadNav | null = null;
  #next = 0;

  /** The menu moves in `pad` at `now` (ms), `last` being the buttons pressed at the reading before. */
  read(pad: PadReading, now: number, last: readonly boolean[]): PadNav[] {
    const out: PadNav[] = [];
    const held = (i: number) => pad.pressed[i] ?? false;
    for (const [button, nav] of MENU_PRESSES) if (held(button) && !(last[button] ?? false)) out.push(nav);
    const [x, y] = pad.leftStick;
    let nav: PadNav | null = null;
    if (held(PAD.up) || y < -MENU_STICK) nav = 'up';
    else if (held(PAD.down) || y > MENU_STICK) nav = 'down';
    else if (held(PAD.left) || x < -MENU_STICK) nav = 'left';
    else if (held(PAD.right) || x > MENU_STICK) nav = 'right';
    if (nav !== this.#nav) {
      this.#nav = nav;
      this.#next = now + MENU_REPEAT_MS * 2;
      if (nav) out.push(nav);
    } else if (nav && now >= this.#next) {
      this.#next = now + MENU_REPEAT_MS;
      out.push(nav);
    }
    return out;
  }
}

/** One reading of the pad in use. */
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

/** How far a stick goes before a push counts as someone using that pad. */
const ACTIVE_STICK = 0.5;

/**
 * The pad in use: the last one pressed or pushed. Steam adds a virtual pad beside the real one (often ahead of it,
 * and often mirroring it), so reading only the first connected pad could read an idle one; the one in use holds
 * until another pad is used while it is not.
 */
let activeIndex: number | null = null;
/** Each pad's buttons at the last look, by `Gamepad.index`, for presses. */
const lastPressed = new Map<number, readonly boolean[]>();
/** Whether each pad's sticks were pushed at the last look, by `Gamepad.index`: a push counts as use when it starts. */
const lastPushed = new Map<number, boolean>();

function connectedPads(): Gamepad[] {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  const out: Gamepad[] = [];
  for (const pad of pads) if (pad && pad.connected) out.push(pad);
  // A pad without the standard layout (a raw driver's, its triggers resting at -1) only where no standard one is.
  const standard = out.filter((p) => p.mapping === 'standard');
  return standard.length ? standard : out;
}

function buttonsOf(pad: Gamepad): boolean[] {
  return pad.buttons.map((b, i) => (i === PAD.l2 || i === PAD.r2 ? b.value > TRIGGER_THRESHOLD || b.pressed : b.pressed));
}

/** Whether `pad` was used since the last look: a new press or a stick pushed past the drift. */
function used(pad: Gamepad, pressed: readonly boolean[]): boolean {
  const was = lastPressed.get(pad.index) ?? [];
  const pushed = pad.axes.slice(0, 4).some((v) => Number.isFinite(v) && Math.abs(v) > ACTIVE_STICK);
  const pushedBefore = lastPushed.get(pad.index) ?? false;
  lastPushed.set(pad.index, pushed);
  return pressed.some((p, i) => p && !was[i]) || (pushed && !pushedBefore);
}

/** The pad in use (see `activeIndex`), after a look at every connected pad; null with none connected. */
function activePad(): Gamepad | null {
  const pads = connectedPads();
  if (!pads.length) {
    activeIndex = null;
    lastPressed.clear();
    return null;
  }
  let current = pads.find((p) => p.index === activeIndex) ?? null;
  let currentUsed = false;
  let other: Gamepad | null = null;
  for (const pad of pads) {
    const pressed = buttonsOf(pad);
    const busy = used(pad, pressed);
    lastPressed.set(pad.index, pressed);
    if (pad === current) currentUsed = busy;
    else if (busy && !other) other = pad;
  }
  for (const index of lastPressed.keys()) if (!pads.some((p) => p.index === index)) lastPressed.delete(index);
  for (const index of lastPushed.keys()) if (!pads.some((p) => p.index === index)) lastPushed.delete(index);
  if (other && !currentUsed) current = other;
  current ??= pads[0]!;
  activeIndex = current.index;
  return current;
}

/** Whether the page may read the controller now: not while it is hidden or another window has the focus. */
function readable(): boolean {
  // The browser hands the controller to every page, focused or not: a pad used in another
  // window (another game, a person at the PC beside a scripted match) must not play here.
  return !(typeof document !== 'undefined' && (document.hidden || !document.hasFocus()));
}

/** The pad in use (the last one pressed or pushed, of any connected), or null (also while the page is hidden or another window has the focus). */
export function readPad(): PadReading | null {
  if (!readable()) return null;
  const pad = activePad();
  if (!pad) return null;
  const axis = (i: number) => {
    const v = pad.axes[i] ?? 0;
    return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  };
  return { id: pad.id, pressed: buttonsOf(pad), leftStick: [axis(0), axis(1)], rightStick: [axis(2), axis(3)] };
}

/** The rumble motors of the pad in use, or null (none connected, none that rumbles, or the page not in focus). */
export function padActuator(): Actuator | null {
  if (!readable()) return null;
  const pads = connectedPads();
  const pad = pads.find((p) => p.index === activeIndex) ?? pads[0];
  if (!pad) return null;
  const actuator = (pad as Gamepad & { vibrationActuator?: Actuator | null }).vibrationActuator;
  return actuator && typeof actuator.playEffect === 'function' ? actuator : null;
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

const BUTTON_LABELS: Readonly<Record<PadButton, string>> = {
  cross: '✕',
  circle: '○',
  square: '□',
  triangle: '△',
  l1: 'L1',
  r1: 'R1',
  l2: 'L2',
  r2: 'R2',
  share: 'Share',
  options: 'Options',
  l3: 'L3',
  r3: 'R3',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  ps: 'PS',
  touchpad: 'Touchpad',
};

/** How a pad button is written in prompts: the DualShock 4's own marks. */
export function padButtonLabel(button: PadButton): string {
  return BUTTON_LABELS[button];
}

/** The pad's display name: the browser's id without its vendor and product details. */
export function padName(id: string): string {
  return id.replace(/\s*\(.*$/, '').trim() || 'Controller';
}
