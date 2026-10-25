import { Button, STATS, usercmd, type UserCmd } from '@duty-shooter/fps-core';
import { actionFor, type Action, type Bindings, type InputCode } from './bindings';
import type { ViewAngles } from './look';

/** Whether a button acts while held or flips on each press. */
export type HoldMode = 'hold' | 'toggle';

export interface InputModes {
  readonly crouch: HoldMode;
  readonly ads: HoldMode;
}

export interface InputMapperOptions extends InputModes {
  readonly bindings: Bindings;
}

/**
 * Turns key and mouse-button presses into the usercmd for each tick, with
 * MW2019's keyboard behaviours:
 * - a sprint press keeps sprinting until forward is released; a double-tap
 *   (within the stats-file interval) starts a tactical sprint;
 * - crouch and ADS are held or toggled per the player's settings;
 * - prone toggles, and jump, crouch or sprint get up from it;
 * - jump gets up from prone or a toggled crouch without jumping.
 *
 * Times are in seconds on any monotonic clock.
 */
export class InputMapper {
  #bindings: Bindings;
  #modes: InputModes;
  readonly #held = new Set<Action>();
  #sprintLatched = false;
  #tacticalLatched = false;
  #lastSprintPress = -Infinity;
  #crouchToggled = false;
  #adsToggled = false;
  #prone = false;
  /** Jump stays suppressed until released after it was used to get up. */
  #jumpSuppressed = false;

  constructor(options: InputMapperOptions) {
    this.#bindings = options.bindings;
    this.#modes = { crouch: options.crouch, ads: options.ads };
  }

  configure(options: Partial<InputMapperOptions>): void {
    if (options.bindings) this.#bindings = options.bindings;
    this.#modes = { crouch: options.crouch ?? this.#modes.crouch, ads: options.ads ?? this.#modes.ads };
    this.releaseAll();
  }

  /** The action an input is bound to, so callers can swallow browser defaults for bound keys. */
  bound(code: InputCode): Action | null {
    return actionFor(this.#bindings, code);
  }

  press(code: InputCode, time: number): void {
    const action = actionFor(this.#bindings, code);
    if (!action || this.#held.has(action)) return; // unbound, or key repeat
    this.#held.add(action);
    switch (action) {
      case 'sprint':
        if (time - this.#lastSprintPress <= STATS.input.doubleTapWindow.value) {
          this.#tacticalLatched = true;
          this.#lastSprintPress = -Infinity;
        } else {
          this.#lastSprintPress = time;
        }
        this.#sprintLatched = true;
        this.#crouchToggled = false;
        this.#prone = false;
        break;
      case 'crouch':
        if (this.#modes.crouch === 'toggle') this.#crouchToggled = this.#prone || !this.#crouchToggled;
        this.#prone = false;
        break;
      case 'prone':
        this.#prone = !this.#prone;
        this.#crouchToggled = false;
        break;
      case 'jump':
        if (this.#prone || this.#crouchToggled) {
          this.#prone = false;
          this.#crouchToggled = false;
          this.#jumpSuppressed = true;
        }
        break;
      case 'ads':
        if (this.#modes.ads === 'toggle') this.#adsToggled = !this.#adsToggled;
        break;
      default:
        break;
    }
  }

  release(code: InputCode, _time: number): void {
    const action = actionFor(this.#bindings, code);
    if (!action) return;
    this.#held.delete(action);
    if (action === 'forward') this.#stopSprint();
    if (action === 'jump') this.#jumpSuppressed = false;
  }

  /** Drops every held input and latch, e.g. when the window loses focus or the game pauses. */
  releaseAll(): void {
    this.#held.clear();
    this.#stopSprint();
    this.#lastSprintPress = -Infinity;
    this.#jumpSuppressed = false;
  }

  /** The usercmd for the coming tick, carrying the latest view angles. */
  usercmd(view: ViewAngles): UserCmd {
    const h = (action: Action) => this.#held.has(action);
    const forward = Number(h('forward')) - Number(h('back'));
    const right = Number(h('right')) - Number(h('left'));
    if (forward <= 0) this.#stopSprint();

    let buttons = 0;
    const set = (on: boolean, bit: number) => {
      if (on) buttons |= bit;
    };
    set(this.#sprintLatched || h('sprint'), Button.Sprint);
    set(this.#tacticalLatched, Button.TacticalSprint);
    set(this.#modes.crouch === 'hold' ? h('crouch') : this.#crouchToggled, Button.Crouch);
    set(this.#prone, Button.Prone);
    set(h('jump') && !this.#jumpSuppressed, Button.Jump);
    set(this.#modes.ads === 'hold' ? h('ads') : this.#adsToggled, Button.Ads);
    set(h('fire'), Button.Fire);
    set(h('reload'), Button.Reload);
    set(h('melee'), Button.Melee);

    return usercmd({ forward, right, yaw: view.yaw, pitch: view.pitch, buttons });
  }

  #stopSprint(): void {
    this.#sprintLatched = false;
    this.#tacticalLatched = false;
  }
}
