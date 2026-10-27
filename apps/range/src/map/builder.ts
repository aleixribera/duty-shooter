import { box, orientedBox, playerClip, yawBox, type Blocks, type Material, type Solid, type Vec3 } from '@duty-shooter/fps-core';
import { defaultFinishKey, type Decoration, type Look } from '@duty-shooter/fps-client/surfaces';

/** A gap in a wall (a door or window), measured along the wall in world coordinates. */
export interface Opening {
  readonly from: number;
  readonly to: number;
  /** Sill height (0 for a door), from the wall's bottom. */
  readonly bottom: number;
  /** Head height, from the wall's bottom. */
  readonly top: number;
  /** A pane filling the opening, e.g. glass: blocks players, bullets pierce it per the penetration table. */
  readonly pane?: Material;
}

export interface WallSpec {
  /** The world axis the wall runs along. */
  readonly along: 'x' | 'z';
  /** The wall's centre line on the other horizontal axis. */
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly thickness: number;
  readonly bottom: number;
  readonly height: number;
  readonly material: Material;
  readonly openings?: readonly Opening[];
  /** How its pieces look (else the painted look in scope). */
  readonly look?: Look | string;
  /** Trim on one face or both: frames round the openings, and optionally shutters and baseboards. */
  readonly trim?: readonly WallTrim[];
}

/** Trim on one face of a wall, all of it decoration on the wall's own pieces. */
export interface WallTrim {
  /** The face: the one looking toward +axis (1) or -axis (-1) across the wall's thickness. */
  readonly face: 1 | -1;
  /** Frames round doors and windows, with a sill under windows. */
  readonly frames?: string;
  /** A shutter either side of each window. */
  readonly shutters?: string;
  /** A baseboard along the foot of the wall. */
  readonly baseboard?: string;
}

/** Window and door frames: their width and how far they stand off the wall (within the 5 cm decoration limit). */
const FRAME_W = 0.08;
export const FRAME_PROUD = 0.03;
/** How far a decoration sinks into its solid, so it never shows a gap. */
export const SINK = 0.01;
/** A hair kept between faces that would otherwise share a plane. */
const HAIR = 0.002;

export interface StairsSpec {
  /** The world axis the stairs climb along. */
  readonly along: 'x' | 'z';
  /** Where the first step's nosing starts and where the top is reached, along `along` (either direction). */
  readonly from: number;
  readonly to: number;
  /** The stairs' extent on the other horizontal axis. */
  readonly across: readonly [number, number];
  readonly bottom: number;
  readonly top: number;
  readonly material: Material;
  /** Largest rise per step (m). */
  readonly maxRise?: number;
}

export interface GableRoofSpec {
  /** Footprint including the eaves' overhang. */
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  /** The axis the ridge runs along; the two slopes fall away across it. */
  readonly ridge: 'x' | 'z';
  /** Height of the closed attic floor under the roof (top of the ceiling). */
  readonly base: number;
  /** Height of the roof surface at the eaves and at the ridge. */
  readonly eave: number;
  readonly peak: number;
  readonly material: Material;
  /**
   * The gable ends: their positions along the ridge axis (centre of the wall),
   * thickness and material, and how far the slopes overhang the walls under
   * them across the ridge (the gables stay inside the walls).
   */
  readonly gables?: { readonly at: readonly number[]; readonly thickness: number; readonly material: Material; readonly overhang?: number };
  /** The slopes' look and the gable ends' look (else the painted look in scope). */
  readonly looks?: { readonly roof: Look | string; readonly gable: Look | string };
  /** Builds the gable ends alone (used to paint them apart from the slopes). */
  readonly gablesOnly?: boolean;
  /** False for a roof out of the players' reach: the slopes get no player clip steps. */
  readonly walkable?: boolean;
}

/** Player clip steps under a slope rise by this much each (m): fine enough that walking up feels smooth. */
export const SLOPE_STEP = 0.05;
/** Bullet surfaces over a slope are this thick (m). */
export const SLOPE_THICKNESS = 0.12;

