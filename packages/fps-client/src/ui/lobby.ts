import { MODE_IDS, teamMode, type LobbyPick, type LobbyState, type MatchResult, type ModeId, type PlayerId, type TeamScore } from '@duty-shooter/fps-core';
import type { PadNav } from '../gamepad';
import { MAP_NAMES, MODE_BLURBS, MODE_NAMES, lastMatch, lobbyFill, lobbySeats, matchSize, pingTone } from './model';
import { escapeHtml, hint, icon, installTheme, patchHtml } from './theme';

const CSS = `
.ds-lobby { position: fixed; inset: 0; z-index: 18; font: 400 15px/1.35 var(--ds-font); animation: ds-fade 120ms ease-out; }
.ds-lobby[hidden] { display: none; }
/* Loadout and Settings open over the page: it steps aside meanwhile rather than showing through. */
.ds-menu:not([hidden]) ~ .ds-lobby { visibility: hidden; }
.ds-lobby .body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 500px); gap: 40px; align-content: start; }
.ds-lobby .seats { display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: column; gap: 6px 20px; }
.ds-lobby .seat { display: flex; align-items: center; gap: 14px; height: 44px; padding: 0 14px; background: rgb(18 22 29 / 0.82); border: 1px solid transparent; border-left: 3px solid transparent; }
.ds-lobby .seat .n { width: 20px; font-size: 12px; color: var(--ds-text-3); }
.ds-lobby .seat .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 19px; font-weight: 700; letter-spacing: 0.02em; }
.ds-lobby .seat .ping { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; }
.ds-lobby .seat .ping.good { color: var(--ds-good); } .ds-lobby .seat .ping.fair { color: var(--ds-fair); } .ds-lobby .seat .ping.poor { color: var(--ds-poor); }
.ds-lobby .tag { padding: 3px 7px 2px; font-size: 10px; font-weight: 700; letter-spacing: 0.14em; border: 1px solid var(--ds-line-2); color: var(--ds-text-2); }
.ds-lobby .tag.host { background: var(--ds-gold); border-color: var(--ds-gold); color: #17130a; }
.ds-lobby .tag.you { background: var(--ds-signal); border-color: var(--ds-signal); color: var(--ds-signal-ink); }
.ds-lobby .seat.you { background: linear-gradient(90deg, rgb(143 227 200 / 0.2), rgb(143 227 200 / 0.06)); border-color: rgb(143 227 200 / 0.35); border-left-color: var(--ds-signal); }
.ds-lobby .seat.bot { background: rgb(18 22 29 / 0.55); }
.ds-lobby .seat.bot .name { font-size: 15px; font-weight: 400; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ds-text-2); }
.ds-lobby .seat.bot .ds-icon { width: 18px; height: 18px; color: var(--ds-text-3); }
.ds-lobby .seat.open { background: rgb(18 22 29 / 0.3); border: 1px dashed var(--ds-line); }
.ds-lobby .seat.open .name { font-size: 12px; font-weight: 400; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-lobby .note { display: flex; gap: 10px; align-items: flex-start; margin: 16px 0 0; padding: 12px 14px; background: rgb(18 22 29 / 0.6); border-left: 2px solid var(--ds-line-2); font-size: 14px; color: var(--ds-text-2); }
.ds-lobby .last { margin-top: 36px; }
.ds-lobby .last .result { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 18px; padding: 14px 16px; background: rgb(18 22 29 / 0.82); }
.ds-lobby .last .result b { font-size: 22px; letter-spacing: 0.04em; text-transform: uppercase; }
.ds-lobby .last .result span { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-lobby .blurb { margin: 12px 0 16px; font-size: 14px; color: var(--ds-text-2); }
.ds-lobby .picks { display: grid; gap: 16px; padding: 18px; background: rgb(18 22 29 / 0.72); border: 1px solid var(--ds-line); }
.ds-lobby .picks .ds-seg { grid-template-columns: repeat(auto-fit, minmax(56px, 1fr)); }
/* The maps as pictures: the picked one framed in signal with the mode over it. Name first in the markup (scripts click by it), shown under the kicker. */
.ds-lobby .maps { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
.ds-lobby .maps button { position: relative; display: flex; flex-direction: column-reverse; justify-content: flex-start; height: 136px; padding: 12px 14px; border: 1px solid var(--ds-line-2); background: #2b2a26 center / cover no-repeat; text-align: left; overflow: hidden; transition: border-color 100ms, opacity 100ms, box-shadow 100ms; }
.ds-lobby .maps button::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgb(8 10 14 / 0.05) 20%, rgb(8 10 14 / 0.88) 100%); }
.ds-lobby .maps button b, .ds-lobby .maps button small { position: relative; z-index: 1; text-shadow: 0 1px 4px rgb(0 0 0 / 0.7); }
.ds-lobby .maps button b { font-size: 26px; line-height: 0.95; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
.ds-lobby .maps button small { margin-bottom: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ds-text-2); }
.ds-lobby .maps button.on { border-color: var(--ds-signal); box-shadow: inset 0 0 0 1px var(--ds-signal); }
.ds-lobby .maps button.on small { color: var(--ds-signal); }
.ds-lobby .maps button:not(:disabled):not(.on):hover { border-color: var(--ds-text-2); }
.ds-lobby .maps button:focus-visible, .ds-lobby .maps button[data-pad-focus] { outline: 2px solid var(--ds-signal); outline-offset: 2px; }
.ds-lobby .picks.locked .ds-seg button:not(.on), .ds-lobby .maps.locked button:not(.on) { opacity: 0.5; }
.ds-lobby .invite { display: flex; gap: 8px; margin-top: 16px; }
.ds-lobby .invite input { flex: 1; min-width: 0; height: 44px; padding: 0 12px; font: inherit; font-size: 14px; color: var(--ds-text); background: rgb(11 14 19 / 0.92); border: 1px solid var(--ds-line); border-radius: 2px; }
.ds-lobby .who { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); text-align: right; }
.ds-lobby footer .ds-btn:not(.big) { min-width: 120px; }
@media (max-width: 960px) {
  .ds-lobby .body { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .ds-lobby .seats { grid-template-columns: 1fr; grid-auto-flow: row; }
  .ds-lobby .maps button { height: 104px; }
  .ds-lobby .who { display: none; }
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
    this.#root.hidden = false;
    const html = this.#render(view);
    if (html === this.#html) return;
    const focused = this.#root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset['key'] : undefined;
    this.#html = html;
    // Patched in place, not rebuilt: pings change every second online, and a rebuild between press and release lost the click.
    patchHtml(this.#root, html);
    // The same control keeps the focus where a control was replaced.
    if (focused && document.activeElement?.getAttribute('data-key') !== focused) this.#root.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
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
    else if (act === 'bots') this.#callbacks.pick({ bots: Number(value) });
    else if (act === 'hvb') this.#callbacks.pick({ hvb: value === 'on' });
    else if (act === 'map') this.#callbacks.pick({ map: value });
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

  #render(v: LobbyView): string {
    const l = v.lobby;
    const offline = v.offline === true;
    const host = l.host !== null && l.host === v.selfId;
    const map = this.#map(l.map);
    const modeName = MODE_NAMES[l.mode] ?? l.mode;
    const people = l.players.length;
    const underway = v.phase !== 'lobby';
    const peopleText = `${people} ${people === 1 ? 'player' : 'players'}`;

    const seatList = lobbySeats(l, v.selfId, v.names, v.pings);
    const bots = seatList.filter((s) => s.bot).length;
    const seats = seatList
      .map((s) => {
        if (s.bot) return `<div class="seat bot"><span class="n">${pad(s.number)}</span>${icon('bots')}<span class="name">Bot</span></div>`;
        if (s.id === null) return `<div class="seat open"><span class="n">${pad(s.number)}</span><span class="name">Open seat</span></div>`;
        const ping = s.ping === null || offline ? '' : `<span class="ping ${pingTone(s.ping)}">${s.ping} MS</span>`;
        const tags = `${s.host && !offline ? '<span class="tag host">HOST</span>' : ''}${s.you ? '<span class="tag you">YOU</span>' : ''}`;
        return `<div class="seat${s.you ? ' you' : ''}"><span class="n">${pad(s.number)}</span><span class="name">${escapeHtml(s.name)}</span>${ping}${tags}</div>`;
      })
      .join('');
    // Rows fill the left column first, then the right.
    const rows = Math.ceil(Math.max(l.capacity, 1) / 2);
    const last = lastMatch(v.result, v.mode, v.teamScores);
    const lastHtml = last
      ? `<section class="last"><h2 class="ds-h2">Last match</h2><div class="result"><b>${escapeHtml(last.headline)}</b><span>${escapeHtml(last.detail)}</span></div></section>`
      : '';

    const lock = host && !underway ? '' : ' disabled';
    const seg = (act: string, items: readonly (readonly [string, string, boolean])[]) =>
      `<div class="ds-seg">${items.map(([value, label, on]) => `<button type="button" data-act="${act}" data-value="${value}" data-key="${act}-${value}" class="${on ? 'on' : ''}"${lock}>${escapeHtml(label)}</button>`).join('')}</div>`;
    const modes = seg(
      'mode',
      MODE_IDS.map((m) => [m, MODE_NAMES[m] ?? m, m === l.mode] as const),
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
    // Offline there is always someone to play: the size starts at one a side.
    const sizes = Array.from({ length: l.maxBots + 1 }, (_, n) => n).filter((n) => !offline || n > 0);
    const size =
      l.maxBots > 0 && !hvb
        ? `<div><span class="ds-field-label">Match size</span>${seg(
            'bots',
            sizes.map((n) => [String(n), n === 0 ? 'None' : matchSize(l.mode, n), n === l.bots] as const),
          )}</div>`
        : '';
    const maps = l.maps
      .map((id) => {
        const m = this.#map(id);
        const on = id === l.map;
        return `<button type="button" data-act="map" data-value="${id}" data-key="map-${id}" class="${on ? 'on' : ''}" style="${m.image ? `background-image:url('${m.image}')` : ''}"${lock}><b>${escapeHtml(m.name)}</b><small>${on ? `✓ ${escapeHtml(modeName)}` : 'Map'}</small></button>`;
      })
      .join('');
    const copied = performance.now() < this.#copiedUntil;
    const invite = this.invite && !offline
      ? `<div class="picks" style="margin-top:16px"><div><span class="ds-field-label">Invite link: anyone with it can join</span><div class="invite" style="margin:0"><input readonly value="${escapeHtml(this.invite)}" aria-label="Invite link"><button type="button" class="ds-btn" data-act="copy" data-key="copy">${copied ? 'Copied' : 'Copy'}</button></div></div></div>`
      : '';
    const hostName = l.host === null ? null : (v.names[l.host] ?? l.host);
    const start = underway
      ? v.loading
        ? `<button type="button" class="ds-btn primary big" disabled>Loading ${escapeHtml(v.loading)}…</button>`
        : `<button type="button" class="ds-btn primary big" data-act="join" data-key="start">Join the match</button>`
      : host
        ? `<button type="button" class="ds-btn primary big" data-act="start" data-key="start">Start</button>`
        : `<button type="button" class="ds-btn primary big" disabled>Waiting for the host</button>`;
    const who = offline ? `${bots} ${bots === 1 ? 'bot' : 'bots'} · offline` : underway ? 'The match has started' : host ? 'You are the host' : hostName ? `${escapeHtml(hostName)} is the host` : '';
    const fill = offline && hvb ? `You on Blue against ${bots} bots on Orange.` : offline ? `Bots fill the match to ${matchSize(l.mode, l.bots)}. The match pauses with the game.` : lobbyFill(l);
    const hints = `<div class="ds-hints grow">${hint('↑↓', '✥', 'Move')}${hint('Enter', '✕', 'Select')}${offline ? hint('Esc', '○', 'Back') : ''}</div>`;

    return `<div class="ds-page">
