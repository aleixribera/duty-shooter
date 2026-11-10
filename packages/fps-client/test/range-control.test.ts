import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Score, TeamScore } from '@duty-shooter/fps-core';
import { describe, expect, it } from 'vitest';
import { Announcer, LEAD_APART, LEAD_HELD, LeadCalls, closesRange, leadOf, liveLine, type Speaker } from '../src/announcer';
import { createRng } from '../src/audio/dsp';
import { lastBreath, painGrunt } from '../src/audio/soldier-voice';
import { SPEECH_BREATH, SpeechQueue, createSpeech, type Speech, type SpeechIndex, type SpeechState } from '../src/audio/speech';
import { VOICE_LINES, VOICE_LINE_IDS, VOICE_ON_THE_SECOND, voiceSource } from '../src/voice-lines';

const asset = (name: string) => fileURLToPath(new URL(`../src/audio/assets/${name}`, import.meta.url));

describe("Range Control's recording", () => {
  const index = JSON.parse(readFileSync(asset('controller.json'), 'utf8')) as SpeechIndex;

  it('has every line, recorded from the words the game has now', () => {
    // A line reworded and not recorded again fails here: run tools/voice/build.py (tools/voice/README.md).
    expect(Object.keys(index.lines).sort()).toEqual([...VOICE_LINE_IDS].sort());
    for (const id of VOICE_LINE_IDS) {
      expect(index.lines[id]!.text, id).toBe(VOICE_LINES[id]);
      expect(index.lines[id]!.spoken, id).toBe(voiceSource(id));
    }
  });

  it('keeps each line in a window of its own, inside the file', () => {
    const rows = Object.values(index.lines).sort((a, b) => a.start - b.start);
    let end = 0;
    for (const row of rows) {
      expect(row.start).toBeGreaterThanOrEqual(end);
      expect(row.seconds).toBeGreaterThan(0.3);
      end = row.start + row.seconds;
    }
    expect(end).toBeLessThanOrEqual(index.seconds);
  });

  it('says the last five seconds in under a second each: the next one cuts in on the second', () => {
    for (const id of VOICE_ON_THE_SECOND) expect(index.lines[id]!.seconds, id).toBeLessThan(1);
  });

  it('ships as one small file', () => {
    expect(existsSync(asset('controller.mp3'))).toBe(true);
    const bytes = statSync(asset('controller.mp3')).size;
    expect(bytes).toBeGreaterThan(50_000);
    expect(bytes).toBeLessThan(600_000);
  });

  it('is the very file its table of lines was written for', () => {
    // A table from one recording beside the sound of another points every line at the wrong words.
    const audio = readFileSync(asset('controller.mp3'));
    expect(index.bytes).toBe(audio.length);
    expect(index.sha256).toBe(createHash('sha256').update(audio).digest('hex'));
  });
});

describe('who speaks when', () => {
  it('says one line at a time, lets one wait, and drops the rest', () => {
    const q = new SpeechQueue();
    expect(q.offer('a', 2, 10)).toBe(10);
    expect(q.offer('b', 1, 10.5)).toBeCloseTo(12 + SPEECH_BREATH);
    expect(q.offer('c', 1, 10.6)).toBeNull();
    // Once the first is over there is room behind the second again.
    expect(q.offer('c', 1, 12.1)).toBeCloseTo(13 + 2 * SPEECH_BREATH);
    expect(q.until(12.1)).toBeCloseTo(14 + 2 * SPEECH_BREATH);
    // And with nothing being said, a line starts at once.
    expect(q.offer('d', 1, 30)).toBe(30);
  });

  it('does not say a line again while it is being said or waiting', () => {
    const q = new SpeechQueue();
    expect(q.offer('a', 2, 0)).toBe(0);
    expect(q.offer('a', 2, 0.5)).toBeNull();
    expect(q.offer('a', 2, 2.5)).toBe(2.5);
  });

  it('lets a line that cuts in start now, over everything', () => {
    const q = new SpeechQueue();
    q.offer('a', 2, 0);
    q.offer('b', 2, 0.1);
    expect(q.offer('five', 0.8, 1, true)).toBe(1);
    expect(q.until(1)).toBeCloseTo(1.8);
    expect(q.offer('four', 0.8, 2, true)).toBe(2);
  });
});

