import { describe, expect, it } from 'vitest';
import { box, yawBox, type Solid, type Vec3 } from '@duty-shooter/fps-core';
import { ATLAS_BORDER, Baker, LIGHTING, decorationErrors, layoutSurfaces, packAtlas, readBakeFile, writeBakeFile, type Decoration, type SurfaceSpec } from '@duty-shooter/fps-client/surfaces';

const spec = (over: Partial<SurfaceSpec> = {}): SurfaceSpec => ({ finishes: {}, looks: [], decorations: [], indoor: [], ...over });

describe('surface faces', () => {
  it('drops faces pressed against a neighbour and faces under the ground', () => {
    const ground = box({ min: [-5, -0.5, -5], max: [5, 0, 5], material: 'grass' });
    const a = box({ min: [0, 0, 0], max: [1, 1, 1], material: 'concrete' });
    const b = box({ min: [1, 0, 0], max: [2, 1, 1], material: 'concrete' });
    const { faces } = layoutSurfaces([ground, a, b], spec());
    const of = (solid: number) => faces.filter((f) => f.solid === solid);
    // The ground keeps only its top; each cube loses its bottom and the face it shares.
    expect(of(0).map((f) => f.normal)).toEqual([[0, 1, 0]]);
    expect(of(1)).toHaveLength(4);
    expect(of(1).some((f) => f.normal[0] === 1)).toBe(false);
    expect(of(2).some((f) => f.normal[0] === -1)).toBe(false);
  });

  it('wears the look: sides, tops, and the inside finish facing into an indoor zone', () => {
    const wall = box({ min: [0, 0, 0], max: [0.2, 3, 4], material: 'plaster' });
    const finishes = { siding: { family: 'siding', color: 0x6f8fa8 }, wallpaper: { family: 'plaster', color: 0xe8dcc0 }, cap: { family: 'paint', color: 0xffffff } } as const;
    const { faces } = layoutSurfaces([wall], spec({ finishes, looks: [{ side: 'siding', inside: 'wallpaper', top: 'cap' }], indoor: [{ min: [0.2, 0, 0], max: [5, 3, 4] }] }));
    const facing = (n: Vec3) => faces.find((f) => f.normal.every((v, i) => v === n[i]))!.finish;
    expect(facing([-1, 0, 0])).toBe('siding');
    expect(facing([1, 0, 0])).toBe('wallpaper');
    expect(facing([0, 1, 0])).toBe('cap');
  });

  it("wears the edge finish on a wall's narrow ends", () => {
    const wall = box({ min: [0, 0, 0], max: [3, 2.5, 0.2], material: 'wood' });
    const { faces } = layoutSurfaces([wall], spec({ finishes: { trim: { family: 'paint', color: 0xffffff } }, looks: [{ side: 'default:wood', edge: 'trim' }] }));
    const finish = (n: Vec3) => faces.find((f) => f.normal.every((v, i) => v === n[i]))!.finish;
    expect(finish([1, 0, 0])).toBe('trim');
    expect(finish([-1, 0, 0])).toBe('trim');
    expect(finish([0, 0, 1])).toBe('default:wood');
  });

  it('falls back to the material default with no look, and refuses an unknown finish', () => {
    const s = box({ min: [0, 0, 0], max: [1, 1, 1], material: 'brick' });
    expect(layoutSurfaces([s], spec()).faces[0]!.finish).toBe('default:brick');
    expect(() => layoutSurfaces([s], spec({ looks: [{ side: 'nope' }] }))).toThrow(/nope/);
  });

  it('adds decoration faces, less the one against its solid', () => {
    const wall = box({ min: [0, 0, 0], max: [4, 3, 0.2], material: 'plaster' });
    const trim: Decoration = { center: [2, 1.5, 0.22], size: [1.2, 0.1, 0.04], yaw: 0, finish: 'default:wood', solid: 0 };
    const { faces } = layoutSurfaces([wall], spec({ decorations: [trim] }));
    const deco = faces.filter((f) => f.decoration === 0);
    expect(deco).toHaveLength(5);
    expect(deco.some((f) => f.normal[2] === -1)).toBe(false);
  });
});

