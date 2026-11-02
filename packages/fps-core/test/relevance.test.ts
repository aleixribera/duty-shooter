import { describe, expect, it } from 'vitest';
import { LOBBY_MODES, NET_PROFILES, PROTOCOL_VERSION, anglesOf, decodeServer, zoneCentre, type Connection, type NetProfile, type Snapshot, type SpawnPoint, type WireData } from '@duty-shooter/fps-core';
import { box, createNetworkedMatch, type NetworkedMatch, type NetworkedMatchOptions } from '@duty-shooter/fps-core/harness';
import type { WireSnapshot } from '../src/net/protocol';
import { usercmd } from '../src/usercmd';
import { ticks } from './support/movement';

const GROUND = box({ min: [-900, -1, -900], max: [900, 0, 900], material: 'concrete' });

/** A test's own distances, so tuning the real rows changes nothing here. */
const TIERED: NetProfile = { snapshotEvery: 2, relevance: { near: 30, mid: 120, midEvery: 6, hearing: 200, heardTicks: 120 } };

const at = (x: number, z = 0): SpawnPoint => ({ position: [x, 0, z], yaw: 0 });

function match(options: Partial<NetworkedMatchOptions> = {}): NetworkedMatch {
  return createNetworkedMatch({ solids: [GROUND], spawns: [at(0)], mode: 'ffa', latency: 0.01, passphrase: '', net: TIERED, ...options });
}

/** A client's connection with every snapshot it got kept, as sent. */
function tap(m: NetworkedMatch, frames: WireSnapshot[]): Connection {
  const raw = m.network.connect();
  return {
    send: (data) => raw.send(data),
    close: (reason) => raw.close(reason),
    get open() {
      return raw.open;
    },
    get reliable() {
      return raw.reliable === true;
    },
    onClose: (handler) => raw.onClose(handler),
    onMessage: (handler) =>
      raw.onMessage((data: WireData) => {
        const message = decodeServer(data);
        if (message?.t === 'snap') frames.push(message);
        handler(data);
      }),
  };
}

const dummies = (...xs: number[]) => xs.map((x, i) => ({ id: `d${i}`, team: 0, position: [x, 0, 0] as const, dummy: {} }));

describe('a mode that plays at full rate', () => {
  it.each(LOBBY_MODES)('%s keeps a snapshot a tick, with every seat in each', (mode) => {
    expect(NET_PROFILES[mode]).toEqual({ snapshotEvery: 1, relevance: null });
  });

  it('sends everyone to everyone, however far', () => {
    const m = match({ net: NET_PROFILES.ffa, dummies: dummies(10, 800) });
    const frames: WireSnapshot[] = [];
    m.join('alice', { connection: tap(m, frames) });
    m.run(ticks(1));
    const late = frames.slice(-30);
    expect(late.map((f) => f.tick)).toEqual(late.map((_, i) => (late[0] as WireSnapshot).tick + i));
    for (const frame of late) expect(frame.players.map((p) => p.id).sort()).toEqual(['d0', 'd1']);
  });
});

describe('relevance tiers', () => {
  const tiers = () => {
    const m = match({ dummies: dummies(10, 80, 500) });
    const frames: WireSnapshot[] = [];
    const alice = m.join('alice', { connection: tap(m, frames) });
    m.run(ticks(2));
    return { m, frames, alice };
  };

  it('sends at the rate the mode asks for', () => {
    const { frames } = tiers();
    const gaps = frames.slice(-30).map((f, i, all) => f.tick - (all[i - 1]?.tick ?? f.tick - 2));
    expect(new Set(gaps)).toEqual(new Set([2]));
  });

  it('sends a near seat in every snapshot', () => {
    const { frames } = tiers();
    for (const frame of frames.slice(-30)) expect(frame.players.map((p) => p.id)).toContain('d0');
  });

  it('sends a mid-range seat less often, naming it as held in between', () => {
    const { frames } = tiers();
    const late = frames.slice(-30);
    const sent = late.filter((f) => f.players.some((p) => p.id === 'd1'));
    expect(sent.map((f) => f.tick).map((t, i, all) => t - (all[i - 1] ?? t - 6))).toEqual(sent.map(() => 6));
    for (const frame of late.filter((f) => !sent.includes(f))) expect(frame.held).toContain('d1');
  });

  it('leaves out a seat out of reach altogether', () => {
    const { frames, alice } = tiers();
    for (const frame of frames) expect([...frame.players.map((p) => p.id), ...(frame.held ?? [])]).not.toContain('d2');
    expect(alice.client.others().map((p) => p.id)).not.toContain('d2');
  });

  it('keeps what is held on the client, so the snapshot and the view stay whole', () => {
    const { alice } = tiers();
    const held = alice.client.snapshot as Snapshot;
    expect(held.players.map((p) => p.id).sort()).toEqual(['d0', 'd1']);
    expect(alice.client.others().map((p) => p.id).sort()).toEqual(['d0', 'd1']);
  });

  it('a seat out of reach adds nothing to a snapshot', () => {
    const size = (net: NetProfile) => {
      const m = match({ net, dummies: dummies(500, 510, 520, 530, 540, 550, 560, 570) });
      const frames: WireSnapshot[] = [];
      m.join('alice', { connection: tap(m, frames) });
      m.run(ticks(2));
      return frames.at(-1)?.players.length;
    };
    expect(size(NET_PROFILES.ffa)).toBe(8);
    expect(size({ ...TIERED, snapshotEvery: 1 })).toBe(0);
  });
});

