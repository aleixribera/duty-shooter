import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@duty-shooter/fps-core';
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
    expect(await res.json()).toEqual({ map: 'range', mode: 'ffa', players: 0, capacity: 6, phase: 'lobby', away: 0, bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0, lobby: true, hvb: false });
  });
});

describe('server bots setting', () => {
  it('reads BOTS_PER_TEAM and MAX_BOTS_PER_TEAM from the environment: 3 and 6 by default, at most 6', () => {
    expect(optionsFromEnv({}, 'dist')).toMatchObject({ botsPerTeam: 3, maxBotsPerTeam: 6 });
    expect(optionsFromEnv({ BOTS_PER_TEAM: '0' }, 'dist')).toMatchObject({ botsPerTeam: 0, maxBotsPerTeam: 6 });
    expect(optionsFromEnv({ MAX_BOTS_PER_TEAM: '0' }, 'dist')).toMatchObject({ botsPerTeam: 0, maxBotsPerTeam: 0 });
    expect(optionsFromEnv({ BOTS_PER_TEAM: '2', MAX_BOTS_PER_TEAM: '2' }, 'dist')).toMatchObject({ botsPerTeam: 2, maxBotsPerTeam: 2 });
    expect(() => optionsFromEnv({ MAX_BOTS_PER_TEAM: '7' }, 'dist')).toThrow(/MAX_BOTS_PER_TEAM must be/);
    expect(() => optionsFromEnv({ BOTS_PER_TEAM: '4', MAX_BOTS_PER_TEAM: '2' }, 'dist')).toThrow(/BOTS_PER_TEAM must be/);
  });

  it('fills the Survival Town match with bots to its team size (4v4) once the host starts it, and counts only people as players; the seat of someone who leaves is held, the match running on', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-static-'));
    const server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 8, staticDir, version: 'test', mode: 'tdm', map: 'survival-town', botsPerTeam: 2, maxBotsPerTeam: 4 });
    try {
      const status = async () => (await fetch(`http://127.0.0.1:${server.port}/status`)).json();
      // Survival Town's own team size (4 a side) rather than the server's default.
      expect(await status()).toMatchObject({ players: 0, bots: 0, botsPerTeam: 4, maxBotsPerTeam: 4 });
      // Every lobby map is held, for the host to pick between matches.
      expect(server.game.matchStatus().lobby).toMatchObject({ maps: ['survival-town', 'switchyard', 'crash'], map: 'survival-town' });
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
      await new Promise((done) => ws.addEventListener('open', done));
      ws.send(JSON.stringify({ t: 'join', name: 'alice', passphrase: '', protocol: PROTOCOL_VERSION }));
      await new Promise((done) => ws.addEventListener('message', done));
      // In the lobby, as its host: no bots until the match starts.
      expect(await status()).toMatchObject({ players: 1, bots: 0, phase: 'lobby' });
      ws.send(JSON.stringify({ t: 'start' }));
      for (let i = 0; i < 250 && server.game.phase !== 'playing'; i++) await new Promise((done) => setTimeout(done, 20));
      expect(await status()).toMatchObject({ players: 1, bots: 7, phase: 'playing' });
      ws.close();
      await new Promise((done) => ws.addEventListener('close', done));
      for (let i = 0; i < 250 && server.game.playerCount > 0; i++) await new Promise((done) => setTimeout(done, 20));
      expect(await status()).toMatchObject({ players: 0, away: 1, bots: 7 });
    } finally {
      await server.close();
    }
  }, 30_000);
});

describe('server map setting', () => {
  it('lets the host select and start the Crash preview with its ladder', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-static-'));
    const server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 8, staticDir, version: 'test', mode: 'tdm', map: 'survival-town' });
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
      await new Promise((done) => ws.addEventListener('open', done));
      ws.send(JSON.stringify({ t:'join', name:'host', passphrase:'', protocol:PROTOCOL_VERSION }));
      await new Promise((done) => ws.addEventListener('message', done));
      ws.send(JSON.stringify({ t:'lobby', map:'crash' }));
      for (let i=0; i<250 && server.game.matchStatus().lobby?.map !== 'crash'; i++) await new Promise((done) => setTimeout(done,20));
      expect(server.game.matchStatus().lobby?.map).toBe('crash');
      ws.send(JSON.stringify({ t:'start' }));
      for (let i=0; i<250 && server.game.phase !== 'playing'; i++) await new Promise((done) => setTimeout(done,20));
      expect(server.game.matchStatus()).toMatchObject({ map:'crash', phase:'playing' });
      expect(server.game.simulation.world.ladders).toHaveLength(1);
      ws.close();
    } finally {
      await server.close();
    }
  }, 30_000);

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

describe('the event log', () => {
  it('appends a JSON line for the start, a join and a leave, marks script players, and reports the protocol in the health check', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'duty-log-'));
    const file = join(dir, 'data', 'events.jsonl');
    const printed: string[] = [];
    const server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 8, staticDir: dir, version: 'test', mode: 'tdm', map: 'range', eventLog: file, printLog: (line) => printed.push(line) });
    try {
      const health = (await (await fetch(`http://127.0.0.1:${server.port}/healthz`)).json()) as { protocol: number };
      expect(health.protocol).toBe(PROTOCOL_VERSION);
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
      await new Promise((done) => ws.addEventListener('open', done));
      ws.send(JSON.stringify({ t: 'join', name: 'smoke', passphrase: '', protocol: health.protocol, script: true }));
      await new Promise((done) => ws.addEventListener('message', done));
      ws.close();
      for (let i = 0; i < 250 && server.game.playerCount > 0; i++) await new Promise((done) => setTimeout(done, 20));
      const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      expect(lines.map((l) => l.event)).toEqual(['serverStart', 'join', 'matchStart', 'leave']);
      expect(lines[1]).toMatchObject({ name: 'smoke', bot: false, script: true });
      expect(lines.every((l) => typeof l.time === 'string')).toBe(true);
      expect(printed).toHaveLength(lines.length);
    } finally {
      await server.close();
    }
  });
});
