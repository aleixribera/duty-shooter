import { LOBBY_MODES, teamMode, type LobbyPick, type LobbyState, type MatchResult, type ModeId, type PlayerId, type TeamScore } from '@duty-shooter/fps-core';
import type { PadNav } from '../gamepad';
import { MAP_NAMES, MODE_BLURBS, MODE_NAMES, lastMatch, lobbyFill, lobbySeats, matchSize, pingTone, randomLobbyPick } from './model';
import { escapeHtml, hint, icon, installTheme, patchHtml } from './theme';

const CSS = `
.ds-lobby { position: fixed; inset: 0; z-index: 18; font: 400 var(--ds-type-body)/1.4 var(--ds-font); }
.ds-lobby[hidden] { display: none; }
/* Loadout and Settings open over the page: it steps aside meanwhile rather than showing through. */
.ds-menu:not([hidden]) ~ .ds-lobby { visibility: hidden; }
.ds-lobby .body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 520px); gap: 56px; align-content: start; }
/* The seats: one row each, filled down the left column, then the right. Your seat is a step up with a bar in text colour (signal is kept for what you pick); an open seat is the one dashed frame. */
.ds-lobby .seats { display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: column; gap: 6px 16px; }
.ds-lobby .seat { display: flex; align-items: center; gap: 14px; min-height: 52px; padding: 6px 16px 6px 14px; background: var(--ds-panel); border: 1px solid transparent; }
.ds-lobby .seat .n { width: 22px; flex: none; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-lobby .seat .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ds-lobby .seat .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--ds-type-heading); line-height: 1.1; font-weight: 700; letter-spacing: 0.02em; }
.ds-lobby .seat .role { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-lobby .seat .ping { flex: none; font-size: var(--ds-type-small); font-weight: 700; }
.ds-lobby .seat .ping.good { color: var(--ds-good); } .ds-lobby .seat .ping.fair { color: var(--ds-fair); } .ds-lobby .seat .ping.poor { color: var(--ds-poor); }
.ds-lobby .seat.you { background: var(--ds-raised); box-shadow: inset 4px 0 0 var(--ds-text); }
.ds-lobby .seat.bot { background: rgb(18 22 29 / 0.6); }
.ds-lobby .seat.bot .name { font-size: var(--ds-type-body); font-weight: 400; letter-spacing: 0; color: var(--ds-text-2); }
.ds-lobby .seat.open { background: transparent; border: 1px dashed var(--ds-line-2); }
.ds-lobby .seat.open .name { font-size: var(--ds-type-body); font-weight: 400; letter-spacing: 0; color: var(--ds-text-2); }
.ds-lobby .note { margin: 14px 0 0; max-width: 64ch; font-size: var(--ds-type-body); color: var(--ds-text-2); }
.ds-lobby .last { margin-top: 40px; }
.ds-lobby .last .result { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 18px; padding: 14px 16px; background: var(--ds-panel); }
.ds-lobby .last .result b { font-size: var(--ds-type-heading); line-height: 1.1; letter-spacing: 0.03em; text-transform: uppercase; }
.ds-lobby .last .result span { font-size: var(--ds-type-small); color: var(--ds-text-2); }
/* The match: the maps as pictures, the mode's line, the picks. What is picked shows lit, so nothing repeats it. */
.ds-lobby .match { display: grid; gap: 18px; }
.ds-lobby .blurb { margin: -4px 0 0; font-size: var(--ds-type-body); color: var(--ds-text-2); }
.ds-lobby .picks { display: grid; gap: 18px; }
/* Five modes wrap two or three a row, the last row's buttons sharing its width: no empty cell. */
.ds-lobby .picks .modes { display: flex; flex-wrap: wrap; }
.ds-lobby .picks .modes button { flex: 1 1 150px; }
.ds-lobby .picks .ds-seg button { min-height: 44px; }
/* The maps as pictures, the picked one framed in signal. */
.ds-lobby .maps { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.ds-lobby .maps button { position: relative; display: flex; flex-direction: column-reverse; justify-content: flex-start; height: 128px; padding: 12px 14px; border: 1px solid var(--ds-line-2); background: var(--ds-raised) center / cover no-repeat; text-align: left; overflow: hidden; transition: border-color var(--ds-fast), opacity var(--ds-fast); }
/* The scrim behind the name, from the bottom edge. */
.ds-lobby .maps button::before { content: ''; position: absolute; inset: 0; background: linear-gradient(0deg, rgb(7 9 13 / 0.95) 0%, rgb(7 9 13 / 0.82) 55%, rgb(7 9 13 / 0.2) 100%); }
.ds-lobby .maps button b { position: relative; z-index: 1; }
.ds-lobby .maps button b { font-size: var(--ds-type-heading); line-height: 0.95; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; overflow-wrap: anywhere; }
.ds-lobby .maps button.on { border-color: var(--ds-signal); box-shadow: inset 0 0 0 1px var(--ds-signal); }
.ds-lobby .maps button:not(:disabled):not(.on):hover { border-color: var(--ds-text-2); }
.ds-lobby .maps button:focus-visible, .ds-lobby .maps button[data-pad-focus] { outline: 2px solid var(--ds-signal); outline-offset: 2px; }
.ds-lobby .picks.locked .ds-seg button:not(.on), .ds-lobby .maps.locked button:not(.on) { opacity: 0.55; }
.ds-lobby .invite { display: flex; }
.ds-lobby .invite input { flex: 1; min-width: 0; height: 44px; padding: 0 12px; font: inherit; font-size: var(--ds-type-body); color: var(--ds-text); background: var(--ds-ink); border: 1px solid var(--ds-line-2); border-right: 0; border-radius: 0; }
.ds-lobby .invite .ds-btn { border-radius: 0; }
.ds-lobby footer .ds-btn:not(.big) { min-width: 120px; }
@media (max-width: 960px) {
  .ds-lobby .ds-page { background: var(--ds-scrim); }
  .ds-lobby .body { grid-template-columns: minmax(0, 1fr); gap: 32px; }
  /* On a phone the match's picks come first: the seats are a list to scroll past, the picks are what you came to set. */
  .ds-lobby .match { order: -1; }
  .ds-lobby .seats { grid-template-columns: 1fr; grid-auto-flow: row; }
  .ds-lobby .seat { min-height: 46px; }
  .ds-lobby .seat .name { font-size: var(--ds-type-body); }
  .ds-lobby .maps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ds-lobby .maps button { height: 96px; }
  .ds-lobby footer .ds-btn:not(.big) { flex: 1; min-width: 0; padding: 0 10px; }
}
`;