/** As much of an audio context as the recorded voice touches. */
function fakeContext() {
  const started: { at: number; offset: number; seconds: number; stoppedAt: number | null }[] = [];
  const ctx = {
    currentTime: 5,
    decodeAudioData: (_bytes: ArrayBuffer, _done?: (b: AudioBuffer) => void, _bad?: () => void): Promise<AudioBuffer> | undefined => Promise.resolve({ duration: 12 } as AudioBuffer),
    createGain: () => ({ gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (to: unknown) => to, disconnect() {} }),
    createBufferSource: () => {
      const row = { at: 0, offset: 0, seconds: 0, stoppedAt: null as number | null };
      return {
        buffer: null,
        onended: null as (() => void) | null,
        connect: (to: unknown) => to,
        disconnect() {},
        start(at: number, offset: number, seconds: number) {
          Object.assign(row, { at, offset, seconds });
          started.push(row);
        },
        stop(at: number) {
          row.stoppedAt = at;
        },
      };
    },
  };
  return { ctx, started };
}

const INDEX: SpeechIndex = {
  voice: 'test',
  sampleRate: 22050,
  seconds: 12,
  lines: {
    ringClosing: { text: 'The Ring is closing.', spoken: 'The Ring is closing.', start: 1, seconds: 1.5 },
    squads5: { text: 'Five squads left.', spoken: 'Five squads left.', start: 3, seconds: 1.2 },
    five: { text: 'Five.', spoken: 'Five.', start: 5, seconds: 0.7 },
  },
};

