import type { ScoreLine } from '@duty-shooter/fps-core';
import type { MatchGain } from './model';
import type { ProfileStore } from './store';
import { MatchTracker } from './tracker';

/** Where the local player's match stands this frame, as its keeper needs it. */
export interface MatchMoment {
  /** The match is being played and they are still in it. */
  readonly playing: boolean;
  /** It is over for them: the match has its result, or their Squad has its place. */
  readonly over: boolean;
  /** The scoreboard's half of the record, read only as the match is banked. */
  readonly about: () => Parameters<MatchTracker['record']>[0];
}

/**
 * One match of the local player's on its way into their Profile: its time
 * counts while they are in it, and it is banked once, when it is over for
 * them. A match this page never saw played (joined at its end) is nobody's to
 * bank, and one left before its end is not banked either.
 */
export class MatchKeeper {
  readonly #store: ProfileStore | null;
  #tracker = new MatchTracker();
  #played = false;
  #banked = false;
  #gain: MatchGain | null = null;

  constructor(store: ProfileStore | null) {
    this.#store = store;
  }

  /** What the match gave the Profile, once banked. */
  get gain(): MatchGain | null {
    return this.#gain;
  }

  /** A match begins, or the game is left: nothing of the last one is carried over. */
  begin(): void {
    this.#tracker = new MatchTracker();
    this.#played = false;
    this.#banked = false;
    this.#gain = null;
  }

  /** A score event of the local player's. */
  score(lines: readonly ScoreLine[]): void {
    this.#tracker.score(lines);
  }

  /** The local player died. */
  died(): void {
    this.#tracker.died();
  }

  /** A frame of a match the server scores. */
  update(dt: number, moment: MatchMoment): void {
    if (!this.#store) return;
    if (moment.playing) {
      this.#played = true;
      this.#tracker.played(dt);
    } else if (moment.over && this.#played && !this.#banked) {
      this.#banked = true;
      this.#gain = this.#store.bank(this.#tracker.record(moment.about()));
    }
  }
}