describe('seats that matter past the mid range', () => {
  it('a teammate stays on the client wherever they are', () => {
    const left = [at(0), at(0, 5), at(600), at(600, 5)];
    const m = match({ mode: 'tdm', spawns: left, teamSpawns: [[at(0), at(600)], [at(-400)]], maxPlayers: 4 });
    const clients = ['a', 'b', 'c', 'd'].map((name) => m.join(name));
    m.run(ticks(2));
    const players = (m.history.at(-1) as { players: readonly { id: string; team: number; position: readonly number[] }[] }).players;
    const pairs = clients.flatMap((c) => {
      const me = players.find((p) => p.id === c.client.id);
      const mate = players.find((p) => p.id !== me?.id && p.team === me?.team);
      return me && mate && Math.abs((me.position[0] as number) - (mate.position[0] as number)) > 120 ? [{ c, mate }] : [];
    });
    expect(pairs.length).toBeGreaterThan(0);
    for (const { c, mate } of pairs) expect(c.client.others().map((p) => p.id)).toContain(mate.id);
  });

  it('a seat firing within earshot comes into view, and its shot is heard', () => {
    const m = match({ spawns: [at(0), at(160)], spawnProtection: 0 });
    const frames: WireSnapshot[] = [];
    const alice = m.join('alice', { connection: tap(m, frames) });
    m.run(ticks(0.2));
    const bob = m.join('bob');
    m.run(ticks(1));
    const distance = () => {
      const [a, b] = (m.history.at(-1) as { players: readonly { position: readonly number[] }[] }).players;
      return Math.hypot((a?.position[0] as number) - (b?.position[0] as number), (a?.position[2] as number) - (b?.position[2] as number));
    };
    expect(distance()).toBeGreaterThan(120);
    expect(alice.client.others().map((p) => p.id)).not.toContain(bob.client.id);
    const before = frames.length;
    m.run(ticks(1.5), (tick) => ({ bob: usercmd({ pitch: -0.5, ...(tick % 20 === 0 ? { firePresses: [0.5] } : {}) }) }));
    const shots = frames.slice(before).flatMap((f) => f.events).filter((e) => e.event.type === 'shot');
    expect(shots.length).toBeGreaterThan(0);
    expect(alice.client.others().map((p) => p.id)).toContain(bob.client.id);
  });

  it('a fight out of earshot is not sent, but the kill feed still is', () => {
    const target = { id: 'target', team: 0, position: [600, 0, -6] as const, dummy: {} };
    const m = match({ spawns: [at(0), at(600)], spawnProtection: 0, dummies: [target] });
    const frames: WireSnapshot[] = [];
    m.join('alice', { connection: tap(m, frames) });
    m.run(ticks(0.2));
    const bob = m.join('bob');
    m.run(ticks(0.5));
    const before = frames.length;
    m.run(ticks(4), (tick) => ({ bob: usercmd({ pitch: -0.1, buttons: tick % 12 === 0 ? ['Fire'] : [] }) }));
    const bobs = m.history.flatMap((h) => h.events).filter((e) => e.type === 'kill');
    expect(bobs.map((e) => e.type === 'kill' && e.victim)).toContain('target');
    const heard = frames.slice(before).flatMap((f) => f.events).map((e) => e.event.type);
    expect(heard).toContain('kill');
    expect(heard).not.toContain('shot');
    expect(heard).not.toContain('hit');
    expect(bob.client.id).not.toBeNull();
  });

  it('tells you you were hit, however far the shot came from', () => {
    // Close enough for a bullet to carry, past everything this profile lets a viewer see or hear.
    const net: NetProfile = { snapshotEvery: 2, relevance: { near: 5, mid: 10, midEvery: 6, hearing: 20, heardTicks: 120 } };
    const m = match({ net, spawns: [at(0), at(0, -40)], spawnProtection: 0 });
    const frames: WireSnapshot[] = [];
    const alice = m.join('alice', { connection: tap(m, frames) });
    m.run(ticks(0.2));
    m.join('bob');
    m.run(ticks(0.5));
    const before = frames.length;
    m.run(ticks(4), (tick) => ({ bob: usercmd({ yaw: Math.PI, buttons: tick % 20 === 0 ? ['Ads', 'Fire'] : ['Ads'] }) }));
    const heard = frames.slice(before).flatMap((f) => f.events).map((e) => e.event);
    expect(heard.some((e) => e.type === 'hit' && e.victim === alice.client.id)).toBe(true);
    expect(heard.some((e) => e.type === 'shot')).toBe(false);
  });
});

