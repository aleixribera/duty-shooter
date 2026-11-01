import type { Vec3 } from '../math';
import type { ModeEvent, ModeId } from '../modes/game-mode';
import type { PlayerId, SimEvent } from '../simulation';

/**
 * Who hears about what, on a map too big for everyone to matter to everyone.
 * Seen and heard are judged by distance alone: a line-of-sight test per pair
 * costs more than the bytes it saves, and a seat that pops in round a corner
 * is the one miss a player would notice.
 */
export interface Relevance {
  /** Metres within which a seat comes in every snapshot. */
  readonly near: number;
  /** Metres within which it comes every {@link midEvery} ticks, for being seen from afar; past that it isn't sent. */
  readonly mid: number;
  /** Ticks between a mid-range seat's updates. Everyone is drawn this far in the past while one is in view, so hits still line up. */
  readonly midEvery: number;
  /** Metres gunfire and explosions carry. */
  readonly hearing: number;
  /** Ticks a seat stays in view after firing within earshot, so a shot has someone to come from. */
  readonly heardTicks: number;
}

/** How a mode uses the network. The simulation stays at 60 Hz whatever this says. */
export interface NetProfile {
  /** Ticks between a client's snapshots, at best; a slow link gets fewer still. */
  readonly snapshotEvery: number;
  /** Null sends every seat in every snapshot. */
  readonly relevance: Relevance | null;
}

/** A small map, where everyone is always in play. */
export const FULL_RATE: NetProfile = { snapshotEvery: 1, relevance: null };

/** A kilometre-wide map. Battle Royale's load test settles these numbers. */
export const WIDE_MAP: NetProfile = { snapshotEvery: 3, relevance: { near: 60, mid: 250, midEvery: 6, hearing: 400, heardTicks: 120 } };

export const NET_PROFILES: Readonly<Record<ModeId, NetProfile>> = { tdm: FULL_RATE, ffa: FULL_RATE, outposts: FULL_RATE, charge: FULL_RATE, gungame: FULL_RATE };

/** How far past {@link Relevance.mid} a seat in view may go before it's dropped, so one on the line doesn't blink. */
const KEEP_MARGIN = 1.1;

export type SeatTier = 'near' | 'mid' | 'out';

export function within(a: Vec3, b: Vec3, metres: number): boolean {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz <= metres * metres;
}

/** The tier a seat is in for a viewer at `viewer`. `inView` says the viewer has it already; `kept` is a teammate, or one just heard firing. */
export function seatTier(viewer: Vec3, seat: Vec3, relevance: Relevance, inView: boolean, kept: boolean): SeatTier {
  if (within(viewer, seat, relevance.near)) return 'near';
  return kept || within(viewer, seat, inView ? relevance.mid * KEEP_MARGIN : relevance.mid) ? 'mid' : 'out';
}

/** Who an event is for: the seats in it, plus anyone within reach of where it happened. */
export interface EventReach {
  readonly seats: readonly PlayerId[];
  /** Where it happened; null means it's for everyone. */
  readonly at: Vec3 | null;
  /** Carries to hearing range rather than the mid range. */
  readonly loud: boolean;
}

const EVERYONE: EventReach = { seats: [], at: null, loud: false };

export function eventReach(event: SimEvent | ModeEvent, where: (id: PlayerId) => Vec3 | undefined): EventReach {
  const quiet = (seats: readonly PlayerId[], at: Vec3 | undefined): EventReach => (at ? { seats, at, loud: false } : EVERYONE);
  switch (event.type) {
    case 'shot':
      return { seats: [event.shooter], at: event.origin, loud: true };
    case 'explosion':
      return { seats: [event.thrower], at: event.point, loud: true };
    case 'hit':
      return quiet([event.shooter, event.victim], event.point);
    case 'impact':
    case 'prop':
      return quiet([event.shooter], event.point);
    case 'bounce':
      return quiet([], event.point);
    case 'melee':
      return quiet(event.victim === null ? [event.attacker] : [event.attacker, event.victim], where(event.attacker));
    case 'reload':
    case 'grenade':
    case 'switch':
      return quiet([event.player], where(event.player));
    default:
      return EVERYONE;
  }
}

/** Whether a viewer at `viewer` should get the event. */
export function reaches(reach: EventReach, id: PlayerId, viewer: Vec3, relevance: Relevance): boolean {
  return reach.at === null || reach.seats.includes(id) || within(viewer, reach.at, reach.loud ? relevance.hearing : relevance.mid);
}
