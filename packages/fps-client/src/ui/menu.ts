import { STATS, type ModeId } from '@duty-shooter/fps-core';
import { padName, type PadNav } from '../gamepad';
import { ACTIONS, ACTION_LABELS, DEFAULT_SETTINGS, bindingLabel, type Action, type Settings } from '../settings';
import { MODE_NAMES, connectionError, lobbyTile, type LobbyInfo } from './model';
import { escapeHtml, icon, installTheme } from './theme';

export type { LobbyInfo } from './model';

const CSS = `
.ds-menu { position: fixed; inset: 0; z-index: 20; font: 400 15px/1.4 var(--ds-font); color: var(--ds-text); }
.ds-menu[hidden] { display: none; }
.ds-menu.dim { background: rgb(11 14 19 / 0.72); backdrop-filter: blur(3px); }
.ds-menu.home { background: linear-gradient(180deg, rgb(11 14 19 / 0.55) 0%, transparent 22%, transparent 52%, rgb(11 14 19 / 0.85) 100%); }
.ds-screen { position: absolute; inset: 0; animation: ds-in 160ms ease-out; }
.ds-brand { position: absolute; left: 56px; top: 48px; }
.ds-brand h1 { margin: 0; font-size: 56px; line-height: 0.95; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
.ds-brand h1 span { color: var(--ds-signal); }
.ds-brand p { margin: 8px 0 0; color: var(--ds-text-2); text-shadow: 0 1px 6px rgb(0 0 0 / 0.7); }
.ds-lobby-link { display: inline-block; margin-top: 10px; color: var(--ds-signal); text-decoration: none; letter-spacing: 0.06em; }
.ds-lobby-link:hover, .ds-lobby-link:focus-visible { text-decoration: underline; outline: none; }
.ds-name { position: absolute; right: 56px; top: 48px; width: 260px; }
.ds-name label { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: rgb(18 22 29 / 0.85); border: 1px solid var(--ds-line); border-radius: 4px; }
.ds-name label:focus-within { border-color: var(--ds-signal); }
.ds-name input { flex: 1; min-width: 0; background: none; border: 0; color: var(--ds-text); font: 700 18px var(--ds-font); outline: none; }
.ds-name .ds-icon { color: var(--ds-text-3); flex: none; }
.ds-version { position: absolute; right: 56px; bottom: 18px; font-size: 12px; color: var(--ds-text-3); letter-spacing: 0.08em; }
.ds-dock { position: absolute; left: 56px; right: 56px; bottom: 48px; display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 12px; }
.ds-dock.three { grid-template-columns: 1fr 1fr 1fr; }
.ds-tile { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-height: 148px; padding: 18px 20px; text-align: left; background: rgb(18 22 29 / 0.88); color: var(--ds-text); border: 1px solid var(--ds-line); border-radius: 6px; font: inherit; cursor: pointer; transition: transform 160ms ease-out, border-color 160ms, background 160ms; }
.ds-tile:hover, .ds-tile:focus-visible, .ds-tile[data-pad-focus] { transform: translateY(-4px); border-color: var(--ds-signal); background: rgb(28 34 44 / 0.95); outline: none; }
.ds-tile .ds-icon { width: 28px; height: 28px; color: var(--ds-signal); }
.ds-tile b { font-size: 24px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
.ds-tile .desc { color: var(--ds-text-2); font-size: 14px; }
.ds-tile.primary { background: linear-gradient(rgb(143 227 200 / 0.14), rgb(143 227 200 / 0.14)), rgb(18 22 29 / 0.88); border-color: rgb(143 227 200 / 0.55); }
.ds-tile .facts { display: flex; gap: 22px; margin-top: auto; }
.ds-tile .facts div { display: flex; flex-direction: column; }
.ds-tile .facts span:last-child { font-size: 16px; font-weight: 700; }
.ds-dot { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-2); }
.ds-dot::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--ds-alert); }
.ds-dot.up::before { background: var(--ds-signal); box-shadow: 0 0 8px var(--ds-signal); }
.ds-tile .ds-dot { position: absolute; right: 18px; top: 20px; }
/* Small windows: the title, name and tiles stack in one scrolling column instead of overlapping. */
@media (max-width: 900px), (max-height: 560px) {
  .ds-menu.home .ds-screen { display: flex; flex-direction: column; gap: 14px; padding: 20px 24px; overflow-y: auto; }
  .ds-menu.home .ds-brand, .ds-menu.home .ds-name, .ds-menu.home .ds-dock, .ds-menu.home .ds-version { position: static; }
  .ds-brand h1 { font-size: 36px; }
  .ds-name { width: min(260px, 100%); }
  .ds-dock, .ds-dock.three { margin-top: auto; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
  .ds-tile { min-height: 0; padding: 14px 16px; }
  .ds-tile b { font-size: 19px; }
  .ds-version { align-self: flex-end; }
}
.ds-panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; background: var(--ds-panel); border: 1px solid var(--ds-line); border-radius: 8px; padding: 26px 28px; box-shadow: 0 30px 80px rgb(0 0 0 / 0.5); }
.ds-panel.wide { width: min(760px, calc(100vw - 32px)); }
.ds-panel h2 { margin: 0 0 4px; font-size: 30px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; display: flex; align-items: center; gap: 10px; }
.ds-panel h2 .ds-icon { color: var(--ds-signal); }
.ds-panel.error h2 .ds-icon { color: var(--ds-alert); }
.ds-panel h3 { margin: 18px 0 8px; font-size: 12px; font-weight: 400; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-panel p { margin: 6px 0 14px; color: var(--ds-text-2); }
.ds-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0; }
.ds-facts div { background: var(--ds-raised); border-radius: 4px; padding: 8px 12px; display: flex; flex-direction: column; }
.ds-facts span:last-child { font-size: 18px; font-weight: 700; }
.ds-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; margin: 8px 0; padding: 12px 16px; background: var(--ds-raised); color: var(--ds-text); border: 1px solid var(--ds-line); border-radius: 4px; font: inherit; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: border-color 120ms, background 120ms; }
.ds-btn:hover, .ds-btn:focus-visible { border-color: var(--ds-signal); outline: none; }
.ds-btn.primary { background: var(--ds-signal); color: var(--ds-ink); border-color: var(--ds-signal); }
.ds-btn.primary:hover { background: #a9ecd6; }
.ds-btn:disabled { opacity: 0.45; cursor: default; }
.ds-btns { display: flex; gap: 10px; }
.ds-btns .ds-btn { flex: 1; }
.ds-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ds-mode { padding: 12px 14px; text-align: left; background: var(--ds-raised); color: var(--ds-text); border: 1px solid var(--ds-line); border-radius: 4px; font: inherit; cursor: pointer; }
.ds-mode b { display: block; font-size: 17px; text-transform: uppercase; letter-spacing: 0.04em; }
.ds-mode span { font-size: 13px; color: var(--ds-text-2); }
.ds-mode.on { border-color: var(--ds-signal); box-shadow: 0 0 0 1px var(--ds-signal); }
.ds-row { display: grid; grid-template-columns: 1fr 230px; gap: 12px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--ds-line); }
.ds-row label { font-size: 15px; }
.ds-row input[type=range] { width: 100%; accent-color: var(--ds-signal); }
.ds-row .val { font-variant-numeric: tabular-nums; color: var(--ds-text-2); font-size: 13px; margin-left: 8px; min-width: 44px; text-align: right; }
.ds-row select, .ds-field input, .ds-bind { background: var(--ds-raised); color: inherit; border: 1px solid var(--ds-line); border-radius: 3px; padding: 7px 9px; font: inherit; width: 100%; }
.ds-row select option { background: var(--ds-panel); }
.ds-field input:focus, .ds-row select:focus, .ds-bind:focus { border-color: var(--ds-signal); outline: none; }
.ds-bind { cursor: pointer; text-align: left; }
.ds-bind.wait { border-color: var(--ds-signal); color: var(--ds-signal); }
.ds-field { display: block; margin: 12px 0; }
.ds-field span { display: block; margin-bottom: 4px; }
.ds-error { color: var(--ds-alert); min-height: 20px; font-size: 14px; }
.ds-hint { font-size: 13px; color: var(--ds-text-3); margin-top: 14px; }
.ds-tabs { display: flex; gap: 6px; margin: 14px 0 8px; }
.ds-tabs button { flex: 1; padding: 9px; background: transparent; color: var(--ds-text-2); border: 0; border-bottom: 2px solid var(--ds-line); font: inherit; letter-spacing: 0.16em; text-transform: uppercase; font-size: 12px; cursor: pointer; }
.ds-tabs button.on { border-color: var(--ds-signal); color: var(--ds-text); }
.ds-progress { height: 4px; background: var(--ds-raised); border-radius: 2px; overflow: hidden; margin: 18px 0 8px; }
.ds-progress i { display: block; height: 100%; width: 0; background: var(--ds-signal); transition: width 200ms ease-out; }
.ds-progress.busy i { width: 30%; animation: ds-busy 1.1s ease-in-out infinite; }
@keyframes ds-busy { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
.ds-steps { list-style: none; margin: 14px 0 0; padding: 0; }
.ds-steps li { display: flex; align-items: center; gap: 10px; padding: 4px 0; color: var(--ds-text-3); }
.ds-steps li::before { content: ''; width: 8px; height: 8px; border-radius: 50%; border: 1.6px solid currentColor; }
.ds-steps li.done { color: var(--ds-text-2); }
.ds-steps li.done::before { background: var(--ds-signal); border-color: var(--ds-signal); }
.ds-steps li.now { color: var(--ds-text); }
.ds-steps li.now::before { border-color: var(--ds-signal); }
.ds-menu.pad [data-pad-focus]:not(.ds-tile) { outline: 2px solid var(--ds-signal); outline-offset: 2px; }
`;

