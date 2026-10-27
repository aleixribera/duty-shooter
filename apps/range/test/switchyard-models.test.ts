import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INTERMISSION } from '@duty-shooter/fps-core';
import { finishTable } from '@duty-shooter/fps-client/surfaces';
import { BOUNDARY, MAIN_LINE, buildSwitchyard } from '../src/map/switchyard';
import { readGlb, strayModels } from './support/glb';

const map = buildSwitchyard();

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
    expect(strayModels(map, glb.assets)).toEqual([]);
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
