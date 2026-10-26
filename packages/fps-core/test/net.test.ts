import { describe, expect, it } from 'vitest';
import { STATS, anglesOf, zoneCentre, type ModeEvent, type PlayerOutput, type SimEvent, type SpawnPoint, type UserCmd } from '@duty-shooter/fps-core';
import { PROTOCOL_VERSION } from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

/** The spec's networked conditions: 80 ms latency with jitter and 5% loss. */
const BAD_NETWORK = { latency: 0.08, jitter: 0.02, loss: 0.05, seed: 7 } as const;

const LANE: readonly SpawnPoint[] = [
  { position: [0, 0, 0], yaw: 0 },
  { position: [0, 0, -20], yaw: Math.PI },
];

function match(options: Partial<Parameters<typeof createNetworkedMatch>[0]> = {}): NetworkedMatch {
  return createNetworkedMatch({ boxes: [FLOOR], spawns: LANE, ...BAD_NETWORK, ...options });
}

/** Steps until every named client has joined (or fails after 3 s). */
function joinAll(m: NetworkedMatch, ...names: string[]): NetworkedClient[] {
  const clients = names.map((n) => m.join(n));
  for (let i = 0; i < ticks(3) && clients.some((c) => c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
  for (const c of clients) expect(c.client.status, `${c.name} joined`).toBe('joined');
  return clients;
}

function serverPlayer(m: NetworkedMatch, id: string | null): PlayerOutput {
  const p = m.server.latest.players.find((x) => x.id === id);
  if (!p) throw new Error(`server has no ${id}`);
  return p;
}

function serverEvents(m: NetworkedMatch, from = 0): SimEvent[] {
  return m.history.slice(from).flatMap((o) => [...o.events]);
}

function clientEvents(c: NetworkedClient): (SimEvent | ModeEvent)[] {
  return c.frames.flatMap((f) => [...f.server]);
}

/**
 * The usercmd that aims the client's view at `zone` on `target` as the client
 * currently draws it (interpolated), cancelling the recoil and flinch offset
 * the client predicts on its own view.
 */
function aimAtSeen(c: NetworkedClient, target: string, zone: 'upperTorso' | 'head', last: { yaw: number; pitch: number }) {
  const me = c.client.self!;
  const seen = c.client.others().find((p) => p.id === target)!;
  const eye: [number, number, number] = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
  const centre = zoneCentre(seen, zone);
  const want = anglesOf([centre[0] - eye[0], centre[1] - eye[1], centre[2] - eye[2]]);
  return { yaw: want.yaw - (me.yaw - last.yaw), pitch: want.pitch - (me.pitch - last.pitch) };
}

describe('joining', () => {
  it('accepts a join with the right passphrase', () => {
    const m = match();
    const [a] = joinAll(m, 'alice');

    expect(m.server.playerCount).toBe(1);
    expect(a!.client.id).toBeTruthy();
    expect(serverPlayer(m, a!.client.id).position).toEqual([0, 0, 0]);
  });

  it('rejects a wrong passphrase before accepting any game messages', () => {
    const m = match();
    const bad = m.join('mallory', { passphrase: 'wrong' });

    m.run(ticks(2));

    expect(bad.client.status).toBe('rejected');
    expect(bad.client.rejectReason).toBe('passphrase');
    expect(m.server.playerCount).toBe(0);
    expect(m.server.latest.players).toHaveLength(0);
  });

  it('drops a connection that sends game messages before joining', () => {
    const m = createNetworkedMatch({ boxes: [FLOOR], spawns: LANE });
    const raw = m.network.connect();
    let closed = '';
    raw.onClose((reason) => (closed = reason));
    raw.send(JSON.stringify({ t: 'cmds', cmds: [{ seq: 1, cmd: usercmd({ forward: 1 }) }] }));
    raw.send(JSON.stringify({ t: 'join', name: 'late', passphrase: 'letmein', protocol: PROTOCOL_VERSION }));

    m.run(10);

    expect(closed).toBe('join first');
    expect(m.server.playerCount).toBe(0);
  });

  it('enforces the player cap', () => {
    const m = match({ maxPlayers: 2, loss: 0 });
    joinAll(m, 'a', 'b');
    const third = m.join('c');

    m.run(ticks(2));

    expect(third.client.status).toBe('rejected');
    expect(third.client.rejectReason).toBe('full');
    expect(m.server.playerCount).toBe(2);
  });

  it('defaults the cap to 8 players', () => {
    const m = match({ loss: 0, spawns: Array.from({ length: 9 }, (_, i) => ({ position: [i * 3, 0, 0] as const, yaw: 0 })) });
    joinAll(m, ...Array.from({ length: 8 }, (_, i) => `p${i}`));
    const ninth = m.join('ninth');

    m.run(ticks(2));

    expect(ninth.client.rejectReason).toBe('full');
  });
});

describe('client prediction', () => {
  /** A busy movement and weapon script. */
  const busy = (t: number): UserCmd =>
    usercmd({
      forward: t % 120 < 80 ? 1 : -0.5,
      right: Math.sin(t / 25),
      yaw: t * 0.01,
      pitch: Math.sin(t / 40) * 0.2,
      buttons: [
        ...(t % 200 < 100 ? (['Sprint'] as const) : []),
        ...(t % 90 === 0 ? (['Jump'] as const) : []),
        ...(t % 300 > 250 ? (['Crouch'] as const) : []),
        ...(t % 70 > 50 ? (['Fire'] as const) : []),
      ],
    });

  it('responds to input instantly: the predicted player moves on the first tick of input', () => {
    const m = match();
    const [a] = joinAll(m, 'alice');
    const before = a!.client.self!.position;

    m.step({ alice: usercmd({ forward: 1 }) });

    expect(a!.client.self!.position[2]).toBeLessThan(before[2]);
    expect(serverPlayer(m, a!.client.id).position).toEqual(before);
  });

  it('matches the server state once reconciled, under latency, jitter and loss', () => {
    const m = match();
    const [a] = joinAll(m, 'alice');

    m.run(ticks(6), (t) => ({ alice: busy(t) }));
    m.run(ticks(1), () => ({ alice: usercmd({ yaw: 6 * 60 * 0.01 }) }));

    const server = serverPlayer(m, a!.client.id);
    const client = a!.client.self!;
    expect(client.position[0]).toBeCloseTo(server.position[0], 9);
    expect(client.position[1]).toBeCloseTo(server.position[1], 9);
    expect(client.position[2]).toBeCloseTo(server.position[2], 9);
    expect(client.weapon.ammo).toBe(server.weapon.ammo);
    expect(client.stance).toBe(server.stance);
  });

  it('needs no visible correction when the network only delays packets', () => {
    const m = match({ loss: 0, jitter: 0.03 });
    joinAll(m, 'alice');
    let worst = 0;

    m.run(ticks(5), (t) => {
      worst = Math.max(worst, Math.hypot(...m.client('alice').client.correction));
      return { alice: busy(t) };
    });

    expect(worst).toBeLessThan(1e-6);
  });
});

describe('other players', () => {
  it('are drawn smoothly: interpolated positions never jump more than their speed allows', () => {
    const m = match();
    const [a] = joinAll(m, 'alice', 'bob');
    let prev: PlayerOutput | undefined;
    let worstStep = 0;
    const steps: number[] = [];

    m.run(ticks(4), (t) => {
      const seen = a!.client.others().find((p) => p.kind === 'player');
      if (prev && seen) {
        const step = Math.hypot(seen.position[0] - prev.position[0], seen.position[2] - prev.position[2]);
        steps.push(step);
        worstStep = Math.max(worstStep, step);
      }
      prev = seen;
      return { bob: usercmd({ right: t % 60 < 30 ? 1 : -1, forward: 1, buttons: ['Sprint'] }) };
    });

    // Bob sprints at most at sprint speed. The odd tick the server ran dry of his
    // usercmds can show as a double step, but never a teleport, and almost every
    // drawn step matches his real speed.
    const perTick = STATS.movement.sprintSpeed.value / 60;
    expect(worstStep).toBeLessThan(perTick * 2.2);
    expect(steps.filter((s) => s > perTick * 1.2).length / steps.length).toBeLessThan(0.02);
    expect(worstStep).toBeGreaterThan(0);
  });
});

describe('lag compensation', () => {
  /** Alice taps single shots at strafing Bob's upper torso as her screen shows him; returns hits and shots. */
  function duel(network: { latency: number; jitter: number; loss: number; seed: number }) {
    const m = match(network);
    const [alice, bob] = joinAll(m, 'alice', 'bob');
    let aim = { yaw: 0, pitch: 0 };
    const start = m.history.length;
    let taps = 0;
    m.run(ticks(6), (t) => {
      aim = aimAtSeen(alice!, bob!.client.id!, 'upperTorso', aim);
      const tap = t % 20 === 0 && t - start > 60;
      if (tap) taps++;
      return {
        alice: usercmd({ ...aim, buttons: tap ? ['Ads', 'Fire'] : ['Ads'] }),
        bob: usercmd({ yaw: Math.PI, right: Math.floor(t / 45) % 2 === 0 ? 1 : -1 }),
      };
    });
    const hits = serverEvents(m, start).filter((e) => e.type === 'hit' && e.shooter === alice!.client.id && e.victim === bob!.client.id);
    const shots = serverEvents(m, start).filter((e) => e.type === 'shot' && e.shooter === alice!.client.id);
    return { hits, shots, taps, bob: bob!, m };
  }

  it('registers a shot at a strafing target where the shooter saw it', () => {
    const { hits, shots } = duel(BAD_NETWORK);

    expect(shots.length).toBeGreaterThan(10);
    // Bob dies and respawns along the way; every shot that left the barrel while he was alive should land.
    expect(hits.length / shots.length).toBeGreaterThan(0.9);
    expect(hits.every((h) => h.type === 'hit' && h.zone === 'upperTorso')).toBe(true);
  });

  it('rejects hits from further back than the lag-compensation window', () => {
    const { hits, shots } = duel({ ...BAD_NETWORK, latency: 0.25 });

    expect(shots.length).toBeGreaterThan(10);
    expect(hits.length / shots.length).toBeLessThan(0.3);
  });
});

describe('free-for-all', () => {
  const SPREAD: readonly SpawnPoint[] = [
    { position: [0, 0, 0], yaw: 0 },
    { position: [0, 0, -20], yaw: Math.PI },
    { position: [-30, 0, -30], yaw: Math.PI },
  ];

  it('scores kills and deaths, announces them in the kill feed and respawns the victim at the spawn furthest from enemies', () => {
    const m = match({ spawns: SPREAD });
    const [alice] = joinAll(m, 'alice');
    const [bob] = joinAll(m, 'bob');
    const bobId = bob!.client.id!;
    expect(serverPlayer(m, bobId).position).toEqual([-30, 0, -30]);
    // Bob walks sideways, so his respawn is visibly elsewhere and out of Alice's line of fire.
    m.run(ticks(1), () => ({ bob: usercmd({ yaw: -Math.PI / 2, forward: 1 }) }));
    let aim = { yaw: 0, pitch: 0 };

    let killedAt = -1;
    for (let i = 0; i < ticks(5) && killedAt < 0; i++) {
      aim = aimAtSeen(alice!, bobId, 'upperTorso', aim);
      const out = m.step({ alice: usercmd({ ...aim, buttons: ['Ads', 'Fire'] }), bob: usercmd({ yaw: -Math.PI / 2 }) });
      if (out.events.some((e) => e.type === 'kill')) killedAt = out.tick;
    }
    expect(killedAt).toBeGreaterThan(0);
    m.run(ticks(0.5));

    const scores = m.server.mode.scores();
    expect(scores.find((s) => s.name === 'alice')).toMatchObject({ kills: 1, deaths: 0 });
    expect(scores.find((s) => s.name === 'bob')).toMatchObject({ kills: 0, deaths: 1 });
    const feed = clientEvents(alice!).filter((e) => e.type === 'killFeed');
    expect(feed).toEqual([expect.objectContaining({ killerName: 'alice', victimName: 'bob', cause: 'bullet' })]);
    expect(clientEvents(bob!).some((e) => e.type === 'killFeed')).toBe(true);
    // Instant respawn, full health, at the spawn furthest from Alice.
    const respawned = serverPlayer(m, bobId);
    expect(respawned).toMatchObject({ alive: true, health: STATS.health.max.value, position: [-30, 0, -30] });
    expect(alice!.client.scores.find((s) => s.name === 'alice')?.kills).toBe(1);
  });

  it('tells a client which way its spawn and each respawn face, once, so its next usercmd can look that way', () => {
    const m = match({ spawns: SPREAD, loss: 0 });
    const [alice] = joinAll(m, 'alice');
    const [bob] = joinAll(m, 'bob');
    const bobId = bob!.client.id!;
    expect(bob!.client.takeSpawn()).toEqual({ yaw: Math.PI, pitch: 0 });
    expect(bob!.client.takeSpawn()).toBeNull();

    // Bob looks away and is shot dead; the server respawns him facing the spawn's way.
    m.run(ticks(1), () => ({ bob: usercmd({ yaw: -Math.PI / 2 }) }));
    let aim = { yaw: 0, pitch: 0 };
    let killed = false;
    for (let i = 0; i < ticks(5) && !killed; i++) {
      aim = aimAtSeen(alice!, bobId, 'upperTorso', aim);
      const out = m.step({ alice: usercmd({ ...aim, buttons: ['Ads', 'Fire'] }), bob: usercmd({ yaw: -Math.PI / 2 }) });
      killed = out.events.some((e) => e.type === 'kill');
    }
    expect(killed).toBe(true);
    m.run(ticks(0.5), () => ({ bob: usercmd({ yaw: -Math.PI / 2 }) }));

    expect(bob!.client.takeSpawn()).toEqual({ yaw: Math.PI, pitch: 0 });
    expect(bob!.client.takeSpawn()).toBeNull();
  });

  it('rotates through the spawns when nobody else is alive, so a lone player does not always land in the same place', () => {
    const m = match({ spawns: SPREAD, loss: 0 });
    const seen: string[] = [];
    for (const name of ['alice', 'bob', 'carol']) {
      const [c] = joinAll(m, name);
      seen.push(JSON.stringify(serverPlayer(m, c!.client.id).position));
      c!.client.close();
      m.run(ticks(0.5));
    }

    expect(new Set(seen).size).toBe(3);
  });

  it('gives every player their own team', () => {
    const m = match({ loss: 0 });
    const clients = joinAll(m, 'a', 'b');

    const teams = clients.map((c) => serverPlayer(m, c.client.id).team);
    expect(new Set(teams).size).toBe(2);
  });
});

describe('networked determinism', () => {
  it('replays a networked match with a fixed seed to exactly the same outputs', () => {
    const play = () => {
      const m = match();
      joinAll(m, 'alice', 'bob');
      m.run(ticks(4), (t) => ({
        alice: usercmd({ forward: 1, yaw: t * 0.02, buttons: t % 30 < 10 ? ['Fire'] : ['Sprint'] }),
        bob: usercmd({ right: Math.sin(t / 10), yaw: Math.PI, buttons: t % 50 === 0 ? ['Jump'] : [] }),
      }));
      return { server: m.history, alice: m.client('alice').frames, bob: m.client('bob').frames };
    };

    expect(play()).toEqual(play());
  });
});
