import { teamMode, type ModeId, type PlayerOutput, type TeamId } from '@duty-shooter/fps-core';
import { offTouchCorners, pinMarker } from './markers';

/**
 * How far (m) an ally's name shows over their head, through walls too; past it only the chevron (ticket 52). Bare
 * chevrons over a wall from the team inside the house read as hit markers and said nothing of who was there (review
 * 2026-11-12d), so a wall no longer takes the name away: it dims the tag.
 */
export const NAME_RANGE = 40;
/**
 * The box (px) a tag can cover over the point it stands on: half its width, and how far
 * it reaches up and down. With the crosshair inside it, the tag fades so it never hides
 * what you aim at.
 */
const COVER = { half: 80, up: 64, down: 16 };
/** How near an edge (px) a tag counts as off screen and pins to it. */
const INSET = 24;
/** An edge tag (a name over a chevron, centred on its pin): half its height, and the box two of them may not share (px). */
const EDGE_HALF = 20;
const EDGE_BOX = { width: 104, height: 42 };
/** How near (px) two names over heads lie on each other. */
const NAME_BOX = { width: 110, height: 24 };

/** An ally as the game sees them this frame: where the point over their head projects, and what you can see of them. */
export interface AllySeen {
  readonly id: string;
  readonly name: string;
  /** Metres away, on the ground plane. */
  readonly distance: number;
  readonly downed: boolean;
  /** Downed and near enough that holding Use would Revive them. */
  readonly inReach: boolean;
  /** A clear line from your eye to their head. */
  readonly seen: boolean;
  /** The projected point over their head, in pixels; mirrored already when `behind`. */
  readonly x: number;
  readonly y: number;
  readonly behind: boolean;
}

/** What one ally's tag shows, and where. */
export interface AllyTag {
  readonly id: string;
  /** The name over their head, or beside the mark at the screen's edge (a bare chevron there says nothing of who it points at); null when only the mark shows. */
  readonly name: string | null;
  readonly mark: 'chevron' | 'downed';
  /** Under the mark: how far a Downed ally is, or "Revive" in reach; null otherwise. */
  readonly label: string | null;
  /** Where the tag's bottom sits, in pixels. */
  readonly x: number;
  readonly y: number;
  /** Pinned to the screen's edge, the ally being off screen or behind you. */
  readonly edge: boolean;
  /** The chevron's turn in degrees: 0 points down at the ally under it; at an edge it points out toward them. */
  readonly angle: number;
  /** Close over the crosshair: drawn faint. */
  readonly faded: boolean;
  /** On screen with a wall between you: drawn dimmer than an ally in sight. */
  readonly hidden: boolean;
}

/**
 * The seats that get a tag: in the team modes your teammates, in a Battle Royale
 * your Squad (Solos have none), alive, Downed included, never `view` itself.
 */
export function alliesOf(players: readonly PlayerOutput[], view: string | null, team: TeamId | null, mode: ModeId): PlayerOutput[] {
  if (team === null || !(teamMode(mode) || mode === 'battle-royale')) return [];
  return players.filter((p) => p.alive && p.kind === 'player' && p.team === team && p.id !== view);
}

/** Whether the point over an ally's head is on screen, clear of its edges. */
function inView(a: AllySeen, width: number, height: number): boolean {
  return !a.behind && a.x >= INSET && a.x <= width - INSET && a.y >= INSET && a.y <= height - INSET;
}

