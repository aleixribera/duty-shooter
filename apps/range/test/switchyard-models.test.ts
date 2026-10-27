import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INTERMISSION, type Vec3 } from '@duty-shooter/fps-core';
import { DECORATION_TOLERANCE, finishTable } from '@duty-shooter/fps-client/surfaces';
import { BOUNDARY, MAIN_LINE, buildSwitchyard } from '../src/map/switchyard';

const map = buildSwitchyard();

interface Gltf {
  nodes: { name: string; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  meshes: { primitives: { attributes: { POSITION: number }; material?: number }[] }[];
  materials: { name: string }[];
  accessors: { bufferView: number; byteOffset?: number; count: number; type: string; componentType: number }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
}

/** The models' GLB: its JSON and, per top-level node, its vertices (node space) and material names. */
function readGlb(path: string): { json: Gltf; assets: Map<string, { vertices: Vec3[]; materials: string[] }> } {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as Gltf;
  const bin = bytes.subarray(20 + jsonLength + 8);
  const assets = new Map<string, { vertices: Vec3[]; materials: string[] }>();
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    // The exporter leaves each asset untransformed at the origin.
    expect(node.translation ?? [0, 0, 0], node.name).toEqual([0, 0, 0]);
    expect(node.rotation ?? [0, 0, 0, 1], node.name).toEqual([0, 0, 0, 1]);
    const vertices: Vec3[] = [];
    const materials: string[] = [];
    for (const prim of json.meshes[node.mesh]!.primitives) {
      const acc = json.accessors[prim.attributes.POSITION]!;
      const view = json.bufferViews[acc.bufferView]!;
      const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      const stride = view.byteStride ?? 12;
      for (let i = 0; i < acc.count; i++) {
        const o = start + i * stride;
        vertices.push([bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]);
      }
      materials.push(json.materials[prim.material!]!.name);
    }
    assets.set(node.name, { vertices, materials });
  }
  return { json, assets };
}

const glb = readGlb(fileURLToPath(new URL('../public/models/switchyard.glb', import.meta.url)));

describe('Switchyard: models', () => {
  const models = map.models!;

  it('places models from the file: the freight cars, the tank cars, the depot tanks, the locomotive and the lamps', () => {
    const count = (asset: string) => models.placements.filter((p) => p.asset === asset).length;
    expect(count('frame-12') + count('frame-9')).toBe(11);
    expect(count('tank-car')).toBe(2);
    expect(count('depot-tank')).toBe(2);
    expect(count('loco')).toBe(1);
    expect(count('lamp-head')).toBe(map.lamps.length);
    for (const p of models.placements) expect(glb.assets.has(p.asset), p.asset).toBe(true);
  });

  it('colours every part with one of the map\'s finishes', () => {
    const finishes = finishTable({ finishes: map.finishes, looks: [], decorations: [], indoor: [] });
    for (const [name, a] of glb.assets) for (const m of a.materials) expect(finishes[m], `${name}: ${m}`).toBeDefined();
  });

  it('keeps every vertex of every placed model within 5 cm of the solids it draws', () => {
    const bad: string[] = [];
    for (const p of models.placements) {
      const solids = p.solids.map((i) => map.solids[i]!);
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      let worst = 0;
      let at: Vec3 = [0, 0, 0];
      for (const [x, y, z] of glb.assets.get(p.asset)!.vertices) {
        // Turned about +y by yaw (+x toward (cos, 0, -sin)), then moved.
        const w: Vec3 = [p.position[0] + x * c + z * s, p.position[1] + y, p.position[2] - x * s + z * c];
        const d = Math.min(...solids.map((b) => Math.hypot(...([0, 1, 2] as const).map((k) => Math.max(b.min[k] - w[k], 0, w[k] - b.max[k])))));
        if (d > worst) [worst, at] = [d, w];
      }
      if (worst > DECORATION_TOLERANCE + 1e-4) bad.push(`${p.asset} at ${p.position}: ${worst.toFixed(3)} m out at ${at.map((v) => v.toFixed(2))}`);
    }
    expect(bad).toEqual([]);
  });

  it('draws no solid twice: each modelled solid belongs to one model', () => {
    const all = models.placements.flatMap((p) => p.solids);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('Switchyard: the freight train', () => {
  const train = map.train!;
  const head = (t: number) => train.start - train.speed * t;
  const east = Math.max(...BOUNDARY.map(([x]) => x));
  const west = Math.min(...BOUNDARY.map(([x]) => x));

  it('is made of the models in the file, and touches no solid', () => {
    for (const p of train.models.placements) {
      expect(glb.assets.has(p.asset), p.asset).toBe(true);
      expect(p.solids).toEqual([]);
    }
    expect(train.models.url).toBe(map.models!.url);
  });

  it('runs on the main line, beyond the barrier', () => {
    expect(MAIN_LINE).toContain(train.z);
    expect(BOUNDARY.every(([, z]) => z > train.z + 3)).toBe(true);
  });

  it('comes past the east end as the match ends, runs the length of the yard in the nuke, and clears it before the vote is over', () => {
    expect(head(0)).toBeGreaterThan(east + 50);
    expect(head(INTERMISSION.nuke)).toBeLessThan(west + (east - west) / 2);
    expect(head(INTERMISSION.nuke + INTERMISSION.vote) + train.length).toBeLessThan(west);
    // Its horn sounds for the yard before the head gets there.
    expect(head(train.horns.at(-1)!)).toBeGreaterThan(east - 20);
  });

  it('has a bogie under each end of every loco and wagon, head first', () => {
    expect(train.bogies).toHaveLength(2 * train.models.placements.filter((p) => p.asset === 'loco' || p.asset === 'frame-12').length);
    for (let i = 1; i < train.bogies.length; i++) expect(train.bogies[i]!).toBeGreaterThan(train.bogies[i - 1]!);
    expect(train.bogies.at(-1)!).toBeLessThan(train.length);
  });
});
