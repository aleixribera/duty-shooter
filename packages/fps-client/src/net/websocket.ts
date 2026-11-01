import type { Connection, WireData } from '@duty-shooter/fps-core';

/** Bytes waiting to leave before usercmds are held back: about a quarter of a second of them, uncompressed. */
const CONGESTED = 4 * 1024;

/**
 * The v1 transport: one WebSocket per client, implementing fps-core's
 * Connection. Sends made before the socket opens are queued.
 */
export function connectWebSocket(url: string): Connection {
  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  const outbox: WireData[] = [];
  const inbox: WireData[] = [];
  let onMessage: ((data: WireData) => void) | null = null;
  let onClose: ((reason: string) => void) | null = null;
  let open = false;
  let closed = false;
  socket.addEventListener('open', () => {
    open = true;
    for (const data of outbox.splice(0)) socket.send(data as string);
  });
  socket.addEventListener('message', (e: MessageEvent) => {
    const data: WireData = typeof e.data === 'string' ? e.data : new Uint8Array(e.data as ArrayBuffer);
    if (onMessage) onMessage(data);
    else inbox.push(data);
  });
  socket.addEventListener('close', (e: CloseEvent) => {
    open = false;
    if (closed) return;
    closed = true;
    onClose?.(e.reason || `connection closed (${e.code})`);
  });
  return {
    reliable: true,
    get congested() {
      return socket.bufferedAmount > CONGESTED;
    },
    get open() {
      return open;
    },
    send(data) {
      if (closed) return;
      if (open) socket.send(data as string);
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
