import { Button, CMD_PITCH_LIMIT, MAX_PITCH, STATS, usercmd, type PingKind, type UserCmd } from '@duty-shooter/fps-core';
import { PAD, PAD_KEPT_IN_PLAY, PAD_LAYOUTS, deadzone, readPad, type PadNav, type PadReading } from './gamepad';
import { adsSensitivityScale, radiansPerCount, stickTurnRate, type Action, type Settings } from './settings';
import { wheelPick } from './ui/pings';
import { TouchControls, fillScreen, type TouchContext, type TouchSink } from './touch/controls';
import { lookTurn } from './touch/logic';
import { inputSeen, installTouchMode, onTouchMode, touchMode } from './touch/mode';

/** What a spectator's presses ask for: the next or previous player, or the other view. */
export type SpectateInput = 'next' | 'prev' | 'view';

/** Mouse-wheel steps closer together than this (ms) count as one switch. */
const WHEEL_MS = 180;
/** Holding the ping key this long (ms) opens the ping wheel; a shorter press is a tap. */
const WHEEL_HOLD_MS = 250;

/** Pushing forward (key plus move stick) less than this far ends a sprint. */
const SPRINT_RELEASE_FORWARD = 0.5;
/** A sprint press made before forward is pushed waits this long (ms) for it, so Shift a frame before W still sprints. */
const SPRINT_ARM_MS = 300;
/** Stick travel that counts as a menu move, and the delay before a held move repeats (ms). */
const MENU_STICK = 0.6;
/** Stick travel that counts as using the controller, well past any drift. */
const PAD_ACTIVE_STICK = 0.35;
const MENU_REPEAT_MS = 220;

/**
 * The mouse pitch after moving it by `delta`, kept so the view (mouse pitch
 * plus the simulation's recoil and flinch, `offset`) stays inside the pitch
 * limits. Recoil a player has pulled down against stays in the offset, so
 * clamping the mouse pitch alone would leave the floor out of reach after a
 * spray held level: the limit counts the offset
 * instead, and the mouse pitch goes as far past straight down as the recoil
 * held against needs (see CMD_PITCH_LIMIT). It never pulls the pitch back,
 * only stops it moving further out.
 */
