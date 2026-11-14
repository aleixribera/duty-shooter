import { describe, expect, it } from 'vitest';
import { STATS, WEAPON_IDS, type Score } from '@duty-shooter/fps-core';
import { chargeRoster, GRAPHICS_LOST, connectionError, endSummary, lastMatch, loadoutOptions, lobbyBots, pauseActions, lobbyFill, lobbySeats, lobbySides, lobbyTile, loadoutNote, matchBar, matchSize, ordinal, pingTone, randomLobbyPick, scoreboard, weaponCard } from '../src/ui/model';

const MAPS: readonly string[] = ['survival-town', 'switchyard', 'station-nine'];
const NAMES: Readonly<Record<string, string>> = { 'survival-town': 'Survival Town', switchyard: 'Switchyard', 'zero-island': 'Zero Island' };
const mapName = (id: string) => NAMES[id] ?? id;

describe('random lobby picks', () => {
  it('can pick every available map and mode for mixed teams', () => {
    const picks = Array.from({ length: 5 * MAPS.length }, (_, i) => {
      const values = [(Math.floor(i / 5) + 0.5) / MAPS.length, ((i % 5) + 0.5) / 5];
      return randomLobbyPick({ maps: MAPS, hvb: false }, () => values.shift()!);
    });
    expect(new Set(picks.map((pick) => pick?.map))).toEqual(new Set(MAPS));
    expect(new Set(picks.map((pick) => pick?.mode))).toEqual(new Set(['tdm', 'ffa', 'outposts', 'charge', 'gungame']));
    expect(new Set(picks.map((pick) => `${pick?.map}/${pick?.mode}`)).size).toBe(5 * MAPS.length);
  });

  it('only picks team modes for humans vs bots and leaves the setting out of the change', () => {
    const picks = Array.from({ length: 3 }, (_, i) => {
      const values = [0.99, (i + 0.5) / 3];
      return randomLobbyPick({ maps: MAPS, hvb: true }, () => values.shift()!);
    });
    expect(picks).toEqual(['tdm', 'outposts', 'charge'].map((mode) => ({ map: MAPS.at(-1), mode })));
    expect(randomLobbyPick({ maps: [], hvb: true })).toBeNull();
  });
});

const score = (id: string, team: number, kills: number, deaths: number, name = id): Score => ({ id, team, name, kills, deaths, score: kills * 100, assists: 0 });

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
    expect(bar).toEqual({ kind: 'ffa', leader: { name: 'Bo', kills: 12, place: 1, stands: 'leads' }, you: { kills: 9, place: 2 }, limit: 30 });
  });

  it('never names you as the leader beside your own first place: leading, it shows who chases you; level, who you share it with', () => {
    const lead = matchBar({ mode: 'ffa', teamScores: null, killLimit: 30 }, [score('a', 1, 4, 0, 'Ana'), score('me', 2, 9, 3, 'Me'), score('b', 3, 7, 1, 'Bo')], 'me', null);
    expect(lead.kind === 'ffa' && lead.leader).toEqual({ name: 'Bo', kills: 7, place: 2, stands: 'chases' });
    const level = matchBar({ mode: 'ffa', teamScores: null, killLimit: 30 }, [score('me', 2, 0, 0, 'Me'), score('b', 3, 0, 0, 'Bo')], 'me', null);
    expect(level.kind === 'ffa' && level.leader).toEqual({ name: 'Bo', kills: 0, place: 1, stands: 'tied' });
  });

  it("gives the same place on the bar, the scoreboard and the results in gun game, ranked by the ladder then kills, not the Score", () => {
    // Gu's assists give a higher Score on fewer kills: the race still puts Me ahead.
    const scores: Score[] = [{ ...score('me', 1, 4, 2, 'Me'), score: 400, progress: 4 }, { ...score('g', 2, 3, 2, 'Gu'), score: 650, progress: 4 }, { ...score('t', 3, 6, 1, 'Top'), progress: 6 }];
    const status = { mode: 'gungame' as const, teamScores: null, killLimit: 21, objective: { kind: 'gungame' as const, guns: WEAPON_IDS.slice(0, 7) } };
    const bar = matchBar(status, scores, 'me', null);
    const board = scoreboard(scores, 'gungame', {});
    if (bar.kind !== 'gungame' || board.kind !== 'ffa') throw new Error('gungame');
    expect(bar.you?.place).toBe(2);
    expect(board.rows.map((r) => r.id)).toEqual(['t', 'me', 'g']);
    expect(endSummary(null, 'gungame', scores, 'me').you?.place).toBe(2);
    expect(bar.leader).toEqual({ name: 'Top', level: 3, place: 1, stands: 'leads' });
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
    expect(end.you).toEqual({ score: 600, kills: 6, deaths: 3, assists: 0, ratio: '2.00', place: 2, of: 2 });
  });

  it('says draw on a tie, and who won in free-for-all', () => {
    expect(endSummary({ winner: null, winnerName: null, draw: true, reason: 'timeLimit' }, 'tdm', [], null).headline).toEqual({ kind: 'draw' });
    expect(endSummary({ winner: 'b', winnerName: 'Bo', draw: false, reason: 'killLimit' }, 'ffa', [score('b', 1, 30, 2, 'Bo')], 'me').headline).toEqual({ kind: 'player', name: 'Bo', you: false, verb: 'wins' });
  });
});

