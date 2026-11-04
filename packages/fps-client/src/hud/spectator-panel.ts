import { STATS } from '@duty-shooter/fps-core';
import { recapHtml, type Recap } from '../ui/recap';

/**
 * The spectator's panel (ticket 32), in every mode that has spectating: who you
 * watch with their health and weapon, their Squad (or team), where they stand in
 * the order next and previous step through, the keys for those and for the view,
 * and, for a few seconds after the one you watched is put out, who did it. It
 * stands at the bottom left, where your own health was.
 */

export interface SpectatorMate {
  readonly name: string;
  readonly state: 'up' | 'downed' | 'out';
}

export interface SpectatorPanelState {
  readonly name: string;
  readonly bot: boolean;
  readonly health: number;
  readonly downed: boolean;
  /** The weapon in their hands, by name. */
  readonly weapon: string;
  /** What their side is called ("Squad", "Team"), or null with none (Solos, free-for-all). */
  readonly group: string | null;
  /** The rest of their side. */
  readonly mates: readonly SpectatorMate[];
  /** Where they stand (from 1) in the order next and previous step through, and how many there are. */
  readonly index: number;
  readonly of: number;
  /** Behind them, or through their eyes. */
  readonly view: 'follow' | 'eyes';
  /** Who put out the last one watched, for a few seconds after, or null. */
  readonly notice: string | null;
  /** Battle Royale: who put you out and how that fight went (ticket 73), or null. */
  readonly recap?: Recap | null;
  /** The key or button for each, as shown. */
  readonly keys: { readonly prev: string; readonly next: string; readonly view: string };
}

/** The line said when the one watched is put out. */
export function spectatorNotice(victim: string, killer: string | null): string {
  return killer === null ? `${victim} is out` : `${victim} was eliminated by ${killer}`;
}

const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const key = (cap: string, label: string): string => `<span><i class="ds-kbd">${escape(cap)}</i>${label}</span>`;

export function spectatorPanelHtml(s: SpectatorPanelState): string {
  const hp = Math.max(0, Math.round(s.health));
  const fill = Math.max(0, Math.min(1, s.health / (s.downed ? STATS.royale.downedHealth.value : 100)));
  const mates = s.mates
    .map((m) => `<span class="m ${m.state}">${escape(m.name)}${m.state === 'up' ? '' : `<small>${m.state === 'downed' ? 'Downed' : 'Out'}</small>`}</span>`)
    .join('');
  const keys = [
    ...(s.of > 1 ? [key(s.keys.prev, 'Previous'), key(s.keys.next, 'Next')] : []),
    key(s.keys.view, s.view === 'follow' ? 'Their view' : 'Follow'),
  ].join('');
  return (
    (s.recap ? `<div class="recap">${recapHtml(s.recap)}</div>` : '') +
    (s.notice ? `<div class="notice">${escape(s.notice)}</div>` : '') +
    `<div class="head"><span>Watching</span>${s.of > 1 ? `<span class="n">${s.index} / ${s.of}</span>` : ''}</div>` +
    `<div class="who"><b>${escape(s.name)}</b>${s.bot ? '<em>Bot</em>' : ''}</div>` +
    `<div class="hp${s.downed ? ' downed' : ''}"><span class="v">${hp}</span><span class="l">${s.downed ? 'Downed' : 'Health'}</span><span class="bar"><i style="transform:scaleX(${fill.toFixed(3)})"></i></span></div>` +
    `<div class="gun">${escape(s.weapon)}</div>` +
    (s.group && s.mates.length ? `<div class="mates"><span class="g">${escape(s.group)}</span>${mates}</div>` : '') +
    `<div class="keys">${keys}</div>`
  );
}

