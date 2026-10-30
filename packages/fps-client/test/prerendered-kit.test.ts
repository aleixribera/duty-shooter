import { describe, expect, it, vi } from 'vitest';
import { Kit, offerPrerendered } from '../src/audio/kit';

/** Just enough of an audio context for the kit's buffers. */
function fakeContext(sampleRate: number): BaseAudioContext {
  const createBuffer = (channels: number, length: number, rate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (c: number) => data[c]! };
  };
  return { sampleRate, createBuffer } as unknown as BaseAudioContext;
}

const samples = () => [new Float32Array(480).fill(0.25)];

describe('prerendered sounds', () => {
  it('builds a bank from its offered samples without rendering it', () => {
    offerPrerendered({ id: 'test/offered', sampleRate: 48000, variants: [samples(), samples()] });
    const render = vi.fn(samples);
    const bank = new Kit(fakeContext(44100)).bank('test/offered', 2, render);
    expect(render).not.toHaveBeenCalled();
    expect(bank).toHaveLength(2);
    // Other rate than the context: the buffer keeps the rate it was rendered at, and the browser resamples it.
    expect(bank[0]!.sampleRate).toBe(48000);
  });

  it('renders a bank nobody offered', () => {
    const render = vi.fn(samples);
    expect(new Kit(fakeContext(48000)).bank('test/not-offered', 3, render)).toHaveLength(3);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('uses an offered reverb only at the context\'s own rate', () => {
    offerPrerendered({ id: 'ir/outdoor', sampleRate: 48000, variants: [[new Float32Array(16).fill(0.5)]] });
    offerPrerendered({ id: 'ir/indoor', sampleRate: 44100, variants: [[new Float32Array(16).fill(0.5)]] });
    const { outdoor, indoor } = new Kit(fakeContext(48000)).impulseResponses();
    expect(outdoor.length).toBe(16);
    expect(outdoor.sampleRate).toBe(48000);
    expect(indoor.length).toBeGreaterThan(16);
    expect(indoor.sampleRate).toBe(48000);
  });
});
