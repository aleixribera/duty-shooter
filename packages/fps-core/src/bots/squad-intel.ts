import type { Vec3 } from '../math';
import type { PlayerId } from '../simulation';

/** An enemy as a squadmate saw or heard them, passed on to the rest of the Squad. */
export interface Callout {
  readonly position: Vec3;
  /** Simulation time (s) of the sighting. */
  readonly time: number;
  /** Seen, rather than heard or felt (a hit from somewhere). */
  readonly seen: boolean;
  /** How they were moving when seen (zero when only heard). */
  readonly velocity: Vec3;
  /** The squadmate who saw or heard it. */
  readonly by: PlayerId;
}

/** Where a squadmate has said it is going: what a "going here" ping says. */
export interface Heading {
  readonly point: Vec3;
  /** When it was said (s). */
  readonly time: number;
  /** Going after a fight it heard. */
  readonly hunt: boolean;
}

/** Callouts older than this (s) are dropped: a squadmate would have said something newer by now. */
const CALLOUT_LIFE = 30;

/**
 * What one Squad knows together: every enemy any squadmate has seen or heard,
 * when the Squad last had a brush with one, who has said they'll Revive whom,
 * and where each squadmate means to go. Only what a squadmate could have seen,
 * heard or felt goes in, never a true position. Each bot reads it and makes its
 * own decisions; nothing here gives an order.
 */
export class SquadIntel {
  readonly #callouts = new Map<PlayerId, Callout>();
  readonly #claims = new Map<PlayerId, { readonly by: PlayerId; readonly time: number }>();
  readonly #headings = new Map<PlayerId, Heading>();
  /** When a squadmate last saw an enemy, heard one near, was hit, or went Down (s). */
  contact = -Infinity;

  /**
   * A squadmate saw or heard `enemy`: newer news replaces older, and a
   * sighting isn't replaced by a sound from the same moment. Gunfire heard from
   * far off (`near` false) is passed on without putting the Squad on its guard.
   */
  report(enemy: PlayerId, callout: Callout, near = true): void {
    const known = this.#callouts.get(enemy);
    if (near && callout.time > this.contact) this.contact = callout.time;
    if (known && (known.time > callout.time || (known.time === callout.time && known.seen && !callout.seen))) return;
    this.#callouts.set(enemy, callout);
  }

  /** The enemy is out (killed): nothing more to say about them. */
  forget(enemy: PlayerId): void {
    this.#callouts.delete(enemy);
  }

  /** Every enemy called out within the last half minute of `time`. */
  *callouts(time: number): Iterable<readonly [PlayerId, Callout]> {
    for (const entry of this.#callouts) {
      if (time - entry[1].time > CALLOUT_LIFE) this.#callouts.delete(entry[0]);
      else yield entry;
    }
  }

  /** The squadmate going to Revive `downed`, if one has said so and still holds to it. */
  reviver(downed: PlayerId): PlayerId | null {
    return this.#claims.get(downed)?.by ?? null;
  }

  /** `by` says it will Revive `downed`, unless another squadmate already has. Whether it's `by`'s to do. */
  claim(downed: PlayerId, by: PlayerId, time: number): boolean {
    const held = this.#claims.get(downed);
    if (held && held.by !== by) return false;
    this.#claims.set(downed, { by, time });
    return true;
  }

  /** `by` no longer goes for `downed` (or anybody, when absent). */
  release(by: PlayerId, downed?: PlayerId): void {
    for (const [d, c] of this.#claims) if (c.by === by && (downed === undefined || d === downed)) this.#claims.delete(d);
  }

  /** `downed` is up, or gone: its claim goes too. */
  settled(downed: PlayerId): void {
    this.#claims.delete(downed);
  }

  /** `by` says it is headed to `point`. */
  head(by: PlayerId, heading: Heading): void {
    this.#headings.set(by, heading);
  }

  heading(by: PlayerId): Heading | null {
    return this.#headings.get(by) ?? null;
  }

  /** The newest thing a squadmate other than `self` has said it is headed for, among those still standing. */
  newestHeading(self: PlayerId, standing: ReadonlySet<PlayerId>): (Heading & { readonly by: PlayerId }) | null {
    let best: (Heading & { readonly by: PlayerId }) | null = null;
    for (const [by, h] of this.#headings) if (by !== self && standing.has(by) && (!best || h.time > best.time)) best = { ...h, by };
    return best;
  }
}
