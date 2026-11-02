import { fork, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@duty-shooter/fps-core';
import { RoyaleProcess, type RoyaleProcessOptions } from '../src/royale-process';
import { startServer, type RunningServer } from '../src/server';

const FAKE = fileURLToPath(new URL('./support/fake-royale.mjs', import.meta.url));

const until = async (what: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!what()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((done) => setTimeout(done, 20));
  }
};

/** The first text a socket receives, or how it ended. */
const greeting = (url: string) =>
  new Promise<string>((done) => {
    const ws = new WebSocket(url);
    ws.addEventListener('message', (e) => done(String(e.data)));
    ws.addEventListener('error', () => done('error'));
    ws.addEventListener('close', () => done('closed'));
    sockets.push(ws);
  });

let sockets: WebSocket[] = [];
let cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const ws of sockets) ws.close();
  sockets = [];
  for (const step of cleanup.reverse()) await step();
  cleanup = [];
});

/** A Play Online server on the practice range with a stand-in Battle Royale process behind it. */
async function serverWith(options: Partial<RoyaleProcessOptions> & { readyMs?: number } = {}): Promise<{ server: RunningServer; royale: RoyaleProcess; children: ChildProcess[]; lines: string[] }> {
  const children: ChildProcess[] = [];
  const lines: string[] = [];
  const royale = new RoyaleProcess({
    available: true,
    start: () => {
      const child = fork(FAKE, [], { env: { ...process.env, READY_MS: String(options.readyMs ?? 0) }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      children.push(child);
      return child;
    },
    log: (line) => lines.push(line),
    ...options,
  });
  const server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 6, staticDir: mkdtempSync(join(tmpdir(), 'duty-static-')), version: 'test', mode: 'ffa', map: 'range', royale });
  cleanup.push(() => server.close(), () => royale.close());
  return { server, royale, children, lines };
}

describe('Battle Royale in a process of its own (ADR 0009)', () => {
  it('starts nothing on a server without the island, and says so', async () => {
    let started = 0;
    const royale = new RoyaleProcess({ available: false, start: () => (started++, fork(FAKE)) });
    expect(royale.status()).toMatchObject({ royale: false });
    expect(started).toBe(0);
  });

  it('starts when its status is first asked for, reports itself starting until ready, then its own lobby', async () => {
    const { server, royale } = await serverWith({ readyMs: 300 });
    expect(royale.running).toBe(false);
    const base = `http://127.0.0.1:${server.port}`;
    const first = await (await fetch(`${base}/royale/status`)).json();
    expect(first).toMatchObject({ mode: 'battle-royale', map: 'zero-island', players: 0, phase: 'lobby', royale: true, starting: true });
    expect(royale.running).toBe(true);
    await until(() => royale.ready);
    expect(await (await fetch(`${base}/royale/status`)).json()).toMatchObject({ mode: 'battle-royale', players: 0, royale: true });
    // Play Online's own status never reports the Battle Royale.
    expect(await (await fetch(`${base}/status`)).json()).toMatchObject({ map: 'range', mode: 'ffa', royale: false });
  }, 20_000);

  it('hands a /royale/ws connection to the process whole, holding it until the process is ready; /ws stays Play Online', async () => {
    const { server, royale, children } = await serverWith({ readyMs: 400 });
    const ws = `ws://127.0.0.1:${server.port}`;
    const hello = await greeting(`${ws}/royale/ws?x=1`);
    expect(hello).toBe(`pid ${children[0]!.pid} /ws?x=1`);
    // Play Online answers on its own socket meanwhile, from this process.
    const online = new WebSocket(`${ws}/ws`);
    sockets.push(online);
    await new Promise((done) => online.addEventListener('open', done));
    online.send(JSON.stringify({ t: 'join', name: 'alice', passphrase: '', protocol: PROTOCOL_VERSION }));
    await until(() => server.game.playerCount === 1);
    await until(() => royale.players === 1);
    // The health check counts both, for the updater.
    expect(await (await fetch(`http://127.0.0.1:${server.port}/healthz`)).json()).toMatchObject({ players: 2, royalePlayers: 1 });
  }, 20_000);

  it('survives the process crashing: Play Online plays on, and a fresh process starts once the restart delay is over', async () => {
    const { server, royale, children, lines } = await serverWith({ restartDelayMs: 500 });
    const ws = `ws://127.0.0.1:${server.port}`;
    expect(await greeting(`${ws}/royale/ws`)).toMatch(/^pid /);
    server.takeLoopStats();
    sockets[0]!.send('crash');
    await until(() => !royale.running);
    expect(lines.some((l) => l.includes('ended unexpectedly'))).toBe(true);
    // Just after the crash it isn't restarted at once, and says so.
    const soon = await fetch(`http://127.0.0.1:${server.port}/royale/status`);
    expect(soon.status).toBe(503);
    expect((await fetch(`http://127.0.0.1:${server.port}/healthz`)).status).toBe(200);
    await new Promise((done) => setTimeout(done, 600));
    // Play Online's loop ran on through it: about 60 ticks a second.
    expect(server.takeLoopStats().ticks).toBeGreaterThan(30);
    expect(await greeting(`${ws}/royale/ws`)).toBe(`pid ${children[1]!.pid} /ws`);
    expect(children).toHaveLength(2);
  }, 20_000);

  it('stops once it has sat empty for the idle time, and not while anyone is in it', async () => {
    const { server, royale, lines } = await serverWith({ idleMs: 300 });
    const ws = `ws://127.0.0.1:${server.port}`;
    await greeting(`${ws}/royale/ws`);
    await new Promise((done) => setTimeout(done, 700));
    expect(royale.running).toBe(true);
    sockets[0]!.close();
    await until(() => !royale.running);
    expect(lines.some((l) => l.includes('idle'))).toBe(true);
    expect(lines.some((l) => l.includes('ended unexpectedly'))).toBe(false);
    // Wanted again, it starts at once: a stop isn't a crash.
    expect(royale.status()).toMatchObject({ starting: true });
    expect(royale.running).toBe(true);
  }, 20_000);

  it('refuses a cross-site /royale/ws before anything is started', async () => {
    const { server, royale } = await serverWith();
    const status = await new Promise<number | string>((done) => {
      const req = request({ port: server.port, host: '127.0.0.1', path: '/royale/ws', headers: { connection: 'Upgrade', upgrade: 'websocket', origin: 'https://evil.example', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-version': '13' } });
      req.on('response', (res) => done(res.statusCode ?? 0));
      req.on('upgrade', () => done('upgraded'));
      req.on('error', (e) => done(e.message));
      req.end();
    });
    expect(status).toBe(403);
    expect(royale.running).toBe(false);
  }, 20_000);
});