describe('the recorded voice', () => {
  const made = () => {
    const { ctx, started } = fakeContext();
    const ducks: number[] = [];
    let running = true;
    const speech = createSpeech({ context: () => ctx as unknown as BaseAudioContext, out: () => ({}) as AudioNode, running: () => running, duck: (s) => ducks.push(s) });
    return { ctx, started, ducks, speech, lock: () => (running = false) };
  };

  it('plays a line from its window of the file, and has everything else make room for as long as it talks', async () => {
    const { speech, started, ducks } = made();
    expect(speech.say('ringClosing')).toBeNull();
    speech.load(INDEX, new ArrayBuffer(8));
    expect(speech.seconds('ringClosing')).toBe(1.5);
    await Promise.resolve();
    expect(speech.state.ready).toBe(true);
    expect(speech.say('ringClosing')).toEqual({ wait: 0, seconds: 1.5 });
    expect(started).toEqual([{ at: 5, offset: 1, seconds: 1.5, stoppedAt: null }]);
    // The second waits its turn, and the duck is held to its end.
    const second = speech.say('squads5')!;
    expect(second.wait).toBeCloseTo(1.5 + SPEECH_BREATH);
    expect(ducks[1]).toBeCloseTo(1.5 + SPEECH_BREATH + 1.2);
    expect(speech.say('nothing')).toBeNull();
    expect(speech.state).toMatchObject({ said: 2, last: 'squads5', failed: false });
  });

  it('cuts off what it was saying for a line that is said on the second', async () => {
    const { speech, started, ctx } = made();
    speech.load(INDEX, new ArrayBuffer(8));
    await Promise.resolve();
    speech.say('ringClosing');
    ctx.currentTime = 5.5;
    expect(speech.say('five', true)).toEqual({ wait: 0, seconds: 0.7 });
    expect(started[0]!.stoppedAt).toBeGreaterThan(5.5);
    expect(started[0]!.stoppedAt).toBeLessThan(5.6);
    expect(started[1]).toMatchObject({ at: 5.5, offset: 5 });
  });

  it('cuts the line that was waiting too: the count is not followed by old news', async () => {
    const { speech, started, ctx } = made();
    speech.load(INDEX, new ArrayBuffer(8));
    await Promise.resolve();
    speech.say('ringClosing');
    speech.say('squads5');
    ctx.currentTime = 5.5;
    speech.say('five', true);
    expect(started.map((s) => s.stoppedAt !== null)).toEqual([true, true, false]);
    expect(speech.state.until).toBeCloseTo(5.5 + 0.7);
  });

  it('takes a recording that arrives before there is any sound, and is ready once there is', async () => {
    // The page's order: the file is fetched at once, the context is made on the first press.
    const { ctx } = fakeContext();
    let live: typeof ctx | null = null;
    const speech = createSpeech({ context: () => live as unknown as BaseAudioContext | null, out: () => ({}) as AudioNode, running: () => live !== null, duck: () => {} });
    speech.load(INDEX, new ArrayBuffer(8));
    await Promise.resolve();
    expect(speech.state).toMatchObject({ ready: false, failed: false });
    expect(speech.say('ringClosing')).toBeNull();
    live = ctx;
    speech.attach();
    await Promise.resolve();
    expect(speech.state.ready).toBe(true);
    expect(speech.say('ringClosing')).toEqual({ wait: 0, seconds: 1.5 });
  });

  it('gives up on a file the browser cannot decode, however the browser says so, and never throws', async () => {
    const refuse = [
      (): Promise<AudioBuffer> => Promise.reject(new Error('bad file')),
      (_b: ArrayBuffer, _done?: (b: AudioBuffer) => void, bad?: () => void): undefined => void bad?.(),
      (): never => {
        throw new Error('no such thing');
      },
    ];
    for (const decodeAudioData of refuse) {
      const { ctx } = fakeContext();
      ctx.decodeAudioData = decodeAudioData;
      const speech = createSpeech({ context: () => ctx as unknown as BaseAudioContext, out: () => ({}) as AudioNode, running: () => true, duck: () => {} });
      expect(() => speech.load(INDEX, new ArrayBuffer(8))).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();
      expect(speech.state).toMatchObject({ ready: false, failed: true });
    }
  });

  it('is ready from a browser that only calls back', async () => {
    const { ctx } = fakeContext();
    ctx.decodeAudioData = (_b, done) => void done?.({ duration: 12 } as AudioBuffer);
    const speech = createSpeech({ context: () => ctx as unknown as BaseAudioContext, out: () => ({}) as AudioNode, running: () => true, duck: () => {} });
    speech.load(INDEX, new ArrayBuffer(8));
    expect(speech.state.ready).toBe(true);
  });

  it('says nothing while sound is locked, and goes quiet when told', async () => {
    const { speech, started, lock } = made();
    speech.load(INDEX, new ArrayBuffer(8));
    await Promise.resolve();
    speech.say('ringClosing');
    speech.hush();
    expect(started[0]!.stoppedAt).not.toBeNull();
    lock();
    expect(speech.say('squads5')).toBeNull();
  });
});

