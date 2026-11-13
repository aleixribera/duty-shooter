import { GUN_GAME_KILLS_PER_GUN, GUN_GAME_LADDER_LENGTH, LOBBY_MODES, PERK_IDS, STATS, TACTICAL_IDS, WEAPON_IDS, hvbBots, rangeDamage, slotWeapons, teamMode, type GrenadeId, type LobbyState, type PerkId, type TacticalId, type MatchResult, type Medal, type ModeId, type ObjectiveState, type Phase, type PlayerId, type Score, type TeamScore, type WeaponId, gunGameLevel } from '@duty-shooter/fps-core';
import type { Action } from '../settings';

/** What the lobby status endpoint reports, shown on the Play Online tile. */
export interface LobbyInfo {
  readonly map: string;
  readonly mode: string;
  readonly players: number;
  readonly capacity: number;
  readonly phase: string;
  /** Bots playing now, and the fill a side (absent from servers older than bots). */
  readonly bots?: number;
  readonly botsPerTeam?: number;
  /** The most bots a side a first joiner may pick; 0 when the server has bots off. */
  readonly maxBotsPerTeam?: number;
  /** Seats held for people who dropped and may come back (absent from servers older than rejoining). */
  readonly away?: number;
  /** The host picks and starts each match in a lobby (absent from servers older than the lobby). */
  readonly lobby?: boolean;
  /** Whether the match is humans vs bots (absent from servers older than it). */
  readonly hvb?: boolean;
  /** The mode the lobby is set for next, and whether the server holds a Battle Royale map (absent from servers older than the Battle Royale screen). */
  readonly lobbyMode?: string;
  readonly squadSize?: number;
  readonly royale?: boolean;
  /** A Battle Royale process still warming up: it takes players once this is gone (ADR 0009). */
  readonly starting?: boolean;
}

export const MODE_NAMES: Readonly<Record<string, string>> = { tdm: 'Team deathmatch', ffa: 'Free-for-all', outposts: 'Outposts', charge: 'Charge', gungame: 'Gun game', 'battle-royale': 'Battle Royale' };
/** How each way a match can end reads on the end screen. */
export const END_REASONS: Readonly<Record<MatchResult['reason'], string>> = { killLimit: 'kill limit', scoreLimit: 'score limit', timeLimit: 'time limit', roundLimit: 'round limit', forfeit: 'forfeit', lastSquad: 'last squad standing', noHumans: 'no players left' };
/** Teams always appear with their mark and name, never by colour alone. */
export const TEAMS: Readonly<Record<number, { readonly name: string; readonly mark: string }>> = { 1: { name: 'Blue', mark: '◆' }, 2: { name: 'Orange', mark: '▲' } };

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

export interface BoardRow {
  readonly id: PlayerId;
  readonly name: string;
  /** Played by the server, shown with a BOT tag. */
  readonly bot: boolean;
  /** Their Score: the points of the match. */
  readonly score: number;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  /** Round trip in ms, or null when the server has not heard it yet. */
  readonly ping: number | null;
  /** 1 for the best; players level on everything the order goes by share a place. */
  readonly place: number;
  /** Gun game: the level they are on, from 1; null in other modes. */
  readonly level: number | null;
}

export type Board =
  | { readonly kind: 'ffa'; readonly rows: readonly BoardRow[]; readonly levels: boolean }
  | { readonly kind: 'tdm'; readonly teams: readonly { readonly team: number; readonly score: number; readonly rows: readonly BoardRow[] }[] };

/** Gun game's level as shown: the gun a player is on, from 1 (their progress is their kills up the ladder). */
function level(s: Score): number {
  return gunGameLevel(s.progress ?? 0) + 1;
}

/**
 * The seats in order. `by` 'score' is the scoreboard's order: the highest
 * Score first, then most kills, then fewest deaths. 'kills' is the race a
 * free-for-all is won by, for the match bar. Gun game puts the furthest up
 * the ladder first either way.
 */
