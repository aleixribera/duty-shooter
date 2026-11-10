/**
 * Range Control (next-level ticket 16): the voice on the site's loudspeakers,
 * and the rules for when it speaks. Its lines are recorded (`voice-lines.ts`,
 * said through the sound system's `speech`); where the recording cannot be
 * had, the browser's own speech synthesis says them from behind a `Speaker`.
 */
import type { MatchResult, ModeId, PlayerId, Score, TeamId, TeamScore } from '@duty-shooter/fps-core';
import { speechSeconds } from './audio/mix';
import type { Speech, SpeechIndex } from './audio/speech';
import { VOICE_LINES, VOICE_ON_THE_SECOND, type VoiceLineId } from './voice-lines';

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

/** The line that opens a match of `mode`, or null: Charge opens round by round, and a Battle Royale with its Preparation. */
export function liveLine(mode: ModeId): VoiceLineId | null {
  return mode === 'tdm' ? 'liveTdm' : mode === 'ffa' ? 'liveFfa' : mode === 'outposts' ? 'liveOutposts' : mode === 'gungame' ? 'liveGunGame' : null;
}

/**
 * Whether Range Control closes the range ("Cease fire") on a match of `mode` that ended for `reason`: one stopped
 * with time still on its clock (a limit reached, the last round won, everyone gone). A clock that ran out needs no
 * telling, a Battle Royale ends on its own beat, and a match with no result yet has not ended.
 */
export function closesRange(mode: ModeId, reason: MatchResult['reason'] | null): boolean {
  return mode !== 'battle-royale' && reason !== null && reason !== 'timeLimit';
}

/** The counts the announcer calls out as they are reached: [Squads, players in Solos]. */
const LEFT_LINES: Readonly<Record<number, readonly [VoiceLineId, VoiceLineId]>> = {
  10: ['squads10', 'players10'],
  5: ['squads5', 'players5'],
  3: ['squads3', 'players3'],
  2: ['squads2', 'players2'],
};

/**
 * The line for Squads (or, in Solos, players) left as the count goes from
 * `before` to `now`, or null: only on the way down onto a count that is
 * called, never on joining (`before` null) and never for the last one
 * standing (the victory beat says that). Two Squads going at once can step
 * over a count; nothing is said then, because the number would be wrong.
 */
export function leftLine(before: number | null, now: number, solo: boolean): VoiceLineId | null {
  if (before === null || now >= before) return null;
  return LEFT_LINES[now]?.[solo ? 1 : 0] ?? null;
}

/**
 * Who is ahead, from where you stand: your team or another (team modes), you
 * or someone else (every player for themselves); null when the lead is
 * shared, nobody has scored, or the mode has no running lead to call.
 */
export type Lead = 'ours' | 'theirs' | 'you' | 'other' | null;

export function leadOf(mode: ModeId, teamScores: readonly TeamScore[] | null, scores: readonly Score[], selfId: PlayerId | null, team: TeamId | null): Lead {
  if (mode === 'tdm' || mode === 'outposts') {
    if (!teamScores || team === null) return null;
    const best = Math.max(0, ...teamScores.map((t) => t.score));
    const top = teamScores.filter((t) => t.score === best);
    if (best <= 0 || top.length !== 1) return null;
    return top[0]!.team === team ? 'ours' : 'theirs';
  }
  if (mode === 'ffa' || mode === 'gungame') {
    const tally = (s: Score): number => (mode === 'gungame' ? (s.progress ?? 0) : s.kills);
    const best = Math.max(0, ...scores.map(tally));
    const top = scores.filter((s) => tally(s) === best);
    if (best <= 0 || selfId === null) return null;
    if (!top.some((s) => s.id === selfId)) return 'other';
    return top.length === 1 ? 'you' : null;
  }
  return null;
}

/** How long a lead has to be held before it is called (s): a kill traded straight back is not a lead. */
export const LEAD_HELD = 1.5;

/** The least time between two calls of the lead (s): a close match is not a commentary on every kill. */
export const LEAD_APART = 20;

/**
 * Calls the lead as it changes hands. It says who is ahead only once they
 * have held it a moment, never twice running for the same side, and not more
 * often than every twenty seconds: after a quiet spell it says where things
 * stand now, not what happened in between.
 */
export class LeadCalls {
  #fresh = true;
  /** Who the last call left ahead. */
  #called: Lead = null;
  #lead: Lead = null;
  #since = 0;
  #calledAt = -Infinity;

