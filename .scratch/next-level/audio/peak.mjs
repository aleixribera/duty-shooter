// The loudest moment a player hears, through the game's own master (compressor, limiter, clipper):
// one dense fight rendered offline in headless Chrome, written as a WAV, and measured with ffmpeg's
// EBU R128 meter (true peak, 4x oversampled). Also the bare master (no compressor/limiter/clipper),
// to show what goes into the chain. Needs the dev server.
//
//   node .scratch/next-level/audio/peak.mjs <label> [base url]
//
// Writes peak-<label>.json and peak-<label>-{master,bare}.wav beside this script.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../../../apps/range/scripts/chrome.mjs';

const label = process.argv[2] ?? 'now';
const base = process.argv[3] ?? 'http://localhost:5173/';
const audio = fileURLToPath(new URL('../../../packages/fps-client/src/audio/', import.meta.url)).replace(/\\/g, '/');
const here = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

const render = async (audio, bare) => {
  const { createSoundSystem } = await import(`/@fs/${audio}system.ts`);
  const rate = 48000;
  const seconds = 7;
  const ctx = new OfflineAudioContext(2, rate * seconds, rate);
  const s = createSoundSystem({ context: ctx, bareMaster: bare });
  s.setListener([0, 0, 0], [0, 0, -1], [0, 1, 0]);
  const at = (when, event, params = {}) => s.play(event, { ...params, when });
  // Your own rifle, full auto, a whole magazine; a shotgun and the sniper at the end.
  for (let i = 0; i < 30; i++) at(0.2 + i * 0.08, 'gunshot', { local: true, weapon: 'm4a1' });
  at(3.0, 'gunshot', { local: true, weapon: 'shotgun' });
  at(3.9, 'gunshot', { local: true, weapon: 'sniper' });
  at(5.2, 'gunshot', { local: true, weapon: 'revolver' });
  // Two enemies firing back from 4 m and 9 m, and their rounds cracking past.
  for (let i = 0; i < 16; i++) at(0.25 + i * 0.09, 'gunshot', { position: [4, 0, -1], weapon: 'smg' });
  for (let i = 0; i < 10; i++) at(1.0 + i * 0.11, 'gunshot', { position: [-6, 0, -7], weapon: 'lmg' });
  for (let i = 0; i < 6; i++) at(0.4 + i * 0.2, 'bulletCrack', { position: [1, 0.3, -1] });
  // Hits, a kill, a head shot, being hit.
  for (let i = 0; i < 10; i++) at(0.2 + i * 0.24, 'hitMarker');
  at(1.5, 'headshotMarker');
  at(2.6, 'killMarker');
  at(4.0, 'killMarker');
  for (let i = 0; i < 3; i++) at(1.2 + i * 0.5, 'damageTaken');
  // A frag at 5 m, a flash at 6 m.
  at(3.2, 'explosion', { position: [3, 0, -4] });
  at(4.6, 'flashBang', { position: [0, 0, -6] });
  const out = await ctx.startRendering();
  const l = out.getChannelData(0);
  const r = out.getChannelData(1);
  const pcm = new Int16Array(l.length * 2);
  let peak = 0;
  for (let i = 0; i < l.length; i++) {
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
    pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(l[i] * 32767)));
    pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(r[i] * 32767)));
  }
  const bytes = new Uint8Array(pcm.buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i += 0x8000) str += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { rate, samplePeakDb: 20 * Math.log10(peak), pcm: btoa(str) };
};

const wav = (pcm, rate) => {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

const meter = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const tail = String(r.stderr ?? '').split('Summary:').at(-1);
  return { lufs: Number(tail.match(/I:\s+(-?[\d.]+) LUFS/)?.[1] ?? NaN), truePeakDb: Number(tail.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1] ?? NaN) };
};

const chrome = await launchChrome();
const report = { label };
try {
  await chrome.navigate(`${base}?nolock`);
  await chrome.waitFor('document.readyState === "complete"', 60_000);
  for (const bare of [false, true]) {
    const res = await chrome.evaluate(`(${render})(${JSON.stringify(audio)}, ${bare})`);
    if (!res) throw new Error(`render failed:\n${chrome.errors.join('\n')}`);
    const file = here(`peak-${label}-${bare ? 'bare' : 'master'}.wav`);
    writeFileSync(file, wav(Buffer.from(res.pcm, 'base64'), res.rate));
    report[bare ? 'bare' : 'master'] = { samplePeakDb: Math.round(res.samplePeakDb * 10) / 10, ...meter(file) };
  }
} finally {
  await chrome.close();
}
writeFileSync(here(`peak-${label}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
