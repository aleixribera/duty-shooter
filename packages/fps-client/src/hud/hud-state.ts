import { INTERMISSION, siteCentre, type BattleRoyaleState, type ChargeSite, type ChargeState, type MatchStatus, type PlayerId, type PlayerOutput, type Score, type Vec3 } from '@duty-shooter/fps-core';
import type { MatchGain } from '../profile/model';
import type { MapBounds } from '../ui/island-map';
import { chargeRoster } from '../ui/model';
import type { PingMark } from '../ui/pings';
import { cardNote, rebootMarks } from '../ui/reboot';
import type { MatchCard } from '../ui/recap';
import { heading, placement, ringNow, ringStatus, victoryCard } from '../ui/royale';
import { dropMarks } from '../ui/supply-drop';
import type { ChargeHud, ObjectiveMarker } from './hud';
import { spreadMarkers } from './markers';
import type { MatchCardState } from './match-card';
import type { RoyaleHudState } from './royale-hud';

/**
 * What the Battle Royale HUD, the Charge bar and the match card show, built
 * from the match as pure functions so who sees what is testable without a
 * scene. The game gathers the context each frame and draws the result.
 */

/** Who the HUD is for and what the match says about everyone. */
interface Seat {
  readonly selfId: PlayerId | null;
  readonly scores: readonly Score[];
  nameOf(id: PlayerId): string;
  readonly serverTime: number;
}

export interface RoyaleHudContext extends Seat {
  readonly state: BattleRoyaleState;
  /** Your own soldier, or null with none. */
  readonly self: PlayerOutput | null;
  /** Whoever you watch, if they are in the snapshot. */
  readonly watched: PlayerOutput | null;
  readonly others: readonly PlayerOutput[];
  /** Where the view looks (world direction). */
  readonly forward: Vec3;
  readonly islandBounds: MapBounds | null;
  /** The map's and the pause menu's keys as shown ('' on touch, where they are buttons). */
  readonly mapKey: string;
  readonly menuKey: string;
  readonly mapOpen: boolean;
  readonly pings: readonly PingMark[];
  readonly attacker: { readonly name: string; readonly x: number; readonly z: number } | null;
}

/** The Battle Royale HUD: the Ring, the compass from where the view stands, the count, your placement and who you watch. */
export function royaleHudState(ctx: RoyaleHudContext): RoyaleHudState {
  const { state, self, watched, selfId, scores, serverTime: time } = ctx;
  const nameOf = (id: PlayerId) => ctx.nameOf(id);
  const view = self?.alive ? self : watched;
  const team = self?.team ?? null;
  const me = scores.find((s) => s.id === selfId);
  const mates = team === null ? [] : ctx.others.filter((p) => p.alive && p.kind === 'player' && p.team === team && p.id !== view?.id);
  return {
    status: ringStatus(state, time, self?.alive ? self.position : null),
    ring: ringNow(state, time),
    next: state.next,
    alive: state.alive,
    squads: state.squads,
    kills: me?.kills ?? 0,
    heading: heading(Math.atan2(-ctx.forward[0], -ctx.forward[2])),
    at: view ? { x: view.position[0], z: view.position[2] } : null,
    mates: mates.map((p) => ({ name: nameOf(p.id), x: p.position[0], z: p.position[2], downed: Boolean(p.downed) })),
    drops: dropMarks(state, time, ctx.islandBounds),
    reboot: rebootMarks(state, me?.team ?? team, time, nameOf),
    carrying: Boolean(self?.alive && state.cards?.some((c) => c.carrier === self.id)),
    card: self && !self.alive && selfId ? cardNote(selfId, state, time, nameOf) : null,
    placement: placement(scores, selfId),
    out: !self?.alive,
    seated: me !== undefined,
    watching: watched ? nameOf(watched.id) : null,
    mapKey: ctx.mapKey,
    menuKey: ctx.menuKey,
    mapOpen: ctx.mapOpen,
    pings: ctx.pings.map((m) => ({ kind: m.kind, x: m.position[0], z: m.position[2] })),
    leader: state.leader ? { name: state.leader.name, kills: state.leader.kills, you: state.leader.id === selfId } : null,
    attacker: ctx.attacker,
  };
}

