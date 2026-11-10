// The first milliseconds of a shot, as numbers: the largest sample in each quarter millisecond.
//   node .scratch/next-level/audio/probe.mjs sniper,shotgun [first|near] [outdoor|indoor]
import { openStudio } from './studio.mjs';
const studio = await openStudio();
const place = process.argv[3] ?? 'first';
const environment = process.argv[4] ?? 'outdoor';
try {
  for (const weapon of (process.argv[2] ?? 'sniper').split(',')) {
    const params = place === 'first' ? { local: true, weapon, environment } : { position: [0, 1.6, -15], weapon, environment };
    const r = await studio.render({ seconds: 1, seed: 1, bare: true, mix: { master: 1 }, steps: [{ at: 0.1, do: 'play', event: 'gunshot', params }] });
    const x = r.channels[0].map((v, i) => (v + r.channels[1][i]) / 2);
    let on = 0;
    while (Math.abs(x[on]) < 1e-4) on++;
    const row = (from, to, step) => {
      const out = [];
      for (let ms = from; ms < to; ms += step) {
        let p = 0;
        for (let i = on + Math.round(ms * 48); i < on + Math.round((ms + step) * 48); i++) p = Math.max(p, Math.abs(x[i]));
        out.push(p.toFixed(2));
      }
      return out.join(' ');
    };
    console.log(weapon, place, environment, '\n  0-8 ms by 0.25:', row(0, 8, 0.25), '\n  8-120 ms by 4:', row(8, 120, 4));
  }
} finally { await studio.close(); }
