import { describe, expect, it } from 'vitest';
import { Pings, STATS, box, buildNavGraph, createWorld, type BattleRoyaleState, type PingEvent, type PlayerOutput, type Vec3 } from '@duty-shooter/fps-core';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { parsePing, type PingWorld } from '../src/pings';
import { decodeClient } from '../src/net/protocol';
import { ticks } from './support/movement';

const P = STATS.ping;
const FLOOR = box({ min: [-300, -1, -300], max: [300, 0, 300], material: 'concrete' });
/** A wall across x = 20..21 hides whoever stands beyond it from someone at the origin. */
const WALL = box({ min: [20, 0, -30], max: [21, 5, 30], material: 'brick' });
const WORLD = createWorld([FLOOR, WALL]);

const seat = (id: string, team: number, at: Vec3, over: Partial<PlayerOutput> = {}): PlayerOutput =>
  ({ id, team, kind: 'player', alive: true, downed: null, position: at, yaw: 0, stance: 'stand', eyeHeight: 1.6, velocity: [0, 0, 0], ...over }) as unknown as PlayerOutput;

function world(players: PlayerOutput[], over: Partial<PingWorld> = {}): PingWorld {
  return { world: WORLD, players, objective: null, time: 10, enemies: (a, b) => a.team !== b.team, ...over };
}

describe('a ping', () => {
  const me = seat('me', 1, [0, 0, 0]);

  it('marks an enemy the pinger can see where they truly stand, for a few seconds', () => {
    const foe = seat('foe', 2, [0, 0, 40]);
    const ping = new Pings().request(me, { kind: 'enemy', at: [1, 0, 39], target: 'foe' }, world([me, foe]))!;
    expect(ping).toMatchObject({ type: 'ping', kind: 'enemy', player: 'me', team: 1, target: 'foe', position: [0, 0, 40] });
    expect(ping.until).toBeCloseTo(10 + P.enemyLife.value);
  });

  it('an enemy behind a wall, or a squadmate, is only a place marked "enemy here"', () => {
    const hidden = seat('foe', 2, [40, 0, 0]);
    const mate = seat('mate', 1, [0, 0, 30]);
    const pings = new Pings();
    expect(pings.request(me, { kind: 'enemy', at: [39, 0, 0], target: 'foe' }, world([me, hidden]))).toMatchObject({ kind: 'enemy', target: null, position: [39, 0, 0] });
    expect(pings.request(me, { kind: 'enemy', at: [0, 0, 30], target: 'mate' }, world([me, mate]))).toMatchObject({ kind: 'enemy', target: null });
  });

  it('a place stands longer; one out of reach is no ping', () => {
    const pings = new Pings();
    expect(pings.request(me, { kind: 'go', at: [100, 0, 0] }, world([me]))!.until).toBeCloseTo(10 + P.placeLife.value);
    expect(pings.request(me, { kind: 'go', at: [P.reach.value + 1, 0, 0] }, world([me]))).toBeNull();
  });

  it('marks a crate, a Card of its own Squad or a Beacon aimed at; aimed at nothing of the kind, it says "going here"', () => {
    const objective = {
      kind: 'battle-royale',
      drops: [{ stage: 2, position: [50, 0, 0], announce: 0, lands: 5 }],
      cards: [
        { owner: 'x', team: 1, position: [0, 0, 60], until: 99 },
        { owner: 'y', team: 2, position: [0, 0, -60], until: 99 },
      ],
      beacons: [{ position: [-50, 0, 0] }],
    } as unknown as BattleRoyaleState;
    const w = world([me], { objective });
    const pings = new Pings();
    expect(pings.request(me, { kind: 'drop', at: [51, 0.5, 1] }, w)).toMatchObject({ kind: 'drop', position: [50, 0, 0] });
    expect(pings.request(me, { kind: 'card', at: [1, 0, 59] }, w)).toMatchObject({ kind: 'card', position: [0, 0, 60] });
    expect(pings.request(me, { kind: 'beacon', at: [-49, 1, 0] }, w)).toMatchObject({ kind: 'beacon', position: [-50, 0, 0] });
    expect(new Pings().request(me, { kind: 'card', at: [0, 0, -60] }, w)).toMatchObject({ kind: 'go', position: [0, 0, -60] });
  });

  it('a seat has a few at once, then one every so often; the out of the fight have none', () => {
    const pings = new Pings();
    const at = (t: number) => world([me], { time: t });
    const sent = Array.from({ length: P.burst.value + 2 }, () => pings.request(me, { kind: 'go', at: [5, 0, 5] }, at(10)));
    expect(sent.filter(Boolean)).toHaveLength(P.burst.value);
    expect(pings.request(me, { kind: 'go', at: [5, 0, 5] }, at(10 + P.refill.value * 0.5))).toBeNull();
    expect(pings.request(me, { kind: 'go', at: [5, 0, 5] }, at(10 + P.refill.value + 0.01))).not.toBeNull();
    expect(new Pings().request(seat('out', 1, [0, 0, 0], { alive: false }), { kind: 'go', at: [5, 0, 5] }, at(10))).toBeNull();
  });

  it('comes off the wire only well formed', () => {
    expect(parsePing({ kind: 'go', at: [1, 2, 3] })).toEqual({ kind: 'go', at: [1, 2, 3] });
    expect(parsePing({ kind: 'nuke', at: [1, 2, 3] })).toBeNull();
    expect(parsePing({ kind: 'go', at: [1, 2] })).toBeNull();
    expect(parsePing({ kind: 'go', at: [1, Number.NaN, 3] })).toBeNull();
    expect(parsePing({ kind: 'enemy', at: [1, 2, 3], target: 7 })).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'ping', kind: 'help', at: [0, 1, 0] }))).toEqual({ t: 'ping', kind: 'help', at: [0, 1, 0] });
  });
});

describe('on the server', () => {
  const NAV = buildNavGraph(createWorld([FLOOR]), { area: [[-60, -60], [60, -60], [60, 60], [-60, 60]], spacing: 4 });

  it('goes to the pinger’s team only', () => {
    const spawns = [[0, 0], [10, 0], [0, 10], [10, 10]].map(([x, z]) => ({ position: [x, 0, z] as Vec3, yaw: 0 }));
    const m = createNetworkedMatch({ solids: [FLOOR], spawns, mode: 'tdm', bots: { nav: NAV, perTeam: 0, maxPerTeam: 0 }, latency: 0.03 });
    const cs = ['a', 'b', 'c', 'd'].map((n) => m.join(n));
    m.run(ticks(1));
    const team = (c: (typeof cs)[number]) => m.server.latest.players.find((p) => p.id === c.client.id)!.team;
    const pinger = cs[0]!;
    const mate = cs.find((c) => c !== pinger && team(c) === team(pinger))!;
    const foe = cs.find((c) => team(c) !== team(pinger))!;
    const from = m.server.latest.players.find((p) => p.id === pinger.client.id)!.position;
    pinger.client.mark({ kind: 'go', at: [from[0] + 20, 0, from[2]] });
    m.run(ticks(0.5));
    const heard = (c: (typeof cs)[number]) => c.frames.flatMap((f) => f.server).filter((e): e is PingEvent => e.type === 'ping');
    expect(heard(mate)).toHaveLength(1);
    expect(heard(mate)[0]).toMatchObject({ kind: 'go', player: pinger.client.id, team: team(pinger) });
    expect(heard(pinger)).toHaveLength(1);
    expect(heard(foe)).toEqual([]);
  });
});
