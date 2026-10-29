import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { finishTable } from '@duty-shooter/fps-client/surfaces';
import { buildCrash } from '../src/map/crash';
import { readGlb, strayModels } from './support/glb';

const map = buildCrash();
const glb = readGlb(fileURLToPath(new URL('../public/models/crash.glb', import.meta.url)));
describe('Crash wreck model', () => {
  it('places the Blender asset and supplies each material finish', () => {
    for (const placement of map.models!.placements) expect(glb.assets.has(placement.asset)).toBe(true);
    const finishes = finishTable({ finishes:map.finishes, looks:[], decorations:[], indoor:[] });
    for (const [name, asset] of glb.assets) for (const material of asset.materials) expect(finishes[material], name + ': ' + material).toBeDefined();
  });
  it('matches the placed collision within five centimetres', () => {
    expect(strayModels(map, glb.assets)).toEqual([]);
  });
  it('keeps non-colliding impact fragments low to the street', () => {
    const fragments = map.models!.placements.filter(p => p.asset.startsWith('impact-scatter-'));
    expect(fragments).toHaveLength(6);
    for (const p of fragments) {
      expect(p.visualOnly && p.solids.length === 0).toBe(true);
      const heights = glb.assets.get(p.asset)!.vertices.map(v => v[1]);
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...heights)).toBeLessThanOrEqual(0.111);
    }
    const cracks = map.models!.placements.find(p => p.asset === 'impact-cracks')!;
    expect(cracks.visualOnly && cracks.solids.length === 0).toBe(true);
    expect(Math.max(...glb.assets.get(cracks.asset)!.vertices.map(v => v[1]))).toBeLessThan(0.013);
  });
});
