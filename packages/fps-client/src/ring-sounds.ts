import type { Vec3 } from '@duty-shooter/fps-core';
import type { SoundEventName, SoundParams } from './audio';
import { RING_HUM_SECONDS, RING_OVERLAP } from './audio/ring';
import type { RingCircle } from './ui/royale';

/** How far from the wall its hum is still played (m): past this its distance law has it inaudible anyway. */
export const RING_HEARD = 260;
/** How near the wall a listener hears it spark (m). */
const CRACKLE_HEARD = 90;
/** Scheduled this far ahead (s), so a slow frame doesn't open a gap. */
const LOOKAHEAD = 0.15;

export interface RingCue {
  readonly event: SoundEventName;
  readonly params: SoundParams;
}

/**
 * When and where the Ring is heard: its hum in overlapping segments from
 * the point of the wall nearest the listener (so it pans and swells as you
 * walk up to it, inside or out), and a discharge every few seconds along
 * the wall near by. `random` is for the sparks' timing and spread.
 */
export class RingSounds {
  readonly #random: () => number;
  #hum: number | null = null;
  #snap: number | null = null;

  constructor(random: () => number = Math.random) {
    this.#random = random;
  }

  /** The cues due by `time` (s) for a listener at `listener`, with the Ring at `ring` (null: no Ring, all quiet). */
  update(ring: RingCircle | null, time: number, listener: Vec3): RingCue[] {
    if (!ring || ring.radius <= 0.5) {
      this.#hum = null;
      this.#snap = null;
      return [];
    }
    const dx = listener[0] - ring.x;
    const dz = listener[2] - ring.z;
    const from = Math.hypot(dx, dz);
    const [ux, uz] = from > 1e-6 ? [dx / from, dz / from] : [1, 0];
    const away = Math.abs(from - ring.radius);
    const cues: RingCue[] = [];
    const when = (at: number) => Math.max(0, at - time);
    if (this.#hum === null || this.#hum < time - RING_HUM_SECONDS) this.#hum = time;
    while (this.#hum <= time + LOOKAHEAD) {
      const at = this.#hum;
      this.#hum += RING_HUM_SECONDS - RING_OVERLAP;
      if (away > RING_HEARD) continue;
      cues.push({ event: 'ringHum', params: { position: [ring.x + ux * ring.radius, listener[1], ring.z + uz * ring.radius], when: when(at) } });
    }
    this.#snap ??= time + this.#random() * 2;
    if (this.#snap <= time + LOOKAHEAD) {
      const at = this.#snap;
      this.#snap = time + 0.6 + this.#random() * 3;
      if (away <= CRACKLE_HEARD) {
        // Somewhere along the wall within about 25 m either side of its nearest point.
        const turn = ((this.#random() - 0.5) * 50) / ring.radius;
        const a = Math.atan2(uz, ux) + turn;
        cues.push({ event: 'ringCrackle', params: { position: [ring.x + Math.cos(a) * ring.radius, listener[1] + this.#random() * 6, ring.z + Math.sin(a) * ring.radius], when: when(at) } });
      }
    }
    return cues;
  }
}
