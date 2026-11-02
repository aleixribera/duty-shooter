import type { ModeId, PlayerId } from '@duty-shooter/fps-core';

/** What the spectator needs of a seat. */
export interface Watchable {
  readonly id: PlayerId;
  readonly team: number;
  readonly alive: boolean;
  readonly downed?: unknown;
  readonly kind: string;
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

/**
 * Who a player out of the fight watches, shared by every mode that has
 * spectating. Charge: a living teammate. Battle Royale: a standing squadmate,
 * then a Downed one, then the killer, then anyone left (also for a late
 * arrival with no seat). The same seat is kept while it stays a candidate.
 * Next and previous, and the panel, come later (ticket 32): `candidates` is
 * the order they would step through.
 */
export class Spectator {
  #watching: PlayerId | null = null;

  get watching(): PlayerId | null {
    return this.#watching;
  }

  /** The seats worth watching, best first; empty when there is nothing to spectate. */
  candidates(view: SpectateView): Watchable[] {
    const { self, mode } = view;
    if (!view.playing || self?.alive) return [];
    const living = view.players.filter((p) => p.alive && p.kind === 'player').sort(byId);
    if (mode === 'charge') return self ? living.filter((p) => p.team === self.team) : [];
    if (mode !== 'battle-royale') return [];
    const mates = self ? living.filter((p) => p.team === self.team) : [];
    const order = [...mates.filter((p) => !p.downed), ...mates.filter((p) => p.downed), ...living.filter((p) => p.id === view.killer), ...living.filter((p) => !p.downed), ...living];
    return [...new Set(order)];
  }

  /** Who to watch now: the one already watched while they stay a candidate, else the best. */
  update(view: SpectateView): PlayerId | null {
    const options = this.candidates(view);
    const kept = options.find((p) => p.id === this.#watching);
    this.#watching = (kept ?? options[0])?.id ?? null;
    return this.#watching;
  }
}
