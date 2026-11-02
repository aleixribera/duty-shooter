import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import type { FromRoyale, UpgradeHandOff } from './royale-process';
import type { RunningServer } from './server';

/** How often the status goes to the server that started this process. */
const STATUS_MS = 500;

/** The IPC channel to the parent: `process` in the Battle Royale process, a stand-in in tests. */
export interface ParentChannel {
  send?(message: FromRoyale): unknown;
  on(event: 'message', handler: (message: unknown, handle?: unknown) => void): unknown;
  on(event: 'disconnect', handler: () => void): unknown;
}

const isHandOff = (message: unknown): message is UpgradeHandOff => typeof message === 'object' && message !== null && (message as { t?: unknown }).t === 'upgrade';

/**
 * The Battle Royale process's side of ADR 0009: it takes the connections the
 * server holding the public address hands over, as if its own HTTP server had
 * read their upgrade (the same origin check, address limit and WebSocket
 * setup), and reports its lobby's status twice a second. It leaves when that
 * server is gone, since nobody could reach it any more.
 */
export function serveParent(server: RunningServer, parent: ParentChannel, onOrphaned: () => void): () => void {
  parent.on('message', (message, handle) => {
    if (!isHandOff(message)) return;
    const socket = handle as Socket | undefined;
    if (!socket) return;
    // The fields the upgrade handler and ws read; the socket is the visitor's own connection.
    const req = { method: message.method, url: message.url, headers: message.headers, socket } as unknown as IncomingMessage;
    socket.resume();
    if (!server.http.emit('upgrade', req, socket, Buffer.from(message.head, 'base64'))) socket.destroy();
  });
  parent.on('disconnect', onOrphaned);
  const report = () => parent.send?.({ t: 'status', status: server.game.status() });
  const timer = setInterval(report, STATUS_MS);
  timer.unref();
  report();
  parent.send?.({ t: 'ready' });
  return () => clearInterval(timer);
}
