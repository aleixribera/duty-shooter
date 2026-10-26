/**
 * The network transport, behind an interface so WebSocket (v1) can later be
 * swapped for a UDP-like transport without touching game code. Messages are
 * strings; delivery may be delayed, reordered or lost depending on the
 * implementation, and the protocol tolerates all three.
 */

/** One end of a connection. */
export interface Connection {
  send(data: string): void;
  close(reason?: string): void;
  /** Replaces the message handler. Messages that arrive before one is set are queued. */
  onMessage(handler: (data: string) => void): void;
  onClose(handler: (reason: string) => void): void;
  readonly open: boolean;
}

/** The server side: accepts connections. */
export interface ServerTransport {
  onConnection(handler: (connection: Connection) => void): void;
}
