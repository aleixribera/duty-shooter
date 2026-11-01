import { PointGrid } from './grid';
import type { Vec3 } from './math';
import type { PlayerId, PlayerOutput, TeamId } from './simulation';

/** So few seats that walking them is as quick as a lookup. */
const FEW_SEATS = 16;

/**
 * One tick's players, indexed so that a bot or a client asks about a seat or
 * its surroundings without walking everyone: that walk, once per bot, is what
 * would make a tick grow with the square of the seats.
 */
export class SeatIndex {
  readonly players: readonly PlayerOutput[];
  #byId: Map<PlayerId, PlayerOutput> | null = null;
  #grid: PointGrid | null = null;
  #alive: Map<TeamId, number> | null = null;
  #aliveTotal = 0;

  constructor(players: readonly PlayerOutput[]) {
    this.players = players;
  }

  get(id: PlayerId): PlayerOutput | undefined {
    if (this.players.length <= FEW_SEATS) return this.players.find((p) => p.id === id);
    return (this.#byId ??= new Map(this.players.map((p) => [p.id, p]))).get(id);
  }

  /** Positions in {@link players} of those within `reach` m of `at` along each axis, ascending: the caller measures what it cares about. */
  near(at: Vec3, reach: number): number[] {
    this.#grid ??= new PointGrid(this.players.map((p) => p.position));
    return this.#grid.around(at[0], at[2], reach);
  }

  /** Living players on `team`, and on any other: what a player of `team` can read off the scoreboard. */
  sides(team: TeamId): { readonly own: number; readonly others: number } {
    if (!this.#alive) {
      this.#alive = new Map();
      for (const p of this.players) {
        if (p.kind !== 'player' || !p.alive) continue;
        this.#alive.set(p.team, (this.#alive.get(p.team) ?? 0) + 1);
        this.#aliveTotal += 1;
      }
    }
    const own = this.#alive.get(team) ?? 0;
    return { own, others: this.#aliveTotal - own };
  }
}
