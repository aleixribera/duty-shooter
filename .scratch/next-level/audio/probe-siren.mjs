// The held siren note's own level (no room, no distance): is its flutter in the buffer or in the reverb?
import { openStudio } from './studio.mjs';
const studio = await openStudio();
try {
  const out = await studio.run(async (client) => {
    const { sirenHold } = await import(`/@fs/${client}audio/countdown.ts`);
    const dsp = await import(`/@fs/${client}audio/dsp.ts`);
    const rng = (dsp.makeRng ?? dsp.createRng ?? dsp.rng)(7);
    const sr = 24000;
    const x = sirenHold(sr, rng);
    const rows = [];
    for (let t = 0; t + 0.1 <= x.length / sr; t += 0.1) {
      let s = 0;
      for (let i = Math.round(t * sr); i < Math.round((t + 0.1) * sr); i++) s += x[i] * x[i];
      rows.push((10 * Math.log10(s / (0.1 * sr))).toFixed(1));
    }
    return rows.join(' ');
  });
  console.log(out);
} finally {
  await studio.close();
}
