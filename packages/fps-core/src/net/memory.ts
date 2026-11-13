import { noise } from '../random';
import type { Connection, ServerTransport, WireData } from './transport';

/**
 * An in-memory transport for tests, with configurable one-way latency,
 * jitter and packet loss. Time is virtual: nothing is delivered until
 * {@link MemoryNetwork.advance} moves the clock past a message's delivery
 * time. Deterministic for a given seed.
 */
export interface MemoryNetworkOptions {
  /** One-way latency in seconds. */
  readonly latency?: number;
  /** Extra delay in seconds, uniform in [0, jitter], per message (can reorder messages). */
  readonly jitter?: number;
  /** Probability in [0, 1) that a message is lost: dropped, or over {@link tcp} sent again late. Closes are never lost. */
  readonly loss?: number;
  readonly seed?: number;
  /**
   * The link is TCP, as a WebSocket is: nothing is lost or reordered. A lost
   * packet is sent again once three more have drawn duplicate acks, a round
   * trip and three packets later, and everything behind it waits for it.
   */
  readonly tcp?: boolean;
}

/** How long TCP takes to notice a lost packet past the round trip: three more packets' worth at 60 a second. */
const FAST_RETRANSMIT = 0.05;

export interface MemoryNetwork {
  readonly server: ServerTransport;
  /** Opens a client connection to the server. */
  connect(): Connection;
  /** Advances virtual time, delivering every message due by then in delivery order. */
  advance(seconds: number): void;
  readonly now: number;
  /** Messages and bytes sent so far, in both directions. */
  readonly stats: { readonly messages: number; readonly bytes: number; readonly dropped: number };
}

interface Pending {
  readonly at: number;
  readonly order: number;
  readonly deliver: () => void;
}

class End implements Connection {
  #handler: ((data: WireData) => void) | null = null;
  #closeHandler: ((reason: string) => void) | null = null;
  readonly #queue: WireData[] = [];
  #open = true;
  peer!: End;

  constructor(private readonly net: Network) {}

  get open(): boolean {
    return this.#open;
  }

  get reliable(): boolean {
    return this.net.reliable;
  }

  send(data: WireData): void {
    if (!this.#open) return;
    this.net.post(this.peer, data);
  }

  close(reason = 'closed'): void {
    if (!this.#open) return;
    this.#open = false;
    this.net.closeLater(this.peer, reason);
    this.#closeHandler?.(reason);
  }

  onMessage(handler: (data: WireData) => void): void {
    this.#handler = handler;
    for (const data of this.#queue.splice(0)) handler(data);
  }

  onClose(handler: (reason: string) => void): void {
    this.#closeHandler = handler;
  }

  receive(data: WireData): void {
    if (!this.#open) return;
    if (this.#handler) this.#handler(data);
    else this.#queue.push(data);
  }

  remoteClosed(reason: string): void {
    if (!this.#open) return;
    this.#open = false;
    this.#closeHandler?.(reason);
  }
}

class Network implements MemoryNetwork {
  now = 0;
  #order = 0;
  #pending: Pending[] = [];
  /** Over TCP, when the last message to each end lands: none overtakes it. */
  readonly #inOrder = new Map<End, number>();
  #onConnection: ((c: Connection) => void) | null = null;
  readonly stats = { messages: 0, bytes: 0, dropped: 0 };
  readonly server: ServerTransport = { onConnection: (h) => (this.#onConnection = h) };

  constructor(private readonly options: MemoryNetworkOptions) {}

  /** Nothing lost or reordered, as over TCP. */
  get reliable(): boolean {
    return this.options.tcp === true || (!this.options.loss && !this.options.jitter);
  }

  #delay(): number {
    const jitter = this.options.jitter ?? 0;
    return (this.options.latency ?? 0) + jitter * noise(this.options.seed ?? 0, this.#order, 7);
  }

  post(to: End, data: WireData): void {
    this.stats.messages += 1;
    this.stats.bytes += data.length;
    const order = this.#order++;
    const lost = noise(this.options.seed ?? 0, order, 3) < (this.options.loss ?? 0);
    if (lost) this.stats.dropped += 1;
    if (!this.options.tcp) {
      if (!lost) this.#pending.push({ at: this.now + this.#delay(), order, deliver: () => to.receive(data) });
      return;
    }
    const resend = lost ? 2 * (this.options.latency ?? 0) + FAST_RETRANSMIT : 0;
    const at = Math.max(this.#inOrder.get(to) ?? 0, this.now + this.#delay() + resend);
    this.#inOrder.set(to, at);
    this.#pending.push({ at, order, deliver: () => to.receive(data) });
  }

  closeLater(to: End, reason: string): void {
    const order = this.#order++;
    // Over TCP the close comes behind whatever is still on its way, as a FIN does.
    const at = Math.max(this.options.tcp ? (this.#inOrder.get(to) ?? 0) : 0, this.now + (this.options.latency ?? 0));
    this.#pending.push({ at, order, deliver: () => to.remoteClosed(reason) });
  }

  connect(): Connection {
    const client = new End(this);
    const server = new End(this);
    client.peer = server;
    server.peer = client;
    // The server learns of the connection after one latency, like a handshake.
    const order = this.#order++;
    this.#pending.push({ at: this.now + (this.options.latency ?? 0), order, deliver: () => this.#onConnection?.(server) });
    return client;
  }

  advance(seconds: number): void {
    const until = this.now + seconds;
    for (;;) {
      let next: Pending | undefined;
      for (const p of this.#pending) if (p.at <= until + 1e-12 && (!next || p.at < next.at || (p.at === next.at && p.order < next.order))) next = p;
      if (!next) break;
      this.#pending.splice(this.#pending.indexOf(next), 1);
      this.now = Math.max(this.now, next.at);
      next.deliver();
    }
    this.now = until;
  }
}

export function createMemoryNetwork(options: MemoryNetworkOptions = {}): MemoryNetwork {
  return new Network(options);
}
