import { describe, expect, it } from 'vitest';
import type { LobbyState } from '@duty-shooter/fps-core';
import { royaleOpens, royaleServer, royaleSession, royaleSquads, type RoyaleSessionState } from '../src/ui/royale-lobby';

const lobby = (over: Partial<LobbyState>): LobbyState => ({
  host: 'p1',
  players: ['p1'],
  capacity: 8,
  mode: 'battle-royale',
  bots: 0,
  custom: false,
  maxBots: 6,
  hvb: false,
  maps: ['zero-island'],
  map: 'zero-island',
  squadSize: 3,
  squads: { p1: 1 },
  ...over,
});
const names = { p1: 'Aleix', p2: 'Marta', p3: 'Joan', p4: 'Pau' };

describe('the Battle Royale screen’s Squads', () => {
  it('fills the seats of your Squad left empty with bots', () => {
    const s = royaleSquads(lobby({}), 'p1', names);
    expect(s.mine?.slots).toEqual([
      { id: 'p1', name: 'Aleix', role: 'You · host', you: true },
      { id: null, name: 'Bot fills this seat', role: '', you: false },
      { id: null, name: 'Bot fills this seat', role: '', you: false },
    ]);
    expect(s.others).toEqual([]);
    expect(s.people).toBe(1);
    expect(s.bots).toBe(59);
  });

  it('shows friends in your Squad and the other Squads with room to join', () => {
    const s = royaleSquads(lobby({ players: ['p1', 'p2', 'p3', 'p4'], squadSize: 2, squads: { p1: 1, p2: 2, p3: 1, p4: 2 } }), 'p2', names);
    expect(s.mine).toMatchObject({ squad: 2, open: false });
    expect(s.mine?.slots.map((x) => [x.name, x.role])).toEqual([
      ['Marta', 'You'],
      ['Pau', 'Friend'],
    ]);
    expect(s.others).toEqual([{ squad: 1, open: false, slots: [{ id: 'p1', name: 'Aleix', role: 'Host', you: false }, { id: 'p3', name: 'Joan', role: 'Friend', you: false }] }]);
    expect(s.bots).toBe(56);
  });

  it('offers a new Squad only to someone who has company in theirs', () => {
    expect(royaleSquads(lobby({ players: ['p1', 'p2'], squads: { p1: 1, p2: 1 } }), 'p2', names).newSquad).toBe(2);
    expect(royaleSquads(lobby({ players: ['p1', 'p2'], squads: { p1: 1, p2: 3 } }), 'p2', names).newSquad).toBeNull();
    // A free number, not the next one up.
    expect(royaleSquads(lobby({ players: ['p1', 'p2', 'p3'], squads: { p1: 2, p2: 2, p3: 3 } }), 'p1', names).newSquad).toBe(1);
  });

  it('plays Solos with no Squads to join', () => {
    const s = royaleSquads(lobby({ players: ['p1', 'p2'], squadSize: 1, squads: { p1: 1, p2: 2 } }), 'p1', names);
    expect(s.mine?.slots).toHaveLength(1);
    expect(s.others).toEqual([{ squad: 2, open: false, slots: [{ id: 'p2', name: 'Marta', role: 'Friend', you: false }] }]);
    expect(s.newSquad).toBeNull();
  });

  it('marks a Squad with an empty seat as open', () => {
    const s = royaleSquads(lobby({ players: ['p1', 'p2'], squads: { p1: 1, p2: 2 } }), 'p1', names);
    expect(s.others[0]).toMatchObject({ squad: 2, open: true });
  });
});