<header><div class="heading"><div class="ds-crumb">${offline ? 'Offline · Play' : 'Online · Play'}</div><h1>${offline ? 'Bot Match' : 'Lobby'}</h1></div>
<div class="aside"><span class="ds-chip">${escapeHtml(modeName)}</span><span class="ds-chip">${escapeHtml(map.name)}</span><span class="ds-chip"><b>${offline ? 'You' : peopleText}</b>${bots > 0 ? ` + ${bots} ${bots === 1 ? 'bot' : 'bots'}` : ''}</span></div></header>
<div class="body">
<section><h2 class="ds-h2">Players <small>${offline ? `You + ${bots} ${bots === 1 ? 'bot' : 'bots'}` : `${peopleText}${bots > 0 ? ` + ${bots} ${bots === 1 ? 'bot' : 'bots'}` : ''} · ${people + bots} / ${l.capacity}`}</small></h2><div class="seats" style="grid-template-rows: repeat(${rows}, auto)">${seats}</div><p class="note">${escapeHtml(fill)}</p>${lastHtml}</section>
<aside>
<h2 class="ds-h2">Match <small>${host ? (underway ? 'Under way' : 'Your pick') : 'The host picks'}</small></h2>
<div class="maps${host && !underway ? '' : ' locked'}">${maps}</div>
<p class="blurb">${escapeHtml(MODE_BLURBS[l.mode] ?? '')}</p>
<div class="picks${host && !underway ? '' : ' locked'}"><div><span class="ds-field-label">Mode</span>${modes}</div>${versus}${size}</div>
${invite}
</aside>
</div>
<footer><button type="button" class="ds-btn" data-act="leave" data-key="leave">${icon('back')}${offline ? 'Back' : 'Leave'}</button><button type="button" class="ds-btn" data-act="loadout" data-key="loadout">Loadout</button><button type="button" class="ds-btn" data-act="settings" data-key="settings">Settings</button>
${hints}<span class="who">${who}</span>${start}</footer>
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
