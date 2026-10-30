import { describe, expect, it } from 'vitest';
import type { Score } from '@duty-shooter/fps-core';
import { BOT_MAPS, chargeRoster, connectionError, endSummary, lastMatch, loadoutOptions, lobbyBots, lobbyFill, lobbySeats, lobbyTile, matchBar, matchSize, ordinal, pingTone, scoreboard, weaponCard } from '../src/ui/model';

const score = (id: string, team: number, kills: number, deaths: number, name = id): Score => ({ id, team, name, kills, deaths, score: kills });

describe('the scoreboard', () => {
  const scores = [score('a', 1, 3, 4), score('b', 2, 9, 1), score('c', 1, 7, 2), score('d', 2, 2, 2)];

  it('ranks free-for-all by kills, then fewest deaths, with each ping', () => {
    const board = scoreboard(scores, 'ffa', { a: 40, b: 12 });
    expect(board.kind).toBe('ffa');
    if (board.kind !== 'ffa') return;
    expect(board.rows.map((r) => r.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(board.rows.map((r) => r.place)).toEqual([1, 2, 3, 4]);
    expect(board.rows[0]!.ping).toBe(12);
    expect(board.rows[1]!.ping).toBeNull();
  });

  it('splits team deathmatch into the two teams, each ranked, with the team totals', () => {
    const board = scoreboard(scores, 'tdm', {}, [
      { team: 1, score: 10 },
      { team: 2, score: 11 },
    ]);
    expect(board.kind).toBe('tdm');
    if (board.kind !== 'tdm') return;
    expect(board.teams.map((t) => t.team)).toEqual([1, 2]);
    expect(board.teams[0]!.rows.map((r) => r.id)).toEqual(['c', 'a']);
    expect(board.teams[1]!.rows.map((r) => r.id)).toEqual(['b', 'd']);
    expect(board.teams.map((t) => t.score)).toEqual([10, 11]);
  });

  it('counts players sharing kills and deaths as tied for the place', () => {
    const board = scoreboard([score('a', 1, 5, 1), score('b', 2, 5, 1), score('c', 3, 1, 1)], 'ffa', {});
    if (board.kind !== 'ffa') throw new Error('ffa');
    expect(board.rows.map((r) => r.place)).toEqual([1, 1, 3]);
  });
  it('marks bots, so they show with a BOT tag', () => {
    const board = scoreboard([score('a', 1, 2, 1), { ...score('b', 2, 1, 1), bot: true }], 'ffa', {});
    if (board.kind !== 'ffa') throw new Error('ffa');
    expect(board.rows.map((r) => [r.id, r.bot])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });
});

describe('the match bar', () => {
  it('shows both team scores in team deathmatch, marking yours', () => {
    const bar = matchBar({ mode: 'tdm', teamScores: [{ team: 1, score: 40 }, { team: 2, score: 52 }], killLimit: 75 }, [], 'me', 2);
    expect(bar).toEqual({ kind: 'tdm', teams: [{ team: 1, score: 40, mine: false }, { team: 2, score: 52, mine: true }], limit: 75 });
  });

  it('shows both team scores in Outposts, against the score limit', () => {
    const bar = matchBar({ mode: 'outposts', teamScores: [{ team: 1, score: 120 }, { team: 2, score: 64 }], killLimit: null, scoreLimit: 200 }, [], 'me', 1);
    expect(bar).toEqual({ kind: 'tdm', teams: [{ team: 1, score: 120, mine: true }, { team: 2, score: 64, mine: false }], limit: 200 });
    expect(scoreboard([score('me', 1, 2, 1)], 'outposts', {}).kind).toBe('tdm');
    expect(matchSize('outposts', 3)).toBe('3v3');
    expect(endSummary({ winner: 1, winnerName: 'Blue', draw: false, reason: 'scoreLimit' }, 'outposts', [score('me', 1, 2, 1)], 'me').headline).toEqual({ kind: 'team', team: 1, won: true });
  });

  it('shows the leader and your place in free-for-all', () => {
    const bar = matchBar({ mode: 'ffa', teamScores: null, killLimit: 30 }, [score('a', 1, 4, 0, 'Ana'), score('me', 2, 9, 3, 'Me'), score('b', 3, 12, 1, 'Bo')], 'me', null);
    expect(bar).toEqual({ kind: 'ffa', leader: { name: 'Bo', kills: 12 }, you: { kills: 9, place: 2 }, limit: 30 });
  });
});

describe('the Charge roster', () => {
  const scores = [score('c', 1, 0, 0), { ...score('b2', 2, 0, 0), bot: true }, score('a', 1, 0, 0), score('me', 1, 0, 0), score('b1', 2, 0, 0)];
  const players = [
    { id: 'a', alive: true, health: 71.6 },
    { id: 'me', alive: true, health: 100 },
    { id: 'c', alive: false, health: 0 },
    { id: 'b1', alive: true, health: 40 },
  ];

  it('splits the players into the two sides in a fixed order, alive or dead', () => {
    const [blue, orange] = chargeRoster(scores, players, 'me', 1, null);
    expect(blue!.team).toBe(1);
    expect(blue!.cards.map((c) => [c.id, c.alive, c.you])).toEqual([
      ['a', true, false],
      ['c', false, false],
      ['me', true, true],
    ]);
    // b2 is not in the snapshot, so counts as dead.
    expect(orange!.cards.map((c) => [c.id, c.alive, c.bot])).toEqual([
      ['b1', true, false],
      ['b2', false, true],
    ]);
  });

  it("shows your side's health and carrier, and hides the other side's", () => {
    const [blue, orange] = chargeRoster(scores, players, 'me', 1, 'a');
    expect(blue!.cards.map((c) => c.health)).toEqual([72, null, 100]);
    expect(blue!.cards.map((c) => c.carrier)).toEqual([true, false, false]);
    expect(orange!.cards.map((c) => c.health)).toEqual([null, null]);
    expect(chargeRoster(scores, players, 'me', 2, 'a')[0]!.cards.some((c) => c.carrier)).toBe(false);
  });
});

describe('the end of the match', () => {
  it("names the winning team and gives your stats and place", () => {
    const end = endSummary({ winner: 2, winnerName: 'Orange', draw: false, reason: 'killLimit' }, 'tdm', [score('me', 2, 6, 3), score('x', 1, 9, 6)], 'me');
    expect(end.headline).toEqual({ kind: 'team', team: 2, won: true });
    expect(end.you).toEqual({ kills: 6, deaths: 3, ratio: '2.00', place: 2, of: 2 });
  });

  it('says draw on a tie, and who won in free-for-all', () => {
    expect(endSummary({ winner: null, winnerName: null, draw: true, reason: 'timeLimit' }, 'tdm', [], null).headline).toEqual({ kind: 'draw' });
    expect(endSummary({ winner: 'b', winnerName: 'Bo', draw: false, reason: 'killLimit' }, 'ffa', [score('b', 1, 30, 2, 'Bo')], 'me').headline).toEqual({ kind: 'player', name: 'Bo', you: false });
  });
});

describe('connection errors', () => {
  it('reads each failure as a title, an explanation and what to do', () => {
    expect(connectionError('The server is full.').kind).toBe('full');
    expect(connectionError('The game was updated. Reload the page.').kind).toBe('version');
    expect(connectionError('Disconnected: connection lost.').kind).toBe('down');
    expect(connectionError(null).kind).toBe('down');
    expect(connectionError('Wrong passphrase.').kind).toBe('passphrase');
    // Away too long (a background tab): the server let the slot go, which is not the server being down.
    expect(connectionError('Disconnected: idle.').kind).toBe('idle');
    for (const s of ['The server is full.', 'The game was updated. Reload the page.', null, 'Pick another name.', 'Disconnected: idle.']) {
      const e = connectionError(s);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.body.length).toBeGreaterThan(0);
    }
  });
});

describe('the Play Online tile', () => {
  it('shows the server up with players, mode and map, and offers the mode picker only when empty', () => {
    const up = lobbyTile({ map: 'survival-town', mode: 'tdm', players: 3, capacity: 8, phase: 'playing' });
    expect(up).toEqual({ online: true, players: '3/8', mode: 'Team deathmatch', map: 'Survival Town', pickMode: false, full: false, bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0, hvb: false });
    expect(lobbyTile({ map: 'survival-town', mode: 'ffa', players: 0, capacity: 8, phase: 'playing' }).pickMode).toBe(true);
    expect(lobbyTile({ map: 'survival-town', mode: 'ffa', players: 8, capacity: 8, phase: 'playing' }).full).toBe(true);
    expect(lobbyTile(null)).toEqual({ online: false, players: '–', mode: '–', map: '–', pickMode: false, full: false, bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0, hvb: false });
    expect(lobbyTile({ map: 'switchyard', mode: 'outposts', players: 2, capacity: 12, phase: 'playing', bots: 4, hvb: true })).toMatchObject({ map: 'Switchyard', bots: 4, hvb: true });
    expect(BOT_MAPS).toContain('crash');
    expect(lobbyTile({ map:'crash', mode:'tdm', players:1, capacity:8, phase:'playing' }).map).toBe('Crash');
    expect(lobbyTile({ map: 'survival-town', mode: 'tdm', players: 1, capacity: 8, phase: 'playing', bots: 5, botsPerTeam: 3, maxBotsPerTeam: 4 })).toMatchObject({ bots: 5, botsPerTeam: 3, maxBotsPerTeam: 4 });
    // With a lobby the host picks the mode there, not the join form.
    expect(lobbyTile({ map: 'survival-town', mode: 'ffa', players: 0, capacity: 8, phase: 'lobby', lobby: true }).pickMode).toBe(false);
  });

  it('names match sizes the way each mode counts them', () => {
    expect(matchSize('tdm', 3)).toBe('3v3');
    expect(matchSize('ffa', 3)).toBe('6 players');
  });

  it('writes places as ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

describe('the loadout screen', () => {
  const bar = (id: Parameters<typeof weaponCard>[0], key: string) => weaponCard(id).bars.find((b) => b.key === key)!;

  it('offers every primary, the pistol and the frag (or none), all unlocked', () => {
    expect(loadoutOptions()).toEqual({ primary: ['m4a1', 'smg', 'shotgun', 'sniper'], secondary: ['pistol'], grenade: ['frag', null] });
  });

  it("shows each weapon's name, role and four bars between empty and full", () => {
    for (const id of ['m4a1', 'smg', 'shotgun', 'sniper', 'pistol'] as const) {
      const card = weaponCard(id);
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.role.length).toBeGreaterThan(0);
      expect(card.bars.map((b) => b.key)).toEqual(['rate', 'damage', 'range', 'handling']);
      for (const b of card.bars) {
        expect(b.value).toBeGreaterThan(0);
        expect(b.value).toBeLessThanOrEqual(1);
        expect(b.text.length).toBeGreaterThan(0);
      }
    }
  });

  it('ranks the bars the way the weapons play', () => {
    expect(bar('smg', 'rate').value).toBe(1);
    expect(bar('m4a1', 'rate').value).toBeGreaterThan(bar('pistol', 'rate').value);
    expect(bar('pistol', 'rate').value).toBeGreaterThan(bar('shotgun', 'rate').value);
    expect(bar('shotgun', 'damage').value).toBeGreaterThan(bar('m4a1', 'damage').value);
    expect(bar('sniper', 'damage').value).toBeGreaterThan(bar('smg', 'damage').value);
    expect(bar('sniper', 'range').value).toBe(1);
    expect(bar('m4a1', 'range').value).toBeGreaterThan(bar('smg', 'range').value);
    expect(bar('smg', 'range').value).toBeGreaterThan(bar('shotgun', 'range').value);
    expect(bar('pistol', 'handling').value).toBe(1);
    expect(bar('sniper', 'handling').value).toBeLessThan(bar('m4a1', 'handling').value);
  });

  it('writes the figure behind each bar', () => {
    expect(bar('m4a1', 'rate').text).toBe('809 rpm');
    expect(bar('m4a1', 'damage').text).toBe('28');
    expect(bar('shotgun', 'damage').text).toBe('8 × 30');
    expect(bar('m4a1', 'range').text).toBe('50 m');
    expect(bar('sniper', 'range').text).toBe('100 m+');
    expect(bar('m4a1', 'handling').text).toBe('ADS 0.24 s');
  });
});

describe('the lobby', () => {
  const lobby = { host: 'b', players: ['b', 'a', 'c'], capacity: 5, mode: 'tdm', bots: 2, custom: false, maxBots: 4, hvb: false, maps: ['survival-town'], map: 'survival-town' } as const;

  it('seats people in the order they joined, marks the host and you, then the bots the match brings and the open seats', () => {
    const seats = lobbySeats(lobby, 'a', { a: 'Ada', b: 'Bo' }, { a: 40, b: 150 });
    expect(seats.map((s) => [s.number, s.id, s.name, s.ping, s.host, s.you, s.bot])).toEqual([
      [1, 'b', 'Bo', 150, true, false, false],
      [2, 'a', 'Ada', 40, false, true, false],
      [3, 'c', 'c', null, false, false, false],
      [4, null, 'Bot', null, false, false, true],
      [5, null, '', null, false, false, false],
    ]);
  });

  it('counts the bots the match will bring as the server rosters them', () => {
    expect(lobbyBots(lobby)).toBe(1);
    expect(lobbyBots({ ...lobby, bots: 0 })).toBe(0);
    expect(lobbyBots({ ...lobby, maxBots: 0 })).toBe(0);
    // Never more than the seats left.
    expect(lobbyBots({ ...lobby, bots: 4 })).toBe(2);
    // Humans vs bots: two more than the people, at least 4, within the seats.
    const big = { ...lobby, capacity: 12, maxBots: 6 };
    expect(lobbyBots({ ...big, hvb: true })).toBe(5);
    expect(lobbyBots({ ...big, hvb: true, mode: 'ffa', bots: 3 })).toBe(3);
  });

  it('says who the people will play with: bots filling the sides, humans vs bots in a team mode, or just the people', () => {
    expect(lobbyFill(lobby)).toBe('Bots fill the match to 2v2 when it starts.');
    const big = { ...lobby, capacity: 12, maxBots: 6 };
    expect(lobbyFill({ ...big, hvb: true })).toMatch(/everyone here plays together against 5 bots/);
    expect(lobbyFill({ ...big, hvb: true, players: ['a'] })).toMatch(/against 4 bots, two more than you \(at least 4, at most 6\)/);
    // Free-for-all has no sides to take.
    expect(lobbyFill({ ...big, hvb: true, mode: 'ffa' })).toBe('Bots fill the match to 4 players when it starts.');
    expect(lobbyFill({ ...lobby, bots: 0 })).toBe('No bots: just the people here.');
  });

  it('colours pings good under 100 ms, fair under 200, poor above', () => {
    expect([pingTone(38), pingTone(99), pingTone(100), pingTone(199), pingTone(247)]).toEqual(['good', 'good', 'fair', 'fair', 'poor']);
  });

  it('recalls the last match: winner and totals in team modes, the winner alone in free-for-all, or a draw', () => {
    expect(lastMatch(null, 'tdm', null)).toBeNull();
    const teams = [{ team: 1, score: 60 }, { team: 2, score: 75 }];
    expect(lastMatch({ winner: 2, winnerName: 'Orange', draw: false, reason: 'killLimit' }, 'tdm', teams)).toEqual({ headline: 'Orange won 75 to 60', detail: 'Team deathmatch · kill limit' });
    expect(lastMatch({ winner: 'p1', winnerName: 'Ada', draw: false, reason: 'timeLimit' }, 'ffa', null)).toEqual({ headline: 'Ada won', detail: 'Free-for-all · time limit' });
    expect(lastMatch({ winner: null, winnerName: null, draw: true, reason: 'timeLimit' }, 'outposts', [{ team: 1, score: 0 }, { team: 2, score: 0 }])).toEqual({ headline: 'Draw 0 to 0', detail: 'Outposts · time limit' });
  });
});
