// How long the startup prerender takes: every voice's banks rendered the way the
// prerender worker does (same voices, same Kit, a stand-in context), timed per event,
// plus the real worker's own wall time. Runs in headless Chrome on a static page of the
// dev server (no game, no hot reload).
//
//   node .scratch/next-level/audio/prerender-time.mjs [label] [runs]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../../../apps/range/scripts/chrome.mjs';

const label = process.argv[2] ?? 'now';
const runs = Number(process.argv[3] ?? 5);
const base = 'http://localhost:5173/textures/asphalt.webp';
// AUDIO=<dir>: another copy of the audio sources (the committed ones, extracted with `git archive HEAD` into ./head, for a before and after at the same moment).
const audio = fileURLToPath(new URL(process.env.AUDIO ?? '../../../packages/fps-client/src/audio/', import.meta.url)).replace(/\\/g, '/');

const measure = async (audio, runs) => {
  const { createDefaultVoices } = await import(`/@fs/${audio}voices.ts`);
  const { kitFor } = await import(`/@fs/${audio}kit.ts`);
  const { startPrerender } = await import(`/@fs/${audio}prerender.ts`);
  const once = () => {
    // The buffers are counted as they are made: the kit this page would reach is not the voices' own once a module has hot-reloaded.
    let seconds = 0;
    let bytes = 0;
    let buffers = 0;
    const context = {
      sampleRate: 48000,
      createBuffer(channels, length, sampleRate = 48000) {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        seconds += (channels * length) / sampleRate;
        bytes += channels * length * 4;
        buffers++;
        return { channels: data, numberOfChannels: channels, length, sampleRate, getChannelData: (c) => data[c] };
      },
    };
    const kit = kitFor(context);
    const per = {};
    const t0 = performance.now();
    kit.impulseResponses();
    per['(reverbs)'] = performance.now() - t0;
    const voices = createDefaultVoices();
    for (const [event, voice] of Object.entries(voices)) {
      const a = performance.now();
      for (const task of voice.warmTasks?.(context) ?? (voice.warm ? [() => voice.warm(context)] : [])) task();
      per[event] = performance.now() - a;
    }
    return { total: performance.now() - t0, per, banks: buffers, seconds, bytes };
  };
  const results = [];
  for (let i = 0; i < runs; i++) results.push(once());
  const worker = [];
  for (let i = 0; i < Math.min(3, runs); i++) {
    const a = performance.now();
    const ok = await startPrerender();
    worker.push({ ok, ms: performance.now() - a });
  }
  // The score's stems: rendered by a second worker at half the output rate, so they never hold the effects up.
  const score = await import(`/@fs/${audio}music/score.ts`).catch(() => null);
  if (!score) return { results, worker, stems: [], musicWorker: [] };
  const { STEMS, STEM_RENDER, stemId } = score;
  const stems = [];
  for (let i = 0; i < Math.min(3, runs); i++) {
    let seconds = 0;
    let bytes = 0;
    const context = {
      sampleRate: 24000,
      createBuffer(channels, length, sampleRate = 24000) {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        seconds += (channels * length) / sampleRate;
        bytes += channels * length * 4;
        return { channels: data, numberOfChannels: channels, length, sampleRate, getChannelData: (c) => data[c] };
      },
    };
    const kit = kitFor(context);
    const per = {};
    const t0 = performance.now();
    for (const stem of STEMS) {
      const a = performance.now();
      kit.bank(stemId(stem), 1, STEM_RENDER[stem], { keepLength: true });
      per[stem] = performance.now() - a;
    }
    stems.push({ total: performance.now() - t0, per, seconds, bytes });
  }
  const musicWorker = [];
  for (let i = 0; i < Math.min(3, runs); i++) {
    const a = performance.now();
    const ok = await startPrerender('music');
    musicWorker.push({ ok, ms: performance.now() - a });
  }
  return { results, worker, stems, musicWorker };
};

const chrome = await launchChrome();
try {
  await chrome.navigate(base);
  await chrome.waitFor('location.protocol === "http:" && document.readyState === "complete"', 30_000);
  const out = await chrome.evaluate(`(${measure})(${JSON.stringify(audio)}, ${runs})`);
  if (!out) throw new Error(`Measuring failed:\n${chrome.errors.join('\n')}`);
  const best = out.results.reduce((a, b) => (a.total < b.total ? a : b));
  const events = Object.keys(best.per);
  const per = Object.fromEntries(events.map((e) => [e, Math.min(...out.results.map((r) => r.per[e]))]));
  const top = Object.entries(per).sort((a, b) => b[1] - a[1]);
  const report = {
    label,
    totalMs: { min: best.total, all: out.results.map((r) => Math.round(r.total)) },
    workerMs: out.worker,
    banks: best.banks,
    channelSeconds: best.seconds,
    megabytes: best.bytes / 1e6,
    perEventMs: Object.fromEntries(top.map(([k, v]) => [k, Math.round(v * 10) / 10])),
    music: (() => {
      if (!out.stems.length) return null;
      const b = out.stems.reduce((a, c) => (a.total < c.total ? a : c));
      return { totalMs: { min: b.total, all: out.stems.map((r) => Math.round(r.total)) }, workerMs: out.musicWorker, channelSeconds: b.seconds, megabytes: b.bytes / 1e6, perStemMs: Object.fromEntries(Object.entries(b.per).map(([k, v]) => [k, Math.round(v * 10) / 10])) };
    })(),
  };
  writeFileSync(new URL(`./prerender-${label}.json`, import.meta.url), JSON.stringify(report, null, 2));
  console.log(`[${label}] prerender on one thread: min ${best.total.toFixed(0)} ms of ${report.totalMs.all.join(', ')} ms; worker wall ${out.worker.map((w) => `${w.ms.toFixed(0)}${w.ok ? '' : '(failed)'}`).join(', ')} ms`);
  console.log(`  ${best.banks} buffers, ${best.seconds.toFixed(1)} channel-seconds, ${(best.bytes / 1e6).toFixed(1)} MB`);
  if (report.music) console.log(`  the score: one thread min ${report.music.totalMs.min.toFixed(0)} ms of ${report.music.totalMs.all.join(', ')} ms; its worker's wall ${out.musicWorker.map((w) => `${w.ms.toFixed(0)}${w.ok ? '' : '(failed)'}`).join(', ')} ms; ${report.music.channelSeconds.toFixed(1)} channel-seconds at 24 kHz, ${report.music.megabytes.toFixed(1)} MB; per stem ${Object.entries(report.music.perStemMs).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const [k, v] of top.slice(0, 14)) console.log(`  ${k.padEnd(24)}${v.toFixed(1)} ms`);
  if (chrome.errors.length) console.log(`console errors:\n${chrome.errors.join('\n')}`);
} finally {
  await chrome.close();
}
