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

/** Where the vertical line through (x, z) crosses the mesh: each face's height, and whether it looks down (a way in). */
function column(tris: readonly Tri[], x: number, z: number): [number, boolean][] {
  const out: [number, boolean][] = [];
  for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of tris) {
    const d = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (d === 0) continue;
    const u = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / d;
    const v = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    out.push([ay + u * (by - ay) + v * (cy - ay), d > 0]);
  }
  return out;
}

/** True when height y of a column is inside the mesh: more faces looking down than up below it (overlapping blocks are their union; a mesh open below, inside from its foot). */
function insideColumn(hits: readonly [number, boolean][], y: number): boolean {
  let below = 0;
  let above = 0;
  for (const [h, down] of hits) {
    // A face looking down is a way in, one looking up a way out.
    if (h > y) above += down ? -1 : 1;
    else below += down ? 1 : -1;
  }
  // Open below (a trunk): the faces above say more than those below.
  return Math.max(below, above) > 0;
}

/** How far a point is from a triangle, in plain numbers (it runs millions of times). */
function toTriangle(p: readonly number[], t: Tri): number {
  const [px, py, pz] = p as [number, number, number];
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const at = (qx: number, qy: number, qz: number) => Math.hypot(px - qx, py - qy, pz - qz);
  // Closest point on the triangle, by the regions of its plane (Ericson, Real-Time Collision Detection 5.1.5).
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return at(ax, ay, az);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return at(bx, by, bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return at(ax + abx * v, ay + aby * v, az + abz * v);
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return at(cx, cy, cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return at(ax + acx * w, ay + acy * w, az + acz * w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return at(bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return at(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

/** How far a point is from the nearest of `tris`, exactly when that is past `enough`; at or under it, any distance at or under it. */
function nearest(p: readonly number[], tris: readonly Tri[], enough: number): number {
  let best = Infinity;
  for (const t of tris) {
    const d = toTriangle(p, t);
    if (d < best) best = d;
    if (best <= enough) return best;
  }
  return best;
}

/** Points over a box's faces, edges and corners, and through it: `n` a side, a column at a time (the heights of each x and z together). */
function samples(box: KitBox, n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    for (let k = 0; k <= n; k++) {
      for (let j = 0; j <= n; j++) {
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
  // Rogue Harbor's kit (ticket 19). A wall's coping and a car's glasshouse slope where a box can't.
  'rh-container': 0.85,
  'rh-container-b': 0.85,
  'rh-stack': 0.85,
  'rh-stack-b': 0.85,
  'rh-office': 0.85,
  'rh-wall': 0.8,
  'rh-crates': 0.85,
  'rh-car': 0.8,
  'rh-truck': 0.85,
  // Neon City's kit (ticket 20).
  'nc-shop': 0.85,
  'nc-barrier': 0.8,
  'nc-car': 0.8,
  'nc-car-b': 0.8,
  'nc-boxes': 0.85,
  // Frostbite Peaks' kit (ticket 21): an ice wall's top is broken, four drums are round.
  'fb-hut': 0.85,
  'fb-icewall': 0.75,
  'fb-sandbags': 0.75,
  'fb-crates': 0.85,
  'fb-drums': 0.72,
  'fb-snowcat': 0.7 /* open between its tracks */,
  // Mutant Jungle's kit (ticket 22): a ruined wall's top is broken, crystals come to points and lean out.
  'mj-ruinwall': 0.75,
  'mj-crystal': 0.45 /* pointed, leaning out */,
  'mj-crates': 0.85,
  'mj-jeep': 0.75,
};
const FITTED = Object.keys(FILL);

describe('Kit models’ solids (ticket 63)', () => {
  it('fits every rock and trunk the island wears', () => {
    expect(Object.keys(KIT_SOLIDS).sort()).toEqual([...FITTED].sort());
    for (const asset of FITTED) expect(instances(asset).length, asset).toBeGreaterThan(/^(gz|dl|rh|nc|fb|mj)-/.test(asset) ? 3 : 100);
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
        let hits: [number, boolean][] = [];
        for (const [n, p] of samples(box, 8).entries()) {
          // One pass over the triangles answers a column's nine heights.
          if (n % 9 === 0) hits = column(tris, p[0], p[2]);
          if (insideColumn(hits, p[1])) continue;
          const q = p.map((v, i) => v * scale[i]!);
          const d = nearest(q, scaled, TOLERANCE);
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
          const hits = column(tris, x, z);
          for (let y = 0.01; y < 1; y += 0.04) {
            if (!insideColumn(hits, y)) continue;
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
        // The box's samples a column at a time: one pass over the triangles answers every height in it.
        const N = 6;
        for (let i = 0; i <= N; i++) {
          for (let k = 0; k <= N; k++) {
            const [u, w] = [(i / N - 0.5) * box.s[0], (k / N - 0.5) * box.s[2]];
            // Into the piece's frame: the box's +x looks along (cos yaw, 0, -sin yaw).
            const [x, z] = [box.c[0] + u * c + w * s + 3.1e-6, box.c[2] - u * s + w * c + 2.7e-6];
            const hits = column(local, x, z);
            for (let j = 0; j <= N; j++) {
              const y = box.c[1] + (j / N - 0.5) * box.s[1];
              if (insideColumn(hits, y)) continue;
              // Only a point past the tolerance needs its exact distance: the search stops at the first triangle within it.
              const p = [x, y, z] as const;
              const d = nearest(p, local, TOLERANCE);
              if (d > worst) [worst, at] = [d, `${box.part} at ${p.map((q) => q.toFixed(2)).join(', ')}`];
            }
          }
        }
      }
      expect(worst, `${name}: ${at}`).toBeLessThanOrEqual(TOLERANCE);
    }
    // Six Regions' pieces by now, the jungle's giant tree alone a hundred boxes in its leaves.
  });

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
