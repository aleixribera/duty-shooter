import { describe, expect, it } from 'vitest';
import { connectPort, servePort, type Connection, type WireData } from '../src';

/** Waits for the messages already posted on a channel to arrive. */
const settle = () => new Promise((done) => setTimeout(done, 20));

describe('a game link over a message port (Local bots, ticket 15)', () => {
  it('carries text and binary both ways, in order, and says it is reliable', async () => {
    const { port1, port2 } = new MessageChannel();
    let server: Connection | null = null;
    const atServer: WireData[] = [];
    servePort(port1).onConnection((c) => {
      server = c;
      c.onMessage((d) => atServer.push(d));
    });
    const client = connectPort(port2);
    const atClient: WireData[] = [];
    client.onMessage((d) => atClient.push(d));
    client.send('{"t":"join"}');
    client.send(new Uint8Array([1, 2, 3]));
    await settle();
    expect(server).not.toBeNull();
    expect(atServer).toEqual(['{"t":"join"}', new Uint8Array([1, 2, 3])]);
    server!.send(new Uint8Array([9]));
    server!.send('{"t":"welcome"}');
    await settle();
    expect(atClient).toEqual([new Uint8Array([9]), '{"t":"welcome"}']);
    expect(client.reliable).toBe(true);
    expect(server!.reliable).toBe(true);
    port1.close();
  });

  it('a sent buffer stays the sender’s to reuse', async () => {
    const { port1, port2 } = new MessageChannel();
    const got: WireData[] = [];
    servePort(port1).onConnection((c) => c.onMessage((d) => got.push(d)));
    const client = connectPort(port2);
    const buffer = new Uint8Array([5, 6]);
    client.send(buffer);
    buffer[0] = 7;
    await settle();
    expect(buffer.byteLength).toBe(2);
    expect(got).toEqual([new Uint8Array([5, 6])]);
    port1.close();
  });

  it('a close reaches the other end with its reason, and nothing is sent after it', async () => {
    const { port1, port2 } = new MessageChannel();
    let server: Connection | null = null;
    let closed: string | null = null;
    servePort(port1).onConnection((c) => {
      server = c;
      c.onClose((r) => (closed = r));
    });
    const client = connectPort(port2);
    let clientClosed: string | null = null;
    client.onClose((r) => (clientClosed = r));
    await settle();
    client.close('left');
    expect(client.open).toBe(false);
    await settle();
    expect(closed).toBe('left');
    expect(server!.open).toBe(false);
    expect(clientClosed).toBe('left');
    port1.close();
  });

  it('a second connection on the same port is a fresh seat, as a reconnect would be', async () => {
    const { port1, port2 } = new MessageChannel();
    const seen: WireData[][] = [];
    servePort(port1).onConnection((c) => {
      const mine: WireData[] = [];
      seen.push(mine);
      c.onMessage((d) => mine.push(d));
    });
    const a = connectPort(port2);
    a.send('a');
    a.close();
    const b = connectPort(port2);
    b.send('b');
    await settle();
    expect(seen).toEqual([['a'], ['b']]);
    port1.close();
  });
});