describe('the announcer', () => {
  const fakeSpeech = (state: Partial<SpeechState>) => {
    const said: [string, boolean][] = [];
    const speech: Speech = {
      load() {},
      fail() {},
      seconds: (id) => (id === 'ringClosing' ? 1.5 : null),
      say: (id, cuts = false) => (said.push([id, cuts]), { wait: 0, seconds: 1 }),
      hush: () => void said.push(['(quiet)', false]),
      state: { ready: false, failed: false, said: 0, last: null, until: 0, ...state },
    };
    return { speech, said };
  };
  const stand = () => {
    const spoken: string[] = [];
    const speaker: Speaker = { speak: (text) => void spoken.push(text), cancel: () => {} };
    return { speaker, spoken };
  };

  it('says its lines from the recording, the last five seconds over whatever it was saying', () => {
    const { speech, said } = fakeSpeech({ ready: true });
    const { speaker, spoken } = stand();
    const a = new Announcer(speech, speaker);
    expect(a.say('ringClosing')).toBe(1.5);
    a.say('five');
    expect(said).toEqual([['ringClosing', false], ['five', true]]);
    expect(spoken).toEqual([]);
    a.stop();
    expect(said.at(-1)).toEqual(['(quiet)', false]);
  });

  it('cuts only a line of its own: a game put away later does not silence the next game', () => {
    // One recording for the page, an announcer for each game on it.
    const { speech, said } = fakeSpeech({ ready: true });
    let now = 100;
    const old = new Announcer(speech, null, () => {}, () => now);
    const next = new Announcer(speech, null, () => {}, () => now);
    old.say('ringClosing');
    now = 104;
    next.say('squads5');
    old.stop();
    expect(said).toEqual([['ringClosing', false], ['squads5', false]]);
    next.stop();
    expect(said.at(-1)).toEqual(['(quiet)', false]);
    // And once is enough.
    next.stop();
    expect(said.filter(([id]) => id === '(quiet)')).toHaveLength(1);
  });

  it('does not have the stand-in count the last five seconds: it cannot be on the second', () => {
    const { speech } = fakeSpeech({ failed: true });
    const { speaker, spoken } = stand();
    const ducks: number[] = [];
    const a = new Announcer(speech, speaker, (s) => ducks.push(s));
    a.say('t10');
    for (const id of VOICE_ON_THE_SECOND) a.say(id);
    expect(spoken).toEqual(['Ten seconds.']);
    expect(ducks).toHaveLength(1);
  });

  it('closes the range on a match that was stopped, not on one whose clock ran out', () => {
    expect(closesRange('tdm', 'killLimit')).toBe(true);
    expect(closesRange('outposts', 'scoreLimit')).toBe(true);
    expect(closesRange('charge', 'roundLimit')).toBe(true);
    expect(closesRange('tdm', 'timeLimit')).toBe(false);
    expect(closesRange('tdm', null)).toBe(false);
    expect(closesRange('battle-royale', 'lastSquad')).toBe(false);
  });

  it('keeps quiet while the recording is on its way, and lets the stand-in speak only when there is none to come', () => {
    const loading = fakeSpeech({});
    const first = stand();
    new Announcer(loading.speech, first.speaker).say('ringClosing');
    expect(loading.said).toEqual([]);
    expect(first.spoken).toEqual([]);
    const failed = fakeSpeech({ failed: true });
    const second = stand();
    new Announcer(failed.speech, second.speaker).say('ringClosing');
    expect(second.spoken).toEqual(['The Ring is closing.']);
  });

  it('says nothing with the voice turned off, but still tells a caption how long the line is', () => {
    const { speech, said } = fakeSpeech({ ready: true });
    const a = new Announcer(speech, null);
    a.volume = 0;
    expect(a.say('ringClosing')).toBe(1.5);
    expect(said).toEqual([]);
  });

  it('opens a match by its mode, and leaves Charge and the Battle Royale to open themselves', () => {
    expect(liveLine('tdm')).toBe('liveTdm');
    expect(liveLine('ffa')).toBe('liveFfa');
    expect(liveLine('outposts')).toBe('liveOutposts');
    expect(liveLine('gungame')).toBe('liveGunGame');
    expect(liveLine('charge')).toBeNull();
    expect(liveLine('battle-royale')).toBeNull();
  });
});

