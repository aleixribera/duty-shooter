// The score, measured: the menu theme (over a minute, across its loop point), the last minute's
// bed running into the final ten (alone, and with the siren and the counter over it), the four
// stings, and the ducking (music under gunfire, a blast and the announcer). Rendered through the
// real sound system; writes WAVs and a table.
//
//   node .scratch/next-level/audio/measure-music.mjs
import { writeFileSync } from 'node:fs';
import { clicks, db, loudness, measure, spectrum, writeWav, RATE } from './metrics.mjs';
import { openStudio } from './studio.mjs';

const out = (name) => new URL(`./${name}`, import.meta.url);
const path = (name) => decodeURIComponent(out(name).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');

const cut = (channels, from, to) => channels.map((c) => c.subarray(Math.round(from * RATE), Math.round(to * RATE)));
const mono = (channels) => {
  const m = new Float64Array(channels[0].length);
  for (const c of channels) for (let i = 0; i < m.length; i++) m[i] += c[i] / channels.length;
  return m;
};
/** RMS (dB) of `channels` from `from` to `to` s. */
const level = (channels, from, to) => {
  const m = mono(cut(channels, from, to));
  let sum = 0;
  for (const v of m) sum += v * v;
  return db(Math.sqrt(sum / Math.max(1, m.length)));
};
const centroid = (channels, from, to) => {
  const m = mono(cut(channels, from, to));
  return spectrum(m, 0, Math.min(m.length, 1 << 18)).centroid;
};
const dcOf = (channels) => Math.max(...channels.map((c) => Math.abs(c.reduce((a, v) => a + v, 0) / c.length)));
/** The worst sample-to-sample jump in a window, beside the worst anywhere else: a click at a seam stands out. */
const seam = (channels, at, half = 0.03) => {
  const m = mono(channels);
  const here = clicks(m.subarray(Math.round((at - half) * RATE), Math.round((at + half) * RATE))).worst;
  const all = clicks(m);
  return { here, worst: all.worst, worstAt: all.at, mean: all.mean };
};

const studio = await openStudio();
const lines = ['# The score, measured', '', "Rendered offline through the game's sound system at 48 kHz at the default mix (master 0.8, music 0.7), after the master chain. LUFS-I is the gated integrated loudness (BS.1770), LUFS-M the loudest 400 ms; levels in windows are plain RMS (dBFS). WAVs: `wav/music/`.", ''];
const json = {};
try {
  // The menu theme: the pad alone while the counter warms up (the first 32 s), then the motif over it.
  {
    const seconds = 100;
    const r = await studio.render({ seconds, seed: 3, steps: [{ at: 0, do: 'scene', scene: 'menu' }] });
    writeWav(path('wav/music/menu-theme-100s.wav'), r.channels);
    writeWav(path('wav/music/menu-theme-60s.wav'), cut(r.channels, 30, 90));
    const l = loudness(r.channels);
    const m = measure(r.channels);
    const windows = [];
    for (let t = 0; t + 10 <= seconds; t += 10) windows.push(level(r.channels, t, t + 10));
    const seams = [32, 64, 96].map((t) => ({ t, ...seam(r.channels, t) }));
    json.menu = { lufsI: l.integrated, lufsM: l.momentary, peakDb: m.peakDb, dc: dcOf(r.channels), windows, seams, state: r.state.music, renderMs: r.renderMs };
    lines.push('## Menu theme (100 s: three passes of the 32 s loop)', '');
    lines.push(`- Loudness ${f(l.integrated)} LUFS-I, loudest 400 ms ${f(l.momentary)} LUFS, peak ${f(m.peakDb)} dBFS, DC offset ${dcOf(r.channels).toExponential(1)}.`);
    lines.push(`- RMS per 10 s (dBFS): ${windows.map((w) => f(w)).join(', ')} (it fades in over 2.5 s; the motif enters at 32 s).`);
    lines.push(`- Loop points: worst sample-to-sample jump within 30 ms of 32 s, 64 s and 96 s: ${seams.map((s) => s.here.toFixed(4)).join(', ')}; worst anywhere in the render ${seams[0].worst.toFixed(4)} (at ${f(seams[0].worstAt, 2)} s), mean ${seams[0].mean.toFixed(5)}. A click would stand far above the rest.`);
    lines.push(`- Level across each loop point (50 ms before / after, dBFS): ${[32, 64, 96].map((t) => `${f(level(r.channels, t - 0.05, t))} / ${f(level(r.channels, t, t + 0.05))}`).join(', ')}.`);
    lines.push(`- Rendering 100 s took ${f(r.renderMs, 0)} ms offline. WAV: \`wav/music/menu-theme-100s.wav\` (and seconds 30-90 of it, across the loop point with the motif entering, as \`menu-theme-60s.wav\`).`, '');
    process.stdout.write('menu ');
  }

  // The last minute into the final ten, then the clock runs out.
  for (const [name, countdown] of [['last-minute-score-only', null], ['last-minute-with-siren-and-counter', { from: 60, sirenAt: [-150, 22, -200] }]]) {
    const steps = [
      { at: 0, do: 'scene', scene: 'lastMinute', timeLeft: 60 },
      { at: 50, do: 'scene', scene: 'final10', timeLeft: 10 },
      { at: 60, do: 'scene', scene: 'match' },
    ];
    const seconds = countdown ? 70 : 64;
    const r = await studio.render({ seconds, seed: 5, steps, ...(countdown ? { countdown } : {}) });
    writeWav(path(`wav/music/${name}.wav`), r.channels);
    const l = loudness(r.channels);
    const m = measure(r.channels);
    const windows = [];
    for (let t = 0; t < 60; t += 10) windows.push({ from: t, rms: level(r.channels, t, t + 10), centroid: centroid(r.channels, t + 2, t + 7) });
    const lastSecond = level(r.channels, 59, 60);
    const finalTen = Array.from({ length: 10 }, (_, k) => level(r.channels, 50 + k, 51 + k));
    const handOver = [level(r.channels, 48, 50), level(r.channels, 50, 52)];
    const after = [level(r.channels, 60.05, 60.3), level(r.channels, 60.5, 61.5)];
    const all = clicks(mono(cut(r.channels, 0, 59.9)));
    json[name] = { lufsI: l.integrated, lufsM: l.momentary, peakDb: m.peakDb, dc: dcOf(r.channels), overKnee: m.overKnee, windows, lastSecond, finalTen, handOver, after, worstJump: all.worst, worstJumpAt: all.at, cues: r.cues };
    lines.push(`## ${countdown ? 'The last minute as a match hears it: the score, the siren (250 m off) and the counter' : 'The last minute: the bed, and the riser over it for the final ten'}`, '');
    lines.push(`- Loudness ${f(l.integrated)} LUFS-I, loudest 400 ms ${f(l.momentary)} LUFS, peak ${f(m.peakDb)} dBFS (${m.overKnee} samples over the clip knee), DC offset ${dcOf(r.channels).toExponential(1)}${countdown ? `, ${r.cues} siren and counter cues` : ''}.`);
    lines.push('', '| seconds left | RMS dBFS | centroid Hz |', '|---|---|---|', ...windows.map((w) => `| ${60 - w.from}-${50 - w.from} | ${f(w.rms)} | ${f(w.centroid, 0)} |`), '');
    lines.push(`- The final ten, a second at a time (dBFS): ${finalTen.map((v) => f(v)).join(', ')}. Across the hand-over: ${f(handOver[0])} in the two seconds before, ${f(handOver[1])} in the two after.`);
    lines.push(`- The last second reads ${f(lastSecond)} dBFS; 50-300 ms after the clock runs out ${f(after[0])} dBFS, and half a second on ${f(after[1])} dBFS${countdown ? ' (the siren winding down)' : ' (the riser is cut dead on its knock; the bed goes with the scene, over 0.12 s)'}.`);
    lines.push(`- Worst sample-to-sample jump before the end: ${all.worst.toFixed(4)} at ${f(all.at, 2)} s (the riser joins the bed at 50 s).`, `- WAV: \`wav/music/${name}.wav\`.`, '');
    process.stdout.write(`${name} `);
  }

  // The stings.
  lines.push('## Stings', '', '| sting | LUFS-M | peak dBFS | centroid Hz | length ms (to -40 dB) | DC |', '|---|---|---|---|---|---|');
  json.stings = {};
  for (const sting of ['matchStart', 'ringClosing', 'victory', 'defeat']) {
    const r = await studio.render({ seconds: 9, seed: 1, steps: [{ at: 0, do: 'scene', scene: 'match' }, { at: 0, do: 'sting', sting }] });
    writeWav(path(`wav/music/sting-${sting}.wav`), r.channels);
    const m = measure(r.channels);
    json.stings[sting] = { lufsM: m.lufsM, peakDb: m.peakDb, centroid: m.centroid, length40Ms: m.length40Ms, dc: m.dc };
    lines.push(`| ${sting} | ${f(m.lufsM)} | ${f(m.peakDb)} | ${f(m.centroid, 0)} | ${f(m.length40Ms, 0)} | ${m.dc.toExponential(1)} |`);
    process.stdout.write(`${sting} `);
  }
  lines.push('');

  // Ducking: the effects bus is turned off so that only the music is in the render, while the sounds still duck it.
  // The bed has gaps of its own, so the duck is read against the same render without the sounds, window by window.
  {
    const shots = Array.from({ length: 10 }, (_, k) => ({ at: 20 + k * 0.1, do: 'play', event: 'gunshot', params: { local: true, weapon: 'm4a1' } }));
    const scene = [{ at: 0, do: 'scene', scene: 'lastMinute', timeLeft: 60 }];
    const steps = [
      ...scene,
      ...shots,
      { at: 28, do: 'play', event: 'gunshot', params: { position: [0, 1.6, -60], weapon: 'm4a1' } },
      { at: 32, do: 'play', event: 'explosion', params: { position: [0, 1, -8] } },
      { at: 40, do: 'voice', seconds: 1.5 },
    ];
    const r = await studio.render({ seconds: 46, seed: 2, mix: { effects: 0 }, steps });
    const ref = await studio.render({ seconds: 46, seed: 2, mix: { effects: 0 }, steps: scene });
    writeWav(path('wav/music/ducking-music-only.wav'), r.channels);
    const W = 0.05;
    const diff = (t) => level(r.channels, t, t + W) - level(ref.channels, t, t + W);
    const dip = (at, hold) => {
      let depth = 0;
      let deepestAt = at;
      for (let t = at - 0.05; t < at + hold + 0.5; t += 0.01) {
        const d = diff(t);
        if (d < depth) {
          depth = d;
          deepestAt = t;
        }
      }
      // Back within 1 dB of the render nothing ducked, and staying there.
      let back = null;
      for (let t = at; t < at + hold + 3; t += 0.01) {
        if (diff(t) < -1) back = null;
        else back ??= t;
      }
      // How fast it goes down: from the sound to 90 % of the way.
      let down = null;
      for (let t = at - 0.05; t < deepestAt + 0.01 && down === null; t += 0.002) if (diff(t) <= depth * 0.9) down = t + W / 2 - at;
      return { before: diff(at - 0.5), depth: -depth, downMs: down === null ? NaN : Math.max(0, down) * 1000, backAfter: back === null ? NaN : back - at, backAfterEnd: back === null ? NaN : back - at - hold };
    };
    const rows = [
      ['ten of your own rifle rounds in a second', dip(20, 1.0)],
      ['one rifle shot 60 m off', dip(28 + 60 / 343, 0.1)],
      ['a frag 8 m off', dip(32 + 8 / 343, 0.4)],
      ['the announcer, a 1.5 s line', dip(40, 1.5)],
    ];
    json.ducking = Object.fromEntries(rows);
    lines.push('## Ducking', '', 'The bed alone in the render (effects volume 0: the sounds still duck it), against the same render with no sounds in it, in 50 ms windows.', '', '| under | apart half a second before dB | ducked by dB | 90 % down within ms (the 50 ms window is the floor) | back within 1 dB, s after it starts | s after it ends |', '|---|---|---|---|---|---|');
    for (const [name, d] of rows) lines.push(`| ${name} | ${f(d.before, 2)} | ${f(d.depth)} | ${f(d.downMs, 0)} | ${f(d.backAfter, 2)} | ${f(d.backAfterEnd, 2)} |`);
    lines.push('', '- WAV: `wav/music/ducking-music-only.wav`.', '');
    process.stdout.write('ducking ');
  }
} finally {
  await studio.close();
}
console.log();
writeFileSync(out('music.md'), lines.join('\n') + '\n');
writeFileSync(out('music.json'), JSON.stringify(json, null, 2));
console.log(lines.slice(4).join('\n'));
