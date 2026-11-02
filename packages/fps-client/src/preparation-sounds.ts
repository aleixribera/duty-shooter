import type { SoundEventName, SoundParams } from './audio';
import { DRONE_OVERLAP, DRONE_SECONDS } from './audio/preparation';
import type { PreparationTime } from './preparation-shot';

/** Scheduled this far ahead (s), so a slow frame doesn't open a gap. */
const LOOKAHEAD = 0.15;
/** The heartbeat comes in after this long, and its gap shrinks from the first to the last as tension builds. */
const BEAT_FROM = 1.5;
const BEAT_GAP = [1.05, 0.5] as const;

export interface PreparationCue {
  readonly event: SoundEventName;
  readonly params: SoundParams;
}

/**
 * When the Preparation is heard: the drone in overlapping segments, louder
 * as the drop nears, and the heartbeat quickening with it. Quiet as soon as
 * play starts.
 */
export class PreparationSounds {
  #drone: number | null = null;
  #beat: number | null = null;

  /** The cues due by `clock` (s, the page's clock) with the Preparation at `time` (null: none, all quiet). */
  update(time: PreparationTime | null, clock: number): PreparationCue[] {
    if (!time || time.left <= 0.05) {
      this.#drone = this.#beat = null;
      return [];
    }
    // Tension: how far through the Preparation, as it stands now.
    const k = Math.min(1, Math.max(0, time.elapsed / Math.max(1e-6, time.elapsed + time.left)));
    const cues: PreparationCue[] = [];
    const when = (at: number) => Math.max(0, at - clock);
    if (this.#drone === null || this.#drone < clock - DRONE_SECONDS) this.#drone = clock;
    while (this.#drone <= clock + LOOKAHEAD) {
      cues.push({ event: 'prepDrone', params: { intensity: 0.35 + 0.65 * k, when: when(this.#drone) } });
      this.#drone += DRONE_SECONDS - DRONE_OVERLAP;
    }
    if (time.elapsed >= BEAT_FROM) {
      if (this.#beat === null || this.#beat < clock - 1) this.#beat = clock;
      while (this.#beat <= clock + LOOKAHEAD && this.#beat - clock < time.left) {
        cues.push({ event: 'heartbeat', params: { intensity: 0.4 + 0.6 * k, when: when(this.#beat) } });
        this.#beat += BEAT_GAP[0] + (BEAT_GAP[1] - BEAT_GAP[0]) * k;
      }
    }
    return cues;
  }
}
