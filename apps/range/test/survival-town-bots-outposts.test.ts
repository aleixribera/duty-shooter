// Bots on their own for three minutes. One file per map and mode, so the slow soaks run in parallel.
import { describe, expect, it } from 'vitest';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { botMap } from './support/bots';
import { BOUNDARY, buildSurvivalTown } from '../src/map/survival-town';

const town = botMap(buildSurvivalTown(), BOUNDARY);

describe('Survival Town: bots on their own', () => {
  it('play 3v3 Outposts to the end: both teams take zones, and zones change hands', () => {
    const m = createNetworkedMatch({ solids: town.solids, spawns: town.map.spawns.ffa, teamSpawns: town.map.spawns.teams!, zones: town.map.zones, mode: 'outposts', modes: { outposts: { scoreLimit: null, timeLimit: 240 } }, bots: { nav: town.nav, perTeam: 3, alwaysOn: true } });
    const captures: { team: number; previous: number }[] = [];
    let ended = false;
    for (let i = 0; i < 241 * 60 && !ended; i++) {
      m.step();
      for (const e of m.server.modeEvents) {
        if (e.type === 'capture') captures.push({ team: e.team, previous: e.previous });
        if (e.type === 'matchEnd') ended = true;
      }
    }
    expect(ended).toBe(true);
    expect(new Set(captures.map((c) => c.team)), JSON.stringify(captures)).toEqual(new Set([1, 2]));
    expect(captures.some((c) => c.previous !== 0), JSON.stringify(captures)).toBe(true);
  }, 180_000);
});
