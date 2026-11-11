import type { Action } from '../settings';
import { PointerBook, STICK_RADIUS, readStick, type StickRead } from './logic';

/**
 * The touch controls drawn over the game: a move stick that appears under
 * the left thumb, a look area under the right, and a button for everything a
 * key does. Each control follows the one finger that pressed it (Pointer
 * Events, by pointer id), so a third finger landing anywhere changes nothing.
 *
 * It knows nothing of the game: presses and drags go out through a
 * `TouchSink`, which the input controller turns into the same held codes and
 * view angles the keyboard, mouse and controller feed.
 */

/** What the controls ask of the input controller. */
export interface TouchSink {
  /** A button went down, or came up. */
  press(action: Action): void;
  release(action: Action): void;
  /** A drag that turns the view: CSS px moved over `dtMs`. */
  look(dx: number, dy: number, dtMs: number): void;
  /** A drag on the held ping button: the push on the ping wheel. */
  wheel(dx: number, dy: number): void;
  /** The pause button. */
  pause(): void;
}

/** What the game is doing, as far as it changes which controls show. */
export interface TouchContext {
  /** Fighting; out of the fight with someone to watch; waiting to respawn; or the match over (nothing to control). */
  readonly state: 'fight' | 'spectate' | 'wait' | 'over';
  /** There is something for Use to do here (a loadout to change, a Revive, a crate). */
  readonly use: boolean;
  /** There is a scoreboard to open (a match with scores). */
  readonly board: boolean;
  /** Pings can be placed (a team or Squad to see them). */
  readonly ping: boolean;
  /** The island map exists (a Battle Royale), and whether it is open. */
  readonly map: boolean;
  readonly mapOpen: boolean;
  /** Grenades in hand: none dims the button. */
  readonly grenades: number;
  /** The tactical carried and how many are left (ticket 20): none carried hides its button, none left dims it. */
  readonly tactical?: 'smoke' | 'flash' | null;
  readonly tacticals?: number;
}

