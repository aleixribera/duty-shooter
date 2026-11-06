import type { Vec3 } from './math';
import type { PlayerId, PlayerOutput } from './simulation';

/**
 * Sound traps (ticket 72): spots on a map that give away whoever runs past.
 * Birds flush out of a canopy, sheet metal rattles, loose gravel slides. Each
 * one is a single sound at its spot, sent as a world event, so people hear it
 * and bots learn from it the same way. No physics: a trap is only a point.
 */
export type TrapKind = 'birds' | 'metal' | 'gravel';

export const TRAP_KINDS: readonly TrapKind[] = ['birds', 'metal', 'gravel'];

/** One trap: what it sounds like and where. */
export interface SoundTrap {
  readonly kind: TrapKind;
  readonly position: Vec3;
}

/** A trap went off, as clients hear it: what and where, never who. */
export interface TrapEvent {
  readonly type: 'trap';
  readonly kind: TrapKind;
  readonly position: Vec3;
}

/** A trap went off, as the server knows it: every loud body within reach set it off (for bots only). */
export interface TrapSound extends TrapEvent {
  readonly players: readonly PlayerId[];
}

/** How near (m, on the ground plane) a running body sets a trap off. */
export const TRAP_REACH = 8;
/** Height (m) a body may be above or below a trap and still set it off: birds sit up in the canopy. */
const TRAP_HEIGHT = 10;
/** Seconds a trap stays quiet after going off: the birds are gone, the metal has stopped ringing. */
export const TRAP_REST = 30;
/** How far (m) a trap is heard: by people (the snapshot's mid range carries it) and by bots. */
export const TRAP_HEARD = 90;

/** A body moving loud enough to set a trap off: running, sliding, or landing from a jump. */
function loud(p: PlayerOutput): boolean {
  if (!p.alive || p.downed || p.kind !== 'player') return false;
  return p.movement === 'sprint' || p.movement === 'slide' || p.landing !== null;
}

/** A map's traps through a match: which went off when. */
export class SoundTraps {
  readonly #traps: readonly SoundTrap[];
  /** When each trap may next go off. */
  readonly #ready: Float64Array;

  constructor(traps: readonly SoundTrap[]) {
    this.#traps = traps;
    this.#ready = new Float64Array(traps.length);
  }

  get traps(): readonly SoundTrap[] {
    return this.#traps;
  }

  /** A new match: every trap set again. */
  reset(): void {
    this.#ready.fill(0);
  }

  /** The traps the players set off at `time`. */
  step(players: readonly PlayerOutput[], time: number): TrapSound[] {
    const out: TrapSound[] = [];
    if (this.#traps.length === 0) return out;
    for (let i = 0; i < this.#traps.length; i++) {
      if (time < this.#ready[i]!) continue;
      const t = this.#traps[i]!;
      let by: PlayerId[] | null = null;
      for (const p of players) {
        if (Math.abs(p.position[0] - t.position[0]) > TRAP_REACH || Math.abs(p.position[2] - t.position[2]) > TRAP_REACH) continue;
        if (Math.hypot(p.position[0] - t.position[0], p.position[2] - t.position[2]) > TRAP_REACH) continue;
        if (Math.abs(p.position[1] - t.position[1]) > TRAP_HEIGHT || !loud(p)) continue;
        (by ??= []).push(p.id);
      }
      if (!by) continue;
      out.push({ type: 'trap', kind: t.kind, position: t.position, players: by });
      this.#ready[i] = time + TRAP_REST;
    }
    return out;
  }
}
