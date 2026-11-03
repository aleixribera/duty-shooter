import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLANT_STRIDE } from '@duty-shooter/fps-client/surfaces';
import { buildMapById } from '../src/map/maps';
import { KIT_SOLIDS, PIECE_SOLIDS } from '../src/map/kit-solids';
import { SOFT_PLANTS } from '../src/map/zero-island-plants';

const map = buildMapById('zero-island');
const all = map.plants!;
/** The vegetation kit's own kinds; a Region's kit (ticket 17) has its test. */
const plants = { ...all, kinds: all.kinds.filter((k) => !k.url) };
/** Solids a Region's kit draws: its fitted boxes, a built piece's or a unit model's, for each instance. */
const kitSolids = all.kinds
  .filter((k) => k.url)
  .reduce((n, k) => n + (k.instances.length / PLANT_STRIDE) * (PIECE_SOLIDS[k.asset] ?? KIT_SOLIDS[k.asset] ?? [0]).length, 0);

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
    const coverRocksAndTrunks = map.solids.filter((s, i) => /^(cover|built)-/.test(map.looks[i]?.side ?? '') && plants.modelled.includes(i));
    expect(plants.modelled.length).toBeGreaterThan(5000);
    expect(coverRocksAndTrunks.length).toBe(plants.modelled.length);
    expect(new Set(plants.modelled).size).toBe(plants.modelled.length);
    // A rock or trunk is the boxes fitted inside its model (ticket 63; kit-solids.test.ts).
    let boxes = 0;
    for (const asset of ['rock-a', 'rock-b', 'rock-strata', 'pine-trunk', 'broadleaf-trunk']) each(asset, () => (boxes += KIT_SOLIDS[asset]!.length));
    expect(boxes + kitSolids).toBe(plants.modelled.length);
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
    // The solids by the 8 m squares their footprints touch; the few huge ones, checked against every shrub.
    const cells = new Map<number, (typeof map.solids)[number][]>();
    const huge: (typeof map.solids)[number][] = [];
    const key = (i: number, j: number) => (i + 1000) * 2000 + j + 1000;
    for (const b of map.solids) {
      if (b.max[0] - b.min[0] > 200 || b.max[2] - b.min[2] > 200) {
        huge.push(b);
        continue;
      }
      for (let i = Math.floor(b.min[0] / 8); i <= Math.floor(b.max[0] / 8); i++) {
        for (let j = Math.floor(b.min[2] / 8); j <= Math.floor(b.max[2] / 8); j++) cells.set(key(i, j), [...(cells.get(key(i, j)) ?? []), b]);
      }
    }
    const inside = low.filter((s) => [...(cells.get(key(Math.floor(s.x / 8), Math.floor(s.z / 8))) ?? []), ...huge].some((b) => s.x > b.min[0] && s.x < b.max[0] && s.z > b.min[2] && s.z < b.max[2] && b.max[1] > s.bottom + 0.3));
    expect(inside.slice(0, 5)).toEqual([]);
  });
});
