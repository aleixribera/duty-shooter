// Where one voice's prerender time goes: each of its warm tasks timed, and the banks it leaves.
//   node .scratch/next-level/audio/profile-voice.mjs gunshot [runs]
import { openStudio } from './studio.mjs';
const event = process.argv[2] ?? 'gunshot';
const runs = Number(process.argv[3] ?? 3);
const studio = await openStudio();
try {
  const out = await studio.run(async (client, event, runs) => {
    const { createDefaultVoices } = await import(`/@fs/${client}audio/voices.ts`);
    const { kitFor } = await import(`/@fs/${client}audio/kit.ts`);
    const results = [];
    for (let i = 0; i < runs; i++) {
      // The kit this page would reach is not the voices' own (a hot-reloaded module is another instance): the stand-in context keeps count instead.
      const made = [];
      let last = performance.now();
      const context = {
        sampleRate: 48000,
        createBuffer: (channels, length, sampleRate) => {
          const now = performance.now();
          made.push({ ms: now - last, channels, seconds: length / sampleRate });
          last = performance.now();
          const data = Array.from({ length: channels }, () => new Float32Array(length));
          return { numberOfChannels: channels, length, sampleRate, getChannelData: (c) => data[c] };
        },
      };
      const voice = createDefaultVoices()[event];
      const tasks = [];
      for (const task of voice.warmTasks?.(context) ?? [() => voice.warm(context)]) {
        const from = made.length;
        const a = (last = performance.now());
        task();
        tasks.push({ ms: performance.now() - a, buffers: made.slice(from) });
      }
      results.push({ tasks, seconds: made.reduce((s, b) => s + b.channels * b.seconds, 0), buffers: made.length });
    }
    return results;
  }, event, runs);
  const best = out.reduce((x, y) => (x.tasks.reduce((s, t) => s + t.ms, 0) < y.tasks.reduce((s, t) => s + t.ms, 0) ? x : y));
  best.tasks.forEach((t, i) => console.log(`task ${i}: ${t.ms.toFixed(1).padStart(7)} ms  ${t.buffers.map((b) => `${b.ms.toFixed(1)}${b.channels > 1 ? 's' : 'm'}${b.seconds.toFixed(2)}`).join(' ')}`));
  console.log(`total ${best.tasks.reduce((s, t) => s + t.ms, 0).toFixed(1)} ms, ${best.buffers} buffers, ${best.seconds.toFixed(1)} channel-seconds`);
} finally {
  await studio.close();
}
