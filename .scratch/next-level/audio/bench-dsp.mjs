// What the DSP helpers cost on 0.7 s at 48 kHz (ms each, best of 20).
import { openStudio } from './studio.mjs';
const studio = await openStudio();
try {
  const out = await studio.run(async (client) => {
    const d = await import(`/@fs/${client}audio/dsp.ts`);
    const sr = 48000;
    const rng = d.createRng(1);
    const best = (f) => { let m = 1e9; for (let i = 0; i < 20; i++) { const a = performance.now(); f(); m = Math.min(m, performance.now() - a); } return Math.round(m * 100) / 100; };
    const buf = d.buffer(sr, 0.7);
    return {
      white: best(() => d.white(sr, 0.7, rng)),
      lp: best(() => d.lp(buf, sr, 1000)),
      lpSweep: best(() => d.lp(buf, sr, (t) => 500 + 4000 * Math.exp(-t / 0.2))),
      thump: best(() => d.thump(buf, sr, { at: 0, f0: 130, f1: 60, glideTau: 0.04, attack: 0.0015, tau: 0.14, gain: 1 })),
      noiseBurstSteep: best(() => d.noiseBurst(buf, sr, rng, { at: 0, attack: 0.003, tau: 0.13, gain: 1, mode: 'lowpass', freq: 170, steep: true, length: 0.69 })),
      noiseBurstBand: best(() => d.noiseBurst(buf, sr, rng, { at: 0, attack: 0.0004, tau: 0.03, gain: 1, mode: 'bandpass', freq: 700, q: 0.8, length: 0.24 })),
      saturate: best(() => d.saturate(buf, 2)),
      copy: best(() => Float32Array.from(buf)),
      fade: best(() => d.fadeEdges(buf, sr, 0, 0.04)),
      peak: best(() => d.peak(buf)),
    };
  });
  console.log(out);
} finally { await studio.close(); }
