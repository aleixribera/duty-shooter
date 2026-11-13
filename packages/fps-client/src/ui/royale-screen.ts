import { STATS, WIDE_SCALE, type LobbyState, type MatchResult, type ModeId, type PlayerId, type TeamScore } from '@duty-shooter/fps-core';
import type { PadNav } from '../gamepad';
import { lastMatch, type LobbyInfo } from './model';
import { royaleLocal, royaleOpens, royaleServer, royaleSession, royaleSquads, royaleSteps, type SquadView } from './royale-lobby';
import { escapeHtml, hint, icon, installTheme, patchHtml } from './theme';

type SquadSize = LobbyState['squadSize'];

const CSS = `
.ds-royale { position: fixed; inset: 0; z-index: 18; font: 400 var(--ds-type-body)/1.4 var(--ds-font); }
.ds-royale[hidden] { display: none; }
.ds-menu:not([hidden]) ~ .ds-royale { visibility: hidden; }
/* Over the live map: the scrim is heavy on the left, where the controls are, and lifts to the right. */
.ds-royale .ds-page { background: linear-gradient(90deg, rgb(7 9 13 / 0.95) 0%, rgb(7 9 13 / 0.86) 50%, rgb(7 9 13 / 0.7) 100%); }
.ds-royale .body { display: grid; grid-template-columns: minmax(0, 640px) minmax(380px, 1fr); gap: 64px; align-content: start; }
.ds-royale .controls { display: grid; grid-template-columns: minmax(0, 1fr); gap: 28px; align-content: start; }
.ds-royale .controls .ds-seg { max-width: 520px; }
.ds-royale .ds-seg button { min-height: 48px; font-size: var(--ds-type-body); }
.ds-royale .ds-seg button small { display: block; margin-top: 2px; font-size: var(--ds-type-small); letter-spacing: 0.12em; color: var(--ds-text-2); }
.ds-royale .ds-field-label { color: var(--ds-text-2); }
.ds-royale .why { margin: 10px 0 0; font-size: var(--ds-type-small); color: var(--ds-text-2); max-width: 60ch; }
.ds-royale h2 { font-family: var(--ds-font-display); margin: 0 0 12px; font-size: var(--ds-type-heading); line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.ds-royale h2 small { margin-left: 12px; font-size: var(--ds-type-small); font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--ds-text-2); }
/* Squad slots: one tile a seat; a seat bots will fill is the one dashed frame. */
.ds-royale .slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ds-royale .slot { display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; min-height: 104px; padding: 14px 16px; background: var(--ds-panel); border: 1px solid var(--ds-line); }
.ds-royale .slot b { font-family: var(--ds-font-display); font-size: var(--ds-type-heading); line-height: 1.05; font-weight: 700; letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-royale .slot span { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-royale .slot.you { border-color: var(--ds-text-2); background: var(--ds-raised); }
.ds-royale .slot.bot { background: transparent; border: 1px dashed var(--ds-line-2); }
.ds-royale .slot.bot b { font-size: var(--ds-type-body); font-weight: 400; letter-spacing: 0; color: var(--ds-text-2); white-space: normal; }
@keyframes ds-fill { from { opacity: 0; transform: translateY(6px); } }
.ds-royale .slot.fresh { animation: ds-fill var(--ds-slow) var(--ds-ease) both; }
/* The other Squads: a row each, its people and a Join while it has room. */
.ds-royale .squads { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; background: var(--ds-line); border: 1px solid var(--ds-line); }
.ds-royale .squad { display: flex; align-items: center; gap: 16px; min-height: 56px; padding: 8px 8px 8px 16px; background: var(--ds-panel); }
.ds-royale .squad .n { width: 72px; flex: none; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-royale .squad .who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--ds-type-body); }
.ds-royale .squad .who i { font-style: normal; color: var(--ds-text-2); }
.ds-royale .squad .ds-btn { min-height: 40px; padding: 0 18px; font-size: var(--ds-type-small); letter-spacing: 0.14em; text-transform: uppercase; }
.ds-royale .new { margin-top: 10px; }
/* The host's hand on a person (Aleix, 2026-11-13): Move and Kick, square and 40 px tall, at the foot of a seat or after a name. */
.ds-royale .slot .acts { order: -1; display: flex; gap: 6px; margin-bottom: auto; padding-bottom: 8px; }
.ds-royale .acts .ds-btn { min-height: 40px; padding: 0 12px; font-size: var(--ds-type-small); letter-spacing: 0.14em; text-transform: uppercase; }
.ds-royale .slot.held { border-style: dashed; }
.ds-royale .squad .people { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; }
.ds-royale .squad .person { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ds-royale .squad .person > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-royale .squad .person i { font-style: normal; color: var(--ds-text-2); }
.ds-royale .squad .person .acts { flex: none; display: flex; gap: 6px; }
.ds-royale .ds-field.invite-field { display: block; margin-top: 22px; }
.ds-royale .invite { display: flex; }
.ds-royale .invite input { flex: 1; min-width: 0; height: 44px; padding: 0 12px; font: inherit; font-size: var(--ds-type-body); color: var(--ds-text); background: var(--ds-ink); border: 1px solid var(--ds-line-2); border-right: 0; border-radius: 0; }
/* The island, its numbers, and where the connection is. */
.ds-royale .island { display: grid; gap: 0; }
.ds-royale .island .pic { aspect-ratio: 960 / 414; background: var(--ds-raised) center / cover no-repeat; border: 1px solid var(--ds-line); border-bottom: 0; }
.ds-royale .island .ds-readouts { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.ds-royale .island .ds-readouts > div { background: var(--ds-ink); }
.ds-royale .conn { display: grid; gap: 14px; margin-top: 22px; }
.ds-royale .steps { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: var(--ds-type-body); color: var(--ds-text-2); }
.ds-royale .steps li { display: flex; align-items: center; gap: 10px; }
.ds-royale .steps li::before { content: ''; width: 14px; height: 2px; background: var(--ds-line-2); }
.ds-royale .steps li.now { color: var(--ds-text); }
.ds-royale .steps li.now::before { background: var(--ds-light); }
.ds-royale .steps li.done::before { background: var(--ds-text-2); }
.ds-royale .ds-field { margin: 0; }
.ds-royale .ds-field input { display: block; width: 100%; height: 46px; padding: 0 14px; background: var(--ds-ink); color: var(--ds-text); border: 1px solid var(--ds-line-2); border-radius: 0; font: 700 var(--ds-type-body) var(--ds-font); letter-spacing: 0.02em; }
.ds-royale .ds-field input:focus { border-color: var(--ds-light); outline: none; }
.ds-royale .error { color: var(--ds-alert); }
.ds-royale .last { padding: 14px 16px; background: var(--ds-panel); border: 1px solid var(--ds-line); }
.ds-royale .last b { display: block; font-size: var(--ds-type-heading); text-transform: uppercase; letter-spacing: 0.03em; }
.ds-royale .last span { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-royale footer .note { font-size: var(--ds-type-small); color: var(--ds-text-2); text-align: right; }
@media (prefers-reduced-motion: reduce) { @keyframes ds-fill { from { opacity: 0; } } }
@media (max-width: 960px) {
  .ds-royale .ds-page { background: var(--ds-scrim); }
  .ds-royale .body { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  /* A phone: what you came for first (where it stands, your Squad and Start, the others), the picks and the island after (ticket 51). */
  .ds-royale .body > .controls, .ds-royale .body > aside { display: contents; }
  .ds-royale .conn { order: 1; margin-top: 0; }
  .ds-royale .sec-squad { order: 2; }
  .ds-royale .sec-others { order: 3; }
  .ds-royale .last { order: 4; }
  .ds-royale .sec-size { order: 5; }
  .ds-royale .sec-source { order: 6; }
  .ds-royale .down .sec-source { order: 0; }
  .ds-royale .island { order: 7; }
  .ds-royale .slot { min-height: 84px; padding: 10px 12px; }
  /* The host's controls want the row's width: the Squad's number and Join on top, its people under them. */
  .ds-royale .squad { flex-wrap: wrap; row-gap: 8px; padding-top: 10px; padding-bottom: 10px; }
  .ds-royale .squad .people { order: 3; flex-basis: 100%; }
  .ds-royale .squad > .ds-btn { margin-left: auto; }
  .ds-royale .slot b { font-size: var(--ds-type-body); }
  .ds-royale .island .ds-readouts > div { padding: 10px 12px; }
  .ds-royale .island .ds-readouts b { font-size: var(--ds-type-body); }
  .ds-royale footer .note { display: none; }
  .ds-royale footer .ds-btn:not(.big) { flex: 1; min-width: 0; padding: 0 10px; }
}
`;

