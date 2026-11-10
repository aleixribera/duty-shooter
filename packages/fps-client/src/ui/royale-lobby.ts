import { WIDE_SCALE, type LobbyState, type PlayerId } from '@duty-shooter/fps-core';
import { MODE_NAMES, type LobbyInfo } from './model';

/** One seat of a Squad on the Battle Royale screen: a person, or (id null) a seat a bot fills. */
export interface SquadSlot {
  readonly id: PlayerId | null;
  readonly name: string;
  /** "You", "Host", "Friend" (or "You · host"); empty for a bot's seat. */
  readonly role: string;
  readonly you: boolean;
}

export interface SquadView {
  /** The Squad's number in the lobby. */
  readonly squad: number;
  /** Its people first, then a bot's seat for each one left. */
  readonly slots: readonly SquadSlot[];
  /** Whether it has a seat left for a person to take. */
  readonly open: boolean;
}

export interface RoyaleSquads {
  /** Your Squad; null until you are in the lobby. */
  readonly mine: SquadView | null;
  /** The other Squads with people in them, by number. */
  readonly others: readonly SquadView[];
  /** The number a fresh Squad of your own would take: only when you have company to leave. */
  readonly newSquad: number | null;
  readonly people: number;
  /** The seats bots take when the match starts. */
  readonly bots: number;
}

const BOT_SEAT = 'Bot fills this seat';

/** The lobby's Squads as the Battle Royale screen lays them out, from the server's picks. */
export function royaleSquads(lobby: LobbyState, selfId: PlayerId | null, names: Readonly<Record<string, string>>): RoyaleSquads {
  const size = lobby.squadSize;
  const groups = new Map<number, PlayerId[]>();
  for (const id of lobby.players) {
    const squad = lobby.squads[id];
    if (squad === undefined) continue;
    const members = groups.get(squad) ?? [];
    members.push(id);
    groups.set(squad, members);
  }
  const view = (squad: number, members: readonly PlayerId[]): SquadView => {
    const slots: SquadSlot[] = members.map((id) => {
      const you = id === selfId;
      const host = id === lobby.host;
      return { id, name: names[id] ?? id, role: you ? (host ? 'You · host' : 'You') : host ? 'Host' : 'Friend', you };
    });
    while (slots.length < size) slots.push({ id: null, name: BOT_SEAT, role: '', you: false });
    return { squad, slots, open: members.length < size };
  };
  const own = selfId === null ? undefined : lobby.squads[selfId];
  const mine = own === undefined ? null : view(own, groups.get(own) ?? [selfId!]);
  const others = [...groups.entries()]
    .filter(([squad]) => squad !== own)
    .sort(([a], [b]) => a - b)
    .map(([squad, members]) => view(squad, members));
  let free = 1;
  while (groups.has(free)) free += 1;
  const company = mine !== null && mine.slots.filter((s) => s.id !== null).length > 1;
  const people = lobby.players.length;
  return { mine, others, newSquad: size > 1 && company ? free : null, people, bots: Math.max(0, WIDE_SCALE.seats - people) };
}

export interface RoyaleServer {
  readonly tone: 'up' | 'busy' | 'down';
  /** One sentence: what the server's state means for a Battle Royale and what happens next. */
  readonly line: string;
  /** Whether joining now leads to a Battle Royale. */
  readonly join: boolean;
}

/** Whether joining now opens a fresh Battle Royale lobby (its joiner the host, picking the Squad size): nobody there, nothing under way. Unknown counts as yes. */
export function royaleOpens(status: LobbyInfo | null | undefined): boolean {
  return !status || (status.players + (status.away ?? 0) === 0 && status.phase === 'lobby');
}

const players = (n: number): string => `${n} ${n === 1 ? 'player' : 'players'}`;