describe('snapshots below a tick apiece', () => {
  it('go out spread over the ticks between them, each client at its rate', () => {
    const m = match({ net: { snapshotEvery: 3, relevance: null }, spawns: [at(0), at(5), at(10), at(15), at(20), at(25)] });
    const frames: WireSnapshot[][] = [[], [], [], [], [], []];
    frames.forEach((own, i) => m.join(`p${i}`, { connection: tap(m, own) }));
    m.run(ticks(1));
    const from = Math.max(...frames.flat().map((f) => f.tick));
    m.run(ticks(1));
    const sent = frames.flatMap((own) => own.map((f) => f.tick)).filter((tick) => tick > from);
    const perTick = new Map<number, number>();
    for (const tick of sent) perTick.set(tick, (perTick.get(tick) ?? 0) + 1);
    expect(Math.max(...perTick.values())).toBe(2);
    for (const own of frames) {
      const mine = own.map((f) => f.tick).filter((tick) => tick > from);
      expect(mine.slice(1).map((tick, i) => tick - mine[i]!).every((gap) => gap === 3)).toBe(true);
    }
  });
});

describe('drawing a seat that comes at a lower rate', () => {
  const walking = (options: Partial<NetworkedMatchOptions> = {}) => {
    const m = match({ spawns: [at(0), at(60)], spawnProtection: 0, ...options });
    const alice = m.join('alice');
    m.run(ticks(0.2));
    const bob = m.join('bob');
    m.run(ticks(1));
    return { m, alice, bob };
  };

  it('moves it smoothly, between the two samples around the moment drawn', () => {
    const { m, alice, bob } = walking();
    const seen: number[] = [];
    m.run(ticks(2), () => ({ bob: usercmd({ forward: 1 }) }));
    for (let i = 0; i < ticks(1); i++) {
      m.run(1, () => ({ bob: usercmd({ forward: 1 }) }));
      const drawn = alice.client.others().find((p) => p.id === bob.client.id);
      expect(drawn).toBeDefined();
      seen.push((drawn as { position: readonly number[] }).position[2] as number);
    }
    const steps = seen.map((z, i) => Math.abs(z - (seen[i - 1] ?? z))).slice(1);
    const speed = (Math.abs((seen.at(-1) as number) - (seen[0] as number)) / (seen.length - 1)) as number;
    expect(speed).toBeGreaterThan(0.05);
    // Held still and then jumping a whole gap would show as a step of six.
    expect(Math.max(...steps)).toBeLessThan(speed * 2);
  });

  it('holds everyone that much further in the past, within what the server can rewind', () => {
    const { m, alice } = walking();
    m.run(ticks(2), () => ({ bob: usercmd({ forward: 1 }) }));
    const behind = m.history.length - alice.client.renderTick;
    expect(behind).toBeGreaterThanOrEqual(TIERED.relevance!.midEvery);
    expect(behind).toBeLessThan(18);
  });

  /** Alice taps at Bob's upper torso as her screen shows him, while he walks across her view. */
  const crossingFight = (net: NetProfile) => {
    const { m, alice, bob } = walking({ net, spawns: [at(0), at(40)] });
    let aim = { yaw: 0, pitch: 0 };
    const crossing = usercmd({ yaw: -Math.PI / 2, right: 1 });
    const shoot = (tick: number) => {
      const me = alice.client.self;
      const seen = alice.client.others().find((p) => p.id === bob.client.id);
      if (!me || !seen) return { bob: crossing };
      const centre = zoneCentre(seen, 'upperTorso');
      const want = anglesOf([centre[0] - me.position[0], centre[1] - me.position[1] - me.eyeHeight, centre[2] - me.position[2]]);
      // Her own recoil is on top of the view she asks for, as it is for a player pulling down.
      aim = { yaw: want.yaw - (me.yaw - aim.yaw), pitch: want.pitch - (me.pitch - aim.pitch) };
      return { bob: crossing, alice: usercmd({ ...aim, buttons: tick % 40 === 0 && seen.alive ? ['Ads', 'Fire'] : ['Ads'] }) };
    };
    m.run(ticks(1), shoot);
    const from = m.history.length;
    m.run(ticks(8), shoot);
    const events = m.history.slice(from).flatMap((h) => h.events);
    return {
      behind: m.history.length - alice.client.renderTick,
      shots: events.filter((e) => e.type === 'shot' && e.shooter === alice.client.id),
      hits: events.flatMap((e) => (e.type === 'hit' && e.victim === bob.client.id ? [e.zone] : [])),
    };
  };

  it('a shot at where the seat is drawn lands, through lag compensation, just as at full rate', () => {
    const tiered = crossingFight(TIERED);
    const full = crossingFight(NET_PROFILES.ffa);
    // Bob stays in the mid range throughout, so she is drawing him from the slow updates.
    expect(tiered.behind).toBeGreaterThanOrEqual(TIERED.relevance!.midEvery);
    expect(tiered.behind).toBeGreaterThan(full.behind);
    expect(tiered.shots.length).toBeGreaterThan(5);
    expect(tiered.hits.length).toBe(tiered.shots.length);
    expect(tiered.hits).toEqual(full.hits);
  });
});

