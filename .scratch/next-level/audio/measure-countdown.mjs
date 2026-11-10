// The countdown's own sounds, measured: the air-raid siren at the map's edge (its wind-up, the
// held note laid end over end, its wind-down) and the Geiger counter's ticks, alone and as the
// whole last minute. Rendered through the real sound system; writes WAVs and a table.
//
//   node .scratch/next-level/audio/measure-countdown.mjs
import { writeFileSync } from 'node:fs';
import { db, loudness, measure, spectrum, writeWav, RATE } from './metrics.mjs';
import { openStudio } from './studio.mjs';

const out = (name) => new URL(`./${name}`, import.meta.url);
const path = (name) => decodeURIComponent(out(name).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');
const mono = (channels, from = 0, to = channels[0].length / RATE) => {
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
/** The strongest frequency (Hz) between `lo` and `hi` in a window: the siren's pitch. */
const pitch = (channels, from, to, lo = 150, hi = 1500) => {
  const m = mono(channels, from, to);
  let n = 1;
  while (n < m.length) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < m.length; i++) re[i] = m[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / m.length));
  // A plain DFT over the band is enough at this size.
  let best = 0;
  let at = 0;
  for (let hz = lo; hz <= hi; hz += 2) {
    const w = (2 * Math.PI * hz) / RATE;
    let a = 0;
    let b = 0;
    for (let i = 0; i < m.length; i += 4) {
      a += re[i] * Math.cos(w * i);
      b += re[i] * Math.sin(w * i);
    }
    const p = a * a + b * b;
    if (p > best) {
      best = p;
      at = hz;
    }
  }
  return at;
};

