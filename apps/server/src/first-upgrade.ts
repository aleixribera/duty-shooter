import { createServer } from 'node:http';
import { connect } from 'node:net';

/**
 * Takes a process's first HTTP upgrade, on a server of its own that's gone
 * again when this returns. That first upgrade makes V8 throw away compiled code
 * that reads typed arrays, across the whole process and once only, by way of
 * something inside Node: no single call does it but the upgrade itself. Left to
 * the first player it lands just after the warm-up has compiled that code, and
 * routes and snapshots run cold into the match. Call it before the warm-up.
 */
export async function spendFirstUpgrade(): Promise<void> {
  const server = createServer();
  try {
    await new Promise<void>((done, fail) => {
      server.once('error', fail);
      server.once('upgrade', (_req, socket) => {
        socket.destroy();
        done();
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        connect(port, '127.0.0.1')
          .on('error', () => undefined)
          .end('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
      });
    });
  } catch (error) {
    // A warm-up that's undone by the first player is no reason not to start.
    console.error(`The first upgrade couldn't be taken ahead of time: ${(error as Error).message}`);
  } finally {
    server.close();
  }
}
