import type { PingKind, TerrainData } from '@duty-shooter/fps-core';
import { mapPoint, paintIsland, terrainBounds, type MapBounds } from '../ui/island-map';
import { ordinal } from '../ui/model';
import { bearing, compassOffset, compassTicks, type RingCircle, type RingStatus } from '../ui/royale';
import type { DropMark } from '../ui/supply-drop';
import type { RebootMark } from '../ui/reboot';
import { escapeHtml as escape } from '../ui/theme';

/**
 * The Battle Royale's part of the HUD: the compass with the Ring line and
 * the alive count at the top, the warning while outside the Ring, the
 * placement and who you watch once you're out, and the island map on its
 * key. Plain DOM over the canvas, like the rest of the HUD; the map is one
 * canvas, its island painted once a match and only redrawn while it is open.
 */

const CSS = `
.ds-br-top { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: stretch; width: min(640px, calc(100vw - 32px)); }
.ds-br-top .count { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 74px; padding: 4px 10px; }
.ds-br-top .count b { font-size: 26px; font-weight: 700; line-height: 1; }
.ds-br-top .count span { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ds-text-2); margin-top: 3px; }
.ds-compass { position: relative; height: 46px; overflow: hidden; border-left: 1px solid var(--ds-line); border-right: 1px solid var(--ds-line); }
.ds-compass i { position: absolute; top: 0; width: 1px; height: 7px; background: var(--ds-text-2); }
.ds-compass i.pt { height: 11px; width: 2px; background: var(--ds-text); }
.ds-compass em { position: absolute; top: 12px; transform: translateX(-50%); font-style: normal; font-size: 11px; letter-spacing: 0.06em; color: var(--ds-text-2); }
.ds-compass em.pt { font-size: 14px; font-weight: 700; color: var(--ds-text); top: 13px; }
.ds-compass .hd { position: absolute; left: 50%; bottom: 2px; transform: translateX(-50%); font-size: 11px; font-weight: 700; padding: 0 4px; background: var(--ds-ink); color: var(--ds-text); z-index: 1; }
.ds-compass .caret { position: absolute; left: 50%; top: 0; width: 0; height: 0; border: 5px solid transparent; border-top-color: var(--ds-text); transform: translateX(-50%); }
.ds-compass .mk { position: absolute; bottom: 6px; transform: translateX(-50%); font-size: 12px; line-height: 1; }
.ds-compass .mk.safe { color: var(--ds-hazard); font-size: 14px; }
.ds-compass .mk.mate { color: var(--ds-text); font-size: 10px; }
.ds-compass .mk.pinned { opacity: 0.75; }
.ds-compass .mk.drop { color: var(--ds-signal); font-size: 13px; }
.ds-compass .mk.drop { white-space: nowrap; }
.ds-compass .mk.reboot { color: var(--ds-signal); font-size: 13px; white-space: nowrap; }
.ds-compass .mk.reboot small { margin-left: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; color: var(--ds-text); }
.ds-map aside .key i.beacon { width: 9px; height: 9px; border: 2px solid var(--ds-signal); transform: rotate(45deg); background: var(--ds-ink); }
.ds-map aside .key i.card { width: 12px; height: 8px; background: var(--ds-signal); }
.ds-watch .card { font-size: 13px; letter-spacing: 0.02em; color: var(--ds-text); text-transform: none; }
.ds-compass .mk.ping { color: var(--ds-signal); font-size: 12px; white-space: nowrap; }
.ds-compass .mk.ping.enemy { color: var(--ds-alert); }
.ds-compass .mk.ping small { margin-left: 3px; font-size: 10px; font-weight: 700; color: var(--ds-text); }
.ds-compass .mk.drop small { margin-left: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; color: var(--ds-text); }
.ds-ringline { position: absolute; left: 50%; top: 74px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 5px 12px; white-space: nowrap; font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
.ds-ringline .stage { color: var(--ds-text-2); }
.ds-ringline .t { font-size: 15px; letter-spacing: 0.04em; }
.ds-ringline.closing { border-left: 3px solid var(--ds-hazard); }
.ds-ringline.closing .what, .ds-ringline.closing .t { color: var(--ds-hazard); }
.ds-ringline .key { margin-left: 4px; padding-left: 10px; border-left: 1px solid var(--ds-line-2); color: var(--ds-text-2); font-size: 11px; }
.ds-ringline kbd { font: inherit; padding: 0 5px; border: 1px solid var(--ds-line-2); color: var(--ds-text); margin-right: 5px; }
.ds-ringline .bar { width: 70px; height: 3px; background: var(--ds-line-2); }
.ds-ringline .bar i { display: block; height: 100%; background: var(--ds-hazard); transform-origin: 0 50%; }
.ds-outside { position: absolute; left: 50%; top: 116px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 8px 16px 8px 12px; border: 1px solid var(--ds-hazard); background: var(--ds-glass); white-space: nowrap; text-shadow: none; }
.ds-outside .arrow { width: 22px; height: 22px; display: grid; place-items: center; color: var(--ds-hazard); font-size: 18px; line-height: 1; }
.ds-outside b { display: block; font-size: 14px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-hazard); }
.ds-outside small { display: block; font-size: 12px; letter-spacing: 0.08em; color: var(--ds-text); margin-top: 2px; }
.ds-nextline { position: absolute; left: 50%; top: 116px; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 4px 12px 4px 8px; white-space: nowrap; font-size: 12px; letter-spacing: 0.08em; color: var(--ds-text-2); }
.ds-nextline .arrow { width: 16px; height: 16px; display: grid; place-items: center; color: var(--ds-text); font-size: 12px; line-height: 1; }
.ds-nextline b { color: var(--ds-text); font-variant-numeric: tabular-nums; }
.ds-hazardedge { position: absolute; inset: 0; box-shadow: inset 0 0 90px 20px color-mix(in srgb, var(--ds-hazard) 50%, transparent); opacity: 0; transition: opacity 300ms linear; }
.ds-out { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%); text-align: center; white-space: nowrap; padding: 10px 22px 12px; background: var(--ds-glass); animation: ds-in 160ms ease-out; }
.ds-out .what { font-size: 13px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ds-alert); }
.ds-out .place { margin-top: 4px; font-size: 76px; font-weight: 700; line-height: 0.95; letter-spacing: 0.02em; text-shadow: 0 2px 14px rgb(0 0 0 / 0.7); }
.ds-out .of { font-size: 14px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text); }
.ds-watch { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 14px; padding: 8px 14px; white-space: nowrap; }
.ds-watch .who { font-size: 18px; font-weight: 700; letter-spacing: 0.04em; }
.ds-watch .k { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-2); }
.ds-watch kbd { font: inherit; font-weight: 700; padding: 1px 6px; border: 1px solid var(--ds-line-2); color: var(--ds-text); margin-right: 6px; }
.ds-map { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; gap: 24px; background: var(--ds-scrim); text-shadow: none; pointer-events: none; z-index: 5; }
.ds-map.open { display: flex; }
.ds-map canvas { width: min(86vh, 64vw); height: min(86vh, 64vw); border: 1px solid var(--ds-line-2); background: var(--ds-ink); }
.ds-map aside { width: 220px; display: flex; flex-direction: column; gap: 14px; }
.ds-map aside h2 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; line-height: 1; }
.ds-map aside .row { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 8px; border-bottom: 1px solid var(--ds-line); }
.ds-map aside .row b { font-size: 20px; }
.ds-map aside .row.hz b { color: var(--ds-hazard); }
.ds-map aside .key { display: flex; align-items: center; gap: 10px; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ds-text-2); }
.ds-map aside .key i { width: 22px; height: 0; border-top: 2px solid var(--ds-hazard); }
.ds-map aside .key i.next { border-top: 2px dashed var(--ds-text); }
.ds-map aside .key i.drop { width: 10px; height: 10px; border: 2px solid var(--ds-signal); background: var(--ds-ink); }
.ds-map aside .key i.you { width: 0; height: 0; border: 6px solid transparent; border-bottom: 11px solid var(--ds-signal); border-top: 0; }
.ds-map aside .close { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-2); }
.ds-map aside .close kbd { font: inherit; font-weight: 700; padding: 1px 6px; border: 1px solid var(--ds-line-2); color: var(--ds-text); margin-right: 6px; }
@media (max-width: 760px) {
  .ds-br-top .count { min-width: 58px; padding: 4px 6px; }
  .ds-br-top .count b { font-size: 20px; }
  .ds-ringline { top: 70px; font-size: 11px; }
  .ds-out .place { font-size: 56px; }
  .ds-watch { bottom: 8px; width: calc(100vw - 24px); box-sizing: border-box; flex-wrap: wrap; justify-content: center; gap: 4px 14px; padding: 6px 12px; white-space: normal; }
  .ds-watch .card { flex-basis: 100%; text-align: center; }
}
@media (max-aspect-ratio: 1/1) {
  .ds-map { flex-direction: column; }
  .ds-map canvas { width: min(92vw, 70vh); height: min(92vw, 70vh); }
  .ds-map aside { width: min(92vw, 70vh); flex-direction: row; flex-wrap: wrap; gap: 8px 16px; }
  .ds-map aside h2 { width: 100%; font-size: 22px; }
}
@media (max-height: 480px) { .ds-map canvas { width: min(90vh, 60vw); height: min(90vh, 60vw); } .ds-map aside { gap: 8px; } }
`;

