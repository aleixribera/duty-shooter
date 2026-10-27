import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { optionsFromEnv, startServer, type RunningServer } from '../src/server';

describe('lobby status endpoint', () => {
  let server: RunningServer;

  beforeAll(async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-static-'));
    writeFileSync(join(staticDir, 'index.html'), '<canvas></canvas>');
    server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 6, staticDir, version: 'test', mode: 'ffa', map: 'range' });
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

describe('server map setting', () => {
  it('runs the map it is configured with', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-static-'));
    const server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 8, staticDir, version: 'test', mode: 'tdm', map: 'survival-town' });
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(await res.json()).toMatchObject({ map: 'survival-town', mode: 'tdm' });
    } finally {
      await server.close();
    }
  });

  it('reads MAP from the environment, defaulting to Survival Town', () => {
    expect(optionsFromEnv({}, 'dist').map).toBe('survival-town');
    expect(optionsFromEnv({ MAP: 'range' }, 'dist').map).toBe('range');
    expect(() => optionsFromEnv({ MAP: 'arena' }, 'dist')).toThrow(/MAP must be one of/);
  });

  it('reads TIME_LIMIT from the environment, for short matches, and runs every match to it', async () => {
    expect(optionsFromEnv({}, 'dist').timeLimit).toBeUndefined();
    expect(optionsFromEnv({ TIME_LIMIT: '45' }, 'dist').timeLimit).toBe(45);
    expect(() => optionsFromEnv({ TIME_LIMIT: '0' }, 'dist')).toThrow(/TIME_LIMIT must be/);
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-static-'));
    const server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 8, staticDir, version: 'test', mode: 'tdm', map: 'survival-town', timeLimit: 45 });
    try {
      expect(server.game.matchStatus()).toMatchObject({ mode: 'tdm', timeLimit: 45 });
    } finally {
      await server.close();
    }
  });
});
