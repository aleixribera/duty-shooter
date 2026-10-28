import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { finishTable } from '@duty-shooter/fps-client/surfaces';
import { buildRange } from '../src/map/maps';
import { readGlb, strayModels } from './support/glb';

const map = buildRange();

const glb = readGlb(fileURLToPath(new URL('../public/models/range.glb', import.meta.url)));

describe('Practice Range: models', () => {
  const models = map.models!;

  it('models the props: the benches, the boards, the signs, the loadout rack and the mannequin', () => {
    const count = (prefix: string) => models.placements.filter((p) => p.asset.startsWith(prefix)).length;
    expect(count('bench-')).toBe(5);
    expect(count('distance-board')).toBe(5);
    expect(count('target-board')).toBe(4);
    expect(count('sign-')).toBe(3);
    expect(count('signpost')).toBe(1);
    expect(count('loadout-rack')).toBe(1);
    expect(count('mannequin-stand')).toBe(1);
  });

  it('places every model in the file, by a name the loader keeps (three.js turns dots into underscores)', () => {
    const placed = new Set(models.placements.map((p) => p.asset));
    for (const p of models.placements) expect(glb.assets.has(p.asset), p.asset).toBe(true);
    for (const name of glb.assets.keys()) {
      expect(placed.has(name), name).toBe(true);
      expect(name).toMatch(/^[\w-]+$/);
    }
  });

  it("colours every part with one of the map's finishes", () => {
    const finishes = finishTable({ finishes: map.finishes, looks: [], decorations: [], indoor: [] });
    for (const [name, a] of glb.assets) for (const m of a.materials) expect(finishes[m], `${name}: ${m}`).toBeDefined();
  });

  it('keeps every vertex of every placed model within 5 cm of the solids it draws', () => {
    expect(strayModels(map, glb.assets)).toEqual([]);
  });

  it('draws no solid twice, and leaves the knocked-off head a prop of its own', () => {
    const all = models.placements.flatMap((p) => p.solids);
    expect(new Set(all).size).toBe(all.length);
    for (const i of all) expect(map.solids[i]!.prop).toBeFalsy();
  });
});
