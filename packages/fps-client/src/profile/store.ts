import { PROFILE_KEY, RETIRED_PROFILE_KEYS, applyCourse, applyMatch, dateKey, emptyProfile, readProfile, readSaveCode, saveCode, type MatchGain, type MatchRecord, type Profile } from './model';

/** Where a Profile is kept: browser storage, or anything that reads and writes one string. */
export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The Profile of this browser, kept under `PROFILE_KEY`. Storage that is
 * blocked, full or holds something unreadable never throws out of here: the
 * Profile then lives for the session, from zero. A Profile kept under a
 * retired key, from before a reset of all progression, is wiped on load.
 */
export class ProfileStore {
  readonly #storage: ProfileStorage | null;
  readonly #now: () => Date;
  #profile: Profile;
  /** The last write never reached storage (full, blocked): what storage holds is then behind this session's Profile. */
  #unsaved = false;
  /** This load wiped a Profile from before a reset of all progression. */
  readonly wiped: boolean;

  constructor(storage: ProfileStorage | null = browserStorage(), now: () => Date = () => new Date()) {
    this.#storage = storage;
    this.#now = now;
    this.wiped = this.#wipeRetired();
    this.#profile = this.#read() ?? emptyProfile();
  }

  get profile(): Profile {
    return this.#profile;
  }

  /** Today's key for the day's Challenges (the local date). */
  get today(): string {
    return dateKey(this.#now());
  }

  /** Takes a finished match: the Profile after it is saved, and what it gained comes back for the end screen. */
  bank(match: MatchRecord): MatchGain {
    // Another tab may have banked a match, or reset the Profile, since this one read: build on what storage holds now.
    // Unless this session's last write never got there: then the Profile in hand is the newer one.
    const stored = this.#unsaved ? null : this.#read();
    const { profile, gain } = applyMatch(stored ?? this.#profile, match, this.today);
    this.#profile = profile;
    this.#write();
    return gain;
  }

  /** Takes a finished Course run: the best time held before it (null for a first finish), and the run is saved if it beats it. */
  bankCourse(seconds: number): number | null {
    const stored = this.#unsaved ? null : this.#read();
    const before = stored ?? this.#profile;
    this.#profile = applyCourse(before, seconds);
    if (this.#profile !== before || stored === null) this.#write();
    return before.courseBest;
  }

  /** This Profile as a save code, to carry to another browser. */
  get code(): string {
    return saveCode(this.#profile);
  }

  /** Takes the Profile a save code holds in place of this one; false, and nothing changed, when the text is not a save code. */
  load(code: string): boolean {
    const profile = readSaveCode(code);
    if (!profile) return false;
    this.#profile = profile;
    this.#write();
    return true;
  }

  /** Back to nothing: Rank 1, no numbers, and no progress on today's Challenges. */
  reset(): void {
    this.#profile = emptyProfile();
    try {
      this.#storage?.removeItem(PROFILE_KEY);
      this.#unsaved = false;
    } catch {
      // Storage unavailable: the Profile in hand is already empty, and stays the one to build on.
      this.#unsaved = true;
    }
  }

  /** Removes what the retired keys hold; true when there was something. */
  #wipeRetired(): boolean {
    const storage = this.#storage;
    let wiped = false;
    for (const key of RETIRED_PROFILE_KEYS) {
      try {
        if (storage?.getItem(key) == null) continue;
        wiped = true;
        storage.removeItem(key);
      } catch {
        // Storage unavailable: nothing under the old key can be read either.
      }
    }
    return wiped;
  }

  /** What storage holds (an empty Profile when it holds none: never written, or reset), or null when it cannot be read at all. */
  #read(): Profile | null {
    if (!this.#storage) return null;
    try {
      return readProfile(this.#storage.getItem(PROFILE_KEY));
    } catch {
      return null;
    }
  }

  #write(): void {
    try {
      this.#storage?.setItem(PROFILE_KEY, JSON.stringify(this.#profile));
      this.#unsaved = false;
    } catch {
      // Storage unavailable (private mode, quota): the Profile lives for this session only.
      this.#unsaved = true;
    }
  }
}

function browserStorage(): ProfileStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
