import { describe, expect, it } from 'vitest';
import { PREPARATION, box, buildNavGraph, createWorld, type NavGraph, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { ticks } from './support/movement';

const GROUND = box({ min: [-300, -1, -300], max: [300, 0, 300], material: 'concrete' });
const NAV: NavGraph = buildNavGraph(createWorld([GROUND]), { area: [[-240, -240], [240, -240], [240, 240], [-240, 240]], spacing: 4 });
const SPAWNS: readonly SpawnPoint[] = [{ position: [0, 0, 0], yaw: 0 }];

/** A Battle Royale server with a lobby, opening with the full Preparation. */
function match(): NetworkedMatch {
  return createNetworkedMatch({
    solids: [GROUND],
    spawns: SPAWNS,
    mode: 'battle-royale',
    modes: { battleRoyale: { squadSize: 2, seed: 3 } },
    bots: { nav: NAV, perTeam: 3, maxPerTeam: 6 },
    intermission: { nuke: 1, vote: 1 },
    latency: 0.03,
    lobby: true,
    countdown: PREPARATION.seconds,
  });
}

function joined(m: NetworkedMatch, name: string, options: { script?: boolean } = {}): NetworkedClient {
  const c = m.join(name, options);
  for (let i = 0; i < ticks(3) && c.client.status !== 'joined'; i++) m.step();
  expect(c.client.status).toBe('joined');
  return c;
}

/** Alice (host) and Bob in the lobby, and the match started: the Preparation's first moments. */
function started() {
  const m = match();
  const alice = joined(m, 'alice');
  const bob = joined(m, 'bob');
  alice.client.startMatch();
  m.run(ticks(0.2));
  expect(m.server.phase).toBe('playing');
  return { m, alice, bob, start: m.server.matchStatus().preparation!.start };
}

const status = (m: NetworkedMatch) => m.server.matchStatus();
const left = (m: NetworkedMatch) => status(m).countdownEnds! - m.server.simulation.time;

describe('the Preparation', () => {
  it('opens a Battle Royale for its full length, with who is ready and who still loads', () => {
    const { m, alice } = started();
    expect(status(m).preparation).toMatchObject({ ready: [], people: 2, loading: 2 });
    expect(left(m)).toBeGreaterThan(PREPARATION.seconds - 0.5);
    alice.client.loaded();
    alice.client.ready();
    m.run(ticks(0.2));
    expect(status(m).preparation).toMatchObject({ ready: [alice.client.id], people: 2, loading: 1 });
  });

  it('ends early when everyone is ready, keeping the dive', () => {
    const { m, alice, bob } = started();
    for (const c of [alice, bob]) c.client.loaded();
    alice.client.ready();
    m.run(ticks(1));
    expect(left(m)).toBeGreaterThan(PREPARATION.dive + 1);
    bob.client.ready();
    m.run(ticks(0.2));
    expect(left(m)).toBeLessThanOrEqual(PREPARATION.dive);
    expect(left(m)).toBeGreaterThan(PREPARATION.dive - 0.5);
    m.run(ticks(PREPARATION.dive));
    expect(status(m).countdownEnds).toBeNull();
    expect(status(m).preparation).toBeNull();
  });

  it('holds the dive for a page still loading, then goes as soon as it has loaded', () => {
    const { m, alice, bob, start } = started();
    alice.client.loaded();
    alice.client.ready();
    bob.client.ready();
    m.run(ticks(PREPARATION.seconds - PREPARATION.dive + 1));
    expect(status(m).preparation?.loading).toBe(1);
    // Past the dive's moment and still preparing.
    expect(status(m).countdownEnds).toBeGreaterThan(start + PREPARATION.seconds);
    bob.client.loaded();
    m.run(ticks(0.2));
    expect(left(m)).toBeLessThanOrEqual(PREPARATION.dive);
  });

  it('waits only so long: a bot holds a slow page’s seat until it has loaded', () => {
    const { m, alice, bob } = started();
    alice.client.loaded();
    m.run(ticks(PREPARATION.seconds + PREPARATION.loadLimit + 0.5));
    expect(status(m).countdownEnds).toBeNull();
    const id = bob.client.id!;
    expect(m.server.bots.has(id)).toBe(true);
    expect(m.server.bots.has(alice.client.id!)).toBe(false);
    bob.client.loaded();
    m.run(ticks(0.2));
    expect(m.server.bots.has(id)).toBe(false);
    expect(m.server.latest.players.find((p) => p.id === id)?.alive).toBe(true);
  });

  it('counts a script as loaded, so a load test is never held', () => {
    const m = match();
    const alice = joined(m, 'alice', { script: true });
    alice.client.startMatch();
    m.run(ticks(0.2));
    expect(status(m).preparation).toMatchObject({ people: 1, loading: 0 });
    alice.client.ready();
    m.run(ticks(0.2));
    expect(left(m)).toBeLessThanOrEqual(PREPARATION.dive);
  });

  it('is a Battle Royale’s alone: other modes keep their countdown', () => {
    const m = createNetworkedMatch({ solids: [GROUND], spawns: SPAWNS, mode: 'ffa', countdown: 5, latency: 0.03 });
    joined(m, 'alice');
    m.run(ticks(0.5));
    expect(status(m).countdownEnds).not.toBeNull();
    expect(status(m).preparation).toBeNull();
  });
});
