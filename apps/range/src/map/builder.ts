import { box, orientedBox, playerClip, yawBox, type Blocks, type Material, type Solid, type Vec3 } from '@duty-shooter/fps-core';

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
}

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
  /** The gable ends: their positions along the ridge axis (centre of the wall), thickness and material. */
  readonly gables?: { readonly at: readonly number[]; readonly thickness: number; readonly material: Material };
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

  /** An axis-aligned solid, drawn. */
  add(min: Vec3, max: Vec3, material: Material, options: { blocks?: Blocks; prop?: string } = {}): Solid {
    const s = box({ min, max, material, ...options });
    this.solids.push(s);
    return s;
  }

  /** A solid turned about the vertical axis, drawn. */
  turned(center: Vec3, size: Vec3, yaw: number, material: Material): Solid {
    const s = yawBox({ center, size, yaw, material });
    this.solids.push(s);
    return s;
  }

  /** Invisible player clip; bullets fly through it. */
  clip(min: Vec3, max: Vec3, material: Material = 'concrete'): Solid {
    const s = playerClip({ min, max, material });
    this.hidden.push(s);
    return s;
  }

  /** A wall along one axis, with doors and windows cut out of it. */
  wall(spec: WallSpec): void {
    const lo = Math.min(spec.from, spec.to);
    const hi = Math.max(spec.from, spec.to);
    const t = spec.thickness / 2;
    const piece = (a: number, b: number, y0: number, y1: number, material: Material) => {
      if (b - a < 1e-6 || y1 - y0 < 1e-6) return;
      const min: Vec3 = spec.along === 'x' ? [a, spec.bottom + y0, spec.at - t] : [spec.at - t, spec.bottom + y0, a];
      const max: Vec3 = spec.along === 'x' ? [b, spec.bottom + y1, spec.at + t] : [spec.at + t, spec.bottom + y1, b];
      this.add(min, max, material);
    };
    const openings = [...(spec.openings ?? [])].sort((p, q) => p.from - q.from);
    let cursor = lo;
    for (const o of openings) {
      if (o.from < cursor - 1e-6 || o.to > hi + 1e-6 || o.to <= o.from) throw new Error(`Opening ${o.from}..${o.to} does not fit the wall ${lo}..${hi}`);
      piece(cursor, o.from, 0, spec.height, spec.material);
      piece(o.from, o.to, 0, o.bottom, spec.material);
      piece(o.from, o.to, o.top, spec.height, spec.material);
      if (o.pane) {
        // A thin pane in the middle of the wall.
        const p = Math.min(0.03, t);
        const min: Vec3 = spec.along === 'x' ? [o.from, spec.bottom + o.bottom, spec.at - p] : [spec.at - p, spec.bottom + o.bottom, o.from];
        const max: Vec3 = spec.along === 'x' ? [o.to, spec.bottom + o.top, spec.at + p] : [spec.at + p, spec.bottom + o.top, o.to];
        this.add(min, max, o.pane);
      }
      cursor = o.to;
    }
    piece(cursor, hi, 0, spec.height, spec.material);
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
   * plane, walked on as player clip steps filled down to `base`.
   */
  slope(spec: { readonly from: readonly [number, number]; readonly to: readonly [number, number]; readonly across: readonly [number, number]; readonly along: 'x' | 'z'; readonly base: number; readonly low: number; readonly high: number; readonly material: Material }): void {
    const { along, base, low, high } = spec;
    // Horizontal direction from the low edge to the high edge, and the run.
    const a = along === 'x' ? spec.from[0] : spec.from[1];
    const b = along === 'x' ? spec.to[0] : spec.to[1];
    const run = Math.abs(b - a);
    const sign = Math.sign(b - a);
    const [c0, c1] = spec.across;
    const steps = Math.ceil((high - low) / SLOPE_STEP - 1e-9);
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
    this.solids.push(orientedBox({ center, size: [c1 - c0, SLOPE_THICKNESS, Math.hypot(run, high - low)], yaw, pitch, roll: 0, material: spec.material, blocks: 'bullets' }));
  }

  /** A gable roof: two walkable slopes meeting at the ridge, with the gable ends closed in thin bands under the slopes. */
  gableRoof(spec: GableRoofSpec): void {
    const { x0, x1, z0, z1, base, eave, peak } = spec;
    if (spec.ridge === 'z') {
      const xc = (x0 + x1) / 2;
      this.slope({ from: [x0, 0], to: [xc, 0], across: [z0, z1], along: 'x', base, low: eave, high: peak, material: spec.material });
      this.slope({ from: [x1, 0], to: [xc, 0], across: [z0, z1], along: 'x', base, low: eave, high: peak, material: spec.material });
    } else {
      const zc = (z0 + z1) / 2;
      this.slope({ from: [0, z0], to: [0, zc], across: [x0, x1], along: 'z', base, low: eave, high: peak, material: spec.material });
      this.slope({ from: [0, z1], to: [0, zc], across: [x0, x1], along: 'z', base, low: eave, high: peak, material: spec.material });
    }
    const g = spec.gables;
    if (!g) return;
    // Each band is as wide as the roof at the band's top, so it stays under the slopes.
    const half = (spec.ridge === 'z' ? x1 - x0 : z1 - z0) / 2;
    const centre = spec.ridge === 'z' ? (x0 + x1) / 2 : (z0 + z1) / 2;
    const rise = peak - eave;
    const band = 0.1;
    for (const at of g.at) {
      for (let y = base; y < peak - 1e-6; y += band) {
        const top = Math.min(peak, y + band);
        const w = top <= eave ? half : half * (1 - (top - eave) / rise) - SLOPE_THICKNESS;
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
export function groundTiles(layers: readonly { readonly rect: Rect; readonly material: Material }[]): { rect: Rect; material: Material }[] {
  const out: { rect: Rect; material: Material }[] = [];
  const placed: Rect[] = [];
  for (const layer of layers) {
    for (const rect of carve(layer.rect, placed)) out.push({ rect, material: layer.material });
    placed.push(layer.rect);
  }
  return out;
}
