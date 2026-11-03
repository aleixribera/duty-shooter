import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLANT_STRIDE } from '@duty-shooter/fps-client/surfaces';
import { buildMapById } from '../src/map/maps';
import { SOFT_PLANTS } from '../src/map/zero-island-plants';

const map = buildMapById('zero-island');
const plants = map.plants!;

type Gltf = { nodes: { name?: string; mesh?: number }[]; meshes: { primitives: { attributes: Record<string, number> }[] }[] };

/** A GLB's JSON chunk, read directly. */
function glbJson(path: string): Gltf {
  const bytes = readFileSync(path);
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as Gltf;
}

const publicFile = (path: string) => new URL(`../public/${path}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const kit = glbJson(publicFile('models/vegetation.glb'));
const glbNodes = () => kit.nodes.map((n) => n.name ?? '');

/** How far a bot sees another player (fps-core's bots/bot.ts, `SIGHT_RANGE`). */
const BOT_SIGHT = 70;

const each = (asset: string, visit: (x: number, y: number, z: number, sx: number, sy: number, sz: number) => void) => {
  for (const k of plants.kinds.filter((kind) => kind.asset === asset)) {
    for (let o = 0; o < k.instances.length; o += PLANT_STRIDE) visit(k.instances[o]!, k.instances[o + 1]!, k.instances[o + 2]!, k.instances[o + 4]!, k.instances[o + 5]!, k.instances[o + 6]!);
  }
};

describe('Zero Island: plants', () => {
  it('draws only models the kit has', () => {
    const nodes = glbNodes();
    for (const k of plants.kinds) {
      expect(nodes, k.asset).toContain(k.asset);
      if (k.lod) expect(nodes, k.lod).toContain(k.lod);
    }
    expect(Object.keys(SOFT_PLANTS).every((name) => nodes.includes(name))).toBe(true);
  });

  it('dresses every rock and trunk of the cover pass, and keeps their solids', () => {
    const coverRocksAndTrunks = map.solids.filter((s, i) => map.looks[i]?.side?.startsWith('cover-') && plants.modelled.includes(i));
    expect(plants.modelled.length).toBeGreaterThan(5000);
    expect(coverRocksAndTrunks.length).toBe(plants.modelled.length);
    expect(new Set(plants.modelled).size).toBe(plants.modelled.length);
    let rocks = 0;
    for (const asset of ['rock-a', 'rock-b', 'rock-strata']) each(asset, () => rocks++);
    let trunks = 0;
    for (const asset of ['pine-trunk', 'broadleaf-trunk']) each(asset, () => trunks++);
    expect(rocks + trunks).toBe(plants.modelled.length);
  });

  it('stands a rock exactly in its solid: what is seen is what stops a bullet', () => {
    const solids = plants.modelled.map((i) => map.solids[i]!);
    let checked = 0;
    for (const asset of ['rock-a', 'rock-b', 'rock-strata']) {
      each(asset, (x, y, z, sx, sy, sz) => {
        const s = solids.find((b) => Math.abs((b.min[0] + b.max[0]) / 2 - x) < 0.01 && Math.abs((b.min[2] + b.max[2]) / 2 - z) < 0.01 && Math.abs(b.min[1] - y) < 0.01);
        expect(s, `${asset} at ${x},${z}`).toBeDefined();
        // The model fills the unit box, scaled to the solid's own size: its height to the solid's.
        expect(sy).toBeCloseTo(s!.max[1] - s!.min[1], 3);
        expect(Math.max(sx, sz)).toBeGreaterThan(0);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('draws every plant that hides a player at least as far as a bot can see', () => {
    // Bots can't see through soft cover at any range; drawn shorter, a player would see an open field where a bot sees a bush.
    const hiding = plants.kinds.filter((k) => k.asset in SOFT_PLANTS || k.asset.endsWith('-crown'));
    expect(hiding.map((k) => k.asset).sort()).toEqual(expect.arrayContaining([...Object.keys(SOFT_PLANTS), 'broadleaf-crown', 'pine-crown'].sort()));
    for (const k of hiding) expect(k.far, k.asset).toBeGreaterThanOrEqual(BOT_SIGHT);
  });

  it('maps every model onto the foliage atlas', () => {
    expect(plants.atlas).toBe('textures/foliage.webp');
    expect(readFileSync(publicFile(plants.atlas)).subarray(8, 12).toString('ascii')).toBe('WEBP');
    const uvs = (asset: string) => {
      const node = kit.nodes.find((n) => n.name === asset)!;
      return kit.meshes[node.mesh!]!.primitives.every((p) => 'TEXCOORD_0' in p.attributes);
    };
    for (const k of plants.kinds) {
      for (const asset of [k.asset, k.lod].filter((a): a is string => !!a)) {
        // Leaf cards show a cell each; bark and rock sit on the white cell, which leaves their own colour.
        expect(uvs(asset), asset).toBe(true);
      }
    }
  });

  it('keeps soft cover off the spawns and out of solids', () => {
    const soft = map.soft!;
    expect(soft.length).toBeGreaterThan(10_000);
    for (const spawn of map.spawns.ffa) {
      const [x, , z] = spawn.position;
      expect(soft.filter((s) => s.top < s.bottom + 3 && Math.hypot(s.x - x, s.z - z) < 4).length, `${x},${z}`).toBe(0);
    }
    // Shrubs and grass (not a tree's canopy) never stand inside a solid.
    const low = soft.filter((s) => s.top - s.bottom < 3);
    const inside = low.filter((s) => map.solids.some((b) => s.x > b.min[0] && s.x < b.max[0] && s.z > b.min[2] && s.z < b.max[2] && b.max[1] > s.bottom + 0.3));
    expect(inside.slice(0, 5)).toEqual([]);
  });
});
