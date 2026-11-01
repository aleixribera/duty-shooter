// Paints the surface tiles the maps' finishes read (apps/range/public/textures/):
// tiling relief for each family (RGB: normal x, normal y, height) and tiling
// noise (the mask the patterns are cut from), all from code and repeatable.
//
//   node tools/textures/tiles.mjs      (needs ffmpeg on the PATH, for the WebP)
//
// A tile's period in metres is a whole number of its pattern, the same numbers
// `TILES` in packages/fps-client/src/surface-tiles.ts keeps, so a relief lines
// up with the pattern drawn over it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../apps/range/public/textures');
const SIZE = 512;

const fract = (x) => x - Math.floor(x);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** 0..1 for a pair of whole numbers, the same every run. */
const hash = (x, y, seed = 0) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);

/** Value noise that repeats every `period` cells, at (x, y) in cells. */
function lattice(x, y, period, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const wrap = (v) => ((v % period) + period) % period;
  const at = (i, j) => hash(wrap(x0 + i), wrap(y0 + j), seed);
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v;
}

/** Tiling fractal noise over 0..1 x 0..1, about 0..1 with its mean at 0.5. */
function fbm(u, v, period, octaves, seed) {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += lattice(u * period, v * period, period, seed + o) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    period *= 2;
  }
  return sum / total;
}

/** Distances to the nearest and next-nearest of `period` scattered points a side (cells), repeating; and the nearest's own number. */
function worley(u, v, period, seed) {
  const x = u * period;
  const y = v * period;
  const [cx, cy] = [Math.floor(x), Math.floor(y)];
  const wrap = (a) => ((a % period) + period) % period;
  let [f1, f2, id] = [9, 9, 0];
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const [px, py] = [wrap(cx + i), wrap(cy + j)];
      const d = Math.hypot(cx + i + hash(px, py, seed) - x, cy + j + hash(px, py, seed + 1) - y);
      if (d < f1) [f2, f1, id] = [f1, d, hash(px, py, seed + 2)];
      else if (d < f2) f2 = d;
    }
  }
  return { f1, f2, id };
}

/** Hard earth: scuffed, split by shrinkage cracks where it has baked, and strewn with pebbles. */
function earthHeight(u, v) {
  const ground = fbm(u, v, 5, 5, 101) * 0.5 + fbm(u, v, 80, 2, 102) * 0.18 + 0.16;
  const cell = worley(u, v, 6, 103);
  const baked = smooth(0.45, 0.6, fbm(u, v, 3, 2, 104));
  const split = 1 - smooth(0.012, 0.05, cell.f2 - cell.f1 + (fbm(u, v, 30, 2, 105) - 0.5) * 0.05);
  // Stones of no particular shape: the point the distance is measured from wanders.
  const stone = worley(u + (fbm(u, v, 40, 2, 107) - 0.5) * 0.02, v + (fbm(u, v, 40, 2, 108) - 0.5) * 0.02, 24, 106);
  const pebble = stone.id > 0.78 ? smooth(0.3 * stone.id, 0.1, stone.f1) * (0.35 + stone.id * 0.4) * (0.6 + fbm(u, v, 60, 2, 109) * 0.8) : 0;
  return ground * (1 - split * baked * 0.75) + pebble * 0.42;
}

/** Height 0..1 of a running-bond wall: `across` by `rows` courses, every other course half a unit along. */
function bond(u, v, across, rows, seed, soft = 0.09) {
  const row = Math.floor(v * rows);
  const x = u * across + (row & 1 ? 0.5 : 0);
  const col = Math.floor(x);
  const fx = x - col;
  const fy = v * rows - row;
  const edge = Math.min(Math.min(fx, 1 - fx) * (rows / across) * 0.5, Math.min(fy, 1 - fy));
  const id = hash(((col % across) + across) % across, row, seed);
  const proud = 0.72 + id * 0.28;
  const chipped = smooth(0.42, 0.62, fbm(u, v, 24, 3, seed + 3)) * 0.05;
  return smooth(0.012, soft, edge + chipped - 0.02) * proud;
}

/**
 * The reliefs: `metres` is what one tile covers (x, y), `depth` the height of
 * white over black in metres (it sets how hard the normal leans), `height` the
 * relief at (u, v) in 0..1, x along the surface and y up it.
 */
