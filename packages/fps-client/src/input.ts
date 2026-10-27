import { Button, MAX_PITCH, STATS, usercmd, type UserCmd } from '@duty-shooter/fps-core';
import { PAD, PAD_LAYOUTS, deadzone, readPad, type PadNav, type PadReading } from './gamepad';
import { adsSensitivityScale, radiansPerCount, stickTurnRate, type Action, type Settings } from './settings';

/** Mouse-wheel steps closer together than this (ms) count as one switch. */
const WHEEL_MS = 180;

/** Two sprint presses within this many milliseconds start a tactical sprint. */
const DOUBLE_TAP_MS = 300;
/** Pushing the move stick less than this far forward ends a controller sprint. */
const SPRINT_RELEASE_FORWARD = 0.5;
/** Stick travel that counts as a menu move, and the delay before a held move repeats (ms). */
const MENU_STICK = 0.6;
/** Stick travel that counts as using the controller, well past any drift. */
const PAD_ACTIVE_STICK = 0.35;
const MENU_REPEAT_MS = 220;

/**
 * Keyboard, mouse and controller input. Mouse look is applied on every mouse
 * event and stick look on every rendered frame (so the camera can use it
 * every frame); everything else is sampled into one usercmd per tick, with
 * fire presses timestamped inside the tick.
 *
 * Controller buttons are held and tapped under the codes `Pad0`..`Pad17`
 * (standard mapping indices), next to keyboard and mouse codes, and the
 * layout setting says which action each one does.
 */
export class InputController {
  #settings: Settings;
  readonly #element: HTMLElement;
  readonly #held = new Set<string>();
  /** Codes pressed since the last tick, so a press and release inside one tick is not lost. */
  readonly #tapped = new Set<string>();
  #yaw = 0;
  #pitch = 0;
  #firePresses: number[] = [];
  #lastSprintDown = -Infinity;
  #tactical = false;
  #crouchToggled = false;
  #proneToggled = false;
  #adsToggled = false;
  #aiming = false;
  /** The sight magnification while aiming, for the ADS sensitivity scale. */
  #zoom: number | undefined = undefined;
  /** The weapon slot in hand (0 primary, 1 secondary), so 1 and 2 only switch when they name the other one. */
  #slot = 0;
  /** A switch asked for since the last tick: sent as a one-tick press of the switch button. */
  #switch = false;
  #lastWheel = -Infinity;
  #rawInput = false;
  #enabled = false;
  /** Testing without pointer lock (automated browsers): input counts as captured whenever enabled. */
  lockFree = false;
  readonly #listeners: [EventTarget, string, EventListener][] = [];
  /** Called when the pointer lock is lost (e.g. Escape), or Options is pressed in game. */
  onUnlock: (() => void) | null = null;
  /** Menu navigation from the controller while input is disabled (menus open). */
  onPadMenu: ((nav: PadNav) => void) | null = null;
  /** The D-pad's left or right pressed in play (unbound there): the intermission's vote. */
  onPadVote: ((side: 'left' | 'right') => void) | null = null;
  /** The last reading's pressed buttons, for press and release edges. */
  #padPressed: readonly boolean[] = [];
  #padMove: { forward: number; right: number } = { forward: 0, right: 0 };
  /** A controller sprint lasts after the stick click while the move stick pushes forward, as in MW2019. */
  #padSprint = false;
  /** When the controller's crouch button went down (ms), while it is held and has not turned into prone. */
  #padCrouchSince: number | null = null;
  #padMenuNav: PadNav | null = null;
  #padMenuNext = 0;
  /** Playing on the controller: no pointer lock is needed, and the mouse cursor is hidden over the game. */
  #padMode = false;
  #padName: string | null = null;

