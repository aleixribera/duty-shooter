import { describe, expect, it } from 'vitest';
import type { Score } from '@duty-shooter/fps-core';
import { connectionError, endSummary, loadoutOptions, lobbyTile, matchBar, matchSize, ordinal, scoreboard, weaponCard } from '../src/ui/model';

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

  it('shows the leader and your place in free-for-all', () => {
    const bar = matchBar({ mode: 'ffa', teamScores: null, killLimit: 30 }, [score('a', 1, 4, 0, 'Ana'), score('me', 2, 9, 3, 'Me'), score('b', 3, 12, 1, 'Bo')], 'me', null);
    expect(bar).toEqual({ kind: 'ffa', leader: { name: 'Bo', kills: 12 }, you: { kills: 9, place: 2 }, limit: 30 });
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
    expect(up).toEqual({ online: true, players: '3/8', mode: 'Team deathmatch', map: 'Survival Town', pickMode: false, full: false, bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0 });
    expect(lobbyTile({ map: 'survival-town', mode: 'ffa', players: 0, capacity: 8, phase: 'playing' }).pickMode).toBe(true);
    expect(lobbyTile({ map: 'survival-town', mode: 'ffa', players: 8, capacity: 8, phase: 'playing' }).full).toBe(true);
    expect(lobbyTile(null)).toEqual({ online: false, players: '–', mode: '–', map: '–', pickMode: false, full: false, bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0 });
    expect(lobbyTile({ map: 'survival-town', mode: 'tdm', players: 1, capacity: 8, phase: 'playing', bots: 5, botsPerTeam: 3, maxBotsPerTeam: 4 })).toMatchObject({ bots: 5, botsPerTeam: 3, maxBotsPerTeam: 4 });
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
    expect(bar('shotgun', 'damage').text).toBe('8 � 20');
    expect(bar('m4a1', 'range').text).toBe('50 m');
    expect(bar('sniper', 'range').text).toBe('100 m+');
    expect(bar('m4a1', 'handling').text).toBe('ADS 0.24 s');
  });
});