/** Where a Battle Royale is played: the server, or 59 bots on this machine (ticket 15). */
export type RoyaleSource = 'server' | 'local';

/** Joined: the lobby as the server has it, and the match before (or under way). */
export interface RoyaleSession {
  readonly lobby: LobbyState;
  /** 'lobby' while waiting; anything else means a match has started without this player in it yet. */
  readonly phase: string;
  readonly selfId: PlayerId | null;
  readonly names: Readonly<Record<string, string>>;
  readonly mode: ModeId;
  readonly result: MatchResult | null;
  readonly teamScores: readonly TeamScore[] | null;
  /** The island's name while it is still being built; null once it is in. */
  readonly loading: string | null;
  /** Whether this player has a seat in the match under way (a late arrival watches it instead). */
  readonly seated: boolean;
  /** That seat is already out of the match under way: it can only watch. */
  readonly out?: boolean;
  /** The connection dropped and is coming back: Start and the picks wait for it. */
  readonly reconnecting?: boolean;
  /** Your Squad's place in the last match and of how many Squads; null when you weren't placed in it. */
  readonly place?: { readonly place: number; readonly of: number } | null;
  /** The link that brings a friend into this lobby and your Squad; none on Local bots. */
  readonly invite?: string | null;
}

export interface RoyaleView {
  /** Where it plays: the server, or this machine with 59 bots in a worker. */
  readonly source: RoyaleSource;
  /** The server's status before joining: undefined while it is being asked, null when nothing answered. */
  readonly status: LobbyInfo | null | undefined;
  /** The name to join with, and whether the server asks for a passphrase. */
  readonly name: string;
  readonly passphrase: boolean;
  /** The passphrase to fill in, from an invite link or the last join. */
  readonly passphraseText?: string;
  /** How far a join has got (0 reaching the server, 1 building the island, 2 joining the lobby); null when not joining. */
  readonly joining: number | null;
  /** Why the last join failed. */
  readonly error: string | null;
  /** The Squad size picked before joining an empty server (applied as its host). */
  readonly squads: SquadSize;
  /** Set once in the lobby. */
  readonly session: RoyaleSession | null;
}