/** Lays out one ally's tag: name within the name range, dimmer behind a wall, a chevron always, held to the screen's edge when off it. */
export function allyTag(a: AllySeen, width: number, height: number, touch = false): AllyTag {
  const onScreen = inView(a, width, height);
  const name = onScreen && a.distance <= NAME_RANGE ? a.name : null;
  const label = a.downed ? (a.inReach ? 'Revive' : `${Math.round(a.distance)} m`) : null;
  const mark = a.downed ? 'downed' : 'chevron';
  if (onScreen) {
    const cx = width / 2;
    const cy = height / 2;
    const faded = Math.abs(a.x - cx) < COVER.half && cy > a.y - COVER.up && cy < a.y + COVER.down;
    return { id: a.id, name, mark, label, x: a.x, y: a.y, edge: false, angle: 0, faded, hidden: !a.seen };
  }
  // The tag centres on its pin, so it is its foot that keeps off the readouts' corners and the touch controls.
  const foot = pinMarker(a.x, a.y + EDGE_HALF, a.behind, width, height, touch);
  const pin = { x: foot.x, y: foot.y - EDGE_HALF };
  // Toward the ally from the screen's centre; straight down when they're behind you.
  const angle = a.behind ? 0 : (Math.atan2(a.y - height / 2, a.x - width / 2) * 180) / Math.PI - 90;
  return { id: a.id, name: a.name, mark, label, x: pin.x, y: pin.y, edge: true, angle: Math.round(angle), faded: false, hidden: false };
}

/**
 * Every ally's tag, parted where two would lie on each other (design audit 2026-11-10): of two names
 * over heads that overlap, the nearer ally keeps theirs and the other is down to its chevron; of two
 * tags held to the same stretch of an edge, the later one steps up the edge (sideways, at the top).
 *
 * Only with `edges` (a Battle Royale squad) does an ally off screen or behind you hold the screen's
 * edge; without it (the team modes, where nobody is Downed today) only a Downed one would, and the rest have no tag until they come
 * into view. Five teammates pinned round the edges sat on the health, the kill feed and the gun, and
 * said nothing a player needed in a team fight (review 2026-11-13a, its most visible defect).
 */
export function allyTags(allies: readonly AllySeen[], width: number, height: number, touch = false, edges = true): AllyTag[] {
  const shown = edges ? allies : allies.filter((a) => a.downed || inView(a, width, height));
  return partTags(shown, width, height, touch);
}

function partTags(allies: readonly AllySeen[], width: number, height: number, touch: boolean): AllyTag[] {
  const tags = allies.map((a) => allyTag(a, width, height, touch));
  const named: AllyTag[] = [];
  const nearestFirst = allies.map((_, i) => i).sort((i, j) => allies[i]!.distance - allies[j]!.distance);
  for (const i of nearestFirst) {
    const t = tags[i]!;
    if (t.edge || t.name === null) continue;
    if (named.some((n) => Math.abs(n.x - t.x) < NAME_BOX.width && Math.abs(n.y - t.y) < NAME_BOX.height)) tags[i] = { ...t, name: null };
    else named.push(t);
  }
  const placed: { x: number; y: number }[] = [];
  const taken = (x: number, y: number) => placed.some((p) => Math.abs(p.x - x) < EDGE_BOX.width && Math.abs(p.y - y) < EDGE_BOX.height);
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i]!;
    if (!t.edge) continue;
    let { x, y } = t;
    for (let k = 1; taken(x, y) && k <= tags.length; k++) {
      const up = t.y - k * EDGE_BOX.height;
      // Up the edge while there is screen left; from the top, in toward the middle.
      if (up >= EDGE_HALF + 16) y = up;
      else x = t.x + (t.x < width / 2 ? k : -k) * EDGE_BOX.width;
      if (touch) x = offTouchCorners(x, y + EDGE_HALF, width);
    }
    placed.push({ x, y });
    if (x !== t.x || y !== t.y) tags[i] = { ...t, x, y };
  }
  return tags;
}

const CHEVRON = '<svg viewBox="0 0 24 15" width="24" height="15" aria-hidden="true"><path class="o" d="M3 3 12 12 21 3"/><path class="i" d="M3 3 12 12 21 3"/></svg>';
const CROSS = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path class="o" d="M10 3v14M3 10h14"/><path class="i" d="M10 3v14M3 10h14"/></svg>';

