import { MODE_IDS, type LobbyState, type MatchResult, type ModeId, type PlayerId, type TeamScore } from '@duty-shooter/fps-core';
import type { PadNav } from '../gamepad';
import { MAP_NAMES, MODE_BLURBS, MODE_NAMES, lastMatch, lobbySeats, matchSize, pingTone } from './model';
import { escapeHtml, installTheme } from './theme';

const CSS = `
.ds-lobby { --gold: #f2c230; --gold-ink: #17130a; --row: rgb(18 22 29 / 0.78); --good: #7fdc6a; --fair: #f2c230; --poor: #ff5d52;
  position: fixed; inset: 0; z-index: 18; overflow-y: auto; font: 400 15px/1.35 var(--ds-font); color: var(--ds-text);
  background: linear-gradient(90deg, rgb(8 10 14 / 0.9) 0%, rgb(8 10 14 / 0.72) 60%, rgb(8 10 14 / 0.86) 100%); backdrop-filter: blur(2px); animation: ds-in 180ms ease-out; }
.ds-lobby[hidden] { display: none; }
.ds-lobby header.top { display: flex; align-items: baseline; gap: 24px; padding: 26px 56px 18px; border-bottom: 1px solid var(--ds-line); }
.ds-lobby header.top h1 { margin: 0; font-size: 44px; line-height: 1; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
.ds-lobby header.top .sub { flex: 1; font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-lobby header.top .count { font-size: 13px; letter-spacing: 0.16em; color: var(--ds-text-3); }
.ds-lobby .body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 560px); gap: 40px; padding: 30px 56px 40px; }
.ds-lobby h2 { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 14px; padding-bottom: 12px; border-bottom: 2px solid var(--ds-line);
  font-size: 22px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
.ds-lobby h2 small { font-size: 15px; font-weight: 400; letter-spacing: 0.08em; color: var(--ds-text-3); }
.ds-lobby .seats { display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: column; gap: 6px 24px; }
.ds-lobby .seat { display: flex; align-items: center; gap: 16px; height: 46px; padding: 0 16px; background: var(--row); border: 1px solid transparent; }
.ds-lobby .seat .n { width: 22px; font-size: 13px; color: var(--ds-text-3); }
.ds-lobby .seat .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 21px; font-weight: 700; }
.ds-lobby .seat .ping { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; }
.ds-lobby .seat .ping.good { color: var(--good); } .ds-lobby .seat .ping.fair { color: var(--fair); } .ds-lobby .seat .ping.poor { color: var(--poor); }
.ds-lobby .tag { padding: 3px 7px 2px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; border: 1px solid var(--ds-line); color: var(--ds-text-2); }
.ds-lobby .tag.host { background: var(--gold); border-color: var(--gold); color: var(--gold-ink); }
.ds-lobby .seat.you { background: linear-gradient(90deg, rgb(242 194 48 / 0.32), rgb(242 194 48 / 0.12)); border-color: rgb(242 194 48 / 0.55); }
.ds-lobby .seat.open { background: rgb(18 22 29 / 0.35); border: 1px dashed var(--ds-line); }
.ds-lobby .seat.open .name { font-size: 13px; font-weight: 400; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-lobby .note { margin: 16px 0 0; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-lobby .last { margin-top: 44px; }
.ds-lobby .last .result { display: flex; align-items: baseline; gap: 18px; padding: 14px 16px; background: var(--row); }
.ds-lobby .last .result b { font-size: 24px; letter-spacing: 0.04em; text-transform: uppercase; }
.ds-lobby .last .result span { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-lobby .card { position: relative; height: 240px; overflow: hidden; border: 1px solid rgb(243 241 234 / 0.25); background: #2b2a26 center / cover no-repeat; }
.ds-lobby .card::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 25%, rgb(8 10 14 / 0.6) 55%, rgb(8 10 14 / 0.92) 100%); }
.ds-lobby .card .text { position: absolute; left: 20px; bottom: 16px; z-index: 1; text-shadow: 0 1px 4px rgb(0 0 0 / 0.6); }
.ds-lobby .card .kicker { font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
.ds-lobby .card .map { margin: 2px 0 0; font-size: 56px; line-height: 0.95; font-weight: 700; text-transform: uppercase; }
.ds-lobby .blurb { margin: 14px 0 18px; color: var(--ds-text-2); }
.ds-lobby .picks { padding: 18px 20px; background: rgb(18 22 29 / 0.7); border: 1px solid var(--ds-line); }
.ds-lobby .label { display: block; margin: 0 0 8px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-lobby .label + .seg, .ds-lobby .label + .maps { margin-bottom: 16px; }
.ds-lobby .seg { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 1px; background: var(--ds-line); border: 1px solid var(--ds-line); }
.ds-lobby button { font: inherit; color: inherit; cursor: pointer; }
.ds-lobby button:disabled { cursor: default; }
.ds-lobby .seg button { padding: 9px 6px; border: 0; background: rgb(11 14 19 / 0.9); font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ds-text-2); }
.ds-lobby .seg button.on { background: var(--ds-text); color: var(--ds-ink); }
.ds-lobby .seg button:not(:disabled):not(.on):hover { background: var(--ds-raised); color: var(--ds-text); }
.ds-lobby .maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.ds-lobby .maps button { position: relative; height: 68px; padding: 0; border: 2px solid transparent; background: #2b2a26 center / cover no-repeat; text-align: left; }
.ds-lobby .maps button span { position: absolute; left: 8px; bottom: 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; text-shadow: 0 1px 3px rgb(0 0 0 / 0.9); }
.ds-lobby .maps button.on { border-color: var(--gold); }
.ds-lobby .picks.locked .seg button:not(.on), .ds-lobby .picks.locked .maps button:not(.on) { opacity: 0.55; }
.ds-lobby .invite { margin-top: 18px; padding: 18px 20px; background: rgb(18 22 29 / 0.7); border: 1px solid var(--ds-line); }
.ds-lobby .invite .row { display: flex; gap: 8px; }
.ds-lobby .invite input { flex: 1; min-width: 0; padding: 10px 12px; font: inherit; font-size: 14px; color: var(--ds-text); background: rgb(11 14 19 / 0.9); border: 1px solid var(--ds-line); }
.ds-lobby .invite button { padding: 0 16px; border: 1px solid var(--ds-line); background: var(--ds-raised); font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
.ds-lobby .start { display: block; width: 100%; margin-top: 18px; height: 68px; border: 0; background: var(--gold); color: var(--gold-ink); font-size: 30px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
.ds-lobby .start:not(:disabled):hover { filter: brightness(1.08); }
.ds-lobby .start:disabled { background: rgb(242 194 48 / 0.16); color: rgb(242 194 48 / 0.75); border: 1px solid rgb(242 194 48 / 0.35); font-size: 20px; }
.ds-lobby .more { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
.ds-lobby .more button { padding: 11px 6px; border: 1px solid var(--ds-line); background: rgb(18 22 29 / 0.8); font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
.ds-lobby .more button:hover { border-color: var(--ds-text-3); }
.ds-lobby .who { margin: 10px 0 0; text-align: center; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-lobby button:focus-visible, .ds-lobby button[data-pad-focus] { outline: 2px solid var(--gold); outline-offset: 2px; }
@media (max-width: 960px) {
  .ds-lobby header.top { flex-wrap: wrap; gap: 4px 16px; padding: 18px 16px 14px; }
  .ds-lobby header.top h1 { font-size: 32px; }
  .ds-lobby header.top .count { margin-left: auto; }
  .ds-lobby header.top .sub { order: 3; flex-basis: 100%; }
  .ds-lobby .last .result { flex-wrap: wrap; gap: 4px 14px; }
  .ds-lobby .last .result b { font-size: 20px; }
  .ds-lobby .body { grid-template-columns: 1fr; gap: 28px; padding: 20px 16px 32px; }
  .ds-lobby .seats { grid-template-columns: 1fr; grid-auto-flow: row; }
  .ds-lobby .card { height: 180px; }
  .ds-lobby .card .map { font-size: 40px; }
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
}

export interface LobbyCallbacks {
  /** The host's picks for the next match. */
  pick(settings: { readonly mode?: ModeId; readonly bots?: number }): void;
  /** The host starts the match. */
  start(): void;
  /** Into the match that has started. */
  join(): void;
  loadout(): void;
  settings(): void;
  leave(): void;
}

/**
 * The lobby between matches: everyone in it with their ping, the host's
 * picks (mode, bots, map) with the map's picture, the invite link and the
 * host's Start button. After every match everyone comes back here. Plain DOM,
 * rebuilt only when what it shows changes, so clicks are never lost.
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

  /** Shows the lobby as `view` has it (cheap to call every frame). */
  show(view: LobbyView): void {
    this.#view = view;
    this.#root.hidden = false;
    const html = this.#render(view);
    if (html === this.#html) return;
    const focused = this.#root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset['key'] : undefined;
    this.#html = html;
    this.#root.innerHTML = html;
    // The same control keeps the focus across a rebuild.
    if (focused) this.#root.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
    this.#markFocus();
  }

  hide(): void {
    this.#root.hidden = true;
  }

  /** Controller navigation: up and down (and left and right) through the controls, accept presses. */
  navigate(nav: PadNav): void {
    if (!this.open) return;
    this.#root.classList.add('pad');
    const items = [...this.#root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (nav === 'accept') items[i]?.click();
    else if (nav === 'up' || nav === 'left') items[i <= 0 ? items.length - 1 : i - 1]?.focus();
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
    const host = l.host !== null && l.host === v.selfId;
    const map = this.#map(l.map);
    const modeName = (MODE_NAMES[l.mode] ?? l.mode).toUpperCase();
    const people = l.players.length;
    const underway = v.phase !== 'lobby';
    const peopleText = `${people} ${people === 1 ? 'player' : 'players'}`;

    const seats = lobbySeats(l, v.selfId, v.names, v.pings)
      .map((s) => {
        if (s.id === null) return `<div class="seat open"><span class="n">${pad(s.number)}</span><span class="name">Open seat</span></div>`;
        const ping = s.ping === null ? '' : `<span class="ping ${pingTone(s.ping)}">${s.ping} MS</span>`;
        const tags = `${s.host ? '<span class="tag host">HOST</span>' : ''}${s.you ? '<span class="tag">YOU</span>' : ''}`;
        return `<div class="seat${s.you ? ' you' : ''}"><span class="n">${pad(s.number)}</span><span class="name">${escapeHtml(s.name)}</span>${ping}${tags}</div>`;
      })
      .join('');
    // Rows fill the left column first, then the right.
    const rows = Math.ceil(Math.max(l.capacity, 1) / 2);
    const fill = l.bots > 0 ? `Bots fill the match to ${matchSize(l.mode, l.bots)} when it starts.` : people >= l.capacity ? 'Every seat is taken by a player.' : 'No bots: just the people here.';
    const last = lastMatch(v.result, v.mode, v.teamScores);
    const lastHtml = last
      ? `<section class="last"><h2>Last match</h2><div class="result"><b>${escapeHtml(last.headline)}</b><span>${escapeHtml(last.detail)}</span></div></section>`
      : '';

    const lock = host && !underway ? '' : ' disabled';
    const modes = MODE_IDS.map((m) => `<button type="button" data-act="mode" data-value="${m}" data-key="mode-${m}" class="${m === l.mode ? 'on' : ''}"${lock}>${escapeHtml(MODE_NAMES[m] ?? m)}</button>`).join('');
    const bots =
      l.maxBots > 0
        ? `<span class="label">Bots a side</span><div class="seg">${Array.from({ length: l.maxBots + 1 }, (_, n) => `<button type="button" data-act="bots" data-value="${n}" data-key="bots-${n}" class="${n === l.bots ? 'on' : ''}"${lock}>${n === 0 ? 'None' : n}</button>`).join('')}</div>`
        : '';
    const maps = l.maps
      .map((id) => {
        const m = this.#map(id);
        return `<button type="button" data-key="map-${id}" class="${id === l.map ? 'on' : ''}" style="${m.image ? `background-image:url('${m.image}')` : ''}"${lock}><span>${escapeHtml(m.name)}</span></button>`;
      })
      .join('');
    const copied = performance.now() < this.#copiedUntil;
    const invite = this.invite
      ? `<div class="invite"><span class="label">Invite link: anyone with it can join</span><div class="row"><input readonly value="${escapeHtml(this.invite)}" aria-label="Invite link"><button type="button" data-act="copy" data-key="copy">${copied ? 'Copied' : 'Copy'}</button></div></div>`
      : '';
    const hostName = l.host === null ? null : (v.names[l.host] ?? l.host);
    const start = underway
      ? `<button type="button" class="start" data-act="join" data-key="start">Join the match</button>`
      : host
        ? `<button type="button" class="start" data-act="start" data-key="start">Start</button>`
        : `<button type="button" class="start" disabled>Waiting for the host</button>`;
    const who = underway ? 'The match has started' : host ? 'You are the host' : hostName ? `${escapeHtml(hostName)} is the host` : '';

    return `<header class="top"><h1>Lobby</h1><span class="sub">${modeName} · ${peopleText} · ${escapeHtml(map.name)}</span><span class="count">${people} / ${l.capacity} PLAYERS</span></header>
<div class="body">
<section><h2>Players <small>${people} / ${l.capacity}</small></h2><div class="seats" style="grid-template-rows: repeat(${rows}, auto)">${seats}</div><p class="note">${fill}</p>${lastHtml}</section>
<aside>
<div class="card" style="${map.image ? `background-image:url('${map.image}')` : ''}"><div class="text"><div class="kicker">${modeName} · ${peopleText.toUpperCase()}</div><div class="map">${escapeHtml(map.name)}</div></div></div>
<p class="blurb">${escapeHtml(MODE_BLURBS[l.mode] ?? '')}</p>
<div class="picks${host && !underway ? '' : ' locked'}"><span class="label">Mode${host ? '' : ': the host picks'}</span><div class="seg">${modes}</div>${bots}<span class="label">Map</span><div class="maps">${maps}</div></div>
${invite}
${start}
<div class="more"><button type="button" data-act="loadout" data-key="loadout">Loadout</button><button type="button" data-act="settings" data-key="settings">Settings</button><button type="button" data-act="leave" data-key="leave">Leave</button></div>
<p class="who">${who}</p>
</aside>
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
