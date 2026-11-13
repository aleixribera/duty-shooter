import { MEDALS, isMedal, type Medal, type ScoreLine } from '@duty-shooter/fps-core';
import { REASON_NAMES, medalName } from '../profile/model';
import { escapeHtml as escape } from '../ui/theme';

/**
 * The kill confirmation (ticket 11): the Score a player just earned, set
 * below and to the right of the crosshair so the centre stays clear. Every
 * reason is one line ("+100 Eliminated"), the newest on top, under a running
 * total that counts up; a Medal is named once, larger, above them. Lines go
 * after about 2.5 s, a Medal after 2.
 */

/** One line of the stack. */
export interface ScoreFeedLine {
  readonly points: number;
  readonly label: string;
  /** Who it was about, or how far: said after the label, quieter. */
  readonly note: string;
}

export interface ScoreFeedEntry {
  readonly lines: readonly ScoreFeedLine[];
  /** The Medal this event earned, as its line reads ("Long shot 62 m"), or null. */
  readonly medal: string | null;
  readonly points: number;
}

/** How a score event reads: its lines in the order they were earned, and the best Medal among them. */
export function scoreFeedEntry(lines: readonly ScoreLine[], nameOf: (id: string) => string): ScoreFeedEntry {
  let medal: Medal | null = null;
  let metres: number | undefined;
  const out: ScoreFeedLine[] = [];
  for (const line of lines) {
    if (isMedal(line.reason)) {
      if (!medal || MEDALS.indexOf(line.reason) > MEDALS.indexOf(medal)) medal = line.reason;
      if (line.reason === 'longShot') metres = line.metres;
    }
    const about = line.victim !== undefined && (line.reason === 'kill' || line.reason === 'down' || line.reason === 'finish' || line.reason === 'assist');
    out.push({ points: line.points, label: REASON_NAMES[line.reason], note: about ? nameOf(line.victim!) : line.reason === 'longShot' && line.metres !== undefined ? `${line.metres} m` : '' });
  }
  const name = medal === null ? null : medal === 'longShot' && metres !== undefined ? `${medalName(medal)} ${metres} m` : medalName(medal);
  return { lines: out, medal: name, points: out.reduce((sum, l) => sum + l.points, 0) };
}

/** Seconds a line stays, a Medal stays, and the total takes to count up to what was just earned. */
const SCORE_LINE_LIFE = 2.5;
const SCORE_MEDAL_LIFE = 2;
const COUNT_UP = 0.35;
/** When each beat of a kill comes, in seconds after it (DESIGN.md, Motion): +score lights, the reason lines, the Medal. */
const BEAT_TOTAL = 0.12;
const BEAT_LINES = 0.3;
const BEAT_MEDAL = 0.75;
/** Lines on screen at once: older ones leave early rather than run down into the readouts. */
const MAX_LINES = 6;

export const SCORE_FEED_CSS = `
.ds-score { position: absolute; left: calc(50% + 124px); top: calc(50% + 16px); width: 300px; font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px rgb(0 0 0 / 0.9); }
/* Text over the world stands on a scrim: each row carries its own, running out to the right, and takes it along when it fades. */
/* The kill's beats (DESIGN.md, Motion): +score lights at 120 ms, the reason lines come at 300 ms, a Medal lights on its plate at 750 ms. */
.ds-score .total, .ds-score .lines div { padding: 0 12px; background: linear-gradient(90deg, var(--ds-scrim-soft) 35%, transparent); }
.ds-score .medal { --ds-ch: 10px; width: max-content; margin-bottom: 6px; padding: 0 16px; height: 40px; font-family: var(--ds-font-display); font-size: var(--ds-type-heading); line-height: 40px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; text-shadow: 0 0 22px var(--ds-light-glow); opacity: 0; }
.ds-score .medal.on { animation: ds-score-medal ${SCORE_MEDAL_LIFE - BEAT_MEDAL}s var(--ds-ease) ${BEAT_MEDAL}s both; }
.ds-score .total { height: 30px; font-family: var(--ds-font-display); font-size: var(--ds-type-heading); line-height: 30px; font-weight: 700; color: var(--ds-light); text-shadow: 0 0 22px var(--ds-light-glow); opacity: 0; transition: opacity var(--ds-slow) linear; }
.ds-score .total.on { opacity: 1; transition-duration: 60ms; transition-delay: ${BEAT_TOTAL}s; }
.ds-score .lines div { display: flex; align-items: baseline; gap: 8px; height: 23px; font-size: var(--ds-type-body); line-height: 23px; white-space: nowrap; animation: ds-score-line ${SCORE_LINE_LIFE}s linear both; }
.ds-score .lines div.beat { animation: ds-score-line ${SCORE_LINE_LIFE - BEAT_LINES}s linear ${BEAT_LINES}s both; }
.ds-score .lines b { min-width: 46px; font-weight: 700; }
.ds-score .lines i { font-style: normal; color: var(--ds-text-2); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
@keyframes ds-score-line { 0% { opacity: 0; transform: translateX(-8px); } 4% { opacity: 1; transform: none; } 84% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ds-score-medal { 0% { opacity: 0; transform: scale(1.18); transform-origin: 0 50%; } 8% { opacity: 1; transform: none; } 82% { opacity: 1; } 100% { opacity: 0; } }
/* A phone, or any window too narrow for the stack beside the crosshair: under it, centred, three lines at most. */
@media (max-width: 860px) {
  .ds-score { left: 50%; top: calc(50% + 84px); width: min(300px, calc(100vw - 32px)); transform: translateX(-50%); text-align: center; }
  .ds-score .total, .ds-score .lines div { background: linear-gradient(90deg, transparent, var(--ds-scrim-soft) 25%, var(--ds-scrim-soft) 75%, transparent); }
  .ds-score .medal { margin-left: auto; margin-right: auto; height: 30px; font-size: var(--ds-type-heading); line-height: 30px; }
  .ds-score .total { height: 24px; font-size: var(--ds-type-body); line-height: 24px; }
  .ds-score .lines div { justify-content: center; height: 20px; font-size: var(--ds-type-body); line-height: 20px; }
  .ds-score .lines b { min-width: 0; }
  .ds-score .lines div:nth-child(n+4) { display: none; }
}
/* A short window (a phone held sideways): two lines, clear of the health and the ammo. */
@media (max-height: 520px) { .ds-score .lines div:nth-child(n+3) { display: none; } }
@media (prefers-reduced-motion: reduce) {
  @keyframes ds-score-line { 0% { opacity: 0; } 4% { opacity: 1; } 84% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes ds-score-medal { 0% { opacity: 0; } 8% { opacity: 1; } 82% { opacity: 1; } 100% { opacity: 0; } }
}
`;