export const ALLY_TAGS_CSS = `
.ds-allies { position: absolute; inset: 0; pointer-events: none; }
.ds-ally { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; white-space: nowrap; transition: opacity var(--ds-fast) var(--ds-ease); }
.ds-ally.hidden { opacity: 0.65; }
.ds-ally.faded { opacity: 0.3; }
.ds-ally .name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; padding: 1px 7px 2px; background: var(--ds-scrim-soft); color: var(--ds-signal); font-size: var(--ds-type-small); font-weight: 700; line-height: 1.25; }
.ds-ally.edge .name { max-width: 96px; }
.ds-ally svg { display: block; overflow: visible; }
.ds-ally svg path { fill: none; stroke-linecap: square; }
.ds-ally svg .o { stroke: var(--ds-ink); stroke-width: 6.5; stroke-opacity: 0.85; }
.ds-ally svg .i { stroke: var(--ds-signal); stroke-width: 3; }
.ds-ally.downed svg .o { stroke-width: 8; }
.ds-ally.downed svg .i { stroke: var(--ds-alert); stroke-width: 4; }
.ds-ally .label { padding: 0 6px 1px; background: var(--ds-scrim-soft); color: var(--ds-text); font-size: var(--ds-type-small); line-height: 1.3; }
.ds-ally .label.reach { color: var(--ds-signal); font-weight: 700; }
`;

/** The tags as DOM: one element per ally, rewritten only when what it says changes. */
export class AllyTagsView {
  readonly #root: HTMLDivElement;
  readonly #els = new Map<string, { el: HTMLDivElement; html: string; cls: string; transform: string }>();

  constructor(parent: HTMLElement) {
    this.#root = document.createElement('div');
    this.#root.className = 'ds-allies';
    parent.append(this.#root);
  }

  update(tags: readonly AllyTag[]): void {
    const seen = new Set<string>();
    for (const t of tags) {
      seen.add(t.id);
      let e = this.#els.get(t.id);
      if (!e) {
        const el = document.createElement('div');
        this.#root.append(el);
        e = { el, html: '', cls: '', transform: '' };
        this.#els.set(t.id, e);
      }
      const icon = t.mark === 'downed' ? CROSS : CHEVRON;
      const turn = t.angle === 0 ? '' : ` style="transform:rotate(${t.angle}deg)"`;
      const html = `${t.name ? `<div class="name">${escape(t.name)}</div>` : ''}<div${turn}>${icon}</div>${t.label ? `<div class="label${t.label === 'Revive' ? ' reach' : ''}">${t.label}</div>` : ''}`;
      if (html !== e.html) e.el.innerHTML = e.html = html;
      const cls = `ds-ally${t.mark === 'downed' ? ' downed' : ''}${t.hidden ? ' hidden' : ''}${t.faded ? ' faded' : ''}${t.edge ? ' edge' : ''}`;
      if (cls !== e.cls) e.el.className = e.cls = cls;
      // The mark sits on the point over their head; at an edge, the tag centres on the pin.
      const transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) translate(-50%, ${t.edge ? '-50%' : '-100%'})`;
      if (transform !== e.transform) e.el.style.transform = e.transform = transform;
    }
    for (const [id, e] of this.#els) {
      if (seen.has(id)) continue;
      e.el.remove();
      this.#els.delete(id);
    }
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** How often (ms) the sight line to each ally is checked again. */
const SIGHT_EVERY = 100;

/** Whether each ally is in sight, checked at most ten times a second each; forgotten when a match starts (ticket 60). */
export class AllySight {
  readonly #seen = new Map<string, { at: number; seen: boolean }>();

  /** Whether `id` was in sight at the last check, looking again (`look`) when that is older than a tenth of a second. */
  seen(id: string, now: number, look: () => boolean): boolean {
    let sight = this.#seen.get(id);
    if (!sight || now - sight.at > SIGHT_EVERY) {
      sight = { at: now, seen: look() };
      this.#seen.set(id, sight);
    }
    return sight.seen;
  }

  /** The allies checked so far. */
  get size(): number {
    return this.#seen.size;
  }

  clear(): void {
    this.#seen.clear();
  }
}