const TILES = {
  brick: { metres: [1.8, 1.8], depth: 0.012, height: (u, v) => bond(u, v, 8, 24, 11) * (0.86 + fbm(u, v, 40, 3, 12) * 0.14) },
  stucco: { metres: [3, 3], depth: 0.006, height: (u, v) => fbm(u, v, 6, 3, 21) * 0.45 + fbm(u, v, 64, 3, 22) * 0.55 },
  concrete: { metres: [3, 3], depth: 0.004, height: (u, v) => 0.78 + fbm(u, v, 12, 4, 31) * 0.22 - smooth(0.62, 0.7, fbm(u, v, 96, 2, 32)) * 0.35 },
  siding: {
    metres: [2, 2],
    depth: 0.014,
    height: (u, v) => {
      const t = fract(v * 10);
      const grain = fbm(u * 0.2, v, 60, 3, 41) * 0.06;
      // Each board rises from its foot up under the lip of the next.
      return clamp(1 - t * 0.85 - grain) * smooth(0, 0.06, t);
    },
  },
  shingles: {
    metres: [1.98, 2.2],
    depth: 0.014,
    height: (u, v) => {
      const row = Math.floor(v * 10);
      const x = u * 6 + (row & 1 ? 0.5 : 0);
      const tab = hash(Math.floor(x) % 6, row, 51);
      const t = fract(v * 10);
      const gap = smooth(0, 0.035, Math.min(fract(x), 1 - fract(x)));
      return (1 - t * 0.7) * smooth(0, 0.05, t) * (0.72 + tab * 0.28) * (0.75 + gap * 0.25) * (0.82 + fbm(u, v, 96, 2, 52) * 0.18);
    },
  },
  sheetMetal: { metres: [1.976, 1.976], depth: 0.014, height: (u, v) => 0.5 + Math.sin(u * 26 * 2 * Math.PI) * 0.46 + (fbm(u, v, 14, 3, 61) - 0.5) * 0.08 },
  planks: {
    metres: [1.96, 1.96],
    depth: 0.005,
    height: (u, v) => {
      const x = u * 14;
      const seam = smooth(0, 0.05, Math.min(fract(x), 1 - fract(x)));
      return seam * (0.7 + fbm(u * 3, v * 0.4, 28, 3, 71 + Math.floor(x) * 3) * 0.3);
    },
  },
  gravel: {
    metres: [2, 2],
    depth: 0.02,
    height: (u, v) => {
      // Stones: the distance to the nearest of a jittered grid of points.
      const cells = 42;
      const x = u * cells;
      const y = v * cells;
      let near = 9;
      let id = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const cx = Math.floor(x) + i;
          const cy = Math.floor(y) + j;
          const wx = ((cx % cells) + cells) % cells;
          const wy = ((cy % cells) + cells) % cells;
          const d = Math.hypot(cx + hash(wx, wy, 81) - x, cy + hash(wx, wy, 82) - y);
          if (d < near) {
            near = d;
            id = hash(wx, wy, 83);
          }
        }
      }
      return smooth(0.85, 0.15, near) * (0.55 + id * 0.45);
    },
  },
  asphalt: { metres: [2, 2], depth: 0.003, height: (u, v) => fbm(u, v, 128, 2, 91) * 0.8 + fbm(u, v, 8, 3, 92) * 0.2 },
  earth: { metres: [3, 3], depth: 0.05, height: earthHeight },
  grass: { metres: [2, 2], depth: 0.025, height: (u, v) => Math.pow(fbm(u, v, 90, 3, 111), 1.6) * 1.5 * (0.6 + fbm(u, v, 9, 2, 112) * 0.4) },
};

/** One strip of the trim sheet, across it (0..1 up the strip), repeating along it `repeat` times per tile. */
const STRIPS = [
  // A window frame: a raised bead between two flats.
  (a) => 0.45 + smooth(0.28, 0.42, a) * smooth(0.72, 0.58, a) * 0.55 - smooth(0.12, 0.02, a) * 0.3 - smooth(0.88, 0.98, a) * 0.3,
  // A sill: a rounded nose over a drip groove.
  (a) => smooth(0.05, 0.4, a) * 0.9 + 0.1 - smooth(0.2, 0.12, a) * smooth(0.04, 0.12, a) * 0.5,
  // A band: two fillets.
  (a) => 0.5 + smooth(0.12, 0.2, a) * smooth(0.34, 0.26, a) * 0.5 + smooth(0.66, 0.74, a) * smooth(0.88, 0.8, a) * 0.5,
  // A cornice: steps, with blocks (dentils) under the top one.
  (a, u) => {
    const block = smooth(0.08, 0.14, fract(u * 12)) * smooth(0.72, 0.64, fract(u * 12));
    return 0.2 + smooth(0.1, 0.16, a) * 0.25 + smooth(0.36, 0.42, a) * 0.2 * block + smooth(0.62, 0.7, a) * 0.35;
  },
];

