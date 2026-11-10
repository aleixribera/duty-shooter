import type { HitKind } from './hud/hud';

/**
 * Controller rumble (ticket 13): what the hands feel of a shot, a hit, a hurt
 * and a blast. Two motors, as every pad has: `strong` the heavy, slow one in
 * the left grip (a thump), `weak` the light, fast one in the right (a buzz).
 */
export interface Rumble {
  /** The heavy motor, 0..1. */
  readonly strong: number;
  /** The light motor, 0..1. */
  readonly weak: number;
  /** How long it runs (ms). */
  readonly ms: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Your own shot, by the gun's camera kick (a 9 mm about 0.7, a rifle 1, the
 * sniper 3): a light gun is a short buzz the right hand feels under a long
 * burst, a heavy one a thump through both grips.
 */
export function shotRumble(kick: number): Rumble {
  const heavy = clamp01((kick - 0.8) / 2.2);
  return { strong: 0.08 + 0.62 * heavy, weak: clamp01(0.22 + 0.12 * kick), ms: Math.round(45 + 55 * heavy) };
}

/** A hit you made: a tick in the right hand, a firmer one for the head, a knock through both for the kill. */
export function hitRumble(kind: HitKind): Rumble | null {
  switch (kind) {
    case 'hit':
      return { strong: 0, weak: 0.35, ms: 40 };
    case 'headshot':
      return { strong: 0.1, weak: 0.55, ms: 55 };
    case 'kill':
      return { strong: 0.4, weak: 0.5, ms: 90 };
    case 'headshotKill':
      return { strong: 0.5, weak: 0.65, ms: 110 };
    case 'shielded':
      return null;
  }
}

/** A hit you took, by its damage: a graze is a nudge, a sniper round a heavy blow. */
export function hurtRumble(damage: number): Rumble {
  const t = clamp01(damage / 60);
  return { strong: 0.35 + 0.55 * t, weak: 0.2 + 0.3 * t, ms: Math.round(120 + 160 * t) };
}

/** A blast you were near (m): close up a long heavy roll, out to `reach` a dull far thud, nothing past it. */
export function blastRumble(distance: number, reach = 20): Rumble | null {
  const t = 1 - distance / reach;
  if (t <= 0) return null;
  return { strong: clamp01(0.15 + 0.85 * t * t), weak: clamp01(0.1 + 0.4 * t), ms: Math.round(150 + 350 * t) };
}

/** A landing, by how far you fell (m): nothing for a hop or a step down, a thump off a roof. */
export function landRumble(fall: number): Rumble | null {
  const t = clamp01((fall - 1.5) / 4.5);
  if (t <= 0) return null;
  return { strong: 0.25 + 0.5 * t, weak: 0.1, ms: Math.round(70 + 80 * t) };
}

/** An effect being felt: its levels and when it ends (ms, on the caller's clock). */
export interface Felt {
  readonly strong: number;
  readonly weak: number;
  readonly until: number;
}

/** Less of an effect than this (ms) is not felt. */
const TOO_SHORT = 8;

/**
 * What the motors should play now, from every effect being felt: a pad plays
 * one effect at a time and a new one cuts the old, so the effects are mixed
 * here. Each motor runs at the strongest level felt, until the soonest of
 * those effects ends; then it is worked out again, so a blast's weight lasts
 * as long as the blast and no longer, whatever ticks come on top. Null once
 * nothing is felt.
 */
export function rumbleNow(felt: readonly Felt[], now: number): Rumble | null {
  let strong = 0;
  let weak = 0;
  let next = Infinity;
  for (const f of felt) {
    // An effect with less than a few milliseconds left is over: too short to feel, and not worth a call to the pad.
    if (f.until <= now + TOO_SHORT) continue;
    strong = Math.max(strong, f.strong);
    weak = Math.max(weak, f.weak);
    next = Math.min(next, f.until);
  }
  return next === Infinity ? null : { strong, weak, ms: Math.round(next - now) };
}

/** The part of the browser's GamepadHapticActuator this needs (not in every lib.dom). */
export interface Actuator {
  playEffect(type: 'dual-rumble', params: { duration: number; startDelay?: number; strongMagnitude: number; weakMagnitude: number }): Promise<unknown>;
  reset?(): Promise<unknown>;
}

/** Plays rumbles on the pad in use, scaled by the player's setting; nothing without a pad that can. */
export class Rumbler {
  /** The effects being felt. */
  #felt: Felt[] = [];
  /** What the motors were last sent, and until when. */
  #sent: Rumble | null = null;
  #sentUntil = 0;
  /** The pad last played on: `stop` reaches it even once the page has lost the focus. */
  #pad: Actuator | null = null;

  constructor(
    private readonly actuator: () => Actuator | null,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Feels `r` at `strength` (the setting, 0..1); 0 or no pad does nothing. */
  play(r: Rumble | null, strength: number): void {
    if (!r || strength <= 0) return;
    const now = this.now();
    this.#felt = this.#felt.filter((f) => f.until > now);
    this.#felt.push({ strong: clamp01(r.strong * strength), weak: clamp01(r.weak * strength), until: now + r.ms });
    const want = rumbleNow(this.#felt, now);
    if (!want) return;
    // Nothing new to feel: what runs already carries it, and `update` takes over when it ends.
    const running = this.#sent !== null && this.#sentUntil > now ? this.#sent : null;
    if (running && want.strong <= running.strong && want.weak <= running.weak && now + want.ms <= this.#sentUntil) return;
    this.#send(want, now);
  }

  /** Once a frame: when what the motors run ends while something is still felt, the next levels are sent. */
  update(): void {
    if (this.#felt.length === 0) return;
    const now = this.now();
    if (now < this.#sentUntil) return;
    this.#felt = this.#felt.filter((f) => f.until > now);
    const want = rumbleNow(this.#felt, now);
    if (want) this.#send(want, now);
    else this.#sent = null;
  }

  /** Stops the motors at once (a pause, a death screen, leaving the match). */
  stop(): void {
    const running = this.#sentUntil > this.now();
    this.#felt = [];
    this.#sent = null;
    this.#sentUntil = 0;
    const pad = this.#pad;
    if (!running || !pad) return;
    if (pad.reset) pad.reset().catch(() => {});
    else pad.playEffect('dual-rumble', { duration: 1, strongMagnitude: 0, weakMagnitude: 0 }).catch(() => {});
  }

  #send(r: Rumble, now: number): void {
    const pad = this.actuator();
    if (!pad) return;
    this.#pad = pad;
    this.#sent = r;
    this.#sentUntil = now + r.ms;
    pad.playEffect('dual-rumble', { duration: r.ms, strongMagnitude: r.strong, weakMagnitude: r.weak }).catch(() => {});
  }
}
