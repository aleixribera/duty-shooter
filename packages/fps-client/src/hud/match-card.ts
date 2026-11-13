import { figure, type MatchGain } from '../profile/model';
import { mapPoint, type MapBounds } from '../ui/island-map';
import { ordinal } from '../ui/model';
import { clockOf, type MatchCard } from '../ui/recap';
import { escapeHtml as escape } from '../ui/theme';
import { matchGainHtml } from './match-gain';

/**
 * The match card (ticket 73): at a Battle Royale's end, before the Battle
 * Royale screen, each person's own match on one card. Your place big, your
 * numbers as one strip of readouts, and the island with the way you went,
 * where you fought and where you fell. It stands where the end panel does
 * and takes its place in a Battle Royale; the island is drawn once a card.
 * Once the match is banked in the Profile, the card also carries what it paid:
 * the Score, the XP and the Rank bar (ticket 25).
 */

export interface MatchCardState {
  readonly card: MatchCard;
  /** Who won, as the victory beat says it ("Filler and Enemy"), or null with no winner. */
  readonly winners: string | null;
  readonly yours: boolean;
  /** The line under it: what comes next and when. */
  readonly next: string;
  /** Your Score in the match and what it gave your Profile, once banked; absent where nothing is kept. */
  readonly score?: number;
  readonly gain?: MatchGain | null;
}

/** The island under the route, and the square of ground it shows. */
export interface CardIsland {
  readonly picture: CanvasImageSource;
  readonly bounds: MapBounds;
}

export const MATCH_CARD_CSS = `
.ds-card { position: absolute; left: 50%; top: calc(48px + var(--ds-safe-t)); transform: translateX(-50%); width: min(980px, calc(100vw - 112px)); display: none; grid-template-columns: minmax(0, 1fr) auto; gap: 0; background: var(--ds-scrim); border: 1px solid var(--ds-line); animation: ds-in var(--ds-slow) var(--ds-ease); font-variant-numeric: tabular-nums; }
.ds-card.on { display: grid; }
.ds-card .facts { display: flex; flex-direction: column; gap: 18px; padding: 28px 32px; min-width: 0; }
/* The facts proper lay out as the column's own rows; the XP strip and the line with the clock are drawn apart from them. */
.ds-card .top { display: contents; }
.ds-card .ds-gain:empty { display: none; }
.ds-card .ds-gain { padding-top: 16px; border-top: 1px solid var(--ds-line); }
.ds-card .what { font-size: var(--ds-type-small); font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ds-text-2); }
.ds-card .what.won { color: var(--ds-light); }
.ds-card .place { display: flex; align-items: baseline; gap: 14px; }
.ds-card .place b { font-family: var(--ds-font-display); font-size: var(--ds-type-display); line-height: 0.9; font-weight: 700; letter-spacing: 0.01em; text-transform: uppercase; }
.ds-card .place span { font-size: var(--ds-type-body); color: var(--ds-text-2); }
.ds-card .winners { font-size: var(--ds-type-body); color: var(--ds-text-2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-card .winners b { color: var(--ds-text); font-weight: 700; }
.ds-card .ds-readouts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ds-card .ds-readouts > div { background: var(--ds-panel); padding: 10px 14px; }
.ds-card .next { margin-top: auto; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-card .map { position: relative; padding: 20px; border-left: 1px solid var(--ds-line); display: flex; flex-direction: column; gap: 10px; }
.ds-card canvas { display: block; width: 380px; height: 380px; background: var(--ds-ink); border: 1px solid var(--ds-line-2); }
.ds-card .key { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-card .key span { display: inline-flex; align-items: center; gap: 6px; }
.ds-card .key i { display: inline-block; }
.ds-card .key i.route { width: 18px; height: 0; border-top: 2px solid var(--ds-text); }
.ds-card .key i.fight { width: 9px; height: 9px; border: 2px solid var(--ds-text); transform: rotate(45deg); }
.ds-card .key i.fell { width: 10px; height: 10px; color: var(--ds-alert); font-style: normal; font-weight: 700; line-height: 10px; font-size: var(--ds-type-small); }
.ds-card .key i.fell::before { content: '✕'; }
@media (max-width: 860px) {
  .ds-card { top: calc(12px + var(--ds-safe-t)); width: calc(100vw - 24px); grid-template-columns: minmax(0, 1fr); max-height: calc(100vh - 24px); overflow: hidden; }
  .ds-card .facts { padding: 16px 16px 12px; gap: 12px; }
  .ds-card .place b { font-size: var(--ds-type-display); }
  .ds-card .ds-readouts > div { padding: 8px 10px; }
  .ds-card .ds-readouts b { font-size: var(--ds-type-body); }
  .ds-card .map { padding: 0 16px 16px; border-left: 0; }
  .ds-card canvas { width: min(calc(100vw - 58px), calc(100vh - 470px)); height: min(calc(100vw - 58px), calc(100vh - 470px)); min-width: 180px; min-height: 180px; }
  .ds-card .next { order: 9; }
  .ds-card .ds-gain { padding-top: 10px; }
  .ds-card.gained canvas { width: min(calc(100vw - 58px), calc(100vh - 610px)); height: min(calc(100vw - 58px), calc(100vh - 610px)); min-width: 150px; min-height: 150px; }
}
`;