/** Degrees of heading the compass strip shows across its width. */
const COMPASS_SPAN = 150;

/** A squadmate as the HUD marks them. */
export interface RoyaleMate {
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly downed: boolean;
}

export interface RoyaleHudState {
  readonly status: RingStatus;
  /** Where the wall stands now, and the circle it closes on. */
  readonly ring: RingCircle;
  readonly next: RingCircle;
  readonly alive: number;
  readonly squads: number;
  readonly kills: number;
  /** The view's compass heading (degrees). */
  readonly heading: number;
  /** Where the view stands on the island: you, or whoever you watch; null for neither. */
  readonly at: { readonly x: number; readonly z: number } | null;
  readonly mates: readonly RoyaleMate[];
  /** The Supply Drops called in so far (each until it is opened). */
  readonly drops?: readonly DropMark[];
  /** Reboot: the Beacons and your Squad's Cards lying on the island. */
  readonly reboot?: readonly RebootMark[];
  /** You carry a Card: the compass shows the nearest ready Beacon. */
  readonly carrying?: boolean;
  /** The Squad's pings standing (ticket 66). */
  readonly pings?: readonly { readonly kind: PingKind; readonly x: number; readonly z: number }[];
  /** Out: what has become of your Reboot Card, or null without one. */
  readonly card?: string | null;
  /** Your Squad's place once it's out, with how many Squads started. */
  readonly placement: { readonly place: number; readonly of: number } | null;
  /** You are out of this match (dead, or arrived late). */
  readonly out: boolean;
  /** You have a seat in this match; a late arrival never had one, and only watches. */
  readonly seated: boolean;
  /** Who you watch, if anyone. */
  readonly watching: string | null;
  /** The keys to show: the map's and the pause menu's (where Leave is). */
  readonly mapKey: string;
  readonly menuKey: string;
  readonly mapOpen: boolean;
}

