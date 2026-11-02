import { GameServer, PROTOCOL_VERSION, TICK_SECONDS, type Connection, type GameServerOptions, type WireData } from '@duty-shooter/fps-core';
import { clockedProfiler } from './slow-ticks';

/** The rehearsal's countdown: long enough to run through its code, which differs from play's. */
const COUNTDOWN_SECONDS = 1;
/** Openings rehearsed before the whole match. Filling the seats and giving each Squad its first rally happen once a match, so one rehearsal leaves that code cold, at about 15 ms. */
const OPENINGS = 8;
/** An opening's ticks: the countdown, and the first ticks of play. */
const OPENING_TICKS = 70;
/** Ticks a usercmd's view sits behind the newest snapshot, about what a client's interpolation holds back. */
const VIEW_BEHIND = 6;

/**
 * Rehearses a match, sent nowhere, so V8 has the tick compiled before anyone
 * is waiting on it. Cold, the first ticks of a full match run to about 60 ms.
 *
 * It has to be the real thing in every way the code can see, or the rehearsal
 * does harm. A match with bots alone trained the movement code on the bots'
 * usercmds; the first person's, from JSON and through the countdown's copy,
 * have other object shapes, and V8 threw all of it away at once, at the start
 * of the real match, where the bots' first thoughts ran interpreted at 15 to
 * 30 ms a tick. So a seat here sends what a client sends, through a countdown,
 * and a Battle Royale runs its Ring from end to end in the time it has.
 *
 * Returns the seats it filled. It logs nothing and shares no state with the
 * real game but the map, which nothing writes to.
 */
export function warmUp(options: GameServerOptions, bots: number, ticks: number): number {
  // Profiled as the real game is, or the tick's code learns a shape it won't see again, reporting nothing however slow.
  const rehearsal = { ...options, probe: options.probe ?? clockedProfiler(Infinity, () => undefined) };
  for (let i = 0; i < OPENINGS; i++) rehearse(rehearsal, bots, OPENING_TICKS);
  return rehearse(rehearsal, bots, ticks);
}

/** One match, or the start of one, played alone. */
function rehearse(options: GameServerOptions, bots: number, ticks: number): number {
  let accept: ((connection: Connection) => void) | null = null;
  const timeLimit = Math.max(10, ticks * TICK_SECONDS - COUNTDOWN_SECONDS);
  const game = new GameServer(
    { onConnection: (handler) => (accept = handler) },
    { ...options, countdown: COUNTDOWN_SECONDS, onLog: () => undefined, modes: { ...options.modes, battleRoyale: { ...options.modes?.battleRoyale, timeLimit } } },
  );
  let receive: ((data: WireData) => void) | null = null;
  const connection: Connection = {
    open: true,
    reliable: true,
    congested: false,
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
  let newest = 0;
  for (let seq = 1; seq <= ticks; seq++) {
    const fire = seq % 3 === 0;
    const cmd = { buttons: fire ? 1 : 0, forward: 1, right: Math.sin(seq / 40), yaw: seq * 0.01, pitch: 0.01, firePresses: seq % 8 === 0 ? [0.3] : [], viewTick: newest - VIEW_BEHIND + 0.5 };
    say({ t: 'cmds', cmds: [{ seq, cmd }], ping: 30, seen: newest });
    const out = game.tick();
    newest = out.tick;
    seats = Math.max(seats, out.players.length);
  }
  return seats;
}
