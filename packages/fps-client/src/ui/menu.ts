import { STATS } from '@duty-shooter/fps-core';
import { padName, type PadNav } from '../gamepad';
import { ACTIONS, ACTION_LABELS, DEFAULT_SETTINGS, bindingLabel, type Action, type Settings } from '../settings';

const CSS = `
.ds-menu { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse at 30% 20%, rgb(30 36 44 / 0.86), rgb(8 10 12 / 0.94)); font: 500 15px/1.4 'Rajdhani', 'Segoe UI', system-ui, sans-serif; color: #e9ecef; }
.ds-menu[hidden] { display: none; }
.ds-panel { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; background: rgb(14 17 20 / 0.92); border: 1px solid rgb(255 255 255 / 0.1); padding: 26px 28px; box-shadow: 0 30px 80px rgb(0 0 0 / 0.5); }
.ds-panel h1 { margin: 0 0 4px; font-size: 34px; letter-spacing: 6px; text-transform: uppercase; font-weight: 700; }
.ds-panel h1 span { color: #f2c14e; }
.ds-panel h2 { margin: 18px 0 8px; font-size: 13px; letter-spacing: 3px; text-transform: uppercase; color: #f2c14e; font-weight: 700; }
.ds-panel p { margin: 6px 0 14px; opacity: 0.75; font-size: 14px; }
.ds-btn { display: block; width: 100%; margin: 8px 0; padding: 12px 16px; background: rgb(255 255 255 / 0.06); color: inherit; border: 1px solid rgb(255 255 255 / 0.14); font: inherit; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; text-align: left; cursor: pointer; }
.ds-btn:hover, .ds-btn:focus-visible { background: rgb(242 193 78 / 0.16); border-color: #f2c14e; outline: none; }
.ds-btn.primary { background: #f2c14e; color: #15181b; border-color: #f2c14e; }
.ds-btn.primary:hover { background: #ffd36b; }
.ds-row { display: grid; grid-template-columns: 1fr 210px; gap: 12px; align-items: center; padding: 5px 0; border-bottom: 1px solid rgb(255 255 255 / 0.05); }
.ds-row label { font-size: 14px; }
.ds-row input[type=range] { width: 100%; accent-color: #f2c14e; }
.ds-row .val { font-variant-numeric: tabular-nums; opacity: 0.8; font-size: 13px; margin-left: 6px; }
.ds-row select, .ds-field input, .ds-bind { background: rgb(255 255 255 / 0.06); color: inherit; border: 1px solid rgb(255 255 255 / 0.16); padding: 6px 8px; font: inherit; width: 100%; }
.ds-row select option { background: #15181b; }
.ds-bind { cursor: pointer; text-align: left; }
.ds-bind.wait { border-color: #f2c14e; color: #f2c14e; }
.ds-field { margin: 10px 0; }
.ds-field span { display: block; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.7; margin-bottom: 4px; }
.ds-error { color: #ff7a6a; min-height: 20px; font-size: 14px; }
.ds-hint { font-size: 13px; opacity: 0.6; margin-top: 14px; }
.ds-tabs { display: flex; gap: 6px; margin: 12px 0 4px; }
.ds-tabs button { flex: 1; padding: 8px; background: transparent; color: inherit; border: 1px solid rgb(255 255 255 / 0.12); font: inherit; letter-spacing: 2px; text-transform: uppercase; font-size: 12px; cursor: pointer; }
.ds-tabs button.on { border-color: #f2c14e; color: #f2c14e; }
.ds-menu.pad [data-pad-focus] { outline: 2px solid #f2c14e; outline-offset: 2px; }
.ds-menu.pad .ds-btn[data-pad-focus] { background: rgb(242 193 78 / 0.16); border-color: #f2c14e; }
.ds-menu.pad .ds-btn.primary[data-pad-focus] { background: #ffd36b; }
`;

export interface MenuCallbacks {
  /** Play solo on the range. */
  playOffline(): void;
  /** Join the server with this name and passphrase. */
  playOnline(name: string, passphrase: string): void;
  /** Close the pause menu and take the pointer again. */
  resume(): void;
  /** Leave the current game for the main menu. */
  leave(): void;
  /** Settings changed (already validated); persist and apply them. */
  changeSettings(settings: Settings): void;
  /** Wait for the next key or mouse button, for rebinding; null cancels. */
  captureKey(): Promise<string | null>;
}