export interface RoyaleCallbacks {
  /** Play on the server or on Local bots (before joining). */
  source(source: RoyaleSource): void;
  /** Join the server's Battle Royale lobby. */
  join(name: string, passphrase: string): void;
  /** Squad size: the host's pick in the lobby, or the pick to open an empty server's lobby with. */
  squads(size: SquadSize): void;
  /** Into Squad `squad` (a free number opens a new one). */
  squad(squad: number): void;
  /** The host moves person `id` into Squad `squad`. */
  move(id: string, squad: number): void;
  /** The host removes person `id` from the lobby. */
  kick(id: string): void;
  /** The host starts the match. */
  start(): void;
  /** Into the match that has started. */
  enter(): void;
  /** Ask the server's status again. */
  refresh(): void;
  loadout(): void;
  settings(): void;
  /** Back to the main menu (leaving the lobby when in it). */
  leave(): void;
}

const SIZES: readonly (readonly [SquadSize, string])[] = [
  [1, 'Solos'],
  [2, 'Duos'],
  [3, 'Trios'],
];
const MINUTES = Math.round(STATS.royale.matchLength.value / 60);
const STAGES = Object.keys(STATS.royale.ring).length;

/**
 * The Battle Royale screen: where to play it (the server, or Local bots on
 * a thread of their own), the Squad size, your Squad's seats with
 * friends and the bots that fill the rest, the other Squads to join, the
 * island and its numbers, the connection, and one action named for what it
 * does now. Plain DOM patched in place, like the lobby page.
 */
export class RoyalePage {
  readonly #root: HTMLDivElement;
  readonly #callbacks: RoyaleCallbacks;
  readonly #image: string;
  #html = '';
  #view: RoyaleView | null = null;
  /** The people seen in each slot, so a slot a friend just took fills in once. */
  #seen = new Set<string>();
  /** Until when the invite's Copy button says Copied. */
  #copiedUntil = 0;

