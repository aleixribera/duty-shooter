import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startServer } from '../src/server';

describe('a large map on the server', () => {
  it('refuses to start with bots when the build left no nav', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-nav-'));
    await expect(startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 8, staticDir, version: 'test', mode: 'ffa', map: 'zero-island', maxBotsPerTeam: 4 })).rejects.toThrow(/zero-island\.nav is missing/);
  });

  it('starts without bots, as it needs no nav then', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-nav-'));
    const server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 8, staticDir, version: 'test', mode: 'ffa', map: 'zero-island' });
    await server.close();
  });
});