describe('a link that cannot keep up', () => {
  it('falls back below the mode\'s rate, and comes back to it but no faster', () => {
    const m = match({ dummies: dummies(10) });
    const frames: WireSnapshot[] = [];
    const c = tap(m, frames);
    c.onMessage(() => undefined);
    c.send(JSON.stringify({ t: 'join', name: 'slow', passphrase: '', protocol: PROTOCOL_VERSION }));
    m.run(ticks(0.5));
    let seq = 0;
    const report = (seen: number) => c.send(JSON.stringify({ t: 'cmds', cmds: [{ seq: ++seq, cmd: usercmd() }], seen }));
    const gap = () => {
      const late = frames.slice(-4);
      return ((late.at(-1) as WireSnapshot).tick - (late[0] as WireSnapshot).tick) / (late.length - 1);
    };
    // Up to date: the floor is learned.
    for (let i = 0; i < ticks(1); i++) {
      report(frames.at(-1)?.tick ?? 0);
      m.step();
    }
    expect(gap()).toBe(2);
    // The newest snapshot it has falls a second behind.
    for (let i = 0; i < ticks(3); i++) {
      report((frames.at(-1)?.tick ?? 0) - 60);
      m.step();
    }
    expect(gap()).toBeGreaterThan(2);
    for (let i = 0; i < ticks(40); i++) {
      report(frames.at(-1)?.tick ?? 0);
      m.step();
    }
    expect(gap()).toBe(2);
  });
});

describe('coming back', () => {
  it('a reconnected client gets everything in reach again at once', () => {
    const m = match({ dummies: dummies(10, 80) });
    const alice = m.join('alice');
    m.run(ticks(1));
    const token = alice.client.token as string;
    alice.client.close();
    m.run(ticks(0.5));
    const back = m.join('alice', { resume: token });
    m.run(ticks(0.5));
    expect(back.client.others().map((p) => p.id).sort()).toEqual(['d0', 'd1']);
  });
});
