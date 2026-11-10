// Every gun's handling, measured: dry fire, magazine out and in, what closes the action, the
// raise, and the pump, bolt and shell that were already each gun's own. In your own hands,
// rendered through the real sound system. Writes a WAV of each and a table of the meters.
//
//   node .scratch/next-level/audio/measure-handling.mjs [seeds]
import { writeFileSync } from 'node:fs';
import { BANDS, measure, median, writeWav } from './metrics.mjs';
import { openStudio } from './studio.mjs';

const seeds = Number(process.argv[2] ?? 3);
const out = (name) => new URL(`./${name}`, import.meta.url);
const path = (name) => decodeURIComponent(out(name).pathname).replace(/^\/([A-Za-z]:)/, '$1');

// Which guns make each sound in a match (game.ts, foleyCues).
const SOUNDS = [
  ['dryFire', ['m4a1', 'smg', 'shotgun', 'sniper', 'pistol']],
  ['reloadMagOut', ['m4a1', 'smg', 'sniper', 'pistol']],
  ['reloadMagIn', ['m4a1', 'smg', 'sniper', 'pistol']],
  ['reloadBoltRelease', ['m4a1', 'pistol']],
  ['reloadChargingHandle', ['m4a1', 'smg']],
  ['weaponRaise', ['m4a1', 'smg', 'shotgun', 'sniper', 'pistol']],
  ['pumpRack', ['shotgun']],
  ['shellInsert', ['shotgun']],
  ['boltOpen', ['sniper']],
  ['boltClose', ['sniper']],
];

const studio = await openStudio();
const rows = [];
try {
  for (const [event, weapons] of SOUNDS)
    for (const weapon of weapons) {
      const name = `${event}-${weapon}`;
      const heard = [];
      const bare = [];
      for (let seed = 1; seed <= seeds; seed++) {
        const steps = [{ at: 0.1, do: 'play', event, params: { local: true, weapon } }];
        const a = await studio.render({ seconds: 1.5, seed, steps });
        const b = await studio.render({ seconds: 1.5, seed, steps, bare: true, mix: { master: 1 } });
        if (seed === 1) writeWav(path(`wav/handling/${name}.wav`), a.channels);
        heard.push(measure(a.channels));
        bare.push(measure(b.channels));
      }
      const m = (list, f) => median(list.map(f));
      rows.push({
        name,
        event,
        weapon,
        heardPeak: Math.max(...heard.map((h) => h.peakDb)),
        peak: Math.max(...bare.map((h) => h.peakDb)),
        lufs: m(bare, (h) => h.lufsM),
        loudest50: m(bare, (h) => h.loudest50Db),
        centroid: m(bare, (h) => h.centroid),
        bands: Object.fromEntries(BANDS.map(([band]) => [band, m(bare, (h) => h.bands[band])])),
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
  '# Weapon handling, measured',
  '',
  `Each sound in your own hands, rendered offline through the game's sound system at 48 kHz, ${seeds} plays a row (median; peaks are the highest). "Heard" is at the default mix after the master chain; the rest before it at master 1. LUFS is the loudest 400 ms; bands are each band's share of the energy (dB re total): sub < 80 Hz, low 80-250, mid 250-2k, presence 2k-6k, air > 6k; length is onset to 40 dB under the peak. A gunshot in the same hands reads -16 to -24 LUFS. WAVs: \`wav/handling/\`.`,
  '',
  '| sound | heard peak dBFS | peak dBFS | LUFS | loudest 50 ms dB | centroid Hz | sub | low | mid | presence | air | length ms |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${f(r.heardPeak)} | ${f(r.peak)} | ${f(r.lufs)} | ${f(r.loudest50)} | ${f(r.centroid, 0)} | ${BANDS.map(([b]) => f(r.bands[b])).join(' | ')} | ${f(r.length40Ms, 0)} |`),
  '',
];
writeFileSync(out('handling.md'), lines.join('\n') + '\n');
writeFileSync(out('handling.json'), JSON.stringify(rows, null, 2));
console.log(lines.slice(4).join('\n'));