export class ScoreFeed {
  readonly #root: HTMLDivElement;
  readonly #medal: HTMLDivElement;
  readonly #total: HTMLDivElement;
  readonly #lines: HTMLDivElement;
  /** Each line on screen with its age, the newest first (as they stand in the page). */
  #live: { readonly el: HTMLElement; age: number }[] = [];
  #medalAge = Infinity;
  /** The total as it stands, the one it is counting up to (everything earned since the stack was last empty), and how fast. */
  #shown = 0;
  #target = 0;
  #rate = 0;
  #text = '';

  constructor(parent: HTMLElement) {
    const el = (cls: string, into: HTMLElement) => {
      const e = document.createElement('div');
      e.className = cls;
      into.append(e);
      return e;
    };
    this.#root = el('ds-score', parent);
    this.#medal = el('medal ds-plate is-lit', this.#root);
    this.#total = el('total', this.#root);
    this.#lines = el('lines', this.#root);
  }

  /** Something was just earned. */
  add(entry: ScoreFeedEntry): void {
    if (entry.lines.length === 0) return;
    // A stack that had emptied starts its total again from nothing.
    const first = this.#live.length === 0;
    if (first) this.#shown = this.#target = 0;
    const fresh = entry.lines.map((line) => {
      const div = document.createElement('div');
      if (first) div.className = 'beat';
      // A line that paid nothing (a kill where no Score is kept) is said without a figure.
      div.innerHTML = `${line.points > 0 ? `<b>+${line.points}</b>` : ''}<span>${escape(line.label)}</span>${line.note ? `<i>${escape(line.note)}</i>` : ''}`;
      return { el: div, age: 0 };
    });
    this.#lines.prepend(...fresh.map((f) => f.el));
    this.#live.unshift(...fresh);
    for (const old of this.#live.splice(MAX_LINES)) old.el.remove();
    this.#target += entry.points;
    this.#rate = (this.#target - this.#shown) / COUNT_UP;
    if (entry.medal !== null) {
      this.#medal.textContent = entry.medal;
      // Restart the entrance for a Medal that follows another.
      this.#medal.classList.remove('on');
      void this.#medal.offsetWidth;
      this.#medal.classList.add('on');
      this.#medalAge = 0;
    }
  }

  update(dt: number): void {
    if (this.#live.length === 0 && this.#medalAge === Infinity && this.#text === '') return;
    for (const line of this.#live) line.age += dt;
    while (this.#live.length > 0 && this.#live[this.#live.length - 1]!.age >= SCORE_LINE_LIFE) this.#live.pop()!.el.remove();
    if (this.#live.length === 0) this.#target = 0;
    if (this.#medalAge !== Infinity && (this.#medalAge += dt) >= SCORE_MEDAL_LIFE) {
      this.#medal.classList.remove('on');
      this.#medalAge = Infinity;
    }
    // The total runs up to everything earned since the stack was empty, and goes out with the last line.
    if (this.#target > this.#shown) this.#shown = Math.min(this.#target, this.#shown + this.#rate * dt);
    const text = this.#target > 0 ? `+${Math.round(this.#shown)}` : '';
    if (text !== this.#text) {
      if (text) this.#total.textContent = text;
      this.#total.classList.toggle('on', text !== '');
      this.#text = text;
    }
  }

  /** A new match, or the menu: nothing left standing. */
  clear(): void {
    for (const line of this.#live) line.el.remove();
    this.#live = [];
    this.#target = this.#shown = 0;
    this.#medal.classList.remove('on');
    this.#medalAge = Infinity;
    this.#total.classList.remove('on');
    this.#text = '';
  }
}
