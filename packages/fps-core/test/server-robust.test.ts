import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type Connection, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, type NetworkedMatch, type NetworkedMatchOptions } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const DUEL: readonly SpawnPoint[] = [
  { position: [0, 0, 0], yaw: 0 },
  { position: [0, 0, -12], yaw: Math.PI },
];

function match(options: Partial<NetworkedMatchOptions> = {}): NetworkedMatch {
  return createNetworkedMatch({ solids: [FLOOR], spawns: DUEL, mode: 'ffa', latency: 0.01, passphrase: '', ...options });
}

const encode = JSON.stringify;
const join = (name: string, protocol = PROTOCOL_VERSION) => encode({ t: 'join', name, passphrase: '', protocol });
const run = (m: NetworkedMatch, seconds: number) => {
  for (let i = 0; i < ticks(seconds); i++) m.step();
};
const closeReason = (c: Connection) => {
  const seen: { reason: string | null } = { reason: null };
  c.onClose((reason) => (seen.reason = reason));
  return seen;
};

describe('input delay', () => {
  it('runs off usercmds left queued by a burst, so input stops waiting behind them', () => {
    const m = match();
    const c = m.network.connect();
    let ack = 0;
    let newest = 0;
    c.onMessage((data) => {
      const message = JSON.parse(data) as { t: string; ack?: number };
      if (message.t === 'snap') ack = message.ack ?? 0;
    });
    c.send(join('burst'));
    run(m, 0.2);
    const send = () => {
      newest += 1;
      c.send(encode({ t: 'cmds', cmds: [{ seq: newest, cmd: { buttons: 0, forward: 0, right: 0, yaw: 0, pitch: 0, firePresses: [] } }] }));
    };
    // A hiccup leaves three waiting; from then on one arrives each tick.
    send();
    send();
    send();
    for (let i = 0; i < ticks(5); i++) {
      send();
      m.step();
    }
    // One latency each way (0.6 ticks here) rounds up to two ticks; anything more is the queue.
    expect(newest - ack).toBeLessThanOrEqual(2);
  });
});

interface RawSnap {
  t: string;
  tick: number;
  events: { tick: number; index: number; event: { type: string } }[];
  names?: Record<string, string>;
  scores?: unknown[];
  match?: unknown;
}

/** A connection that keeps every snapshot it gets, joined and sending `cmds` by hand. */
function raw(m: NetworkedMatch, name: string) {
  const c = m.network.connect();
  const snaps: RawSnap[] = [];
  c.onMessage((data) => {
    const message = JSON.parse(data) as RawSnap;
    if (message.t === 'snap') snaps.push(message);
  });
  c.send(join(name));
  return { c, snaps };
}

describe('snapshots on a reliable connection', () => {
  it('carries what rarely changes only when it changes, and a client still sees all of it', () => {
    const m = match();
    const { snaps } = raw(m, 'watcher');
    run(m, 0.3);
    const first = snaps[0] as RawSnap;
    expect(first.names).toBeDefined();
    expect(first.match).toBeDefined();
    const rest = snaps.slice(1);
    expect(rest.length).toBeGreaterThan(5);
    expect(rest.every((snap) => snap.names === undefined && snap.scores === undefined)).toBe(true);

    const seat = m.join('second');
    run(m, 0.3);
    expect(snaps.at(-1)?.names).toBeUndefined();
    expect(snaps.some((snap) => Object.values(snap.names ?? {}).includes('second'))).toBe(true);
    expect(Object.values(seat.client.names).sort()).toEqual(['second', 'watcher']);
    expect(seat.client.scores).toHaveLength(2);
  });

  it('repeats everything on a connection that can lose a snapshot', () => {
    const m = match({ loss: 0.001 });
    const { snaps } = raw(m, 'watcher');
    run(m, 0.3);
    expect(snaps.length).toBeGreaterThan(5);
    expect(snaps.every((snap) => snap.names !== undefined && snap.scores !== undefined)).toBe(true);
  });
});

