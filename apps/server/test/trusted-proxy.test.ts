import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { optionsFromEnv, startServer, type RunningServer, type ServerOptions } from '../src/server';

const LIMIT = 12;
/**
 * Stands in for Docker's bridge gateway, which docker-proxy connects from:
 * a peer that isn't the machine's own 127.0.0.1 (ticket 36). Linux routes all
 * of 127/8 to loopback, so a client can bind it.
 */
const PROXY = '127.0.0.2';
const STRANGER = '127.0.0.3';

describe('the visitor address behind a proxy', () => {
  let server: RunningServer;
  const open: WebSocket[] = [];

  afterEach(async () => {
    for (const ws of open.splice(0)) ws.terminate();
    await server.close();
  });

  const start = async (extra: Partial<ServerOptions>) => {
    server = await startServer({ port: 0, host: '0.0.0.0', passphrase: '', maxPlayers: 6, staticDir: mkdtempSync(join(tmpdir(), 'duty-proxy-')), version: 'test', mode: 'tdm', map: 'range', ...extra });
  };

  /** Opens sockets from `from` one after another, each naming `forwarded`; how many the server took. */
  const openSockets = async (count: number, from: string, forwarded?: string): Promise<number> => {
    let taken = 0;
    for (let i = 0; i < count; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { localAddress: from, headers: forwarded ? { 'x-forwarded-for': forwarded } : {} });
      ws.on('error', () => undefined);
      open.push(ws);
      if (await new Promise<boolean>((done) => (ws.once('open', () => done(true)), ws.once('unexpected-response', () => done(false)), ws.once('error', () => done(false))))) taken += 1;
    }
    return taken;
  };

  it('gives each visitor the trusted proxy names a budget of their own', async () => {
    await start({ trustedProxies: [PROXY] });
    expect(await openSockets(LIMIT, PROXY, '203.0.113.1')).toBe(LIMIT);
    expect(await openSockets(1, PROXY, '203.0.113.2')).toBe(1);
    expect(await openSockets(1, PROXY, '203.0.113.1')).toBe(0);
  });

  it('ignores the header from anyone but the trusted proxy', async () => {
    await start({ trustedProxies: [PROXY] });
    expect(await openSockets(LIMIT, STRANGER, '203.0.113.1')).toBe(LIMIT);
    expect(await openSockets(1, STRANGER, '203.0.113.2')).toBe(0);
  });

  it('counts the address the proxy itself added, not one the visitor wrote before it', async () => {
    await start({ trustedProxies: [PROXY] });
    expect(await openSockets(LIMIT, PROXY, '198.51.100.9, 203.0.113.1')).toBe(LIMIT);
    // The same visitor writing a different address first is still the same visitor.
    expect(await openSockets(1, PROXY, '198.51.100.10, 203.0.113.1')).toBe(0);
  });

  it('falls back to the proxy itself when the header holds no address', async () => {
    await start({ trustedProxies: [PROXY] });
    expect(await openSockets(LIMIT, PROXY, 'nonsense')).toBe(LIMIT);
    expect(await openSockets(1, PROXY)).toBe(0);
  });

  it('reads the trusted proxies from TRUSTED_PROXY, none by default, and refuses a non-address', () => {
    expect(optionsFromEnv({}, '/x').trustedProxies).toBeUndefined();
    expect(optionsFromEnv({ TRUSTED_PROXY: '172.28.0.1' }, '/x').trustedProxies).toEqual(['172.28.0.1']);
    expect(optionsFromEnv({ TRUSTED_PROXY: '172.28.0.1, fd00::1' }, '/x').trustedProxies).toEqual(['172.28.0.1', 'fd00::1']);
    expect(() => optionsFromEnv({ TRUSTED_PROXY: 'gateway' }, '/x')).toThrow(/TRUSTED_PROXY/);
  });
});
