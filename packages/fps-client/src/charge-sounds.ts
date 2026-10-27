import type { ChargeState, PlayerId, Vec3 } from '@duty-shooter/fps-core';
import { FUSE_TIME } from '@duty-shooter/fps-core/modes';
import type { SoundEventName, SoundParams } from './audio';

/** One Charge sound to play now. */
export interface ChargeCue {
  readonly event: SoundEventName;
  readonly params: SoundParams;
}

/** How far ahead (s) sounds are queued, so a beep starts on time between frames. */
const LOOKAHEAD = 0.1;

/**
 * Seconds between the charge's beeps with `remaining` s of its fuse left:
 * once a second at the plant, quickening to ten a second at the end.
 */
export function beepInterval(remaining: number): number {
  const left = Math.min(1, Math.max(0, remaining / FUSE_TIME));
  return 0.1 + 0.9 * left ** 1.3;
}

/**
 * Schedules Charge's sounds from the round's state: the keypad tapped while
 * the charge is planted, a chirp once it is armed, its beeping all through
 * the fuse, the tools clicking while it is defused, and the tones when it
 * is disarmed. Feed it the state each frame with a steady clock; it hands
 * back what to play. The detonation is the game's explosion, not this.
 */
export class ChargeSounds {
  /** When the next beep, key tap or tool click is due (clock seconds), or null when none is under way. */
  #beep: number | null = null;
  #tap: number | null = null;
  /** The planted charge seen last, for the tones when it is disarmed. */
  #planted: Vec3 | null = null;
  readonly #random: () => number;

  constructor(random: () => number = Math.random) {
    this.#random = random;
  }

  /** What to start at `now`, from the state of the round (null outside Charge) and where each player stands. */
  update(state: ChargeState | null, now: number, positionOf: (id: PlayerId) => Vec3 | null): ChargeCue[] {
    const cues: ChargeCue[] = [];
    const at = (due: number) => Math.max(0, due - now);
    const planted = state?.phase === 'planted' ? (state.planted?.position ?? null) : null;
    if (planted && !this.#planted) cues.push({ event: 'chargeArmed', params: { position: planted } });
    if (!planted && this.#planted && state?.outcome?.reason === 'defused') cues.push({ event: 'chargeDisarmed', params: { position: this.#planted } });
    this.#planted = planted;

    // The fuse: each beep's gap from the time left when it sounds.
    if (planted && state) {
      // The first one just after the armed chirp.
      this.#beep ??= now + 0.4;
      if (this.#beep < now - 1) this.#beep = now;
      while (this.#beep <= now + LOOKAHEAD) {
        cues.push({ event: 'chargeBeep', params: { position: planted, when: at(this.#beep) } });
        this.#beep += beepInterval(state.remaining - (this.#beep - now));
      }
    } else this.#beep = null;

    // Planting taps the keypad; defusing works the tools, a little slower.
    const action = state?.action ?? null;
    const by = action ? positionOf(action.player) : null;
    if (action && by) {
      this.#tap ??= now;
      if (this.#tap < now - 1) this.#tap = now;
      while (this.#tap <= now + LOOKAHEAD) {
        const plant = action.kind === 'plant';
        cues.push({ event: plant ? 'chargeKey' : 'chargeTool', params: { position: by, when: at(this.#tap), intensity: this.#random() } });
        this.#tap += plant ? 0.25 + 0.2 * this.#random() : 0.45 + 0.4 * this.#random();
      }
    } else this.#tap = null;
    return cues;
  }
}
