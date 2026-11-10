// Being nearly dead, measured: the heartbeat's rate and level as health drops, the low-pass
// over the world closing and opening again, and a close blast's ringing ears with the world
// ducked under them. Rendered through the real sound system; writes WAVs and a table.
//
//   node .scratch/next-level/audio/measure-danger.mjs
import { writeFileSync } from 'node:fs';
import { db, measure, spectrum, writeWav, RATE } from './metrics.mjs';
import { openStudio } from './studio.mjs';

const out = (name) => new URL(`./${name}`, import.meta.url);
const path = (name) => decodeURIComponent(out(name).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');
const mono = (channels, from, to) => {
  const a = Math.round(from * RATE);
  const b = Math.min(channels[0].length, Math.round(to * RATE));
  const m = new Float64Array(Math.max(0, b - a));
  for (const c of channels) for (let i = 0; i < m.length; i++) m[i] += c[a + i] / channels.length;
  return m;
};
const level = (channels, from, to) => {
  const m = mono(channels, from, to);
  let sum = 0;
  for (const v of m) sum += v * v;
  return db(Math.sqrt(sum / Math.max(1, m.length)));
};
const spec = (channels, from, to) => spectrum(mono(channels, from, to), 0, Math.round((to - from) * RATE));
/** How strong one frequency is in a window (dBFS of a sine of that level). */
const tone = (channels, hz, from, to) => {
  const m = mono(channels, from, to);
  const w = (2 * Math.PI * hz) / RATE;
  let a = 0;
  let b = 0;
  for (let i = 0; i < m.length; i++) {
    a += m[i] * Math.cos(w * i);
    b += m[i] * Math.sin(w * i);
  }
  return db((2 * Math.hypot(a, b)) / Math.max(1, m.length));
};
/** The game tells the system the player's health every frame: here, ten times a second. */
const health = (curve, until) => {
  const steps = [];
  for (let t = 0; t < until; t += 0.1) {
    let h = null;
    for (const [from, value] of curve) if (t >= from) h = value;
    steps.push({ at: t, do: 'health', health: h });
  }
  return steps;
};
/** The world, for the low-pass to work on: a rifle 15 m off firing five times a second. */
const gunfire = (from, to, every = 0.2) => {
  const steps = [];
  for (let t = from; t < to; t += every) steps.push({ at: t, do: 'play', event: 'gunshot', params: { position: [4, 1.6, -14.5], weapon: 'm4a1' } });
  return steps;
};

const studio = await openStudio();
const lines = ['# Danger, measured', '', "Rendered offline through the game's sound system at 48 kHz at the default mix, after the master chain. The game calls `setHealth` every frame; here it is called ten times a second. WAVs: `wav/danger/`.", ''];
const json = {};
try {
  // The heartbeat alone: 25 health, then 12, then 6, then healed.
  {
    const curve = [[0.5, 25], [8.5, 12], [16.5, 6], [24.5, 60]];
    const r = await studio.render({ seconds: 28, seed: 1, steps: health(curve, 28) });
    writeWav(path('wav/danger/heartbeat-25-12-6-health.wav'), r.channels);
    const beats = r.played.filter((p) => p.event === 'heartbeat').map((p) => p.at);
    const rows = [[25, 0.5, 8.5], [12, 8.5, 16.5], [6, 16.5, 24.5]].map(([h, from, to]) => {
      const mine = beats.filter((t) => t >= from + 1 && t < to);
      const gaps = mine.slice(1).map((t, k) => t - mine[k]);
      const gap = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
      const m = measure([r.channels[0].subarray(Math.round((from + 1) * RATE), Math.round(to * RATE)), r.channels[1].subarray(Math.round((from + 1) * RATE), Math.round(to * RATE))]);
      return { health: h, bpm: 60 / gap, lufsM: m.lufsM, peakDb: m.peakDb, centroid: m.centroid };
    });
    json.heartbeat = { rows, first: beats[0], last: beats.at(-1), after: level(r.channels, 26, 28) };
    lines.push('## The heartbeat', '', '| health | beats a minute | LUFS-M | peak dBFS | centroid Hz |', '|---|---|---|---|---|', ...rows.map((x) => `| ${x.health} | ${f(x.bpm)} | ${f(x.lufsM)} | ${f(x.peakDb)} | ${f(x.centroid, 0)} |`), '');
    lines.push(`- Health fell under 30 at 0.5 s: the first beat sounds at ${f(beats[0], 2)} s. Healed to 60 at 24.5 s: the last beat is at ${f(beats.at(-1), 2)} s, and 26-28 s reads ${f(json.heartbeat.after)} dBFS.`, '- WAV: `wav/danger/heartbeat-25-12-6-health.wav`.', '');
    process.stdout.write('heartbeat ');
  }

  // The low-pass over the world: the same gunfire at full health, at 25, at 6, and healed again.
  {
    const curve = [[4, 25], [8, 6], [12, 100]];
    const r = await studio.render({ seconds: 19, seed: 2, steps: [...health(curve, 19), ...gunfire(0.5, 18.5)] });
    writeWav(path('wav/danger/world-lowpass-gunfire.wav'), r.channels);
    const rows = [['full health', 1, 4], ['25 health', 5.5, 8], ['6 health', 9.5, 12], ['healed: the first second', 12, 13], ['healed: 2-3 s on', 14, 15], ['healed: 4-6 s on', 16, 18]].map(([name, from, to]) => {
      const s = spec(r.channels, from, to);
      const rms = level(r.channels, from, to);
      return { name, rms, centroid: s.centroid, presence: rms + s.bands.presence, air: rms + s.bands.air };
    });
    json.lowpass = { rows, state: { worldCutoff: r.state.worldCutoff } };
    lines.push('## The world through the low-pass (a rifle 15 m off, five shots a second, with the heartbeat over it under 30)', '', '| when | RMS dBFS (the thump of the heart included) | centroid Hz | presence (2-6 kHz) dBFS | air (> 6 kHz) dBFS |', '|---|---|---|---|---|', ...rows.map((x) => `| ${x.name} | ${f(x.rms)} | ${f(x.centroid, 0)} | ${f(x.presence)} | ${f(x.air)} |`), '');
    lines.push('- WAV: `wav/danger/world-lowpass-gunfire.wav`.', '');
    process.stdout.write('lowpass ');
  }

  // Tinnitus: the same gunfire, a close blast's ringing at full strength at 3 s, and at a third at 9 s.
  {
    const r = await studio.render({ seconds: 14, seed: 3, steps: [...gunfire(0.5, 13.5), { at: 3, do: 'tinnitus', strength: 1 }, { at: 9, do: 'tinnitus', strength: 0.35 }] });
    writeWav(path('wav/danger/tinnitus-over-gunfire.wav'), r.channels);
    const alone = await studio.render({ seconds: 4, seed: 3, steps: [{ at: 0.5, do: 'tinnitus', strength: 1 }] });
    writeWav(path('wav/danger/tinnitus-alone.wav'), alone.channels);
    const world = (from, to) => {
      // The world's level without the ringing: the band under 2 kHz.
      const s = spec(r.channels, from, to);
      return level(r.channels, from, to) + 10 * Math.log10(Math.pow(10, s.bands.sub / 10) + Math.pow(10, s.bands.low / 10) + Math.pow(10, s.bands.mid / 10));
    };
    const before = world(1, 3);
    const rows = [];
    for (const [name, at] of [['full strength', 3], ['strength 0.35', 9]]) {
      let lowest = Infinity;
      for (let t = at; t < at + 1; t += 0.1) lowest = Math.min(lowest, world(t, t + 0.4));
      let back = NaN;
      for (let t = at + 0.2; t < at + 5; t += 0.1)
        if (world(t, t + 0.4) >= before - 1) {
          back = t - at;
          break;
        }
      rows.push({ name, before, lowest, duckedBy: before - lowest, backAfter: back });
    }
    const ring = [];
    for (let t = 0.5; t < 3.5; t += 0.25) ring.push({ t: t - 0.5, db: tone(alone.channels, 4150, t, t + 0.25) });
    const am = measure(alone.channels);
    const audible = ring.filter((x) => x.db > -70);
    json.tinnitus = { rows, ring, alone: { peakDb: am.peakDb, lufsM: am.lufsM, centroid: am.centroid }, rung: r.state.tinnitus };
    lines.push('## Tinnitus', '', '| blast | world before dBFS (< 2 kHz) | lowest | ducked by dB | back within 1 dB after s |', '|---|---|---|---|---|', ...rows.map((x) => `| ${x.name} | ${f(x.before)} | ${f(x.lowest)} | ${f(x.duckedBy)} | ${f(x.backAfter)} |`), '');
    lines.push(`- The ringing alone at full strength: peak ${f(am.peakDb)} dBFS, ${f(am.lufsM)} LUFS-M, centroid ${f(am.centroid, 0)} Hz. Its 4150 Hz tone by quarter second (dBFS): ${ring.map((x) => f(x.db, 0)).join(', ')}: over -70 dBFS for ${f(audible.length * 0.25, 2)} s.`, '- WAVs: `wav/danger/tinnitus-over-gunfire.wav`, `wav/danger/tinnitus-alone.wav`.', '');
    process.stdout.write('tinnitus ');
  }
} finally {
  await studio.close();
}
console.log();
writeFileSync(out('danger.md'), lines.join('\n') + '\n');
writeFileSync(out('danger.json'), JSON.stringify(json, null, 2));
console.log(lines.slice(4).join('\n'));
