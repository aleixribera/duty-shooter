import { WEAPON_IDS, betterMedal, isMedal, type Medal, type ModeId, type Score, type ScoreLine, type ScoreReason, type WeaponId } from '@duty-shooter/fps-core';
import type { MatchRecord, WeaponRecord } from './model';

/**
 * The local player's match as it happens, for their Profile: fed the score
 * events the server tells this client alone (so it holds nobody else's
 * numbers), their deaths and the time played. At the end it is put together
 * with their scoreboard row, the server's own count of Score, kills, deaths
 * and assists, into one record.
 */
export class MatchTracker {
  #reasons: Partial<Record<ScoreReason, number>> = {};
  #weapons: Partial<Record<WeaponId, { kills: number; headshots: number; longest: number }>> = {};
  #headshots = 0;
  #streak = 0;
  #bestStreak = 0;
  #seconds = 0;
  #medal: Medal | null = null;
  /** The weapon of the kill line just read: a headshot line that follows is that kill's. */
  #last: WeaponId | null = null;

  /** A score event of the local player's. */
  score(lines: readonly ScoreLine[]): void {
    for (const line of lines) {
      this.#reasons[line.reason] = (this.#reasons[line.reason] ?? 0) + 1;
      if (isMedal(line.reason)) this.#medal = betterMedal(this.#medal, line.reason);
      if (line.reason === 'kill' || line.reason === 'down') {
        this.#streak += 1;
        this.#bestStreak = Math.max(this.#bestStreak, this.#streak);
        this.#last = WEAPON_IDS.find((id) => id === line.weapon) ?? null;
        if (this.#last) {
          const w = (this.#weapons[this.#last] ??= { kills: 0, headshots: 0, longest: 0 });
          w.kills += 1;
          w.longest = Math.max(w.longest, line.metres ?? 0);
        }
      } else if (line.reason === 'headshot') {
        this.#headshots += 1;
        if (this.#last) this.#weapons[this.#last]!.headshots += 1;
        this.#last = null;
      }
    }
  }

  /** The local player died: their streak ends. */
  died(): void {
    this.#streak = 0;
  }

  /** `dt` more seconds of the match played. */
  played(dt: number): void {
    this.#seconds += dt;
  }

  /** The best Medal so far, or null. */
  get medal(): Medal | null {
    return this.#medal;
  }

  /** The match as the Profile takes it: this tracker's own counts beside the scoreboard row's. */
  record(about: { readonly mode: ModeId; readonly won: boolean; readonly place: number | null; readonly row: Pick<Score, 'score' | 'kills' | 'deaths' | 'assists'> }): MatchRecord {
    const weapons: Partial<Record<WeaponId, WeaponRecord>> = {};
    for (const id of WEAPON_IDS) {
      const w = this.#weapons[id];
      if (w) weapons[id] = { ...w };
    }
    return {
      mode: about.mode,
      won: about.won,
      place: about.place,
      score: about.row.score,
      kills: about.row.kills,
      deaths: about.row.deaths,
      assists: about.row.assists,
      headshots: this.#headshots,
      seconds: this.#seconds,
      bestStreak: this.#bestStreak,
      weapons,
      reasons: { ...this.#reasons },
      medal: this.#medal,
    };
  }
}
