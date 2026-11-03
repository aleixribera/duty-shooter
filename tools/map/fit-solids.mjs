// Fits the solids of the kit models that dress a map solid (ticket 63): a few
// boxes per model, each inside the model's mesh, together filling as much of
// it as they can. What's seen is then what stops a body, a bullet, a grenade
// and a bot's sight, but for what the boxes leave of the model's rounding.
//
//   node tools/map/fit-solids.mjs
//
// Reads the models from their GLBs (as Blender exported them) and writes
// apps/range/src/map/kit-solids.ts. Rerun it whenever a fitted model changes;
// apps/range/test/kit-solids.test.ts fails until then.
//
// A model is a unit box's worth (x and z from -0.5 to 0.5, standing on y = 0
// and 1 tall), scaled to the solid it dresses, so its boxes are in that frame
// and scale with it. The fit looks down columns of the mesh 1 cm apart (in the
// unit frame): where a vertical line is inside it, from below to above. A box
// is inside the mesh when every column through its footprint is inside it
// over all the box's height. The boxes are picked greedily, each the one that
// adds the most of the mesh's volume to the ones before, then grown face by
// face to the last column that still holds it.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'apps/range/src/map/kit-solids.ts');

/** The models fitted, by GLB, with the most boxes each may have. */
export const SOURCES = [
  {
    glb: 'apps/range/public/models/vegetation.glb',
    assets: { 'rock-a': 5, 'rock-b': 5, 'rock-strata': 5, 'pine-trunk': 4, 'broadleaf-trunk': 4 },
  },
];

/** Columns a side of the unit footprint (1 cm apart), and of them, every `STEP`th is where the search may put a box's side. */
const COLUMNS = 101;
const STEP = 4;
/** Height levels the volume is counted in. */
const LEVELS = 48;
/** A box stops being worth its cost when it adds less than this share of the mesh's volume. */
const WORTH = 0.01;
/** The most of its height a box gives up to grow wider, as a share. */
const GIVE = 0.04;

/** Every triangle of each top-level node, as flat [x, y, z] x 3 arrays. */
export function readTriangles(path) {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = bytes.subarray(20 + jsonLength + 8);
  const read = (index) => {
    const acc = json.accessors[index];
    const view = json.bufferViews[acc.bufferView];
    const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const size = { SCALAR: 1, VEC3: 3 }[acc.type];
    const bytesPer = { 5123: 2, 5125: 4, 5126: 4 }[acc.componentType];
    const stride = view.byteStride ?? size * bytesPer;
    const out = [];
    for (let i = 0; i < acc.count; i++) {
      for (let k = 0; k < size; k++) {
        const o = start + i * stride + k * bytesPer;
        out.push(acc.componentType === 5126 ? bin.readFloatLE(o) : acc.componentType === 5125 ? bin.readUInt32LE(o) : bin.readUInt16LE(o));
      }
    }
    return out;
  };
  const meshes = new Map();
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    const tris = [];
    for (const prim of json.meshes[node.mesh].primitives) {
      const p = read(prim.attributes.POSITION);
      const idx = prim.indices === undefined ? p.map((_, i) => i).slice(0, p.length / 3) : read(prim.indices);
      for (const i of idx) tris.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    }
    meshes.set(node.name, tris);
  }
  return meshes;
}

/**
 * Where the vertical line through (x, z) is inside the mesh: [from, to]
 * stretches, bottom up. Faces facing down are where the line goes in, faces
 * facing up where it comes out, so blocks that overlap count as their union.
 * A mesh open below (a trunk has no foot cap) is inside from -Infinity.
 */
export function insideAlong(tris, x, z) {
  const hits = [];
  for (let t = 0; t < tris.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.slice(t, t + 9);
    const d = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (d === 0) continue;
    const u = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / d;
    const v = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    // The face's normal's y is -d / 2 for counter-clockwise faces seen from outside: up is out.
    hits.push({ y: ay + u * (by - ay) + v * (cy - ay), step: d > 0 ? 1 : -1 });
  }
  hits.sort((a, b) => a.y - b.y);
  // A line through a shared edge crosses both its triangles at one height: count it once.
  const at = hits.filter((h, i) => i === 0 || h.y - hits[i - 1].y > 1e-6 || h.step !== hits[i - 1].step);
  let depth = 0;
  let least = 0;
  for (const h of at) least = Math.min(least, (depth += h.step));
  depth = -least;
  const out = [];
  let from = depth > 0 ? -Infinity : null;
  for (const h of at) {
    depth += h.step;
    if (depth > 0 && from === null) from = h.y;
    else if (depth <= 0 && from !== null) {
      out.push([from, h.y]);
      from = null;
    }
  }
  return out;
}