  /** The lead as it stands at `time` (s): the line to say, or null. */
  update(lead: Lead, time: number): VoiceLineId | null {
    if (this.#fresh) {
      // A match joined under way: whoever is ahead has been for a while, and that is not news.
      this.#fresh = false;
      this.#called = lead;
      this.#lead = lead;
      this.#since = time;
      return null;
    }
    if (lead !== this.#lead) {
      this.#lead = lead;
      this.#since = time;
    }
    if (lead === null || lead === this.#called || time - this.#since < LEAD_HELD) return null;
    const was = this.#called;
    if (lead === 'other' && was !== 'you') {
      // Somebody else is ahead of you and somebody else was: nothing of yours to call.
      this.#called = lead;
      return null;
    }
    if (time - this.#calledAt < LEAD_APART) return null;
    this.#called = lead;
    this.#calledAt = time;
    return lead === 'ours' ? 'leadOurs' : lead === 'theirs' ? 'leadTheirs' : lead === 'you' ? 'leadYou' : 'leadLost';
  }

  /** A new match, or none: nothing is carried over. */
  reset(): void {
    this.#fresh = true;
    this.#called = null;
    this.#lead = null;
    this.#calledAt = -Infinity;
  }
}

const INDEX_URL = new URL('./audio/assets/controller.json', import.meta.url).href;
const AUDIO_URL = new URL('./audio/assets/controller.mp3', import.meta.url).href;

/** The sound systems whose recording has been sent for: one page keeps one, through every game it plays. */
const sentFor = new WeakSet<Speech>();

/** Fetches Range Control's recording into `speech`, once. A page that cannot have it is told so, and the stand-in speaks. */
export function loadRangeControl(speech: Speech): void {
  if (sentFor.has(speech)) return;
  sentFor.add(speech);
  const get = async (url: string): Promise<Response> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    return response;
  };
  Promise.all([get(INDEX_URL).then((r) => r.json() as Promise<SpeechIndex>), get(AUDIO_URL).then((r) => r.arrayBuffer())]).then(
    ([index, audio]) => speech.load(index, audio),
    (err) => {
      console.warn("[audio] Range Control's recording could not be loaded", err);
      speech.fail();
    },
  );
}

/**
 * The announcer: says Range Control's lines. The recording says them on the
 * voice bus, which has its own volume and ducks everything else itself; only
 * when there is no recording to be had does the browser's speech stand in,
 * at `volume` and with the duck asked for by hand.
 */
export class Announcer {
  readonly #speech: Speech | null;
  readonly #speaker: Speaker | null;
  readonly #duck: (seconds: number) => void;
  readonly #now: () => number;
  /** When the last line this announcer asked of the recording will have been said (s, on `now`'s clock). */
  #until = -Infinity;
  /** The voice's volume (0..1): the stand-in speaks at it, and at nothing neither speaks. */
  volume = 1;

  constructor(speech: Speech | null, speaker: Speaker | null, duck: (seconds: number) => void = () => {}, now: () => number = () => performance.now() / 1000) {
    this.#speech = speech;
    this.#speaker = speaker;
    this.#duck = duck;
    this.#now = now;
  }

  /** Says line `id`. Returns how long it takes to say (s), heard or not: what a caption stands for. */
  say(id: VoiceLineId): number {
    const text = VOICE_LINES[id];
    const seconds = this.#speech?.seconds(id) ?? speechSeconds(text);
    if (this.volume <= 0) return seconds;
    const state = this.#speech?.state;
    const onTheSecond = VOICE_ON_THE_SECOND.includes(id);
    if (state?.ready) {
      const spoken = this.#speech!.say(id, onTheSecond);
      if (spoken) this.#until = this.#now() + spoken.wait + spoken.seconds;
    } else if ((!state || state.failed) && this.#speaker && !onTheSecond) {
      // The stand-in cannot be on the second (it starts when it likes and cannot be cut), so it does not count: the
      // clock and its beat do.
      this.#speaker.speak(text, Math.min(1, this.volume));
      this.#duck(seconds);
    }
    return seconds;
  }

  /**
   * Silent at once: the game is going. The recording is the page's, shared by every game on it, so only a line this
   * announcer asked for is cut: a game put away after the next one has started does not silence that one's voice.
   */
  stop(): void {
    if (this.#now() < this.#until) this.#speech?.hush();
    this.#until = -Infinity;
    this.#speaker?.cancel();
  }
}
