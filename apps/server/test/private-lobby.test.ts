import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, decodeServer, type LobbyState } from '@duty-shooter/fps-core';
import { startServer, type RunningServer } from '../src/server';

/** A scripted page on a real socket: what it was told, kept as the latest of each. */
class Page {
  readonly ws: WebSocket;
  id: string | null = null;
  token: string | null = null;
  rejected: string | null = null;
  lobby: LobbyState | null = null;
  phase: string | null = null;
  closed = false;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('close', () => (this.closed = true));
    this.ws.addEventListener('message', (event) => {
      const message = decodeServer(event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : String(event.data)) as { t: string; id?: string; token?: string; reason?: string; match?: { phase?: string; lobby?: LobbyState | null } } | null;
      if (!message) return;
      if (message.t === 'welcome') [this.id, this.token] = [message.id!, message.token!];
      if (message.t === 'reject') this.rejected = message.reason!;
      if (message.t === 'snap' && message.match) {
        this.phase = message.match.phase ?? this.phase;
        if (message.match.lobby !== undefined) this.lobby = message.match.lobby;
      }
    });
  }

  async join(name: string, resume?: string): Promise<this> {
    if (this.ws.readyState !== WebSocket.OPEN) await new Promise((done) => this.ws.addEventListener('open', done, { once: true }));
    this.send({ t: 'join', name, passphrase: '', protocol: PROTOCOL_VERSION, ...(resume ? { resume } : {}) });
    await until(() => this.id !== null);
    return this;
  }

  send(message: object): void {
    this.ws.send(JSON.stringify(message));
  }
}

async function until(done: () => boolean, ms = 5000): Promise<void> {
  for (let waited = 0; !done(); waited += 20) {
    if (waited > ms) throw new Error('condition not reached');
    await new Promise((next) => setTimeout(next, 20));
  }
}

describe('private lobbies', () => {
  let server: RunningServer;
  let base: string;

  beforeAll(async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-static-'));
    writeFileSync(join(staticDir, 'index.html'), '<canvas></canvas>');
    server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 8, staticDir, version: 'test', mode: 'tdm', map: 'survival-town', botsPerTeam: 2, maxBotsPerTeam: 4, timeLimit: 600 });
    base = `127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it('opens one for its link: friends join by it, the host moves one to the other side, removes another and starts; a page cut off for 5 s comes back to its seat', async () => {
    // Asking about a lobby doesn't open it: only joining does, so a plain GET can't fill the server.
    const status = await fetch(`http://${base}/status?lobby=fr13nd`);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ players: 0, phase: 'lobby', lobby: true });
    expect(server.privateLobbies.size).toBe(0);

    const link = `ws://${base}/ws?lobby=FR13ND`;
    const opened = Date.now();
    const host = await new Page(link).join('host');
    expect([...server.privateLobbies.keys()]).toEqual(['FR13ND']);
    expect(Date.now() - opened, 'ms to open a private lobby and join it').toBeLessThan(3000);
    const one = await new Page(link).join('one');
    const two = await new Page(link).join('two');
    const lobby = server.privateLobbies.get('FR13ND')!;
    expect(lobby.playerCount).toBe(3);
    expect(server.game.playerCount, 'the public lobby').toBe(0);
    await until(() => two.lobby?.players.length === 3);
    expect(two.lobby).toMatchObject({ host: host.id, sides: { [host.id!]: 1, [one.id!]: 2, [two.id!]: 1 } });

    host.send({ t: 'side', id: one.id, team: 1 });
    host.send({ t: 'kick', id: two.id });
    await until(() => two.closed && host.lobby?.players.length === 2 && host.lobby.sides?.[one.id!] === 1);
    expect(two.rejected).toBe('kicked');
    expect(lobby.playerCount).toBe(2);

    host.send({ t: 'start' });
    await until(() => lobby.phase === 'playing');
    const team = (id: string) => lobby.latest.players.find((p) => p.id === id)?.team;
    expect([team(host.id!), team(one.id!)]).toEqual([1, 1]);

    // Cut off: the socket dies without a word, and the page is back after 5 s with its token.
    const [id, token] = [one.id!, one.token!];
    (one.ws as unknown as { _socket?: { destroy(): void } })._socket?.destroy();
    one.ws.close();
    await until(() => lobby.playerCount === 1);
    await new Promise((done) => setTimeout(done, 5000));
    const back = await new Page(link).join('one', token);
    expect(back.id).toBe(id);
    expect(lobby.playerCount).toBe(2);
    expect(team(id)).toBe(1);

    // The kicked page can't take its seat back.
    const kicked = new Page(link);
    await kicked.join('two', two.token!).catch(() => undefined);
    await until(() => kicked.rejected !== null);
    expect(kicked.rejected).toBe('kicked');

    for (const p of [host, back]) p.ws.close();
  }, 30_000);

  it('refuses a link whose code could not be one', async () => {
    expect((await fetch(`http://${base}/status?lobby=no!`)).status).toBe(400);
  });
});
