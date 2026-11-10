// A WAV's level over time: RMS (dBFS) and peak per window.
//   node .scratch/next-level/audio/levels.mjs <file.wav> [from s] [to s] [window s]
import { readFileSync } from 'node:fs';

const [file, from = '0', to = '1e9', window = '1'] = process.argv.slice(2);
const data = readFileSync(file);
const channels = data.readUInt16LE(22);
const rate = data.readUInt32LE(24);
const frames = (data.length - 44) / (2 * channels);
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
for (let t = Number(from); t < Math.min(Number(to), frames / rate); t += Number(window)) {
  const a = Math.round(t * rate);
  const b = Math.min(frames, Math.round((t + Number(window)) * rate));
  let sum = 0;
  let peak = 0;
  for (let i = a; i < b; i++) {
    let v = 0;
    for (let c = 0; c < channels; c++) v += data.readInt16LE(44 + (i * channels + c) * 2) / 32768 / channels;
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  console.log(`${t.toFixed(2).padStart(7)} s  rms ${db(Math.sqrt(sum / Math.max(1, b - a))).toFixed(1).padStart(6)}  peak ${db(peak).toFixed(1).padStart(6)}`);
}
