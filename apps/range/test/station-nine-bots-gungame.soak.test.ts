// Bots on their own for three minutes. One file per map and mode, so the slow soaks run in parallel.
import { describe, expect, it } from 'vitest';
import { botMap, soak } from './support/bots';
import { BOUNDARY, buildStationNine } from '../src/map/station-nine';

const station = botMap(buildStationNine(), BOUNDARY);

describe('Station Nine: bots on their own', () => {
  it("play three minutes of gun game with the map's 6 players: they climb the ladder of guns, each with the gun of their level", () => {
    const r = soak(station, 'gungame', 3);
    expect(r.players).toBe(6);
    expect(r.outside).toEqual([]);
    expect(r.longest, r.where).toBeLessThan(8);
    expect(r.wrongGun.slice(0, 5)).toEqual([]);
    expect(r.levelUps).toBeGreaterThanOrEqual(4);
  }, 240_000);
});
