/**
 * The match clock on the match bar (ticket 24). A match ends with the bomb, so
 * the whole match is the countdown to it: the clock reads T-minus from the
 * first second, over a quiet fuse that burns down from both ends to the last
 * minute. There the fuse lights again in the alert colour, the clock turns
 * alert with it, and in the last ten seconds it reads tenths and ticks on each one.
 */

/** Seconds from the end at which the clock turns to T-minus, and at which it reads tenths. */
export const LAST_MINUTE = 60;
export const LAST_TEN = 10;
/** How long the clock stays big after each of the last ten seconds turns (s). */
const TICK_SECONDS = 0.2;

export interface ClockFace {
  /** What the clock reads. */
  readonly text: string;
  /** The act the clock is in: the match, its last minute, its last ten seconds. */
  readonly act: 'match' | 'minute' | 'ten';
  /** Before the last minute, how much of the match is left before it (1 without a known length); in it, how much of it is left. 1 to 0. */
  readonly fuse: number;
  /** One of the last ten seconds has just turned. */
  readonly tick: boolean;
}

const two = (n: number): string => String(n).padStart(2, '0');

/** The face of the clock with `secondsLeft` of a match `length` seconds long (null: unknown) to go. */
export function clockFace(secondsLeft: number, length: number | null = null): ClockFace {
  const left = Math.max(0, Number.isFinite(secondsLeft) ? secondsLeft : 0);
  const whole = Math.ceil(left);
  if (left > LAST_MINUTE) {
    const before = length !== null && length > LAST_MINUTE ? Math.min(1, (left - LAST_MINUTE) / (length - LAST_MINUTE)) : 1;
    return { text: `T−${Math.floor(whole / 60)}:${two(whole % 60)}`, act: 'match', fuse: before, tick: false };
  }
  const fuse = left / LAST_MINUTE;
  if (left > LAST_TEN) return { text: `T−${Math.floor(whole / 60)}:${two(whole % 60)}`, act: 'minute', fuse, tick: false };
  // Tenths count down, so they are cut, not rounded: the clock never reads a tenth it has not reached.
  const tenths = Math.floor(left * 10);
  return { text: `T−${two(Math.floor(tenths / 10))}.${tenths % 10}`, act: 'ten', fuse, tick: left > 0 && whole - left < TICK_SECONDS };
}

/** The class of the clock's own element for a face. */
export function clockClass(face: ClockFace): string {
  return face.act === 'match' ? 'clock' : `clock tminus${face.act === 'ten' ? ' ten' : ''}${face.tick ? ' tick' : ''}`;
}

/**
 * The clock's place in the match bar's markup. Before the last minute it is
 * the clock and its quiet fuse as they read, which changes once a second. In
 * the last minute it is the clock and its fuse as empty elements: what they
 * read changes many times a second, and is painted into them
 * (`MatchClockView`) instead of rebuilding the whole bar for a tenth of a second.
 */
export function matchClockHtml(secondsLeft: number, length: number | null = null): string {
  const face = clockFace(secondsLeft, length);
  if (face.act === 'match') return `<span class="clock">${face.text}</span><span class="fuse quiet"><i style="transform:scaleX(${fuseDrawn(face.fuse)})"></i></span>`;
  return '<span class="clock tminus"></span><span class="fuse"><i></i></span>';
}

/** The fuse's length as it is drawn: in steps of half a hundredth, so it is written three times a second and not every frame. */
export function fuseDrawn(fuse: number): string {
  return String(Math.round(Math.max(0, Math.min(1, fuse)) * 200) / 200);
}

/** Paints the last minute's clock and fuse into the match bar's elements, writing only what changed. */
export class MatchClockView {
  #clock: HTMLElement | null = null;
  #fuse: HTMLElement | null = null;
  #text = '';
  #cls = '';
  #length = '';

  /** `bar` holds `matchClockHtml(secondsLeft)`; null where it shows no match clock, or another kind of clock. */
  paint(bar: HTMLElement, secondsLeft: number | null): void {
    if (secondsLeft === null || secondsLeft > LAST_MINUTE) {
      this.#clock = this.#fuse = null;
      return;
    }
    // The bar is rewritten whenever a score changes: its elements are then new ones, and empty.
    if (!this.#clock?.isConnected || !this.#fuse?.isConnected) {
      this.#clock = bar.querySelector<HTMLElement>('.clock.tminus');
      this.#fuse = bar.querySelector<HTMLElement>('.fuse i');
      this.#text = this.#cls = this.#length = '';
    }
    if (!this.#clock || !this.#fuse) return;
    const face = clockFace(secondsLeft);
    if (face.text !== this.#text) this.#clock.textContent = this.#text = face.text;
    const cls = clockClass(face);
    if (cls !== this.#cls) this.#clock.className = this.#cls = cls;
    const length = fuseDrawn(face.fuse);
    if (length !== this.#length) this.#fuse.style.transform = `scaleX(${(this.#length = length)})`;
  }
}

export const MATCH_CLOCK_CSS = `
.ds-match .mid { position: relative; }
.ds-match .clock { font-variant-numeric: tabular-nums; }
.ds-match .clock.tminus { color: var(--ds-alert); min-width: 6ch; text-align: center; }
.ds-match .clock.ten { transform: scale(1.12); }
.ds-match .clock.ten.tick { transform: scale(1.3); color: var(--ds-text); }
.ds-match .fuse { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: color-mix(in srgb, var(--ds-alert) 24%, transparent); }
.ds-match .fuse i { display: block; height: 100%; background: var(--ds-alert); transform-origin: 50% 50%; }
.ds-match .fuse.quiet { background: var(--ds-line); }
.ds-match .fuse.quiet i { background: var(--ds-text-2); }
@media (prefers-reduced-motion: reduce) { .ds-match .clock.ten.tick { transform: scale(1.12); } }
`;
