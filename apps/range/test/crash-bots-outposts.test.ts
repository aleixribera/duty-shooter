import { describe, expect, it } from 'vitest';
import { botMap, soak } from './support/bots';
import { BOUNDARY, buildCrash } from '../src/map/crash';
const crash = botMap(buildCrash(),BOUNDARY);
describe('Crash: outposts bots',()=>{
  it('plays three minutes without leaving the map or getting stuck',()=>{
    const r=soak(crash,'outposts',4);
    expect(r.players).toBe(8); expect(r.outside).toEqual([]);
    expect(r.longest,r.where).toBeLessThan(8); expect(r.captures).toEqual(new Set([1,2]));
  },240_000);
});
