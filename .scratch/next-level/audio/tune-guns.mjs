// A quick look at the guns while their recipes are tuned: one shot of each, a line of meters.
//   node .scratch/next-level/audio/tune-guns.mjs [places=first,near,far] [envs=outdoor,indoor] [weapons]
import { writeFileSync } from 'node:fs';
import { measure } from './metrics.mjs';
import { openStudio } from './studio.mjs';

const places = (process.argv[2] ?? 'first,near').split(',');
const envs = (process.argv[3] ?? 'outdoor').split(',');
const weapons = (process.argv[4] ?? 'm4a1,smg,shotgun,sniper,pistol').split(',');
const PARAMS = {
  first: (weapon, environment) => ({ local: true, weapon, environment }),
  near: (weapon, environment) => ({ position: [0, 1.6, -15], weapon, environment }),
  mid: (weapon, environment) => ({ position: [0, 1.6, -60], weapon, environment }),
  far: (weapon, environment) => ({ position: [0, 1.6, -150], weapon, environment }),
};
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-').padStart(7);
const all = [];
const studio = await openStudio();
try {
  console.log('shot'.padEnd(26) + ['peak', 'heardPk', 'LUFS', 'cent', 'sub', 'low', 'mid', 'pres', 'air', 'attack', 'pkAt', 'T60', 'len40'].map((h) => h.padStart(7)).join(' '));
  for (const place of places)
    for (const env of envs)
      for (const weapon of weapons) {
        const steps = [{ at: 0.1, do: 'play', event: 'gunshot', params: PARAMS[place](weapon, env) }];
        const bare = measure((await studio.render({ seconds: 4, seed: 1, steps, bare: true, mix: { master: 1 } })).channels);
        const heard = measure((await studio.render({ seconds: 4, seed: 1, steps })).channels);
        all.push({ weapon, place, env, lufs: bare.lufsM, peak: bare.peakDb, heardPeak: heard.peakDb });
        console.log(`${weapon}-${place}-${env}`.padEnd(26) + [f(bare.peakDb), f(heard.peakDb), f(bare.lufsM), f(bare.centroid, 0), f(bare.bands.sub), f(bare.bands.low), f(bare.bands.mid), f(bare.bands.presence), f(bare.bands.air), f(bare.attackMs, 2), f(bare.peakAtMs, 1), f(bare.t60Ms, 0), f(bare.length40Ms, 0)].join(' '));
      }
} finally {
  await studio.close();
}
writeFileSync(new URL('./tune.json', import.meta.url), JSON.stringify(all));