/**
 * Collects a map's solids: drawn solids (which collide as they look) and
 * hidden collision (player clip, hidden bullet surfaces), with helpers for
 * walls with openings, stairs and walkable sloped roofs.
 */
export class Builder {
  readonly solids: Solid[] = [];
  readonly hidden: Solid[] = [];
  /** Per drawn solid, its look (null: its material's default finish). */
  readonly looks: (Look | null)[] = [];
  readonly #decorations: { solid: Solid; center: Vec3; size: Vec3; yaw: number; finish: string }[] = [];
  #look: Look | null = null;

  /** Draws every solid added inside `fn` in `look` (a finish key for every face, or a look by face). */
  paint(look: Look | string, fn: () => void): void {
    const outer = this.#look;
    this.#look = typeof look === 'string' ? { side: look } : look;
    try {
      fn();
    } finally {
      this.#look = outer;
    }
  }

  #draw(s: Solid, look?: Look | string): Solid {
    this.solids.push(s);
    this.looks.push(look === undefined ? this.#look : typeof look === 'string' ? { side: look } : look);
    return s;
  }

  /** An axis-aligned solid, drawn. */
  add(min: Vec3, max: Vec3, material: Material, options: { blocks?: Blocks; prop?: string; look?: Look | string } = {}): Solid {
    const { look, ...rest } = options;
    return this.#draw(box({ min, max, material, ...rest }), look);
  }

  /** A solid turned about the vertical axis, drawn. */
  turned(center: Vec3, size: Vec3, yaw: number, material: Material, look?: Look | string): Solid {
    return this.#draw(yawBox({ center, size, yaw, material }), look);
  }

  /**
   * Visual-only trim on a solid: a box (yawed about its centre) in `finish`
   * that must stay within 5 cm of the solid's surface.
   */
  decorate(solid: Solid, center: Vec3, size: Vec3, finish: string, yaw = 0): void {
    this.#decorations.push({ solid, center, size, yaw, finish });
  }

  /** Axis-aligned decoration on a solid, from its corners. */
  decorateBox(solid: Solid, min: Vec3, max: Vec3, finish: string): void {
    this.decorate(solid, [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], [max[0] - min[0], max[1] - min[1], max[2] - min[2]], finish);
  }