/** The island as the map draws it: its terrain, palette colours and named places. */
export interface IslandMapSource {
  readonly terrain: TerrainData;
  readonly colors: readonly number[];
  readonly places: readonly { readonly name: string; readonly x: number; readonly z: number }[];
}

/** The island picture's size (px); the visible canvas scales it. */
const PAINT = 640;

/** How long the out panel stays up before it clears the spectator's view (ms). */
const OUT_SHOWN_MS = 6000;

export class RoyaleHud {
  readonly #top: HTMLDivElement;
  readonly #compass: HTMLDivElement;
  readonly #alive: HTMLElement;
  readonly #right: HTMLElement;
  readonly #ringline: HTMLDivElement;
  readonly #outside: HTMLDivElement;
  /** Inside the Ring but out of the next circle: which way, and how far (ticket 68). */
  readonly #nextline: HTMLDivElement;
  readonly #edge: HTMLDivElement;
  readonly #out: HTMLDivElement;
  /** What the out panel last said, and when it started saying it (performance.now ms). */
  #outSaid: string | null = null;
  #outAt = 0;
  readonly #watch: HTMLDivElement;
  readonly #map: HTMLDivElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #aside: HTMLElement;
  #source: IslandMapSource | null;
  /** The theme's colours for the canvas, read once from its variables. */
  #tokens: Readonly<Record<'hazard' | 'text' | 'signal' | 'alert' | 'ink', string>> | null = null;
  #painting = false;
  #island: HTMLCanvasElement | null = null;
  #bounds: MapBounds | null = null;
  readonly #html = new WeakMap<HTMLElement, string>();
  /** Starts true, so the constructor's first #show(false) hides every box until a Battle Royale is in play (ticket 37). */
  #shown = true;
  #lastDraw = 0;