/** Column i's x (or z): just off the grid lines, so no line runs exactly down a mesh edge. */
const along = (i) => -0.5 + i / (COLUMNS - 1) + (i === 0 ? 1e-5 : i === COLUMNS - 1 ? -1e-5 : 3.1e-6);

export function fit(tris, most) {
  const n = COLUMNS;
  // Each column's longest stretch inside the mesh (the others are left out, so a box stays inside).
  const lo = new Float64Array(n * n).fill(Infinity);
  const hi = new Float64Array(n * n).fill(-Infinity);
  let bottom = Infinity;
  let top = -Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let best = null;
      for (const s of insideAlong(tris, along(i), along(j))) if (!best || s[1] - s[0] > best[1] - best[0]) best = s;
      if (!best) continue;
      lo[i * n + j] = best[0];
      hi[i * n + j] = best[1];
      if (Number.isFinite(best[0])) bottom = Math.min(bottom, best[0]);
      top = Math.max(top, best[1]);
    }
  }
  if (!Number.isFinite(bottom)) bottom = 0;
  // A box's x side lies on a column (i0..i1), its z side likewise; it holds from the highest floor to the lowest roof over them.
  const span = (i0, i1, j0, j1) => {
    let floor = -Infinity;
    let roof = Infinity;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        floor = Math.max(floor, lo[i * n + j]);
        roof = Math.min(roof, hi[i * n + j]);
      }
    }
    return [Math.max(floor, bottom), roof];
  };

  // The volume, in cells between the search's lines and levels: inside when every column round the cell holds its level.
  const lines = [];
  for (let i = 0; i < n; i += STEP) lines.push(i);
  const m = lines.length - 1;
  const level = (k) => bottom + ((top - bottom) * k) / LEVELS;
  const inside = new Uint8Array(m * m * LEVELS);
  let total = 0;
  for (let a = 0; a < m; a++) {
    for (let b = 0; b < m; b++) {
      const [floor, roof] = span(lines[a], lines[a + 1], lines[b], lines[b + 1]);
      for (let k = 0; k < LEVELS; k++) {
        if (floor <= level(k) && roof >= level(k + 1)) {
          inside[(a * m + b) * LEVELS + k] = 1;
          total++;
        }
      }
    }
  }
  const covered = new Uint8Array(m * m * LEVELS);
  // Every footprint's floor and roof, once.
  const spans = new Map();
  for (let a0 = 0; a0 < m; a0++) for (let a1 = a0 + 1; a1 <= m; a1++) for (let b0 = 0; b0 < m; b0++) for (let b1 = b0 + 1; b1 <= m; b1++) spans.set(((a0 * 64 + a1) * 64 + b0) * 64 + b1, span(lines[a0], lines[a1], lines[b0], lines[b1]));

  // Every footprint with the levels it holds, biggest first: a box can add no more than its own cells.
  const candidates = [];
  for (const [key, [floor, roof]] of spans) {
    if (roof - floor <= 0) continue;
    const b1 = key % 64;
    const b0 = Math.floor(key / 64) % 64;
    const a1 = Math.floor(key / 4096) % 64;
    const a0 = Math.floor(key / 262144);
    const k0 = Math.ceil(((floor - bottom) / (top - bottom)) * LEVELS - 1e-9);
    const k1 = Math.floor(((roof - bottom) / (top - bottom)) * LEVELS + 1e-9);
    if (k1 > k0) candidates.push({ a0, a1, b0, b1, k0, k1, cells: (a1 - a0) * (b1 - b0) * (k1 - k0) });
  }
  candidates.sort((p, q) => q.cells - p.cells);

  const boxes = [];
  let filled = 0;
  for (let count = 0; count < most; count++) {
    let best = null;
    for (const c of candidates) {
      if (best && c.cells <= best.gain) break;
      let gain = 0;
      for (let a = c.a0; a < c.a1; a++) for (let b = c.b0; b < c.b1; b++) for (let k = c.k0; k < c.k1; k++) gain += 1 - covered[(a * m + b) * LEVELS + k];
      if (!best || gain > best.gain) best = { ...c, gain };
    }
    if (!best || best.gain < WORTH * total) break;
    // Its own cells are taken, whatever growing it does to it.
    for (let a = best.a0; a < best.a1; a++) for (let b = best.b0; b < best.b1; b++) for (let k = best.k0; k < best.k1; k++) covered[(a * m + b) * LEVELS + k] = 1;
    filled += best.gain;
    // Then grown or shrunk a few columns a side at a time, while that makes it bigger: past a face's
    // chamfer by giving up a little of its height, but never more than a little, so it keeps its place.
    let c = [lines[best.a0], lines[best.a1], lines[best.b0], lines[best.b1]];
    const tall = ((f, r) => r - f)(...span(...c));
    const size = (b) => {
      const [f, r] = span(...b);
      return r - f < tall * (1 - GIVE) ? 0 : (b[1] - b[0]) * (b[3] - b[2]) * (r - f);
    };
    let v = size(c);
    for (let better = true; better; ) {
      better = false;
      for (let side = 0; side < 4; side++) {
        for (const step of [-3, -2, -1, 1, 2, 3]) {
          const b = [...c];
          b[side] += step;
          if (b[0] < 0 || b[2] < 0 || b[1] > n - 1 || b[3] > n - 1 || b[1] - b[0] < 2 || b[3] - b[2] < 2) continue;
          const w = size(b);
          if (w > v + 1e-12) [c, v, better] = [b, w, true];
        }
      }
    }
    const [i0, i1, j0, j1] = c;
    const [floor, roof] = span(i0, i1, j0, j1);
    const [x0, x1, z0, z1] = [along(i0), along(i1), along(j0), along(j1)];
    // The cells it covers now, as grown.
    for (let a = 0; a < m; a++) {
      for (let b = 0; b < m; b++) {
        if (lines[a] < i0 || lines[a + 1] > i1 || lines[b] < j0 || lines[b + 1] > j1) continue;
        for (let k = 0; k < LEVELS; k++) {
          const cell = (a * m + b) * LEVELS + k;
          if (level(k) >= floor - 1e-9 && level(k + 1) <= roof + 1e-9 && !covered[cell]) [covered[cell], filled] = [1, filled + inside[cell]];
        }
      }
    }
    const box = { c: [(x0 + x1) / 2, (floor + roof) / 2, (z0 + z1) / 2], s: [x1 - x0, roof - floor, z1 - z0] };
    // Grown into one it already has, it adds nothing.
    const within = (a, b) => [0, 1, 2].every((k) => a.c[k] - a.s[k] / 2 >= b.c[k] - b.s[k] / 2 - 1e-9 && a.c[k] + a.s[k] / 2 <= b.c[k] + b.s[k] / 2 + 1e-9);
    if (!boxes.some((b) => within(box, b))) boxes.push(box);
  }
  return { boxes, share: filled / total };
}

