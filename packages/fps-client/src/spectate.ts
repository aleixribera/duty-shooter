import type { ModeId, PlayerId } from '@duty-shooter/fps-core';

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