function ranked(scores: readonly Score[], pings: Readonly<Record<string, number>>, mode: ModeId | null = null, by: 'score' | 'kills' = 'score'): BoardRow[] {
  const levels = mode === 'gungame';
  const key = (s: Score) => (levels ? (s.progress ?? 0) : 0);
  const points = (s: Score) => (by === 'score' ? s.score : 0);
  const sorted = [...scores].sort((a, b) => key(b) - key(a) || points(b) - points(a) || b.kills - a.kills || a.deaths - b.deaths);
  const same = (a: Score, b: Score) => key(a) === key(b) && points(a) === points(b) && a.kills === b.kills && a.deaths === b.deaths;
  return sorted.map((s, i) => {
    let place = i + 1;
    while (place > 1 && same(sorted[place - 2]!, s)) place--;
    return { id: s.id, name: s.name, bot: s.bot === true, score: s.score, kills: s.kills, deaths: s.deaths, assists: s.assists, ping: pings[s.id] ?? null, place, level: levels ? level(s) : null };
  });
}

/** The held scoreboard: the free-for-all ranking, or both teams side by side. */
export function scoreboard(scores: readonly Score[], mode: ModeId, pings: Readonly<Record<string, number>>, teamScores: readonly TeamScore[] | null = null): Board {
  if (!teamMode(mode)) return { kind: 'ffa', rows: ranked(scores, pings, mode), levels: mode === 'gungame' };
  return {
    kind: 'tdm',
    teams: [1, 2].map((team) => ({
      team,
      score: teamScores?.find((t) => t.team === team)?.score ?? scores.filter((s) => s.team === team).reduce((n, s) => n + s.kills, 0),
      rows: ranked(
        scores.filter((s) => s.team === team),
        pings,
      ),
    })),
  };
}

export type MatchBar =
  | { readonly kind: 'tdm'; readonly teams: readonly { readonly team: number; readonly score: number; readonly mine: boolean }[]; readonly limit: number | null }
  | { readonly kind: 'ffa'; readonly leader: { readonly name: string; readonly kills: number } | null; readonly you: { readonly kills: number; readonly place: number } | null; readonly limit: number | null }
  /** Gun game: the leader's level and yours (from 1), with your weapon and the next one up. */
  | {
      readonly kind: 'gungame';
      readonly leader: { readonly name: string; readonly level: number } | null;
      /** `toNext`: kills still to make on this gun (to win, on the last). */
      readonly you: { readonly level: number; readonly place: number; readonly weapon: WeaponId | null; readonly next: WeaponId | null; readonly toNext: number } | null;
      /** Guns on the ladder. */
      readonly limit: number;
    };

/** The HUD's top bar: both team scores with yours marked, or the leader and your place (and level, in gun game). */
export function matchBar(
  status: { readonly mode: ModeId; readonly teamScores: readonly TeamScore[] | null; readonly killLimit: number | null; readonly scoreLimit?: number | null; readonly objective?: ObjectiveState | null },
  scores: readonly Score[],
  selfId: PlayerId | null,
  team: number | null,
): MatchBar {
  if (teamMode(status.mode)) {
    return { kind: 'tdm', teams: [1, 2].map((t) => ({ team: t, score: status.teamScores?.find((s) => s.team === t)?.score ?? 0, mine: t === team })), limit: status.killLimit ?? status.scoreLimit ?? null };
  }
  const rows = ranked(scores, {}, status.mode, 'kills');
  const top = rows[0];
  const me = rows.find((r) => r.id === selfId);
  if (status.mode === 'gungame') {
    // This match's ladder, dealt at random by the server.
    const guns = status.objective?.kind === 'gungame' ? status.objective.guns : [];
    const mine = scores.find((s) => s.id === selfId);
    const you = (() => {
      if (!me || !mine) return null;
      const progress = mine.progress ?? 0;
      const at = gunGameLevel(progress);
      const toNext = Math.max(0, (at + 1) * GUN_GAME_KILLS_PER_GUN - progress);
      return { level: at + 1, place: me.place, weapon: guns[at] ?? null, next: at + 1 < GUN_GAME_LADDER_LENGTH ? (guns[at + 1] ?? null) : null, toNext };
    })();
    return { kind: 'gungame', leader: top ? { name: top.name, level: top.level ?? 1 } : null, you, limit: GUN_GAME_LADDER_LENGTH };
  }
  return { kind: 'ffa', leader: top ? { name: top.name, kills: top.kills } : null, you: me ? { kills: me.kills, place: me.place } : null, limit: status.killLimit };
}

