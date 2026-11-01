import { GameServer, PROTOCOL_VERSION, type Connection, type GameServerOptions, type WireData } from '@duty-shooter/fps-core';

/**
 * Plays a private bot match, sent nowhere, so V8 has compiled the tick before
 * anyone is waiting on it: cold, the first ticks of a full match run to about
 * 60 ms. Returns the seats it filled. It logs nothing and shares no state with
 * the real game but the map, which nothing writes to.
 */
export function warmUp(options: GameServerOptions, bots: number, ticks: number): number {
  let accept: ((connection: Connection) => void) | null = null;
  const game = new GameServer({ onConnection: (handler) => (accept = handler) }, { ...options, onLog: () => undefined });
  let receive: ((data: WireData) => void) | null = null;
  const connection: Connection = {
    open: true,
    reliable: true,
    send: () => undefined,
    close: () => undefined,
    onMessage: (handler) => (receive = handler),
    onClose: () => undefined,
  };
  accept!(connection);
  const say = (message: object) => receive!(JSON.stringify(message));
  say({ t: 'join', name: 'warm-up', passphrase: options.passphrase, protocol: PROTOCOL_VERSION, script: true, bots });
  say({ t: 'start' });
  game.tick();
  game.tick();
  let seats = 0;
  for (let i = 0; i < ticks; i++) seats = Math.max(seats, game.tick().players.length);
  return seats;
}
