import { STATS, WEAPON_IDS, hvbBots, rangeDamage, slotWeapons, teamMode, type GrenadeId, type LobbyState, type MatchResult, type ModeId, type PlayerId, type Score, type TeamScore, type WeaponId } from '@duty-shooter/fps-core';

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
}

export const MODE_NAMES: Readonly<Record<string, string>> = { tdm: 'Team deathmatch', ffa: 'Free-for-all', outposts: 'Outposts', charge: 'Charge' };
/** How each way a match can end reads on the end screen. */
export const END_REASONS: Readonly<Record<MatchResult['reason'], string>> = { killLimit: 'kill limit', scoreLimit: 'score limit', timeLimit: 'time limit', roundLimit: 'round limit', forfeit: 'forfeit' };
export const MAP_NAMES: Readonly<Record<string, string>> = { range: 'Practice Range', 'survival-town': 'Survival Town', switchyard: 'Switchyard' };
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
  if (!teamMode(mode)) return { kind: 'ffa', rows: ranked(scores, pings) };
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
export function matchBar(
  status: { readonly mode: ModeId; readonly teamScores: readonly TeamScore[] | null; readonly killLimit: number | null; readonly scoreLimit?: number | null },
  scores: readonly Score[],
  selfId: PlayerId | null,
  team: number | null,
): MatchBar {
  if (teamMode(status.mode)) {
    return { kind: 'tdm', teams: [1, 2].map((t) => ({ team: t, score: status.teamScores?.find((s) => s.team === t)?.score ?? 0, mine: t === team })), limit: status.killLimit ?? status.scoreLimit ?? null };
  }
  const rows = ranked(scores, {});
  const top = rows[0];
  const me = rows.find((r) => r.id === selfId);
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
  else if (teamMode(mode)) headline = { kind: 'team', team: Number(result.winner), won: me?.team === result.winner };
  else headline = { kind: 'player', name: result.winnerName ?? 'Someone', you: result.winner === selfId };
  return { headline, you };
}

/** What each mode is, in a line or two, for the lobby. */
export const MODE_BLURBS: Readonly<Record<string, string>> = {
  tdm: 'Two teams, blue against orange. First team to 75 kills wins, or the team ahead after 10 minutes.',
  ffa: 'Everyone for themselves. First to 30 kills wins, or whoever leads after 10 minutes.',
  outposts: 'Two teams fight over three zones: stand in one to take it, and every zone you hold scores a point a second. First to 200.',
  charge: 'Attackers carry a charge to one of two sites and plant it; defenders stop them or defuse it. No respawns within a round. First to 4 rounds.',
};

/** How a round trip reads: quick, fair or slow. */
export function pingTone(ms: number): 'good' | 'fair' | 'poor' {
  return ms < 100 ? 'good' : ms < 200 ? 'fair' : 'poor';
}

/** A seat in the lobby: a person (numbered from 1), or an open seat. */
export interface LobbySeat {
  readonly number: number;
  readonly id: PlayerId | null;
  readonly name: string;
  /** Their round trip (ms), null until measured. */
  readonly ping: number | null;
  readonly host: boolean;
  readonly you: boolean;
}

/** Every seat of the lobby, people first in the order they joined, then the open ones. */
export function lobbySeats(lobby: LobbyState, selfId: PlayerId | null, names: Readonly<Record<string, string>>, pings: Readonly<Record<string, number>>): LobbySeat[] {
  const seats: LobbySeat[] = lobby.players.map((id, i) => ({ number: i + 1, id, name: names[id] ?? id, ping: pings[id] ?? null, host: id === lobby.host, you: id === selfId }));
  for (let n = seats.length + 1; n <= lobby.capacity; n++) seats.push({ number: n, id: null, name: '', ping: null, host: false, you: false });
  return seats;
}

/** The last match, as the lobby recalls it: "Blue won 75 to 60", "Ada won", "Draw", with how it ended. Null before the first. */
export function lastMatch(result: MatchResult | null, mode: ModeId, teamScores: readonly TeamScore[] | null): { readonly headline: string; readonly detail: string } | null {
  if (!result) return null;
  const totals = teamMode(mode) && teamScores && teamScores.length === 2 ? ` ${[...teamScores].sort((x, y) => y.score - x.score).map((t) => t.score).join(' to ')}` : '';
  const headline = result.draw || result.winner === null ? `Draw${totals}` : `${result.winnerName ?? 'Someone'} won${totals}`;
  return { headline, detail: `${MODE_NAMES[mode] ?? mode} · ${END_REASONS[result.reason]}` };
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
  /** Whether the match is humans vs bots. */
  readonly hvb: boolean;
}

/** The Play Online tile's lines from the lobby status, or the server shown as down. */
export function lobbyTile(status: LobbyInfo | null): LobbyTile {
  if (!status) return { online: false, players: '–', mode: '–', map: '–', pickMode: false, full: false, bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0, hvb: false };
  return {
    online: true,
    players: `${status.players}/${status.capacity}`,
    mode: MODE_NAMES[status.mode] ?? status.mode,
    map: MAP_NAMES[status.map] ?? status.map,
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
export function loadoutOptions(): { readonly primary: readonly WeaponId[]; readonly secondary: readonly WeaponId[]; readonly grenade: readonly (GrenadeId | null)[] } {
  return { primary: slotWeapons('primary'), secondary: slotWeapons('secondary'), grenade: ['frag', null] };
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
