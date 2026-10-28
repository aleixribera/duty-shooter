import { describe, expect, it } from 'vitest';
import { botMap, soak, chargeToEnd } from './support/bots';
import { BOUNDARY, buildCrash } from '../src/map/crash';
const crash = botMap(buildCrash(),BOUNDARY);
describe('Crash: Charge bots',()=>{
  it('plays three minutes within the map and finishes rounds',()=>{
    const r=soak(crash,'charge',4);
    expect(r.outside).toEqual([]); expect(r.longest,r.where).toBeLessThan(8); expect(r.rounds).toBeGreaterThanOrEqual(1);
  },240_000);
  it('plays to an end, with plants and wins for both attacking and defending sides',()=>{
    const {ended,plants,rounds}=chargeToEnd(crash);
    const log=JSON.stringify({plants,rounds});
    expect(ended,log).toBe(true); expect(plants,log).toBeGreaterThan(0);
    expect(rounds.some(r=>r.winner===r.attackers),log).toBe(true);
    expect(rounds.some(r=>r.winner!==r.attackers),log).toBe(true);
  },300_000);
});