const round = (v) => Math.round(v * 1e4) / 1e4;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = {};
  for (const { glb, assets } of SOURCES) {
    const meshes = readTriangles(join(ROOT, glb));
    for (const [asset, most] of Object.entries(assets)) {
      const tris = meshes.get(asset);
      if (!tris) throw new Error(`${glb} has no ${asset}`);
      const { boxes, share } = fit(tris, most);
      console.log(`${asset}: ${boxes.length} boxes, ${(share * 100).toFixed(0)}% of its volume`);
      out[asset] = boxes.map((b) => ({ c: b.c.map(round), s: b.s.map(round) }));
    }
  }
  const body = Object.entries(out)
    .map(([asset, boxes]) => `  '${asset}': [\n${boxes.map((b) => `    { c: [${b.c.join(', ')}], s: [${b.s.join(', ')}] },`).join('\n')}\n  ],`)
    .join('\n');
  writeFileSync(
    OUT,
    `// Written by tools/map/fit-solids.mjs from the models' GLBs: don't edit, rerun it.\n\n` +
      `/** A box of a kit model's solid, in the model's unit frame (x and z across, y up): its middle and size. */\n` +
      `export interface KitBox {\n  readonly c: readonly [number, number, number];\n  readonly s: readonly [number, number, number];\n}\n\n` +
      `/** The boxes each kit model's solid is made of, every one inside its mesh (ticket 63). */\n` +
      `export const KIT_SOLIDS: Readonly<Record<string, readonly KitBox[]>> = {\n${body}\n};\n`,
  );
}