  constructor(element: HTMLElement, settings: Settings) {
    this.#element = element;
    this.#settings = settings;
    const on = <K extends keyof DocumentEventMap>(target: EventTarget, type: K, fn: (e: DocumentEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener);
      this.#listeners.push([target, type, fn as EventListener]);
    };
    on(document, 'keydown', (e) => this.#down(e.code, e));
    on(document, 'keyup', (e) => this.#up(e.code));
    on(document, 'mousedown', (e) => this.#down(`Mouse${e.button}`, e));
    on(document, 'mouseup', (e) => this.#up(`Mouse${e.button}`));
    on(document, 'mousemove', (e) => this.#move(e));
    on(document, 'wheel', (e) => this.#wheel(e));
    on(document, 'contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    on(document, 'pointerlockchange', () => {
      // Losing the real pointer lock (Escape) opens the menu, controller or not.
      if (!this.#pointerLocked) {
        this.#held.clear();
        this.onUnlock?.();
      }
    });
    on(window, 'blur', () => this.#held.clear());
  }

  set settings(settings: Settings) {
    this.#settings = settings;
  }

  get locked(): boolean {
    return this.lockFree || this.#padMode || this.#pointerLocked;
  }

  get #pointerLocked(): boolean {
    return document.pointerLockElement === this.#element;
  }

  /** True while the controller is the input in use: entering the game then needs no pointer lock. */
  get padMode(): boolean {
    return this.#padMode;
  }

  /** The connected controller's name as the browser reports it, or null when none has been seen. */
  get padName(): string | null {
    return this.#padName;
  }

  /** True when the browser gave us raw (unaccelerated) pointer-lock input. */
  get rawInput(): boolean {
    return this.#rawInput;
  }

  /** Input is ignored unless enabled (menus open). */
  set enabled(on: boolean) {
    this.#enabled = on;
    if (!on) {
      this.#held.clear();
      this.#padSprint = false;
      this.#padCrouchSince = null;
    }
    this.#updateCursor();
  }

  /**
   * Requests pointer lock, asking for raw input (unadjustedMovement) where the
   * browser supports it. Resolves to whether raw input was granted.
   */
  async lock(): Promise<boolean> {
    if (this.lockFree) return false;
    try {
      const request = this.#element.requestPointerLock as (options?: { unadjustedMovement?: boolean }) => Promise<void> | void;
      await request.call(this.#element, { unadjustedMovement: true });
      this.#rawInput = true;
    } catch {
      // Firefox and some platforms reject unadjustedMovement: fall back to plain pointer lock.
      try {
        await this.#element.requestPointerLock();
      } catch {
        // Lock refused (e.g. no user gesture); the menu stays open.
      }
      this.#rawInput = false;
    }
    return this.#rawInput;
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** The view angles, updated on every mouse event: yaw (radians, 0 = -Z) and pitch. */
  get angles(): { yaw: number; pitch: number } {
    return { yaw: this.#yaw, pitch: this.#pitch };
  }

  setAngles(yaw: number, pitch: number): void {
    this.#yaw = yaw;
    this.#pitch = pitch;
  }

  /** Whether the local player is aiming, for the ADS sensitivity scale. Set from the simulation's ADS fraction. */
  set aiming(on: boolean) {
    this.#aiming = on;
  }

  /** The weapon in hand: its slot (for the number keys) and its sight's magnification (for the ADS sensitivity). */
  setWeapon(slot: number, zoom: number): void {
    this.#slot = slot;
    this.#zoom = zoom;
  }

  /** The controller code for an action under the current layout, if it has a button. */
  #padCode(action: Action): string | null {
    const button = PAD_LAYOUTS[this.#settings.padLayout][action];
    return button === undefined ? null : `Pad${PAD[button]}`;
  }

  #is(action: Action, code: string): boolean {
    return this.#settings.bindings[action] === code || this.#padCode(action) === code;
  }

  #pressed(action: Action): boolean {
    const codes = [this.#settings.bindings[action], this.#padCode(action)];
    return codes.some((c) => c !== null && (this.#held.has(c) || this.#tapped.has(c)));
  }

  #down(code: string, e?: Event): void {
    const fromPad = code.startsWith('Pad');
    if (!fromPad && this.#padMode) {
      // Keyboard and mouse are in use again: resuming takes the pointer.
      this.#setPadMode(false);
      // A key or click while playing on the controller without the pointer
      // hands over through the pause menu, which takes the pointer.
      if (this.#enabled && !this.lockFree && !this.#pointerLocked) {
        this.#held.clear();
        this.onUnlock?.();
        return;
      }
    }
    // Without pointer lock there is no lock to lose: Escape stands in for it.
    if (code === 'Escape' && this.lockFree && this.#enabled) {
      this.#held.clear();
      this.onUnlock?.();
      return;
    }
    if (!this.#enabled || !this.locked) return;
    if (code === 'Tab' || code === 'Space' || code.startsWith('Control') || code === 'KeyR' || code === 'KeyC' || code === 'KeyQ' || code === 'KeyG' || code === 'KeyF') e?.preventDefault();
    if (this.#held.has(code)) return; // key repeat
    this.#held.add(code);
    this.#tapped.add(code);
    const now = performance.now();
    if (this.#is('fire', code)) {
      this.#firePresses.push(now);
      this.#padSprint = false;
    }
    if (this.#is('sprint', code)) {
      this.#tactical = now - this.#lastSprintDown < DOUBLE_TAP_MS;
      this.#lastSprintDown = now;
      if (fromPad) this.#padSprint = true;
      // Sprinting stands you up.
      this.#crouchToggled = false;
      this.#proneToggled = false;
    }
    if (this.#is('crouch', code)) {
      if (this.#proneToggled) {
        this.#proneToggled = false;
        this.#crouchToggled = true;
      } else this.#crouchToggled = !this.#crouchToggled;
      // On the controller, holding crouch goes on to prone.
      if (fromPad) this.#padCrouchSince = now;
    }
    if (this.#is('prone', code)) {
      this.#proneToggled = !this.#proneToggled;
      this.#crouchToggled = false;
    }
    if (this.#is('jump', code) && (this.#proneToggled || this.#crouchToggled)) {
      // Jump stands up from crouch or prone first, as in MW2019.
      this.#proneToggled = false;
      this.#crouchToggled = false;
    }
    if (this.#is('ads', code)) {
      this.#adsToggled = !this.#adsToggled;
      this.#padSprint = false;
    }
    // The number keys pick a slot: a switch only when it's the other one.
    if (this.#is('switchWeapon', code) || (code === 'Digit1' && this.#slot !== 0) || (code === 'Digit2' && this.#slot !== 1)) this.#switch = true;
  }

  #wheel(e: WheelEvent): void {
    if (!this.#enabled || !this.locked || e.deltaY === 0) return;
    const now = performance.now();
    if (now - this.#lastWheel > WHEEL_MS) this.#switch = true;
    this.#lastWheel = now;
  }

  #up(code: string): void {
    this.#held.delete(code);
    const fromPad = code.startsWith('Pad');
    // A controller sprint is latched: it ends when the move stick stops pushing forward.
    if (this.#is('sprint', code) && !fromPad) this.#tactical = false;
    if (this.#is('crouch', code) && fromPad) this.#padCrouchSince = null;
  }

  #setPadMode(on: boolean): void {
    this.#padMode = on;
    this.#updateCursor();
  }

  #updateCursor(): void {
    this.#element.style.cursor = this.#padMode && this.#enabled ? 'none' : '';
  }

  /**
   * Reads the controller, once per rendered frame: button presses and
   * releases, the move stick, stick look (turned into view angles here, so
   * the camera turns smoothly at any frame rate), the crouch hold that goes
   * prone, and menu navigation while a menu is open.
   */
  poll(now: number, dt: number): void {
    const pad = readPad();
    if (!pad) {
      this.#padPressed.forEach((was, i) => was && this.#up(`Pad${i}`));
      this.#padPressed = [];
      this.#padMove = { forward: 0, right: 0 };
      this.#padSprint = false;
      this.#setPadMode(false);
      return;
    }
    this.#padName = pad.id;
    const dz = this.#settings.padDeadzone;
    const move = deadzone(pad.leftStick[0], pad.leftStick[1], dz);
    const look = deadzone(pad.rightStick[0], pad.rightStick[1], dz);
    // A button press or a deliberate stick push (not drift) makes the controller the input in use.
    const pressedAny = pad.pressed.some((p, i) => p && !this.#padPressed[i]);
    const pushed = Math.hypot(...pad.leftStick) > PAD_ACTIVE_STICK || Math.hypot(...pad.rightStick) > PAD_ACTIVE_STICK;
    if (pressedAny || pushed) this.#setPadMode(true);

    if (this.#enabled) this.#padGame(pad, now, dt, move, look);
    else this.#padMenu(pad, now);
    this.#padPressed = pad.pressed;
  }

  #padGame(pad: PadReading, now: number, dt: number, move: readonly [number, number], look: readonly [number, number]): void {
    let options = false;
    for (let i = 0; i < pad.pressed.length; i++) {
      const was = this.#padPressed[i] ?? false;
      if (pad.pressed[i] === was) continue;
      if (!pad.pressed[i]) this.#up(`Pad${i}`);
      else if (i === PAD.options) options = true;
      else if (i === PAD.left || i === PAD.right) this.onPadVote?.(i === PAD.left ? 'left' : 'right');
      else this.#down(`Pad${i}`);
    }
    if (options) {
      // Options opens the menu, as Escape does.
      this.#held.clear();
      this.onUnlock?.();
      return;
    }
    if (!this.locked) return;
    // Stick up reads negative.
    this.#padMove = { forward: -move[1], right: move[0] };
    if (this.#padSprint && -move[1] < SPRINT_RELEASE_FORWARD) {
      this.#padSprint = false;
      this.#tactical = false;
    }
    if (this.#padCrouchSince !== null && now - this.#padCrouchSince >= STATS.input.proneHoldTime.value * 1000) {
      this.#padCrouchSince = null;
      this.#proneToggled = true;
      this.#crouchToggled = false;
    }
    const [lx, ly] = look;
    if (lx === 0 && ly === 0) return;
    // The response curve: fine aim near the centre, full speed at the edge.
    const m = Math.hypot(lx, ly);
    const curve = Math.pow(m, STATS.input.stickResponseExponent.value) / m;
    const s = this.#settings;
    const scale = curve * dt * (this.#aiming ? adsSensitivityScale(s, s.padAdsMultiplier, this.#zoom) : 1);
    this.#yaw -= lx * stickTurnRate(s.padSensitivityX) * scale;
    const pitch = ly * stickTurnRate(s.padSensitivityY) * scale * (s.padInvertY ? -1 : 1);
    this.#pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.#pitch - pitch));
  }

  #padMenu(pad: PadReading, now: number): void {
    this.#padMove = { forward: 0, right: 0 };
    const pressed = (i: number) => (pad.pressed[i] ?? false) && !(this.#padPressed[i] ?? false);
    if (pressed(PAD.cross)) this.onPadMenu?.('accept');
    if (pressed(PAD.circle)) this.onPadMenu?.('back');
    if (pressed(PAD.options)) this.onPadMenu?.('start');
    // The D-pad or the left stick moves through the menu, repeating while held.
    const [x, y] = pad.leftStick;
    const held = (i: number) => pad.pressed[i] ?? false;
    let nav: PadNav | null = null;
    if (held(PAD.up) || y < -MENU_STICK) nav = 'up';
    else if (held(PAD.down) || y > MENU_STICK) nav = 'down';
    else if (held(PAD.left) || x < -MENU_STICK) nav = 'left';
    else if (held(PAD.right) || x > MENU_STICK) nav = 'right';
    if (nav !== this.#padMenuNav) {
      this.#padMenuNav = nav;
      this.#padMenuNext = now + MENU_REPEAT_MS * 2;
      if (nav) this.onPadMenu?.(nav);
    } else if (nav && now >= this.#padMenuNext) {
      this.#padMenuNext = now + MENU_REPEAT_MS;
      this.onPadMenu?.(nav);
    }
  }

  #move(e: MouseEvent): void {
    if (!this.#enabled || !this.locked) return;
    const scale = radiansPerCount(this.#settings) * (this.#aiming ? adsSensitivityScale(this.#settings, this.#settings.adsMultiplier, this.#zoom) : 1);
    this.#yaw -= e.movementX * scale;
    this.#pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.#pitch - e.movementY * scale));
  }

  /**
   * The usercmd for the tick covering real time [start, end) (performance.now
   * milliseconds): held buttons, movement axes, the latest view angles and the
   * fire presses inside the window as fractions of the tick.
   */
  sample(start: number, end: number): UserCmd {
    const active = this.#enabled && this.locked;
    const held = (a: Action) => active && this.#pressed(a);
    let buttons = 0;
    if (held('fire')) buttons |= Button.Fire;
    const ads = this.#settings.adsMode === 'toggle' ? this.#adsToggled : held('ads');
    if (active && ads) buttons |= Button.Ads;
    const sprint = held('sprint') || (active && this.#padSprint);
    if (sprint) buttons |= Button.Sprint;
    if (sprint && this.#tactical) buttons |= Button.TacticalSprint;
    const crouch = this.#settings.crouchMode === 'toggle' ? this.#crouchToggled : held('crouch');
    if (active && crouch) buttons |= Button.Crouch;
    if (active && this.#proneToggled) buttons |= Button.Prone;
    if (held('jump')) buttons |= Button.Jump;
    if (held('reload')) buttons |= Button.Reload;
    if (held('melee')) buttons |= Button.Melee;
    if (held('grenade')) buttons |= Button.Grenade;
    if (held('use')) buttons |= Button.Use;
    if (active && this.#switch) buttons |= Button.SwitchWeapon;
    this.#switch = false;

    const presses: number[] = [];
    const later: number[] = [];
    for (const t of this.#firePresses) {
      if (t >= end) later.push(t);
      else presses.push(Math.min(0.999, Math.max(0, (t - start) / (end - start))));
    }
    this.#firePresses = later;
    this.#tapped.clear();

    const axis = (v: number) => Math.max(-1, Math.min(1, v));
    const pad = active ? this.#padMove : { forward: 0, right: 0 };
    return usercmd({
      buttons,
      forward: axis((held('forward') ? 1 : 0) - (held('back') ? 1 : 0) + pad.forward),
      right: axis((held('right') ? 1 : 0) - (held('left') ? 1 : 0) + pad.right),
      yaw: this.#yaw,
      pitch: this.#pitch,
      firePresses: active ? presses : [],
    });
  }

  /** True while the scoreboard key is held. */
  get scoreboard(): boolean {
    const pad = this.#padCode('scoreboard');
    return this.#enabled && (this.#held.has(this.#settings.bindings.scoreboard) || (pad !== null && this.#held.has(pad)));
  }

  /** Captures the next key or mouse button (for rebinding). Resolves to its code, or null on Escape. */
  captureNext(): Promise<string | null> {
    return new Promise((resolve) => {
      const done = (code: string | null, e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener('keydown', key, true);
        document.removeEventListener('mousedown', mouse, true);
        resolve(code);
      };
      const key = (e: KeyboardEvent) => done(e.code === 'Escape' ? null : e.code, e);
      const mouse = (e: MouseEvent) => done(`Mouse${e.button}`, e);
      document.addEventListener('keydown', key, true);
      document.addEventListener('mousedown', mouse, true);
    });
  }

  dispose(): void {
    for (const [target, type, fn] of this.#listeners) target.removeEventListener(type, fn);
    this.#element.style.cursor = '';
  }
}

/** Firefox has no raw pointer lock; the game shows it a one-time tip about Windows pointer precision. */
export function isFirefox(): boolean {
  return typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
}