export interface MenuCallbacks {
  /** Practice on the range, offline. */
  practiceRange(): void;
  /** Walk Survival Town, offline. */
  exploreTown(): void;
  /** Join the server with this name and passphrase; `mode` is the choice for an empty server. */
  playOnline(name: string, passphrase: string, mode: ModeId | null): void;
  /** Ask the lobby status endpoint again (Play Online, Retry). */
  refreshLobby(): Promise<LobbyInfo | null>;
  /** Give up joining. */
  cancelJoin(): void;
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
 * server (GitHub Pages), which hides Play Online.
 */
export type Lobby = { readonly kind: 'server'; readonly public: boolean; status?: LobbyInfo | null } | { readonly kind: 'link'; readonly url: string };

type Screen = 'main' | 'online' | 'loading' | 'connecting' | 'error' | 'pause' | 'settings' | 'tip';

/**
 * Every screen outside play: the main menu over the map's fly-through,
 * Play Online, loading and connecting with their progress, the connection
 * errors, pause and settings. Plain DOM; the range app decides what each
 * choice does. Mouse, keyboard and controller reach every control.
 */
export class Menu {
  readonly #root: HTMLDivElement;
  readonly #callbacks: MenuCallbacks;
  #settings: Settings;
  #screen: Screen = 'main';
  #back: Screen = 'main';
  #tab: 'controls' | 'bindings' | 'video' | 'interface' = 'controls';
  #error = '';
  /** The connection failure being shown: the driver's status, or null for a server that did not answer. */
  #failure: string | null = null;
  readonly #lobby: Lobby | null;
  readonly #version: string;
  #mode: ModeId = 'tdm';
  /** Loading: what, and how far (0-1, or null when unknown). */
  #loading: { title: string; progress: number | null } = { title: '', progress: null };
  /** Connecting: which step is under way. */
  #step = 0;
  #afterTip: (() => void) | null = null;
  readonly #padName: () => string | null;

