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
