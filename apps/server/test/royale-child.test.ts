import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@duty-shooter/fps-core';
import { serveParent } from '../src/royale-child';
import type { FromRoyale, UpgradeHandOff } from '../src/royale-process';
import { startServer } from '../src/server';

describe("the Battle Royale process's side (ADR 0009)", () => {
  it('listens on no port, serves no files, plays the connections handed to it, reports its status and logs as itself', async () => {
    const lines: string[] = [];
    const server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 6, staticDir: mkdtempSync(join(tmpdir(), 'duty-static-')), version: 'test', mode: 'ffa', map: 'range', handedSockets: true, printLog: (line) => lines.push(line) });
    // The parent's end of the IPC channel, and a front door standing in for the server holding the public address.
    const sent: FromRoyale[] = [];
    const channel = Object.assign(new EventEmitter(), { send: (message: FromRoyale) => sent.push(message) });
    let orphaned = false;
    const stop = serveParent(server, channel, () => (orphaned = true));
    const front = createServer();
    front.on('upgrade', (req, socket, head) => {
      const handOff: UpgradeHandOff = { t: 'upgrade', method: req.method!, url: '/ws', headers: req.headers, head: head.toString('base64') };
      socket.pause();
      channel.emit('message', handOff, socket);
    });
    await new Promise<void>((done) => front.listen(0, '127.0.0.1', done));
    const port = (front.address() as { port: number }).port;
    try {
      expect(server.http.listening).toBe(false);
      expect(sent[0]).toMatchObject({ t: 'status', status: { map: 'range', players: 0 } });
      expect(sent).toContainEqual({ t: 'ready' });
      const ws = new WebSocket(`ws://127.0.0.1:${port}/royale/ws`);
      await new Promise((done) => ws.addEventListener('open', done));
      const welcome = new Promise<string>((done) => ws.addEventListener('message', (e) => done(String(e.data))));
      ws.send(JSON.stringify({ t: 'join', name: 'alice', passphrase: '', protocol: PROTOCOL_VERSION }));
      expect(JSON.parse(await welcome)).toMatchObject({ t: 'welcome' });
      expect(server.game.playerCount).toBe(1);
      await new Promise((done) => setTimeout(done, 600));
      expect(sent.filter((m) => m.t === 'status').at(-1)).toMatchObject({ status: { players: 1 } });
      expect(lines.map((l) => JSON.parse(l) as { event: string; process?: string })).toContainEqual(expect.objectContaining({ event: 'join', process: 'royale' }));
      ws.close();
      channel.emit('disconnect');
      expect(orphaned).toBe(true);
    } finally {
      stop();
      front.close();
      await server.close();
    }
  }, 30_000);
});
