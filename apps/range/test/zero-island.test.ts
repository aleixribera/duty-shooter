import { describe, expect, it } from 'vitest';
import { INTERMISSION, STATS, TICK_SECONDS, Terrain, createWorld, raycastWorld, usercmd, viewDirection, type PlayerOutput, type Solid, type Vec3 } from '@duty-shooter/fps-core';
import { GROUND_LAYERS, shotPose } from '@duty-shooter/fps-client/surfaces';
import { createHeadlessMatch, type HeadlessMatch } from '@duty-shooter/fps-core/harness';
import { insidePolygon, MATCH_MAPS, MAP_IDS, asMapId, buildMapById, mapSolids } from '../src/map/maps';
import { BRIDGES, CORES, REGION_IDS, SUMMIT, SUMMIT_RADIUS, TERRAIN_COLORS, TERRAIN_LAYERS, regionAt, zeroIslandGround, type RegionId } from '../src/map/zero-island-terrain';

const map = buildMapById('zero-island');
const data = map.terrain!;
const terrain = new Terrain(data);
const boundary = map.playArea!;

/** Calls `visit` for a sample of the grid's points every `step` metres. */
function everyPoint(step: number, visit: (x: number, z: number) => void): void {
  const [ox, oz] = data.origin;
  for (let z = oz + 0.5; z < oz + data.rows; z += step) for (let x = ox + 0.5; x < ox + data.columns; x += step) visit(x, z);
}

/** Dry ground (above the sea) in square metres. */
function landArea(): number {
  let cells = 0;
  everyPoint(4, (x, z) => {
    if (terrain.heightAt(x, z) > 0) cells++;
  });
  return cells * 16;
}

describe('Zero Island: the map', () => {
  it('is a map the app knows, offered in no lobby', () => {
    expect(MAP_IDS).toContain('zero-island');
    expect(asMapId('zero-island')).toBe('zero-island');
    expect(MATCH_MAPS).not.toContain('zero-island');
  });

  it('is about a square kilometre of land', () => {
    const area = landArea();
    expect(area).toBeGreaterThan(0.9e6);
    expect(area).toBeLessThan(1.15e6);
  });

  it('is about 2 min 40 s of sprinting across (6.22 m/s)', () => {
    let x0 = Infinity;
    let x1 = -Infinity;
    everyPoint(4, (x, z) => {
      if (terrain.heightAt(x, z) > 0) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
    });
    const seconds = (x1 - x0) / 6.22;
    expect(seconds).toBeGreaterThan(150);
    expect(seconds).toBeLessThan(215);
  });

  it('wears a photo ground layer on every surface of its palette', () => {
    const names = GROUND_LAYERS.map((l) => l.name);
    expect(TERRAIN_LAYERS).toHaveLength(TERRAIN_COLORS.length);
    for (const layer of TERRAIN_LAYERS) expect(names).toContain(layer);
    expect(buildMapById('zero-island').terrainLayers).toEqual(TERRAIN_LAYERS);
  });
});

describe('Zero Island: the Regions', () => {
  // The reference's layout: north is -Z, east is +X.
  const compass: Readonly<Record<RegionId, (x: number, z: number) => boolean>> = {
    'ground-zero': (x, z) => Math.abs(x) < 120 && Math.abs(z) < 120,
    'the-dustlands': (x, z) => x < -100 && z > 0,
    'frostbite-peaks': (x, z) => x < 0 && z < -100,
    'mutant-jungle': (x, z) => x > 50 && z < -100,
    'neon-city': (x, z) => x > 200 && Math.abs(z) < 200,
    'rogue-harbor': (x, z) => Math.abs(x) < 300 && z > 200,
  };

  it('has six, each with one Core where the reference puts it', () => {
    expect(REGION_IDS).toHaveLength(6);
    for (const id of REGION_IDS) {
      const core = CORES[id];
      expect(compass[id](core.x, core.z), id).toBe(true);
      expect(regionAt(core.x, core.z), id).toBe(id);
    }
  });

  it('gives each Core 6,000 to 10,000 m², on land', () => {
    for (const id of REGION_IDS) {
      const { x, z, radius } = CORES[id];
      const area = Math.PI * radius * radius;
      expect(area, id).toBeGreaterThanOrEqual(6000);
      expect(area, id).toBeLessThanOrEqual(10000);
      expect(terrain.heightAt(x, z), id).toBeGreaterThan(0);
      expect(insidePolygon(boundary, x, z), id).toBe(true);
    }
  });

  it('shares the land out, none of the six a sliver', () => {
    const area = new Map<RegionId, number>();
    everyPoint(8, (x, z) => {
      if (terrain.heightAt(x, z) <= 0) return;
      const id = regionAt(x, z);
      area.set(id, (area.get(id) ?? 0) + 64);
    });
    for (const id of REGION_IDS) expect(area.get(id) ?? 0, id).toBeGreaterThan(60_000);
  });
});