/** A player's portrait on the Charge bar: alive or dead, and for your own side their health and who carries the charge. */
export interface RosterCard {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: number;
  readonly bot: boolean;
  readonly alive: boolean;
  readonly you: boolean;
  readonly carrier: boolean;
  /** 0 to 100 for a living teammate (or you); null for the other side and the dead. */
  readonly health: number | null;
}

/**
 * The Charge bar's portraits, team by team in a fixed order so a death greys
 * a card out where it stands. Someone missing from the snapshot counts as
 * dead; the other side's health and carrier stay hidden.
 */
export function chargeRoster(
  scores: readonly Score[],
  players: readonly { readonly id: PlayerId; readonly alive: boolean; readonly health: number }[],
  selfId: PlayerId | null,
  team: number | null,
  carrier: PlayerId | null,
): { readonly team: number; readonly cards: RosterCard[] }[] {
  return [1, 2].map((t) => ({
    team: t,
    cards: scores
      .filter((s) => s.team === t)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((s) => {
        const p = players.find((q) => q.id === s.id);
        const alive = p?.alive ?? false;
        const mine = team !== null && t === team;
        return {
          id: s.id,
          name: s.name,
          team: t,
          bot: s.bot === true,
          alive,
          you: s.id === selfId,
          carrier: mine && alive && s.id === carrier,
          health: mine && alive && p ? Math.max(0, Math.min(100, Math.round(p.health))) : null,
        };
      }),
  }));
}

/** The MVP of a match: the seat with the highest Score. */
export interface Mvp {
  readonly id: PlayerId;
  readonly name: string;
  readonly bot: boolean;
  readonly you: boolean;
  readonly score: number;
  readonly kills: number;
  /** The best Medal they earned, or null. */
  readonly medal: Medal | null;
}

/** The MVP: the highest Score, then the most kills, then the fewest deaths. Null while nobody has scored. */
export function mvpOf(scores: readonly Score[], selfId: PlayerId | null): Mvp | null {
  const top = [...scores].sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths)[0];
  if (!top || top.score <= 0) return null;
  return { id: top.id, name: top.name, bot: top.bot === true, you: top.id === selfId, score: top.score, kills: top.kills, medal: top.medal ?? null };
}

export interface EndSummary {
  readonly headline: { readonly kind: 'draw' } | { readonly kind: 'team'; readonly team: number; readonly won: boolean } | { readonly kind: 'player'; readonly name: string; readonly you: boolean; readonly verb: 'win' | 'wins' } | { readonly kind: 'unknown' };
  readonly you: { readonly score: number; readonly kills: number; readonly deaths: number; readonly assists: number; readonly ratio: string; readonly place: number; readonly of: number } | null;
}

/** "Ada wins", but "Ada and Mate win": a winning Squad of two or three is named in full, and the verb agrees. */
export function winVerb(result: Pick<MatchResult, 'winners'>): 'win' | 'wins' {
  return (result.winners ?? 1) > 1 ? 'win' : 'wins';
}