/** Which toggles are on, for the buttons that light. */
export interface TouchLit {
  readonly ads: boolean;
  readonly crouch: boolean;
  readonly prone: boolean;
}

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** The glyph on each control, and beside its name wherever a hint or the Controls list speaks of it. */
export const TOUCH_GLYPHS = {
  fire: svg('<path d="M12 3c2.3 2.5 3 4.7 3 7v9H9v-9c0-2.3.7-4.5 3-7z"/><path d="M9 15h6"/>'),
  ads: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>'),
  jump: svg('<path d="M6 13l6-7 6 7"/><path d="M5 19h14"/>'),
  crouch: svg('<path d="M6 7l6 7 6-7"/><path d="M5 19h14"/>'),
  reload: svg('<path d="M19 12a7 7 0 1 1-2.6-5.4"/><path d="M19 4v4.5h-4.5"/>'),
  switchWeapon: svg('<path d="M4 8h14l-3-3M20 16H6l3 3"/>'),
  grenade: svg('<circle cx="12" cy="14.5" r="5.5"/><path d="M10 9V5.5h4V9M14 5.5h3.5V9"/>'),
  tactical: svg('<rect x="9" y="10" width="6" height="10" rx="1"/><path d="M9 13h6M11 10V8h2v2"/><path d="M13 6.5c0-1.5 1.5-2.5 3-2 1-1.5 4-1 4 1.2"/>'),
  melee: svg('<path d="M4 20l3.5-3.5M6 15l2.5 2.5M8 16.5L19 4c.6 3.6-.4 6.6-3 9.2l-5.5 5.3z"/>'),
  ping: svg('<path d="M12 21s-6-6.3-6-11a6 6 0 0 1 12 0c0 4.7-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>'),
  scoreboard: svg('<path d="M4 6h16M4 12h16M4 18h16M9 6v12"/>'),
  pause: svg('<path d="M9 5v14M15 5v14"/>'),
  map: svg('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  prev: svg('<path d="M14.5 6l-6 6 6 6"/>'),
  next: svg('<path d="M9.5 6l6 6-6 6"/>'),
  view: svg('<path d="M2 12s4-6.5 10-6.5S22 12 22 12s-4 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>'),
  stick: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>'),
  drag: svg('<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>'),
} as const;

export type TouchGlyph = keyof typeof TOUCH_GLYPHS;

/** What each control is called, for its accessible name and the Controls list. */
const TOUCH_NAMES: Readonly<Record<string, string>> = {
  fire: 'Fire',
  ads: 'Aim',
  jump: 'Jump',
  crouch: 'Crouch',
  reload: 'Reload',
  switchWeapon: 'Swap weapon',
  grenade: 'Grenade',
  tactical: 'Tactical',
  melee: 'Melee',
  use: 'Use',
  ping: 'Ping',
  scoreboard: 'Scoreboard',
  pause: 'Pause',
  map: 'Map',
  prev: 'Previous player',
  next: 'Next player',
  view: 'Change view',
};

/**
 * The layout, landscape: the right thumb rests on Fire with Aim, Jump and
 * Crouch a short roll away and the rest one reach further; the left thumb
 * has the whole lower left for the stick; Pause, the scoreboard and the map
 * stand in a column at the top left, Ping at the top right. Every target is
 * 48 px or more (44 is the floor) with 8 px or more between neighbours, and
 * every offset counts from the safe area.
 */
export const TOUCH_CSS = `
.ds-tc { position: fixed; inset: 0; z-index: 6; display: none; pointer-events: none; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; text-shadow: none; }
.ds-tc.on { display: block; }
.ds-tc .zone { position: absolute; pointer-events: auto; touch-action: none; }
.ds-tc .zone.look { inset: 0; }
/* The stick's ground stops short of the screen's middle, where the health and ammo stand. */
.ds-tc .zone.stick { left: 0; bottom: 0; width: 36%; height: 70%; }
/* The Use prompt in the middle of the screen reads as a button, so it is one: a tap on it is a press of Use. */
.ds-tc .zone.prompt { left: 50%; top: calc(58% - 9px); width: min(260px, 36vw); height: 48px; transform: translateX(-50%); }
.ds-tc .zone.prompt[hidden] { display: none; }
.ds-tc[data-state="over"] .zone, .ds-tc.mapped .zone, .ds-tc.boarded .zone { display: none; }
.ds-tc .tb { position: absolute; display: none; align-items: center; justify-content: center; width: 48px; height: 48px; padding: 0; border: 1.5px solid var(--ds-touch-line); border-radius: 50%; background: var(--ds-touch-fill); color: var(--ds-text); pointer-events: auto; touch-action: none; font-size: var(--ds-type-small); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.ds-tc .tb svg { pointer-events: none; }
.ds-tc .tb.down { background: var(--ds-touch-press); border-color: var(--ds-text); }
.ds-tc .tb.lit { border-color: var(--ds-signal); color: var(--ds-signal); }
.ds-tc .tb.none { opacity: 0.45; }
.ds-tc .tb.top { display: flex; width: 44px; height: 44px; }
.ds-tc .tb[hidden] { display: none; }
.ds-tc[data-state="fight"] .tb.f:not([hidden]), .ds-tc[data-state="spectate"] .tb.s:not([hidden]), .ds-tc:not([data-state="over"]) .tb.u:not([hidden]) { display: flex; }
.ds-tc.mapped .tb.f, .ds-tc.mapped .tb.s, .ds-tc.mapped .tb.u { display: none; }
/* The scoreboard open: it has the screen, and a finger on it scrolls it. Only its own button and Pause stay. */
.ds-tc.boarded .tb.f, .ds-tc.boarded .tb.s, .ds-tc.boarded .tb.u, .ds-tc.boarded .tb.ping, .ds-tc.boarded .tb.map, .ds-tc.boarded .stickui { display: none; }
.ds-tc .pause { left: calc(var(--ds-safe-l) + 12px); top: calc(var(--ds-safe-t) + 8px); }
.ds-tc .scoreboard { left: calc(var(--ds-safe-l) + 12px); top: calc(var(--ds-safe-t) + 60px); }
.ds-tc .map { left: calc(var(--ds-safe-l) + 12px); top: calc(var(--ds-safe-t) + 112px); }
.ds-tc .ping { right: calc(var(--ds-safe-r) + 12px); top: calc(var(--ds-safe-t) + 8px); }
.ds-tc .fire { width: 76px; height: 76px; right: calc(var(--ds-safe-r) + 20px); bottom: calc(var(--ds-safe-b) + 76px); border-color: var(--ds-text-2); }
.ds-tc .fire svg { width: 32px; height: 32px; }
.ds-tc .jump { width: 52px; height: 52px; right: calc(var(--ds-safe-r) + 16px); bottom: calc(var(--ds-safe-b) + 164px); }
.ds-tc .crouch { width: 52px; height: 52px; right: calc(var(--ds-safe-r) + 24px); bottom: calc(var(--ds-safe-b) + 12px); }
.ds-tc .ads { width: 60px; height: 60px; right: calc(var(--ds-safe-r) + 108px); bottom: calc(var(--ds-safe-b) + 28px); }
.ds-tc .reload { right: calc(var(--ds-safe-r) + 112px); bottom: calc(var(--ds-safe-b) + 104px); }
.ds-tc .switchWeapon { right: calc(var(--ds-safe-r) + 84px); bottom: calc(var(--ds-safe-b) + 168px); }
.ds-tc .grenade { right: calc(var(--ds-safe-r) + 180px); bottom: calc(var(--ds-safe-b) + 72px); }
.ds-tc .tactical { right: calc(var(--ds-safe-r) + 156px); bottom: calc(var(--ds-safe-b) + 212px); }
.ds-tc .melee { right: calc(var(--ds-safe-r) + 184px); bottom: calc(var(--ds-safe-b) + 12px); }
.ds-tc .use { width: 60px; height: 60px; right: calc(var(--ds-safe-r) + 176px); bottom: calc(var(--ds-safe-b) + 136px); border-color: var(--ds-signal); color: var(--ds-signal); }
.ds-tc .prev { width: 56px; height: 56px; right: calc(var(--ds-safe-r) + 148px); bottom: calc(var(--ds-safe-b) + 20px); }
.ds-tc .next { width: 56px; height: 56px; right: calc(var(--ds-safe-r) + 84px); bottom: calc(var(--ds-safe-b) + 20px); }
.ds-tc .view { width: 56px; height: 56px; right: calc(var(--ds-safe-r) + 20px); bottom: calc(var(--ds-safe-b) + 20px); }
/* The stick: a ring where the thumb landed, the knob under it, and the sprint lock's mark over the top of its travel. */
.ds-tc .stickui { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0.4; transition: opacity 120ms linear; }
.ds-tc[data-state="over"] .stickui, .ds-tc[data-state="spectate"] .stickui, .ds-tc.mapped .stickui { display: none; }
.ds-tc .stickui.held { opacity: 1; }
.ds-tc .stickui .ring { position: absolute; left: -${STICK_RADIUS}px; top: -${STICK_RADIUS}px; width: ${STICK_RADIUS * 2}px; height: ${STICK_RADIUS * 2}px; border: 1.5px solid var(--ds-touch-line); border-radius: 50%; background: var(--ds-touch-fill); }
.ds-tc .stickui .knob { position: absolute; left: -24px; top: -24px; width: 48px; height: 48px; border-radius: 50%; background: var(--ds-touch-knob); will-change: transform; }
.ds-tc .stickui .run { position: absolute; left: -22px; top: -${Math.round(STICK_RADIUS * 1.7) + 22}px; width: 44px; height: 22px; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--ds-touch-line); background: var(--ds-touch-fill); color: var(--ds-text-2); font-size: var(--ds-type-small); font-weight: 700; letter-spacing: 0.08em; visibility: hidden; }
.ds-tc .stickui.held .run, .ds-tc .stickui.locked .run { visibility: visible; }
.ds-tc .stickui.sprint .knob { background: var(--ds-text); }
.ds-tc .stickui.lock .run, .ds-tc .stickui.locked .run { border-color: var(--ds-signal); color: var(--ds-signal); }
.ds-tc .stickui.locked { opacity: 0.85; }
/* Portrait: the game plays in landscape, and says so plainly instead of offering controls that cannot work. */
.ds-tc .turn { position: absolute; inset: 0; display: none; flex-direction: column; justify-content: flex-end; gap: 10px; padding: calc(var(--ds-safe-t) + 24px) calc(var(--ds-safe-r) + 20px) calc(var(--ds-safe-b) + 28px) calc(var(--ds-safe-l) + 20px); background: var(--ds-ink); pointer-events: auto; }
.ds-tc .turn h2 { margin: 0; font-size: var(--ds-type-title); line-height: 0.95; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
.ds-tc .turn p { margin: 0 0 10px; max-width: 34ch; font-size: var(--ds-type-body); line-height: 1.4; color: var(--ds-text-2); }
.ds-tc .turn .ds-btn { align-self: flex-start; }
@media (orientation: portrait) {
  .ds-tc .turn { display: flex; }
  .ds-tc .zone, .ds-tc .tb, .ds-tc .stickui { display: none !important; }
}
`;

const FIGHT: readonly Action[] = ['fire', 'ads', 'jump', 'crouch', 'reload', 'switchWeapon', 'grenade', 'tactical', 'melee'];

type Control = string;

/** Where the stick rests while no thumb is on it (px from the left and bottom of its zone). */
const STICK_REST = { x: 104, y: 104 } as const;

export class TouchControls {
  readonly root: HTMLDivElement;
  readonly #sink: TouchSink;
  readonly #book = new PointerBook<Control>();
  readonly #buttons = new Map<string, HTMLButtonElement>();
  readonly #stickZone: HTMLElement;
  readonly #stickUi: HTMLElement;
  readonly #knob: HTMLElement;
  /** Where the stick's thumb landed and where it is now (client px), while it is held. */
  #stick: { ox: number; oy: number; x: number; y: number } | null = null;
  #read: StickRead | null = null;
  /** The sprint lock: the stick was let go past the top of its travel, and the run goes on without a thumb. */
  #sprintLocked = false;
  /** Each looking finger's last position and time. */
  readonly #last = new Map<number, { x: number; y: number; t: number }>();
  #board = false;
  #shown = false;
  #ctx: TouchContext | null = null;
  #lit: TouchLit = { ads: false, crouch: false, prone: false };
  readonly #off: (() => void)[] = [];

  constructor(parent: HTMLElement, sink: TouchSink) {
    this.#sink = sink;
    if (!document.getElementById('ds-touch-css')) {
      const style = document.createElement('style');
      style.id = 'ds-touch-css';
      style.textContent = TOUCH_CSS;
      document.head.append(style);
    }
    const root = (this.root = document.createElement('div'));
    root.className = 'ds-tc ds-ui';
    root.dataset['state'] = 'fight';
    const button = (control: string, cls: string, body: string) => `<button type="button" class="tb ${control} ${cls}" data-c="${control}" aria-label="${TOUCH_NAMES[control] ?? control}">${body}</button>`;
    const glyph = (name: TouchGlyph) => TOUCH_GLYPHS[name];
    root.innerHTML =
      `<div class="zone look" data-c="look"></div><div class="zone stick" data-c="stick"></div><div class="zone prompt" data-c="use" hidden></div>` +
      `<div class="stickui"><i class="ring"></i><i class="run">Run</i><i class="knob"></i></div>` +
      FIGHT.map((a) => button(a, 'f', glyph(a as TouchGlyph))).join('') +
      button('use', 'u', 'Use') +
      (['prev', 'next', 'view'] as const).map((a) => button(a, 's', glyph(a))).join('') +
      (['pause', 'scoreboard', 'map', 'ping'] as const).map((a) => button(a, 'top', glyph(a))).join('') +
      `<div class="turn"><h2>Turn your phone</h2><p>Duty Shooter plays in landscape.</p><button type="button" class="ds-btn" data-c="pause">Menu</button></div>`;
    for (const b of root.querySelectorAll<HTMLButtonElement>('.tb')) this.#buttons.set(b.dataset['c']!, b);
    this.#stickZone = root.querySelector('.zone.stick') as HTMLElement;
    this.#stickUi = root.querySelector('.stickui') as HTMLElement;
    this.#knob = root.querySelector('.knob') as HTMLElement;
    parent.append(root);

    const on = (target: EventTarget, type: string, fn: (e: never) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, options);
      this.#off.push(() => target.removeEventListener(type, fn as EventListener, options));
    };
    on(root, 'pointerdown', (e: PointerEvent) => this.#down(e));
    on(root, 'pointermove', (e: PointerEvent) => this.#moved(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) on(root, type, (e: PointerEvent) => this.#up(e.pointerId));
    // Not passive, so the browser's own answers to a touch (scroll, zoom, a late mouse click, the long-press menu) never start.
    for (const type of ['touchstart', 'touchmove', 'touchend']) on(root, type, (e: TouchEvent) => e.cancelable && e.preventDefault(), { passive: false });
    for (const type of ['contextmenu', 'selectstart', 'gesturestart', 'dblclick']) on(root, type, (e: Event) => e.preventDefault());
    // A turn of the phone or a resize moves everything: let go rather than keep a stick whose centre is elsewhere.
    on(window, 'resize', () => this.reset());
    on(window, 'blur', () => this.reset());
    // Turned upright in play: the game cannot be played that way, so it stops for the menu rather than run on behind the notice.
    const upright = globalThis.matchMedia?.('(orientation: portrait)');
    if (upright) {
      on(upright, 'change', () => {
        if (this.#shown && upright.matches) this.#sink.pause();
      });
    }
    this.#placeStick();
  }

  /** Shown while touch is the input in use and the game takes input; hiding lets everything go. */
  set shown(on: boolean) {
    if (on === this.#shown) return;
    this.#shown = on;
    this.root.classList.toggle('on', on);
    if (!on) {
      this.reset();
      this.#board = false;
      this.#sprintLocked = false;
      this.#paint();
    } else this.#placeStick();
  }

  get shown(): boolean {
    return this.#shown;
  }

  /** What the stick asks for now: the usercmd's axes and whether to run. */
  get move(): { readonly forward: number; readonly right: number; readonly sprint: boolean } {
    if (!this.#shown) return { forward: 0, right: 0, sprint: false };
    if (this.#read) return { forward: this.#read.forward, right: this.#read.right, sprint: this.#read.sprint || this.#read.lock };
    if (this.#sprintLocked) return { forward: 1, right: 0, sprint: true };
    return { forward: 0, right: 0, sprint: false };
  }

  /** The scoreboard button is a toggle: a thumb cannot hold it and play. */
  get scoreboard(): boolean {
    return this.#shown && this.#board;
  }

  /** What the game is doing: which controls there are to show. */
  context(ctx: TouchContext): void {
    const was = this.#ctx;
    this.#ctx = ctx;
    if (was && was.state === ctx.state && was.use === ctx.use && was.board === ctx.board && was.ping === ctx.ping && was.map === ctx.map && was.mapOpen === ctx.mapOpen && (was.grenades > 0) === (ctx.grenades > 0) && was.tactical === ctx.tactical && ((was.tacticals ?? 0) > 0) === ((ctx.tacticals ?? 0) > 0)) return;
    // Out of the fight, or a board that is gone: nothing stays held or open behind the change.
    if (was && was.state !== ctx.state) this.reset();
    if (!ctx.board) this.#board = false;
    if (ctx.state !== 'fight') this.#sprintLocked = false;
    this.#paint();
  }

  /** Which toggles are on, for the buttons that light. */
  lit(lit: TouchLit): void {
    if (lit.ads === this.#lit.ads && lit.crouch === this.#lit.crouch && lit.prone === this.#lit.prone) return;
    this.#lit = lit;
    this.#paint();
  }

  #paint(): void {
    const ctx = this.#ctx;
    const root = this.root;
    if (ctx && root.dataset['state'] !== ctx.state) root.dataset['state'] = ctx.state;
    root.classList.toggle('mapped', ctx?.mapOpen === true);
    root.classList.toggle('boarded', this.#board);
    const show = (control: string, on: boolean) => {
      const b = this.#buttons.get(control);
      if (b && b.hidden === on) b.hidden = !on;
    };
    show('use', ctx?.use === true);
    const prompt = root.querySelector<HTMLElement>('.zone.prompt');
    if (prompt && prompt.hidden === (ctx?.use === true)) prompt.hidden = ctx?.use !== true;
    show('scoreboard', ctx?.board === true);
    show('ping', ctx?.ping === true && ctx.state === 'fight');
    show('map', ctx?.map === true);
    const light = (control: string, on: boolean) => this.#buttons.get(control)?.classList.toggle('lit', on);
    light('ads', this.#lit.ads);
    light('crouch', this.#lit.crouch || this.#lit.prone);
    light('scoreboard', this.#board);
    light('map', ctx?.mapOpen === true);
    this.#buttons.get('grenade')?.classList.toggle('none', ctx !== null && ctx.grenades <= 0);
    show('tactical', (ctx?.tactical ?? null) !== null);
    this.#buttons.get('tactical')?.classList.toggle('none', ctx !== null && (ctx.tacticals ?? 0) <= 0);
    this.#paintStick();
  }

  #down(e: PointerEvent): void {
    // A mouse on the controls is the mouse coming back: the mode follows it, and the controls go.
    if (e.pointerType === 'mouse') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
    const control = el?.dataset['c'];
    if (!el || !control) return;
    e.preventDefault();
    if (!this.#book.claim(e.pointerId, control)) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone (a tap shorter than a frame): its up follows.
    }
    if (control === 'stick') {
      this.#sprintLocked = false;
      const at = this.#clampStick(e.clientX, e.clientY);
      this.#stick = { ox: at.x, oy: at.y, x: e.clientX, y: e.clientY };
      this.#readStick();
      return;
    }
    if (control === 'look') {
      this.#last.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      return;
    }
    this.#buttons.get(control)?.classList.add('down');
    if (control === 'pause') {
      this.#sink.pause();
      return;
    }
    if (control === 'scoreboard') {
      this.#board = !this.#board;
      this.#paint();
      return;
    }
    this.#last.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    // The run ends where a key's would: raising the sights or going down.
    if (control === 'ads' || control === 'crouch') this.#sprintLocked = false;
    this.#sink.press(actionOf(control));
  }

  #moved(e: PointerEvent): void {
    const control = this.#book.owner(e.pointerId);
    if (control === null) return;
    if (control === 'stick') {
      if (this.#stick) {
        this.#stick.x = e.clientX;
        this.#stick.y = e.clientY;
        this.#readStick();
      }
      return;
    }
    const last = this.#last.get(e.pointerId);
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    const dt = e.timeStamp - last.t;
    last.x = e.clientX;
    last.y = e.clientY;
    last.t = e.timeStamp;
    // The look area turns the view, and so does a thumb dragged off the fire button: aim while firing.
    if (control === 'look' || control === 'fire') this.#sink.look(dx, dy, dt);
    else if (control === 'ping') this.#sink.wheel(dx, dy);
  }

  #up(pointer: number): void {
    const control = this.#book.release(pointer);
    this.#last.delete(pointer);
    if (control === null) return;
    this.#let(control);
  }

  #let(control: Control): void {
    if (control === 'stick') {
      // Let go past the top of the travel, the run locks on.
      if (this.#read?.lock && this.#ctx?.state !== 'spectate') this.#sprintLocked = true;
      this.#stick = null;
      this.#read = null;
      this.#placeStick();
      return;
    }
    if (control === 'look') return;
    this.#buttons.get(control)?.classList.remove('down');
    if (control === 'pause' || control === 'scoreboard') return;
    this.#sink.release(actionOf(control));
  }

  /** Lets go of everything held: the controls hidden, the window gone, the phone turned. */
  reset(): void {
    for (const control of this.#book.clear()) this.#let(control);
    this.#last.clear();
    this.#stick = null;
    this.#read = null;
    this.#placeStick();
  }

  #readStick(): void {
    const s = this.#stick;
    this.#read = s ? readStick(s.x - s.ox, s.y - s.oy) : null;
    this.#paintStick();
  }

  /** The stick's centre for a thumb landing at (x, y): there, but far enough in that the whole ring shows. */
  #clampStick(x: number, y: number): { x: number; y: number } {
    const zone = this.#stickZone.getBoundingClientRect();
    const pad = STICK_RADIUS + 8;
    return { x: Math.max(zone.left + pad, Math.min(zone.right - 8, x)), y: Math.max(zone.top + 8, Math.min(zone.bottom - pad, y)) };
  }

  #placeStick(): void {
    this.#paintStick();
  }

  #paintStick(): void {
    const ui = this.#stickUi;
    const s = this.#stick;
    const zone = this.#stickZone.getBoundingClientRect();
    const x = s ? s.ox : zone.left + STICK_REST.x;
    const y = s ? s.oy : zone.bottom - STICK_REST.y;
    ui.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    const read = this.#read;
    const kx = read ? read.knobX : 0;
    const ky = read ? read.knobY : this.#sprintLocked ? -STICK_RADIUS : 0;
    this.#knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
    ui.classList.toggle('held', s !== null);
    ui.classList.toggle('sprint', read?.sprint === true || this.#sprintLocked);
    ui.classList.toggle('lock', read?.lock === true);
    ui.classList.toggle('locked', this.#sprintLocked && s === null);
  }

  dispose(): void {
    for (const off of this.#off) off();
    this.root.remove();
  }
}

/**
 * Asks a phone for the whole screen, on its side. Called from the player's
 * own press on Play or Resume, which is the only time a browser grants
 * either; where it refuses (an iPhone has no fullscreen, a desktop no
 * orientation to lock) the game plays on as it is. Only where a finger is the
 * main pointer: a laptop with a touchscreen keeps its window.
 */
export function fillScreen(): void {
  const doc = globalThis.document as Document | undefined;
  const root = doc?.documentElement;
  if (!doc || !root || typeof root.requestFullscreen !== 'function') return;
  if (globalThis.matchMedia?.('(pointer: coarse)').matches !== true) return;
  const turn = () => (globalThis.screen?.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined)?.lock?.('landscape');
  const asked = doc.fullscreenElement ? Promise.resolve() : root.requestFullscreen({ navigationUI: 'hide' });
  void asked.then(turn).catch(() => {
    // Refused: nothing to undo.
  });
}

/** The action a control presses: the spectator's three ride on the keys a spectator already uses. */
function actionOf(control: Control): Action {
  if (control === 'prev') return 'ads';
  if (control === 'next') return 'fire';
  if (control === 'view') return 'jump';
  return control as Action;
}
