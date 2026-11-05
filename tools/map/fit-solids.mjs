// Fits the solids of the kit models that dress a map solid (ticket 63): a few
// boxes per model, each inside the model's mesh, together filling as much of
// it as they can. What's seen is then what stops a body, a bullet, a grenade
// and a bot's sight, but for what the boxes leave of the model's rounding.
//
//   node tools/map/fit-solids.mjs
//   ONLY=dustlands node tools/map/fit-solids.mjs   # refit only the GLBs whose path has that in it (comma-separated)
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

/** The models fitted, by GLB, with the most boxes each may have (and, given as a pair, the least share of its volume a box must add). */
export const SOURCES = [
  {
    glb: 'apps/range/public/models/vegetation.glb',
    // Boulders and rubble (ticket 78) are rounded and broken where the jointed rocks were flat: more boxes, and
    // rubble's breaks are worth a box down to a smaller share, as there are few of them on the island.
    assets: { 'rock-a': 8, 'rock-b': 8, 'rock-strata': 3, 'rubble-a': [10, 0.004], 'rubble-b': [10, 0.004], 'pine-trunk': 4, 'broadleaf-trunk': 4 },
  },
  {
    // Ground Zero's kit for the cover pass's pieces (ticket 17), unit models like the rocks.
    glb: 'apps/range/public/models/ground-zero.glb',
    // A run of T-walls is six precast sections with a slot between each: a foot and a stem apiece.
    assets: { 'gz-blastwall': 12, 'gz-shed': 4, 'gz-slab': 4, 'gz-footing': 4, 'gz-mast': 4, 'gz-wreck': 5, 'gz-wagon': 5 },
  },
  {
    // The Dustlands' kit (ticket 18): drums are round, so each drum gets boxes of its own.
    glb: 'apps/range/public/models/dustlands.glb',
    assets: { 'dl-hut': 4, 'dl-pickup': 6, 'dl-orecar': 5, 'dl-stonewall': 6, 'dl-crates': 4, 'dl-drums': 8 },
  },
  {
    // Rogue Harbor's kit (ticket 19): containers one high or a stack of two, a yard office, walls, crates and vehicles.
    glb: 'apps/range/public/models/harbor.glb',
    assets: { 'rh-container': 4, 'rh-container-b': 4, 'rh-stack': 4, 'rh-stack-b': 4, 'rh-office': 4, 'rh-wall': 4, 'rh-crates': 6, 'rh-car': 6, 'rh-truck': 6 },
  },
];

/**
 * The Regions' built pieces (zero-island-region.ts): each piece's plan boxes,
 * as its Blender generator read them, and its model. A box its model fills to
 * within `TOLERANCE` stays as planned; one it doesn't (a ruin's broken top, a
 * round pipe, a rubble heap) is replaced by up to `most` boxes (by part)
 * fitted inside the model where that box is.
 */
export const PIECES = [
  { glb: 'apps/range/public/models/ground-zero.glb', plan: 'tools/map/regions/ground-zero.json', most: { rubble: 6, default: 4 } },
  { glb: 'apps/range/public/models/dustlands.glb', plan: 'tools/map/regions/dustlands.json', most: { heap: 6, default: 4 } },
  { glb: 'apps/range/public/models/harbor.glb', plan: 'tools/map/regions/harbor.json', most: { default: 4 } },
];

/** How far (m) a point of a solid may stand out of its model. */
export const TOLERANCE = 0.05;

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
      // A part standing on another (a cab on its body, a load in its bed) is one solid with it: no gap between.
      if (out.length && from - out[out.length - 1][1] < 1e-5) out[out.length - 1][1] = h.y;
      else out.push([from, h.y]);
      from = null;
    }
  }
  return out;
}

/** Column i's x (or z): just off the grid lines, so no line runs exactly down a mesh edge. */
const along = (i) => -0.5 + i / (COLUMNS - 1) + (i === 0 ? 1e-5 : i === COLUMNS - 1 ? -1e-5 : 3.1e-6);