describe('the lead', () => {
  const row = (id: string, team: number, kills: number, progress?: number): Score => ({ id, team, name: id, kills, deaths: 0, score: 0, assists: 0, ...(progress === undefined ? {} : { progress }) }) as Score;
  const teams = (a: number, b: number): TeamScore[] => [{ team: 1, score: a }, { team: 2, score: b }] as TeamScore[];

  it('is your team or theirs in team modes, and nobody at a level score', () => {
    expect(leadOf('tdm', teams(3, 2), [], 'me', 1)).toBe('ours');
    expect(leadOf('tdm', teams(3, 2), [], 'me', 2)).toBe('theirs');
    expect(leadOf('outposts', teams(40, 40), [], 'me', 1)).toBeNull();
    expect(leadOf('tdm', teams(0, 0), [], 'me', 1)).toBeNull();
    // Charge is scored in rounds and called round by round; a Battle Royale has no lead.
    expect(leadOf('charge', teams(2, 1), [], 'me', 1)).toBeNull();
    expect(leadOf('battle-royale', null, [], 'me', 1)).toBeNull();
  });

  it('is you or someone else when everyone plays for themselves: by kills, or in gun game by the ladder', () => {
    expect(leadOf('ffa', null, [row('me', 0, 4), row('a', 0, 3)], 'me', 0)).toBe('you');
    expect(leadOf('ffa', null, [row('me', 0, 3), row('a', 0, 3)], 'me', 0)).toBeNull();
    expect(leadOf('ffa', null, [row('me', 0, 2), row('a', 0, 3), row('b', 0, 3)], 'me', 0)).toBe('other');
    expect(leadOf('gungame', null, [row('me', 0, 9, 2), row('a', 0, 1, 5)], 'me', 0)).toBe('other');
    expect(leadOf('ffa', null, [row('me', 0, 0), row('a', 0, 0)], 'me', 0)).toBeNull();
  });

  it('is called once it has been held a moment, and never twice running for the same side', () => {
    const calls = new LeadCalls();
    expect(calls.update(null, 0)).toBeNull();
    expect(calls.update('ours', 10)).toBeNull();
    expect(calls.update('ours', 10 + LEAD_HELD)).toBe('leadOurs');
    // Level, then ours again: nothing new to say.
    expect(calls.update(null, 40)).toBeNull();
    expect(calls.update('ours', 50)).toBeNull();
    expect(calls.update('ours', 60)).toBeNull();
    expect(calls.update('theirs', 70)).toBeNull();
    expect(calls.update('theirs', 70 + LEAD_HELD)).toBe('leadTheirs');
  });

  it('does not call a kill that is traded straight back', () => {
    const calls = new LeadCalls();
    calls.update(null, 0);
    expect(calls.update('ours', 5)).toBeNull();
    expect(calls.update(null, 5.5)).toBeNull();
    expect(calls.update('theirs', 6)).toBeNull();
    expect(calls.update(null, 6.5)).toBeNull();
    expect(calls.update(null, 20)).toBeNull();
  });

  it('is not a commentary: after a call it waits, then says where things stand now', () => {
    const calls = new LeadCalls();
    calls.update(null, 0);
    calls.update('ours', 1);
    expect(calls.update('ours', 3)).toBe('leadOurs');
    // It changes hands three times in the next few seconds; one line is said, for whoever has it when the wait is over.
    expect(calls.update('theirs', 5)).toBeNull();
    expect(calls.update('theirs', 8)).toBeNull();
    expect(calls.update('ours', 10)).toBeNull();
    expect(calls.update('theirs', 14)).toBeNull();
    expect(calls.update('theirs', 3 + LEAD_APART - 0.1)).toBeNull();
    expect(calls.update('theirs', 3 + LEAD_APART)).toBe('leadTheirs');
  });

  it('tells you when you take it and when you lose it, and nothing of a lead that passes between others', () => {
    const calls = new LeadCalls();
    calls.update(null, 0);
    calls.update('other', 1);
    expect(calls.update('other', 5)).toBeNull();
    calls.update('you', 30);
    expect(calls.update('you', 32)).toBe('leadYou');
    calls.update('other', 60);
    expect(calls.update('other', 62)).toBe('leadLost');
    expect(calls.update('other', 100)).toBeNull();
  });

  it('says nothing of a lead that was already held when you joined, or of the last match', () => {
    const calls = new LeadCalls();
    expect(calls.update('theirs', 300)).toBeNull();
    expect(calls.update('theirs', 320)).toBeNull();
    calls.update('ours', 330);
    expect(calls.update('ours', 332)).toBe('leadOurs');
    calls.reset();
    expect(calls.update('ours', 0)).toBeNull();
    expect(calls.update('ours', 10)).toBeNull();
  });
});

