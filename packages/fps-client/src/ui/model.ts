import type { MatchResult, ModeId, PlayerId, Score, TeamScore } from '@duty-shooter/fps-core';

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
}

export const MODE_NAMES: Readonly<Record<string, string>> = { tdm: 'Team deathmatch', ffa: 'Free-for-all' };
export const MAP_NAMES: Readonly<Record<string, string>> = { range: 'Practice Range', 'survival-town': 'Survival Town' };
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
  readonly kills: number;
  readonly deaths: number;
  /** Round trip in ms, or null when the server has not heard it yet. */
  readonly ping: number | null;
  /** 1 for the best; players level on kills and deaths share a place. */
  readonly place: number;
}

export type Board =
  | { readonly kind: 'ffa'; readonly rows: readonly BoardRow[] }
  | { readonly kind: 'tdm'; readonly teams: readonly { readonly team: number; readonly score: number; readonly rows: readonly BoardRow[] }[] };

/** Most kills first, then fewest deaths. */
function ranked(scores: readonly Score[], pings: Readonly<Record<string, number>>): BoardRow[] {
  const sorted = [...scores].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  return sorted.map((s, i) => {
    let place = i + 1;
    while (place > 1 && sorted[place - 2]!.kills === s.kills && sorted[place - 2]!.deaths === s.deaths) place--;
    return { id: s.id, name: s.name, bot: s.bot === true, kills: s.kills, deaths: s.deaths, ping: pings[s.id] ?? null, place };
  });
}

/** The held scoreboard: the free-for-all ranking, or both teams side by side. */
export function scoreboard(scores: readonly Score[], mode: ModeId, pings: Readonly<Record<string, number>>, teamScores: readonly TeamScore[] | null = null): Board {
  if (mode !== 'tdm') return { kind: 'ffa', rows: ranked(scores, pings) };
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
  | { readonly kind: 'ffa'; readonly leader: { readonly name: string; readonly kills: number } | null; readonly you: { readonly kills: number; readonly place: number } | null; readonly limit: number | null };

/** The HUD's top bar: both team scores with yours marked, or the leader and your place. */
export function matchBar(status: { readonly mode: ModeId; readonly teamScores: readonly TeamScore[] | null; readonly killLimit: number | null }, scores: readonly Score[], selfId: PlayerId | null, team: number | null): MatchBar {
  if (status.mode === 'tdm') {
    return { kind: 'tdm', teams: [1, 2].map((t) => ({ team: t, score: status.teamScores?.find((s) => s.team === t)?.score ?? 0, mine: t === team })), limit: status.killLimit };
  }
  const rows = ranked(scores, {});
  const top = rows[0];
  const me = rows.find((r) => r.id === selfId);
  return { kind: 'ffa', leader: top ? { name: top.name, kills: top.kills } : null, you: me ? { kills: me.kills, place: me.place } : null, limit: status.killLimit };
}

export interface EndSummary {
  readonly headline: { readonly kind: 'draw' } | { readonly kind: 'team'; readonly team: number; readonly won: boolean } | { readonly kind: 'player'; readonly name: string; readonly you: boolean } | { readonly kind: 'unknown' };
  readonly you: { readonly kills: number; readonly deaths: number; readonly ratio: string; readonly place: number; readonly of: number } | null;
}

/** The end-of-match screen: who won (and whether it was you or your team) and your line. */
export function endSummary(result: MatchResult | null, mode: ModeId, scores: readonly Score[], selfId: PlayerId | null): EndSummary {
  const rows = ranked(scores, {});
  const me = scores.find((s) => s.id === selfId);
  const row = rows.find((r) => r.id === selfId);
  const you = me && row ? { kills: me.kills, deaths: me.deaths, ratio: (me.kills / Math.max(1, me.deaths)).toFixed(2), place: row.place, of: rows.length } : null;
  let headline: EndSummary['headline'];
  if (!result) headline = { kind: 'unknown' };
  else if (result.draw || result.winner === null) headline = { kind: 'draw' };
  else if (mode === 'tdm') headline = { kind: 'team', team: Number(result.winner), won: me?.team === result.winner };
  else headline = { kind: 'player', name: result.winnerName ?? 'Someone', you: result.winner === selfId };
  return { headline, you };
}

export interface ConnectionError {
  readonly kind: 'down' | 'full' | 'version' | 'passphrase' | 'name' | 'idle' | 'other';
  readonly title: string;
  readonly body: string;
}

/** A failed join or a dropped connection, as the error screen explains it. `status` is the driver's status line, or null when the server did not answer. */
export function connectionError(status: string | null): ConnectionError {
  if (status === 'Disconnected: idle.') {
    return { kind: 'idle', title: 'Left the match', body: 'The game was in the background for over a minute, so the server let you go. Join again within a few minutes to carry on where you left off.' };
  }
  if (status === null || status.startsWith('Disconnected') || status === 'down') {
    const detail = status && status !== 'down' ? ` (${status.replace(/^Disconnected: /, '').replace(/\.$/, '')})` : '';
    return { kind: 'down', title: 'Server unreachable', body: `The game server did not answer${detail}. It may be restarting: try again in a minute, or practise offline meanwhile.` };
  }
  if (/full/i.test(status)) return { kind: 'full', title: 'Server full', body: 'Every slot is taken. Try again in a moment; a slot frees up whenever someone leaves.' };
  if (/updated|reload/i.test(status)) return { kind: 'version', title: 'Update needed', body: 'The server runs a newer version of the game than this page. Reload to get it.' };
  if (/passphrase/i.test(status)) return { kind: 'passphrase', title: 'Wrong passphrase', body: 'The server did not accept that passphrase. Check it and try again.' };
  if (/name/i.test(status)) return { kind: 'name', title: 'Pick another name', body: 'That name is taken or not allowed. Choose another on the main menu.' };
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
}

/** The Play Online tile's lines from the lobby status, or the server shown as down. */
export function lobbyTile(status: LobbyInfo | null): LobbyTile {
  if (!status) return { online: false, players: '–', mode: '–', map: '–', pickMode: false, full: false, bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0 };
  return {
    online: true,
    players: `${status.players}/${status.capacity}`,
    mode: MODE_NAMES[status.mode] ?? status.mode,
    map: MAP_NAMES[status.map] ?? status.map,
    // Seats held for people who dropped keep the match on, so it is not the joiner's to pick.
    pickMode: status.players === 0 && !(status.away ?? 0),
    full: status.players >= status.capacity,
    bots: status.bots ?? 0,
    botsPerTeam: status.botsPerTeam ?? 0,
    maxBotsPerTeam: status.maxBotsPerTeam ?? 0,
  };
}

/** How a match of `perTeam` a side reads in `mode`: "3v3", or "6 players" in free-for-all (you included). */
export function matchSize(mode: ModeId, perTeam: number): string {
  return mode === 'tdm' ? `${perTeam}v${perTeam}` : `${perTeam * 2} players`;
}
