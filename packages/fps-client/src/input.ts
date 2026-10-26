import { Button, MAX_PITCH, usercmd, type UserCmd } from '@duty-shooter/fps-core';
import { adsSensitivityScale, radiansPerCount, type Action, type Settings } from './settings';

/** Two sprint presses within this many milliseconds start a tactical sprint. */
const DOUBLE_TAP_MS = 300;

/**
 * Keyboard and mouse input. Mouse look is applied on every mouse event (so
 * the camera can use it every rendered frame); everything else is sampled
 * into one usercmd per tick, with fire presses timestamped inside the tick.
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
  #rawInput = false;
  #enabled = false;
  /** Testing without pointer lock (automated browsers): input counts as captured whenever enabled. */
  lockFree = false;
  readonly #listeners: [EventTarget, string, EventListener][] = [];
  /** Called when the pointer lock is lost (e.g. Escape). */
  onUnlock: (() => void) | null = null;

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
    on(document, 'contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    on(document, 'pointerlockchange', () => {
      if (!this.locked) {
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
    return this.lockFree || document.pointerLockElement === this.#element;
  }

  /** True when the browser gave us raw (unaccelerated) pointer-lock input. */
  get rawInput(): boolean {
    return this.#rawInput;
  }

  /** Input is ignored unless enabled (menus open). */
  set enabled(on: boolean) {
    this.#enabled = on;
    if (!on) this.#held.clear();
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

  #is(action: Action, code: string): boolean {
    return this.#settings.bindings[action] === code;
  }

  #pressed(action: Action): boolean {
    const code = this.#settings.bindings[action];
    return this.#held.has(code) || this.#tapped.has(code);
  }

  #down(code: string, e: Event): void {
    // Without pointer lock there is no lock to lose: Escape stands in for it.
    if (code === 'Escape' && this.lockFree && this.#enabled) {
      this.#held.clear();
      this.onUnlock?.();
      return;
    }
    if (!this.#enabled || !this.locked) return;
    if (code === 'Tab' || code === 'Space' || code.startsWith('Control') || code === 'KeyR' || code === 'KeyC') e.preventDefault();
    if (this.#held.has(code)) return; // key repeat
    this.#held.add(code);
    this.#tapped.add(code);
    const now = performance.now();
    if (this.#is('fire', code)) this.#firePresses.push(now);
    if (this.#is('sprint', code)) {
      this.#tactical = now - this.#lastSprintDown < DOUBLE_TAP_MS;
      this.#lastSprintDown = now;
      // Sprinting stands you up.
      this.#crouchToggled = false;
      this.#proneToggled = false;
    }
    if (this.#is('crouch', code)) {
      if (this.#proneToggled) {
        this.#proneToggled = false;
        this.#crouchToggled = true;
      } else this.#crouchToggled = !this.#crouchToggled;
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
    if (this.#is('ads', code)) this.#adsToggled = !this.#adsToggled;
  }

  #up(code: string): void {
    this.#held.delete(code);
    if (this.#is('sprint', code)) this.#tactical = false;
  }

  #move(e: MouseEvent): void {
    if (!this.#enabled || !this.locked) return;
    const scale = radiansPerCount(this.#settings) * (this.#aiming ? adsSensitivityScale(this.#settings) : 1);
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
    if (held('sprint')) buttons |= Button.Sprint;
    if (held('sprint') && this.#tactical) buttons |= Button.TacticalSprint;
    const crouch = this.#settings.crouchMode === 'toggle' ? this.#crouchToggled : held('crouch');
    if (active && crouch) buttons |= Button.Crouch;
    if (active && this.#proneToggled) buttons |= Button.Prone;
    if (held('jump')) buttons |= Button.Jump;
    if (held('reload')) buttons |= Button.Reload;
    if (held('melee')) buttons |= Button.Melee;

    const presses: number[] = [];
    const later: number[] = [];
    for (const t of this.#firePresses) {
      if (t >= end) later.push(t);
      else presses.push(Math.min(0.999, Math.max(0, (t - start) / (end - start))));
    }
    this.#firePresses = later;
    this.#tapped.clear();

    return usercmd({
      buttons,
      forward: (held('forward') ? 1 : 0) - (held('back') ? 1 : 0),
      right: (held('right') ? 1 : 0) - (held('left') ? 1 : 0),
      yaw: this.#yaw,
      pitch: this.#pitch,
      firePresses: active ? presses : [],
    });
  }

  /** True while the scoreboard key is held. */
  get scoreboard(): boolean {
    return this.#enabled && this.#held.has(this.#settings.bindings.scoreboard);
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
  }
}

/** Firefox has no raw pointer lock; the game shows it a one-time tip about Windows pointer precision. */
export function isFirefox(): boolean {
  return typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
}