const studio = await openStudio();
const lines = ['# The countdown, measured', '', "Rendered offline through the game's sound system at 48 kHz at the default mix, after the master chain, the listener in the open. LUFS-M is the loudest 400 ms (BS.1770); windows are plain RMS (dBFS). For scale, at the same mix a rifle 15 m off reads about -25 LUFS-M and your own about -15 (the gun tables are measured before the master chain, which adds about 4.7 dB to quiet signals). WAVs: `wav/countdown/`.", ''];
const json = { siren: [], ticks: [], minute: {} };
try {
  // The siren's three pieces, from where a map would put it.
  lines.push('## The siren, a piece at a time', '', '| piece | distance m | place | LUFS-M | peak dBFS | centroid Hz | pitch at start Hz | pitch at end Hz | length s (to -40 dB) |', '|---|---|---|---|---|---|---|---|---|');
  const pieces = [['countdownSirenRise', 9], ['countdownSirenHold', 4], ['countdownSirenFall', 7]];
  for (const [distance, environment] of [[150, 'outdoor'], [250, 'outdoor'], [400, 'outdoor'], [250, 'indoor']])
    for (const [event, seconds] of pieces) {
      const r = await studio.render({ seconds: seconds + 4, seed: 1, steps: [{ at: 0.1, do: 'play', event, params: { position: [-0.6 * distance, 22, -0.8 * distance], environment } }] });
      const m = measure(r.channels);
      const t0 = 0.1 + distance / 343;
      const row = { event, distance, environment, lufsM: m.lufsM, peakDb: m.peakDb, centroid: m.centroid, pitchStart: pitch(r.channels, t0 + 0.2, t0 + 0.8), pitchEnd: pitch(r.channels, t0 + seconds - 1.2, t0 + seconds - 0.6), length: m.length40Ms / 1000 };
      json.siren.push(row);
      if (distance === 250 && environment === 'outdoor') writeWav(path(`wav/countdown/${event}-250m.wav`), r.channels);
      lines.push(`| ${event.replace('countdownSiren', '').toLowerCase()} | ${distance} | ${environment} | ${f(row.lufsM)} | ${f(row.peakDb)} | ${f(row.centroid, 0)} | ${row.pitchStart} | ${row.pitchEnd} | ${f(row.length, 2)} |`);
      process.stdout.write('.');
    }
  lines.push('');

  // One tick of the counter, soft and hard.
  lines.push('## One tick of the counter', '', '| intensity | LUFS-M | peak dBFS | centroid Hz | length ms (to -40 dB) |', '|---|---|---|---|---|');
  for (const intensity of [0.45, 1]) {
    const r = await studio.render({ seconds: 1, seed: 1, steps: [{ at: 0.1, do: 'play', event: 'geigerTick', params: { intensity } }] });
    const m = measure(r.channels);
    json.ticks.push({ intensity, lufsM: m.lufsM, peakDb: m.peakDb, centroid: m.centroid, lengthMs: m.length40Ms });
    lines.push(`| ${intensity} | ${f(m.lufsM)} | ${f(m.peakDb)} | ${f(m.centroid, 0)} | ${f(m.length40Ms, 1)} |`);
    process.stdout.write('.');
  }
  lines.push('');

  // The whole last minute: the siren alone (is the held note seamless?), the counter alone (does it densify?), and both.
  const sirenAt = [-150, 22, -200];
  for (const [name, only] of [['siren', 'countdownSiren'], ['counter', 'geiger'], ['both', null]]) {
    const r = await studio.render({ seconds: 74, seed: 4, countdown: { from: 62, sirenAt, ...(only ? { only } : {}) } });
    writeWav(path(`wav/countdown/last-minute-${name}.wav`), r.channels);
    const l = loudness(r.channels);
    const m = measure(r.channels);
    // The match clock reads 60 at 2 s into the render and runs out at 62 s.
    const windows = [];
    for (let left = 60; left > 0; left -= 10) windows.push({ left, rms: level(r.channels, 62 - left, 72 - left), centroid: spectrum(mono(r.channels, 62 - left + 2, 62 - left + 7), 0, 5 * RATE).centroid });
    const row = { lufsI: l.integrated, lufsM: l.momentary, peakDb: m.peakDb, overKnee: m.overKnee, cues: r.cues, windows, peakVoices: r.state.peakVoices };
    if (name === 'siren') {
      // Once wound up (from 12 s in) to the end: 100 ms levels. A gap or a bump at a join between segments would show as a dip or a spike.
      const levels = [];
      for (let t = 14; t < 61.5; t += 0.05) levels.push(level(r.channels, t, t + 0.1));
      const sorted = [...levels].sort((a, b) => a - b);
      row.hold = { median: sorted[Math.floor(sorted.length / 2)], lowest: sorted[0], highest: sorted.at(-1) };
      row.after = [level(r.channels, 63, 64), level(r.channels, 66, 67), level(r.channels, 70, 71)];
    }
    if (name === 'counter') {
      // Ticks a second, counted from the render: peaks standing 12 dB over the level around them, at least 8 ms apart.
      const x = mono(r.channels);
      const count = (from, to) => {
        let n = 0;
        let last = -1;
        const a = Math.round(from * RATE);
        const b = Math.round(to * RATE);
        let floor = 0;
        for (let i = a; i < b; i++) floor += x[i] * x[i];
        const gate = Math.max(Math.sqrt(floor / (b - a)) * 2.5, 0.002);
        for (let i = a; i < b; i++)
          if (Math.abs(x[i]) > gate && i - last > 0.008 * RATE) {
            n++;
            last = i;
          } else if (Math.abs(x[i]) > gate) last = i;
        return n;
      };
      row.ticksPerSecond = windows.map((w) => ({ left: w.left, rate: count(62 - w.left, 72 - w.left) / 10 }));
      row.lastTwoSeconds = count(60, 62) / 2;
    }
    json.minute[name] = row;
    lines.push(`## The last minute: ${name === 'both' ? 'the siren and the counter together' : `the ${name} alone`}`, '');
    lines.push(`- ${r.cues} cues; loudness ${f(l.integrated)} LUFS-I, loudest 400 ms ${f(l.momentary)} LUFS, peak ${f(m.peakDb)} dBFS (${m.overKnee} samples over the clip knee); most voices at once in the system ${r.state.peakVoices} (cap ${r.state.voiceCap}).`);
    lines.push('', `| seconds left | RMS dBFS | centroid Hz |${name === 'counter' ? ' ticks a second (counted) |' : ''}`, `|---|---|---|${name === 'counter' ? '---|' : ''}`, ...windows.map((w, k) => `| ${w.left}-${w.left - 10} | ${f(w.rms)} | ${f(w.centroid, 0)} |${name === 'counter' ? ` ${f(row.ticksPerSecond[k].rate)} |` : ''}`), '');
    if (name === 'siren') {
      lines.push(`- The held note, from wound up to the clock running out (100 ms windows): median ${f(row.hold.median)} dBFS, lowest ${f(row.hold.lowest)}, highest ${f(row.hold.highest)}: the joins between its 4 s segments show as neither gap nor bump when these stay within a few dB (the siren's own slow wail moves it too).`);
      lines.push(`- Winding down after the clock runs out: ${f(row.after[0])} dBFS 1-2 s after, ${f(row.after[1])} at 4-5 s, ${f(row.after[2])} at 8-9 s.`);
    }
    if (name === 'counter') lines.push(`- In the last two seconds: ${f(row.lastTwoSeconds)} ticks a second counted (21 rising to 30 a second are asked for there; ticks closer than 8 ms apart count as one).`);
    lines.push(`- WAV: \`wav/countdown/last-minute-${name}.wav\`.`, '');
    process.stdout.write(`${name} `);
  }
} finally {
  await studio.close();
}
console.log();
writeFileSync(out('countdown.md'), lines.join('\n') + '\n');
writeFileSync(out('countdown.json'), JSON.stringify(json, null, 2));
console.log(lines.slice(4).join('\n'));
