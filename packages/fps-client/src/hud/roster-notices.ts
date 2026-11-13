import { teamMode, type ModeId, type PlayerId, type Score } from '@duty-shooter/fps-core';

/** A line for the objective feed: who came or went, in their side's colour (0 where sides aren't teams). */
export interface RosterNotice {
  readonly text: string;
  readonly team: number;
}

/**
 * People coming and going during a match online, as the feed tells it: "Marta
 * joined", "Marta left", "Marta is back" when a dropped seat is taken again.
 * Read off the scoreboard's rows, so it needs nothing from the server. Bots
 * fill and give up seats quietly, and in a Battle Royale only your own
 * Squad's comings and goings are told (sixty players would flood the feed).
 * Those already in the match when you first look say nothing. Only a row
 * that goes away is someone leaving: a seat a stand-in bot keeps for a person
 * (a Battle Royale's, while their page loads or comes back) is still theirs.
 */
export class RosterNotices {
  #seen: ReadonlyMap<PlayerId, Score> | null = null;
  #rows: readonly Score[] | null = null;
  /** People who left this match: their return is "is back". */
  readonly #gone = new Set<PlayerId>();
  /** Everyone seen as a person this match: their row stays theirs while a stand-in bot holds it. */
  readonly #persons = new Set<PlayerId>();

  /** A new match (or none): the next look is a fresh start. */
  reset(): void {
    this.#seen = null;
    this.#rows = null;
    this.#gone.clear();
    this.#persons.clear();
  }

  /** The notices since the last look, from the match's rows as they stand now. */
  update(rows: readonly Score[], selfId: PlayerId | null, mode: ModeId): RosterNotice[] {
    // No rows is no snapshot yet, not everyone gone.
    if (rows === this.#rows || rows.length === 0) return [];
    this.#rows = rows;
    const royale = mode === 'battle-royale';
    const squad = royale ? rows.find((s) => s.id === selfId)?.team : undefined;
    const people = new Map<PlayerId, Score>();
    for (const s of rows) {
      if (!s.bot) this.#persons.add(s.id);
      if (this.#persons.has(s.id) && s.id !== selfId && (!royale || (squad !== undefined && s.team === squad))) people.set(s.id, s);
    }
    const seen = this.#seen;
    this.#seen = people;
    if (seen === null) return [];
    const team = (s: Score) => (teamMode(mode) ? s.team : 0);
    const out: RosterNotice[] = [];
    for (const [id, s] of people) {
      if (seen.has(id)) continue;
      out.push({ text: `${s.name} ${this.#gone.delete(id) ? 'is back' : 'joined'}`, team: team(s) });
    }
    for (const [id, s] of seen) {
      if (people.has(id)) continue;
      this.#gone.add(id);
      out.push({ text: `${s.name} left`, team: team(s) });
    }
    return out;
  }
}
