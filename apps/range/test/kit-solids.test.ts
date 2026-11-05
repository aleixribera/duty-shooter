import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLANT_STRIDE } from '@duty-shooter/fps-client/surfaces';
import { KIT_SOLIDS, PIECE_SOLIDS, type KitBox } from '../src/map/kit-solids';
import { buildMapById } from '../src/map/maps';
import { ZERO_ISLAND_KITS } from '../src/map/zero-island';

/**
 * A kit model's solid is boxes inside its mesh (ticket 63): no invisible wall
 * past what's drawn, for bodies, bullets, grenades and bots' sight alike, and
 * enough of the model filled that what's seen still stops a bullet.
 */

/** How far a solid may stand out of its model, at the biggest the map scales it (m). */
const TOLERANCE = 0.05;

type Tri = readonly [number, number, number, number, number, number, number, number, number];

/** Every triangle of each top-level node of a GLB, in the node's space. */
function triangles(path: string): Map<string, Tri[]> {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as {
    nodes: { name: string; mesh?: number }[];
    meshes: { primitives: { attributes: { POSITION: number }; indices: number }[] }[];
    accessors: { bufferView: number; byteOffset?: number; count: number; componentType: number }[];
    bufferViews: { byteOffset?: number; byteStride?: number }[];
  };
  const bin = bytes.subarray(20 + jsonLength + 8);
  const read = (index: number, size: number) => {
    const acc = json.accessors[index]!;
    const view = json.bufferViews[acc.bufferView]!;
    const per = acc.componentType === 5123 ? 2 : 4;
    const stride = view.byteStride ?? size * per;
    const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const out: number[] = [];
    for (let i = 0; i < acc.count; i++) {
      for (let k = 0; k < size; k++) {
        const o = start + i * stride + k * per;
        out.push(acc.componentType === 5126 ? bin.readFloatLE(o) : acc.componentType === 5125 ? bin.readUInt32LE(o) : bin.readUInt16LE(o));
      }
    }
    return out;
  };
  const out = new Map<string, Tri[]>();
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    const tris: Tri[] = [];
    for (const prim of json.meshes[node.mesh]!.primitives) {
      const p = read(prim.attributes.POSITION, 3);
      const idx = read(prim.indices, 1);
      for (let i = 0; i < idx.length; i += 3) tris.push([0, 1, 2].flatMap((k) => [p[idx[i + k]! * 3]!, p[idx[i + k]! * 3 + 1]!, p[idx[i + k]! * 3 + 2]!]) as unknown as Tri);
    }
    out.set(node.name, tris);
  }
  return out;
}

/** True when (x, y, z) is inside the mesh: more faces looking down than up below it (overlapping blocks are their union; a mesh open below, inside from its foot). */
function inside(tris: readonly Tri[], x: number, y: number, z: number): boolean {
  let below = 0;
  let above = 0;
  for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of tris) {
    const d = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (d === 0) continue;
    const u = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / d;
    const v = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    const h = ay + u * (by - ay) + v * (cy - ay);
    // A face looking down (d > 0) is a way in, one looking up a way out.
    if (h > y) above += d > 0 ? -1 : 1;
    else below += d > 0 ? 1 : -1;
  }
  // Open below (a trunk): the faces above say more than those below.
  return Math.max(below, above) > 0;
}