  constructor(root: HTMLElement, source: IslandMapSource | null) {
    if (!document.getElementById('ds-br-css')) {
      const style = document.createElement('style');
      style.id = 'ds-br-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    const el = (cls: string, html = '', parent: HTMLElement = root) => {
      const e = document.createElement('div');
      e.className = cls;
      e.innerHTML = html;
      parent.append(e);
      return e;
    };
    this.#source = source;
    this.#edge = el('ds-hazardedge');
    this.#top = el('ds-br-top ds-plate');
    this.#alive = el('count', '', this.#top);
    this.#compass = el('ds-compass', '', this.#top);
    this.#right = el('count', '', this.#top);
    this.#ringline = el('ds-ringline ds-plate');
    this.#outside = el('ds-outside');
    this.#nextline = el('ds-nextline ds-plate');
    this.#out = el('ds-out');
    this.#watch = el('ds-watch ds-plate');
    this.#map = el('ds-map');
    this.#canvas = document.createElement('canvas');
    this.#map.append(this.#canvas);
    this.#aside = document.createElement('aside');
    this.#map.append(this.#aside);
    this.#show(false);
  }

  /** The island the map draws. */
  set island(source: IslandMapSource | null) {
    this.#source = source;
    this.#island = null;
  }

  #show(on: boolean): void {
    if (on === this.#shown) return;
    this.#shown = on;
    for (const e of [this.#top, this.#ringline]) e.style.display = on ? '' : 'none';
    if (!on) for (const e of [this.#outside, this.#nextline, this.#out, this.#watch]) e.style.display = 'none';
    if (!on) this.#map.classList.remove('open');
    if (!on) this.#edge.style.opacity = '0';
  }

  /** Draws the Battle Royale HUD, or hides it (null: not a Battle Royale in play). */
  update(s: RoyaleHudState | null): void {
    this.#show(s !== null);
    if (!s) return;
    // The island is painted when the page has a moment, ahead of the map's first opening.
    if (!this.#island && !this.#painting && this.#source) {
      this.#painting = true;
      const later = globalThis.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
      later(() => {
        this.#painting = false;
        this.#paint();
      });
    }
    this.#set(this.#alive, `<b>${s.alive}</b><span>Alive</span>`);
    this.#set(this.#right, s.out ? `<b>${s.squads}</b><span>Squads</span>` : `<b>${s.kills}</b><span>Kills</span>`);
    this.#set(this.#compass, this.#compassHtml(s));
    const st = s.status;
    const closing = st.phase === 'closing';
    this.#ringline.classList.toggle('closing', closing);
    const t = st.seconds === null ? '' : clock(st.seconds);
    const what = st.phase === 'hold' ? 'Ring closes in' : closing ? 'Ring closing' : 'Final circle';
    this.#set(this.#ringline, `<span class="stage">Stage ${st.stage}/${st.stages}</span><span class="what">${what}</span>${t ? `<span class="t">${t}</span>` : ''}${s.out ? '' : `<span class="key"><kbd>${escape(s.mapKey)}</kbd>Map</span>`}`);
    // Outside: a plate that says it, which way is safe and what it costs, and the screen's edge in the hazard colour.
    const outside = st.outside && !s.out;
    this.#outside.style.display = outside ? '' : 'none';
    this.#edge.style.opacity = outside ? '1' : '0';
    if (outside && s.at) {
      const turn = bearing([s.at.x, s.at.z], [s.ring.x, s.ring.z]) - s.heading;
      this.#set(
        this.#outside,
        `<span class="arrow" style="transform:rotate(${Math.round(turn)}deg)">▲</span><span><b>Outside the Ring</b><small>${st.damage} HP a second · ${Math.ceil(st.toSafety)} m to safety</small></span>`,
      );
    }
    // Inside the Ring with the next circle elsewhere: the way there, quietly, before the wall makes it urgent.
    const toNext = !outside && !s.out && st.phase !== 'closed' && st.toNext >= 1 && s.at !== null;
    this.#nextline.style.display = toNext ? '' : 'none';
    if (toNext && s.at) {
      const turn = bearing([s.at.x, s.at.z], [s.next.x, s.next.z]) - s.heading;
      this.#set(this.#nextline, `<span class="arrow" style="transform:rotate(${Math.round(turn)}deg)">▲</span><span><b>${Math.ceil(st.toNext)} m</b> to the next circle</span>`);
    }
    // Out: a few seconds of your placement big (or that your Squad fights on), then out of the spectator's way; who you watch stays, with the way to the menu.
    // A late arrival was never in, so it gets no out card: only who it watches (ticket 43).
    const place = s.out && s.seated ? s.placement : null;
    const said = !s.out || !s.seated ? null : place ? `<div class="what">${place.place === 1 ? 'Victory' : 'Eliminated'}</div><div class="place">${ordinal(place.place)}</div><div class="of">of ${place.of} Squads</div>` : `<div class="what">You're out</div><div class="of">Your Squad fights on</div>`;
    const now = performance.now();
    if (said !== this.#outSaid) {
      this.#outSaid = said;
      this.#outAt = now;
    }
    const showOut = said !== null && now - this.#outAt < OUT_SHOWN_MS;
    this.#out.style.display = showOut ? '' : 'none';
    if (showOut) this.#set(this.#out, said);
    this.#watch.style.display = s.out ? '' : 'none';
    if (s.out) {
      this.#set(
        this.#watch,
        `${s.card ? `<span class="card">${escape(s.card)}</span>` : ''}${place ? `<span class="who">${ordinal(place.place)}</span><span class="k">of ${place.of}</span>` : ''}${s.watching ? '' : '<span class="k">Spectating</span>'}<span class="k"><kbd>${escape(s.menuKey)}</kbd>Menu</span><span class="k"><kbd>${escape(s.mapKey)}</kbd>Map</span>`,
      );
    }
    this.#map.classList.toggle('open', s.mapOpen);
    if (s.mapOpen) this.#drawMap(s);
  }

  #compassHtml(s: RoyaleHudState): string {
    const pct = (x: number) => `${((x + 0.5) * 100).toFixed(2)}%`;
    let html = '<span class="caret"></span>';
    for (const tick of compassTicks(s.heading, COMPASS_SPAN)) {
      html += `<i class="${tick.point ? 'pt' : ''}" style="left:${pct(tick.x)}"></i>`;
      // Numbers every 30 degrees only, so the strip stays readable at phone width.
      if (tick.point || Number(tick.label) % 30 === 0) html += `<em class="${tick.point ? 'pt' : ''}" style="left:${pct(tick.x)}">${tick.label}</em>`;
    }
    if (s.at) {
      const here: [number, number] = [s.at.x, s.at.z];
      // The way to the next circle's centre, while it isn't where you stand.
      if (Math.hypot(s.next.x - here[0], s.next.z - here[1]) > s.next.radius * 0.5 || s.status.outside) {
        const o = compassOffset(s.heading, bearing(here, [s.next.x, s.next.z]), COMPASS_SPAN);
        html += `<span class="mk safe${o.pinned ? ' pinned' : ''}" style="left:${pct(o.x)}">◆</span>`;
      }
      // Each crate not yet opened: a square in the signal colour, its distance over it, held at the strip's edge when behind.
      for (const d of s.drops ?? []) {
        if (d.opened) continue;
        const o = compassOffset(s.heading, bearing(here, [d.x, d.z]), COMPASS_SPAN);
        const m = Math.round(Math.hypot(d.x - here[0], d.z - here[1]));
        html += `<span class="mk drop${o.pinned ? ' pinned' : ''}" style="left:${pct(o.x)}">■<small>${m} m</small></span>`;
      }
      // Your Squad's Cards lying on the island, and, carrying one, the nearest ready Beacon.
      const beacons = (s.reboot ?? []).filter((r) => r.kind === 'beacon' && r.state === 'ready');
      const nearest = s.carrying ? beacons.reduce<RebootMark | null>((a, b) => (!a || Math.hypot(b.x - here[0], b.z - here[1]) < Math.hypot(a.x - here[0], a.z - here[1]) ? b : a), null) : null;
      for (const r of [...(s.reboot ?? []).filter((x) => x.kind === 'card'), ...(nearest ? [nearest] : [])]) {
        const o = compassOffset(s.heading, bearing(here, [r.x, r.z]), COMPASS_SPAN);
        const m = Math.round(Math.hypot(r.x - here[0], r.z - here[1]));
        html += `<span class="mk reboot${o.pinned ? ' pinned' : ''}" style="left:${pct(o.x)}">${r.kind === 'card' ? '▬' : '◇'}<small>${m} m</small></span>`;
      }
      // The Squad's pings: a triangle for an enemy, a dot for a place, each with its distance.
      for (const p of s.pings ?? []) {
        const o = compassOffset(s.heading, bearing(here, [p.x, p.z]), COMPASS_SPAN);
        const m = Math.round(Math.hypot(p.x - here[0], p.z - here[1]));
        html += `<span class="mk ping${p.kind === 'enemy' ? ' enemy' : ''}${o.pinned ? ' pinned' : ''}" style="left:${pct(o.x)}">${p.kind === 'enemy' ? '▼' : '●'}<small>${m} m</small></span>`;
      }
      for (const m of s.mates) {
        const o = compassOffset(s.heading, bearing(here, [m.x, m.z]), COMPASS_SPAN);
        if (!o.pinned) html += `<span class="mk mate" style="left:${pct(o.x)}">${m.downed ? '✚' : '▲'}</span>`;
      }
    }
    html += `<span class="hd">${String(Math.round(s.heading) % 360).padStart(3, '0')}</span>`;
    return html;
  }

  #paint(): void {
    if (this.#island || !this.#source) return;
    const { terrain, colors } = this.#source;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = PAINT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(paintIsland(terrain, colors, PAINT) as Uint8ClampedArray<ArrayBuffer>, PAINT, PAINT), 0, 0);
    this.#island = canvas;
    this.#bounds = terrainBounds(terrain);
  }

  /** The map: the island, a grid, the places, the Ring and the next circle, your squad and you. Redrawn at most 20 times a second. */
  #drawMap(s: RoyaleHudState): void {
    const now = performance.now();
    this.#set(
      this.#aside,
      `<h2>Zero Island</h2><div class="row"><span class="ds-label">Stage</span><b>${s.status.stage}/${s.status.stages}</b></div><div class="row hz"><span class="ds-label">${s.status.phase === 'hold' ? 'Ring closes in' : s.status.phase === 'closing' ? 'Ring closing' : 'Final circle'}</span><b>${s.status.seconds === null ? '–' : clock(s.status.seconds)}</b></div><div class="row"><span class="ds-label">Alive</span><b>${s.alive}</b></div><div class="key"><i></i>The Ring</div><div class="key"><i class="next"></i>Next circle</div>${(s.drops ?? []).some((d) => !d.opened) ? '<div class="key"><i class="drop"></i>Supply Drop</div>' : ''}${(s.reboot ?? []).some((r) => r.kind === 'beacon') ? '<div class="key"><i class="beacon"></i>Reboot Beacon</div>' : ''}${(s.reboot ?? []).some((r) => r.kind === 'card') ? '<div class="key"><i class="card"></i>Reboot Card</div>' : ''}<div class="key"><i class="you"></i>${s.out ? 'Watching' : 'You'}</div><div class="close"><kbd>${escape(s.mapKey)}</kbd>Close</div>`,
    );
    if (now - this.#lastDraw < 50) return;
    this.#lastDraw = now;
    this.#paint();
    const island = this.#island;
    const css = getComputedStyle(this.#map);
    const tok = (this.#tokens ??= {
      hazard: css.getPropertyValue('--ds-hazard').trim(),
      text: css.getPropertyValue('--ds-text').trim(),
      signal: css.getPropertyValue('--ds-signal').trim(),
      alert: css.getPropertyValue('--ds-alert').trim(),
      ink: css.getPropertyValue('--ds-ink').trim(),
    });
    const b = this.#bounds;
    const ctx = this.#canvas.getContext('2d');
    if (!ctx || !island || !b) return;
    const wide = this.#canvas.clientWidth || 600;
    const px = Math.min(1280, Math.round(wide * Math.min(2, devicePixelRatio || 1)));
    if (this.#canvas.width !== px) this.#canvas.width = this.#canvas.height = px;
    const k = px / wide;
    const at = (x: number, z: number) => mapPoint(b, px, x, z);
    const metres = px / b.size;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(island, 0, 0, px, px);
    // A 100 m grid, lettered west to east and numbered north to south.
    const font = css.getPropertyValue('--ds-font');
    ctx.strokeStyle = tok.text;
    ctx.fillStyle = tok.text;
    ctx.lineWidth = 1;
    ctx.font = `700 ${Math.round(10 * k)}px ${font}`;
    ctx.globalAlpha = 0.12;
    const cells = Math.floor(b.size / 100);
    for (let i = 0; i <= cells; i++) {
      const p = (i * 100 * px) / b.size;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, px);
      ctx.moveTo(0, p);
      ctx.lineTo(px, p);
      ctx.stroke();
      if (i < cells) {
        ctx.globalAlpha = 0.5;
        // Each label in the middle of its column or row, so A and 1 don't meet in the corner.
        const mid = p + (50 * px) / b.size;
        ctx.textAlign = 'center';
        ctx.fillText(String.fromCharCode(65 + i), mid, 12 * k);
        ctx.textAlign = 'left';
        ctx.fillText(String(i + 1), 4 * k, mid + 4 * k);
        ctx.globalAlpha = 0.12;
      }
    }
    ctx.globalAlpha = 1;
    // Outside the wall, tinted in the hazard colour.
    const [rx, rz] = at(s.ring.x, s.ring.z);
    const rr = s.ring.radius * metres;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, px, px);
    ctx.arc(rx, rz, Math.max(0, rr), 0, Math.PI * 2, true);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = tok.hazard;
    ctx.fill('evenodd');
    ctx.restore();
    ctx.lineWidth = 2.5 * k;
    ctx.strokeStyle = tok.hazard;
    ctx.beginPath();
    ctx.arc(rx, rz, Math.max(0, rr), 0, Math.PI * 2);
    ctx.stroke();
    // The next circle, dashed in white.
    const [nx, nz] = at(s.next.x, s.next.z);
    ctx.setLineDash([7 * k, 5 * k]);
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = tok.text;
    ctx.beginPath();
    ctx.arc(nx, nz, Math.max(2 * k, s.next.radius * metres), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // The places, by name.
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(11 * k)}px ${font}`;
    for (const p of this.#source?.places ?? []) {
      const [x, y] = at(p.x, p.z);
      const text = p.name.toUpperCase();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = tok.ink;
      const w = ctx.measureText(text).width + 10 * k;
      ctx.fillRect(x - w / 2, y - 9 * k, w, 16 * k);
      ctx.globalAlpha = 1;
      ctx.fillStyle = tok.text;
      ctx.fillText(text, x, y + 3 * k);
    }
    // Reboot Beacons: a diamond, outlined when ready, filled while one reboots, dim red while it rests.
    for (const r of s.reboot ?? []) {
      if (r.kind !== 'beacon') continue;
      const [x, y] = at(r.x, r.z);
      const h = 5.5 * k;
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h, y);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x - h, y);
      ctx.closePath();
      ctx.fillStyle = r.state === 'busy' ? tok.signal : tok.ink;
      ctx.fill();
      ctx.strokeStyle = r.state === 'resting' ? tok.alert : tok.signal;
      ctx.globalAlpha = r.state === 'resting' ? 0.7 : 1;
      ctx.lineWidth = 2 * k;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Your Squad's Cards: a card in the signal colour with whose it is and the seconds it has left.
    for (const r of s.reboot ?? []) {
      if (r.kind !== 'card') continue;
      const [x, y] = at(r.x, r.z);
      ctx.fillStyle = tok.ink;
      ctx.fillRect(x - 9 * k, y - 6 * k, 18 * k, 12 * k);
      ctx.fillStyle = tok.signal;
      ctx.fillRect(x - 7 * k, y - 4 * k, 14 * k, 8 * k);
      const label = `${r.name ?? ''} ${r.left ?? 0} s`.trim();
      ctx.font = `700 ${Math.round(11 * k)}px ${font}`;
      const w = ctx.measureText(label.toUpperCase()).width + 10 * k;
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = tok.ink;
      ctx.fillRect(x - w / 2, y + 8 * k, w, 16 * k);
      ctx.globalAlpha = 1;
      ctx.fillStyle = tok.text;
      ctx.fillText(label.toUpperCase(), x, y + 20 * k);
    }
    // Supply Drops not yet opened: a square in the signal colour with its countdown while it falls.
    for (const d of s.drops ?? []) {
      if (d.opened) continue;
      const [x, y] = at(d.x, d.z);
      const h = 7 * k;
      ctx.fillStyle = tok.ink;
      ctx.fillRect(x - h - 2 * k, y - h - 2 * k, 2 * h + 4 * k, 2 * h + 4 * k);
      ctx.strokeStyle = tok.signal;
      ctx.lineWidth = 2.5 * k;
      ctx.strokeRect(x - h, y - h, 2 * h, 2 * h);
      ctx.fillStyle = tok.signal;
      ctx.fillRect(x - h * 0.45, y - h * 0.45, h * 0.9, h * 0.9);
      const label = d.landsIn > 0 ? `Supply Drop ${Math.ceil(d.landsIn)} s` : 'Supply Drop';
      ctx.font = `700 ${Math.round(11 * k)}px ${font}`;
      const w = ctx.measureText(label.toUpperCase()).width + 10 * k;
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = tok.ink;
      ctx.fillRect(x - w / 2, y + h + 4 * k, w, 16 * k);
      ctx.globalAlpha = 1;
      ctx.fillStyle = tok.text;
      ctx.fillText(label.toUpperCase(), x, y + h + 16 * k);
    }
    // The Squad's pings: a red triangle for an enemy, a ringed dot for a place.
    for (const p of s.pings ?? []) {
      const [x, y] = at(p.x, p.z);
      ctx.lineWidth = 2 * k;
      ctx.strokeStyle = tok.ink;
      ctx.fillStyle = p.kind === 'enemy' ? tok.alert : tok.signal;
      ctx.beginPath();
      if (p.kind === 'enemy') {
        ctx.moveTo(x - 6 * k, y - 5 * k);
        ctx.lineTo(x + 6 * k, y - 5 * k);
        ctx.lineTo(x, y + 6 * k);
        ctx.closePath();
      } else ctx.arc(x, y, 5 * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    }
    // Squadmates, then you (or who you watch): an arrow along the view.
    for (const m of s.mates) {
      const [x, y] = at(m.x, m.z);
      ctx.fillStyle = m.downed ? tok.alert : tok.text;
      ctx.beginPath();
      ctx.arc(x, y, 5 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tok.text;
      ctx.fillText(m.name.slice(0, 12), x, y - 9 * k);
    }
    if (s.at) {
      const [x, y] = at(s.at.x, s.at.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((s.heading * Math.PI) / 180);
      ctx.fillStyle = tok.signal;
      ctx.strokeStyle = tok.ink;
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      ctx.moveTo(0, -11 * k);
      ctx.lineTo(7 * k, 8 * k);
      ctx.lineTo(0, 4 * k);
      ctx.lineTo(-7 * k, 8 * k);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  }

  #set(el: HTMLElement, html: string): void {
    if (this.#html.get(el) === html) return;
    this.#html.set(el, html);
    el.innerHTML = html;
  }
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
