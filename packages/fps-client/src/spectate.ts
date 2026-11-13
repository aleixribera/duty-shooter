import type { ModeId, PlayerId, Vec3 } from '@duty-shooter/fps-core';

/** What the spectator needs of a seat. */
export interface Watchable {
  readonly id: PlayerId;
  readonly team: number;
  readonly alive: boolean;
  readonly downed?: unknown;
  readonly kind: string;
  /** Known from the scoreboard only, not sent (too far from what you watch). */
  readonly far?: boolean;
}

export interface SpectateView {
  readonly mode: ModeId | null;
  /** A match is being played (not the intermission). */
  readonly playing: boolean;
  /** Your seat, or null for a late arrival without one. */
  readonly self: Watchable | null;
  /** Everyone else in view. */
  readonly players: readonly Watchable[];
  /** Who put you out, if anyone did. */
  readonly killer: PlayerId | null;
}

const byId = (a: Watchable, b: Watchable): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A seat as the scoreboard has it. */
export interface RosterSeat {
  readonly id: PlayerId;
  readonly team: number;
  readonly deaths: number;
}

/**
 * Everyone worth stepping to: the seats in view, and in Battle Royale the rest
 * of the match from the scoreboard, for a far seat isn't sent until it is
 * watched (relevance). Nobody comes back there, so no deaths is still in.
 */
export function withRoster(mode: ModeId | null, players: readonly Watchable[], roster: readonly RosterSeat[], selfId: PlayerId | null): Watchable[] {
  if (mode !== 'battle-royale') return [...players];
  const seen = new Set(players.map((p) => p.id));
  const far = roster.filter((s) => s.id !== selfId && !seen.has(s.id)).map((s) => ({ id: s.id, team: s.team, alive: s.deaths === 0, kind: 'player', far: true }));
  return [...players, ...far];
}

/**
 * Who a player out of the fight watches, shared by every mode that has
 * spectating. Charge: a living teammate. Battle Royale: a standing squadmate,
 * then a Downed one, then the killer, then anyone left (also for a late
 * arrival with no seat). The same seat is kept while it stays a candidate,
 * whether it was picked for you or you stepped to it (ticket 32); when it
 * drops out, the best is taken and `lost` says who it was, for one update.
 */
export class Spectator {
  #watching: PlayerId | null = null;
  #lost: PlayerId | null = null;

  get watching(): PlayerId | null {
    return this.#watching;
  }

  /** The seat watched until the last update took it away (it was put out), or null. */
  get lost(): PlayerId | null {
    return this.#lost;
  }

  /** The seats worth watching, best first; empty when there is nothing to spectate. */
  candidates(view: SpectateView): Watchable[] {
    const { self, mode } = view;
    if (!view.playing || self?.alive) return [];
    const living = view.players.filter((p) => p.alive && p.kind === 'player').sort(byId);
    if (mode === 'charge') return self ? living.filter((p) => p.team === self.team) : [];
    if (mode !== 'battle-royale') return [];
    const mates = self ? living.filter((p) => p.team === self.team) : [];
    // While the Squad fights, only the Squad: the server sends no one else's surroundings (ticket 58).
    if (mates.length > 0) return [...mates.filter((p) => !p.downed), ...mates.filter((p) => p.downed)];
    const order = [...mates.filter((p) => !p.downed), ...mates.filter((p) => p.downed), ...living.filter((p) => p.id === view.killer), ...living.filter((p) => !p.downed && !p.far), ...living.filter((p) => !p.far), ...living];
    return [...new Set(order)];
  }

  /** The order next and previous step through: your Squad (or team), then everyone else, each by seat, so it holds still while you step. */
  order(view: SpectateView): Watchable[] {
    const all = this.candidates(view).sort(byId);
    const team = view.self?.team;
    return [...all.filter((p) => p.team === team), ...all.filter((p) => p.team !== team)];
  }

  /** Who to watch now: the one already watched while they stay a candidate, else the best. */
  update(view: SpectateView): PlayerId | null {
    const options = this.candidates(view);
    const kept = options.find((p) => p.id === this.#watching);
    const was = this.#watching;
    this.#watching = (kept ?? options[0])?.id ?? null;
    // Lost only to a death seen: not when you come back into the fight, or the match ends.
    const gone = was === null || kept ? undefined : view.players.find((p) => p.id === was);
    this.#lost = view.playing && !view.self?.alive && gone !== undefined && !gone.alive ? was : null;
    return this.#watching;
  }

  /** Steps to the next (1) or previous (-1) seat in `order`, round the ends; null with nobody to watch. */
  step(view: SpectateView, by: 1 | -1): PlayerId | null {
    const list = this.order(view);
    if (list.length === 0) return (this.#watching = null);
    const at = list.findIndex((p) => p.id === this.#watching);
    const next = at < 0 ? (by > 0 ? 0 : list.length - 1) : (at + by + list.length) % list.length;
    this.#watching = (list[next] as Watchable).id;
    this.#lost = null;
    return this.#watching;
  }
}

/** The over-the-shoulder follow camera's offsets (m): behind the eye, to its right, and above it. */
export const FOLLOW = { back: 2.4, side: 0.55, up: 0.25, margin: 0.2 } as const;

/**
 * Where the follow camera stands behind someone (ticket 110): over their right
 * shoulder, orbiting with their aim, as third-person shooters frame a player, so
 * the screen's centre runs alongside the line they look down and their body
 * stands to its left instead of covering it. `cast` is the fraction along a→b at
 * which the world first blocks it, or null; the camera is pulled in short of a
 * wall, first on the way out to the shoulder and then on the way back.
 */
export function followCamera(cast: (a: Vec3, b: Vec3) => number | null, position: Vec3, eyeHeight: number, yaw: number, pitch: number): Vec3 {
  const eye: Vec3 = [position[0], position[1] + eyeHeight, position[2]];
  const pivot = reach(cast, eye, [eye[0], eye[1] + FOLLOW.up, eye[2]]);
  const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const shoulder = reach(cast, pivot, [pivot[0] + right[0] * FOLLOW.side, pivot[1], pivot[2] + right[2] * FOLLOW.side]);
  const c = Math.cos(pitch);
  const look: Vec3 = [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
  return reach(cast, shoulder, [shoulder[0] - look[0] * FOLLOW.back, shoulder[1] - look[1] * FOLLOW.back, shoulder[2] - look[2] * FOLLOW.back]);
}

/** The point on a→b the world lets the camera reach, `FOLLOW.margin` short of what blocks it. */
function reach(cast: (a: Vec3, b: Vec3) => number | null, a: Vec3, b: Vec3): Vec3 {
  const t = cast(a, b);
  if (t === null) return b;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const k = length > 0 ? Math.max(0, t - FOLLOW.margin / length) : 0;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