/** The end-of-match screen: who won (and whether it was you or your team) and your line. */
export function endSummary(result: MatchResult | null, mode: ModeId, scores: readonly Score[], selfId: PlayerId | null): EndSummary {
  const rows = ranked(scores, {}, mode);
  const me = scores.find((s) => s.id === selfId);
  const row = rows.find((r) => r.id === selfId);
  const you = me && row ? { score: me.score, kills: me.kills, deaths: me.deaths, assists: me.assists, ratio: (me.kills / Math.max(1, me.deaths)).toFixed(2), place: row.place, of: rows.length } : null;
  let headline: EndSummary['headline'];
  if (!result) headline = { kind: 'unknown' };
  // A Battle Royale's winner is a Squad, and one that ends for want of people has none.
  else if (mode === 'battle-royale') headline = result.winner === null ? { kind: 'unknown' } : { kind: 'player', name: result.winnerName ?? 'Someone', you: me?.team === result.winner, verb: winVerb(result) };
  else if (result.draw || result.winner === null) headline = { kind: 'draw' };
  else if (teamMode(mode)) headline = { kind: 'team', team: Number(result.winner), won: me?.team === result.winner };
  else headline = { kind: 'player', name: result.winnerName ?? 'Someone', you: result.winner === selfId, verb: winVerb(result) };
  return { headline, you };
}

/** Pick a concrete map and mode without changing the lobby's sides or bot settings. */
export function randomLobbyPick(lobby: Pick<LobbyState, 'maps' | 'hvb'>, random: () => number = Math.random): { map: string; mode: ModeId } | null {
  if (lobby.maps.length === 0) return null;
  const modes = lobby.hvb ? LOBBY_MODES.filter(teamMode) : LOBBY_MODES;
  return { map: lobby.maps[Math.floor(random() * lobby.maps.length)]!, mode: modes[Math.floor(random() * modes.length)]! };
}

/** What each mode is, in a line or two, for the lobby. */
export const MODE_BLURBS: Readonly<Record<string, string>> = {
  tdm: 'Blue against orange. First team to 75 kills, or ahead after 10 minutes.',
  ffa: 'Everyone for themselves. First to 30 kills, or ahead after 10 minutes.',
  outposts: 'Stand in a zone to take it. Every zone your team holds scores a point a second. First to 200.',
  gungame: `Everyone for themselves. Every ${GUN_GAME_KILLS_PER_GUN} kills move you to the next of ${GUN_GAME_LADDER_LENGTH} guns. A melee kill sets your victim back. First through the last gun wins.`,
  charge: 'Attackers plant a charge at one of two sites; defenders stop or defuse it. No respawns in a round. First to 4 rounds.',
};

/**
 * What wins the match, in one line, for its opening countdown (the audit's
 * F24: "TDM · 75" said nothing). Where the match has a clock, the line says
 * what its running out means: the match ends with it, and whoever leads has
 * won. Charge's line is the side's job this round.
 */
export function goalLine(status: { readonly mode: ModeId; readonly killLimit: number | null; readonly scoreLimit?: number | null; readonly timeLimit?: number | null }, attacking: boolean | null = null): string {
  const clock = status.timeLimit !== null && status.timeLimit !== undefined;
  switch (status.mode) {
    case 'tdm':
      return `First team to ${status.killLimit ?? '?'} kills${clock ? ', or ahead when the clock runs out' : ''}`;
    case 'ffa':
      return `First to ${status.killLimit ?? '?'} kills${clock ? ', or in the lead when the clock runs out' : ''}`;
    case 'outposts':
      return `Hold the zones: first team to ${status.scoreLimit ?? '?'} points${clock ? ', or ahead when the clock runs out' : ''}`;
    case 'gungame':
      return `Kills move you up ${GUN_GAME_LADDER_LENGTH} guns: first through them all wins${clock ? ', or the furthest when the clock runs out' : ''}`;
    case 'charge':
      return attacking === null ? 'Plant the charge at A or B, or stop it' : attacking ? 'Plant the charge at A or B and guard it' : 'Keep the charge off A and B, or defuse it';
    case 'battle-royale':
      return 'Last Squad alive wins';
  }
}

/** How a round trip reads: quick, fair or slow. */
export function pingTone(ms: number): 'good' | 'fair' | 'poor' {
  return ms < 100 ? 'good' : ms < 200 ? 'fair' : 'poor';
}

/** A seat in the lobby: a person (numbered from 1), a bot that will fill it when the match starts, or an open seat. */
export interface LobbySeat {
  readonly number: number;
  readonly id: PlayerId | null;
  readonly name: string;
  /** Their round trip (ms), null until measured. */
  readonly ping: number | null;
  readonly host: boolean;
  readonly you: boolean;
  /** Held for a bot when the match starts (no id until then). */
  readonly bot: boolean;
}