/** A map the lobby can show: its name and, where there is one, a picture of it. */
export interface LobbyMap {
  readonly id: string;
  readonly name: string;
  readonly image: string | null;
}

/** What the lobby page shows: the lobby, and the match before (or under way). */
export interface LobbyView {
  readonly lobby: LobbyState;
  /** 'lobby' while waiting; anything else means a match has started without this player in it yet. */
  readonly phase: string;
  readonly selfId: PlayerId | null;
  readonly names: Readonly<Record<string, string>>;
  readonly pings: Readonly<Record<string, number>>;
  /** The last match: its mode, result and team totals. */
  readonly mode: ModeId;
  readonly result: MatchResult | null;
  readonly teamScores: readonly TeamScore[] | null;
  /** The name of the next match's map while its lighting is still on its way; null once it is in. */
  readonly loading: string | null;
  /** Bot Match: the same page offline, you alone against bots, with Back instead of Leave and no empty match. */
  readonly offline?: boolean;
  /** The connection dropped and is coming back: the picks and Start wait for it (ticket 38). */
  readonly reconnecting?: boolean;
}

export interface LobbyCallbacks {
  /** The host's picks for the next match. */
  pick(settings: LobbyPick): void;
  /** The host starts the match. */
  start(): void;
  /** Into the match that has started. */
  join(): void;
  loadout(): void;
  settings(): void;
  leave(): void;
}

/**
 * The lobby between matches, and Bot Match's setup: everyone in it with their
 * ping and the bots the match will bring, the host's picks (mode, sides,
 * match size, map) with the map's picture, the invite link, and the actions
 * along a footer that always shows Start. After every online match everyone
 * comes back here. Plain DOM, patched in place only when what it shows
 * changes, so its buttons stay put and clicks are never lost.
 */
export class LobbyPage {
  readonly #root: HTMLDivElement;
  readonly #callbacks: LobbyCallbacks;
  readonly #map: (id: string) => LobbyMap;
  /** The link that brings a friend here, shown with a Copy button; none when null. */
  invite: string | null = null;
  #html = '';
  /** Until when the invite's Copy button says Copied. */
  #copiedUntil = 0;
  #view: LobbyView | null = null;