export interface ChargeHudContext extends Omit<Seat, 'serverTime'> {
  readonly state: ChargeState;
  readonly self: PlayerOutput;
  readonly others: readonly PlayerOutput[];
  readonly sites: readonly ChargeSite[];
  /** Whoever a dead player watches, or null. */
  readonly watching: PlayerId | null;
  /** Where a marker over world point `at` goes on screen, and how far it is; null to leave it out. */
  project(at: Vec3): { x: number; y: number; distance: number } | null;
}

/** The Charge round for the HUD: your side, who carries and acts, and markers over the sites and the charge. */
export function chargeHudState(ctx: ChargeHudContext): ChargeHud {
  const { state, self, selfId } = ctx;
  const attacking = self.team === state.attackers;
  const markers: ObjectiveMarker[] = [];
  const add = (key: string, label: string, kind: ObjectiveMarker['kind'], at: Vec3) => {
    const m = ctx.project(at);
    if (m) markers.push({ key, label, kind, ...m });
  };
  if (state.planted) add('planted', state.planted.site, 'planted', [state.planted.position[0], state.planted.position[1] + 0.6, state.planted.position[2]]);
  else
    for (const site of ctx.sites) {
      const c = siteCentre(site);
      add(`site-${site.id}`, site.id, 'site', [c[0], c[1] + 2, c[2]]);
    }
  // Where a dropped charge lies is the attackers' to know.
  if (state.dropped && attacking) add('charge', '◆', 'charge', [state.dropped[0], state.dropped[1] + 0.6, state.dropped[2]]);
  const name = (id: PlayerId | null) => (id === null ? null : id === selfId ? 'You' : ctx.nameOf(id));
  return {
    state,
    attacking,
    carrier: name(state.carrier),
    actor: name(state.action?.player ?? null),
    carrying: state.carrier === selfId,
    acting: state.action?.player === selfId,
    spectating: ctx.watching === null ? null : ctx.nameOf(ctx.watching),
    // Both sites pinned to one edge would print one letter over the other. A dropped charge goes first and keeps its
    // point, since its marker is how you find it; a site beside it moves instead.
    markers: spreadMarkers([...markers.filter((m) => m.kind === 'charge'), ...markers.filter((m) => m.kind !== 'charge')]),
    roster: chargeRoster(ctx.scores, [...ctx.others, self], selfId, self.team, state.carrier),
  };
}

export interface MatchCardContext extends Omit<Seat, 'nameOf'> {
  readonly match: MatchStatus;
  /** Whether the match's victory beat is still on screen (the card waits for it). */
  readonly victoryShowing: boolean;
  /** What the match gave your Profile, once banked. */
  readonly gain: MatchGain | null;
  /** The card for your place and kills, made once for what it shows. */
  card(place: { place: number; of: number } | null, kills: number): MatchCard;
}

/** The match card at a Battle Royale's end, for those who had a seat in it, once the victory beat is over. */
export function matchCardState(ctx: MatchCardContext): MatchCardState | null {
  const { match, scores, selfId, serverTime: time } = ctx;
  const me = scores.find((s) => s.id === selfId);
  if (match.mode !== 'battle-royale' || !me) return null;
  const ending = match.phase === 'nuke' || (match.phase === 'vote' && match.lobby !== null);
  if (!ending || ctx.victoryShowing) return null;
  const left = Math.max(0, (match.phaseEnds ?? time) - time) + (match.phase === 'nuke' ? INTERMISSION.scoreboard : 0);
  const winners = victoryCard(match.result, scores, selfId);
  return {
    card: ctx.card(placement(scores, selfId), me.kills),
    winners: winners?.names ?? null,
    yours: winners?.yours ?? false,
    next: match.lobby ? `Back to the lobby in ${Math.ceil(left)} s` : `Next match in ${Math.ceil(left)} s`,
    score: me.score,
    gain: ctx.gain,
  };
}