export const SPECTATOR_PANEL_CSS = `
.ds-spec { position: absolute; left: 0; bottom: 0; min-width: 340px; max-width: min(460px, 100vw); padding: 64px 72px 26px 32px; display: flex; flex-direction: column; gap: 6px;
  background: radial-gradient(ellipse at 0% 100%, var(--ds-scrim-soft), rgb(7 9 13 / 0) 72%); font-variant-numeric: tabular-nums; }
.ds-spec[hidden] { display: none; }
.ds-spec .notice { align-self: flex-start; margin-bottom: 6px; padding: 5px 10px; background: var(--ds-scrim); border-left: 3px solid var(--ds-alert); font-size: var(--ds-type-small); color: var(--ds-text); animation: ds-in var(--ds-slow) var(--ds-ease); }
.ds-spec .recap { align-self: stretch; margin-bottom: 12px; padding: 10px 14px; background: var(--ds-scrim); border-left: 3px solid var(--ds-alert); }
.ds-spec .head { display: flex; gap: 12px; align-items: baseline; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-spec .head .n { color: var(--ds-text); }
.ds-spec .who { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.ds-spec .who b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 34px; line-height: 0.95; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
.ds-spec .who em { flex: none; font-style: normal; font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; padding: 2px 5px 1px; border: 1px solid var(--ds-line-2); color: var(--ds-text-2); }
.ds-spec .hp { display: grid; grid-template-columns: auto 1fr; align-items: baseline; column-gap: 10px; margin-top: 4px; }
.ds-spec .hp .v { font-size: 26px; font-weight: 700; line-height: 1; }
.ds-spec .hp .l { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-spec .hp .bar { grid-column: 1 / -1; position: relative; width: 236px; height: 4px; margin-top: 6px; background: rgb(243 241 234 / 0.16); overflow: hidden; }
.ds-spec .hp .bar i { display: block; height: 100%; background: var(--ds-text); transform-origin: 0 50%; transition: transform var(--ds-fast) linear; }
.ds-spec .hp.downed .v, .ds-spec .hp.downed .l { color: var(--ds-alert); }
.ds-spec .hp.downed .bar i { background: var(--ds-alert); }
.ds-spec .gun { font-size: 14px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
.ds-spec .mates { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; margin-top: 4px; font-size: 15px; }
.ds-spec .mates .g { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-spec .mates .m { font-weight: 700; }
.ds-spec .mates .m small { margin-left: 6px; font-size: 12px; font-weight: 400; }
.ds-spec .mates .m.downed small { color: var(--ds-alert); }
.ds-spec .mates .m.out { color: var(--ds-text-2); font-weight: 400; text-decoration: line-through; text-decoration-color: var(--ds-line-2); }
.ds-spec .keys { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ds-text-2); }
.ds-spec .keys span { display: inline-flex; align-items: center; gap: 7px; }
.ds-spec .keys .ds-kbd { color: var(--ds-text); letter-spacing: 0.04em; }
/* Narrower, the bar with the menu and map keys (bottom centre) reaches under the panel: stand on it; the ping readout steps aside. */
@media (max-width: 1000px) {
  .ds-spec { padding-bottom: 78px; }
  .ds-hud:has(> .ds-spec:not([hidden])) .ds-stats { display: none; }
}
@media (max-width: 640px) {
  .ds-spec { min-width: 0; padding: 48px 24px 76px 14px; }
  .ds-spec .who b { font-size: 26px; }
  .ds-spec .hp .bar { width: 180px; }
  .ds-spec .recap { padding: 8px 10px; margin-bottom: 8px; }
  .ds-spec .recap .who b { font-size: 18px; }
  .ds-spec .recap .nums b { font-size: 17px; }
}
`;

/** The panel as DOM, rewritten only when what it says changes. */
export class SpectatorPanel {
  readonly #root: HTMLDivElement;
  #html = '';

  constructor(parent: HTMLElement) {
    this.#root = document.createElement('div');
    this.#root.className = 'ds-spec';
    this.#root.hidden = true;
    parent.append(this.#root);
  }

  update(state: SpectatorPanelState | null): void {
    this.#root.hidden = state === null;
    if (state === null) return;
    const html = spectatorPanelHtml(state);
    if (html !== this.#html) this.#root.innerHTML = this.#html = html;
  }
}
