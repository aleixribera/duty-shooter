// What a sound designer's meters would say about a render: peak, loudness (BS.1770 K-weighted),
// spectrum (centroid and band energies), attack and decay. Plain Node, no dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const RATE = 48000;
export const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
export const dbPower = (x) => (x > 0 ? 10 * Math.log10(x) : -Infinity);

/** 16-bit PCM WAV (48 kHz) from float channels. */
export function writeWav(path, channels, rate = RATE) {
  const n = channels[0].length;
  const c = channels.length;
  const data = Buffer.alloc(44 + n * c * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * c * 2, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(c, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * c * 2, 28);
  data.writeUInt16LE(c * 2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * c * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let ch = 0; ch < c; ch++) {
      const v = Math.max(-1, Math.min(1, channels[ch][i]));
      data.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

function biquad(x, b, a) {
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** BS.1770 K-weighting at 48 kHz. */
const kWeight = (x) => biquad(biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);

/** Loudness in LUFS: integrated (gated) and the loudest 400 ms (momentary max). */
export function loudness(channels, rate = RATE) {
  const k = channels.map(kWeight);
  const block = Math.round(0.4 * rate);
  const hop = Math.round(0.1 * rate);
  const n = k[0].length;
  const blocks = [];
  for (let a = 0; a + block <= n; a += hop) {
    let sum = 0;
    for (const ch of k) {
      let s = 0;
      for (let i = a; i < a + block; i++) s += ch[i] * ch[i];
      sum += s / block;
    }
    blocks.push(sum);
  }
  if (blocks.length === 0) return { integrated: -Infinity, momentary: -Infinity };
  const lufs = (ms) => -0.691 + dbPower(ms);
  const momentary = lufs(Math.max(...blocks));
  const abs = blocks.filter((b) => lufs(b) > -70);
  if (abs.length === 0) return { integrated: -Infinity, momentary };
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const gate = lufs(mean(abs)) - 10;
  const rel = abs.filter((b) => lufs(b) > gate);
  return { integrated: lufs(mean(rel.length ? rel : abs)), momentary };
}

/** In-place radix-2 FFT. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

export const BANDS = [
  ['sub', 0, 80],
  ['low', 80, 250],
  ['mid', 250, 2000],
  ['presence', 2000, 6000],
  ['air', 6000, 24000],
];

/** Power spectrum of `x[from..to)`: centroid (Hz) and each band's share of the energy (dB re total). */
export function spectrum(x, from, to, rate = RATE) {
  const len = Math.max(1, to - from);
  let n = 1;
  while (n < len) n <<= 1;
  n = Math.max(n, 4096);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < len; i++) re[i] = x[from + i] ?? 0;
  fft(re, im);
  let total = 0;
  let weighted = 0;
  const bands = Object.fromEntries(BANDS.map(([name]) => [name, 0]));
  for (let k = 1; k < n / 2; k++) {
    const f = (k * rate) / n;
    const p = re[k] * re[k] + im[k] * im[k];
    total += p;
    weighted += p * f;
    for (const [name, lo, hi] of BANDS) if (f >= lo && f < hi) bands[name] += p;
  }
  for (const [name] of BANDS) bands[name] = dbPower(bands[name] / Math.max(total, 1e-30));
  return { centroid: total > 0 ? weighted / total : 0, bands };
}

/** Everything measured of one render (channels: Float32Array[] at 48 kHz). */
export function measure(channels, rate = RATE) {
  const n = channels[0].length;
  const mono = new Float64Array(n);
  let peak = 0;
  let sumSq = 0;
  let dc = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const ch of channels) {
      const v = ch[i];
      m += v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
      sumSq += v * v;
    }
    mono[i] = m / channels.length;
    dc += mono[i];
  }
  dc /= n;
  let monoPeak = 0;
  let peakAt = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(mono[i]);
    if (a > monoPeak) {
      monoPeak = a;
      peakAt = i;
    }
  }
  // Onset: the first sample at 10% of the peak. Attack: the direct sound's rise, from 10% to 90% of the
  // highest level reached in the 5 ms after the onset (a reflection or a low thump that tops the front
  // later is another event: `peakAtMs` says where the highest peak falls, `attackToPeakMs` how long to 90% of it).
  let onset = 0;
  while (onset < n && Math.abs(mono[onset]) < 0.1 * monoPeak) onset++;
  let top = onset;
  while (top < n && Math.abs(mono[top]) < 0.9 * monoPeak) top++;
  const attackToPeakMs = ((top - onset) / rate) * 1000;
  let front = 0;
  for (let i = onset; i < Math.min(n, onset + Math.round(0.005 * rate)); i++) front = Math.max(front, Math.abs(mono[i]));
  let from = onset;
  while (from > 0 && Math.abs(mono[from - 1]) >= 0.1 * front) from--;
  while (from < n && Math.abs(mono[from]) < 0.1 * front) from++;
  let to = from;
  while (to < n && Math.abs(mono[to]) < 0.9 * front) to++;
  const attackMs = ((to - from) / rate) * 1000;

  // Loudest 50 ms.
  const win = Math.round(0.05 * rate);
  let run = 0;
  let loudest = 0;
  for (let i = 0; i < n; i++) {
    run += mono[i] * mono[i];
    if (i >= win) run -= mono[i - win] * mono[i - win];
    if (i >= win - 1) loudest = Math.max(loudest, run / win);
  }

  // Envelope (5 ms RMS) for the -40 dB length.
  const ew = Math.round(0.005 * rate);
  let e = 0;
  let envPeak = 0;
  const env = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    e += mono[i] * mono[i];
    if (i >= ew) e -= mono[i - ew] * mono[i - ew];
    env[i] = Math.max(0, e) / ew;
    if (env[i] > envPeak) envPeak = env[i];
  }
  let last = n - 1;
  while (last > onset && env[last] < envPeak * 1e-4) last--;
  const length40Ms = ((last - onset) / rate) * 1000;

  // Schroeder decay from the peak: the time to fall from -5 to -25 dB, times three.
  const tail = new Float64Array(n - peakAt + 1);
  for (let i = n - 1; i >= peakAt; i--) tail[i - peakAt] = tail[i - peakAt + 1] + mono[i] * mono[i];
  const e0 = tail[0];
  let t5 = -1;
  let t25 = -1;
  for (let i = 0; i < tail.length; i++) {
    const d = dbPower(tail[i] / Math.max(e0, 1e-30));
    if (t5 < 0 && d <= -5) t5 = i;
    if (d <= -25) {
      t25 = i;
      break;
    }
  }
  const t60Ms = t5 >= 0 && t25 > t5 ? (((t25 - t5) * 3) / rate) * 1000 : NaN;

  const spec = spectrum(mono, Math.max(0, onset - Math.round(0.005 * rate)), Math.min(n, Math.max(last, onset + Math.round(0.05 * rate))), rate);
  const loud = loudness(channels, rate);
  let knee = 0;
  for (const ch of channels) for (let i = 0; i < n; i++) if (Math.abs(ch[i]) > 0.85) knee++;
  return {
    peakDb: db(peak),
    rmsDb: dbPower(sumSq / (n * channels.length)),
    loudest50Db: dbPower(loudest),
    lufsI: loud.integrated,
    lufsM: loud.momentary,
    centroid: spec.centroid,
    bands: spec.bands,
    attackMs,
    attackToPeakMs,
    t60Ms,
    length40Ms,
    onsetMs: (onset / rate) * 1000,
    peakAtMs: ((peakAt - onset) / rate) * 1000,
    dc,
    overKnee: knee,
  };
}

/** The largest jump between neighbouring samples, and where: a click shows as one far above the rest. */
export function clicks(x, rate = RATE) {
  let worst = 0;
  let at = 0;
  let sum = 0;
  for (let i = 1; i < x.length; i++) {
    const d = Math.abs(x[i] - x[i - 1]);
    sum += d;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  return { worst, at: at / rate, mean: sum / Math.max(1, x.length - 1) };
}

export const median = (values) => {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