  constructor(parent: HTMLElement, callbacks: RoyaleCallbacks, options: { readonly image: string }) {
    installTheme();
    if (!document.getElementById('ds-royale-css')) {
      const style = document.createElement('style');
      style.id = 'ds-royale-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.#callbacks = callbacks;
    this.#image = options.image;
    this.#root = document.createElement('div');
    this.#root.className = 'ds-royale ds-ui';
    this.#root.hidden = true;
    this.#root.addEventListener('click', (e) => this.#click(e));
    this.#root.addEventListener('submit', (e) => {
      e.preventDefault();
      this.#join();
    });
    this.#root.addEventListener('pointermove', () => this.#root.classList.remove('pad'));
    document.addEventListener('keydown', (e) => this.#key(e));
    parent.append(this.#root);
  }

  get open(): boolean {
    return !this.#root.hidden;
  }

  /** Shows the screen as `view` has it (cheap to call every frame). */
  show(view: RoyaleView): void {
    const opening = this.#root.hidden;
    this.#view = view;
    this.#root.hidden = false;
    const html = this.#render(view);
    if (html === this.#html) return;
    const focused = this.#root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset['key'] : undefined;
    this.#html = html;
    patchHtml(this.#root, html);
    if (focused && document.activeElement?.getAttribute('data-key') !== focused) this.#root.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
    if (opening && !view.session) this.#root.querySelector<HTMLElement>('[data-key="go"]:not(:disabled)')?.focus({ preventScroll: true });
    this.#markFocus();
  }

  hide(): void {
    this.#root.hidden = true;
    this.#seen.clear();
  }

  /** Controller navigation, as on the lobby page; back leaves. */
  navigate(nav: PadNav): void {
    if (!this.open) return;
    this.#root.classList.add('pad');
    const items = [...this.#root.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (nav === 'accept') items[i]?.click();
    else if (nav === 'back') this.#callbacks.leave();
    else if (nav === 'up' || nav === 'left') items[i <= 0 ? items.length - 1 : i - 1]?.focus();
    else if (nav === 'down' || nav === 'right') items[i < 0 ? 0 : (i + 1) % items.length]?.focus();
    this.#markFocus();
  }

  #markFocus(): void {
    for (const e of this.#root.querySelectorAll('[data-pad-focus]')) e.removeAttribute('data-pad-focus');
    const active = document.activeElement;
    if (this.#root.classList.contains('pad') && active instanceof HTMLElement && this.#root.contains(active)) active.dataset['padFocus'] = '';
  }

  #join(): void {
    const v = this.#view;
    if (!v || v.session || v.joining !== null) return;
    const name = this.#root.querySelector<HTMLInputElement>('input[name="name"]')?.value.trim().slice(0, 16) ?? '';
    if (!name) {
      this.#root.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
      return;
    }
    this.#callbacks.join(name, this.#root.querySelector<HTMLInputElement>('input[name="passphrase"]')?.value ?? '');
  }

  #click(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const act = el.dataset['act'];
    const value = Number(el.dataset['value'] ?? '');
    if (act === 'source') this.#callbacks.source(el.dataset['value'] === 'local' ? 'local' : 'server');
    else if (act === 'squads') this.#callbacks.squads(value as SquadSize);
    else if (act === 'squad') this.#callbacks.squad(value);
    else if (act === 'move') this.#callbacks.move(el.dataset['id'] ?? '', value);
    else if (act === 'kick') this.#callbacks.kick(el.dataset['id'] ?? '');
    else if (act === 'copy') {
      const invite = this.#view?.session?.invite;
      if (!invite) return;
      void navigator.clipboard?.writeText(invite).catch(() => {});
      this.#copiedUntil = performance.now() + 1500;
      if (this.#view) this.show(this.#view);
      setTimeout(() => this.#view && this.open && this.show(this.#view), 1600);
    }
    else if (act === 'start') this.#callbacks.start();
    else if (act === 'enter') this.#callbacks.enter();
    else if (act === 'refresh') this.#callbacks.refresh();
    else if (act === 'loadout') this.#callbacks.loadout();
    else if (act === 'settings') this.#callbacks.settings();
    else if (act === 'leave') this.#callbacks.leave();
  }

  #key(e: KeyboardEvent): void {
    if (!this.open || e.code !== 'Escape' || e.defaultPrevented || getComputedStyle(this.#root).visibility === 'hidden') return;
    // Esc steps back before joining; in the lobby, leaving is the footer's button, never a stray key.
    if (this.#view?.session) return;
    e.preventDefault();
    this.#callbacks.leave();
  }

  /**
   * The host's buttons on a person: Move (into `into`, when there is a Squad to move them to) and Kick.
   * `into` is your Squad for someone in another, or a fresh one for someone in yours.
   */
  #acts(id: string, name: string, into: { readonly squad: number; readonly label: string } | null): string {
    const n = escapeHtml(name);
    const move = into ? `<button type="button" class="ds-btn" data-act="move" data-id="${escapeHtml(id)}" data-value="${into.squad}" data-key="move-${escapeHtml(id)}" aria-label="Move ${n} ${escapeHtml(into.label)}">Move</button>` : '';
    return `<span class="acts">${move}<button type="button" class="ds-btn" data-act="kick" data-id="${escapeHtml(id)}" data-key="kick-${escapeHtml(id)}" aria-label="Kick ${n}">Kick</button></span>`;
  }

  #slots(squad: SquadView, mine: boolean, local: boolean, out: number | null = null, controls = false): string {
    const tiles = squad.slots
      .map((s, i) => {
        if (s.id === null) return local ? `<div class="slot bot"><b>Bot</b></div>` : `<div class="slot bot"><b>Open seat</b><span>A bot, until a friend joins</span></div>`;
        const key = `${squad.squad}:${s.id}`;
        const fresh = mine && !s.you && !this.#seen.has(key);
        this.#seen.add(key);
        // The host's hand on a friend in their own Squad: out to a Squad of their own, or out of the lobby.
        // A seat held for someone coming back can only be let go (a closed tab holds one for minutes).
        const acts = controls && !s.you ? this.#acts(s.id, s.name, out === null || s.held ? null : { squad: out, label: 'to a Squad of their own' }) : '';
        return `<div class="slot${s.you ? ' you' : ''}${s.held ? ' held' : ''}${fresh && i > 0 ? ' fresh' : ''}"><b>${escapeHtml(s.name)}</b>${s.role ? `<span>${escapeHtml(s.role)}</span>` : ''}${acts}</div>`;
      })
      .join('');
    return `<div class="slots">${tiles}</div>`;
  }

  #render(v: RoyaleView): string {
    const s = v.session;
    const host = s !== null && s.lobby.host !== null && s.lobby.host === s.selfId;
    const underway = s !== null && s.phase !== 'lobby';
    const joined = s ? royaleSession({ host, hostName: s.lobby.host === null ? null : (s.names[s.lobby.host] ?? s.lobby.host), phase: s.phase, loading: s.loading, seated: s.seated, out: s.out === true, reconnecting: s.reconnecting === true }) : null;
    const local = v.source === 'local';
    const server = local ? royaleLocal() : royaleServer(v.status ?? null);
    const free = local || royaleOpens(v.status);
    const size: SquadSize = s ? s.lobby.squadSize : free ? v.squads : ((v.status?.squadSize ?? 1) as SquadSize);
    // Before joining, an empty server's size is yours to pick (you open its lobby); in it, the host's alone.
    const sizeFree = joined ? joined.picks : v.joining === null && server.join && free;
    const seg = SIZES.map(([n, label]) => `<button type="button" data-act="squads" data-value="${n}" data-key="squads-${n}" class="${n === size ? 'on' : ''}"${sizeFree ? '' : ' disabled'}>${label}</button>`).join('');
    // A word only when the picker is shut because someone else holds it; a server that can't be joined says so in its own line.
    const sizeWhy = s?.reconnecting ? 'The size waits for the connection.' : sizeFree || v.joining !== null || !(s || server.join) ? '' : 'The host picks the size.';

    let squadsHtml: string;
    let footNote: string;
    if (s) {
      const view = royaleSquads(s.lobby, s.selfId, s.names);
      // The host's hand on the Squads while the lobby waits (Aleix, 2026-11-13): Move people in and out of theirs, and Kick.
      const controls = host && !underway && !s.reconnecting && !local;
      const squads = s.lobby.squadSize > 1;
      const others = view.others
        .map((o) => {
          const room = o.slots.filter((x) => x.id === null).length;
          const join = o.open && !underway && !s.reconnecting ? `<button type="button" class="ds-btn" data-act="squad" data-value="${o.squad}" data-key="squad-${o.squad}">Join</button>` : '';
          if (controls) {
            const into = squads && view.mine?.open ? { squad: view.mine.squad, label: 'into your Squad' } : null;
            const people = o.slots
              .filter((x) => x.id !== null)
              .map((x) => `<span class="person"><span>${escapeHtml(x.name)}${x.held ? ' <i>· coming back</i>' : ''}</span>${this.#acts(x.id!, x.name, x.held ? null : into)}</span>`)
              .join('');
            return `<div class="squad"><span class="n">Squad ${o.squad}</span><div class="people">${people}</div>${join}</div>`;
          }
          const who = o.slots.map((x) => (x.id === null ? '' : `${escapeHtml(x.name)}${x.held ? ' <i>(coming back)</i>' : ''}`)).filter(Boolean).join(', ');
          return `<div class="squad"><span class="n">Squad ${o.squad}</span><span class="who">${who}${room > 0 ? ` <i>· ${room} ${room === 1 ? 'seat' : 'seats'} for bots</i>` : ''}</span>${join}</div>`;
        })
        .join('');
      const copied = performance.now() < this.#copiedUntil;
      const invite = s.invite && !local ? `<label class="ds-field invite-field"><span class="ds-field-label">Invite link</span><span class="invite"><input readonly value="${escapeHtml(s.invite)}" data-key="invite"><button type="button" class="ds-btn" data-act="copy" data-key="copy" aria-live="polite">${copied ? 'Copied' : 'Copy'}</button></span></label>` : '';
      const leaveSquad = view.newSquad !== null && !underway && !s.reconnecting ? `<button type="button" class="ds-btn new" data-act="squad" data-value="${view.newSquad}" data-key="new-squad">Start a new Squad</button>` : '';
      squadsHtml = `<section class="sec-squad"><h2>Your Squad${underway && !s.seated ? '<small>For the next match</small>' : s.lobby.squadSize === 1 ? '' : `<small>Squad ${view.mine?.squad ?? ''}</small>`}</h2>${view.mine ? this.#slots(view.mine, true, local, squads ? view.free : null, controls) : ''}${leaveSquad}${invite}</section>
${others ? `<section class="sec-others"><h2>Other Squads</h2><div class="squads">${others}</div></section>` : ''}`;
      footNote = `${view.people} ${view.people === 1 ? 'player' : 'players'} + ${view.bots} bots`;
    } else {
      // Before joining: your own seat, and the seats friends take when they join, bots otherwise.
      const mine: SquadView = { squad: 0, open: size > 1, slots: [{ id: 'you', name: v.name || 'You', role: !v.name && server.join ? 'Type your name to join' : v.name ? 'You' : '', you: true }, ...Array.from({ length: size - 1 }, () => ({ id: null, name: '', role: '', you: false }))] };
      squadsHtml = `<section class="sec-squad"><h2>Your Squad</h2>${this.#slots(mine, false, local)}</section>`;
      footNote = '';
    }
    const last = s ? lastMatch(s.result, s.mode, s.teamScores, s.place ?? null) : null;
    const lastHtml = last && s?.mode === 'battle-royale' ? `<section class="last"><b>${escapeHtml(last.headline)}</b><span>Last match · ${escapeHtml(last.detail)}</span></section>` : '';

    // The connection: the server's state before joining, the steps while joining, and the lobby once in.
    let conn: string;
    if (joined) {
      conn = `<p class="ds-state ${joined.tone}">${escapeHtml(joined.line)}</p>`;
    } else if (v.joining !== null) {
      conn = `<ol class="steps">${royaleSteps(v.source).map((label, i) => `<li class="${i < v.joining! ? 'done' : i === v.joining ? 'now' : ''}">${label}</li>`).join('')}</ol>`;
    } else if (v.status === undefined && !local) {
      // The button says it is checking: nothing to add here.
      conn = '';
    } else {
      conn = `${server.line ? `<p class="ds-state ${server.tone}">${escapeHtml(server.line)}</p>` : ''}${v.error ? `<p class="error">${escapeHtml(v.error)}</p>` : ''}
${server.join ? `<label class="ds-field"><span class="ds-field-label">Name</span><input name="name" maxlength="16" autocomplete="nickname" spellcheck="false" value="${escapeHtml(v.name)}" data-key="name"></label>` : ''}
${v.passphrase && !local && server.join ? `<label class="ds-field"><span class="ds-field-label">Passphrase</span><input name="passphrase" type="password" autocomplete="current-password" value="${escapeHtml(v.passphraseText ?? '')}" data-key="passphrase"></label>` : ''}`;
    }

    let go: string;
    if (joined) {
      go = joined.go.act
        ? `<button type="button" class="ds-btn primary big" data-act="${joined.go.act}" data-key="go">${escapeHtml(joined.go.label)}</button>`
        : `<button type="button" class="ds-btn primary big" disabled>${escapeHtml(joined.go.label)}</button>`;
    } else if (v.joining !== null) go = `<button type="button" class="ds-btn primary big" disabled>Joining…</button>`;
    else if (local) go = `<button type="submit" class="ds-btn primary big" data-key="go">Open lobby</button>`;
    else if (v.status === undefined) go = `<button type="button" class="ds-btn primary big" disabled>Checking the server…</button>`;
    else if (!server.join) go = `<button type="button" class="ds-btn primary big" data-act="refresh" data-key="go">Check again</button>`;
    else go = `<button type="submit" class="ds-btn primary big" data-key="go">Join server</button>`;

    // Picked before joining; once in a lobby, where it plays is fixed until you leave.
    const sourceSeg = (['server', 'local'] as const)
      .map((src) => `<button type="button" data-act="source" data-value="${src}" data-key="source-${src}" class="${v.source === src ? 'on' : ''}" aria-pressed="${v.source === src}"${s || v.joining !== null ? ' disabled' : ''}>${src === 'local' ? 'Local bots' : 'Server'}</button>`)
      .join('');
    const hints = `<div class="ds-hints grow">${hint('↑↓', '✥', 'Move')}${hint('Enter', '✕', 'Select')}</div>`;
    const extras = s ? `<button type="button" class="ds-btn" data-act="loadout" data-key="loadout">Loadout</button><button type="button" class="ds-btn" data-act="settings" data-key="settings">Settings</button>` : '';

    // The server can't be joined: on a phone, the way round it (Local bots) comes first, not under the Squad.
    const down = !s && !local && v.status !== undefined && !server.join;
    return `<form class="ds-page${down ? ' down' : ''}" novalidate>
<header><div class="heading"><h1>Battle Royale</h1></div></header>
<div class="body">
<div class="controls">
<section class="sec-source"><span class="ds-field-label">Play on</span><div class="ds-seg">${sourceSeg}</div>
<p class="why">${local ? `Just you and ${WIDE_SCALE.seats - 1} bots, on this machine.` : 'Friends can join; bots fill the empty seats.'}</p></section>
<section class="sec-size"><span class="ds-field-label">Squads</span><div class="ds-seg">${seg}</div>${sizeWhy ? `<p class="why">${sizeWhy}</p>` : ''}</section>
${squadsHtml}
${lastHtml}
</div>
<aside>
<div class="island"><div class="pic" style="background-image:url('${escapeHtml(this.#image)}')" role="img" aria-label="Zero Island from the south-west"></div>
<div class="ds-readouts"><div><span>Seats</span><b>${WIDE_SCALE.seats}</b></div><div><span>Island</span><b>Zero</b></div><div><span>Match</span><b>${MINUTES} min</b></div><div><span>Ring</span><b>${STAGES} stages</b></div></div></div>
<div class="conn" aria-live="polite">${conn}</div>
</aside>
</div>
<footer><button type="button" class="ds-btn" data-act="leave" data-key="leave">${icon('back')}${s ? 'Leave' : 'Back'}</button>${extras}
${hints}${footNote ? `<span class="note">${footNote}</span>` : ''}${go}</footer>
</form>`;
  }
}
