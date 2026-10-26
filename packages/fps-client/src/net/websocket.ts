import type { Connection } from '@duty-shooter/fps-core';

/**
 * The v1 transport: one WebSocket per client, implementing fps-core's
 * Connection. Sends made before the socket opens are queued.
 */
export function connectWebSocket(url: string): Connection {
  const socket = new WebSocket(url);
  const outbox: string[] = [];
  const inbox: string[] = [];
  let onMessage: ((data: string) => void) | null = null;
  let onClose: ((reason: string) => void) | null = null;
  let open = false;
  let closed = false;
  socket.addEventListener('open', () => {
    open = true;
    for (const data of outbox.splice(0)) socket.send(data);
  });
  socket.addEventListener('message', (e: MessageEvent) => {
    if (typeof e.data !== 'string') return;
    if (onMessage) onMessage(e.data);
    else inbox.push(e.data);
  });
  socket.addEventListener('close', (e: CloseEvent) => {
    open = false;
    if (closed) return;
    closed = true;
    onClose?.(e.reason || `connection closed (${e.code})`);
  });
  return {
    get open() {
      return open;
    },
    send(data) {
      if (closed) return;
      if (open) socket.send(data);
      else outbox.push(data);
    },
    close(reason = 'client left') {
      if (closed) return;
      closed = true;
      socket.close(1000, reason.slice(0, 120));
    },
    onMessage(handler) {
      onMessage = handler;
      for (const data of inbox.splice(0)) handler(data);
    },
    onClose(handler) {
      onClose = handler;
    },
  };
}