/** How many bots join the people here when the match starts: the humans vs bots side, or the fill to `bots` a side, within the seats (as the server rosters them). */
export function lobbyBots(lobby: LobbyState): number {
  const people = lobby.players.length;
  if (lobby.maxBots <= 0) return 0;
  if (lobby.hvb && teamMode(lobby.mode)) return hvbBots(people, lobby.maxBots, lobby.capacity);
  return Math.max(0, Math.min(lobby.bots * 2 - people, lobby.capacity - people));
}

/** Every seat of the lobby: people first in the order they joined, then the bots the match will bring, then the open ones. */
export function lobbySeats(lobby: LobbyState, selfId: PlayerId | null, names: Readonly<Record<string, string>>, pings: Readonly<Record<string, number>>): LobbySeat[] {
  const seats: LobbySeat[] = lobby.players.map((id, i) => ({ number: i + 1, id, name: names[id] ?? id, ping: pings[id] ?? null, host: id === lobby.host, you: id === selfId, bot: false }));
  const bots = lobbyBots(lobby);
  for (let b = 0; b < bots && seats.length < lobby.capacity; b++) seats.push({ number: seats.length + 1, id: null, name: 'Bot', ping: null, host: false, you: false, bot: true });
  for (let n = seats.length + 1; n <= lobby.capacity; n++) seats.push({ number: n, id: null, name: '', ping: null, host: false, you: false, bot: false });
  return seats;
}

/**
 * A Bot Match's seats as the two sides they will play on: the people on Blue, then the bots. Humans vs bots puts
 * every bot on Orange; mixed teams fill Blue to its half (the larger, on an odd count) and give Orange the rest, as the
 * roster does when the people join first and the bots after.
 */
export function botMatchSides(seats: readonly LobbySeat[], hvb: boolean): readonly [readonly LobbySeat[], readonly LobbySeat[]] {
  const people = seats.filter((s) => !s.bot);
  const bots = seats.filter((s) => s.bot);
  const blue = hvb ? people.length : Math.max(people.length, Math.ceil(seats.length / 2));
  const ours = bots.slice(0, Math.max(0, blue - people.length));
  return [[...people, ...ours], bots.slice(ours.length)];
}

/**
 * An online lobby's seats as the sides the host set (`lobby.sides`): each person on theirs, then each bot the match will
 * bring onto the side with fewer, as the roster places them. Open seats aren't sides yet, so they're left out. Null where
 * the lobby has no sides (no team mode, or humans vs bots).
 */
export function lobbySides(lobby: LobbyState, seats: readonly LobbySeat[]): readonly [readonly LobbySeat[], readonly LobbySeat[]] | null {
  if (!lobby.sides || !teamMode(lobby.mode) || (lobby.hvb && lobby.maxBots > 0)) return null;
  const blue: LobbySeat[] = [];
  const orange: LobbySeat[] = [];
  for (const s of seats) {
    if (s.bot) (blue.length <= orange.length ? blue : orange).push(s);
    else if (s.id !== null) (lobby.sides[s.id] === 2 ? orange : blue).push(s);
  }
  return [blue, orange];
}

/**
 * The last match, as the lobby recalls it: "Blue won 75 to 60", "Ada won", "Draw", with how it ended. Null before the first.
 * A Battle Royale has no draw: one with no winner (no person left) gives your place in it, `place`, when you played it.
 */
export function lastMatch(result: MatchResult | null, mode: ModeId, teamScores: readonly TeamScore[] | null, place: { readonly place: number; readonly of: number } | null = null): { readonly headline: string; readonly detail: string } | null {
  if (!result) return null;
  const detail = `${MODE_NAMES[mode] ?? mode} · ${END_REASONS[result.reason]}`;
  if (mode === 'battle-royale' && result.winner === null) return { headline: place ? `${ordinal(place.place)} of ${place.of}` : 'No winner', detail };
  const totals = teamMode(mode) && teamScores && teamScores.length === 2 ? ` ${[...teamScores].sort((x, y) => y.score - x.score).map((t) => t.score).join(' to ')}` : '';
  const headline = result.draw || result.winner === null ? `Draw${totals}` : `${result.winnerName ?? 'Someone'} won${totals}`;
  return { headline, detail };
}

