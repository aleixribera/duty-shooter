import type { Connection, ServerTransport, WireData } from './transport';

/**
 * A game link over a message port: a Web Worker's scope, a `MessagePort`, or
 * Node's. Local bots (ticket 15, ADR 0010) run the server in a worker and talk
 * to it this way, with the very protocol a WebSocket carries. Delivery is in
 * order and nothing is lost, as over TCP. Binary frames are copied, never
 * transferred, so a sender may reuse its buffer.
 */
export interface PortLike {
  postMessage(message: unknown): void;
  /** The event is a `MessageEvent`; it's typed loosely so DOM and Node ports both fit without either's types here. */
  addEventListener(type: 'message', listener: (event: object) => void): void;
  /** A `MessagePort` delivers only once started; a worker's scope has no such step. */
  start?(): void;
}

/** What crosses the port: a connection opening, a frame on it, or its close. */
type Frame = { readonly k: 'open'; readonly id: number } | { readonly k: 'data'; readonly id: number; readonly d: WireData } | { readonly k: 'close'; readonly id: number; readonly r: string };

/** What a message event carries. */
export const messageData = (event: object): unknown => (event as { readonly data?: unknown }).data;

const isFrame = (data: unknown): data is Frame => typeof data === 'object' && data !== null && typeof (data as { id?: unknown }).id === 'number' && typeof (data as { k?: unknown }).k === 'string';

class PortEnd implements Connection {
  readonly reliable = true;
  readonly congested = false;
  #open = true;
  #handler: ((data: WireData) => void) | null = null;
  #closeHandler: ((reason: string) => void) | null = null;
  readonly #queue: WireData[] = [];

  constructor(
    private readonly port: PortLike,
    private readonly id: number,
  ) {}

  get open(): boolean {
    return this.#open;
  }

  send(data: WireData): void {
    if (this.#open) this.port.postMessage({ k: 'data', id: this.id, d: data } satisfies Frame);
  }

  close(reason = 'closed'): void {
    if (!this.#open) return;
    this.#open = false;
    this.port.postMessage({ k: 'close', id: this.id, r: reason } satisfies Frame);
    this.#closeHandler?.(reason);
  }

  onMessage(handler: (data: WireData) => void): void {
    this.#handler = handler;
    for (const data of this.#queue.splice(0)) handler(data);
  }

  onClose(handler: (reason: string) => void): void {
    this.#closeHandler = handler;
  }

  receive(frame: Frame): void {
    if (!this.#open) return;
    if (frame.k === 'data') {
      if (this.#handler) this.#handler(frame.d);
      else this.#queue.push(frame.d);
    } else if (frame.k === 'close') {
      this.#open = false;
      this.#closeHandler?.(frame.r);
    }
  }
}

let nextId = 1;

/** Opens a connection to the server on the far side of `port` (see {@link servePort}). */
export function connectPort(port: PortLike): Connection {
  const id = nextId++;
  const end = new PortEnd(port, id);
  port.addEventListener('message', (e) => {
    const data = messageData(e);
    if (isFrame(data) && data.id === id) end.receive(data);
  });
  port.start?.();
  port.postMessage({ k: 'open', id } satisfies Frame);
  return end;
}

/** The server's side of `port`: every {@link connectPort} on the far side arrives as a connection. */
export function servePort(port: PortLike): ServerTransport {
  let accept: ((connection: Connection) => void) | null = null;
  const ends = new Map<number, PortEnd>();
  const early: Frame[] = [];
  const take = (frame: Frame) => {
    if (frame.k === 'open') {
      const end = new PortEnd(port, frame.id);
      ends.set(frame.id, end);
      accept!(end);
      return;
    }
    const end = ends.get(frame.id);
    end?.receive(frame);
    if (frame.k === 'close') ends.delete(frame.id);
  };
  port.addEventListener('message', (e) => {
    const data = messageData(e);
    if (!isFrame(data)) return;
    if (accept) take(data);
    else early.push(data);
  });
  port.start?.();
  return {
    onConnection(handler) {
      accept = handler;
      for (const frame of early.splice(0)) take(frame);
    },
  };
}
