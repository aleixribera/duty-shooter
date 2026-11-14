import type { ModeId } from '../modes/game-mode';
import { TEAMS } from '../modes/teams';
import type { TeamId } from '../simulation';

/** A map and a mode to play on it. */
export interface MatchPick<M extends string = string> {
  readonly map: M;
  readonly mode: ModeId;
}

/**
 * The host's random next match (ticket 115): one of `choices`, each as likely,
 * on another map in another mode than the match just played where the choices
 * allow, else differing in one of them, else any. Null with no choices.
 */
export function randomNextMatch<M extends string>(played: MatchPick, choices: readonly MatchPick<M>[], random: () => number = Math.random): MatchPick<M> | null {
  const fresh = choices.filter((c) => c.map !== played.map && c.mode !== played.mode);
  const other = choices.filter((c) => c.map !== played.map || c.mode !== played.mode);
  const pool = fresh.length > 0 ? fresh : other.length > 0 ? other : choices;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? null;
}

/** Sides dealt at random: the people shuffled, then one to each side in turn, so the sides come out as even as they can. */
export function shuffledSides<T>(people: readonly T[], random: () => number = Math.random): Map<T, TeamId> {
  const order = [...people];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return new Map(order.map((p, i) => [p, TEAMS[i % 2]!]));
}