export interface ConnectionError {
  readonly kind: 'down' | 'full' | 'version' | 'passphrase' | 'name' | 'idle' | 'gpu' | 'kicked' | 'other';
  readonly title: string;
  readonly body: string;
}

/** The status the page puts on the error screen when the GPU device (or WebGL context) is lost: nothing more can be drawn (ticket 61). */
export const GRAPHICS_LOST = 'Graphics lost.';

/** A failed join or a dropped connection, as the error screen explains it. `status` is the driver's status line, or null when the server did not answer. */
export function connectionError(status: string | null): ConnectionError {
  if (status === GRAPHICS_LOST) {
    return { kind: 'gpu', title: 'Graphics stopped', body: 'The graphics driver reset or ran out of memory. Reload to carry on: an online match keeps your seat.' };
  }
  if (status === 'Disconnected: idle.') {
    return { kind: 'idle', title: 'Left the match', body: 'The game sat in the background for over a minute. Join again within a few minutes to pick up where you left off.' };
  }
  if (status === null || status.startsWith('Disconnected') || status === 'down') {
    const reason = status && status !== 'down' ? status.replace(/^Disconnected: /, '').replace(/\.$/, '') : '';
    return { kind: 'down', title: 'Server unreachable', body: `${reason ? `The connection dropped (${reason}). ` : ''}It may be restarting. Try again in a minute, or play a Bot Match.` };
  }
  if (/full/i.test(status)) return { kind: 'full', title: 'Server full', body: 'A seat frees up when someone leaves: try again in a moment.' };
  if (/updated|reload/i.test(status)) return { kind: 'version', title: 'Update needed', body: 'The server runs a newer version. Reload to get it.' };
  if (/passphrase/i.test(status)) return { kind: 'passphrase', title: 'Wrong passphrase', body: 'Check it and try again.' };
  if (/removed by the host/i.test(status)) return { kind: 'kicked', title: 'Removed from the lobby', body: 'The host took you out of it. Play Online takes you to the public lobby.' };
  if (/name/i.test(status)) return { kind: 'name', title: 'Pick another name', body: 'That one is taken or not allowed. Change it on the main menu.' };
  return { kind: 'other', title: 'Could not join', body: status };
}

export interface LobbyTile {
  readonly online: boolean;
  readonly players: string;
  readonly mode: string;
  readonly map: string;
  /** An empty server lets the first player choose the mode. */
  readonly pickMode: boolean;
  readonly full: boolean;
  /** Bots playing now (they give their seat to anyone who joins). */
  readonly bots: number;
  /** The fill the server starts with, and the most bots a side a first player may pick (0: bots off). */
  readonly botsPerTeam: number;
  readonly maxBotsPerTeam: number;
  /** Whether the match is humans vs bots. */
  readonly hvb: boolean;
}

/** The Play Online tile's lines from the lobby status, or the server shown as down. `mapName` names a map id (the app's map catalogue). */
export function lobbyTile(status: LobbyInfo | null, mapName: (id: string) => string = (id) => id): LobbyTile {
  if (!status) return { online: false, players: '–', mode: '–', map: '–', pickMode: false, full: false, bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0, hvb: false };
  return {
    online: true,
    players: `${status.players}/${status.capacity}`,
    mode: MODE_NAMES[status.mode] ?? status.mode,
    map: mapName(status.map),
    // Seats held for people who dropped keep the match on, so it is not the joiner's to pick; with a lobby, the host picks there.
    pickMode: !status.lobby && status.players === 0 && !(status.away ?? 0),
    full: status.players >= status.capacity,
    bots: status.bots ?? 0,
    botsPerTeam: status.botsPerTeam ?? 0,
    maxBotsPerTeam: status.maxBotsPerTeam ?? 0,
    hvb: status.hvb === true,
  };
}

