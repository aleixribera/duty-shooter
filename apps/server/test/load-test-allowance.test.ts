import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { optionsFromEnv, startServer, type RunningServer, type ServerOptions } from '../src/server';

const LIMIT = 12;

describe('the sockets each address may hold', () => {
  let server: RunningServer;
  const open: WebSocket[] = [];

  afterEach(async () => {
    for (const ws of open.splice(0)) ws.terminate();
    await server.close();
  });

  const start = async (extra: Partial<ServerOptions>) => {
    server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 6, staticDir: mkdtempSync(join(tmpdir(), 'duty-sockets-')), version: 'test', mode: 'tdm', map: 'range', ...extra });
  };

  /** Opens sockets one after another; how many the server took. */
  const openSockets = async (count: number, headers: Record<string, string> = {}): Promise<number> => {
    let taken = 0;
    for (let i = 0; i < count; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { headers });
      ws.on('error', () => undefined);
      open.push(ws);
      if (await new Promise<boolean>((done) => (ws.once('open', () => done(true)), ws.once('unexpected-response', () => done(false)), ws.once('error', () => done(false))))) taken += 1;
    }
    return taken;
  };

  it('holds any address to twelve without the allowance', async () => {
    await start({});
    expect(await openSockets(LIMIT + 2)).toBe(LIMIT);
  });

  it('lets the machine itself hold the load test allowance', async () => {
    await start({ loadTestSockets: 20 });
    expect(await openSockets(22)).toBe(20);
  });

  it('keeps a visitor through Funnel at twelve under the allowance', async () => {
    await start({ loadTestSockets: 20 });
    expect(await openSockets(LIMIT + 2, { 'x-forwarded-for': '203.0.113.7' })).toBe(LIMIT);
  });

  it('reads the allowance from the environment, and has none by default', () => {
    expect(optionsFromEnv({}, '/x').loadTestSockets).toBeUndefined();
    expect(optionsFromEnv({ LOAD_TEST_SOCKETS: '60' }, '/x').loadTestSockets).toBe(60);
    expect(() => optionsFromEnv({ LOAD_TEST_SOCKETS: '6' }, '/x')).toThrow(/LOAD_TEST_SOCKETS/);
  });
});
