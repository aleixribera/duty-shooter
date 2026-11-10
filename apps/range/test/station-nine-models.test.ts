import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { finishTable } from '@duty-shooter/fps-client/surfaces';
import { buildStationNine } from '../src/map/station-nine';
import { readGlb, strayModels } from './support/glb';

const map = buildStationNine();

const glb = readGlb(fileURLToPath(new URL('../public/models/station-nine.glb', import.meta.url)));

describe('Station Nine: models', () => {
  const models = map.models!;
  const count = (prefix: string) => models.placements.filter((p) => p.asset.startsWith(prefix)).length;

  it('models the camera towers, their housings, sirens and ladders, and the ladder up each side of the bunker', () => {
    expect(count('camera-tower')).toBe(2);
    expect(count('camera-housing')).toBe(2);
    expect(count('siren-post')).toBe(2);
    expect(count('ladder-')).toBe(map.ladders!.length);
  });

  it('models the station\'s props: reels, piers, sandbags, racks, the console, shields, drums, crates, containers, generators, tanks, trailers, huts and lamps', () => {
    expect(count('cable-reel')).toBe(7);
    expect(count('instrument-pier')).toBe(6);
    expect(count('sandbags-')).toBe(9);
    expect(count('instrument-racks')).toBe(2);
    expect(count('recorder-console')).toBe(1);
    expect(count('blast-shield')).toBe(2);
    expect(count('drums-4')).toBe(4);
    expect(count('crate-')).toBeGreaterThanOrEqual(14);
    expect(count('container-')).toBe(8);
    expect(count('generator')).toBe(2);
    expect(count('fuel-tank')).toBe(2);
    expect(count('instrument-trailer')).toBe(2);
    expect(count('instrument-hut')).toBe(6);
    expect(count('lamp-cage')).toBe(4);
  });

  it('stands the shot tower, the cable line and the other stations beyond the barrier, touching nothing', () => {
    for (const asset of ['shot-tower', 'cable-pole', 'far-bunker']) {
      const placed = models.placements.filter((p) => p.asset === asset);
      expect(placed.length, asset).toBeGreaterThan(0);
      for (const p of placed) expect(p.solids, asset).toEqual([]);
    }
  });

  it('finds every placed model in the file, and places every model in the file, by a name the loader keeps', () => {
    for (const p of models.placements) expect(glb.assets.has(p.asset), p.asset).toBe(true);
    const placed = new Set(models.placements.map((p) => p.asset));
    for (const name of glb.assets.keys()) {
      expect(placed.has(name), name).toBe(true);
      expect(name).toMatch(/^[\w-]+$/);
    }
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
