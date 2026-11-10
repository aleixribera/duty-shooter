// One held siren segment through the system at a distance: loudness and how much its level flutters once it is up.
//   node .scratch/next-level/audio/probe-hold.mjs [distance] [environment]
import { measure, db, RATE } from './metrics.mjs';
import { openStudio } from './studio.mjs';
const distance = Number(process.argv[2] ?? 250);
const environment = process.argv[3] ?? 'outdoor';
const studio = await openStudio();
try {
  const r = await studio.render({ seconds: 8, seed: 1, steps: [{ at: 0.1, do: 'play', event: 'countdownSirenHold', params: { position: [-0.6 * distance, 22, -0.8 * distance], environment } }] });
  const t0 = 0.1 + distance / 343;
  const levels = [];
  for (let t = t0 + 1.1; t < t0 + 2.9; t += 0.05) {
    let s = 0;
    const a = Math.round(t * RATE), b = Math.round((t + 0.1) * RATE);
    for (let i = a; i < b; i++) { const v = (r.channels[0][i] + r.channels[1][i]) / 2; s += v * v; }
    levels.push(db(Math.sqrt(s / (b - a))));
  }
  const m = measure(r.channels);
  console.log(`${distance} m ${environment}: LUFS-M ${m.lufsM.toFixed(1)} peak ${m.peakDb.toFixed(1)}; held level min ${Math.min(...levels).toFixed(1)} max ${Math.max(...levels).toFixed(1)} spread ${(Math.max(...levels) - Math.min(...levels)).toFixed(1)} dB`);
} finally {
  await studio.close();
}