function matchCardFactsHtml(s: MatchCardState): string {
  const c = s.card;
  const won = c.place === 1;
  const r = (label: string, value: string | number) => `<div><span>${label}</span><b>${value}</b></div>`;
  return (
    `<div class="what${won ? ' won' : ''}">${won ? 'Victory' : 'Your match'}</div>` +
    `<div class="place"><b>${c.place === null ? '–' : ordinal(c.place)}</b>${c.of === null ? '' : `<span>of ${c.of} Squads</span>`}</div>` +
    (s.winners && !s.yours ? `<div class="winners">Won by <b>${escape(s.winners)}</b></div>` : '') +
    `<div class="ds-readouts">${r('Eliminations', c.eliminations)}${r('Downs', c.downs)}${r('Damage', c.damage)}${r('Revives', c.revives)}${r('Reboots', c.reboots)}${r('Time alive', clockOf(c.alive))}</div>`
  );
}

/** What the match paid, under the facts: the Score, the XP, the Rank bar and the Challenges it moved. Empty until the match is banked. */
function matchCardGainHtml(s: MatchCardState): string {
  return s.gain ? matchGainHtml([['Score', figure(s.score ?? s.gain.score)]], s.gain) : '';
}

export class MatchCardView {
  readonly #root: HTMLDivElement;
  readonly #facts: HTMLDivElement;
  /** The XP strip and the line with the clock, each its own element: the clock ticking does not start the Rank bar's fill again. */
  readonly #gain: HTMLDivElement;
  readonly #next: HTMLDivElement;
  #gainHtml = '';
  readonly #canvas: HTMLCanvasElement;
  readonly #island: () => CardIsland | null;
  #html = '';
  /** The card the island was last drawn for. */
  #drawn: MatchCard | null = null;
  #width = 0;

  constructor(parent: HTMLElement, island: () => CardIsland | null) {
    this.#island = island;
    this.#root = document.createElement('div');
    this.#root.className = 'ds-card';
    const facts = document.createElement('div');
    facts.className = 'facts';
    this.#facts = document.createElement('div');
    this.#facts.className = 'top';
    this.#gain = document.createElement('div');
    this.#gain.className = 'ds-gain';
    this.#next = document.createElement('div');
    this.#next.className = 'next';
    facts.append(this.#facts, this.#gain, this.#next);
    const map = document.createElement('div');
    map.className = 'map';
    this.#canvas = document.createElement('canvas');
    const key = document.createElement('div');
    key.className = 'key';
    key.innerHTML = '<span><i class="route"></i>Your route</span><span><i class="fight"></i>Fights</span><span><i class="fell"></i>Where you fell</span>';
    map.append(this.#canvas, key);
    this.#root.append(facts, map);
    parent.append(this.#root);
  }

  get shown(): boolean {
    return this.#root.classList.contains('on');
  }

  update(s: MatchCardState | null): void {
    this.#root.classList.toggle('on', s !== null);
    if (!s) {
      this.#drawn = null;
      return;
    }
    const html = matchCardFactsHtml(s);
    if (html !== this.#html) this.#facts.innerHTML = this.#html = html;
    const gain = matchCardGainHtml(s);
    if (gain !== this.#gainHtml) {
      this.#gain.innerHTML = this.#gainHtml = gain;
      this.#root.classList.toggle('gained', gain !== '');
    }
    if (this.#next.textContent !== s.next) this.#next.textContent = s.next;
    const wide = this.#canvas.clientWidth;
    if ((this.#drawn !== s.card || wide !== this.#width) && wide > 0) this.#draw(s.card, wide);
  }

  #draw(card: MatchCard, wide: number): void {
    const island = this.#island();
    const ctx = this.#canvas.getContext('2d');
    if (!island || !ctx) return;
    this.#drawn = card;
    this.#width = wide;
    const px = Math.min(1024, Math.round(wide * Math.min(2, devicePixelRatio || 1)));
    this.#canvas.width = this.#canvas.height = px;
    const k = px / wide;
    const css = getComputedStyle(this.#root);
    const tok = (name: string) => css.getPropertyValue(name).trim();
    const text = tok('--ds-text');
    const ink = tok('--ds-ink');
    const alert = tok('--ds-alert');
    ctx.drawImage(island.picture, 0, 0, px, px);
    const at = (x: number, z: number) => mapPoint(island.bounds, px, x, z);
    // The route: one line a leg, dark under light so it reads on sand and on forest.
    for (const [width, colour] of [
      [5 * k, ink],
      [2.5 * k, text],
    ] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath();
      let pen = false;
      for (const p of card.route) {
        if (!p) {
          pen = false;
          continue;
        }
        const [x, y] = at(p.x, p.z);
        if (pen) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        pen = true;
      }
      ctx.stroke();
    }
    // Where you landed: a dot at the route's start.
    const first = card.route.find((p) => p !== null);
    if (first) {
      const [x, y] = at(first.x, first.z);
      ctx.fillStyle = text;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      ctx.arc(x, y, 5 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Fights: a diamond each.
    for (const f of card.fights) {
      const [x, y] = at(f.x, f.z);
      const h = 6 * k;
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h, y);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x - h, y);
      ctx.closePath();
      ctx.fillStyle = ink;
      ctx.fill();
      ctx.lineWidth = 2 * k;
      ctx.strokeStyle = text;
      ctx.stroke();
    }
    // Where you fell: a cross in the alert colour.
    for (const f of card.fell) {
      const [x, y] = at(f.x, f.z);
      const h = (f.out ? 7 : 5) * k;
      for (const [width, colour] of [
        [5 * k, ink],
        [2.5 * k, alert],
      ] as const) {
        ctx.lineWidth = width;
        ctx.strokeStyle = colour;
        ctx.beginPath();
        ctx.moveTo(x - h, y - h);
        ctx.lineTo(x + h, y + h);
        ctx.moveTo(x + h, y - h);
        ctx.lineTo(x - h, y + h);
        ctx.stroke();
      }
    }
  }
}
