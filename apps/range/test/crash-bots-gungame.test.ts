import { describe, expect, it } from 'vitest';
import { botMap, soak } from './support/bots';
import { BOUNDARY, buildCrash } from '../src/map/crash';
const crash = botMap(buildCrash(),BOUNDARY);
describe('Crash: gungame bots',()=>{
  it('plays three minutes without leaving the map or getting stuck',()=>{
    const r=soak(crash,'gungame',3);
    expect(r.players).toBe(6); expect(r.outside).toEqual([]);
    expect(r.longest,r.where).toBeLessThan(8); expect(r.wrongGun.slice(0,5)).toEqual([]); expect(r.levelUps).toBeGreaterThanOrEqual(4);
  },240_000);
});
