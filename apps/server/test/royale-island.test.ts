import { copyFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { startServer } from '../src/server';

/** The island's nav as the range app's build leaves it; only a machine that built the app has one. */
const BUILT_NAV = join(dirname(fileURLToPath(import.meta.url)), '../../range/dist/nav/zero-island.nav');

describe('Zero Island on a server of team modes (ticket 12)', () => {
  it('is left out when the build left no nav for its bots', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-static-'));
    const server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 8, staticDir, version: 'test', mode: 'tdm', map: 'survival-town', botsPerTeam: 2, maxBotsPerTeam: 4 });
    try {
      expect(server.game.matchStatus().lobby?.maps).toEqual(['survival-town', 'switchyard', 'crash']);
      expect(server.game.status().royale).toBe(false);
    } finally {
      await server.close();
    }
  }, 60_000);

  it.skipIf(!existsSync(BUILT_NAV))('is held beside the lobby maps once its nav is built, for a Battle Royale lobby only', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-static-'));
    mkdirSync(join(staticDir, 'nav'));
    copyFileSync(BUILT_NAV, join(staticDir, 'nav/zero-island.nav'));
    const server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 8, staticDir, version: 'test', mode: 'tdm', map: 'survival-town', botsPerTeam: 2, maxBotsPerTeam: 4 });
    try {
      // The team modes' lobby doesn't offer it.
      expect(server.game.matchStatus().lobby?.maps).toEqual(['survival-town', 'switchyard', 'crash']);
      expect(server.game.status().royale).toBe(true);
      const status = async () => (await fetch(`http://127.0.0.1:${server.port}/status`)).json();
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
      await new Promise((done) => ws.addEventListener('open', done));
      const { PROTOCOL_VERSION } = await import('@duty-shooter/fps-core');
      ws.send(JSON.stringify({ t: 'join', name: 'alice', passphrase: '', protocol: PROTOCOL_VERSION, mode: 'battle-royale' }));
      await new Promise((done) => ws.addEventListener('message', done));
      expect(server.game.matchStatus().lobby).toMatchObject({ mode: 'battle-royale', map: 'zero-island', maps: ['zero-island'] });
      expect(await status()).toMatchObject({ lobbyMode: 'battle-royale', phase: 'lobby', players: 1 });
      ws.send(JSON.stringify({ t: 'start' }));
      for (let i = 0; i < 500 && server.game.phase !== 'playing'; i++) await new Promise((done) => setTimeout(done, 20));
      expect(await status()).toMatchObject({ mode: 'battle-royale', map: 'zero-island', phase: 'playing', bots: 59 });
      ws.close();
    } finally {
      await server.close();
    }
  }, 120_000);
});
