import { describe, expect, it } from 'vitest';
import { botMap, soak } from './support/bots';
import { BOUNDARY, buildCrash } from '../src/map/crash';
const crash = botMap(buildCrash(),BOUNDARY);
describe('Crash: ffa bots',()=>{
  it('plays three minutes without leaving the map or getting stuck',()=>{
    const r=soak(crash,'ffa',3);
    expect(r.players).toBe(6); expect(r.outside).toEqual([]);
    expect(r.longest,r.where).toBeLessThan(8); expect(r.m.server.mode.scores().filter(s => s.kills > 0).length).toBeGreaterThanOrEqual(5);
  },240_000);
});