/** The trim sheet: four strips stacked, each repeating along x. */
const trimHeight = (u, v) => {
  const strip = Math.min(STRIPS.length - 1, Math.floor(v * STRIPS.length));
  const a = v * STRIPS.length - strip;
  return clamp(STRIPS[strip](a, u) * (0.96 + fbm(u, v, 48, 2, 121) * 0.04));
};

/** RGB bytes of a relief: normal x and y, height. */
function relief(tile, size = SIZE) {
  const [mx, my] = tile.metres;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = clamp(tile.height((x + 0.5) / size, (y + 0.5) / size));
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  const out = new Uint8Array(size * size * 3);
  const dx = (2 * mx) / size;
  const dy = (2 * my) / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = ((at(x + 1, y) - at(x - 1, y)) * tile.depth) / dx;
      const sy = ((at(x, y + 1) - at(x, y - 1)) * tile.depth) / dy;
      const l = Math.hypot(sx, sy, 1);
      const i = (y * size + x) * 3;
      out[i] = Math.round((-sx / l) * 127.5 + 127.5);
      out[i + 1] = Math.round((-sy / l) * 127.5 + 127.5);
      out[i + 2] = Math.round(at(x, y) * 255);
    }
  }
  return out;
}

/** RGB bytes of the shared noise: smooth, a second smooth, and a crease (0 along cracks). */
function noise(size) {
  const out = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const i = (y * size + x) * 3;
      // Stretched back out to about the spread the patterns were tuned on.
      out[i] = Math.round(clamp((fbm(u, v, 8, 3, 1) - 0.5) * 1.5 + 0.5) * 255);
      out[i + 1] = Math.round(clamp((fbm(u, v, 8, 3, 7) - 0.5) * 1.5 + 0.5) * 255);
      out[i + 2] = Math.round(clamp(Math.abs(fbm(u, v, 8, 2, 13) - 0.5) * 3) * 255);
    }
  }
  return out;
}

/**
 * The sky's cloud (RGB: density, how deep into a bank, unused): heaps of round
 * billows over wide banks, so a cloud has a cauliflower edge and a heavy middle.
 */
function clouds(size) {
  const out = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [u, v] = [(x + 0.5) / size, (y + 0.5) / size];
      const bank = fbm(u, v, 3, 4, 201);
      let billows = 0;
      let amplitude = 0.5;
      let total = 0;
      for (let o = 0; o < 5; o++) {
        const round = 1 - clamp(worley(u, v, 5 << o, 210 + o * 7).f1);
        billows += round * round * amplitude;
        total += amplitude;
        amplitude *= 0.52;
      }
      billows /= total;
      out[(y * size + x) * 3] = Math.round(clamp(bank * 0.75 + billows * 0.62 - 0.08) * 255);
      out[(y * size + x) * 3 + 1] = Math.round(clamp((bank - 0.3) * 2.2) * 255);
    }
  }
  return out;
}

