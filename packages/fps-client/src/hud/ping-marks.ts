import { PING_WHEEL, type PingKind } from '@duty-shooter/fps-core';
import { PING_LABELS } from '../ui/pings';

/**
 * Pings on the screen (ticket 66): a marker over each thing the Squad
 * marked, held at the screen's edge when it is off it, and the ping wheel
 * while the ping key is held. An enemy is marked in the danger colour; a
 * place or a thing, something to go to, in the signal colour.
 */

const CSS = `
.ds-ping { position: absolute; left: 0; top: 0; will-change: transform; display: flex; flex-direction: column; align-items: center; pointer-events: none; color: var(--ds-signal); text-shadow: 0 1px 2px rgb(0 0 0 / 0.9); }
.ds-ping.enemy { color: var(--ds-alert); }
.ds-ping .pin { width: 14px; height: 14px; border: 2px solid currentColor; transform: rotate(45deg); background: rgb(11 14 19 / 0.55); }
.ds-ping.enemy .pin { width: 0; height: 0; border: 9px solid transparent; border-top: 14px solid currentColor; transform: none; background: none; margin-bottom: -4px; }
.ds-ping b { margin-top: 5px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.ds-ping small { font-size: 12px; color: var(--ds-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ds-ping.fresh .pin { animation: ds-ping-in var(--ds-slow) var(--ds-ease); }
@keyframes ds-ping-in { from { scale: 1.8; opacity: 0; } }
.ds-pingwheel { position: absolute; left: 50%; top: 50%; width: 300px; height: 300px; transform: translate(-50%, -50%); pointer-events: none; display: none; }
.ds-pingwheel.open { display: block; }
.ds-pingwheel span { position: absolute; transform: translate(-50%, -50%); padding: 6px 10px; background: var(--ds-glass); border: 1px solid var(--ds-line-2); font-size: var(--ds-type-small); letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; color: var(--ds-text); }
.ds-pingwheel span.on { background: var(--ds-signal); color: var(--ds-signal-ink); border-color: var(--ds-signal); }
.ds-pingwheel span.enemy.on { background: var(--ds-alert); border-color: var(--ds-alert); color: var(--ds-ink); }
.ds-pingwheel i { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; transform: translate(-50%, -50%) rotate(45deg); border: 1px solid var(--ds-text); }
@media (prefers-reduced-motion: reduce) { .ds-ping.fresh .pin { animation: none; } }
`;

/** A ping where it shows on the screen. */
export interface PingScreenMark {
  readonly id: number;
  readonly kind: PingKind;
  /** Who pinged it: their name, or "You". */
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** Metres from the view, along the ground. */
  readonly distance: number;
}

/** Where each wheel choice sits, around the centre (px): up, right, down, left. */
const WHEEL_AT: readonly (readonly [number, number])[] = [
  [150, 22],
  [278, 150],
  [150, 278],
  [22, 150],
];

/** How long (ms) a new marker plays its arrival. */
const FRESH_MS = 600;

export class PingMarks {
  readonly #root: HTMLElement;
  readonly #marks = new Map<number, { el: HTMLDivElement; html: string; at: number }>();
  readonly #wheel: HTMLDivElement;
  #pick: PingKind | null | undefined = undefined;

  constructor(root: HTMLElement) {
    if (!document.getElementById('ds-ping-css')) {
      const style = document.createElement('style');
      style.id = 'ds-ping-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.#root = root;
    this.#wheel = document.createElement('div');
    this.#wheel.className = 'ds-pingwheel';
    this.#wheel.innerHTML = `<i></i>${PING_WHEEL.map((k, i) => `<span class="${k}" style="left:${WHEEL_AT[i]![0]}px;top:${WHEEL_AT[i]![1]}px">${PING_LABELS[k]}</span>`).join('')}`;
    root.append(this.#wheel);
  }

  /** Draws `marks` (none: all gone) and the wheel (null: closed). */
  update(marks: readonly PingScreenMark[], wheel: { readonly pick: PingKind | null } | null): void {
    const now = performance.now();
    const seen = new Set<number>();
    for (const m of marks) {
      seen.add(m.id);
      let held = this.#marks.get(m.id);
      if (!held) {
        const el = document.createElement('div');
        this.#root.append(el);
        held = { el, html: '', at: now };
        this.#marks.set(m.id, held);
      }
      const cls = `ds-ping ${m.kind}${now - held.at < FRESH_MS ? ' fresh' : ''}`;
      if (held.el.className !== cls) held.el.className = cls;
      held.el.style.transform = `translate(${Math.round(m.x)}px, ${Math.round(m.y)}px) translate(-50%, -100%)`;
      const html = `<span class="pin"></span><b>${m.kind === 'enemy' ? 'Enemy' : PING_LABELS[m.kind]}</b><small>${Math.round(m.distance)} m</small>`;
      if (html !== held.html) {
        held.el.innerHTML = html;
        held.html = html;
      }
    }
    for (const [id, held] of this.#marks) {
      if (seen.has(id)) continue;
      held.el.remove();
      this.#marks.delete(id);
    }
    this.#wheel.classList.toggle('open', wheel !== null);
    const pick = wheel?.pick;
    if (pick !== this.#pick) {
      this.#pick = pick;
      this.#wheel.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', PING_WHEEL[i] === pick));
    }
  }
}