describe('decoration bounds', () => {
  const wall = box({ min: [0, 0, 0], max: [4, 3, 0.2], material: 'plaster' });
  const turned = yawBox({ center: [10, 1, 0], size: [2, 2, 0.2], yaw: 0.7, material: 'wood' });
  const at = (center: Vec3, size: Vec3, solid = 0, yaw = 0): Decoration => ({ center, size, yaw, finish: 'default:wood', solid });

  it('accepts trim within 5 cm of its solid, on axis-aligned and turned solids', () => {
    expect(decorationErrors([wall, turned], [at([2, 1.5, 0.22], [1.2, 0.1, 0.04]), at([10, 1, 0], [1, 1, 0.28], 1, 0.7)])).toEqual([]);
  });

  it('flags trim that stands proud, sits off the end, is turned off its solid, or names no solid', () => {
    const solids: Solid[] = [wall, turned];
    expect(decorationErrors(solids, [at([2, 1.5, 0.3], [1, 0.1, 0.1]), at([4.1, 1, 0.1], [0.2, 0.2, 0.2]), at([10, 1, 0], [1, 1, 0.28], 1, 0), at([0, 0, 0], [0.1, 0.1, 0.1], 5)])).toEqual([0, 1, 2, 3]);
  });
});

describe('lightmap atlas', () => {
  it('packs every lit face without overlap, inside the atlas, and skips glass', () => {
    const solids = Array.from({ length: 60 }, (_, i) => box({ min: [i * 3, 0, 0], max: [i * 3 + 1 + (i % 7), 1 + (i % 5), 2], material: i % 9 === 0 ? 'glass' : 'concrete' }));
    const { faces, atlas } = layoutSurfaces(solids, spec());
    const rects = atlas.rects.flatMap((r) => (r ? [r] : []));
    expect(rects.length).toBe(faces.filter((f) => solids[f.solid]!.material !== 'glass').length);
    for (const [i, a] of rects.entries()) {
      const B = ATLAS_BORDER;
      expect(a.x - B).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w + B).toBeLessThanOrEqual(atlas.width);
      expect(a.y + a.h + B).toBeLessThanOrEqual(atlas.height);
      for (const b of rects.slice(i + 1)) {
        const apart = a.x + a.w + B <= b.x - B || b.x + b.w + B <= a.x - B || a.y + a.h + B <= b.y - B || b.y + b.h + B <= a.y - B;
        expect(apart).toBe(true);
      }
    }
    // Same faces, same layout.
    expect(packAtlas(faces, () => 'concrete')).toEqual(packAtlas(faces, () => 'concrete'));
  });

  it('sizes a face the same whichever side of a whole texel count float noise puts it', () => {
    // A 2 m edge, a few ulps either way: what one JS engine's Math.hypot gives and another's doesn't.
    const face = (length: number) => ({ solid: 0, decoration: -1, side: 0, origin: [0, 0, 0] as Vec3, u: [length, 0, 0] as Vec3, v: [0, 1, 0] as Vec3, normal: [0, 0, 1] as Vec3, finish: 'x' });
    const sizes = [2 - 4e-16, 2, 2 + 4e-16, 1.9999999, 2.0000001].map((l) => {
      const r = packAtlas([face(l)], () => 'concrete').rects[0]!;
      return [r.w, r.h];
    });
    for (const s of sizes) expect(s).toEqual(sizes[1]);
  });

  it('gives layouts that pack differently different keys', () => {
    // A small cube: its rects change size (3 texels or 2) but the atlas keeps its height.
    const solids = [box({ min: [0, 1, 0], max: [0.4, 1.4, 0.4], material: 'concrete' })];
    const as = (family: 'concrete' | 'sand') => layoutSurfaces(solids, { ...spec(), finishes: { ground: { family, color: 0x808080 } }, looks: [{ side: 'ground' }] });
    expect(as('concrete').atlas.rects).not.toEqual(as('sand').atlas.rects);
    expect(as('concrete').atlas.height).toBe(as('sand').atlas.height);
    expect(as('concrete').key).not.toBe(as('sand').key);
  });
});