/** The lobby's note on who the people here will play with and against when the host starts. */
export function lobbyFill(lobby: LobbyState): string {
  const people = lobby.players.length;
  if (lobby.hvb && teamMode(lobby.mode) && lobby.maxBots > 0) {
    const bots = hvbBots(people, lobby.maxBots, lobby.capacity);
    return `Humans vs bots: everyone here plays together against ${bots} bots, two more than you (at least 4, at most ${lobby.maxBots}) while seats allow.`;
  }
  if (lobby.bots > 0) return `Bots fill the match to ${matchSize(lobby.mode, lobby.bots)} when it starts.`;
  return people >= lobby.capacity ? 'Every seat is taken by a player.' : 'No bots: just the people here.';
}

/** How a match of `perTeam` a side reads in `mode`: "3v3", or "6 players" in free-for-all (you included). */
export function matchSize(mode: ModeId, perTeam: number): string {
  return teamMode(mode) ? `${perTeam}v${perTeam}` : `${perTeam * 2} players`;
}

/** What the loadout screen offers in each slot. Everything is unlocked from the start. */
export function loadoutOptions(): {
  readonly primary: readonly WeaponId[];
  readonly secondary: readonly WeaponId[];
  readonly grenade: readonly (GrenadeId | null)[];
  readonly tactical: readonly (TacticalId | null)[];
  readonly perk: readonly (PerkId | null)[];
} {
  return { primary: slotWeapons('primary'), secondary: slotWeapons('secondary'), grenade: ['frag', null], tactical: [...TACTICAL_IDS, null], perk: [...PERK_IDS, null] };
}

/** A tactical's or a perk's name, its tile's short line, and what it does in a sentence, its numbers read from STATS (ticket 20). */
export function kitCard(id: TacticalId | PerkId | null, slot: 'tactical' | 'perk'): { readonly name: string; readonly short: string; readonly text: string } {
  const T = STATS.tactical;
  const P = STATS.perks;
  const percent = (k: number) => `${Math.round(k * 100)}%`;
  switch (id) {
    case 'smoke':
      return { name: 'Smoke', short: `${T.perLife.value} a life`, text: `Pops ${T.smoke.fuse.value} s after it leaves your hand into a cloud ${T.smoke.width.value} m across that stands for ${T.smoke.life.value} s. Nobody sees through it, bots included; bullets still go through.` };
    case 'flash':
      return { name: 'Flash', short: `${T.perLife.value} a life`, text: `Goes off ${T.flash.fuse.value} s after the throw and whites out every enemy who can see it, for up to ${T.flash.longest.value} s looking straight at it close up. Turning away cuts it short; a wall or a smoke stops it; from ${T.flash.range.value} m it does nothing. It blinds you too, never your team.` };
    case 'fastHands':
      return { name: 'Fast Hands', short: 'reload, swap, throw', text: `Reloads, weapon swaps and the recovery after a throw all go ${percent(P.fastHands.value - 1)} faster.` };
    case 'softSoles':
      return { name: 'Soft Soles', short: 'quiet footsteps', text: `Your footsteps carry ${percent(P.softSoles.value)} as far: players and bots hear you coming much later.` };
    case 'blastVest':
      return { name: 'Blast Vest', short: 'frags and flashes', text: `Frags do ${percent(1 - P.blastVest.value)} less to you, and a flash blinds you for ${percent(P.blastVestFlash.value)} as long.` };
    default:
      return slot === 'tactical' ? { name: 'None', short: 'hands free', text: 'No tactical this life.' } : { name: 'None', short: 'no perk', text: 'No perk this life.' };
  }
}

export interface StatBar {
  readonly key: 'rate' | 'damage' | 'range' | 'handling';
  readonly label: string;
  /** How full the bar is, 0-1, against the rest of the arsenal. */
  readonly value: number;
  /** The figure behind it. */
  readonly text: string;
}

