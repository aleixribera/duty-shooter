import { PING_WHEEL, type PingKind } from '@duty-shooter/fps-core';
import { PING_LABELS } from '../ui/pings';
import type { AllyTag } from './ally-tags';

/**
 * Pings on the screen (ticket 66): a marker over each thing the Squad
 * marked, held at the screen's edge when it is off it, and the ping wheel
 * while the ping key is held. An enemy is marked in the danger colour; a
 * place or a thing, something to go to, in the signal colour.
 */

const CSS = `
.ds-ping { position: absolute; left: 0; top: 0; will-change: transform; display: flex; flex-direction: column; align-items: center; pointer-events: none; color: var(--ds-light); text-shadow: 0 1px 2px rgb(0 0 0 / 0.9); }
.ds-ping.enemy { color: var(--ds-enemy); }
.ds-ping .pin { width: 14px; height: 14px; border: 2px solid currentColor; transform: rotate(45deg); background: rgb(11 14 19 / 0.55); }
.ds-ping.enemy .pin { width: 0; height: 0; border: 9px solid transparent; border-top: 14px solid currentColor; transform: none; background: none; margin-bottom: -4px; }
.ds-ping b { margin-top: 5px; padding: 3px 7px 1px; background: var(--ds-ink); text-shadow: none; font-size: var(--ds-type-small); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.ds-ping small { padding: 1px 7px 3px; background: var(--ds-ink); text-shadow: none; font-size: var(--ds-type-small); color: var(--ds-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ds-ping.fresh .pin { animation: ds-ping-in var(--ds-slow) var(--ds-ease); }
@keyframes ds-ping-in { from { scale: 1.8; opacity: 0; } }
.ds-pingwheel { position: absolute; left: 50%; top: 50%; width: 300px; height: 300px; transform: translate(-50%, -50%); pointer-events: none; display: none; }
.ds-pingwheel.open { display: block; }
.ds-pingwheel span { position: absolute; transform: translate(-50%, -50%); padding: 6px 10px; background: var(--ds-glass); border: 1px solid var(--ds-line-2); font-size: var(--ds-type-small); letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; color: var(--ds-text); }
.ds-pingwheel span.on { background: var(--ds-light); color: var(--ds-ink); border-color: var(--ds-light); }
.ds-pingwheel span.enemy.on { background: var(--ds-enemy); border-color: var(--ds-enemy); color: var(--ds-ink); }
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

/** How far (px) a ping's marker reaches over its point: up, and to each side (an enemy's word is short, a place's longer). */
const PING_UP = 62;
const pingHalf = (kind: PingKind): number => (kind === 'enemy' ? 36 : 62);
/** An ally's tag (see allyTags): half its width (a long name's), and how tall its name, mark and label stand (px). */
const TAG_HALF = 64;
const tagHeight = (t: AllyTag): number => (t.name ? 22 : 0) + (t.mark === 'downed' ? 22 : 17) + (t.label ? 18 : 0);
/** How much further (px) a marker lifted last frame stays lifted, so one at a tag's border doesn't jump up and down. */
const HOLD = 12;
/** The gap (px) left between a raised marker and the tag under it, and the least room a marker keeps at the screen's top. */
const GAP = 4;
const TOP = 8;

/** How much nearer (m) a marker lifted last frame must come before it takes the place of the one under it. */
const NEARER = 2;

/**
 * The marks placed clear of the allies' tags and of each other, in the order given. An ally often pings the enemy
 * they're facing, so the enemy stands just past them on the screen and its marker landed on their chevron, the two
 * merging (review 2026-11-12e); two enemies pinged side by side stacked label on label, one hiding the other's distance
 * (review 2026-11-12g). A marker that would cover a tag or a marker already placed goes straight up until it sits over
 * it, still over its point. The nearest marker is placed first, so it keeps its point and the farther ones stand above
 * it, as they would in the world. `lifted` names the marks lifted last frame: they hold a little longer (see HOLD and
 * NEARER), so two markers at a border don't swap or jump each frame.
 */
export function placePings(marks: readonly PingScreenMark[], tags: readonly AllyTag[], lifted: ReadonlySet<number> = new Set()): PingScreenMark[] {
  if (marks.length === 0 || (tags.length === 0 && marks.length === 1)) return [...marks];
  const boxes = tags.map((t) => {
    const h = t.edge ? 42 + (t.label ? 18 : 0) : tagHeight(t);
    const bottom = t.edge ? t.y + h / 2 : t.y;
    return { x: t.x, half: TAG_HALF, top: bottom - h, bottom };
  });
  const placed: PingScreenMark[] = [...marks];
  const order = marks.map((m, i) => ({ m, i, by: m.distance + (lifted.has(m.id) ? NEARER : 0) })).sort((a, b) => a.by - b.by || a.m.id - b.m.id);
  for (const { m, i } of order) {
    const hold = lifted.has(m.id) ? HOLD : 0;
    let y = m.y;
    // Each lift clears one box; a lift can only meet boxes higher up, so there are at most as many as there are boxes.
    // The hold widens only the first test, from the marker's own point: once lifted, it sits GAP over the box it cleared,
    // inside the hold, and would find that box again instead of the next one up.
    for (let k = 0; k <= boxes.length; k++) {
      const below = k === 0 ? hold : 0;
      const under = boxes.find((b) => Math.abs(b.x - m.x) < pingHalf(m.kind) + b.half + hold && y > b.top - below && y - PING_UP - hold < b.bottom);
      if (!under) break;
      y = under.top - GAP;
    }
    // A lifted marker stops at the screen's top; one already up there was never moved, so it stays on its point.
    const at = y === m.y ? m : { ...m, y: Math.max(y, Math.min(m.y, PING_UP + TOP)) };
    placed[i] = at;
    boxes.push({ x: at.x, half: pingHalf(m.kind), top: at.y - PING_UP, bottom: at.y });
  }
  return placed;
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
