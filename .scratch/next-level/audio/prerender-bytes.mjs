// How much memory each event's prerendered banks take (MB, float32), for the sources in the tree
// and (AUDIO=./head/packages/fps-client/src/audio/) for the committed ones.
//   node .scratch/next-level/audio/prerender-bytes.mjs
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../../../apps/range/scripts/chrome.mjs';
const audio = fileURLToPath(new URL(process.env.AUDIO ?? '../../../packages/fps-client/src/audio/', import.meta.url)).split(String.fromCharCode(92)).join('/');
const measure = async (audio) => {
  const { createDefaultVoices } = await import(`/@fs/${audio}voices.ts`);
  const per = {};
  let now = '';
  const context = {
    sampleRate: 48000,
    createBuffer(channels, length, sampleRate = 48000) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      const e = (per[now] ??= { mb: 0, buffers: 0, seconds: 0 });
      e.mb += (channels * length * 4) / 1e6;
      e.buffers++;
      e.seconds += (channels * length) / sampleRate;
      return { channels: data, numberOfChannels: channels, length, sampleRate, getChannelData: (c) => data[c] };
    },
  };
  for (const [event, voice] of Object.entries(createDefaultVoices())) {
    now = event;
    for (const task of voice.warmTasks?.(context) ?? (voice.warm ? [() => voice.warm(context)] : [])) task();
  }
  return per;
};
const chrome = await launchChrome();
try {
  await chrome.navigate('http://localhost:5173/textures/asphalt.webp');
  await chrome.waitFor('location.protocol === "http:" && document.readyState === "complete"', 30_000);
  const per = await chrome.evaluate(`(${measure})(${JSON.stringify(audio)})`);
  if (!per) throw new Error(chrome.errors.join('\n'));
  console.log(JSON.stringify(per));
} finally {
  await chrome.close();
}
