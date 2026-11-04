/**
 * The Battle Royale's announcer (ticket 72): a voice for the Ring closing and
 * for how many are left. Spoken by the browser's own speech synthesis behind a
 * small `Speaker`, so it needs no recorded assets and a recorded voice can take
 * its place later without touching the game.
 */

/** Something that can say a line aloud. */
export interface Speaker {
  /** Says `text` at `volume` (0..1), after what it is saying now; with lines already waiting, this one is dropped. */
  speak(text: string, volume: number): void;
  /** Stops talking and forgets what was waiting. */
  cancel(): void;
}

/** Lines that may wait behind the one being said: a Ring and a count on the same moment both get said, a pile-up doesn't. */
const WAITING = 1;

/**
 * The browser's speech synthesis, or null where there is none. A scripted
 * browser (navigator.webdriver) gets a speaker that only writes its lines to
 * `__announced`: the system's voice is outside the page's audio, so muting
 * the browser would not silence it.
 */
export function browserSpeaker(): Speaker | null {
  const scope = globalThis as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance; navigator?: { webdriver?: boolean }; __announced?: [string, number][] };
  if (scope.navigator?.webdriver) return { speak: (text, volume) => void (scope.__announced ??= []).push([text, volume]), cancel: () => {} };
  const synth = scope.speechSynthesis;
  const Utterance = scope.SpeechSynthesisUtterance;
  if (!synth || !Utterance) return null;
  let waiting = 0;
  return {
    speak(text, volume) {
      // Lines are news of the moment: stale ones piling up behind each other are dropped, not queued.
      if (synth.speaking && waiting >= WAITING) return;
      const line = new Utterance(text);
      line.volume = volume;
      line.rate = 1.05;
      line.pitch = 0.9;
      waiting++;
      const started = () => {
        waiting = Math.max(0, waiting - 1);
        line.onstart = line.onerror = null;
      };
      line.onstart = started;
      line.onerror = started;
      synth.speak(line);
    },
    cancel() {
      waiting = 0;
      synth.cancel();
    },
  };
}

/** The counts the announcer calls out as they are reached. */
export const LEFT_CALLS: readonly number[] = [10, 5, 3, 2];

/**
 * The line for Squads (or, in Solos, players) left as the count goes from
 * `before` to `now`, or null: only on the way down past a call, never on
 * joining (`before` null) and never for the last one standing (the victory
 * beat says that).
 */
export function leftLine(before: number | null, now: number, solo: boolean): string | null {
  if (before === null || now >= before || now < 2) return null;
  if (!LEFT_CALLS.some((call) => before > call && now <= call)) return null;
  return `${now} ${solo ? 'players' : 'squads'} left`;
}

/** The announcer: says lines through its speaker at the game's volume, silent when the volume is off. */
export class Announcer {
  readonly #speaker: Speaker | null;
  volume = 1;

  constructor(speaker: Speaker | null) {
    this.#speaker = speaker;
  }

  say(line: string): void {
    if (this.#speaker && this.volume > 0) this.#speaker.speak(line, Math.min(1, this.volume));
  }

  /** Silent at once: the game is going. */
  stop(): void {
    this.#speaker?.cancel();
  }
}