export function fit(tris, most, clip = false, worth = WORTH) {
  const n = COLUMNS;
  // Each column's longest stretch inside the mesh (the others are left out, so a box stays inside).
  const lo = new Float64Array(n * n).fill(Infinity);
  const hi = new Float64Array(n * n).fill(-Infinity);
  let bottom = Infinity;
  let top = -Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let best = null;
      for (const raw of insideAlong(tris, along(i), along(j))) {
        // Clipped to the unit box's height, when fitting inside a box of a piece.
        const s = clip ? [Math.max(raw[0], 0), Math.min(raw[1], 1)] : raw;
        if (s[1] > s[0] && (!best || s[1] - s[0] > best[1] - best[0])) best = s;
      }
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
  // A line a column in from each edge as well (ticket 78): the outermost columns run just inside the unit
  // box's sides, and a rounded or dented side never reaches them, which hid its last cells from the search.
  const lines = [];
  for (let i = 0; i < n; i += STEP) lines.push(i);
  lines.splice(1, 0, 1);
  lines.splice(lines.length - 1, 0, n - 2);
  // Each cell weighs its width and depth in columns, as cells between the edge lines are narrower.
  const wide = (a) => lines[a + 1] - lines[a];
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
          total += wide(a) * wide(b);
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
    if (k1 > k0) candidates.push({ a0, a1, b0, b1, k0, k1, cells: (lines[a1] - lines[a0]) * (lines[b1] - lines[b0]) * (k1 - k0) });
  }
  candidates.sort((p, q) => q.cells - p.cells);

  const boxes = [];
  let filled = 0;
  for (let count = 0; count < most; count++) {
    let best = null;
    for (const c of candidates) {
      if (best && c.cells <= best.gain) break;
      let gain = 0;
      for (let a = c.a0; a < c.a1; a++) for (let b = c.b0; b < c.b1; b++) for (let k = c.k0; k < c.k1; k++) gain += (1 - covered[(a * m + b) * LEVELS + k]) * wide(a) * wide(b);
      if (!best || gain > best.gain) best = { ...c, gain };
    }
    if (!best || best.gain < worth * total) break;
    // Its own cells are taken, whatever growing it does to it.
    for (let a = best.a0; a < best.a1; a++) for (let b = best.b0; b < best.b1; b++) for (let k = best.k0; k < best.k1; k++) covered[(a * m + b) * LEVELS + k] = 1;
    filled += best.gain;
    // Then grown or shrunk a few columns a side at a time, while that makes it bigger: past a face's
    // chamfer by giving up a little of its height, but never more than a little, so it keeps its place.
    // Nor gaining more than a little: a low wide box picked to fill a rounded rock's sides would
    // otherwise narrow itself into a tall one like those it already has (ticket 78).
    let c = [lines[best.a0], lines[best.a1], lines[best.b0], lines[best.b1]];
    const tall = ((f, r) => r - f)(...span(...c));
    const size = (b) => {
      const [f, r] = span(...b);
      return r - f < tall * (1 - GIVE) || r - f > tall * (1 + GIVE) ? 0 : (b[1] - b[0]) * (b[3] - b[2]) * (r - f);
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
          if (level(k) >= floor - 1e-9 && level(k + 1) <= roof + 1e-9 && !covered[cell]) [covered[cell], filled] = [1, filled + inside[cell] * wide(a) * wide(b)];
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

/** How far a point is from a triangle (Ericson, Real-Time Collision Detection 5.1.5). */
function toTriangle(p, t) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const [a, b, c] = [t.slice(0, 3), t.slice(3, 6), t.slice(6, 9)];
  const at = (q) => Math.hypot(...sub(p, q));
  const lerp = (u, v, k) => u.map((x, i) => x + (v[i] - x) * k);
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const [d1, d2] = [dot(ab, ap), dot(ac, ap)];
  if (d1 <= 0 && d2 <= 0) return at(a);
  const bp = sub(p, b);
  const [d3, d4] = [dot(ab, bp), dot(ac, bp)];
  if (d3 >= 0 && d4 <= d3) return at(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(lerp(a, b, d1 / (d1 - d3)));
  const cp = sub(p, c);
  const [d5, d6] = [dot(ab, cp), dot(ac, cp)];
  if (d6 >= 0 && d5 <= d6) return at(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(lerp(a, c, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return at(lerp(b, c, (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const den = 1 / (va + vb + vc);
  return at(a.map((x, i) => x + ab[i] * vb * den + ac[i] * vc * den));
}

/** The triangles whose footprint comes within `r` of (x, z), flat. */
function near(tris, x, z, r) {
  const out = [];
  for (let t = 0; t < tris.length; t += 9) {
    if (Math.min(tris[t], tris[t + 3], tris[t + 6]) > x + r || Math.max(tris[t], tris[t + 3], tris[t + 6]) < x - r) continue;
    if (Math.min(tris[t + 2], tris[t + 5], tris[t + 8]) > z + r || Math.max(tris[t + 2], tris[t + 5], tris[t + 8]) < z - r) continue;
    for (let k = 0; k < 9; k++) out.push(tris[t + k]);
  }
  return out;
}

/** The farthest (m) a point of a box (centre, size, turn about +y) stands outside a mesh: a grid `n` a side through it. */
export function overreach(tris, box, n = 8) {
  const [c, s] = [Math.cos(box.yaw ?? 0), Math.sin(box.yaw ?? 0)];
  const local = near(tris, box.c[0], box.c[2], Math.hypot(box.s[0], box.s[2]) / 2 + TOLERANCE * 2);
  let worst = 0;
  for (let i = 0; i <= n; i++) {
    for (let k = 0; k <= n; k++) {
      const [u, w] = [(i / n - 0.5) * box.s[0], (k / n - 0.5) * box.s[2]];
      const [x, z] = [box.c[0] + u * c + w * s, box.c[2] - u * s + w * c];
      // Just off the exact line, so it runs down no mesh edge.
      const spans = insideAlong(local, x + 3.1e-6, z + 2.7e-6);
      for (let j = 0; j <= n; j++) {
        const y = box.c[1] + (j / n - 0.5) * box.s[1];
        if (spans.some(([lo, hi]) => y >= lo - 1e-4 && y <= hi + 1e-4)) continue;
        let d = Infinity;
        for (let t = 0; t < local.length && d > worst; t += 9) d = Math.min(d, toTriangle([x, y, z], local.slice(t, t + 9)));
        worst = Math.max(worst, d);
      }
    }
  }
  return worst;
}

/** A box of a piece its model doesn't fill, as the boxes fitted inside the model where it is (in the piece's frame). */
function refit(tris, box, most) {
  const [c, s] = [Math.cos(box.yaw ?? 0), Math.sin(box.yaw ?? 0)];
  const y0 = box.c[1] - box.s[1] / 2;
  const local = near(tris, box.c[0], box.c[2], Math.hypot(box.s[0], box.s[2]) / 2);
  // Into the box's unit frame: x and z across it from -0.5 to 0.5, y up it from 0 to 1.
  const unit = [];
  for (let t = 0; t < local.length; t += 3) {
    const [dx, dz] = [local[t] - box.c[0], local[t + 2] - box.c[2]];
    unit.push((dx * c - dz * s) / box.s[0], (local[t + 1] - y0) / box.s[1], (dx * s + dz * c) / box.s[2]);
  }
  const { boxes, share } = fit(unit, most, true);
  const out = boxes.map((b) => {
    const [u, v, w] = [b.c[0] * box.s[0], y0 + b.c[1] * box.s[1], b.c[2] * box.s[2]];
    return { part: box.part, c: [box.c[0] + u * c + w * s, v, box.c[2] - u * s + w * c], s: [b.s[0] * box.s[0], b.s[1] * box.s[1], b.s[2] * box.s[2]], yaw: box.yaw ?? 0, material: box.material };
  });
  return { boxes: out, share };
}

/** The boxes the file holds now, by model, as its text: kept for the GLBs `ONLY` leaves out (a full refit takes ten minutes). */
function keptBoxes() {
  let text = '';
  try {
    text = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return [new Map(), new Map()];
  }
  const [units, pieces] = text.split('export const PIECE_SOLIDS');
  const blocks = (t) => new Map([...(t ?? '').matchAll(/^  '([^']+)': \[\n([\s\S]*?)^  \],$/gm)].map((m) => [m[1], m[2]]));
  return [blocks(units), blocks(pieces)];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = process.env.ONLY?.split(',').filter(Boolean);
  const redo = (glb) => !only || only.some((o) => glb.includes(o));
  const [keptUnits, keptPieces] = keptBoxes();
  const out = {};
  const outText = {};
  for (const { glb, assets } of SOURCES) {
    if (!redo(glb)) {
      for (const asset of Object.keys(assets)) {
        if (!keptUnits.has(asset)) throw new Error(`${asset} isn't fitted yet: refit ${glb}`);
        outText[asset] = keptUnits.get(asset);
      }
      continue;
    }
    const meshes = readTriangles(join(ROOT, glb));
    for (const [asset, limit] of Object.entries(assets)) {
      const [most, worth] = Array.isArray(limit) ? limit : [limit, WORTH];
      const tris = meshes.get(asset);
      if (!tris) throw new Error(`${glb} has no ${asset}`);
      const { boxes, share } = fit(tris, most, false, worth);
      console.log(`${asset}: ${boxes.length} boxes, ${(share * 100).toFixed(0)}% of its volume`);
      out[asset] = boxes.map((b) => ({ c: b.c.map(round), s: b.s.map(round) }));
    }
  }
  const pieces = {};
  const pieceText = {};
  for (const { glb, plan, most } of PIECES) {
    if (!redo(glb)) {
      for (const name of Object.keys(JSON.parse(readFileSync(join(ROOT, plan), 'utf8')).pieces)) {
        if (!keptPieces.has(name)) throw new Error(`${name} isn't fitted yet: refit ${glb}`);
        pieceText[name] = keptPieces.get(name);
      }
      continue;
    }
    const meshes = readTriangles(join(ROOT, glb));
    for (const [name, boxes] of Object.entries(JSON.parse(readFileSync(join(ROOT, plan), 'utf8')).pieces)) {
      const tris = meshes.get(name);
      if (!tris) throw new Error(`${glb} has no ${name}`);
      const kept = [];
      let refitted = 0;
      for (const box of boxes) {
        if (overreach(tris, box) <= TOLERANCE) {
          kept.push(box);
          continue;
        }
        const { boxes: fitted, share } = refit(tris, box, most[box.part] ?? most.default);
        refitted++;
        const worst = Math.max(0, ...fitted.map((b) => overreach(tris, b)));
        if (worst > TOLERANCE) console.warn(`${name} ${box.part}: a fitted box stands ${worst.toFixed(3)} m out`);
        console.log(`  ${name} ${box.part} ${box.s.map((v) => v.toFixed(2)).join('x')}: ${fitted.length} boxes, ${(share * 100).toFixed(0)}% of its model there`);
        kept.push(...fitted);
      }
      console.log(`${name}: ${boxes.length} boxes, ${refitted} refitted, ${kept.length} now`);
      pieces[name] = kept;
    }
  }
  // In SOURCES' and PIECES' order, each refitted or kept as it was.
  const pieceBody = PIECES.flatMap(({ plan }) => Object.keys(JSON.parse(readFileSync(join(ROOT, plan), 'utf8')).pieces))
    .map((name) => {
      const text = pieceText[name] ?? `${pieces[name].map((b) => `    { part: '${b.part}', c: [${b.c.map(round).join(', ')}], s: [${b.s.map(round).join(', ')}], yaw: ${round(b.yaw ?? 0)}, material: '${b.material ?? 'concrete'}' },`).join('\n')}\n`;
      return `  '${name}': [\n${text}  ],`;
    })
    .join('\n');
  const body = SOURCES.flatMap(({ assets }) => Object.keys(assets))
    .map((asset) => {
      const text = outText[asset] ?? `${out[asset].map((b) => `    { c: [${b.c.join(', ')}], s: [${b.s.join(', ')}] },`).join('\n')}\n`;
      return `  '${asset}': [\n${text}  ],`;
    })
    .join('\n');
  writeFileSync(
    OUT,
      `// Written by tools/map/fit-solids.mjs from the models' GLBs: don't edit, rerun it.\n\n` +
    `import type { PartBox } from './zero-island-region';\n\n` +
      `/** A box of a kit model's solid, in the model's unit frame (x and z across, y up): its middle and size. */\n` +
      `export interface KitBox {\n  readonly c: readonly [number, number, number];\n  readonly s: readonly [number, number, number];\n}\n\n` +
      `/** The boxes each kit model's solid is made of, every one inside its mesh (ticket 63). */\n` +
      `export const KIT_SOLIDS: Readonly<Record<string, readonly KitBox[]>> = {\n${body}\n};\n\n` +
      `/** Each Region's built piece's solid, in its own frame: its plan's boxes, those its model doesn't fill refitted inside it (ticket 63). */\n` +
      `export const PIECE_SOLIDS: Readonly<Record<string, readonly PartBox[]>> = {\n${pieceBody}\n};\n`,
  );
}