  constructor(parent: HTMLElement, callbacks: LobbyCallbacks, options: { readonly map: (id: string) => LobbyMap }) {
    installTheme();
    if (!document.getElementById('ds-lobby-css')) {
      const style = document.createElement('style');
      style.id = 'ds-lobby-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.#callbacks = callbacks;
    this.#map = options.map;
    this.#root = document.createElement('div');
    this.#root.className = 'ds-lobby ds-ui';
    this.#root.hidden = true;
    this.#root.addEventListener('click', (e) => this.#click(e));
    this.#root.addEventListener('pointermove', () => this.#root.classList.remove('pad'));
    document.addEventListener('keydown', (e) => this.#key(e));
    parent.append(this.#root);
  }

  get open(): boolean {
    return !this.#root.hidden;
  }

  /** Whether the page shows Bot Match's setup. */
  get offline(): boolean {
    return this.open && this.#view?.offline === true;
  }

  /** Shows the lobby as `view` has it (cheap to call every frame). */
  show(view: LobbyView): void {
    this.#view = view;
    const opening = this.#root.hidden;
    this.#root.hidden = false;
    const html = this.#render(view);
    // Each time the page opens it starts at its top: your seat, not where Bot Match was last scrolled to.
    if (opening) this.#root.querySelector('.body')?.scrollTo(0, 0);
    if (html === this.#html && !opening) return;
    const focused = this.#root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset['key'] : undefined;
    this.#html = html;
    // Patched in place, not rebuilt: pings change every second online, and a rebuild between press and release lost the click.
    patchHtml(this.#root, html);
    // The same control keeps the focus where a control was replaced.
    if (focused && document.activeElement?.getAttribute('data-key') !== focused) this.#root.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
    // Opening, the way on has the focus (Start, or Join), or the first control while it waits: Enter and a controller's Cross do what the lit button says.
    if (opening && !this.#root.contains(document.activeElement)) (this.#root.querySelector<HTMLElement>('[data-key="start"]:not(:disabled)') ?? this.#root.querySelector<HTMLElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    this.#markFocus();
  }

  hide(): void {
    this.#root.hidden = true;
  }

  /** Controller navigation: up and down (and left and right) through the controls, accept presses, back leaves Bot Match. */
  navigate(nav: PadNav): void {
    if (!this.open) return;
    this.#root.classList.add('pad');
    const items = [...this.#root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (nav === 'accept') items[i]?.click();
    else if (nav === 'back') {
      if (this.#view?.offline) this.#callbacks.leave();
    } else if (nav === 'up' || nav === 'left') items[i <= 0 ? items.length - 1 : i - 1]?.focus();
    else if (nav === 'down' || nav === 'right') items[i < 0 ? 0 : (i + 1) % items.length]?.focus();
    this.#markFocus();
  }

  #markFocus(): void {
    for (const e of this.#root.querySelectorAll('[data-pad-focus]')) e.removeAttribute('data-pad-focus');
    const active = document.activeElement;
    if (this.#root.classList.contains('pad') && active instanceof HTMLElement && this.#root.contains(active)) active.dataset['padFocus'] = '';
  }

  #click(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const act = el.dataset['act'];
    const value = el.dataset['value'] ?? '';
    if (act === 'mode') this.#callbacks.pick({ mode: value as ModeId });
    else if (act === 'fill') this.#callbacks.pick({ fill: value === 'on' });
    else if (act === 'hvb') this.#callbacks.pick({ hvb: value === 'on' });
    else if (act === 'map') this.#callbacks.pick({ map: value });
    else if (act === 'random' && this.#view) {
      const pick = randomLobbyPick(this.#view.lobby);
      if (pick) this.#callbacks.pick(pick);
    }
    else if (act === 'start') this.#callbacks.start();
    else if (act === 'join') this.#callbacks.join();
    else if (act === 'loadout') this.#callbacks.loadout();
    else if (act === 'settings') this.#callbacks.settings();
    else if (act === 'leave') this.#callbacks.leave();
    else if (act === 'copy' && this.invite) {
      void navigator.clipboard?.writeText(this.invite).catch(() => {});
      this.#copiedUntil = performance.now() + 1500;
      if (this.#view) this.show(this.#view);
      setTimeout(() => this.#view && this.open && this.show(this.#view), 1600);
    }
  }

  /**
   * The host's hidden size control: + and - add or take away a bot a side,
   * over the map's team size, until the map or mode changes (or Bots is
   * switched). Nothing on the page mentions it.
   */
  #key(e: KeyboardEvent): void {
    const v = this.#view;
    if (!v || !this.open || e.repeat || e.ctrlKey || e.metaKey || e.altKey || getComputedStyle(this.#root).visibility === 'hidden') return;
    const l = v.lobby;
    const step = e.key === '+' || e.key === '=' ? 1 : e.key === '-' || e.key === '_' ? -1 : 0;
    if (step === 0 || l.host === null || l.host !== v.selfId || v.phase !== 'lobby' || l.maxBots <= 0 || (l.hvb && teamMode(l.mode))) return;
    const bots = Math.max(v.offline ? 1 : 0, Math.min(l.maxBots, l.bots + step));
    if (bots !== l.bots) this.#callbacks.pick({ bots });
  }

  #render(v: LobbyView): string {
    const l = v.lobby;
    const offline = v.offline === true;
    const host = l.host !== null && l.host === v.selfId;
    const people = l.players.length;
    const underway = v.phase !== 'lobby';
    const reconnecting = v.reconnecting === true && !offline;
    // The host's picks go to the server: none while the connection is coming back.
    const picking = host && !underway && !reconnecting;
    const peopleText = `${people} ${people === 1 ? 'player' : 'players'}`;

    const seatList = lobbySeats(l, v.selfId, v.names, v.pings);
    const bots = seatList.filter((s) => s.bot).length;
    // Offline nobody else can join: no open seats, only the players the match has.
    const shown = offline ? seatList.filter((s) => s.bot || s.id !== null) : seatList;
    const seats = shown
      .map((s) => {
        if (s.bot) return `<div class="seat bot"><span class="n">${pad(s.number)}</span><span class="who"><span class="name">Bot</span></span></div>`;
        if (s.id === null) return `<div class="seat open"><span class="n">${pad(s.number)}</span><span class="who"><span class="name">Open seat</span></span></div>`;
        const ping = s.ping === null || offline ? '' : `<span class="ping ${pingTone(s.ping)}">${s.ping} ms</span>`;
        // Who this seat is to you, in words under the name: You, Host, or both.
        const role = offline ? '' : [s.you ? 'You' : '', s.host ? 'Host' : ''].filter(Boolean).join(' · ');
        return `<div class="seat${s.you ? ' you' : ''}"><span class="n">${pad(s.number)}</span><span class="who"><span class="name">${escapeHtml(s.name)}</span>${role ? `<span class="role">${role}</span>` : ''}</span>${ping}</div>`;
      })
      .join('');
    // Rows fill the left column first, then the right.
    const rows = Math.ceil(Math.max(offline ? shown.length : l.capacity, 1) / 2);
    const last = lastMatch(v.result, v.mode, v.teamScores);
    const lastHtml = last
      ? `<section class="last"><h2 class="ds-h2">Last match</h2><div class="result"><b>${escapeHtml(last.headline)}</b><span>${escapeHtml(last.detail)}</span></div></section>`
      : '';

    const lock = picking ? '' : ' disabled';
    // `act` may name an extra class after the action: "mode modes".
    const seg = (actClass: string, items: readonly (readonly [string, string, boolean])[]) => {
      const [act, cls] = actClass.split(' ');
      return `<div class="ds-seg${cls ? ` ${cls}` : ''}">${items.map(([value, label, on]) => `<button type="button" data-act="${act}" data-value="${value}" data-key="${act}-${value}" class="${on ? 'on' : ''}" aria-pressed="${on}"${lock}>${escapeHtml(label)}</button>`).join('')}</div>`;
    };
    const modes = seg(
      'mode modes',
      LOBBY_MODES.map((m) => [m, MODE_NAMES[m] ?? m, m === l.mode] as const),
    );
    // Humans vs bots is a choice in team modes; it sizes the bot team itself.
    const sides = l.maxBots > 0 && teamMode(l.mode);
    const hvb = sides && l.hvb;
    const versus = sides
      ? `<div><span class="ds-field-label">Sides</span>${seg(
          'hvb',
          (['off', 'on'] as const).map((s) => [s, s === 'on' ? 'Humans vs bots' : 'Mixed teams', (s === 'on') === l.hvb] as const),
        )}</div>`
      : '';
    // Bots fill to the map's team size for the mode. Offline there is always someone to play, so no switch.
    const fillBots = l.bots > 0;
    const size =
      l.maxBots > 0 && !hvb && !offline
        ? `<div><span class="ds-field-label">Bots</span>${seg(
            'fill',
            (['off', 'on'] as const).map((s) => [s, s === 'on' ? `On · ${fillBots ? matchSize(l.mode, l.bots) : 'fill'}` : 'Off', (s === 'on') === fillBots] as const),
          )}</div>`
        : '';
    const maps = l.maps
      .map((id) => {
        const m = this.#map(id);
        const on = id === l.map;
        return `<button type="button" data-act="map" data-value="${id}" data-key="map-${id}" class="${on ? 'on' : ''}" style="${m.image ? `background-image:url('${m.image}')` : ''}" aria-pressed="${on}"${lock}><b>${escapeHtml(m.name)}</b></button>`;
      })
      .join('');
    const copied = performance.now() < this.#copiedUntil;
    const invite = this.invite && !offline
      ? `<div><span class="ds-field-label">Invite link</span><div class="invite"><input readonly value="${escapeHtml(this.invite)}" aria-label="Invite link"><button type="button" class="ds-btn" data-act="copy" data-key="copy" aria-live="polite">${copied ? 'Copied' : 'Copy'}</button></div></div>`
      : '';
    const hostName = l.host === null ? null : (v.names[l.host] ?? l.host);
    const start = reconnecting
      ? `<button type="button" class="ds-btn primary big" disabled>Reconnecting…</button>`
      : underway
      ? v.loading
        ? `<button type="button" class="ds-btn primary big" disabled>Loading ${escapeHtml(v.loading)}…</button>`
        : `<button type="button" class="ds-btn primary big" data-act="join" data-key="start">Join the match</button>`
      : host
        ? `<button type="button" class="ds-btn primary big" data-act="start" data-key="start">Start</button>`
        : `<button type="button" class="ds-btn primary big" disabled>Waiting for the host</button>`;
    // The connection line: a dot for the state and what it means for you.
    // Offline there is no connection to speak of: the roster says who plays.
    const who = reconnecting ? 'Lost the connection. Reconnecting…' : offline ? '' : underway ? 'The match has started: join it now' : host ? 'You are the host: the picks and Start are yours' : hostName ? `${escapeHtml(hostName)} is the host and picks the match` : 'Waiting for a host';
    const state = reconnecting ? 'busy' : offline || host || underway ? 'up' : 'wait';
    const fill = offline && hvb ? `You on Blue against ${bots} bots on Orange.` : offline ? `Bots fill the match to ${matchSize(l.mode, l.bots)}.` : lobbyFill(l);
    const hints = `<div class="ds-hints grow">${hint('↑↓', '✥', 'Move')}${hint('Enter', '✕', 'Select')}</div>`;

    return `<div class="ds-page">
<header><div class="heading"><h1>${offline ? 'Bot Match' : 'Lobby'}</h1></div>
<div class="aside">${who ? `<span class="ds-state ${state}" role="status">${who}</span>` : ''}</div></header>
<div class="body">
<section><h2 class="ds-h2">Players${offline ? '' : ` <small>${peopleText}${bots > 0 ? ` + ${bots} ${bots === 1 ? 'bot' : 'bots'}` : ''} · ${people + bots} of ${l.capacity} seats</small>`}</h2><div class="seats" style="grid-template-rows: repeat(${rows}, auto)">${seats}</div><p class="note">${escapeHtml(fill)}</p>${lastHtml}</section>
<aside class="match">
<h2 class="ds-h2" style="margin:0">Match${underway ? ' <small>Under way</small>' : ''}</h2>
<div class="maps${picking ? '' : ' locked'}">${maps}</div>
<button type="button" class="ds-btn random" data-act="random" data-key="random"${picking && l.maps.length ? '' : ' disabled'}>Random map &amp; mode</button>
<div class="picks${picking ? '' : ' locked'}"><div><span class="ds-field-label">Mode</span>${modes}</div><p class="blurb">${escapeHtml(MODE_BLURBS[l.mode] ?? '')}</p>${versus}${size}${invite}</div>
</aside>
</div>
<footer><button type="button" class="ds-btn" data-act="leave" data-key="leave">${icon('back')}${offline ? 'Back' : 'Leave'}</button><button type="button" class="ds-btn" data-act="loadout" data-key="loadout">Loadout</button><button type="button" class="ds-btn" data-act="settings" data-key="settings">Settings</button>
${hints}${start}</footer>
</div>`;
  }
}

/** Two-digit seat numbers: 01, 02 ... */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** A map's display name from its id, for the lobby when the page has nothing better. */
export function lobbyMapName(id: string): string {
  return MAP_NAMES[id] ?? id;
}