function crcTable() {
  return Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
}
const CRC = crcTable();
function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A PNG of width x height pixels of `channels` bytes each (3 RGB, 4 RGBA). */
export function png(bytes, width, height, channels = 3) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 2;
  const rows = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(bytes.buffer, bytes.byteOffset + y * width * channels, width * channels).copy(rows, y * (width * channels + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Writes `bytes` as public/textures/<name>.webp through ffmpeg, losslessly:
 * WebP's lossy mode halves two of the three channels, and these aren't colours.
 * `bits` is how many low bits to drop first, which the eye can't see through
 * filtering and halves the file.
 */
/** One room's cell in the rooms picture (px): 3.6 m across, 3 m high. */
const ROOM = 256;

/** The pictures behind the windows: four rooms' back walls along the top, their furniture along the bottom on black, which reads as nothing there. */
export function rooms() {
  const width = ROOM * 4;
  const out = new Uint8Array(width * ROOM * 2 * 3);
  const box = (room, row, x, y, w, h, colour, grainy = 0.05) => {
    for (let py = Math.max(0, y); py < Math.min(ROOM, y + h); py++) {
      for (let px = Math.max(0, x); px < Math.min(ROOM, x + w); px++) {
        const at = ((row * ROOM + py) * width + room * ROOM + px) * 3;
        const shade = 1 + (hash(px + room * ROOM, py + row * ROOM, 3) - 0.5) * grainy * 2;
        for (let c = 0; c < 3; c++) out[at + c] = clamp(colour[c] * shade, 0, 255);
      }
    }
  };
  const wall = (room, colour) => {
    box(room, 0, 0, 0, ROOM, ROOM, colour, 0.04);
    box(room, 0, 0, 240, ROOM, 16, [colour[0] * 0.55, colour[1] * 0.5, colour[2] * 0.45]);
  };
  // A sitting room: a picture, a door, a sofa and a standard lamp.
  wall(0, [150, 165, 148]);
  box(0, 0, 62, 70, 66, 44, [62, 48, 36]);
  box(0, 0, 67, 75, 56, 34, [196, 170, 118]);
  box(0, 0, 176, 66, 50, 174, [104, 72, 46]);
  box(0, 0, 184, 76, 34, 66, [118, 84, 54]);
  box(0, 1, 40, 186, 136, 44, [126, 66, 42]);
  box(0, 1, 40, 164, 136, 36, [142, 76, 48]);
  box(0, 1, 28, 176, 22, 66, [112, 58, 38]);
  box(0, 1, 166, 176, 22, 66, [112, 58, 38]);
  box(0, 1, 208, 112, 5, 134, [52, 40, 30]);
  box(0, 1, 192, 84, 38, 34, [250, 226, 170], 0.02);
  // A kitchen: tiles, wall cupboards, a counter, a table and two chairs.
  wall(1, [206, 194, 160]);
  box(1, 0, 16, 112, 226, 128, [172, 190, 182], 0.03);
  for (let x = 16; x < 242; x += 22) box(1, 0, x, 112, 1, 128, [120, 130, 124]);
  for (let y = 112; y < 240; y += 22) box(1, 0, 16, y, 226, 1, [120, 130, 124]);
  for (let x = 20; x < 220; x += 56) box(1, 0, x, 40, 52, 66, [112, 80, 54]);
  box(1, 0, 16, 176, 226, 64, [126, 94, 62]);
  box(1, 0, 16, 170, 226, 8, [196, 190, 176]);
  box(1, 1, 66, 170, 124, 10, [96, 66, 42]);
  for (const x of [72, 176]) box(1, 1, x, 180, 8, 66, [78, 54, 34]);
  for (const x of [34, 202]) {
    box(1, 1, x, 140, 8, 106, [66, 46, 30]);
    box(1, 1, x + 16, 192, 6, 54, [66, 46, 30]);
    box(1, 1, x, 188, 24, 7, [84, 58, 38]);
  }
  // A study: a wall of books, a desk and a chair.
  wall(2, [176, 140, 92]);
  box(2, 0, 28, 30, 200, 210, [74, 52, 34]);
  for (let shelf = 0; shelf < 5; shelf++) {
    const y = 38 + shelf * 40;
    let x = 34;
    while (x < 220) {
      const w = 4 + Math.floor(hash(x, shelf, 5) * 8);
      const tall = 22 + Math.floor(hash(x, shelf, 6) * 11);
      if (hash(x, shelf, 7) > 0.14) box(2, 0, x, y + 33 - tall, Math.min(w, 222 - x), tall, [70 + hash(x, shelf, 8) * 130, 50 + hash(x, shelf, 9) * 90, 44 + hash(x, shelf, 10) * 70]);
      x += w + 1;
    }
  }
  box(2, 1, 50, 158, 140, 10, [116, 84, 54]);
  box(2, 1, 56, 168, 8, 78, [84, 60, 38]);
  box(2, 1, 176, 168, 8, 78, [84, 60, 38]);
  box(2, 1, 88, 114, 56, 40, [36, 38, 42]);
  box(2, 1, 112, 154, 8, 5, [36, 38, 42]);
  box(2, 1, 192, 132, 36, 70, [52, 58, 66]);
  box(2, 1, 206, 200, 8, 46, [40, 42, 46]);
  // A stripped room: bare walls, stacked crates, a mattress against the wall.
  wall(3, [146, 130, 108]);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash(i, 1, 11) * 220) + 8;
    const y = Math.floor(hash(i, 2, 11) * 190) + 8;
    box(3, 0, x, y, 12 + Math.floor(hash(i, 3, 11) * 44), 8 + Math.floor(hash(i, 4, 11) * 30), [120, 88, 66], 0.1);
  }
  box(3, 0, 30, 84, 62, 156, [168, 158, 138], 0.08);
  for (const [x, y, s] of [[20, 186, 60], [84, 198, 48], [30, 130, 56]]) {
    box(3, 1, x, y, s, s, [122, 96, 62], 0.1);
    box(3, 1, x + 4, y + 4, s - 8, s - 8, [142, 112, 74], 0.1);
    box(3, 1, x, y + (s >> 1), s, 3, [96, 74, 46]);
  }
  box(3, 1, 176, 170, 56, 76, [98, 92, 80], 0.1);
  return out;
}

