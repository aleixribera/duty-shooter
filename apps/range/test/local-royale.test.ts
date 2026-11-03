import { describe, expect, it } from 'vitest';
import { GameClient, TICK_SECONDS, WIDE_SCALE, connectPort, createMemoryNetwork, createWorld, encodeLargeNav, usercmd, type MatchResult, type ModeEvent } from '@duty-shooter/fps-core';
import type { SquadSize } from '@duty-shooter/fps-core/modes';
import { LocalRoyale, TickClock, serveLocalRoyale } from '../src/local-royale';
import { island } from './support/royale';

const { map, solids, nav } = island();

/** You, alone with the bots, the way the page plays a Local bots Battle Royale: host, Squad size, Start, loaded, Ready. */
function play(size: SquadSize) {
  const network = createMemoryNetwork();
  const local = new LocalRoyale(network.server, nav, { seed: size });
  const client = new GameClient({ connection: network.connect(), world: createWorld(solids, { terrain: map.terrain }), name: 'Ada', passphrase: '', mode: 'battle-royale' });
  const step = () => {
    network.advance(TICK_SECONDS);
    local.tick();
    return client.tick(usercmd());
  };
  for (let i = 0; i < 60 && client.match?.phase !== 'lobby'; i++) step();
  expect(client.match?.phase).toBe('lobby');
  client.setLobby({ squads: size });
  for (let i = 0; i < 10; i++) step();
  client.startMatch();
  return { local, client, step };
}

describe('Local bots: the Battle Royale server as the worker runs it (ticket 15)', () => {
  it.each([1, 3] as const)('plays Squads of %i to the end: 59 bots, the Preparation, a Ring that closes, and your place when you go out', (size) => {
    const { local, client, step } = play(size);
    let prepared = false;
    let result: MatchResult | null = null;
    let seats = 0;
    const events: ModeEvent[] = [];
    for (let tick = 0; tick < 12 * 60 * 60 && !result; tick++) {
      const frame = step();
      const match = client.match;
      if (match?.preparation) {
        prepared = true;
        client.loaded();
        client.ready();
      }
      seats = Math.max(seats, client.scores.length);
      for (const e of frame.server) if (e.type === 'matchEnd') result = e as MatchResult;
      events.push(...(frame.server.filter((e) => e.type === 'stage') as ModeEvent[]));
    }
    expect(prepared).toBe(true);
    expect(seats).toBe(WIDE_SCALE.seats);
    expect(local.server.bots.size + 1).toBeLessThanOrEqual(WIDE_SCALE.seats);
    // A person standing still is soon out, and a Battle Royale with no person left ends there (No humans left), placing you.
    expect(['lastSquad', 'noHumans']).toContain(result!.reason);
    if (result!.reason === 'lastSquad') expect(events.length).toBeGreaterThanOrEqual(2);
    expect(client.scores.find((s) => s.id === client.id)?.place).toBeGreaterThanOrEqual(1);
    // Back in the lobby afterwards, with the same host, for the next match.
    for (let i = 0; i < 60 * 40 && client.match?.phase !== 'lobby'; i++) step();
    expect(client.match?.phase).toBe('lobby');
  }, 900_000);
});

describe('the worker’s clock', () => {
  it('runs one tick per 1/60 s of wall time, catches up a short stall and drops a long one', () => {
    const clock = new TickClock(0);
    expect(clock.due(0)).toBe(0);
    expect(clock.due(1000 / 60 + 0.1)).toBe(1);
    expect(clock.due(1000)).toBe(TickClock.catchUp);
    // The rest of the stall is let go: the next tick is due a tick from now.
    expect(clock.due(1000 + 1)).toBe(0);
    expect(clock.due(1000 + 1000 / 60 + 0.1)).toBe(1);
    let ran = 0;
    for (let t = 1020; t < 2020; t += 4) ran += clock.due(t);
    expect(ran).toBeGreaterThanOrEqual(59);
    expect(ran).toBeLessThanOrEqual(61);
  });
});

describe('the worker’s entry', () => {
  it('builds the island from the nav it is sent, says it is ready, and lets the page join its lobby over the port', async () => {
    const { port1, port2 } = new MessageChannel();
    const from: unknown[] = [];
    port2.addEventListener('message', (e) => from.push(e.data));
    const stop = serveLocalRoyale(port1);
    port2.start();
    port2.postMessage({ t: 'start', nav: encodeLargeNav(nav) });
    for (let i = 0; i < 400 && !from.some((m) => (m as { t?: string }).t === 'ready'); i++) await new Promise((done) => setTimeout(done, 50));
    expect(from).toContainEqual({ t: 'ready' });
    const client = new GameClient({ connection: connectPort(port2), world: createWorld(solids, { terrain: map.terrain }), name: 'Ada', passphrase: '', mode: 'battle-royale' });
    for (let i = 0; i < 200 && client.match?.phase !== 'lobby'; i++) {
      await new Promise((done) => setTimeout(done, 16));
      client.tick(usercmd());
    }
    expect(client.status).toBe('joined');
    expect(client.match).toMatchObject({ phase: 'lobby', mode: 'battle-royale' });
    stop();
    port1.close();
  }, 120_000);
});