describe('connection errors', () => {
  it('reads each failure as a title, an explanation and what to do', () => {
    expect(connectionError('Removed by the host.').kind).toBe('kicked');
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
    const up = lobbyTile({ map: 'survival-town', mode: 'tdm', players: 3, capacity: 8, phase: 'playing' }, mapName);
    expect(up).toEqual({ online: true, players: '3/8', mode: 'Team deathmatch', map: 'Survival Town', pickMode: false, full: false, bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0, hvb: false });
    expect(lobbyTile({ map: 'survival-town', mode: 'ffa', players: 0, capacity: 8, phase: 'playing' }, mapName).pickMode).toBe(true);
    expect(lobbyTile({ map: 'survival-town', mode: 'ffa', players: 8, capacity: 8, phase: 'playing' }, mapName).full).toBe(true);
    expect(lobbyTile(null)).toEqual({ online: false, players: '–', mode: '–', map: '–', pickMode: false, full: false, bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0, hvb: false });
    expect(lobbyTile({ map: 'switchyard', mode: 'outposts', players: 2, capacity: 12, phase: 'playing', bots: 4, hvb: true }, mapName)).toMatchObject({ map: 'Switchyard', bots: 4, hvb: true });
    expect(lobbyTile({ map: 'zero-island', mode: 'battle-royale', players: 2, capacity: 60, phase: 'playing' }, mapName)).toMatchObject({ map: 'Zero Island', mode: 'Battle Royale' });
    expect(lobbyTile({ map: 'survival-town', mode: 'tdm', players: 1, capacity: 8, phase: 'playing', bots: 5, botsPerTeam: 3, maxBotsPerTeam: 4 }, mapName)).toMatchObject({ bots: 5, botsPerTeam: 3, maxBotsPerTeam: 4 });
    // With a lobby the host picks the mode there, not the join form.
    expect(lobbyTile({ map: 'survival-town', mode: 'ffa', players: 0, capacity: 8, phase: 'lobby', lobby: true }, mapName).pickMode).toBe(false);
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

  it('offers every primary, every sidearm, the frag, each tactical and each perk (or none), all unlocked', () => {
    const inSlot = (slot: 'primary' | 'secondary') => WEAPON_IDS.filter((id) => STATS.weapons[id].traits.slot === slot);
    expect(loadoutOptions()).toEqual({ primary: inSlot('primary'), secondary: inSlot('secondary'), grenade: ['frag', null], tactical: ['smoke', 'flash', null], perk: ['fastHands', 'softSoles', 'blastVest', null] });
    expect(inSlot('primary').length + inSlot('secondary').length).toBe(WEAPON_IDS.length);
  });

  it("shows each weapon's name, role and four bars between empty and full", () => {
    for (const id of WEAPON_IDS) {
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

  it('ranks the four newer guns by their roles', () => {
    // The machine gun is the slowest of the automatics to bring to bear.
    expect(bar('lmg', 'handling').value).toBeLessThan(bar('m4a1', 'handling').value);
    expect(bar('lmg', 'handling').value).toBeLessThan(bar('burst', 'handling').value);
    // The marksman rifle sits between the M4A1 and the sniper rifle, in what a round does and how far.
    expect(bar('dmr', 'damage').value).toBeGreaterThan(bar('m4a1', 'damage').value);
    expect(bar('dmr', 'damage').value).toBeLessThan(bar('sniper', 'damage').value);
    expect(bar('dmr', 'range').value).toBeGreaterThan(bar('m4a1', 'range').value);
    expect(bar('dmr', 'rate').value).toBeLessThan(bar('m4a1', 'rate').value);
    // A round of the burst rifle's hits harder than the M4A1's: three of them have to be enough.
    expect(bar('burst', 'damage').value).toBeGreaterThan(bar('m4a1', 'damage').value);
    // The revolver against the pistol: heavier, slower.
    expect(bar('revolver', 'damage').value).toBeGreaterThan(bar('pistol', 'damage').value);
    expect(bar('revolver', 'rate').value).toBeLessThan(bar('pistol', 'rate').value);
    expect(bar('revolver', 'handling').value).toBeLessThan(bar('pistol', 'handling').value);
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
  const lobby = { host: 'b', players: ['b', 'a', 'c'], capacity: 5, mode: 'tdm', bots: 2, custom: false, maxBots: 4, hvb: false, maps: ['survival-town'], map: 'survival-town', squadSize: 1, squads: {} } as const;

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

  it('stands people on the sides the host set online, and each bot the match brings on the side with fewer', () => {
    const sided = { ...lobby, capacity: 8, sides: { b: 1, a: 2, c: 2 } };
    const sides = lobbySides(sided, lobbySeats(sided, 'a', {}, {}));
    expect(sides?.map((side) => side.map((s) => s.id ?? 'bot'))).toEqual([['b', 'bot'], ['a', 'c']]);
    expect(lobbySides({ ...sided, mode: 'ffa' }, [])).toBeNull();
    expect(lobbySides({ ...sided, hvb: true }, [])).toBeNull();
    expect(lobbySides(lobby, [])).toBeNull();
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
    const sides = lobbyFill(lobby);
    expect(sides).toContain('2v2');
    const big = { ...lobby, capacity: 12, maxBots: 6 };
    const hvb = lobbyFill({ ...big, hvb: true });
    expect(hvb).toMatch(/\b5 bots\b/);
    expect(lobbyFill({ ...big, hvb: true, players: ['a'] })).toMatch(/\b4 bots\b/);
    // Free-for-all has no sides to take.
    const ffa = lobbyFill({ ...big, hvb: true, mode: 'ffa' });
    expect(ffa).toContain('4');
    expect(ffa).not.toMatch(/\dv\d/);
    const none = lobbyFill({ ...lobby, bots: 0 });
    expect(none).not.toMatch(/\d/);
    expect(new Set([sides, hvb, ffa, none]).size).toBe(4);
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

  it('places you in a Battle Royale that ended with no person left, never a draw (ticket 39)', () => {
    const noHumans = { winner: null, winnerName: null, draw: false, reason: 'noHumans' } as const;
    expect(lastMatch(noHumans, 'battle-royale', null, { place: 37, of: 60 })).toEqual({ headline: '37th of 60', detail: 'Battle Royale · no players left' });
    // Someone who wasn't in it has no place: still not a draw.
    expect(lastMatch(noHumans, 'battle-royale', null, null)).toEqual({ headline: 'No winner', detail: 'Battle Royale · no players left' });
    expect(lastMatch({ winner: 4, winnerName: 'Ada, Bo', draw: false, reason: 'lastSquad' }, 'battle-royale', null, { place: 2, of: 30 })).toEqual({ headline: 'Ada, Bo won', detail: 'Battle Royale · last squad standing' });
  });
});

describe('when a loadout change applies, as the loadout screen says it', () => {
  it('at once offline, from the next spawn online', () => {
    expect(loadoutNote({ online: false, mode: 'tdm', phase: 'playing', preparing: false })).not.toBe(loadoutNote({ online: true, mode: 'tdm', phase: 'playing', preparing: false }));
  });

  it('in a Battle Royale, at the drop until the Preparation ends, then from the next match (ticket 59)', () => {
    const lobbyNote = loadoutNote({ online: true, mode: 'battle-royale', phase: 'lobby', preparing: false });
    expect(loadoutNote({ online: true, mode: 'battle-royale', phase: 'playing', preparing: true })).toBe(lobbyNote);
    const locked = loadoutNote({ online: true, mode: 'battle-royale', phase: 'playing', preparing: false });
    expect(locked).not.toBe(lobbyNote);
    expect(locked).not.toBe(loadoutNote({ online: true, mode: 'tdm', phase: 'playing', preparing: false }));
  });
});

describe("the pause screen's Controls list", () => {
  it('names the island map only in a Battle Royale, the one mode with a map', () => {
    expect(pauseActions('battle-royale')).toContain('map');
    for (const mode of ['tdm', 'ffa', 'charge', 'outposts', 'gungame'] as const) expect(pauseActions(mode), mode).not.toContain('map');
    expect(pauseActions(null)).not.toContain('map');
  });

  it('lists the rest of the bound keys in every mode', () => {
    expect(pauseActions('tdm')).toEqual(['fire', 'ads', 'sprint', 'crouch', 'prone', 'jump', 'reload', 'melee', 'switchWeapon', 'grenade', 'tactical', 'use', 'scoreboard']);
  });
});

describe('the graphics stopping (ticket 61)', () => {
  it('is its own error, which a reload mends', () => {
    const e = connectionError(GRAPHICS_LOST);
    expect(e.kind).toBe('gpu');
    expect(e.title).toBe('Graphics stopped');
    expect(e.body).toMatch(/Reload/);
  });
});