/**
 * The ground as a player can walk it: cell to cell, down anything, up only
 * onto ground under the slope limit and no higher than a step, and nowhere
 * past the Boundary. Solids are left out. Mantling is asked for: a bank a mantle
 * clears counts as a way out of a hollow, and as a way toward the summit.
 */
class Walk {
  readonly width = data.columns;
  readonly height = data.rows;
  readonly y = new Float32Array(this.width * this.height);
  readonly steep = new Uint8Array(this.width * this.height);
  readonly inside = new Uint8Array(this.width * this.height);

  constructor() {
    const [ox, oz] = data.origin;
    for (let j = 0; j < this.height; j++) {
      const z = oz + j + 0.5;
      // Where this row crosses the Boundary, so 1.8 million cells needn't each walk its edges.
      const crossings: number[] = [];
      for (let a = 0, b = boundary.length - 1; a < boundary.length; b = a++) {
        const [xa, za] = boundary[a]!;
        const [xb, zb] = boundary[b]!;
        if (za > z !== zb > z) crossings.push(((xb - xa) * (z - za)) / (zb - za) + xa);
      }
      crossings.sort((p, q) => p - q);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const from = Math.max(0, Math.ceil(crossings[k]! - ox));
        const to = Math.min(this.width, Math.floor(crossings[k + 1]! - ox));
        this.inside.fill(1, j * this.width + from, j * this.width + to);
      }
      for (let i = 0; i < this.width; i++) {
        const c = j * this.width + i;
        const x = ox + i + 0.5;
        this.y[c] = terrain.heightAt(x, z);
        this.steep[c] = terrain.steepAt(x - 0.25, z - 0.25) || terrain.steepAt(x + 0.25, z + 0.25) ? 1 : 0;
      }
    }
  }

  cellAt(x: number, z: number): number {
    return Math.floor(z - data.origin[1]) * this.width + Math.floor(x - data.origin[0]);
  }

  canStep(a: number, b: number): boolean {
    const rise = this.y[b]! - this.y[a]!;
    // Ten centimetres between cell middles is level at this resolution: a player crosses it on whichever of the two triangles is flat.
    if (rise <= 0.1) return true;
    // The slope limit is about the ground moved onto (ADR 0007): off a face onto flat ground is a step like any other.
    return !this.steep[b] && rise <= STATS.movement.stepHeight.value;
  }

  /** Whether a mantle takes a player from `a` up the bank to `b`, a few cells on. */
  canMantle(a: number, b: number): boolean {
    const rise = this.y[b]! - this.y[a]!;
    return rise > 0 && rise <= STATS.mantle.highClimbMaxHeight.value && !this.steep[a] && !this.steep[b];
  }

  /** Every cell reachable from `start`, or, `backward`, every cell that can get to it; `mantles` adds the banks. */
  spread(start: number, backward: boolean, mantles = false): Uint8Array {
    const seen = new Uint8Array(this.y.length);
    const queue = new Int32Array(this.y.length);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const w = this.width;
    while (head < tail) {
      const c = queue[head++]!;
      for (const n of [c - 1, c + 1, c - w, c + w]) {
        if (n < 0 || n >= seen.length || seen[n] || !this.inside[n]) continue;
        if (backward ? this.canStep(n, c) : this.canStep(c, n)) {
          seen[n] = 1;
          queue[tail++] = n;
        }
      }
      if (!mantles) continue;
      for (const n of [c - 3, c - 2, c + 2, c + 3, c - 3 * w, c - 2 * w, c + 2 * w, c + 3 * w]) {
        if (n < 0 || n >= seen.length || seen[n] || !this.inside[n]) continue;
        if (backward ? this.canMantle(n, c) : this.canMantle(c, n)) {
          seen[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    return seen;
  }
}

const walk = new Walk();
const home = walk.cellAt(map.offlineSpawn.position[0], map.offlineSpawn.position[2]);
const reached = walk.spread(home, false);
const climbed = walk.spread(home, false, true);

describe('Zero Island: where a player can go', () => {
  const canReturn = walk.spread(home, true, true);

  it('reaches every Core on foot, the plateau among them', () => {
    for (const id of REGION_IDS) expect(reached[walk.cellAt(CORES[id].x, CORES[id].z)], id).toBe(1);
    expect(terrain.heightAt(CORES['frostbite-peaks'].x, CORES['frostbite-peaks'].z)).toBeGreaterThan(40);
  });

  it('reaches nearly all the land', () => {
    let land = 0;
    let got = 0;
    for (let c = 0; c < reached.length; c += 7) {
      if (!walk.inside[c] || walk.y[c]! <= 0) continue;
      land++;
      got += reached[c]!;
    }
    expect(got / land).toBeGreaterThan(0.85);
  });

  it('never reaches the summit', () => {
    const found: number[] = [];
    const r = Math.ceil(SUMMIT_RADIUS);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        const c = walk.cellAt(SUMMIT.x + dx, SUMMIT.z + dz);
        if (climbed[c]) found.push(c);
      }
    }
    expect(found).toEqual([]);
  });

  it('has no pit: every place a player can get to, they can walk out of', () => {
    const trapped: [number, number][] = [];
    for (let c = 0; c < climbed.length; c++) {
      if (climbed[c] && !canReturn[c]) trapped.push([(c % walk.width) + data.origin[0], Math.floor(c / walk.width) + data.origin[1]]);
    }
    expect(trapped.length, JSON.stringify(trapped.slice(0, 8))).toBe(0);
  });

  it('keeps every wet place inside the Boundary shallow enough to wade', () => {
    let deepest = 0;
    for (let c = 0; c < walk.y.length; c += 3) if (walk.inside[c]) deepest = Math.min(deepest, walk.y[c]!);
    expect(deepest).toBeGreaterThan(-1);
  });

  it('closes the grid: the Boundary stands clear of its edge', () => {
    const [ox, oz] = data.origin;
    for (const [x, z] of boundary) {
      expect(x).toBeGreaterThan(ox + 20);
      expect(x).toBeLessThan(ox + data.columns - 20);
      expect(z).toBeGreaterThan(oz + 20);
      expect(z).toBeLessThan(oz + data.rows - 20);
    }
  });
});

describe('Zero Island: moving on it', () => {
  const solids = mapSolids(map);
  const at = (x: number, z: number): Vec3 => [x, terrain.heightAt(x, z), z];
  const start = (position: Vec3, standing = solids): HeadlessMatch => createHeadlessMatch({ solids: standing, terrain: data, players: [{ id: 'p', team: 1, position }] });
  const faceTo = (from: readonly number[], x: number, z: number) => Math.atan2(-(x - from[0]!), -(z - from[2]!));
  type Pressed = ('Sprint' | 'Jump')[];
  /** Sprints at (x, z) until within 1.5 m or `seconds` run out; every tick's output. `buttons` may change by tick. */
  function run(match: HeadlessMatch, x: number, z: number, seconds: number, buttons: Pressed | ((tick: number) => Pressed) = ['Sprint']): PlayerOutput[] {
    const out: PlayerOutput[] = [];
    for (let t = 0; t < seconds / TICK_SECONDS; t++) {
      const me = match.latest.players[0]!;
      if (Math.hypot(me.position[0] - x, me.position[2] - z) < 1.5) break;
      const output = match.step({ p: usercmd({ forward: 1, yaw: faceTo(me.position, x, z), buttons: typeof buttons === 'function' ? buttons(t) : buttons }) });
      out.push(output.players[0]!);
    }
    return out;
  }
  const last = (out: readonly PlayerOutput[]) => out.at(-1)!;

  it('walks up to the plateau from the plain', () => {
    const { x, z } = CORES['frostbite-peaks'];
    // The ground alone: a straight run, which cover would stop. Bots show there's a way round it.
    const out = run(start(at(x, z + 240), []), x, z + 10, 60);
    expect(Math.hypot(last(out).position[0] - x, last(out).position[2] - z - 10)).toBeLessThan(2);
    expect(last(out).position[1]).toBeGreaterThan(40);
  });

  it('fails to climb to the summit from any side, sprinting and jumping', () => {
    for (let k = 0; k < 24; k++) {
      const bearing = (k / 24) * 2 * Math.PI;
      const r = SUMMIT.cliffFoot + 12;
      const x = SUMMIT.x + Math.cos(bearing) * r;
      const z = SUMMIT.z + Math.sin(bearing) * r;
      if (!insidePolygon(boundary, x, z)) continue;
      const out = run(start(at(x, z)), SUMMIT.x, SUMMIT.z, 14, ['Sprint', 'Jump']);
      const closest = Math.min(...out.map((p) => Math.hypot(p.position[0] - SUMMIT.x, p.position[2] - SUMMIT.z)));
      expect(closest, `from bearing ${k * 15}`).toBeGreaterThan(SUMMIT_RADIUS);
    }
  });

  /** Jump pressed afresh every few ticks, as a player trying every ledge would: each press can start a mantle. */
  const tapping = (t: number): Pressed => (t % 8 < 4 ? ['Sprint', 'Jump'] : ['Sprint']);

  it('fails to mantle up to the summit from any side, pressing Jump again and again (ticket 67)', () => {
    for (let k = 0; k < 24; k++) {
      const bearing = (k / 24) * 2 * Math.PI;
      const r = SUMMIT.cliffFoot + 12;
      const x = SUMMIT.x + Math.cos(bearing) * r;
      const z = SUMMIT.z + Math.sin(bearing) * r;
      if (!insidePolygon(boundary, x, z)) continue;
      const out = run(start(at(x, z)), SUMMIT.x, SUMMIT.z, 20, tapping);
      const closest = Math.min(...out.map((p) => Math.hypot(p.position[0] - SUMMIT.x, p.position[2] - SUMMIT.z)));
      expect(closest, `from bearing ${k * 15}`).toBeGreaterThan(SUMMIT_RADIUS);
    }
  });

  it('mantles onto the cover it runs into (ticket 67)', () => {
    // Single boxes standing on level ground, low enough to climb, square or turned about the vertical (the Regions'
    // kits turn their cover to the ground's lie). A rock's fitted boxes are left out: their bounds aren't their shape.
    const overlaps = (s: Solid, o: Solid) => o !== s && o.min[0] < s.max[0] && o.max[0] > s.min[0] && o.min[2] < s.max[2] && o.max[2] > s.min[2];
    /** The box's middle, its half sizes along its own x and z, and its own +z on the ground. */
    const frame = (s: Solid) => {
      const o = s.orientation;
      if (!o) return { c: [(s.min[0] + s.max[0]) / 2, (s.min[2] + s.max[2]) / 2] as const, hx: (s.max[0] - s.min[0]) / 2, hz: (s.max[2] - s.min[2]) / 2, along: [0, 1] as const };
      const k = Math.hypot(o.axes[2][0], o.axes[2][2]);
      return { c: [o.center[0], o.center[2]] as const, hx: o.half[0], hz: o.half[2], along: [o.axes[2][0] / k, o.axes[2][2] / k] as const };
    };
    // The island's solids by 8 m square, so each piece is checked against its neighbours rather than all 56,000.
    const CELL = 8;
    const grid = new Map<string, Solid[]>();
    for (const o of solids) {
      for (let i = Math.floor(o.min[0] / CELL); i <= Math.floor(o.max[0] / CELL); i++) {
        for (let j = Math.floor(o.min[2] / CELL); j <= Math.floor(o.max[2] / CELL); j++) {
          const key = `${i},${j}`;
          const cell = grid.get(key);
          if (cell) cell.push(o);
          else grid.set(key, [o]);
        }
      }
    }
    /** The solids whose ground footprint comes within `margin` of the box's. */
    const near = (s: Solid, margin: number): Solid[] => {
      const found = new Set<Solid>();
      for (let i = Math.floor((s.min[0] - margin) / CELL); i <= Math.floor((s.max[0] + margin) / CELL); i++) {
        for (let j = Math.floor((s.min[2] - margin) / CELL); j <= Math.floor((s.max[2] + margin) / CELL); j++) for (const o of grid.get(`${i},${j}`) ?? []) found.add(o);
      }
      return [...found];
    };
    const pieces = solids.filter((s) => {
      if (s.orientation && (s.orientation.pitch !== 0 || s.orientation.roll !== 0)) return false;
      const { c, hx, hz } = frame(s);
      const rise = s.max[1] - terrain.heightAt(c[0], c[1]);
      return s.blocks !== 'bullets' && s.prop === null && rise > 0.7 && rise < 1.9 && hx > 0.5 && hx < 2.5 && hz > 0.5 && hz < 2.5 && insidePolygon(boundary, c[0], c[1]) && !near(s, 0).some((o) => overlaps(s, o));
    });
    // A pool to try from: each Region built (tickets 17 to 22) trades its blockout's single boxes for fitted models of several.
    expect(pieces.length).toBeGreaterThan(15);
    let tried = 0;
    let climbed = 0;
    for (let i = 0; i < pieces.length && tried < 24; i++) {
      const s = pieces[i]!;
      const { c, hz, along } = frame(s);
      const back = (d: number) => [c[0] - along[0] * (hz + d), c[1] - along[1] * (hz + d)] as const;
      const from = back(1.6);
      const ground = terrain.heightAt(from[0], from[1]);
      // Only a clear, level approach: nothing else in the way, no slope to walk up first.
      const face = back(0.3);
      if (Math.abs(ground - terrain.heightAt(face[0], face[1])) > 0.2 || terrain.steepAt(from[0], from[1])) continue;
      const path = Array.from({ length: 12 }, (_, k) => back(0.1 + (k / 11) * 2.0)).flatMap(([x, z]) => [-0.6, 0, 0.6].map((w) => [x + along[1] * w, z - along[0] * w] as const));
      if (near(s, 2.5).some((o) => o !== s && o.max[1] > ground + 0.3 && path.some(([x, z]) => x > o.min[0] && x < o.max[0] && z > o.min[2] && z < o.max[2]))) continue;
      tried++;
      // At a point beyond it, so the run doesn't stop short of the piece.
      const to = back(-2 * hz - 4);
      const out = run(start([from[0], ground, from[1]]), to[0], to[1], 3, tapping);
      if (out.some((p) => p.movement === 'mantle') && Math.max(...out.map((p) => p.position[1])) > s.max[1] - 0.1) climbed++;
    }
    expect(tried).toBeGreaterThan(8);
    expect(climbed, `${climbed} of ${tried}`).toBe(tried);
  }, 60_000);

  it('crosses every bridge dry, its ends level with the ground either side', () => {
    for (const bridge of BRIDGES) {
      for (const [x, z] of [bridge.from, bridge.to]) expect(terrain.heightAt(x, z), bridge.name).toBeCloseTo(bridge.deck, 0);
      const out = run(start([bridge.from[0], bridge.deck + 0.1, bridge.from[1]]), bridge.to[0], bridge.to[1], 40);
      expect(Math.hypot(last(out).position[0] - bridge.to[0], last(out).position[2] - bridge.to[1]), bridge.name).toBeLessThan(2);
      expect(Math.min(...out.map((p) => p.position[1])), bridge.name).toBeGreaterThan(bridge.deck - 0.2);
    }
  });

  it('wades the channel beside a bridge, slower than on land', () => {
    const [a, b] = [BRIDGES[1]!.from, BRIDGES[1]!.to];
    const [x, z] = [(a[0] + b[0]) / 2 + 14, (a[1] + b[1]) / 2];
    const out = run(start(at(x, z - 12)), x, z + 12, 8);
    const speed = Math.hypot(out[60]!.velocity[0], out[60]!.velocity[2]);
    expect(speed).toBeCloseTo(STATS.movement.sprintSpeed.value * STATS.terrain.wadeMultiplier.value, 0);
  });

  it('wades the jungle stream', () => {
    const { stream } = zeroIslandGround();
    const here = stream[Math.floor(stream.length / 2)]!;
    const depth = terrain.waterAbove(here.x, terrain.heightAt(here.x, here.z), here.z);
    expect(depth).toBeGreaterThan(STATS.terrain.wadeDepth.value);
    expect(depth).toBeLessThan(1);
  });

  it('stops at the Boundary, in the shallows, on every side', () => {
    let tried = 0;
    for (let k = 0; k < 16; k++) {
      const [ex, ez] = boundary[Math.floor((k / 16) * boundary.length)]!;
      const length = Math.hypot(ex, ez);
      const [x, z] = [ex * (1 - 16 / length), ez * (1 - 16 / length)];
      if (terrain.heightAt(x, z) > 0.5) continue;
      tried++;
      const end = last(run(start(at(x, z)), ex * 1.1, ez * 1.1, 8)).position;
      expect(insidePolygon(boundary, end[0], end[2]), `edge ${k}`).toBe(true);
      // Nor does a mantle take anyone over it (ticket 67).
      const over = run(start(at(x, z)), ex * 1.1, ez * 1.1, 8, tapping);
      expect(over.every((p) => insidePolygon(boundary, p.position[0], p.position[2])), `edge ${k}, mantling`).toBe(true);
    }
    expect(tried).toBeGreaterThan(8);
  });

  it("mantles a mesa's foot, a bank too steep to walk", () => {
    // In from the plain toward a mesa on some bearing, to the first ground too steep to walk that has a shelf on it.
    const mesa = zeroIslandGround().trails[0]!.at(-1)!;
    const bank = Array.from({ length: 72 }, (_, k) => {
      const [ux, uz] = [Math.cos(k * 0.0872), Math.sin(k * 0.0872)];
      let d = 200;
      while (d > 0 && !terrain.steepAt(mesa.x + ux * d, mesa.z + uz * d)) d -= 0.25;
      const [bx, bz] = [mesa.x + ux * d, mesa.z + uz * d];
      const y0 = terrain.heightAt(bx + ux, bz + uz);
      const rise = terrain.heightAt(bx - 3 * ux, bz - 3 * uz) - y0;
      return { ux, uz, bx, bz, y0, rise, flat: !terrain.steepAt(bx + 1.2 * ux, bz + 1.2 * uz) && !terrain.steepAt(bx - 3 * ux, bz - 3 * uz) };
    }).find((b) => b.flat && b.rise > 1.2 && b.rise < STATS.mantle.highClimbMaxHeight.value)!;
    expect(bank).toBeDefined();
    const { ux, uz, bx, bz, y0 } = bank;
    const match = start([bx + 0.9 * ux, y0, bz + 0.9 * uz]);
    const yaw = faceTo([bx, 0, bz], mesa.x, mesa.z);
    const out = match.run(90, () => ({ p: usercmd({ forward: 1, yaw, buttons: ['Jump'] }) })).map((o) => o.players[0]!);
    expect(out.some((p) => p.movement === 'mantle')).toBe(true);
    expect(last(out).position[1]).toBeGreaterThan(y0 + 1);
  });
});

describe('Zero Island: the railway', () => {
  const { railway, trails } = zeroIslandGround();

  it('rings the crater', () => {
    const ring = railway[0]!;
    const c = CORES['ground-zero'];
    const distances = ring.map((p) => Math.hypot(p.x - c.x, p.z - c.z));
    expect(Math.min(...distances)).toBeGreaterThan(130);
    expect(Math.max(...distances)).toBeLessThan(200);
    expect(Math.hypot(ring[0]!.x - ring.at(-1)!.x, ring[0]!.z - ring.at(-1)!.z)).toBeLessThan(1);
  });

  it('links every Region', () => {
    const served = new Set(railway.flatMap((line) => line.map((p) => regionAt(p.x, p.z))));
    for (const id of REGION_IDS) expect(served.has(id), id).toBe(true);
  });

  it('runs at a grade a train could take, with the ground cut to it', () => {
    for (const line of railway) {
      for (let i = 1; i < line.length; i++) {
        const [a, b] = [line[i - 1]!, line[i]!];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length > 0.5) expect(Math.abs(b.y - a.y) / length).toBeLessThan(0.08);
      }
      for (const p of line) expect(Math.abs(terrain.heightAt(p.x, p.z) - p.y)).toBeLessThan(1);
    }
  });

  it('leaves the climbable mesas their trails', () => {
    for (const trail of trails) {
      const top = trail.at(-1)!;
      expect(reached[walk.cellAt(top.x, top.z)]).toBe(1);
      expect(top.y).toBeGreaterThan(trail[0]!.y + 12);
    }
  });
});

