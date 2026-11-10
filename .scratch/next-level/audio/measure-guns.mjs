// Every gun's shot, measured: each weapon first-person, third-person near (15 m) and far
// (150 m), outdoors and indoors, rendered through the real sound system. Writes a WAV of each
// (as heard at the default mix, through the master chain) and a table of the meters.
//
//   node .scratch/next-level/audio/measure-guns.mjs [label] [seeds]
import { writeFileSync } from 'node:fs';
import { BANDS, measure, median, writeWav } from './metrics.mjs';
import { openStudio } from './studio.mjs';

const label = process.argv[2] ?? 'now';
const seeds = Number(process.argv[3] ?? 3);
const out = (name) => new URL(`./${name}`, import.meta.url);
const path = (name) => decodeURIComponent(out(name).pathname).replace(/^\/([A-Za-z]:)/, '$1');

const WEAPONS = ['m4a1', 'smg', 'shotgun', 'sniper', 'pistol'];
const PLACES = [
  ['first-person', (weapon, environment) => ({ local: true, weapon, environment })],
  ['near-15m', (weapon, environment) => ({ position: [0, 1.6, -15], weapon, environment })],
  ['far-150m', (weapon, environment) => ({ position: [0, 1.6, -150], weapon, environment })],
];
const ENVIRONMENTS = ['outdoor', 'indoor'];

const studio = await openStudio();
const rows = [];
try {
  for (const weapon of WEAPONS)
    for (const [place, params] of PLACES)
      for (const environment of ENVIRONMENTS) {
        const name = `${weapon}-${place}-${environment}`;
        const heard = [];
        const bare = [];
        for (let seed = 1; seed <= seeds; seed++) {
          const steps = [{ at: 0.1, do: 'play', event: 'gunshot', params: params(weapon, environment) }];
          const a = await studio.render({ seconds: 4, seed, steps });
          const b = await studio.render({ seconds: 4, seed, steps, bare: true, mix: { master: 1 } });
          if (seed === 1) writeWav(path(`wav/guns-${label}/${name}.wav`), a.channels);
          heard.push(measure(a.channels));
          bare.push(measure(b.channels));
        }
        const m = (list, f) => median(list.map(f));
        rows.push({
          name,
          weapon,
          place,
          environment,
          heardPeak: Math.max(...heard.map((h) => h.peakDb)),
          heardLufs: m(heard, (h) => h.lufsM),
          overKnee: Math.max(...heard.map((h) => h.overKnee)),
          peak: Math.max(...bare.map((h) => h.peakDb)),
          lufs: m(bare, (h) => h.lufsM),
          loudest50: m(bare, (h) => h.loudest50Db),
          centroid: m(bare, (h) => h.centroid),
          bands: Object.fromEntries(BANDS.map(([band]) => [band, m(bare, (h) => h.bands[band])])),
          attackMs: m(bare, (h) => h.attackMs),
          peakAtMs: m(bare, (h) => h.peakAtMs),
          t60Ms: m(bare, (h) => h.t60Ms),
          length40Ms: m(bare, (h) => h.length40Ms),
        });
        process.stdout.write('.');
      }
} finally {
  await studio.close();
}
console.log();

const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');
const lines = [
  `# Gunshots, measured (${label})`,
  '',
  `Each shot rendered offline through the game's sound system at 48 kHz (panner, air absorption, environment reverb, buses, master chain), ${seeds} shots a row (median; peaks are the highest of them). "Heard" is at the default mix (master 0.8) after the compressor, limiter and soft clipper; the rest is measured before the master chain at master 1. LUFS is the loudest 400 ms (BS.1770 momentary). Bands are each band's share of the shot's energy (dB re total): sub < 80 Hz, low 80-250, mid 250-2k, presence 2k-6k, air > 6k. Attack is the direct sound's rise, 10% to 90% of the highest level in the 5 ms after the onset; "peak at" is where the shot's highest peak falls after the onset (a far sniper's boom arrives after its crack; indoors a reflection can top the front); T60 is the Schroeder decay (-5 to -25 dB, times three); length is onset to 40 dB under the peak (5 ms RMS). WAVs: \`wav/guns-${label}/\`.`,
  '',
  '| shot | heard peak dBFS | heard LUFS | over clip knee | peak dBFS | LUFS | loudest 50 ms dB | centroid Hz | sub | low | mid | presence | air | attack ms | peak at ms | T60 ms | length ms |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${f(r.heardPeak)} | ${f(r.heardLufs)} | ${r.overKnee} | ${f(r.peak)} | ${f(r.lufs)} | ${f(r.loudest50)} | ${f(r.centroid, 0)} | ${BANDS.map(([b]) => f(r.bands[b])).join(' | ')} | ${f(r.attackMs, 2)} | ${f(r.peakAtMs, 1)} | ${f(r.t60Ms, 0)} | ${f(r.length40Ms, 0)} |`),
  '',
];
for (const [place] of PLACES)
  for (const environment of ENVIRONMENTS) {
    const order = rows.filter((r) => r.place === place && r.environment === environment).sort((a, b) => b.lufs - a.lufs);
    lines.push(`- Loudest first, ${place} ${environment}: ${order.map((r) => `${r.weapon} ${f(r.lufs)}`).join(' > ')}`);
  }
writeFileSync(out(`guns-${label}.md`), lines.join('\n') + '\n');
writeFileSync(out(`guns-${label}.json`), JSON.stringify(rows, null, 2));
console.log(lines.slice(4).join('\n'));