describe('a link that falls behind', () => {
  const report = (c: Connection, seq: number, seen: number) => c.send(encode({ t: 'cmds', cmds: [{ seq, cmd: { buttons: 0, forward: 0, right: 0, yaw: 0, pitch: 0, firePresses: [] } }], seen }));

  /** Steps the match with the client reporting the snapshot from `behind` ticks ago, returning how many it was sent. */
  function play(m: NetworkedMatch, link: { c: Connection; snaps: RawSnap[] }, seconds: number, behind: number, from: { seq: number }): number {
    const before = link.snaps.length;
    for (let i = 0; i < ticks(seconds); i++) {
      from.seq += 1;
      const newest = link.snaps.at(-1)?.tick ?? 0;
      report(link.c, from.seq, Math.max(0, newest - behind));
      m.step();
    }
    return link.snaps.length - before;
  }

  it('is sent fewer snapshots while its queue is full, every event among them, then more once it clears', () => {
    const m = match();
    const link = raw(m, 'slow');
    const other = m.join('shooter');
    const from = { seq: 0 };
    expect(play(m, link, 2, 0, from)).toBeGreaterThan(110);
    expect(play(m, link, 5, 30, from)).toBeLessThan(5 * 25);
    const all = link.snaps.flatMap((snap) => snap.events.map((e) => `${e.tick}:${e.index}`));
    expect(new Set(all).size).toBe(all.length);
    let last = 0;
    for (let i = 0; i < 30 && last < 40; i++) last = play(m, link, 1, 0, from);
    expect(last).toBeGreaterThan(40);
    expect(other.client.status).toBe('joined');
  });
});

describe('a server that keeps going', () => {
  it('takes nothing more from a connection it rejected, so no ghost joins the match', () => {
    const m = match();
    const c = m.network.connect();
    c.send(join('old', -1));
    c.send(join('ghost'));
    run(m, 0.5);
    expect(m.server.playerCount).toBe(0);
    expect(m.server.latest.players).toEqual([]);
  });

  it('takes nothing more from a connection it closed, in the same burst', () => {
    const m = match();
    const c = m.network.connect();
    c.send(join('flood'));
    run(m, 0.2);
    for (let i = 0; i < 3000; i++) c.send(encode({ t: 'loadout', loadout: { primary: 'smg' } as never }));
    expect(() => run(m, 0.5)).not.toThrow();
    expect(m.server.playerCount).toBe(0);
  });

  it('lets go of a socket that never joins', () => {
    const m = match();
    const c = m.network.connect();
    const seen = closeReason(c);
    run(m, 9);
    expect(seen.reason).toBe(null);
    run(m, 2);
    expect(seen.reason).toBe('join timeout');
  });

  it('survives the backlog a stalled link delivers at once', () => {
    const m = match();
    const c = m.network.connect();
    const seen = closeReason(c);
    c.send(join('stalled'));
    run(m, 0.2);
    // Three seconds of frames, arriving together.
    for (let seq = 1; seq <= 180; seq++) c.send(encode({ t: 'cmds', cmds: [{ seq, cmd: { buttons: 0, forward: 0, right: 0, yaw: 0, pitch: 0, firePresses: [] } }] }));
    run(m, 0.2);
    expect(seen.reason).toBe(null);
    expect(m.server.playerCount).toBe(1);
  });

  it('still drops a client that floods', () => {
    const m = match();
    const c = m.network.connect();
    const seen = closeReason(c);
    c.send(join('flood'));
    run(m, 0.2);
    for (let i = 0; i < 5000; i++) c.send(encode({ t: 'vote', mode: 'ffa' }));
    run(m, 0.2);
    expect(seen.reason).toBe('rate limit');
  });

  it('gives a seat up at once when its player leaves on purpose, and holds it for a drop', () => {
    const m = match();
    const leaver = m.join('leaver');
    const line = m.network.connect();
    m.join('dropped', { connection: line });
    run(m, 0.5);
    leaver.client.close();
    run(m, 0.2);
    expect(m.server.status().away).toBe(0);
    expect(m.server.playerCount).toBe(1);
    line.close('network went away');
    run(m, 0.2);
    expect(m.server.status().away).toBe(1);
  });
});