export function lookPitch(pitch: number, delta: number, offset: number): number {
  const low = Math.max(-CMD_PITCH_LIMIT, Math.min(pitch, -MAX_PITCH - offset));
  const high = Math.min(CMD_PITCH_LIMIT, Math.max(pitch, MAX_PITCH - offset));
  return Math.max(low, Math.min(high, pitch + delta));
}

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
  /** The simulation's recoil and flinch on top of the mouse pitch, for the pitch limits. */
  #pitchOffset = 0;
  #firePresses: number[] = [];
  /**
   * Sprint is a toggle, as MW2019's toggle sprint: a press of the sprint key
   * or stick click latches it, the next press while standing lets it go, and
   * it ends by itself when forward stops being pushed, or on firing or
   * aiming. A press made before forward is pushed waits SPRINT_ARM_MS for
   * it. A slide keeps the latch: with hold crouch, letting crouch go after
   * the slide runs on; with toggle crouch you stay crouched, and the next
   * sprint press stands you up into the sprint.
   */
  #sprint = false;
  /** When the latch was set (ms), and whether forward has been pushed since: until then it is only armed. */
  #sprintAt = 0;
  #sprintRunning = false;
  #crouchToggled = false;
  #proneToggled = false;
  #adsToggled = false;
  /** The island map is open (its key toggles it). */
  #mapOpen = false;
  /** When the ping key went down (ms), while it is held. */
  #pingSince: number | null = null;
  /** The push since the ping wheel opened: mouse travel (px), or the look stick's (x100). */
  #wheelPush: [number, number] = [0, 0];
  /** Pings asked for since the game last took them: a kind from the wheel, or null for a tap (whatever the crosshair is on). */
  #pings: (PingKind | null)[] = [];
  /** Presses a spectator acts on since the game last took them (ticket 32): Fire steps on, Aim back, Jump changes the view. */
  #spectate: SpectateInput[] = [];
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
  /** When the controller's crouch button went down (ms), while it is held and has not turned into prone. */
  #padCrouchSince: number | null = null;
  #padMenuNav: PadNav | null = null;
  #padMenuNext = 0;
  /** Playing on the controller: no pointer lock is needed, and the mouse cursor is hidden over the game. */
  #padMode = false;
  #padName: string | null = null;
  /**
   * Touch is the input in use (the last input was a touch): its controls
   * stand over the game and no pointer lock is needed, as on the controller.
   * Their buttons are held and tapped under the codes `Touch:<action>`, and
   * auto-fire's trigger under `Auto:fire`.
   */
  #touchMode = false;
  #touch: TouchControls | null = null;
  /** What a touch drag is scaled by: the aim slowdown over a target (1 = none). */
  #touchSlow = 1;
  /** Whether the stick was asking to run at the last tick, for the push that stands you up. */
  #touchRan = false;
  /** What the touch controls drive: their buttons become held codes and their drags the view angles, as every other input's do. */
  readonly touchSink: TouchSink = {
    press: (action) => this.#down(`Touch:${action}`),
    release: (action) => this.#up(`Touch:${action}`),
    look: (dx, dy, dtMs) => this.#touchLook(dx, dy, dtMs),
    wheel: (dx, dy) => {
      if (this.#pingSince !== null) this.#wheelPush = [this.#wheelPush[0] + dx, this.#wheelPush[1] + dy];
    },
    pause: () => {
      this.#held.clear();
      this.onUnlock?.();
    },
  };
  readonly #offTouch: () => void;

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
      // Losing the real pointer lock (Escape) opens the menu, controller or not; a touch that took over just lets it go.
      if (!this.#pointerLocked && !this.#touchMode) {
        this.#held.clear();
        this.onUnlock?.();
      }
    });
    on(window, 'blur', () => {
      this.#held.clear();
      this.#pingSince = null;
    });
    installTouchMode();
    this.#touchMode = touchMode();
    this.#offTouch = onTouchMode((touch) => this.#setTouchMode(touch));
  }

  set settings(settings: Settings) {
    this.#settings = settings;
  }

  get locked(): boolean {
    return this.lockFree || this.#padMode || this.#touchMode || this.#pointerLocked;
  }

  get #pointerLocked(): boolean {
    return document.pointerLockElement === this.#element;
  }

  /** True while the controller is the input in use: entering the game then needs no pointer lock. */
  get padMode(): boolean {
    return this.#padMode;
  }

  /** The Fire control under a thumb: the player's own pull, not auto-fire's. */
  get touchFiring(): boolean {
    return this.#held.has('Touch:fire');
  }

  /** True while touch is the input in use: entering the game needs no pointer lock, and prompts name its buttons. */
  get touchMode(): boolean {
    return this.#touchMode;
  }

  /** What the game is doing, for which touch controls show. */
  set touchContext(ctx: TouchContext) {
    this.#touch?.context(ctx);
  }

  /**
   * Touch's two helps, worked out by the game each frame: how much a drag
   * slows over a target (1 = not at all), and auto-fire's trigger (held for
   * a full-auto weapon, pressed once per shot for the others). Both stay on
   * this side of the usercmd: what is sent is a view angle and the fire
   * button, as from any other input.
   */
  touchAssist(slow: number, hold: boolean, press: boolean): void {
    this.#touchSlow = slow;
    const held = this.#held.has('Auto:fire');
    if (hold && !held) this.#down('Auto:fire');
    else if (!hold && held) this.#up('Auto:fire');
    if (press && !hold) {
      this.#down('Auto:fire');
      this.#up('Auto:fire');
    }
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
      this.#sprint = false;
      this.#padCrouchSince = null;
      this.#pingSince = null;
    }
    this.#syncTouch();
    this.#updateCursor();
  }

  /**
   * Requests pointer lock, asking for raw input (unadjustedMovement) where the
   * browser supports it. Resolves to whether raw input was granted.
   */
  async lock(): Promise<boolean> {
    if (this.lockFree) return false;
    if (this.#touchMode) {
      // No pointer to lock; the press that starts play asks a phone for the whole screen, on its side.
      fillScreen();
      return false;
    }
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

  /** Lets go of a latched sprint: on death and on a (re)spawn, so a new life starts walking. */
  endSprint(): void {
    this.#sprint = false;
  }

  /** The simulation's view pitch minus the usercmd pitch (recoil and flinch), so looking down still reaches the floor. */
  set pitchOffset(offset: number) {
    this.#pitchOffset = offset;
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
    return this.#settings.bindings[action] === code || this.#padCode(action) === code || code === `Touch:${action}` || (action === 'fire' && code === 'Auto:fire');
  }

  #pressed(action: Action): boolean {
    const codes = [this.#settings.bindings[action], this.#padCode(action), `Touch:${action}`, action === 'fire' ? 'Auto:fire' : null];
    return codes.some((c) => c !== null && (this.#held.has(c) || this.#tapped.has(c)));
  }

  #down(code: string, e?: Event): void {
    const fromPad = code.startsWith('Pad');
    const fromTouch = code.startsWith('Touch:') || code === 'Auto:fire';
    // The browser's own late mouse click for a tap is not a mouse: a real one has already ended touch mode.
    if (this.#touchMode && code.startsWith('Mouse')) return;
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
    // Mouse1 (the wheel button) would start the browser's autoscroll.
    if (code === 'Tab' || code === 'Space' || code.startsWith('Control') || code === 'KeyR' || code === 'KeyC' || code === 'KeyQ' || code === 'KeyG' || code === 'KeyE' || code === 'KeyF' || code === 'Mouse1') e?.preventDefault();
    if (this.#held.has(code)) return; // key repeat
    this.#held.add(code);
    this.#tapped.add(code);
    const now = performance.now();
    if (this.#is('fire', code) && code !== 'Auto:fire') this.#spectate.push('next');
    if (this.#is('ads', code)) this.#spectate.push('prev');
    if (this.#is('jump', code)) this.#spectate.push('view');
    if (this.#is('fire', code)) {
      this.#firePresses.push(now);
      this.#sprint = false;
    }
    if (this.#is('sprint', code)) {
      // A press while latched and standing lets go; from crouch or prone it stands you up and sprints.
      const down = this.#proneToggled || (this.#settings.crouchMode === 'toggle' ? this.#crouchToggled : this.#pressed('crouch'));
      this.#sprint = !this.#sprint || down;
      if (this.#sprint) {
        this.#sprintAt = now;
        this.#sprintRunning = false;
        this.#crouchToggled = false;
        this.#proneToggled = false;
        // Sprinting lowers toggled sights, as a shot or aiming ends the sprint.
        this.#adsToggled = false;
      }
    }
    if (this.#is('crouch', code)) {
      if (this.#proneToggled) {
        this.#proneToggled = false;
        this.#crouchToggled = true;
      } else this.#crouchToggled = !this.#crouchToggled;
      // On the controller and on touch, holding crouch goes on to prone.
      if (fromPad || fromTouch) this.#padCrouchSince = now;
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
    if (this.#is('map', code)) this.#mapOpen = !this.#mapOpen;
    if (this.#is('ping', code)) {
      this.#pingSince = now;
      this.#wheelPush = [0, 0];
    }
    if (this.#is('ads', code)) {
      this.#adsToggled = !this.#adsToggled;
      this.#sprint = false;
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
    if (this.#is('ping', code) && this.#pingSince !== null) {
      // A tap marks what the crosshair is on; a hold opens the wheel, and letting go picks where it was pushed (or nothing, unpushed).
      if (performance.now() - this.#pingSince < WHEEL_HOLD_MS) this.#pings.push(null);
      else {
        const kind = wheelPick(this.#wheelPush[0], this.#wheelPush[1]);
        if (kind) this.#pings.push(kind);
      }
      this.#pingSince = null;
    }
    const fromPad = code.startsWith('Pad') || code.startsWith('Touch:');
    if (this.#is('crouch', code) && fromPad) this.#padCrouchSince = null;
  }

  /** Touch became, or stopped being, the input in use. */
  #setTouchMode(on: boolean): void {
    if (on === this.#touchMode) return;
    this.#touchMode = on;
    // Nothing held, tapped or half fired crosses from one input to the other.
    this.#held.clear();
    this.#tapped.clear();
    this.#firePresses = [];
    this.#pingSince = null;
    this.#touchSlow = 1;
    // Each press toggles the sights whatever the mode; touch reads the toggle, so it starts lowered.
    this.#adsToggled = false;
    if (on) {
      this.#setPadMode(false);
      // The pointer lock is the mouse's: touch plays without it.
      if (this.#pointerLocked) document.exitPointerLock();
    } else if (this.#enabled && !this.lockFree && !this.#padMode && !this.#pointerLocked) {
      // Keyboard and mouse are in use again: they hand over through the pause menu, which takes the pointer.
      this.onUnlock?.();
    }
    this.#syncTouch();
  }

  /** The touch controls stand over the game while touch is in use and the game takes input; built on first need. */
  #syncTouch(): void {
    const on = this.#touchMode && this.#enabled;
    if (on && !this.#touch && typeof document.createElement === 'function') this.#touch = new TouchControls(document.body, this.touchSink);
    if (this.#touch) this.#touch.shown = on;
  }

  /** A drag on the look area: the view turns with it, faster for a flick, slower in the sights and over a target. */
  #touchLook(dx: number, dy: number, dtMs: number): void {
    if (!this.#enabled || !this.locked || this.#wheelOpen) return;
    const s = this.#settings;
    const scale = (this.#aiming ? adsSensitivityScale(s, s.touchAdsMultiplier, this.#zoom) : 1) * this.#touchSlow;
    const turn = lookTurn(dx, dy, dtMs, s.touchSensitivity, scale);
    this.#yaw += turn.yaw;
    this.#pitch = lookPitch(this.#pitch, turn.pitch, this.#pitchOffset);
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
    if (this.#touchMode && this.#enabled) {
      // Holding the crouch button goes on to prone, as on the controller.
      if (this.#padCrouchSince !== null && now - this.#padCrouchSince >= STATS.input.proneHoldTime.value * 1000) {
        this.#padCrouchSince = null;
        this.#proneToggled = true;
        this.#crouchToggled = false;
      }
      this.#touch?.lit({ ads: this.#adsToggled, crouch: this.#crouchToggled, prone: this.#proneToggled });
    }
    const pad = readPad();
    if (!pad) {
      this.#padPressed.forEach((was, i) => was && this.#up(`Pad${i}`));
      this.#padPressed = [];
      this.#padMove = { forward: 0, right: 0 };
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
    if (pressedAny || pushed) {
      this.#setPadMode(true);
      inputSeen({ kind: 'pad' });
    }

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
      else if (PAD_KEPT_IN_PLAY.includes(i)) this.onPadVote?.(i === PAD.left ? 'left' : 'right');
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
    if (this.#padCrouchSince !== null && now - this.#padCrouchSince >= STATS.input.proneHoldTime.value * 1000) {
      this.#padCrouchSince = null;
      this.#proneToggled = true;
      this.#crouchToggled = false;
    }
    const [lx, ly] = look;
    if (this.#wheelOpen) {
      // The look stick picks on the wheel, where it is pushed now.
      if (lx !== 0 || ly !== 0) this.#wheelPush = [lx * 100, ly * 100];
      return;
    }
    if (lx === 0 && ly === 0) return;
    // The response curve: fine aim near the centre, full speed at the edge.
    const m = Math.hypot(lx, ly);
    const curve = Math.pow(m, STATS.input.stickResponseExponent.value) / m;
    const s = this.#settings;
    const scale = curve * dt * (this.#aiming ? adsSensitivityScale(s, s.padAdsMultiplier, this.#zoom) : 1);
    this.#yaw -= lx * stickTurnRate(s.padSensitivityX) * scale;
    const pitch = ly * stickTurnRate(s.padSensitivityY) * scale * (s.padInvertY ? -1 : 1);
    this.#pitch = lookPitch(this.#pitch, -pitch, this.#pitchOffset);
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
    // The wheel open, the mouse picks on it instead of turning the view.
    if (this.#wheelOpen) {
      this.#wheelPush = [this.#wheelPush[0] + e.movementX, this.#wheelPush[1] + e.movementY];
      return;
    }
    const scale = radiansPerCount(this.#settings) * (this.#aiming ? adsSensitivityScale(this.#settings, this.#settings.adsMultiplier, this.#zoom) : 1);
    this.#yaw -= e.movementX * scale;
    this.#pitch = lookPitch(this.#pitch, -e.movementY * scale * (this.#settings.invertY ? -1 : 1), this.#pitchOffset);
  }

  /**
   * The usercmd for the tick covering real time [start, end) (performance.now
   * milliseconds): held buttons, movement axes, the latest view angles and the
   * fire presses inside the window as fractions of the tick.
   */
  sample(start: number, end: number): UserCmd {
    const active = this.#enabled && this.locked;
    const held = (a: Action) => active && this.#pressed(a);
    const axis = (v: number) => Math.max(-1, Math.min(1, v));
    const pad = active ? this.#padMove : { forward: 0, right: 0 };
    const stick = active && this.#touch ? this.#touch.move : { forward: 0, right: 0, sprint: false };
    const forward = axis((held('forward') ? 1 : 0) - (held('back') ? 1 : 0) + pad.forward + stick.forward);
    let buttons = 0;
    const firing = held('fire');
    if (firing) buttons |= Button.Fire;
    // On touch the sights and the crouch are toggles whatever the setting: a thumb cannot hold one and aim.
    const toggles = this.#touchMode;
    const ads = active && (this.#settings.adsMode === 'toggle' || toggles ? this.#adsToggled : held('ads'));
    if (ads) buttons |= Button.Ads;
    // The latch ends with forward let go (once it has been pushed, or the arming wait is over), a shot or the sights raised.
    const pushed = forward >= SPRINT_RELEASE_FORWARD;
    // Hold sprint: the run lasts as long as the key does.
    if (this.#settings.sprintMode === 'hold' && !this.#pressed('sprint')) this.#sprint = false;
    if (this.#sprint && pushed) this.#sprintRunning = true;
    const armed = !this.#sprintRunning && start - this.#sprintAt < SPRINT_ARM_MS;
    if (!active || (!pushed && !armed) || firing || ads) this.#sprint = false;
    // The stick pushed all the way forward (or its sprint lock) runs, and the push that starts a run stands you up.
    const run = stick.sprint && pushed && !firing && !ads;
    if (run && !this.#touchRan) {
      this.#crouchToggled = false;
      this.#proneToggled = false;
    }
    this.#touchRan = run;
    if ((this.#sprint && pushed) || run) buttons |= Button.Sprint;
    const crouch = this.#settings.crouchMode === 'toggle' || toggles ? this.#crouchToggled : held('crouch');
    if (active && crouch) buttons |= Button.Crouch;
    if (active && this.#proneToggled) buttons |= Button.Prone;
    if (held('jump')) buttons |= Button.Jump;
    if (held('reload')) buttons |= Button.Reload;
    if (held('melee')) buttons |= Button.Melee;
    if (held('grenade')) buttons |= Button.Grenade;
    if (held('tactical')) buttons |= Button.Tactical;
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

    return usercmd({
      buttons,
      forward,
      right: axis((held('right') ? 1 : 0) - (held('left') ? 1 : 0) + pad.right + stick.right),
      yaw: this.#yaw,
      pitch: this.#pitch,
      firePresses: active ? presses : [],
    });
  }

  /** The spectator's presses since the last call, oldest first; taken every frame, so none wait for a later spectating. */
  takeSpectate(): SpectateInput[] {
    const taken = this.#spectate;
    this.#spectate = [];
    return taken;
  }

  get #wheelOpen(): boolean {
    return this.#pingSince !== null && performance.now() - this.#pingSince >= WHEEL_HOLD_MS;
  }

  /** The ping wheel while it is open, with what it would pick now; null while closed. */
  get pingWheel(): { readonly pick: PingKind | null } | null {
    return this.#enabled && this.#wheelOpen ? { pick: wheelPick(this.#wheelPush[0], this.#wheelPush[1]) } : null;
  }

  /** The pings asked for since the last call, oldest first: a kind from the wheel, or null for a tap. */
  takePings(): (PingKind | null)[] {
    const taken = this.#pings;
    this.#pings = [];
    return taken;
  }

  /** Whether the island map is open: its key opens and closes it, and it closes with the game's input (pausing). */
  get mapOpen(): boolean {
    return this.#enabled && this.#mapOpen;
  }

  set mapOpen(on: boolean) {
    this.#mapOpen = on;
  }

  /** True while the scoreboard key is held. */
  get scoreboard(): boolean {
    const pad = this.#padCode('scoreboard');
    return this.#enabled && (this.#held.has(this.#settings.bindings.scoreboard) || (pad !== null && this.#held.has(pad)) || this.#touch?.scoreboard === true);
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
    this.#offTouch();
    this.#touch?.dispose();
    this.#element.style.cursor = '';
  }
}

/** Firefox has no raw pointer lock; the game shows it a one-time tip about Windows pointer precision. */
export function isFirefox(): boolean {
  return typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
}