describe("a soldier's voice", () => {
  const SR = 22050;
  const rms = (d: Float32Array, from = 0, to = d.length) => Math.sqrt(d.slice(from, to).reduce((s, v) => s + v * v, 0) / Math.max(1, to - from));
  /** The pitch between 70 and 260 Hz of a stretch of `d`: the shortest period it repeats at nearly as well as at any (so not twice the period, which repeats as well). */
  const pitch = (d: Float32Array, from: number, n: number) => {
    const fit: [number, number][] = [];
    for (let k = Math.round(SR / 260); k <= Math.round(SR / 70); k++) {
      let ab = 0;
      let aa = 0;
      let bb = 0;
      for (let i = from; i < from + n - k; i++) {
        ab += d[i]! * d[i + k]!;
        aa += d[i]! * d[i]!;
        bb += d[i + k]! * d[i + k]!;
      }
      fit.push([k, ab / Math.sqrt(aa * bb || 1)]);
    }
    const best = Math.max(...fit.map(([, r]) => r));
    return { hz: SR / fit.find(([, r]) => r >= best * 0.9)![0], fit: best };
  };
  const periodic = (d: Float32Array, from: number, n: number) => pitch(d, from, n).fit;

  it('grunts short and dies long, never clipping and never silent', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const pain = painGrunt(createRng(seed), SR);
      const death = lastBreath(createRng(seed), SR);
      expect(pain.length / SR).toBeLessThanOrEqual(0.31);
      expect(death.length / SR).toBeGreaterThanOrEqual(0.59);
      for (const d of [pain, death]) {
        expect(d.every(Number.isFinite)).toBe(true);
        expect(Math.max(...d.map(Math.abs))).toBeLessThanOrEqual(0.5001);
        expect(rms(d)).toBeGreaterThan(0.04);
        // Ends at nothing: no click when the buffer runs out.
        expect(Math.abs(d[d.length - 1]!)).toBeLessThan(0.002);
      }
    }
  });

  it("is a voice: it has a man's pitch, and the pitch falls as the breath goes", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const pain = painGrunt(createRng(seed), SR);
      // Not its first moment: the pitch drops too fast there to have one.
      const n = Math.round(SR * 0.05);
      const early = pitch(pain, Math.round(pain.length * 0.3), n).hz;
      const late = pitch(pain, pain.length - Math.round(SR * 0.08), n).hz;
      expect(early, `seed ${seed}`).toBeGreaterThan(105);
      expect(early, `seed ${seed}`).toBeLessThan(215);
      expect(late, `seed ${seed}`).toBeLessThan(early);
    }
  });

  it('never grunts the same way twice running', () => {
    const a = painGrunt(createRng(1), SR);
    const b = painGrunt(createRng(2), SR);
    expect(a.length === b.length && a.every((v, i) => v === b[i])).toBe(false);
  });

  it('lets the breath outlast the voice in a death', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const d = lastBreath(createRng(seed), SR);
      const third = Math.floor(d.length / 3);
      expect(rms(d, 0, third)).toBeGreaterThan(rms(d, 2 * third));
      expect(rms(d, 2 * third, d.length - Math.round(SR * 0.05)), `seed ${seed}`).toBeGreaterThan(0.012);
      // What is left at the end has no pitch to speak of: air, not voice.
      const n = Math.round(SR * 0.05);
      expect(periodic(d, Math.round(d.length * 0.2), n), `seed ${seed}`).toBeGreaterThan(periodic(d, Math.round(d.length * 0.8), n) + 0.15);
    }
  });
});
