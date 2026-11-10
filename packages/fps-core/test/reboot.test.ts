import { describe, expect, it } from 'vitest';
import { STATS, Simulation, SquadPlanner, TICK_SECONDS, buildNavGraph, createWorld, type BattleRoyaleState, type ModeContext, type NavGraph, type PlayerOutput, type SimEvent, type SpawnPoint, type Vec3 } from '@duty-shooter/fps-core';
import { BattleRoyale, planBeacons, playGround, type ModeActions, type SquadSize } from '@duty-shooter/fps-core/modes';
import { box, createNetworkedMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { Button } from '../src/usercmd';
import { ticks } from './support/movement';

const GROUND = box({ min: [-300, -1, -300], max: [300, 0, 300], material: 'concrete' });
const WORLD = createWorld([GROUND]);
const NAV: NavGraph = buildNavGraph(WORLD, { area: [[-240, -240], [240, -240], [240, 240], [-240, 240]], spacing: 4 });
const SPAWNS: readonly SpawnPoint[] = [{ position: [0, 0, 0], yaw: 0 }];
const R = STATS.royale.reboot;
const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const kill = (victim: string): SimEvent => ({ type: 'kill', killer: null, victim, cause: 'bullet', zone: null, weapon: 'm4a1' }) as SimEvent;

/** The mode alone, with seats that stand where told, hold use when told, and come back where `act` puts them. */
function royale(size: SquadSize = 2, people: string[] = []) {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const mode = new BattleRoyale({ squadSize: size, seed: 5 });
  const where = new Map<string, Vec3>(ids.map((id, i) => [id, [i * 50 - 120, 0, 0]]));
  const alive = new Map(ids.map((id) => [id, true]));
  const downed = new Set<string>();
  const using = new Set<string>();
  const back: { id: string; position: Vec3; health?: number; frags?: number }[] = [];
  let team = new Map<string, number>();
  let time = 0;
  const act: ModeActions = {
    give: () => null,
    primary: () => null,
    respawn: (id, position, _yaw, options) => {
      back.push({ id, position, ...options });
      alive.set(id, true);
      where.set(id, position);
    },
  };
  const ctx = (): ModeContext => ({
    tick: 0,
    time,
    matchTime: time,
    players: ids.map((id) => ({ id, team: team.get(id), alive: alive.get(id), downed: downed.has(id) ? {} : null, kind: 'player', position: where.get(id), loadout: { primary: 'm4a1' } }) as unknown as PlayerOutput),
    spawns: SPAWNS,
    teamSpawns: null,
    world: WORLD,
    zones: [],
    sites: [],
    using,
    ground: playGround(NAV, WORLD),
    people: new Set(people),
    act,
  });
  team = new Map(mode.start(ids.map((id) => ({ id, name: id, team: null })), ctx()));
  const events: string[] = [];
  const step = (seconds: number, sim: SimEvent[] = []) => {
    for (let t = 0; t < seconds - 1e-9; t += TICK_SECONDS) {
      time += TICK_SECONDS;
      const c = ctx();
      for (const e of mode.onEvents(t === 0 ? sim : [], c)) {
        if (e.type === 'card') events.push(`card ${e.action} ${e.owner}${e.player ? ` ${e.player}` : ''}`);
        if (e.type === 'reboot') events.push(`reboot ${e.action} ${e.player} ${e.seats.join(',')}`);
      }
      mode.result(c);
    }
  };
  /** Takes `id` out: a kill event, and the seat is gone. */
  const out = (id: string) => {
    alive.set(id, false);
    step(TICK_SECONDS, [kill(id)]);
  };
  const state = () => mode.objective() as BattleRoyaleState;
  return { mode, team, where, alive, downed, using, back, events, step, out, state, ctx, at: () => time };
}

describe('the Beacons', () => {
  it('stand spread over the open land, the same every match', () => {
    const ground = playGround(NAV, WORLD);
    const beacons = planBeacons(ground);
    expect(beacons).toHaveLength(R.beacons.value);
    expect(planBeacons(ground)).toEqual(beacons);
    // Spread: no two within a fifth of the land's width of each other.
    for (const [i, a] of beacons.entries()) for (const b of beacons.slice(i + 1)) expect(flat(a, b)).toBeGreaterThan(480 / 5);
  });

  it('are told only while Reboot is open: Duos and Trios, not Solos', () => {
    expect(royale(2).state().reboot).toBe(true);
    expect(royale(2).state().beacons).toHaveLength(R.beacons.value);
    expect(royale(1).state().reboot).toBeUndefined();
    expect(royale(1).state().beacons).toBeUndefined();
  });
});

describe('a Reboot', () => {
  it('a seat out drops its Card where it fell; a squadmate walking over it carries it; holding use at a Beacon for the channel brings it back there, with half health and a frag', () => {
    const r = royale();
    const mate = [...r.team].find(([id, t]) => id !== 'p1' && t === r.team.get('p1'))![0];
    const fell = r.where.get('p1')!;
    r.out('p1');
    expect(r.state().cards).toEqual([{ owner: 'p1', team: r.team.get('p1'), position: fell, until: r.at() + R.cardTime.value }]);
    r.where.set(mate, [fell[0] + 1, 0, fell[2]]);
    r.step(TICK_SECONDS);
    expect(r.state().cards).toEqual([{ owner: 'p1', team: r.team.get('p1'), carrier: mate }]);
    const beacon = r.state().beacons![3]!.position;
    r.where.set(mate, [beacon[0] + 1, 0, beacon[2]]);
    r.using.add(mate);
    r.step(R.channel.value - 0.5);
    expect(r.state().beacons![3]!.channel?.by).toBe(mate);
    expect(r.back).toEqual([]);
    r.step(1);
    expect(r.back).toHaveLength(1);
    expect(r.back[0]).toMatchObject({ id: 'p1', health: R.health.value, frags: R.frags.value });
    expect(flat(r.back[0]!.position, beacon)).toBeLessThan(2);
    expect(r.state().cards).toBeUndefined();
    // The Beacon rests.
    expect(r.state().beacons![3]!.ready).toBeCloseTo(r.at() + R.cooldown.value, 0);
    expect(r.events).toEqual(['card drop p1', `card take p1 ${mate}`, `reboot start ${mate} p1`, `reboot done ${mate} p1`]);
    // The points table: a Reboot pays whoever did it 150.
    expect(r.mode.scores().find((s) => s.id === mate)).toMatchObject({ score: STATS.score.reboot.value, kills: 0 });
    expect(STATS.score.reboot.value).toBe(150);
  });

  it('breaks off when use is let go, and a resting Beacon starts none', () => {
    const r = royale();
    const mate = [...r.team].find(([id, t]) => id !== 'p1' && t === r.team.get('p1'))![0];
    r.out('p1');
    r.where.set(mate, r.where.get('p1')!);
    r.step(TICK_SECONDS);
    const beacon = r.state().beacons![0]!.position;
    r.where.set(mate, beacon);
    r.using.add(mate);
    r.step(3);
    r.using.delete(mate);
    r.step(TICK_SECONDS);
    expect(r.events.slice(-2)).toEqual([`reboot start ${mate} p1`, `reboot stop ${mate} p1`]);
    expect(r.state().beacons![0]!.channel).toBeUndefined();
    expect(r.back).toEqual([]);
  });

  it('a Card lies for its time, then is gone', () => {
    const r = royale();
    r.out('p1');
    r.step(R.cardTime.value - 1);
    expect(r.state().cards).toHaveLength(1);
    r.step(1.1);
    expect(r.state().cards).toBeUndefined();
    expect(r.events.at(-1)).toBe('card expire p1');
  });

  it('a carrier that goes out drops the Cards it carried, beside its own', () => {
    const r = royale(3);
    const squad = [...r.team].filter(([, t]) => t === r.team.get('p1')).map(([id]) => id);
    const [, carrier, last] = squad as [string, string, string];
    r.out('p1');
    r.where.set(carrier, r.where.get('p1')!);
    r.step(TICK_SECONDS);
    r.where.set(carrier, [10, 0, 10]);
    r.out(carrier);
    expect(r.state().cards?.map((c) => [c.owner, c.position])).toEqual([
      ['p1', [10, 0, 10]],
      [carrier, [10, 0, 10]],
    ]);
    expect(r.alive.get(last)).toBe(true);
  });

  it('a Squad with nobody on its feet has no Cards, and the Squad is out', () => {
    const r = royale();
    const mate = [...r.team].find(([id, t]) => id !== 'p1' && t === r.team.get('p1'))![0];
    r.out('p1');
    r.downed.add(mate);
    r.step(TICK_SECONDS);
    expect(r.state().cards).toBeUndefined();
    expect(r.events.at(-1)).toBe('card void p1');
  });

  it('closes once the last Stages begin: the Cards are void and the Beacons gone', () => {
    const r = royale();
    const ring = r.mode.ring;
    const last = ring[ring.length - R.lastStages.value]!;
    r.step(last.start - r.at() - 5);
    r.out('p1');
    r.step(6);
    expect(r.state().reboot).toBeUndefined();
    expect(r.state().beacons).toBeUndefined();
    expect(r.state().cards).toBeUndefined();
    expect(r.events.at(-1)).toBe('card void p1');
  });

  it('a person out with a Card still lying keeps the match going; once it is gone, no person is left', () => {
    const r = royale(2, ['p1']);
    r.out('p1');
    r.step(1);
    expect(r.mode.result(r.ctx())).toBeNull();
    r.step(R.cardTime.value);
    expect(r.mode.result(r.ctx())?.reason).toBe('noHumans');
  });

  it('a person brought back by a Reboot is in it on the tick they come back', () => {
    const r = royale(2, ['p1']);
    const mate = [...r.team].find(([id, t]) => id !== 'p1' && t === r.team.get('p1'))![0];
    r.out('p1');
    r.where.set(mate, r.where.get('p1')!);
    r.step(TICK_SECONDS);
    r.where.set(mate, r.state().beacons![0]!.position);
    r.using.add(mate);
    // Each tick looks at the seats before the mode brings anyone back, as the server does.
    r.step(R.channel.value + 0.2);
    expect(r.back.map((b) => b.id)).toEqual(['p1']);
    expect(r.mode.result(r.ctx())).toBeNull();
  });
});

describe('bots and Reboot', () => {
  const ring = (state: BattleRoyaleState) => state;
  it('the nearest bot on its feet goes over a Card of its Squad, and a bot carrying one holds use at the nearest ready Beacon', () => {
    const r = royale();
    const mate = [...r.team].find(([id, t]) => id !== 'p1' && t === r.team.get('p1'))![0];
    const fell = r.where.get('p1')!;
    r.out('p1');
    const planner = new SquadPlanner((x, z) => [x, 0, z], 1);
    const seats = () =>
      [...r.team]
        .filter(([id]) => r.alive.get(id))
        .map(([id, team]) => ({ id, team, position: r.where.get(id)!, bot: true, downed: null }));
    const order = planner.plan({ time: r.at(), state: ring(r.state()), seats: seats() }).get(mate)!;
    expect(order.rally).toEqual(fell);
    expect(order.use).toEqual(fell);
    r.where.set(mate, fell);
    r.step(TICK_SECONDS);
    const carrying = planner.plan({ time: r.at(), state: r.state(), seats: seats() }).get(mate)!;
    // The nearest of those inside the next circle, where the Ring won't take the Reboot.
    const next = r.state().next;
    const inside = r.state().beacons!.map((b) => b.position).filter((b) => Math.hypot(b[0] - next.x, b[2] - next.z) <= next.radius);
    const nearest = [...inside].sort((a, b) => flat(a, fell) - flat(b, fell))[0]!;
    expect(carrying.use).toEqual(nearest);
    expect(carrying.rally).toEqual(nearest);
  });
});

describe('the simulation', () => {
  it('brings a seat back with the health and frags it is told', () => {
    const sim = new Simulation(WORLD);
    sim.addPlayer({ id: 'a', team: 1, position: [0, 0, 0], yaw: 0, loadout: { primary: 'm4a1', secondary: 'pistol', grenade: 'frag' } });
    sim.respawn('a', [5, 0, 5], 0, undefined, { health: 50, frags: 1 });
    const a = sim.output().players.find((p) => p.id === 'a')!;
    expect(a.health).toBe(50);
    expect(a.grenades).toBe(1);
  });
});

describe('on the server', () => {
  it('a Duo: one goes out, the other walks over the Card and holds use at a Beacon, and the first is back there with half health and the loadout it dropped in with', () => {
    const m = createNetworkedMatch({
      solids: [GROUND],
      spawns: SPAWNS,
      mode: 'battle-royale',
      modes: { battleRoyale: { squadSize: 2, seed: 3, timeLimit: 600 } },
      bots: { nav: NAV, perTeam: 0, maxPerTeam: 0 },
      countdown: 0.1,
      latency: 0.03,
      lobby: true,
    });
    const a = m.join('alice');
    const b = m.join('bob');
    m.run(ticks(0.5));
    a.client.setLobby({ squads: 2 });
    m.run(ticks(0.2));
    a.client.startMatch();
    m.run(ticks(0.5));
    for (const c of [a, b]) {
      c.client.loaded();
      c.client.ready();
    }
    const sim = m.server.simulation;
    for (let i = 0; i < ticks(90) && !(m.server.phase === 'playing' && sim.playerState(a.client.id!)?.health && sim.playerState(b.client.id!)?.health); i++) m.step();
    m.run(ticks(1));
    const [ida, idb] = [a.client.id!, b.client.id!];
    const objective = () => m.server.matchStatus().objective as BattleRoyaleState;
    expect(sim.playerState(ida)!.team).toBe(sim.playerState(idb)!.team);
    const dropped = sim.playerState(idb)!.loadout.primary;
    // Bob bleeds out.
    sim.setPlayerState({ ...sim.playerState(idb)!, health: 40, downed: { since: sim.time - STATS.royale.bleedOut.value + 0.1, by: null, revive: null } } as never);
    m.run(ticks(0.5));
    const card = objective().cards?.find((c) => c.owner === idb);
    expect(card?.position).toBeDefined();
    // Out, Bob picks another gun: it waits for the next match.
    const other = dropped === 'shotgun' ? 'smg' : 'shotgun';
    b.client.setLoadout({ primary: other, secondary: 'pistol', grenade: 'frag' });
    m.run(ticks(0.2));
    sim.respawn(ida, card!.position!, 0);
    m.run(ticks(0.3));
    expect(objective().cards?.[0]?.carrier).toBe(ida);
    const beacon = objective().beacons![0]!.position;
    sim.respawn(ida, [beacon[0] + 1.5, beacon[1], beacon[2]], 0);
    m.run(ticks(R.channel.value + 0.5), () => ({ alice: usercmd({ buttons: Button.Use }) }));
    const back = m.server.latest.players.find((p) => p.id === idb)!;
    expect(back.alive).toBe(true);
    expect(back.health).toBe(R.health.value);
    expect(back.loadout.primary).toBe(dropped);
    expect(Math.hypot(back.position[0] - beacon[0], back.position[2] - beacon[2])).toBeLessThan(2.5);
    expect(objective().cards).toBeUndefined();
    m.run(ticks(0.5));
    expect(b.client.self?.alive).toBe(true);
  });
});
