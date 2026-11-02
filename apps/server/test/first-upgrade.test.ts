import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const UPGRADE = 'GET / HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n';

/** In a process of its own, as its point is what a process's first upgrade does: has typed-array code stayed compiled through an upgrade? */
function keptThroughUpgrade(spendFirst: boolean): boolean {
  const script = `
    import { createServer } from 'node:http';
    import { connect } from 'node:net';
    import { spendFirstUpgrade } from ${JSON.stringify(new URL('../src/first-upgrade.ts', import.meta.url).href)};
    const bytes = new Uint8Array(64);
    const view = new DataView(new ArrayBuffer(64));
    function write(i, v) { bytes[i & 63] = v; view.setFloat64(8, v); return bytes[(i + 1) & 63] + view.getUint8(9); }
    const heat = () => { let sum = 0; for (let n = 0; n < 2e6; n++) sum += write(n, n & 255); return sum; };
    const compiled = () => (%GetOptimizationStatus(write) & 16) !== 0;
    if (${spendFirst}) await spendFirstUpgrade();
    const server = createServer();
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const upgraded = new Promise((done) => server.once('upgrade', (_req, socket) => { socket.destroy(); done(); }));
    heat();
    await new Promise((done) => setImmediate(done));
    heat();
    if (!compiled()) throw new Error('never compiled, so this shows nothing');
    connect(server.address().port, '127.0.0.1').on('error', () => {}).end(${JSON.stringify(UPGRADE)});
    await upgraded;
    await new Promise((done) => setTimeout(done, 30));
    console.log(compiled());
    process.exit(0);
  `;
  const run = spawnSync(process.execPath, ['--allow-natives-syntax', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000 });
  expect(run.stderr.replace(/.*ExperimentalWarning.*\n?/g, '').replace(/\(Use `node.*\n?/g, '')).toBe('');
  return run.stdout.trim() === 'true';
}

describe('a process’s first HTTP upgrade', () => {
  it('throws compiled typed-array code away, unless it has been spent ahead of time', () => {
    expect(keptThroughUpgrade(false)).toBe(false);
    expect(keptThroughUpgrade(true)).toBe(true);
  }, 60_000);
});