  constructor(settings: Settings, callbacks: MenuCallbacks, options: { lobby: Lobby | null; version: string; padName?: () => string | null }) {
    this.#settings = settings;
    this.#callbacks = callbacks;
    this.#lobby = options.lobby;
    this.#version = options.version;
    this.#padName = options.padName ?? (() => null);
    installTheme();
    if (!document.getElementById('ds-menu-css')) {
      const style = document.createElement('style');
      style.id = 'ds-menu-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.#root = document.createElement('div');
    this.#root.className = 'ds-menu ds-ui';
    document.body.append(this.#root);
    // The focus ring is for the controller; the mouse hides it again.
    this.#root.addEventListener('mousemove', () => this.#root.classList.remove('pad'));
    this.#render();
  }

  get open(): boolean {
    return !this.#root.hidden;
  }

  /** The screen showing (whatever it is while hidden). */
  get screen(): Screen {
    return this.#screen;
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

  /** The loading screen, or its progress (0-1; null while unknown). */
  loading(title: string, progress: number | null): void {
    const same = this.#screen === 'loading' && this.open && this.#loading.title === title;
    this.#loading = { title, progress };
    if (!same) this.show('loading');
    const bar = this.#root.querySelector<HTMLElement>('.ds-progress');
    if (bar) {
      bar.classList.toggle('busy', progress === null);
      (bar.firstElementChild as HTMLElement).style.width = progress === null ? '' : `${Math.round(progress * 100)}%`;
    }
  }

  /** The connecting screen at step 0 (reaching the server), 1 (loading the map) or 2 (joining). */
  connecting(step: number): void {
    if (this.#screen === 'connecting' && this.open && step === this.#step) return;
    this.#step = step;
    this.show('connecting');
  }

  /** A failed or dropped connection, explained: the driver's status line, or null when the server did not answer. */
  failed(status: string | null): void {
    this.#failure = status;
    this.show('error');
  }

  /** New lobby status: the Play Online tile and screen follow it. */
  updateLobby(status: LobbyInfo | null): void {
    if (this.#lobby?.kind !== 'server') return;
    const changed = JSON.stringify(lobbyTile(this.#lobby.status ?? null)) !== JSON.stringify(lobbyTile(status));
    this.#lobby.status = status;
    // Only when what the screen shows changed, and keeping what is being typed.
    if (changed && this.open && (this.#screen === 'main' || this.#screen === 'online')) this.#rerender();
  }

  /** Renders the same screen again, keeping the text in its fields and the focused field's caret. */
  #rerender(): void {
    const before = [...this.#root.querySelectorAll('input')];
    const values = before.map((i) => i.value);
    const focused = before.findIndex((i) => i === document.activeElement);
    const caret = focused >= 0 ? before[focused]!.selectionStart : null;
    this.#render();
    const after = [...this.#root.querySelectorAll('input')];
    if (after.length !== before.length) return;
    after.forEach((i, k) => (i.value = values[k]!));
    if (focused < 0) return;
    // After the screen's own autofocus, which is queued the same way.
    queueMicrotask(() => {
      const input = after[focused]!;
      input.focus();
      if (caret !== null) input.setSelectionRange(caret, caret);
    });
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

  #controls(): HTMLElement[] {
    return [...this.#root.querySelectorAll<HTMLElement>('button, input, select, a[href]')].filter((e) => e.offsetParent !== null && !(e as HTMLButtonElement).disabled);
  }

  #navigate(nav: PadNav): void {
    const items = this.#controls();
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
        if (current instanceof HTMLInputElement && current.type !== 'range') {
          if (current.form) current.form.requestSubmit();
          else focus(focused + 1);
        } else if (current instanceof HTMLButtonElement || current instanceof HTMLAnchorElement) current.click();
        // A click that re-rendered the screen keeps the focus where it was on the same screen.
        if (this.open && !this.#root.contains(document.activeElement)) {
          const next = this.#controls();
          next[this.#screen === screen ? Math.min(focused, next.length - 1) : 0]?.focus();
        }
        return;
      }
      case 'back':
        if (this.#screen === 'pause') this.#callbacks.resume();
        else this.#root.querySelector<HTMLButtonElement>('[data-back]')?.click();
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
    const root = this.#root;
    root.replaceChildren();
    root.classList.toggle('home', this.#screen === 'main');
    root.classList.toggle('dim', this.#screen !== 'main');
    const screen = document.createElement('div');
    screen.className = 'ds-screen';
    root.append(screen);
    const h = (tag: string, text = '', cls = '') => {
      const e = document.createElement(tag);
      if (text) e.textContent = text;
      if (cls) e.className = cls;
      return e;
    };
    const panel = (cls = '') => {
      const p = h('div', '', `ds-panel ${cls}`);
      screen.append(p);
      return p;
    };
    const heading = (p: HTMLElement, text: string, iconName: string) => {
      const t = h('h2');
      t.innerHTML = `${icon(iconName)}<span>${escapeHtml(text)}</span>`;
      p.append(t);
    };
    const button = (p: HTMLElement, text: string, onClick: () => void, kind: 'primary' | 'back' | '' = '') => {
      const b = h('button', text, kind === 'primary' ? 'ds-btn primary' : 'ds-btn') as HTMLButtonElement;
      b.type = 'button';
      if (kind === 'back') b.dataset['back'] = '';
      b.addEventListener('click', onClick);
      p.append(b);
      return b;
    };
    switch (this.#screen) {
      case 'main':
        this.#renderMain(screen, h);
        break;
      case 'online': {
        const p = panel();
        this.#renderOnline(p, h, heading, button);
        break;
      }
      case 'loading': {
        const p = panel();
        heading(p, this.#loading.title, 'town');
        p.append(h('p', 'Building the map and its baked lighting.'));
        const bar = h('div', '', `ds-progress${this.#loading.progress === null ? ' busy' : ''}`);
        const fill = h('i');
        if (this.#loading.progress !== null) fill.style.width = `${Math.round(this.#loading.progress * 100)}%`;
        bar.append(fill);
        p.append(bar);
        break;
      }
      case 'connecting': {
        const p = panel();
        heading(p, 'Connecting', 'online');
        const bar = h('div', '', 'ds-progress busy');
        bar.append(h('i'));
        p.append(bar);
        const steps = h('ol', '', 'ds-steps');
        ['Reaching the server', 'Loading the map', 'Joining the match'].forEach((label, i) => steps.append(h('li', label, i < this.#step ? 'done' : i === this.#step ? 'now' : '')));
        p.append(steps);
        button(p, 'Cancel', () => this.#callbacks.cancelJoin(), 'back');
        break;
      }
      case 'error': {
        const e = connectionError(this.#failure);
        const p = panel('error');
        heading(p, e.title, 'alert');
        p.append(h('p', e.body));
        const row = h('div', '', 'ds-btns');
        p.append(row);
        if (e.kind === 'version') button(row, 'Reload', () => location.reload(), 'primary');
        else if (e.kind === 'down' || e.kind === 'full') button(row, 'Try again', () => this.#openOnline(), 'primary');
        else if (e.kind === 'idle') button(row, 'Join again', () => this.#openOnline(), 'primary');
        else button(row, 'Play Online', () => this.show('online'), 'primary');
        button(row, 'Main menu', () => this.show('main'), 'back');
        break;
      }
      case 'pause': {
        const p = panel();
        heading(p, 'Paused', 'settings');
        if (this.#error) p.append(h('div', this.#error, 'ds-error'));
        button(p, 'Resume', () => this.#callbacks.resume(), 'primary');
        button(p, 'Settings', () => {
          this.#back = 'pause';
          this.show('settings');
        });
        button(p, 'Leave', () => this.#callbacks.leave());
        p.append(h('div', 'WASD move · Shift sprint (double-tap: tactical) · C crouch/slide · Ctrl prone · Space jump/mantle · R reload (hold: inspect) · V melee · Tab scores · Esc menu', 'ds-hint'));
        p.append(h('div', 'Controller: L3 sprint (double-click: tactical) · ○ crouch/slide (hold: prone) · ✕ jump · □ reload (hold: inspect) · R3 melee · L2 aim · R2 fire · Touchpad scores · Options menu', 'ds-hint'));
        break;
      }
      case 'tip': {
        const p = panel();
        heading(p, 'Tip for Firefox', 'alert');
        p.append(
          h(
            'p',
            'Firefox cannot give the game raw mouse input, so Windows mouse acceleration applies. For consistent aim, turn off "Enhance pointer precision" in Windows mouse settings, or play in Chrome or Edge.',
          ),
        );
        button(
          p,
          'Got it',
          () => {
            this.#change({ firefoxTipShown: true });
            this.hide();
            this.#afterTip?.();
          },
          'primary',
        ).dataset['back'] = '';
        break;
      }
      case 'settings': {
        const p = panel('wide');
        this.#renderSettings(p, h, (text, onClick, primary) => button(p, text, onClick, primary ? 'primary' : ''));
        break;
      }
    }
    // Keep the controller's focus on screen: the first control of a new screen.
    // Queued last, after any focus a screen sets itself.
    if (this.#root.classList.contains('pad')) {
      queueMicrotask(() => {
        if (!this.#root.contains(document.activeElement) || document.activeElement === document.body) this.#controls()[0]?.focus();
        this.#markFocus();
      });
    }
  }

  #renderMain(screen: HTMLElement, h: (tag: string, text?: string, cls?: string) => HTMLElement): void {
    const brand = h('div', '', 'ds-brand');
    brand.innerHTML = `<h1>Duty <span>Shooter</span></h1><p class="ds-label">Survival Town · M4A1 · iron sights</p>`;
    screen.append(brand);
    // The Pages copy points at the public lobby, which runs on its own page.
    const lobbyLink = this.#lobby;
    if (lobbyLink?.kind === 'link') {
      const a = h('a', 'Play online at the public lobby →', 'ds-lobby-link') as HTMLAnchorElement;
      a.href = lobbyLink.url;
      brand.append(a);
    }

    // The name, remembered between visits.
    const nameBox = h('div', '', 'ds-name');
    const label = h('label');
    label.innerHTML = icon('user');
    const name = h('input') as HTMLInputElement;
    name.maxLength = 16;
    name.placeholder = 'Your name';
    name.value = this.#settings.name;
    name.setAttribute('aria-label', 'Name');
    name.setAttribute('autocomplete', 'nickname');
    name.addEventListener('change', () => this.#change({ name: name.value.trim().slice(0, 16) }));
    label.append(name);
    nameBox.append(h('div', 'Name', 'ds-label'), label);
    screen.append(nameBox);

    const lobby = this.#lobby;
    const dock = h('div', '', lobby?.kind === 'server' ? 'ds-dock' : 'ds-dock three');
    const tile = (iconName: string, title: string, desc: string, onClick: () => void, primary = false) => {
      const b = h('button', '', `ds-tile${primary ? ' primary' : ''}`) as HTMLButtonElement;
      b.type = 'button';
      b.innerHTML = `${icon(iconName)}<b>${escapeHtml(title)}</b><span class="desc">${escapeHtml(desc)}</span>`;
      b.addEventListener('click', onClick);
      dock.append(b);
      return b;
    };
    // The Pages copy has no server of its own: it offers only the offline entries.
    if (lobby?.kind === 'server') {
      const t = lobbyTile(lobby.status ?? null);
      const b = tile('online', 'Play Online', lobby.public ? 'The public lobby: anyone with the link can join.' : 'Join the server with its passphrase.', () => this.#openOnline(), true);
      b.insertAdjacentHTML(
        'beforeend',
        `<span class="ds-dot${t.online ? ' up' : ''}">${t.online ? (t.full ? 'Full' : 'Online') : 'Offline'}</span><div class="facts"><div><span class="ds-label">Players</span><span>${t.players}</span></div><div><span class="ds-label">Mode</span><span>${escapeHtml(t.mode)}</span></div><div><span class="ds-label">Map</span><span>${escapeHtml(t.map)}</span></div></div>`,
      );
    }
    tile('range', 'Practice Range', 'Lanes, dummies and the movement course. Offline.', () => this.#callbacks.practiceRange(), lobby?.kind !== 'server');
    tile('town', 'Explore Survival Town', 'Walk the map alone. Offline.', () => this.#callbacks.exploreTown());
    tile('settings', 'Settings', 'Controls, keys, video and interface.', () => {
      this.#back = 'main';
      this.show('settings');
    });
    screen.append(dock);
    screen.append(h('div', this.#version, 'ds-version'));
  }

  /** Play Online: asks for a fresh status first, so the screen shows the server as it is now. */
  #openOnline(): void {
    this.show('online');
    void this.#callbacks.refreshLobby().then((status) => this.updateLobby(status));
  }

  #renderOnline(
    p: HTMLElement,
    h: (tag: string, text?: string, cls?: string) => HTMLElement,
    heading: (p: HTMLElement, text: string, iconName: string) => void,
    button: (p: HTMLElement, text: string, onClick: () => void, kind?: 'primary' | 'back' | '') => HTMLButtonElement,
  ): void {
    const lobby = this.#lobby;
    const open = lobby?.kind === 'server' && lobby.public;
    const t = lobbyTile(lobby?.kind === 'server' ? (lobby.status ?? null) : null);
    heading(p, 'Play Online', 'online');
    const status = h('span', t.online ? (t.full ? 'Server full' : 'Server online') : 'Server not answering', `ds-dot${t.online ? ' up' : ''}`);
    p.append(status);
    const facts = h('div', '', 'ds-facts');
    facts.innerHTML = `<div><span class="ds-label">Players</span><span>${t.players}</span></div><div><span class="ds-label">Mode</span><span>${escapeHtml(t.mode)}</span></div><div><span class="ds-label">Map</span><span>${escapeHtml(t.map)}</span></div>`;
    p.append(facts);
    const form = h('form') as HTMLFormElement;
    p.append(form);
    if (t.pickMode) {
      form.append(h('h3', 'The server is empty: pick the mode'));
      const modes = h('div', '', 'ds-modes');
      for (const [mode, desc] of [
        ['tdm', 'Two teams, first to 75 kills.'],
        ['ffa', 'Everyone for themselves, first to 30.'],
      ] as const) {
        const b = h('button', '', `ds-mode${this.#mode === mode ? ' on' : ''}`) as HTMLButtonElement;
        b.type = 'button';
        b.innerHTML = `<b>${MODE_NAMES[mode]}</b><span>${desc}</span>`;
        b.addEventListener('click', () => {
          this.#mode = mode;
          for (const m of modes.children) m.classList.toggle('on', m === b);
        });
        modes.append(b);
      }
      form.append(modes);
    }
    const field = (label: string, input: HTMLInputElement) => {
      const wrap = h('label', '', 'ds-field');
      wrap.append(h('span', label, 'ds-label'), input);
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
    const row = h('div', '', 'ds-btns');
    const go = h('button', 'Join', 'ds-btn primary') as HTMLButtonElement;
    go.type = 'submit';
    go.disabled = t.full;
    row.append(go);
    form.append(row);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = name.value.trim().slice(0, 16);
      if (!n) {
        name.focus();
        return;
      }
      this.#change(open ? { name: n } : { name: n, passphrase: pass.value });
      this.#callbacks.playOnline(n, open ? '' : pass.value, t.pickMode ? this.#mode : null);
    });
    button(row, 'Back', () => this.show('main'), 'back');
    if (!this.#root.classList.contains('pad')) queueMicrotask(() => (name.value && !open ? pass : name).focus());
  }

  /** Marks the focused control for the controller's focus ring (the page may not have window focus, so :focus is not enough). */
  #markFocus(): void {
    for (const e of this.#root.querySelectorAll('[data-pad-focus]')) e.removeAttribute('data-pad-focus');
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.#root.contains(active)) active.dataset['padFocus'] = '';
  }

  #renderSettings(p: HTMLElement, h: (tag: string, text?: string, cls?: string) => HTMLElement, button: (text: string, onClick: () => void, primary?: boolean) => HTMLButtonElement): void {
    const s = this.#settings;
    { const t = h('h2'); t.innerHTML = `${icon('settings')}<span>Settings</span>`; p.append(t); }
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
      p.append(h('h3', 'Controller'), h('p', pad ? `Connected: ${padName(pad)}` : 'None detected. Connect a controller and press any button.'));
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
    button('Back', () => this.show(this.#back), true).dataset['back'] = '';
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