describe('the Battle Royale screen’s server line', () => {
  const status = { map: 'survival-town', mode: 'tdm', players: 0, capacity: 8, phase: 'lobby', lobby: true, lobbyMode: 'tdm', royale: true };

  it('says when nothing answers', () => {
    expect(royaleServer(null)).toMatchObject({ tone: 'down', join: false });
  });

  it('opens a lobby on an empty server, as its host', () => {
    expect(royaleServer(status)).toEqual({ tone: 'up', join: true, line: 'The server is free: you open the Battle Royale lobby and pick the Squad size.' });
  });

  it('joins a Battle Royale lobby with people in it', () => {
    expect(royaleServer({ ...status, players: 2, lobbyMode: 'battle-royale' })).toEqual({ tone: 'up', join: true, line: '2 players in the Battle Royale lobby. Join them.' });
  });

  it('can’t open one while the server plays a team mode with people', () => {
    expect(royaleServer({ ...status, players: 3, phase: 'playing' })).toEqual({ tone: 'busy', join: false, line: 'The server is playing Team deathmatch with 3 players. Battle Royale opens when they finish and leave.' });
    expect(royaleServer({ ...status, players: 1 })).toEqual({ tone: 'busy', join: false, line: '1 player in the server’s Team deathmatch lobby. Battle Royale opens when it empties.' });
  });

  it('joins a Battle Royale under way to wait for the next', () => {
    expect(royaleServer({ ...status, players: 2, phase: 'playing', mode: 'battle-royale', lobbyMode: 'battle-royale' })).toEqual({ tone: 'busy', join: true, line: 'A Battle Royale is under way with 2 players. Join to watch it and play the next one.' });
  });

  it('says so when the server has no island', () => {
    expect(royaleServer({ ...status, royale: false })).toMatchObject({ tone: 'down', join: false, line: 'This server has no Battle Royale map yet.' });
  });

  it('knows when joining opens a fresh lobby, whose size the joiner picks', () => {
    expect(royaleOpens(null)).toBe(true);
    expect(royaleOpens(status)).toBe(true);
    expect(royaleOpens({ ...status, players: 1, lobbyMode: 'battle-royale' })).toBe(false);
    // Seats held for people who dropped keep a match under way.
    expect(royaleOpens({ ...status, players: 0, away: 2, phase: 'playing', mode: 'battle-royale', lobbyMode: 'battle-royale' })).toBe(false);
  });

  it('says so when the server is full', () => {
    expect(royaleServer({ ...status, players: 8, lobbyMode: 'battle-royale' })).toMatchObject({ tone: 'busy', join: false });
  });
});

describe('the Battle Royale screen once joined', () => {
  const session = (over: Partial<RoyaleSessionState>): RoyaleSessionState => ({ host: true, hostName: 'Aleix', phase: 'lobby', loading: null, seated: false, reconnecting: false, ...over });

  it('lets the host start, and has everyone else wait for them', () => {
    expect(royaleSession(session({}))).toEqual({ tone: 'up', line: 'In the lobby. You are the host: start when your Squad is ready.', go: { label: 'Start match', act: 'start' }, picks: true });
    expect(royaleSession(session({ host: false }))).toEqual({ tone: 'up', line: 'In the lobby. Aleix starts the match.', go: { label: 'Waiting for host', act: null }, picks: false });
  });

  it('says the connection is coming back, and holds Start and the picks, while it reconnects (ticket 38)', () => {
    const host = royaleSession(session({ reconnecting: true }));
    expect(host.tone).toBe('busy');
    expect(host.line).toBe('Lost the connection to the server. Reconnecting: the match waits until it’s back.');
    expect(host.go).toEqual({ label: 'Reconnecting…', act: null });
    expect(host.picks).toBe(false);
    expect(royaleSession(session({ reconnecting: true, phase: 'playing', seated: true })).go.act).toBeNull();
  });

  it('offers the match under way once the island is built', () => {
    expect(royaleSession(session({ phase: 'playing', seated: true }))).toMatchObject({ tone: 'busy', go: { label: 'Join the match', act: 'enter' }, picks: false });
    expect(royaleSession(session({ phase: 'playing', loading: 'Zero Island' }))).toMatchObject({ line: 'The match has started. Building Zero Island first.', go: { label: 'Building the island…', act: null } });
    expect(royaleSession(session({ phase: 'playing' })).go.label).toBe('Watch the match');
  });
});