/** One mark's cell in the grime picture (px). */
const GRIME = 256;

/** The weathering marks, white where each lands: streaks, rising damp, a crack and a stain (`GRIME_MARKS` keeps the order). */
export function grime() {
  const width = GRIME * 4;
  const out = new Uint8Array(width * GRIME * 3);
  const put = (cell, x, y, value) => {
    if (x < 0 || y < 0 || x >= GRIME || y >= GRIME) return;
    const at = (y * width + cell * GRIME + x) * 3;
    const v = Math.max(out[at], clamp(value) * 255);
    out[at] = out[at + 1] = out[at + 2] = v;
  };
  const sides = (u) => smooth(0, 0.12, u) * smooth(1, 0.88, u);
  for (let y = 0; y < GRIME; y++) {
    for (let x = 0; x < GRIME; x++) {
      const u = x / GRIME;
      const v = y / GRIME;
      // Runs start at the top of the wall and thin out on the way down, each its own length.
      const reach = 0.35 + 0.75 * fbm(u, 0.5, 14, 3, 21);
      const runs = smooth(0.42, 0.68, fbm(u + (fbm(u, v, 4, 2, 22) - 0.5) * 0.03, 0.5, 26, 3, 23));
      put(0, x, y, sides(u) * smooth(reach, 0, v) * (0.28 + 0.72 * runs) * (0.8 + 0.4 * fbm(u, v, 12, 3, 24)));
      // Damp stands highest in the middle, with a darker tide line at its edge.
      const top = 0.15 + 0.75 * Math.sin(u * Math.PI) ** 0.7 * (0.55 + 0.55 * fbm(u, 0.3, 9, 3, 25));
      const fromTop = v - (1 - top);
      put(1, x, y, sides(u) * smooth(0, 0.14, fromTop) * (0.38 + 0.5 * fbm(u, v, 10, 4, 26) + 0.45 * smooth(0.14, 0.02, Math.abs(fromTop - 0.05))));
      // A stain: a blot with a torn edge.
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      put(3, x, y, smooth(0.96, 0.25, r + (fbm(u, v, 7, 4, 27) - 0.5) * 0.85) * (0.5 + 0.7 * fbm(u, v, 18, 3, 28)));
    }
  }
  // The crack wanders from the top down, throwing off a few branches of its own.
  const crack = (seed, x0, y0, heading0, steps, wide) => {
    let [x, y, heading] = [x0, y0, heading0];
    for (let i = 0; i < steps; i++) {
      heading += (hash(i, seed, 29) - 0.5) * (i % 9 === 0 ? 1.5 : 0.4);
      x += Math.sin(heading) * 2.2;
      y += Math.cos(heading) * 2.2;
      const r = wide * (1 - i / steps) + 0.6;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) put(2, Math.round(x + dx), Math.round(y + dy), smooth(r + 0.8, r - 0.2, Math.hypot(dx, dy)));
      if (i % 22 === 11 && wide > 1) crack(seed + i + 1, x, y, heading + (hash(i, seed, 30) > 0.5 ? 0.9 : -0.9), steps * 0.4, wide * 0.5);
    }
  };
  crack(1, GRIME * 0.5, 10, 0.1, 100, 2.2);
  return out;
}

export function writeWebp(name, bytes, width, height, { channels = 3, bits = 2 } = {}) {
  const dir = join(tmpdir(), `duty-tiles-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const source = join(dir, `${name}.png`);
  const mask = (0xff << bits) & 0xff;
  writeFileSync(source, png(bytes.map((b) => Math.min(255, b + (1 << bits >> 1)) & mask), width, height, channels));
  mkdirSync(OUT, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', source, '-c:v', 'libwebp', '-lossless', '1', '-compression_level', '6', join(OUT, `${name}.webp`)]);
  rmSync(dir, { recursive: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, tile] of Object.entries(TILES)) writeWebp(name, relief(tile), SIZE, SIZE);
  writeWebp('trim', relief({ metres: [1, 1], depth: 0.03, height: trimHeight }), SIZE, SIZE);
  writeWebp('noise', noise(256), 256, 256, { bits: 1 });
  writeWebp('clouds', clouds(1024), 1024, 1024, { bits: 2 });
  writeWebp('rooms', rooms(), ROOM * 4, ROOM * 2, { bits: 3 });
  writeWebp('grime', grime(), GRIME * 4, GRIME, { bits: 3 });
}