  /** The decorations, pointing at their solids by index into `solids`. */
  get decorations(): Decoration[] {
    const index = new Map(this.solids.map((s, i) => [s, i]));
    return this.#decorations.map((d) => {
      const solid = index.get(d.solid);
      if (solid === undefined) throw new Error('Decoration on a solid that is not drawn');
      return { center: d.center, size: d.size, yaw: d.yaw, finish: d.finish, solid };
    });
  }

  /** Invisible player clip; bullets fly through it. */
  clip(min: Vec3, max: Vec3, material: Material = 'concrete'): Solid {
    const s = playerClip({ min, max, material });
    this.hidden.push(s);
    return s;
  }

  /**
   * A wall along one axis, with doors and windows cut out of it. Returns its
   * full-height pieces, in order along the wall.
   */
  wall(spec: WallSpec): Solid[] {
    const run = () => this.#wall(spec);
    if (spec.look === undefined) return run();
    let out: Solid[] = [];
    this.paint(spec.look, () => (out = run()));
    return out;
  }

  #wall(spec: WallSpec): Solid[] {
    const lo = Math.min(spec.from, spec.to);
    const hi = Math.max(spec.from, spec.to);
    const t = spec.thickness / 2;
    /** A box from (a, y0) to (b, y1) along the wall, from `c0` to `c1` across it (world), with the wall's bottom added to y. */
    const span = (a: number, b: number, y0: number, y1: number, c0: number, c1: number): [Vec3, Vec3] =>
      spec.along === 'x' ? [[a, spec.bottom + y0, c0], [b, spec.bottom + y1, c1]] : [[c0, spec.bottom + y0, a], [c1, spec.bottom + y1, b]];
    const piece = (a: number, b: number, y0: number, y1: number, material: Material): Solid | null => {
      if (b - a < 1e-6 || y1 - y0 < 1e-6) return null;
      const [min, max] = span(a, b, y0, y1, spec.at - t, spec.at + t);
      return this.add(min, max, material);
    };
    const openings = [...(spec.openings ?? [])].sort((p, q) => p.from - q.from);
    const full: { a: number; b: number; s: Solid }[] = [];
    const cut: { o: Opening; sill: Solid | null; head: Solid | null }[] = [];
    const keep = (a: number, b: number) => {
      const s = piece(a, b, 0, spec.height, spec.material);
      if (s) full.push({ a, b, s });
    };
    let cursor = lo;
    for (const o of openings) {
      if (o.from < cursor - 1e-6 || o.to > hi + 1e-6 || o.to <= o.from) throw new Error(`Opening ${o.from}..${o.to} does not fit the wall ${lo}..${hi}`);
      keep(cursor, o.from);
      const sill = piece(o.from, o.to, 0, o.bottom, spec.material);
      const head = piece(o.from, o.to, o.top, spec.height, spec.material);
      cut.push({ o, sill, head });
      if (o.pane) {
        // A thin pane in the middle of the wall.
        const p = Math.min(0.03, t);
        const [min, max] = span(o.from, o.to, o.bottom, o.top, spec.at - p, spec.at + p);
        this.add(min, max, o.pane, { look: defaultFinishKey(o.pane) });
      }
      cursor = o.to;
    }
    keep(cursor, hi);

    for (const trim of spec.trim ?? []) {
      const face = spec.at + trim.face * t;
      /** Decoration standing `proud` off this face (sunk SINK into it), from (a, y0) to (b, y1) along the wall. */
      const deco = (s: Solid, a: number, b: number, y0: number, y1: number, finish: string, proud = FRAME_PROUD) => {
        const [c0, c1] = [face - trim.face * SINK, face + trim.face * proud].sort((p, q) => p - q) as [number, number];
        const [min, max] = span(a, b, y0, y1, c0, c1);
        this.decorateBox(s, min, max, finish);
      };
      /** The full-height piece covering a..b along the wall, if any. */
      const over = (a: number, b: number) => full.find((f) => f.a <= a + 1e-6 && f.b >= b - 1e-6)?.s ?? null;
      for (const { o, sill, head } of cut) {
        const left = over(o.from - FRAME_W, o.from);
        const right = over(o.to, o.to + FRAME_W);
        const top = Math.min(spec.height, o.top + FRAME_W);
        const window = o.bottom > 0;
        if (trim.frames) {
          const foot = window ? Math.max(0, o.bottom - FRAME_W) : 0;
          if (left) deco(left, o.from - FRAME_W, o.from - HAIR, foot, top, trim.frames);
          if (right) deco(right, o.to + HAIR, o.to + FRAME_W, foot, top, trim.frames);
          if (head && top - o.top > HAIR * 2) deco(head, o.from, o.to, o.top + HAIR, top, trim.frames);
          // The sill stands further out and a little over the opening's edges.
          if (window && sill) deco(sill, o.from - 0.04, o.to + 0.04, Math.max(0, o.bottom - 0.06), o.bottom + 0.02, trim.frames, 0.045);
        }
        if (trim.shutters && window) {
          const w = Math.min(0.45, (o.top - o.bottom) * 0.4);
          const l = over(o.from - FRAME_W - w - 0.03, o.from - FRAME_W);
          const r = over(o.to + FRAME_W, o.to + FRAME_W + w + 0.03);
          if (l) deco(l, o.from - FRAME_W - w - 0.03, o.from - FRAME_W - 0.03, o.bottom, o.top, trim.shutters, 0.025);
          if (r) deco(r, o.to + FRAME_W + 0.03, o.to + FRAME_W + w + 0.03, o.bottom, o.top, trim.shutters, 0.025);
        }
      }
      if (trim.baseboard) {
        for (const f of full) deco(f.s, f.a, f.b, 0, Math.min(0.1, spec.height), trim.baseboard, 0.015);
        for (const { o, sill } of cut) if (sill && o.bottom >= 0.1) deco(sill, o.from, o.to, 0, 0.1, trim.baseboard, 0.015);
      }
    }
    return full.map((f) => f.s);
  }

  /** A flight of solid steps, each no higher than the step height. */
  stairs(spec: StairsSpec): void {
    const rise = spec.top - spec.bottom;
    const count = Math.ceil(rise / (spec.maxRise ?? 0.19) - 1e-9);
    const run = (spec.to - spec.from) / count;
    const [c0, c1] = spec.across;
    for (let i = 0; i < count; i++) {
      const a = spec.from + run * i;
      const b = spec.from + run * (i + 1);
      const y = spec.bottom + (rise * (i + 1)) / count;
      const min: Vec3 = spec.along === 'x' ? [Math.min(a, b), spec.bottom, c0] : [c0, spec.bottom, Math.min(a, b)];
      const max: Vec3 = spec.along === 'x' ? [Math.max(a, b), y, c1] : [c1, y, Math.max(a, b)];
      this.add(min, max, spec.material);
    }
  }

  /**
   * A walkable sloped plane from an edge at height `low` up to an edge at
   * `high`: drawn and shot at as a sloped bullet surface whose top is the
   * plane, walked on as player clip steps filled down to `base` (none when
   * `walkable` is false).
   */
  slope(spec: { readonly from: readonly [number, number]; readonly to: readonly [number, number]; readonly across: readonly [number, number]; readonly along: 'x' | 'z'; readonly base: number; readonly low: number; readonly high: number; readonly material: Material; readonly walkable?: boolean }): void {
    const { along, base, low, high } = spec;
    // Horizontal direction from the low edge to the high edge, and the run.
    const a = along === 'x' ? spec.from[0] : spec.from[1];
    const b = along === 'x' ? spec.to[0] : spec.to[1];
    const run = Math.abs(b - a);
    const sign = Math.sign(b - a);
    const [c0, c1] = spec.across;
    const steps = spec.walkable === false ? 0 : Math.ceil((high - low) / SLOPE_STEP - 1e-9);
    for (let i = 0; i < steps; i++) {
      const p = a + (sign * run * i) / steps;
      const q = a + (sign * run * (i + 1)) / steps;
      const top = low + ((high - low) * (i + 1)) / steps;
      const min: Vec3 = along === 'x' ? [Math.min(p, q), base, c0] : [c0, base, Math.min(p, q)];
      const max: Vec3 = along === 'x' ? [Math.max(p, q), top, c1] : [c1, top, Math.max(p, q)];
      this.hidden.push(playerClip({ min, max, material: spec.material }));
    }
    const pitch = Math.atan2(high - low, run);
    const d: Vec3 = along === 'x' ? [sign, 0, 0] : [0, 0, sign];
    const yaw = Math.atan2(-d[0], -d[2]);
    const mid = (a + b) / 2;
    const across = (c0 + c1) / 2;
    const midY = (low + high) / 2;
    // The surface's upward normal leans back toward the low edge.
    const n: Vec3 = [-d[0] * Math.sin(pitch), Math.cos(pitch), -d[2] * Math.sin(pitch)];
    const h = SLOPE_THICKNESS / 2;
    const center: Vec3 = along === 'x' ? [mid - n[0] * h, midY - n[1] * h, across - n[2] * h] : [across - n[0] * h, midY - n[1] * h, mid - n[2] * h];
    this.#draw(orientedBox({ center, size: [c1 - c0, SLOPE_THICKNESS, Math.hypot(run, high - low)], yaw, pitch, roll: 0, material: spec.material, blocks: 'bullets' }));
  }

  /** A gable roof: two walkable slopes meeting at the ridge, with the gable ends closed in thin bands under the slopes. */
  gableRoof(spec: GableRoofSpec): void {
    if (spec.looks) {
      const { looks, gables, ...rest } = spec;
      this.paint(looks.roof, () => this.gableRoof(rest));
      if (gables) this.paint(looks.gable, () => this.gableRoof({ ...rest, gables, gablesOnly: true }));
      return;
    }
    const { x0, x1, z0, z1, base, eave, peak, walkable = true } = spec;
    if (spec.gablesOnly) {
      // Only the gable ends (see looks).
    } else if (spec.ridge === 'z') {
      const xc = (x0 + x1) / 2;
      this.slope({ from: [x0, 0], to: [xc, 0], across: [z0, z1], along: 'x', base, low: eave, high: peak, material: spec.material, walkable });
      this.slope({ from: [x1, 0], to: [xc, 0], across: [z0, z1], along: 'x', base, low: eave, high: peak, material: spec.material, walkable });
    } else {
      const zc = (z0 + z1) / 2;
      this.slope({ from: [0, z0], to: [0, zc], across: [x0, x1], along: 'z', base, low: eave, high: peak, material: spec.material, walkable });
      this.slope({ from: [0, z1], to: [0, zc], across: [x0, x1], along: 'z', base, low: eave, high: peak, material: spec.material, walkable });
    }
    const g = spec.gables;
    if (!g) return;
    // Each band is as wide as the roof at the band's top, so it stays under the slopes, and no wider than the walls.
    const half = (spec.ridge === 'z' ? x1 - x0 : z1 - z0) / 2;
    const walls = half - (g.overhang ?? 0);
    const centre = spec.ridge === 'z' ? (x0 + x1) / 2 : (z0 + z1) / 2;
    const rise = peak - eave;
    const band = 0.1;
    for (const at of g.at) {
      for (let y = base; y < peak - 1e-6; y += band) {
        const top = Math.min(peak, y + band);
        const w = Math.min(walls, top <= eave ? half : half * (1 - (top - eave) / rise) - SLOPE_THICKNESS);
        if (w <= 0.02) break;
        const t = g.thickness / 2;
        const min: Vec3 = spec.ridge === 'z' ? [centre - w, y, at - t] : [at - t, y, centre - w];
        const max: Vec3 = spec.ridge === 'z' ? [centre + w, top, at + t] : [at + t, top, centre + w];
        this.add(min, max, g.material);
      }
    }
  }
}

