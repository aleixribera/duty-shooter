/**
 * A recorded voice on the voice bus (next-level ticket 16): one audio file with every line in
 * it, and a table of where each lies. The sound system plays a line by its id; who may speak
 * when is `SpeechQueue`'s, kept apart from the audio graph so it can be tested without one.
 */

/** One line of a recording: what it says, the text it was recorded from, and where it lies in the file (s). */
export interface SpeechLine {
  readonly text: string;
  readonly spoken: string;
  readonly start: number;
  readonly seconds: number;
}

/** A recording's table (what `tools/voice/build.py` writes beside the audio). */
export interface SpeechIndex {
  readonly voice: string;
  readonly sampleRate: number;
  readonly seconds: number;
  /** The recording this table was written for: its length in bytes and its SHA-256. */
  readonly bytes?: number;
  readonly sha256?: string;
  readonly lines: Readonly<Record<string, SpeechLine>>;
}

/** A line taken to be said: how long until it starts (s), and how long it is. */
export interface Spoken {
  readonly wait: number;
  readonly seconds: number;
}

export interface SpeechState {
  /** Decoded and ready to be said. */
  readonly ready: boolean;
  /** The recording could not be fetched or decoded: there will be no recorded voice this session. */
  readonly failed: boolean;
  /** Lines said since the page loaded, the last of them, and when the voice will have finished (context time, s). */
  readonly said: number;
  readonly last: string | null;
  readonly until: number;
}

export interface Speech {
  /** Hands over a recording: its table and its audio file's bytes. Decoded once there is a context to decode it. */
  load(index: SpeechIndex, audio: ArrayBuffer): void;
  /** The recording could not be had: whoever speaks may fall back on something else. */
  fail(): void;
  /** How long line `id` is (s); null before the table is in, or for a line it does not have. */
  seconds(id: string): number | null;
  /**
   * Says line `id`, after what is being said now. With a line already waiting it is dropped,
   * and null comes back; so it does while there is no sound to say it with. A line that `cuts`
   * is said now, over whatever was being said.
   */
  say(id: string, cuts?: boolean): Spoken | null;
  /** Stops talking and forgets what was waiting. */
  hush(): void;
  readonly state: SpeechState;
}

/** Lines that may wait behind the one being said: news of the same moment both get said, a pile-up does not. */
export const SPEECH_WAITING = 1;

/** The pause between one line and the next (s). */
export const SPEECH_BREATH = 0.18;

/** How fast a line that is cut off goes quiet (s). */
export const SPEECH_CUT = 0.04;

/** Who speaks when: one line at a time, one waiting, the rest dropped. */
export class SpeechQueue {
  #lines: { readonly id: string; readonly from: number; readonly to: number }[] = [];

  /**
   * Line `id`, `seconds` long, offered at `now`: when it starts, or null when it is dropped
   * (a line is already waiting, or this very line is being said or about to be). A line that
   * `cuts` starts now and clears the rest.
   */
  offer(id: string, seconds: number, now: number, cuts = false): number | null {
    this.#lines = this.#lines.filter((l) => l.to > now);
    if (cuts) {
      this.#lines = [{ id, from: now, to: now + seconds }];
      return now;
    }
    if (this.#lines.length > SPEECH_WAITING || this.#lines.some((l) => l.id === id)) return null;
    const last = this.#lines[this.#lines.length - 1];
    const from = last ? last.to + SPEECH_BREATH : now;
    this.#lines.push({ id, from, to: from + seconds });
    return from;
  }

  clear(): void {
    this.#lines = [];
  }

  /** When the last line taken will have been said (s); `now` when nothing is. */
  until(now: number): number {
    return this.#lines.reduce((t, l) => Math.max(t, l.to), now);
  }
}

/** What a recorded voice needs of the sound system it plays through. */
export interface SpeechHost {
  /** The context, once there is one. */
  context(): BaseAudioContext | null;
  /** Where the voice plays in, once the graph is built. */
  out(): AudioNode | null;
  /** Whether sound can be made now. */
  running(): boolean;
  /** Everything but the voice and the UI makes room for `seconds` from now. */
  duck(seconds: number): void;
}

/** The recording's place in the mix: a gain on every line. */
export const SPEECH_LEVEL = 1;

export function createSpeech(host: SpeechHost): Speech & { /** A context has been made: decode what was waiting for one. */ attach(): void } {
  let index: SpeechIndex | null = null;
  let bytes: ArrayBuffer | null = null;
  let buffer: AudioBuffer | null = null;
  let failed = false;
  let said = 0;
  let last: string | null = null;
  const queue = new SpeechQueue();
  const sounding: { readonly source: AudioBufferSourceNode; readonly gain: GainNode }[] = [];

  function decode(): void {
    const ctx = host.context();
    if (!ctx || !bytes || buffer) return;
    const data = bytes;
    bytes = null;
    // Both forms at once: an old browser only calls back (and has no promise to wait on), a new one does both. Nothing
    // here may throw: this runs inside the sound system's unlock, and a voice is not worth the rest of the sound.
    const done = (decoded: AudioBuffer): void => {
      buffer = decoded;
    };
    const bad = (): void => {
      failed = true;
    };
    try {
      const pending = ctx.decodeAudioData(data, done, bad) as Promise<AudioBuffer> | undefined;
      pending?.then(done, bad);
    } catch {
      bad();
    }
  }

  function quiet(ctx: BaseAudioContext): void {
    const t = ctx.currentTime;
    for (const { source, gain } of sounding.splice(0)) {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + SPEECH_CUT);
      try {
        source.stop(t + SPEECH_CUT + 0.01);
      } catch {
        // never started, or already over
      }
    }
    queue.clear();
  }

  return {
    load(table, audio) {
      index = table;
      bytes = audio;
      failed = false;
      decode();
    },

    fail() {
      failed = true;
    },

    attach: decode,

    seconds(id) {
      return index?.lines[id]?.seconds ?? null;
    },

    say(id, cuts = false) {
      const ctx = host.context();
      const out = host.out();
      const line = index?.lines[id];
      if (!ctx || !out || !buffer || !line || !host.running()) return null;
      const now = ctx.currentTime;
      if (cuts) quiet(ctx);
      const at = queue.offer(id, line.seconds, now, cuts);
      if (at === null) return null;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = SPEECH_LEVEL;
      source.connect(gain).connect(out);
      const entry = { source, gain };
      sounding.push(entry);
      source.onended = () => {
        source.onended = null;
        source.disconnect();
        gain.disconnect();
        const i = sounding.indexOf(entry);
        if (i >= 0) sounding.splice(i, 1);
      };
      source.start(at, Math.max(0, line.start), line.seconds);
      said++;
      last = id;
      host.duck(at - now + line.seconds);
      return { wait: at - now, seconds: line.seconds };
    },

    hush() {
      const ctx = host.context();
      if (ctx) quiet(ctx);
    },

    get state(): SpeechState {
      const ctx = host.context();
      const now = ctx ? ctx.currentTime : 0;
      return { ready: buffer !== null, failed, said, last, until: queue.until(now) };
    },
  };
}