/**
 * Where online play is. `server`: this page's own game server, with a
 * passphrase or as one public lobby. `link`: a copy of the page without a
 * server (GitHub Pages), which sends players to the server's address.
 */
export type Lobby = { readonly kind: 'server'; readonly public: boolean } | { readonly kind: 'link'; readonly url: string };

type Screen = 'main' | 'join' | 'pause' | 'settings' | 'tip';

/**
 * The start, join, pause and settings screens. Plain DOM; the range app
 * decides what each choice does.
 */
export class Menu {
  readonly #root: HTMLDivElement;
  readonly #panel: HTMLDivElement;
  readonly #callbacks: MenuCallbacks;
  #settings: Settings;
  #screen: Screen = 'main';
  #back: Screen = 'main';
  #tab: 'controls' | 'bindings' | 'video' | 'interface' = 'controls';
  #error = '';
  readonly #lobby: Lobby | null;
  #afterTip: (() => void) | null = null;
  readonly #padName: () => string | null;

  constructor(settings: Settings, callbacks: MenuCallbacks, options: { lobby: Lobby | null; padName?: () => string | null }) {
    this.#settings = settings;
    this.#callbacks = callbacks;
    this.#lobby = options.lobby;
    this.#padName = options.padName ?? (() => null);
    if (!document.getElementById('ds-menu-css')) {
      const style = document.createElement('style');
      style.id = 'ds-menu-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.#root = document.createElement('div');
    this.#root.className = 'ds-menu';
    this.#panel = document.createElement('div');
    this.#panel.className = 'ds-panel';
    this.#root.append(this.#panel);
    document.body.append(this.#root);
    // The focus ring is for the controller; the mouse hides it again.
    this.#root.addEventListener('mousemove', () => this.#root.classList.remove('pad'));
    this.#render();
  }

  get open(): boolean {
    return !this.#root.hidden;
  }

  set settings(settings: Settings) {
    this.#settings = settings;
  }

  show(screen: Screen, error = ''): void {
    this.#screen = screen;
    this.#error = error;
    this.#root.hidden = false;
    this.#render();
  }

  hide(): void {
    this.#root.hidden = true;
  }

  /**
   * Controller navigation: up and down (left and right outside sliders and
   * lists) move the focus, left and right change the focused slider or list,
   * Cross activates, Circle goes back and Options resumes from the pause menu.
   */
  navigate(nav: PadNav): void {
    if (!this.open) return;
    this.#root.classList.add('pad');
    this.#navigate(nav);
    this.#markFocus();
  }

  #navigate(nav: PadNav): void {
    const items = [...this.#panel.querySelectorAll<HTMLElement>('button, input, select')].filter((e) => e.offsetParent !== null);
    const focused = items.indexOf(document.activeElement as HTMLElement);
    const current = items[focused];
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
    const step = (d: 1 | -1) => {
      if (current instanceof HTMLInputElement && current.type === 'range') {
        if (d > 0) current.stepUp();
        else current.stepDown();
        current.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (current instanceof HTMLSelectElement) {
        const i = Math.max(0, Math.min(current.options.length - 1, current.selectedIndex + d));
        if (i !== current.selectedIndex) {
          current.selectedIndex = i;
          current.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else focus(focused < 0 ? 0 : focused + d);
    };
    const press = (label: string) => [...this.#panel.querySelectorAll<HTMLButtonElement>('.ds-btn')].find((b) => b.textContent === label)?.click();
    switch (nav) {
      case 'up':
        focus(focused < 0 ? 0 : focused - 1);
        return;
      case 'down':
        focus(focused < 0 ? 0 : focused + 1);
        return;
      case 'left':
        step(-1);
        return;
      case 'right':
        step(1);
        return;
      case 'accept': {
        if (!current) {
          focus(0);
          return;
        }
        const screen = this.#screen;
        if (current instanceof HTMLInputElement && current.type !== 'range') current.form?.requestSubmit();
        else if (current instanceof HTMLButtonElement) current.click();
        // A click that re-rendered the panel keeps the focus where it was on the same screen.
        if (this.open && !this.#panel.contains(document.activeElement)) {
          const next = [...this.#panel.querySelectorAll<HTMLElement>('button, input, select')].filter((e) => e.offsetParent !== null);
          next[this.#screen === screen ? Math.min(focused, next.length - 1) : 0]?.focus();
        }
        return;
      }
      case 'back':
        if (this.#screen === 'pause') this.#callbacks.resume();
        else if (this.#screen === 'tip') press('Got it');
        else press('Back');
        return;
      case 'start':
        if (this.#screen === 'pause') this.#callbacks.resume();
        return;
    }
  }

  /** Shows the one-time tip (Firefox has no raw mouse input), then runs `then`. */
  tip(then: () => void): void {
    this.#afterTip = then;
    this.show('tip');
  }

  #change(patch: Partial<Settings>): void {
    this.#settings = { ...this.#settings, ...patch };
    this.#callbacks.changeSettings(this.#settings);
  }

  #render(): void {
    const p = this.#panel;
    p.replaceChildren();
    const h = (tag: string, text = '', cls = '') => {
      const e = document.createElement(tag);
      if (text) e.textContent = text;
      if (cls) e.className = cls;
      return e;
    };
    const button = (text: string, onClick: () => void, primary = false) => {
      const b = h('button', text, primary ? 'ds-btn primary' : 'ds-btn') as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', onClick);
      p.append(b);
      return b;
    };
    const title = h('h1');
    title.innerHTML = 'Duty <span>Shooter</span>';
    switch (this.#screen) {
      case 'main': {
        p.append(title, h('p', 'Firing range, movement course and arena. M4A1, iron sights.'));
        const lobby = this.#lobby;
        if (lobby?.kind === 'server') button(lobby.public ? 'Join public lobby' : 'Play online', () => this.show('join'), true);
        if (lobby?.kind === 'link') button('Join public lobby', () => location.assign(lobby.url), true);
        button(lobby ? 'Practice offline' : 'Play', () => this.#callbacks.playOffline(), !lobby);
        button('Settings', () => {
          this.#back = 'main';
          this.show('settings');
        });
        if (lobby?.kind === 'link') p.append(h('div', 'The public lobby runs on the home server and opens its own page. This page is for offline practice.', 'ds-hint'));
        p.append(h('div', 'WASD move · Shift sprint (double-tap: tactical) · C crouch/slide · Ctrl prone · Space jump/mantle · R reload (hold: inspect) · V melee · Esc menu', 'ds-hint'));
        p.append(h('div', 'Controller: L3 sprint (double-click: tactical) · ○ crouch/slide (hold: prone) · ✕ jump · □ reload (hold: inspect) · R3 melee · L2 aim · R2 fire · Options menu', 'ds-hint'));
        break;
      }
      case 'join': {
        const open = this.#lobby?.kind === 'server' && this.#lobby.public;
        p.append(title, h('h2', open ? 'Public lobby' : 'Join the server'));
        if (open) p.append(h('p', 'Free-for-all. Anyone with the link can join.'));
        const form = h('form') as HTMLFormElement;
        const field = (label: string, input: HTMLInputElement) => {
          const wrap = h('label', '', 'ds-field');
          wrap.append(h('span', label), input);
          form.append(wrap);
        };
        const name = h('input') as HTMLInputElement;
        name.maxLength = 16;
        name.required = true;
        name.value = this.#settings.name;
        name.setAttribute('autocomplete', 'nickname');
        const pass = h('input') as HTMLInputElement;
        pass.type = 'password';
        pass.value = this.#settings.passphrase;
        pass.autocomplete = 'current-password';
        field('Name', name);
        if (!open) field('Passphrase', pass);
        form.append(h('div', this.#error, 'ds-error'));
        const go = h('button', 'Join', 'ds-btn primary') as HTMLButtonElement;
        go.type = 'submit';
        form.append(go);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const n = name.value.trim().slice(0, 16);
          if (!n) return;
          if (open) {
            this.#change({ name: n });
            this.#callbacks.playOnline(n, '');
          } else {
            this.#change({ name: n, passphrase: pass.value });
            this.#callbacks.playOnline(n, pass.value);
          }
        });
        p.append(form);
        button('Back', () => this.show('main'));
        queueMicrotask(() => (name.value && !open ? pass : name).focus());
        break;
      }
      case 'pause': {
        p.append(title);
        if (this.#error) p.append(h('div', this.#error, 'ds-error'));
        button('Resume', () => this.#callbacks.resume(), true);
        button('Settings', () => {
          this.#back = 'pause';
          this.show('settings');
        });
        button('Leave', () => this.#callbacks.leave());
        break;
      }
      case 'tip': {
        p.append(h('h2', 'Tip for Firefox'));
        p.append(
          h(
            'p',
            'Firefox cannot give the game raw mouse input, so Windows mouse acceleration applies. For consistent aim, turn off "Enhance pointer precision" in Windows mouse settings, or play in Chrome or Edge.',
          ),
        );
        button(
          'Got it',
          () => {
            this.#change({ firefoxTipShown: true });
            this.hide();
            this.#afterTip?.();
          },
          true,
        );
        break;
      }
      case 'settings':
        this.#renderSettings(p, h, button);
        break;
    }
    // Keep the controller's focus on screen: the first control of a new screen.
    // Queued last, after any focus a screen sets itself.
    if (this.#root.classList.contains('pad')) {
      queueMicrotask(() => {
        if (!this.#panel.contains(document.activeElement)) this.#panel.querySelector<HTMLElement>('.ds-btn, input, select')?.focus();
        this.#markFocus();
      });
    }
  }

  /** Marks the focused control for the controller's focus ring (the page may not have window focus, so :focus is not enough). */
  #markFocus(): void {
    for (const e of this.#panel.querySelectorAll('[data-pad-focus]')) e.removeAttribute('data-pad-focus');
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.#panel.contains(active)) active.dataset['padFocus'] = '';
  }

  #renderSettings(p: HTMLElement, h: (tag: string, text?: string, cls?: string) => HTMLElement, button: (text: string, onClick: () => void, primary?: boolean) => HTMLButtonElement): void {
    const s = this.#settings;
    p.append(h('h1', 'Settings'));
    const tabs = h('div', '', 'ds-tabs');
    for (const [id, label] of [
      ['controls', 'Controls'],
      ['bindings', 'Keys'],
      ['video', 'Video'],
      ['interface', 'Interface'],
    ] as const) {
      const b = h('button', label, this.#tab === id ? 'on' : '') as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => {
        this.#tab = id;
        this.#render();
      });
      tabs.append(b);
    }
    p.append(tabs);
    const row = (label: string, control: HTMLElement) => {
      const r = h('div', '', 'ds-row');
      const l = h('label', label);
      r.append(l, control);
      p.append(r);
    };
    const slider = (label: string, value: number, min: number, max: number, step: number, format: (v: number) => string, set: (v: number) => void) => {
      const wrap = h('div');
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      const input = h('input') as HTMLInputElement;
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      input.setAttribute('aria-label', label);
      const val = h('span', format(value), 'val');
      input.addEventListener('input', () => {
        const v = Number(input.value);
        val.textContent = format(v);
        set(v);
      });
      wrap.append(input, val);
      row(label, wrap);
    };
    const select = <T extends string>(label: string, value: T, options: readonly (readonly [T, string])[], set: (v: T) => void) => {
      const el = h('select') as HTMLSelectElement;
      el.setAttribute('aria-label', label);
      for (const [v, text] of options) {
        const o = h('option', text) as HTMLOptionElement;
        o.value = v;
        o.selected = v === value;
        el.append(o);
      }
      el.addEventListener('change', () => set(el.value as T));
      row(label, el);
    };
    const toggle = (label: string, value: boolean, set: (v: boolean) => void) =>
      select(label, value ? 'on' : 'off', [
        ['on', 'On'],
        ['off', 'Off'],
      ], (v) => set(v === 'on'));

    if (this.#tab === 'controls') {
      slider('Mouse sensitivity', s.sensitivity, 0.5, 20, 0.05, (v) => v.toFixed(2), (v) => this.#change({ sensitivity: v }));
      slider('ADS sensitivity multiplier', s.adsMultiplier, 0.1, 2, 0.01, (v) => v.toFixed(2), (v) => this.#change({ adsMultiplier: v }));
      select('Aim down sights', s.adsMode, [
        ['hold', 'Hold'],
        ['toggle', 'Toggle'],
      ], (v) => this.#change({ adsMode: v }));
      select('Crouch', s.crouchMode, [
        ['toggle', 'Toggle'],
        ['hold', 'Hold'],
      ], (v) => this.#change({ crouchMode: v }));
      const pad = this.#padName();
      p.append(h('h2', 'Controller'), h('p', pad ? `Connected: ${padName(pad)}` : 'None detected. Connect a controller and press any button.'));
      select('Button layout', s.padLayout, [
        ['default', 'Default'],
        ['tactical', 'Tactical (crouch on R3, melee on ○)'],
      ], (v) => this.#change({ padLayout: v }));
      slider('Horizontal stick sensitivity', s.padSensitivityX, 1, 20, 1, (v) => String(v), (v) => this.#change({ padSensitivityX: v }));
      slider('Vertical stick sensitivity', s.padSensitivityY, 1, 20, 1, (v) => String(v), (v) => this.#change({ padSensitivityY: v }));
      slider('Controller ADS multiplier', s.padAdsMultiplier, 0.1, 2, 0.05, (v) => v.toFixed(2), (v) => this.#change({ padAdsMultiplier: v }));
      slider('Stick deadzone', s.padDeadzone, 0, 0.3, 0.01, (v) => v.toFixed(2), (v) => this.#change({ padDeadzone: v }));
      toggle('Invert vertical look', s.padInvertY, (v) => this.#change({ padInvertY: v }));
    } else if (this.#tab === 'bindings') {
      for (const action of ACTIONS) row(ACTION_LABELS[action], this.#bindButton(action, h));
      button('Reset keys to defaults', () => {
        this.#change({ bindings: DEFAULT_SETTINGS.bindings });
        this.#render();
      });
    } else if (this.#tab === 'video') {
      slider('Field of view', s.fov, STATS.input.minFov.value, STATS.input.maxFov.value, 1, (v) => `${v}°`, (v) => this.#change({ fov: v }));
      select('ADS field of view', s.adsFov, [
        ['affected', 'Affected'],
        ['independent', 'Independent'],
      ], (v) => this.#change({ adsFov: v }));
      select('Graphics preset', s.preset, [
        ['low', 'Low'],
        ['normal', 'Normal'],
        ['high', 'High'],
      ], (v) => this.#change({ preset: v }));
    } else {
      toggle('FPS counter', s.showFps, (v) => this.#change({ showFps: v }));
      toggle('Ping counter', s.showPing, (v) => this.#change({ showPing: v }));
      toggle('Range overlay', s.showRangeOverlay, (v) => this.#change({ showRangeOverlay: v }));
      slider('Volume', s.volume, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => this.#change({ volume: v }));
    }
    button('Back', () => this.show(this.#back), true);
  }

  #bindButton(action: Action, h: (tag: string, text?: string, cls?: string) => HTMLElement): HTMLElement {
    const b = h('button', bindingLabel(this.#settings.bindings[action]), 'ds-bind') as HTMLButtonElement;
    b.type = 'button';
    b.dataset['action'] = action;
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      b.textContent = 'Press a key…';
      b.classList.add('wait');
      // Let this click finish before listening, or it would bind itself.
      await new Promise((r) => setTimeout(r, 0));
      const code = await this.#callbacks.captureKey();
      if (code && code !== 'Escape') {
        // A key bound elsewhere is swapped, so no action is left unbound.
        const bindings = { ...this.#settings.bindings };
        const clash = ACTIONS.find((a) => a !== action && bindings[a] === code);
        if (clash) bindings[clash] = bindings[action];
        bindings[action] = code;
        this.#change({ bindings });
      }
      this.#render();
    });
    return b;
  }

  dispose(): void {
    this.#root.remove();
  }
}
