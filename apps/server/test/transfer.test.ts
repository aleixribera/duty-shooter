import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer, type RunningServer } from '../src/server';

/** A raw GET (fetch would undo the compression), with the headers given. */
function get(port: number, path: string, headers: Record<string, string>): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }> {
  return new Promise((done, fail) => {
    request({ port, host: '127.0.0.1', path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    })
      .on('error', fail)
      .end();
  });
}

describe('what the server sends', () => {
  let server: RunningServer;
  const code = `export const game = ${JSON.stringify('duty '.repeat(2000))};`;

  beforeAll(async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'duty-static-'));
    writeFileSync(join(staticDir, 'index.html'), '<canvas></canvas>');
    writeFileSync(join(staticDir, 'game.js'), code);
    writeFileSync(join(staticDir, 'bake.bin'), Buffer.alloc(4096, 7));
    server = await startServer({ port: 0, host: '127.0.0.1', passphrase: '', maxPlayers: 6, staticDir, version: 'test', mode: 'ffa', map: 'range' });
  });

  afterAll(async () => {
    await server.close();
  });

  it('compresses code with brotli or gzip, whichever the browser takes', async () => {
    const br = await get(server.port, '/game.js', { 'accept-encoding': 'gzip, deflate, br, zstd' });
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers['vary']).toBe('accept-encoding');
    expect(Number(br.headers['content-length'])).toBe(br.body.length);
    expect(br.body.length).toBeLessThan(code.length / 10);
    expect(brotliDecompressSync(br.body).toString()).toBe(code);

    const gz = await get(server.port, '/game.js', { 'accept-encoding': 'gzip' });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(gz.body).toString()).toBe(code);

    const plain = await get(server.port, '/game.js', {});
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.toString()).toBe(code);
  });

  it('sends the lighting bake as it is: it is compressed already', async () => {
    const bake = await get(server.port, '/bake.bin', { 'accept-encoding': 'br, gzip' });
    expect(bake.headers['content-encoding']).toBeUndefined();
    expect(bake.body.length).toBe(4096);
  });

  it('answers a file the browser already has with a 304', async () => {
    const first = await get(server.port, '/bake.bin', {});
    const etag = String(first.headers['etag']);
    expect(etag).toMatch(/^".+"$/);
    const again = await get(server.port, '/bake.bin', { 'if-none-match': etag });
    expect(again.status).toBe(304);
    expect(again.body.length).toBe(0);
    const changed = await get(server.port, '/bake.bin', { 'if-none-match': '"other"' });
    expect(changed.status).toBe(200);
    expect(changed.body.length).toBe(4096);
  });

  it('offers WebSocket compression for the snapshots', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise((done) => ws.once('open', done));
    expect(ws.extensions).toContain('permessage-deflate');
    ws.close();
  });
});