/** What the server's status means for someone who wants a Battle Royale, before they join. */
export function royaleServer(status: LobbyInfo | null): RoyaleServer {
  if (!status) return { tone: 'down', join: false, line: 'The server isn’t answering. It may be restarting.' };
  if (status.royale !== true) return { tone: 'down', join: false, line: 'This server has no Battle Royale map yet.' };
  const royale = 'battle-royale';
  const people = status.players + (status.away ?? 0);
  const next = status.lobbyMode ?? status.mode;
  if (status.phase === 'lobby') {
    if (people === 0) return { tone: 'up', join: true, line: 'The server is free: you open the lobby.' };
    if (next !== royale) return { tone: 'busy', join: false, line: `${players(people)} in the server’s ${MODE_NAMES[next] ?? next} lobby. Battle Royale opens when it empties.` };
    if (status.players >= status.capacity) return { tone: 'busy', join: false, line: 'The lobby is full. A seat frees up when someone leaves.' };
    return { tone: 'up', join: true, line: `${players(people)} in the lobby.` };
  }
  if (status.mode === royale) return { tone: 'busy', join: true, line: `A Battle Royale is under way with ${players(people)}. Join to watch it and play the next one.` };
  if (people === 0) return { tone: 'up', join: true, line: 'The server is free: you open the lobby.' };
  return { tone: 'busy', join: false, line: `The server is playing ${MODE_NAMES[status.mode] ?? status.mode} with ${players(people)}. Battle Royale opens when they finish and leave.` };
}

/** Before joining on Local bots: a lobby of this player's own, always free (ticket 15). */
export function royaleLocal(): RoyaleServer {
  return { tone: 'up', join: true, line: '' };
}

/** The steps a join goes through, shown while it does: the bots' worker starts where a server would be reached. */
export function royaleSteps(source: 'server' | 'local'): readonly string[] {
  return [source === 'local' ? 'Starting the bots' : 'Reaching the server', 'Building Zero Island', 'Joining the lobby'];
}

/** What the Battle Royale screen needs of a joined session to say where it stands. */
export interface RoyaleSessionState {
  /** Whether this player is the lobby's host. */
  readonly host: boolean;
  readonly hostName: string | null;
  /** 'lobby' while waiting; anything else means a match is under way. */
  readonly phase: string;
  /** The island's name while it is still being built; null once it is in. */
  readonly loading: string | null;
  /** Whether this player has a seat in the match under way. */
  readonly seated: boolean;
  /** That seat is out of the match already (it died, or its Squad was placed): back on the page it can only watch (ticket 48). */
  readonly out: boolean;
  /** The connection dropped and is coming back: nothing sent now would arrive (ticket 38). */
  readonly reconnecting: boolean;
}

export interface RoyaleSessionLine {
  readonly tone: 'up' | 'busy' | 'down';
  readonly line: string;
  /** The footer's main button: what it says, and what it does (null: disabled). */
  readonly go: { readonly label: string; readonly act: 'start' | 'enter' | null };
  /** Whether the host's picks (the Squad size) take a press now. */
  readonly picks: boolean;
}

/** The joined Battle Royale screen's connection line and main button. */
export function royaleSession(s: RoyaleSessionState): RoyaleSessionLine {
  if (s.reconnecting) return { tone: 'busy', line: 'Lost the connection. The match waits for you.', go: { label: 'Reconnecting…', act: null }, picks: false };
  if (s.phase !== 'lobby') {
    if (s.loading) return { tone: 'busy', line: 'The match has started.', go: { label: 'Building the island…', act: null }, picks: false };
    if (s.seated && s.out) return { tone: 'busy', line: 'You’re out of this match: watch it, and play the next one.', go: { label: 'Watch the match', act: 'enter' }, picks: false };
    return s.seated
      ? { tone: 'busy', line: 'The match has started.', go: { label: 'Join the match', act: 'enter' }, picks: false }
      : { tone: 'busy', line: 'A match is under way without you: watch it, and play the next one.', go: { label: 'Watch the match', act: 'enter' }, picks: false };
  }
  return s.host
    ? { tone: 'up', line: 'You are the host.', go: { label: 'Start match', act: 'start' }, picks: true }
    : { tone: 'up', line: s.hostName ? `${s.hostName} is the host.` : 'Waiting for a host.', go: { label: 'Waiting for host', act: null }, picks: false };
}