/** A ground rectangle (x, z). */
export interface Rect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/** `r` with every hole cut out of it, as non-overlapping rectangles. */
export function carve(r: Rect, holes: readonly Rect[]): Rect[] {
  let pieces: Rect[] = [r];
  for (const h of holes) {
    const next: Rect[] = [];
    for (const p of pieces) {
      if (h.x1 <= p.x0 || h.x0 >= p.x1 || h.z1 <= p.z0 || h.z0 >= p.z1) {
        next.push(p);
        continue;
      }
      if (h.z0 > p.z0) next.push({ x0: p.x0, x1: p.x1, z0: p.z0, z1: h.z0 });
      if (h.z1 < p.z1) next.push({ x0: p.x0, x1: p.x1, z0: h.z1, z1: p.z1 });
      const z0 = Math.max(p.z0, h.z0);
      const z1 = Math.min(p.z1, h.z1);
      if (h.x0 > p.x0) next.push({ x0: p.x0, x1: h.x0, z0, z1 });
      if (h.x1 < p.x1) next.push({ x0: h.x1, x1: p.x1, z0, z1 });
    }
    pieces = next.filter((p) => p.x1 - p.x0 > 1e-6 && p.z1 - p.z0 > 1e-6);
  }
  return pieces;
}

/**
 * Ground tiles with their tops at y = 0 that never overlap, so no two
 * surfaces fight for the same pixels. Earlier layers win where layers overlap.
 */
export function groundTiles<T extends { readonly rect: Rect }>(layers: readonly T[]): T[] {
  const out: T[] = [];
  const placed: Rect[] = [];
  for (const layer of layers) {
    for (const rect of carve(layer.rect, placed)) out.push({ ...layer, rect });
    placed.push(layer.rect);
  }
  return out;
}