describe('Zero Island: the ending', () => {
  const world = createWorld(mapSolids(map), { terrain: map.terrain });
  const nuke = map.nuke!;

  it('ends in the nuke, going off over the crater at Ground Zero', () => {
    expect(nuke).not.toBeNull();
    const c = CORES['ground-zero'];
    const [x, y, z] = nuke.groundZero;
    expect(Math.hypot(x - c.x, z - c.z)).toBeLessThan(5);
    expect(Math.abs(y - terrain.heightAt(x, z))).toBeLessThan(1);
  });

  it('films it for the whole of a Battle Royale\'s ending, the nuke then the scoreboard', () => {
    expect(nuke.shot.seconds).toBe(INTERMISSION.nuke + INTERMISSION.scoreboard);
  });

  it('keeps the shot in open air above the island, with the cloud in sight and in frame all the way', () => {
    const { from, to } = nuke.shot;
    expect(raycastWorld(world, from, to)).toBeNull();
    for (let t = 0; t <= nuke.shot.seconds; t += 0.5) {
      const pose = shotPose(nuke.shot, t);
      const p = pose.position;
      expect(p[1] - terrain.heightAt(p[0], p[2]), `${t} s: above the ground`).toBeGreaterThan(3);
      expect(insidePolygon(boundary, p[0], p[2]), `${t} s: over the island`).toBe(true);
      // Outside the base surge, which rolls out to about 300 m: inside it, the dust fills the frame.
      expect(Math.hypot(p[0] - nuke.groundZero[0], p[2] - nuke.groundZero[2]), `${t} s: clear of the surge`).toBeGreaterThan(330);
      // The column rises from the crater; the cap climbs to about 300 m.
      const forward = viewDirection(pose.yaw, pose.pitch);
      for (const height of [40, 150, 280]) {
        const cloud: Vec3 = [nuke.groundZero[0], nuke.groundZero[1] + height, nuke.groundZero[2]];
        expect(raycastWorld(world, p, cloud), `${t} s: cloud at ${height} m hidden`).toBeNull();
        const d = [cloud[0] - p[0], cloud[1] - p[1], cloud[2] - p[2]];
        const along = (d[0]! * forward[0] + d[1]! * forward[1] + d[2]! * forward[2]) / Math.hypot(d[0]!, d[1]!, d[2]!);
        // Within the frame's height: the top of the cloud once it has climbed, its foot before.
        if ((t < 4 && height <= 150) || (t >= 6 && height >= 150)) expect(Math.acos(along), `${t} s: cloud at ${height} m out of frame`).toBeLessThan(((nuke.shot.fov / 2) * Math.PI) / 180);
      }
    }
  });

  it('sounds the siren near where the shot starts, so it is heard', () => {
    const [sx, sy, sz] = nuke.siren;
    const [fx, fy, fz] = nuke.shot.from;
    expect(Math.hypot(sx - fx, sy - fy, sz - fz)).toBeLessThan(60);
  });
});