/** How far a point is from a triangle. */
function toTriangle(p: readonly number[], t: Tri): number {
  const a = [t[0], t[1], t[2]];
  const b = [t[3], t[4], t[5]];
  const c = [t[6], t[7], t[8]];
  const sub = (u: number[], v: readonly number[]) => u.map((x, i) => x - v[i]!);
  const dot = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
  const ab = sub(b, a);
  const ac = sub(c, a);
  // Closest point on the triangle, by the regions of its plane (Ericson, Real-Time Collision Detection 5.1.5).
  const ap = sub(p as number[], a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  const at = (q: number[]) => Math.hypot(...sub(p as number[], q));
  if (d1 <= 0 && d2 <= 0) return at(a);
  const bp = sub(p as number[], b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(a.map((x, i) => x + ab[i]! * (d1 / (d1 - d3))));
  const cp = sub(p as number[], c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(a.map((x, i) => x + ac[i]! * (d2 / (d2 - d6))));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return at(b.map((x, i) => x + (c[i]! - x) * w));
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return at(a.map((x, i) => x + ab[i]! * v + ac[i]! * w));
}

/** Points over a box's faces, edges and corners, and through it: `n` a side. */
function samples(box: KitBox, n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      for (let k = 0; k <= n; k++) {
        const f = [i / n - 0.5, j / n - 0.5, k / n - 0.5];
        out.push([box.c[0] + f[0]! * box.s[0], box.c[1] + f[1]! * box.s[1], box.c[2] + f[2]! * box.s[2]]);
      }
    }
  }
  return out;
}

const map = buildMapById('zero-island');
const plants = map.plants!;
const file = (path: string) => new URL(`../../../${path}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const meshes = new Map([...triangles(file('apps/range/public/models/vegetation.glb')), ...ZERO_ISLAND_KITS.flatMap((k) => [...triangles(file(`apps/range/public/${k.url}`))])]);

/** Each fitted model's instances on the map: position, turn and scale. */
const instances = (asset: string) =>
  plants.kinds
    .filter((k) => k.asset === asset)
    .flatMap((k) => Array.from({ length: k.instances.length / PLANT_STRIDE }, (_, i) => Array.from(k.instances.subarray(i * PLANT_STRIDE, i * PLANT_STRIDE + 7))));

/** The kit models that dress a solid, and the least of each that its boxes fill. */
const FILL: Readonly<Record<string, number>> = {
  'rock-a': 0.85,
  'rock-b': 0.85,
  'rock-strata': 0.85,
  // Ground Zero's broken concrete (ticket 78): its breaks and chipped arrises run at angles no box follows.
  'rubble-a': 0.75,
  'rubble-b': 0.75,
  // A trunk and a mast are round: a box can't fill their sides.
  'pine-trunk': 0.55,
  'broadleaf-trunk': 0.55,
  'gz-mast': 0.55,
  // Ground Zero's kit (ticket 17). A run of T-walls has a slot between its sections.
  'gz-blastwall': 0.8,
  'gz-shed': 0.85,
  // A broken slab's, a footing's and a wagon's chamfers, steps and bogies are thin for a box.
  'gz-slab': 0.75,
  'gz-footing': 0.75,
  'gz-wreck': 0.85,
  'gz-wagon': 0.75,
  // The Dustlands' kit (ticket 18).
  'dl-hut': 0.85,
  'dl-pickup': 0.75,
  'dl-orecar': 0.75,
  'dl-stonewall': 0.8,
  'dl-crates': 0.85,
  // Four round drums in eight boxes: the boxes leave each drum's rounded sides, as a trunk's do.
  'dl-drums': 0.72,
};
const FITTED = Object.keys(FILL);

describe('Kit models’ solids (ticket 63)', () => {
  it('fits every rock and trunk the island wears', () => {
    expect(Object.keys(KIT_SOLIDS).sort()).toEqual([...FITTED].sort());
    for (const asset of FITTED) expect(instances(asset).length, asset).toBeGreaterThan(/^(gz|dl)-/.test(asset) ? 3 : 100);
  });

  for (const asset of FITTED) {
    it(`keeps ${asset}'s solid inside its mesh, within ${TOLERANCE * 100} cm at the biggest it stands`, () => {
      const tris = meshes.get(asset)!;
      const all = instances(asset);
      // The widest, tallest and deepest it's scaled to, each on its own: no instance is worse.
      const scale = [4, 5, 6].map((k) => Math.max(...all.map((v) => v[k]!)));
      const scaled = tris.map((t) => t.map((v, i) => v * scale[i % 3]!) as unknown as Tri);
      let worst = 0;
      let at = '';
      for (const box of KIT_SOLIDS[asset]!) {
        for (const p of samples(box, 8)) {
          if (inside(tris, p[0], p[1], p[2])) continue;
          const q = p.map((v, i) => v * scale[i]!);
          const d = Math.min(...scaled.map((t) => toTriangle(q, t)));
          if (d > worst) [worst, at] = [d, p.map((v) => v.toFixed(3)).join(', ')];
        }
      }
      expect(worst, `${asset} at ${at} (unit frame), scaled ${scale.map((v) => v.toFixed(1)).join(' x ')}`).toBeLessThanOrEqual(TOLERANCE);
    });

    it(`fills most of ${asset}: what's seen stops a bullet`, () => {
      const tris = meshes.get(asset)!;
      const boxes = KIT_SOLIDS[asset]!;
      let solid = 0;
      let filled = 0;
      for (let x = -0.49; x < 0.5; x += 0.04) {
        for (let z = -0.49; z < 0.5; z += 0.04) {
          for (let y = 0.01; y < 1; y += 0.04) {
            if (!inside(tris, x, y, z)) continue;
            solid++;
            if (boxes.some((b) => [x, y, z].every((v, i) => Math.abs(v - b.c[i]!) <= b.s[i]! / 2))) filled++;
          }
        }
      }
      expect(filled / solid, asset).toBeGreaterThan(FILL[asset]!);
    });
  }

  it("stands every rock's and trunk's boxes where its model stands, scaled and turned as it is", () => {
    const modelled = new Set(plants.modelled);
    // The solids by where their middles stand, to the metre.
    const near = new Map<string, number[]>();
    const key = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;
    map.solids.forEach((b, i) => {
      const k = key((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2);
      near.set(k, [...(near.get(k) ?? []), i]);
    });
    let boxes = 0;
    for (const asset of FITTED) {
      for (const [x, y, z, yaw, sx, sy, sz] of instances(asset)) {
        const [c, s] = [Math.cos(yaw!), Math.sin(yaw!)];
        for (const box of KIT_SOLIDS[asset]!) {
          const [u, v, w] = [box.c[0] * sx!, box.c[1] * sy!, box.c[2] * sz!];
          const want = [x! + u * c + w * s, y! + v, z! - u * s + w * c] as const;
          const i = [-1, 0, 1]
            .flatMap((dx) => [-1, 0, 1].flatMap((dz) => near.get(key(want[0] + dx, want[2] + dz)) ?? []))
            .find((j) => {
              const b = map.solids[j]!;
              return ([0, 1, 2] as const).every((k) => Math.abs((b.min[k] + b.max[k]) / 2 - want[k]) < 0.02) && Math.abs(b.max[1] - b.min[1] - box.s[1] * sy!) < 0.01;
            });
          expect(i, `${asset} at ${x},${z}`).toBeDefined();
          expect(modelled.has(i!), `${asset} at ${x},${z}: drawn by its model, not as a box`).toBe(true);
          boxes++;
        }
      }
    }
    // Every box of every rock and trunk, and nothing else of theirs.
    expect(boxes).toBeGreaterThan(20_000);
  }, 60_000);

  it("keeps every built piece's solid inside its model, within 5 cm", () => {
    for (const [name, boxes] of Object.entries(PIECE_SOLIDS)) {
      const tris = meshes.get(name)!;
      let worst = 0;
      let at = '';
      for (const box of boxes) {
        const [c, s] = [Math.cos(box.yaw ?? 0), Math.sin(box.yaw ?? 0)];
        const r = Math.hypot(box.s[0], box.s[2]) / 2 + 0.1;
        // The triangles round the box, so a piece's hundred boxes don't each search all of it.
        const local = tris.filter((t) => Math.min(t[0], t[3], t[6]) < box.c[0] + r && Math.max(t[0], t[3], t[6]) > box.c[0] - r && Math.min(t[2], t[5], t[8]) < box.c[2] + r && Math.max(t[2], t[5], t[8]) > box.c[2] - r);
        for (const [u, v, w] of samples({ c: [0, box.c[1], 0], s: box.s }, 6)) {
          // Into the piece's frame: the box's +x looks along (cos yaw, 0, -sin yaw).
          const p = [box.c[0] + u * c + w * s + 3.1e-6, v, box.c[2] - u * s + w * c + 2.7e-6] as const;
          if (inside(local, p[0], p[1], p[2])) continue;
          const d = Math.min(...local.map((t) => toTriangle(p, t)));
          if (d > worst) [worst, at] = [d, `${box.part} at ${p.map((x) => x.toFixed(2)).join(', ')}`];
        }
      }
      expect(worst, `${name}: ${at}`).toBeLessThanOrEqual(TOLERANCE);
    }
  }, 120_000);

  it('keeps a box of every part of every built piece, and stands them all on the map', () => {
    for (const kit of ZERO_ISLAND_KITS) {
      for (const [name, piece] of Object.entries(kit.pieces)) {
        const parts = new Set(PIECE_SOLIDS[name]!.map((b) => b.part));
        for (const b of piece.boxes) expect(parts.has(b.part), `${name} ${b.part}`).toBe(true);
      }
      const built = map.looks.filter((l) => l?.side === `built-${kit.region}`).length;
      expect(built, kit.region).toBe(kit.placed.reduce((n, p) => n + PIECE_SOLIDS[p.asset]!.length, 0));
    }
  });
});
