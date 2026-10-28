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
});