describe('Zero Island: sound traps (ticket 72)', () => {
  const traps = map.soundTraps ?? [];

  it('lays two or three in every Region, on dry land in the play area, near where people land', () => {
    for (const id of REGION_IDS) {
      const mine = traps.filter((t) => regionAt(t.position[0], t.position[2]) === id);
      expect(mine.length, id).toBeGreaterThanOrEqual(2);
      expect(mine.length, id).toBeLessThanOrEqual(3);
      for (const t of mine) {
        const [x, y, z] = t.position;
        expect(terrain.heightAt(x, z), `${id} ${t.kind}`).toBeGreaterThan(0);
        expect(insidePolygon(boundary, x, z), `${id} ${t.kind}`).toBe(true);
        expect(y - terrain.heightAt(x, z)).toBeGreaterThan(0);
        expect(Math.hypot(x - CORES[id].x, z - CORES[id].z), id).toBeLessThanOrEqual(CORES[id].radius * 2.5 + 1);
      }
      // Apart, so one run sets off one.
      for (const a of mine) for (const b of mine) if (a !== b) expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])).toBeGreaterThanOrEqual(30);
    }
  });

  it('fits each Region: birds in the Jungle and the Peaks, metal in the Dustlands, gravel in the crater', () => {
    const kinds = (id: RegionId) => new Set(traps.filter((t) => regionAt(t.position[0], t.position[2]) === id).map((t) => t.kind));
    expect(kinds('mutant-jungle')).toEqual(new Set(['birds']));
    expect(kinds('frostbite-peaks')).toEqual(new Set(['birds']));
    expect(kinds('the-dustlands')).toEqual(new Set(['metal']));
    expect(kinds('ground-zero')).toEqual(new Set(['gravel']));
  });

  it('are the world the server plays them in', () => {
    expect(createWorld(map.solids, { terrain: data, traps: map.soundTraps }).traps).toBe(map.soundTraps);
  });
});
