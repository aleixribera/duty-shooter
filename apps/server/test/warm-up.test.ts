import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorld, type TickFacts } from '@duty-shooter/fps-core';
import { describe, expect, it } from 'vitest';
import { optionsFromEnv, startServer } from '../src/server';
import { warmUp } from '../src/warm-up';

describe('warming a wide server up', () => {
  it('plays a private match before it listens, and leaves the lobby as it was', { timeout: 60_000 }, async () => {
    const log: string[] = [];
    const server = await startServer({ port: 0, host: '127.0.0.1', passphrase: 'x', maxPlayers: 60, staticDir: mkdtempSync(join(tmpdir(), 'duty-warm-')), version: 'test', mode: 'ffa', map: 'survival-town', maxBotsPerTeam: 30, wideNet: true, warmTicks: 30, printLog: (line) => log.push(line) });
    try {
      expect(server.warmedSeats).toBe(60);
      expect(server.game.playerCount).toBe(0);
      expect(server.game.status()).toMatchObject({ phase: 'lobby', bots: 0 });
      expect(log.map((line) => (JSON.parse(line) as { event: string }).event)).toEqual(['serverStart']);
    } finally {
      await server.close();
    }
  });

  it('rehearses what a person does, not just bots: their commands, through a countdown', () => {
    const shots: number[] = [];
    const probe = { start: () => undefined, phase: () => undefined, thought: () => undefined, end: (facts: TickFacts) => void shots.push(facts.shots) };
    warmUp({ world: createWorld([]), spawns: [{ position: [0, 0, 0], yaw: 0 }], passphrase: 'x', mode: 'ffa', lobby: true, probe }, 0, 180);
    const first = shots.findIndex((n) => n > 0);
    // V8 throws away what it compiled the moment a shape it hasn't seen arrives, so a warm-up without these is worse than none.
    expect(first).toBeGreaterThan(50);
    expect(shots.reduce((sum, n) => sum + n, 0)).toBeGreaterThan(0);
  });

  it('warms only a wide server, for forty seconds of play', () => {
    expect(optionsFromEnv({}, '/x').warmTicks).toBeUndefined();
    expect(optionsFromEnv({ NET: 'wide', MAX_PLAYERS: '60' }, '/x').warmTicks).toBe(2400);
  });
});
