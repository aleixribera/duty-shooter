import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { finishTable } from '@duty-shooter/fps-client/surfaces';
import { buildSurvivalTown } from '../src/map/survival-town';
import { readGlb, strayModels } from './support/glb';

const map = buildSurvivalTown();
const glb = readGlb(fileURLToPath(new URL('../public/models/survival-town.glb', import.meta.url)));

describe('Survival Town: models', () => {
  const models = map.models!;

  it('places models from the file: the four vehicles', () => {
    for (const asset of ['bus', 'van', 'pickup', 'wagon']) expect(models.placements.filter((p) => p.asset === asset), asset).toHaveLength(1);
    for (const p of models.placements) expect(glb.assets.has(p.asset), p.asset).toBe(true);
  });

  it("colours every part with one of the map's finishes", () => {
    const finishes = finishTable({ finishes: map.finishes, looks: [], decorations: [], indoor: [] });
    for (const [name, a] of glb.assets) for (const m of a.materials) expect(finishes[m], `${name}: ${m}`).toBeDefined();
  });

  it('keeps every vertex of every placed model within 5 cm of the solids it draws', () => {
    expect(strayModels(map, glb.assets)).toEqual([]);
  });

  it('draws no solid twice, and no decoration on a modelled solid', () => {
    const all = models.placements.flatMap((p) => p.solids);
    expect(new Set(all).size).toBe(all.length);
    const modelled = new Set(all);
    expect(map.decorations.filter((d) => modelled.has(d.solid))).toEqual([]);
  });
});
