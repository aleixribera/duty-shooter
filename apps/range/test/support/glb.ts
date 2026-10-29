import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import type { Vec3 } from '@duty-shooter/fps-core';
import { DECORATION_TOLERANCE } from '@duty-shooter/fps-client/surfaces';
import type { MapDefinition } from '../../src/map/maps';

interface Gltf {
  nodes: { name: string; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  meshes: { primitives: { attributes: { POSITION: number }; material?: number }[] }[];
  materials: { name: string }[];
  accessors: { bufferView: number; byteOffset?: number; count: number; type: string; componentType: number }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
}

/** The models' GLB: its JSON and, per top-level node, its vertices (node space) and material names. */
export function readGlb(path: string): { json: Gltf; assets: Map<string, { vertices: Vec3[]; materials: string[] }> } {
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

/**
 * The placed models whose vertices stray more than the decoration tolerance
 * from the solids they draw, as messages (none when all is well).
 */
export function strayModels(map: MapDefinition, assets: ReadonlyMap<string, { vertices: Vec3[] }>): string[] {
  const bad: string[] = [];
  for (const p of map.models!.placements) {
    if (p.visualOnly) {
      if (p.solids.length !== 0) bad.push(`${p.asset}: visual-only scenery has collision solids`);
      continue;
    }
    if (p.solids.length === 0) {
      bad.push(`${p.asset}: no collision solids and not marked visual-only`);
      continue;
    }
    const solids = p.solids.map((i) => map.solids[i]!);
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    let worst = 0;
    let at: Vec3 = [0, 0, 0];
    for (const [x, y, z] of assets.get(p.asset)!.vertices) {
      // Turned about +y by yaw (+x toward (cos, 0, -sin)), then moved.
      const w: Vec3 = [p.position[0] + x * c + z * s, p.position[1] + y, p.position[2] - x * s + z * c];
      const d = Math.min(
        ...solids.map((b) => {
          // Into an oriented solid's own frame first.
          const o = b.orientation;
          if (!o) return Math.hypot(...([0, 1, 2] as const).map((k) => Math.max(b.min[k] - w[k], 0, w[k] - b.max[k])));
          const dx = w[0] - o.center[0];
          const dy = w[1] - o.center[1];
          const dz = w[2] - o.center[2];
          const l = [0, 1, 2].map((k) => dx * o.axes[k]![0] + dy * o.axes[k]![1] + dz * o.axes[k]![2]);
          return Math.hypot(...l.map((v, k) => Math.max(Math.abs(v) - o.half[k]!, 0)));
        }),
      );
      if (d > worst) [worst, at] = [d, w];
    }
    if (worst > DECORATION_TOLERANCE + 1e-4) bad.push(`${p.asset} at ${p.position}: ${worst.toFixed(3)} m out at ${at.map((v) => v.toFixed(2))}`);
  }
  return bad;
}
