import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../src/server';

describe('lobby status endpoint', () => {
  let server: RunningServer;

  beforeAll(async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-static-'));
    writeFileSync(join(staticDir, 'index.html'), '<canvas></canvas>');
    server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 6, staticDir, version: 'test', mode: 'ffa' });
  });

  afterAll(async () => {
    await server.close();
  });

  it('reports map, mode, players, capacity and phase', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/status`);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ map: 'range', mode: 'ffa', players: 0, capacity: 6, phase: 'playing' });
  });
});