export interface WeaponCard {
  readonly id: WeaponId;
  readonly name: string;
  readonly role: string;
  readonly bars: readonly StatBar[];
}

/** The longest range a bar shows: past it a weapon reads as full. */
const RANGE_CAP = 100;
/** Half a torso's width (m): a shotgun's pattern wider than this stops landing whole. */
const TORSO_HALF_WIDTH = 0.25;

/**
 * How far a weapon keeps its punch: the end of the last damage band still
 * worth three quarters of its close damage, and for a shotgun no further than
 * its aimed pattern stays on a torso.
 */
function effectiveRange(id: WeaponId): number {
  const row = STATS.weapons[id];
  const close = rangeDamage(0, id);
  let reach = 0;
  for (const band of Object.values(row.damage.bands)) {
    if (band.damage.value < close * 0.75) break;
    reach = band.range?.value ?? Infinity;
  }
  const spread = row.accuracy.aimedSpread?.value ?? 0;
  if ((row.damage.pellets?.value ?? 1) > 1 && spread > 0) reach = Math.min(reach, TORSO_HALF_WIDTH / Math.tan((spread * Math.PI) / 180));
  return reach;
}

/** ADS plus sprint-to-fire: how long the weapon takes to come to bear. */
const bearTime = (id: WeaponId) => STATS.weapons[id].handling.adsTime.value + STATS.weapons[id].handling.sprintToFire.value;

/** A weapon on the loadout screen: its role and simple bars for rate of fire, damage, range and handling. */
export function weaponCard(id: WeaponId): WeaponCard {
  const row = STATS.weapons[id];
  const h = row.handling;
  const pellets = row.damage.pellets?.value ?? 1;
  const perPellet = rangeDamage(0, id);
  const topRate = Math.max(...WEAPON_IDS.map((w) => STATS.weapons[w].handling.fireRate.value));
  const quickest = Math.min(...WEAPON_IDS.map(bearTime));
  const reach = effectiveRange(id);
  return {
    id,
    name: row.traits.name,
    role: row.traits.role,
    bars: [
      { key: 'rate', label: 'Rate of fire', value: h.fireRate.value / topRate, text: `${Math.round(h.fireRate.value)} rpm` },
      { key: 'damage', label: 'Damage', value: Math.min(1, (pellets * perPellet) / STATS.health.max.value), text: pellets > 1 ? `${pellets} × ${perPellet}` : `${perPellet}` },
      { key: 'range', label: 'Range', value: Math.min(RANGE_CAP, reach) / RANGE_CAP, text: reach >= RANGE_CAP ? `${RANGE_CAP} m+` : `${Math.round(reach)} m` },
      { key: 'handling', label: 'Handling', value: quickest / bearTime(id), text: `ADS ${h.adsTime.value.toFixed(2)} s` },
    ],
  };
}

/**
 * The actions the pause screen's Controls list names, after Move: every
 * bound key, with the island map only in a Battle Royale, the one mode that
 * has one.
 */
export function pauseActions(mode: ModeId | null): readonly PauseAction[] {
  const keys: PauseAction[] = ['fire', 'ads', 'sprint', 'crouch', 'prone', 'jump', 'reload', 'melee', 'switchWeapon', 'grenade', 'tactical', 'use', 'scoreboard'];
  return mode === 'battle-royale' ? [...keys, 'map'] : keys;
}

/** An action the pause screen lists (movement is one row of its own). */
export type PauseAction = Exclude<Action, 'forward' | 'back' | 'left' | 'right'>;

/**
 * When a loadout change applies in the game being played, as the loadout
 * screen says it: a Battle Royale locks it when the Preparation ends, and a
 * pick after that waits for the next match (ticket 59).
 */
export function loadoutNote(game: { readonly online: boolean; readonly mode: ModeId | null; readonly phase: Phase | null; readonly preparing: boolean }): string {
  if (!game.online) return 'Applies at once';
  if (game.mode !== 'battle-royale') return 'Applies at your next spawn';
  return game.phase === 'playing' && !game.preparing ? 'Locked until the next match' : 'Applies when you drop';
}
