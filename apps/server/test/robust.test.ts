import { mkdtempSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../src/server';

const upgrade = (path: string, extra = '') => `GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n${extra}\r\n`;

describe('requests that must not bring the server down', () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 6, staticDir: mkdtempSync(join(tmpdir(), 'duty-robust-')), version: 'test', mode: 'tdm', map: 'range' });
  });

  afterAll(async () => {
    await server.close();
  });

  const send = (text: string) =>
    new Promise<string>((done) => {
      let answer = '';
      const socket = connect(server.port, '127.0.0.1', () => socket.write(text));
      socket.on('data', (d) => (answer += d.toString()));
      socket.on('close', () => done(answer));
      socket.on('error', () => done(answer));
      setTimeout(() => socket.destroy(), 300);
    });

  it('refuses an upgrade whose path is no url', async () => {
    expect(await send(upgrade('//'))).toContain('403');
    expect((await fetch(`http://127.0.0.1:${server.port}/healthz`)).ok).toBe(true);
  });

  it('survives a refused socket being reset', async () => {
    await new Promise<void>((done) => {
      const socket = connect(server.port, '127.0.0.1', () => {
        socket.write(upgrade('/nope'));
        socket.resetAndDestroy();
        setTimeout(done, 100);
      });
      socket.on('error', () => undefined);
    });
    expect((await fetch(`http://127.0.0.1:${server.port}/healthz`)).ok).toBe(true);
  });
});
