import { describe, expect, it } from 'vitest';
import type { Connection, SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd, type NetworkedClient, type NetworkedMatch, type NetworkedMatchOptions } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const DUEL: readonly SpawnPoint[] = [
  { position: [0, 0, 0], yaw: 0 },
  { position: [0, 0, -12], yaw: Math.PI },
];

function match(options: Partial<NetworkedMatchOptions> = {}): NetworkedMatch {
  return createNetworkedMatch({ solids: [FLOOR], spawns: DUEL, mode: 'ffa', latency: 0.03, ...options });
}

/** The line a client plays over: `cut` drops it, `silence` leaves it open and passing nothing, as a half-open socket does. */
class Line {
  live!: Connection;
  silent = false;
  /** Attempts refused until this many have failed. */
  refuse = 0;
  attempts = 0;

  constructor(private readonly open: () => Connection) {}

  connect = (): Connection => {
    this.attempts += 1;
    this.silent = false;
    const raw = this.open();
    const refused = this.refuse > 0;
    if (refused) this.refuse -= 1;
    this.live = raw;
    return {
      get open() {
        return raw.open;
      },
      send: (data) => {
        if (!this.silent || this.live !== raw) raw.send(data);
      },
      close: (reason) => raw.close(reason),
      onMessage: (handler) =>
        raw.onMessage((data) => {
          if (!this.silent || this.live !== raw) handler(data);
        }),
      onClose: (handler) => {
        raw.onClose(handler);
        if (refused) raw.close('connection refused');
      },
    };
  };

  cut(): void {
    this.live.close('network went away');
  }
}

function joinOver(m: NetworkedMatch, name: string): { c: NetworkedClient; line: Line } {
  const line = new Line(() => m.network.connect());
  const c = m.join(name, { connection: line.connect(), reconnect: line.connect });
  for (let i = 0; i < ticks(3) && (c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
  expect(c.client.status, `${name} joined`).toBe('joined');
  return { c, line };
}

/** Steps until `c` is back in its seat, and reports how many ticks that took (fails after `limit`). */
function until(m: NetworkedMatch, c: NetworkedClient, limit = ticks(10)): number {
  for (let i = 0; i < limit; i++) {
    m.step();
    if (c.client.status === 'joined' && c.client.snapshot?.self) return i + 1;
  }
  throw new Error(`still ${c.client.status} after ${limit} ticks`);
}

describe('coming back after a dropped connection', () => {
  it('takes its seat back on its own, as it was, within a moment', () => {
    const m = match();
    const { c, line } = joinOver(m, 'alice');
    const other = m.join('bob');
    m.run(ticks(0.5), () => ({ alice: usercmd({ forward: 1 }) }));
    const id = c.client.id;
    const position = m.server.latest.players.find((p) => p.id === id)!.position;

    line.cut();
    m.step();
    expect(c.client.status).toBe('reconnecting');
    // The player stays on screen, and the match with them.
    expect(c.latest?.self).not.toBeNull();
    expect(c.client.match).not.toBeNull();

    const took = until(m, c);

    expect(took, 'ticks to come back').toBeLessThan(ticks(0.5));
    expect(c.client.id).toBe(id);
    const back = m.server.latest.players.find((p) => p.id === id)!.position;
    expect(Math.hypot(back[0] - position[0], back[2] - position[2]), 'metres from where they left').toBeLessThan(0.3);
    expect(other.client.status).toBe('joined');
    expect(m.server.playerCount).toBe(2);
  });

  it('plays on after coming back: usercmds reach the server again, and its prediction agrees', () => {
    const m = match();
    const { c, line } = joinOver(m, 'alice');
    line.cut();
    until(m, c);
    const id = c.client.id;
    const before = m.server.latest.players.find((p) => p.id === id)!.position;

    m.run(ticks(1), () => ({ alice: usercmd({ forward: 1 }) }));
    m.run(ticks(0.3));

    const after = m.server.latest.players.find((p) => p.id === id)!.position;
    expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(2);
    const self = c.client.self!.position;
    expect(Math.hypot(self[0] - after[0], self[2] - after[2])).toBeLessThan(0.05);
  });

  it('notices a connection that has gone silent without closing, and leaves it for a new one', () => {
    const m = match();
    const { c, line } = joinOver(m, 'alice');
    const id = c.client.id;

    line.silent = true;
    let quiet = 0;
    while (c.client.status === 'joined' && quiet < ticks(5)) {
      m.step();
      quiet += 1;
    }
    expect(quiet, 'ticks of silence before noticing').toBeLessThan(ticks(3.5));

    until(m, c);
    expect(c.client.id).toBe(id);
    expect(m.server.playerCount).toBe(1);
  });

  it('keeps trying while the server is out of reach', () => {
    const m = match();
    const { c, line } = joinOver(m, 'alice');
    const id = c.client.id;
    line.refuse = 4;

    line.cut();
    until(m, c, ticks(20));

    expect(line.attempts).toBeGreaterThanOrEqual(5);
    expect(c.client.id).toBe(id);
  });

  it('survives the line going down again and again on a bad network', () => {
    const m = match({ latency: 0.08, jitter: 0.02, loss: 0.05, seed: 3 });
    const { c, line } = joinOver(m, 'alice');
    const id = c.client.id;
    for (let drop = 0; drop < 30; drop++) {
      line.cut();
      until(m, c);
      m.run(20, () => ({ alice: usercmd({ forward: 1 }) }));
      expect(c.client.status, `after drop ${drop}`).toBe('joined');
    }
    expect(c.client.id).toBe(id);
    expect(m.server.playerCount).toBe(1);
  });

  it('joins afresh when the seat was let go (a restarted server), in the same session', () => {
    const m = match({ reconnectGrace: 0 });
    const { c, line } = joinOver(m, 'alice');
    const first = c.client.id;

    line.cut();
    until(m, c);
    m.run(ticks(0.2));

    expect(c.client.id).not.toBe(first);
    expect(c.client.self?.id).toBe(c.client.id);
    expect(m.server.playerCount).toBe(1);
  });

  it('gives up in the end, and says why', () => {
    const m = match();
    const { c, line } = joinOver(m, 'alice');
    line.refuse = Infinity;

    line.cut();
    m.run(ticks(125));

    expect(c.client.status).toBe('closed');
    expect(c.client.closeReason).toBe('connection refused');
  });

  it('reports a server that is down quickly on a first join', () => {
    const m = match();
    const line = new Line(() => m.network.connect());
    line.refuse = Infinity;
    const c = m.join('alice', { connection: line.connect(), reconnect: line.connect });

    m.run(ticks(11));

    expect(c.client.status).toBe('closed');
    expect(c.client.id).toBeNull();
  });

  it('leaves the seat to a page that took it over', () => {
    const m = match();
    const { c } = joinOver(m, 'alice');
    const token = c.client.token!;

    const other = m.join('alice-again', { resume: token });
    m.run(ticks(1));

    expect(other.client.status).toBe('joined');
    expect(c.client.status).toBe('closed');
    expect(c.client.closeReason).toBe('replaced');
  });

  it('does not come back from leaving', () => {
    const m = match();
    const { c, line } = joinOver(m, 'alice');
    const attempts = line.attempts;

    c.client.close();
    m.run(ticks(2));

    expect(c.client.status).toBe('closed');
    expect(line.attempts).toBe(attempts);
  });
});