describe('lighting bake', () => {
  // A 3 m cube on open ground: its shadow falls away from the sun.
  const ground = box({ min: [-20, -0.5, -20], max: [20, 0, 20], material: 'concrete' });
  const cube = box({ min: [-1.5, 0, -1.5], max: [1.5, 3, 1.5], material: 'concrete' });
  const layout = layoutSurfaces([ground, cube], spec());
  const baker = new Baker({ solids: [ground, cube], faces: layout.faces, atlas: layout.atlas, albedo: layout.albedo });
  const sun = new Float32Array(baker.texels);
  baker.sun(0, baker.texels, sun);
  const first = new Float32Array(baker.texels * 3);
  baker.indirect(sun, null, 0, baker.texels, first);
  const light = new Float32Array(baker.texels * 3);
  baker.indirect(sun, first, 0, baker.texels, light);
  const lightmap = baker.encode(sun, light);

  /** The encoded texel nearest a point on the ground's top face. */
  const groundTexel = (x: number, z: number) => {
    const fi = layout.faces.findIndex((f) => f.solid === 0 && f.normal[1] === 1);
    const f = layout.faces[fi]!;
    const r = layout.atlas.rects[fi]!;
    const s = ((x - f.origin[0]) * f.u[0] + (z - f.origin[2]) * f.u[2]) / (f.u[0] ** 2 + f.u[2] ** 2);
    const t = ((x - f.origin[0]) * f.v[0] + (z - f.origin[2]) * f.v[2]) / (f.v[0] ** 2 + f.v[2] ** 2);
    const o = ((r.y + Math.round(t * (r.h - 1))) * layout.atlas.width + r.x + Math.round(s * (r.w - 1))) * 4;
    return { sky: lightmap[o]!, sun: lightmap[o + 3]! / 255 };
  };
  const L = LIGHTING.sunDirection;
  const away = Math.hypot(L[0], L[2]);
  /** A point on the ground `d` m down-sun of the cube's centre. */
  const downSun = (d: number): [number, number] => [(-L[0] / away) * d, (-L[2] / away) * d];
  const open = groundTexel(12, -12);

  it('shades the ground behind the cube and lights open ground at n.L', () => {
    expect(groundTexel(...downSun(2.5)).sun).toBeLessThan(0.05);
    expect(open.sun).toBeCloseTo(L[1], 1);
  });

  it("darkens the sky light beside the cube's shaded sides (ambient occlusion) and brightens it beside the sunlit one (bounce)", () => {
    expect(groundTexel(1.6, -1.6).sky).toBeLessThan(open.sky);
    expect(groundTexel(-1.6, 1.6).sky).toBeGreaterThan(groundTexel(1.6, -1.6).sky);
  });

  it('bakes probes: a probe in the shadow sees less sun than one in the open', () => {
    const probes = baker.probes({ min: [-6, 0.5, -6], step: 1, dims: [13, 1, 13] }, sun, light);
    const at = (x: number, z: number) => probes[(Math.round(x + 6) + Math.round(z + 6) * 13) * 4 + 3]! / 255;
    expect(at(...downSun(3))).toBeLessThan(0.1);
    expect(at(5, -5)).toBeGreaterThan(0.9);
  });
});

describe('bake file', () => {
  it('reads back what it wrote, and refuses a truncated file', () => {
    const file = { key: 'abc1', width: 4, height: 2, probes: { min: [0, 0.3, 0] as Vec3, step: 1.5, dims: [2, 1, 3] as const }, lightmap: Uint8Array.from({ length: 32 }, (_, i) => i), probeData: Uint8Array.from({ length: 24 }, (_, i) => 200 + i) };
    const bytes = writeBakeFile(file);
    const back = readBakeFile(bytes);
    expect({ ...back, lightmap: [...back.lightmap], probeData: [...back.probeData] }).toEqual({ ...file, lightmap: [...file.lightmap], probeData: [...file.probeData] });
    expect(() => readBakeFile(bytes.subarray(0, bytes.length - 1))).toThrow(/expected/);
  });
});
