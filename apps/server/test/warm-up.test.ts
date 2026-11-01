import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { optionsFromEnv, startServer } from '../src/server';

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

  it('warms only a wide server, for ten seconds of play', () => {
    expect(optionsFromEnv({}, '/x').warmTicks).toBeUndefined();
    expect(optionsFromEnv({ NET: 'wide', MAX_PLAYERS: '60' }, '/x').warmTicks).toBe(600);
  });
});
