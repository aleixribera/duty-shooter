import { describe, expect, it } from 'vitest';
import { buildNavGraph, createWorld, type LobbyEvent, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, type NetworkedMatch, type NetworkedMatchOptions } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const SPAWNS: readonly SpawnPoint[] = [
  { position: [0, 0, 0], yaw: 0 },
  { position: [0, 0, -12], yaw: Math.PI },
  { position: [12, 0, -6], yaw: 0 },
  { position: [-12, 0, -6], yaw: 0 },
];
const nav = buildNavGraph(createWorld([FLOOR]), {
  area: [
    [-30, -30],
    [30, -30],
    [30, 30],
    [-30, 30],
  ],
});

function logged(options: Partial<NetworkedMatchOptions> = {}): { m: NetworkedMatch; log: LobbyEvent[] } {
  const log: LobbyEvent[] = [];
  const m = createNetworkedMatch({ solids: [FLOOR], spawns: SPAWNS, mode: 'ffa', map: 'survival-town', reconnectGrace: 0, onLog: (e) => log.push(e), ...options });
  return { m, log };
}

const settle = (m: NetworkedMatch) => m.run(ticks(0.5));

describe('the lobby event log', () => {
  it('records people and bots joining and leaving, each marked bot or not', () => {
    const { m, log } = logged({ bots: { nav, perTeam: 1 } });
    const alice = m.join('alice');
    settle(m);
    const aliceId = alice.client.id;
    expect(log.filter((e) => e.event === 'join')).toEqual([
      { event: 'join', id: aliceId, name: 'alice', bot: false, script: false },
      expect.objectContaining({ event: 'join', bot: true, script: false }),
    ]);
    alice.client.close();
    settle(m);
    expect(log.filter((e) => e.event === 'leave').map((e) => e.event === 'leave' && [e.name, e.bot])).toEqual([
      ['alice', false],
      [expect.any(String), true],
    ]);
  });

  it('marks smoke and load-test players, which join with the script marker', () => {
    const { m, log } = logged();
    m.join('smoke', { script: true });
    settle(m);
    expect(log.find((e) => e.event === 'join')).toMatchObject({ name: 'smoke', bot: false, script: true });
  });

  it('records each match starting and ending, with its map, mode, length and result', () => {
    const { m, log } = logged({ modes: { ffa: { timeLimit: 2 } }, intermission: { nuke: 0.5, vote: 0.5 } });
    m.join('alice');
    m.run(ticks(4));
    const starts = log.filter((e) => e.event === 'matchStart');
    const end = log.find((e) => e.event === 'matchEnd');
    expect(starts[0]).toEqual({ event: 'matchStart', map: 'survival-town', mode: 'ffa', hvb: false });
    expect(starts).toHaveLength(2);
    expect(end).toMatchObject({ event: 'matchEnd', map: 'survival-town', mode: 'ffa', hvb: false, result: { reason: 'timeLimit' } });
    expect(end?.event === 'matchEnd' && end.duration).toBeCloseTo(2, 1);
  });
});
