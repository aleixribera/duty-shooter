import type { TeamScore } from '../modes/game-mode';
import type { PlayerId, SimEvent, TeamId } from '../simulation';

/**
 * Hidden adaptive bots (PLAN 9h). Bots sit on both sides, so adapting to the
 * team score alone would make a strong player's own allies worse. Instead each
 * person's recent form (the fights they won and lost lately) tunes the
 * reaction and aim of the bots fighting that person, and only those: a
 * person's own allies never change for it. In team modes a big score gap also
 * lifts the trailing side's bots a little, whoever they fight.
 *
 * An edge is a share of a bot's standard: +0.2 reacts in 80% of its time and
 * aims with 80% of its error, -0.2 in 120%. It never passes {@link ADAPT_CAP},
 * stays at 0 for the first {@link ADAPT_AFTER} seconds of a match, and moves at
 * most {@link ADAPT_CAP} per {@link ADAPT_RAMP} seconds. There is no setting
 * and nothing in the game says it happens.
 */

/** The most an edge moves a bot's reaction and aim from its standard, either way: never an aimbot or a punching bag. */
export const ADAPT_CAP = 0.25;
/** Seconds of fights a person's form looks back over. */
export const FORM_WINDOW = 120;
/** Seconds into a match before anything adapts. */
export const ADAPT_AFTER = 120;
/** Seconds an edge takes to go from standard to the cap: changes come over about a minute. */
export const ADAPT_RAMP = 60;
/** The most a score gap lifts the trailing side's bots. */
export const GAP_LIFT = 0.1;
/** The gap, as a share of the limit, where the lift starts, and where it is full. */
const GAP_START = 0.15;
const GAP_FULL = 0.4;
/** Even fights a form starts from, so one lucky kill doesn't swing it. */
const FORM_PRIOR = 3;
/** The form (wins less losses over fights and the prior) that takes the edge to the cap: about three fights won to one lost. */
const FORM_FULL = 0.45;

/** A team mode's scores, for the score gap; null in free-for-all, gun game and Battle Royale. */
export interface TeamStanding {
  readonly scores: readonly TeamScore[];
  /** Kills or points that win the match; null for none. */
  readonly limit: number | null;
}

/** Moves `from` toward `to` by at most `most`. */
const toward = (from: number, to: number, most: number) => (to > from ? Math.min(to, from + most) : Math.max(to, from - most));
const clampCap = (v: number) => Math.max(-ADAPT_CAP, Math.min(ADAPT_CAP, v));

/** The edge a person's form asks for: positive while they win more fights than they lose. */
export function formEdge(won: number, lost: number): number {
  const form = (won - lost) / (won + lost + FORM_PRIOR);
  return clampCap((form / FORM_FULL) * ADAPT_CAP);
}

/** The lift a team trailing by `gap` gets, with `limit` the score that wins (or the leader's score when there is none). */
export function gapLift(gap: number, limit: number): number {
  const share = gap / Math.max(limit, 1);
  return GAP_LIFT * Math.max(0, Math.min(1, (share - GAP_START) / (GAP_FULL - GAP_START)));
}

/** Each person's form and the edge it gives the bots fighting them, kept for one match at a time. */
export class BotAdapter {
  readonly #fights = new Map<PlayerId, { time: number; won: boolean }[]>();
  readonly #edges = new Map<PlayerId, number>();
  readonly #lifts = new Map<TeamId, number>();
  /** Seats lying Downed: the kill that finishes one is the same fight as the Down. */
  readonly #downed = new Set<PlayerId>();
  #last: number | null = null;

  /** A new match: every form forgotten, every edge back to standard. */
  reset(): void {
    this.#fights.clear();
    this.#edges.clear();
    this.#lifts.clear();
    this.#downed.clear();
    this.#last = null;
  }

  /** Takes a tick's events: each fight a person won or lost. Fights between bots, falls and the Ring count for nobody. */
  hear(events: readonly SimEvent[], time: number, isPerson: (id: PlayerId) => boolean): void {
    for (const e of events) {
      let winner: PlayerId | null = null;
      let loser: PlayerId | null = null;
      if (e.type === 'down') {
        this.#downed.add(e.victim);
        winner = e.attacker;
        loser = e.victim;
      } else if (e.type === 'revive') {
        this.#downed.delete(e.target);
      } else if (e.type === 'kill') {
        if (this.#downed.delete(e.victim)) continue;
        winner = e.killer;
        loser = e.victim;
      }
      if (winner === null || loser === null || winner === loser) continue;
      if (isPerson(winner)) this.#note(winner, time, true);
      if (isPerson(loser)) this.#note(loser, time, false);
    }
  }

  #note(id: PlayerId, time: number, won: boolean): void {
    const list = this.#fights.get(id) ?? [];
    list.push({ time, won });
    this.#fights.set(id, list);
  }

  /** The fights `id` won and lost within the window before `time`. */
  form(id: PlayerId, time: number): { won: number; lost: number } {
    const list = this.#fights.get(id) ?? [];
    while (list.length > 0 && list[0]!.time < time - FORM_WINDOW) list.shift();
    let won = 0;
    for (const f of list) if (f.won) won += 1;
    return { won, lost: list.length - won };
  }

  /**
   * Moves every edge toward what form and score ask for, at most the ramp's
   * rate since the last step. `matchTime` is seconds since the match began:
   * before {@link ADAPT_AFTER}, everything is held at standard.
   */
  step(time: number, matchTime: number, people: Iterable<PlayerId>, teams: TeamStanding | null): void {
    // At most a second's worth, so a gap in the steps (no bots seated for a while) never jumps an edge.
    const dt = this.#last === null ? 0 : Math.min(1, Math.max(0, time - this.#last));
    this.#last = time;
    const most = (dt * ADAPT_CAP) / ADAPT_RAMP;
    const live = matchTime >= ADAPT_AFTER;
    const present = new Set<PlayerId>();
    for (const id of people) {
      present.add(id);
      const { won, lost } = this.form(id, time);
      this.#edges.set(id, toward(this.#edges.get(id) ?? 0, live ? formEdge(won, lost) : 0, most));
    }
    for (const id of this.#edges.keys()) if (!present.has(id)) this.#edges.delete(id);
    const wanted = new Map<TeamId, number>();
    if (teams && live && teams.scores.length > 1) {
      const top = Math.max(...teams.scores.map((s) => s.score));
      for (const s of teams.scores) wanted.set(s.team, gapLift(top - s.score, teams.limit ?? Math.max(top, 10)));
    }
    for (const team of new Set([...this.#lifts.keys(), ...wanted.keys()])) {
      const lift = toward(this.#lifts.get(team) ?? 0, wanted.get(team) ?? 0, most);
      if (lift === 0 && !wanted.has(team)) this.#lifts.delete(team);
      else this.#lifts.set(team, lift);
    }
  }

  /**
   * The edge of a bot on `team` fighting `target`: the target's own edge if
   * it is a person (the bot fights them, so it is their enemy), plus its
   * side's score-gap lift; within the cap.
   */
  edge(team: TeamId, target: PlayerId): number {
    return clampCap((this.#edges.get(target) ?? 0) + (this.#lifts.get(team) ?? 0));
  }

  /** `id`'s own edge from form alone (tests and probes). */
  personEdge(id: PlayerId): number {
    return this.#edges.get(id) ?? 0;
  }

  /** `team`'s score-gap lift (tests and probes). */
  liftOf(team: TeamId): number {
    return this.#lifts.get(team) ?? 0;
  }
}
