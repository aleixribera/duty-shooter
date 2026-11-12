// The game's own sound for each clip in the cut: every sound the take logged around the seconds the cut
// uses, played again through the game's sound system into an OfflineAudioContext, heard from the film
// camera at the middle of the cut. One WAV per clip, PRE seconds before its in point and TAIL after.
//
//   node rig/sfx.mjs <edl.json> <out dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../../../apps/range/scripts/chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const BASE = process.env.BASE ?? 'http://localhost:5173/';
const RATE = 48000;
export const PRE = 3;
export const TAIL = 2;

const [edlPath, outDir] = process.argv.slice(2);
const edl = JSON.parse(readFileSync(edlPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

function wav(left, right) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 8, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 8, 28);
  buf.writeUInt16LE(8, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) {
    buf.writeFloatLE(left[i], 44 + i * 8);
    buf.writeFloatLE(right[i], 48 + i * 8);
  }
  return buf;
}

const RENDER = `async (job) => {
  const { createSoundSystem } = await import(${JSON.stringify('/@fs/' + join(root, 'packages/fps-client/src/audio/system.ts').replace(/\\/g, '/'))});
  const ctx = new OfflineAudioContext(2, Math.ceil(job.seconds * ${RATE}), ${RATE});
  const s = createSoundSystem({ context: ctx, mix: { music: 0 } });
  s.setListener(job.listener.position, job.listener.forward, [0, 1, 0]);
  for (const e of job.events) s.play(e.event, { ...e.params, when: e.when });
  const buf = await ctx.startRendering();
  const pack = (a) => { const b = new Uint8Array(a.buffer); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
  return { l: pack(buf.getChannelData(0)), r: pack(buf.getChannelData(1)), peak: buf.getChannelData(0).reduce((m, x) => Math.max(m, Math.abs(x)), 0) };
}`;

const chrome = await launchChrome();
try {
  // A page on the dev server's origin without the game in it: the server only has to compile the sound system.
  await chrome.navigate(`${BASE}@vite/env`);
  await chrome.waitFor("document.readyState === 'complete'", 30_000, 200);
  const ev = async (expr) => {
    const r = await chrome.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    const value = r.result?.result?.value;
    if (value === undefined) throw new Error(`no result: ${JSON.stringify(r).slice(0, 400)}`);
    return value;
  };
  // One clip's sound; on a failure (the page reloaded under us, say) load the page again and try once more.
  const render = async (job) => {
    const run = () => ev(`(${RENDER})(${JSON.stringify(job)})`);
    try {
      return await run();
    } catch (err) {
      console.log(`retrying after: ${err.message.slice(0, 200)}`);
      await chrome.navigate(`${BASE}@vite/env`);
      await chrome.waitFor("document.readyState === 'complete'", 30_000, 200);
      return run();
    }
  };
  const renders = join(here, '..', 'renders');
  // Sounds the cut adds that the take never logged ({event, at: s into the clip, params}), e.g. a siren.
  const extra = (e) => (e.extra ?? []).map((x) => ({ event: x.event, params: x.params, when: PRE + x.at + (x.params.when ?? 0) }));
  for (const [i, e] of edl.cut.entries()) {
    if (e.type !== 'clip' || e.sfx === false) continue;
    if (e.src) {
      // The other capture: sounds.json carries each sound's time (s, on its JPGs' clock: JPG k at k/60) and the listener's pose then.
      const log = JSON.parse(readFileSync(join(renders, '..', e.src, 'sounds.json'), 'utf8')).filter((s) => s.event);
      // Slowed clips hear each sound at its slowed time (the sounds themselves play at their own speed).
      const speed = e.speed ?? 1;
      const seconds = PRE + e.dur + TAIL;
      const events = log
        .map((s) => ({ s, at: (s.t - e.in) / speed + PRE }))
        .filter(({ at }) => at >= 0 && at < seconds - 0.5)
        .map(({ s, at }) => ({ event: s.event, params: s.params, when: at + (s.params.when ?? 0) }))
        .concat(extra(e));
      const mid = e.in + (e.dur * speed) / 2;
      const near = log.filter((s) => s.listener).sort((a, b) => Math.abs(a.t - mid) - Math.abs(b.t - mid))[0];
      const listener = { position: near.listener[0], forward: near.listener[1] };
      const out = await render({ seconds, events, listener });
      const f32 = (b64) => new Float32Array(new Uint8Array(Buffer.from(b64, 'base64')).buffer);
      writeFileSync(join(outDir, `seg-${String(i).padStart(3, '0')}.wav`), wav(f32(out.l), f32(out.r)));
      console.log(`seg ${i} ${e.src}@${e.in}: ${events.length} sounds, peak ${out.peak.toFixed(3)}`);
      continue;
    }
    const shot = JSON.parse(readFileSync(join(renders, e.take, 'shot.json'), 'utf8'));
    const start = (e.in ?? 0) + shot.from - PRE;
    const seconds = PRE + e.dur + TAIL;
    const events = shot.sounds
      .filter((s) => s.t >= start && s.t < start + seconds - 0.5)
      .map((s) => ({ event: s.event, params: s.params, when: s.t - start + (s.params.when ?? 0) }))
      .concat(extra(e));
    const mid = shot.cameras[Math.min(shot.cameras.length - 1, Math.round(((e.in ?? 0) + e.dur / 2) * shot.fps))];
    const cp = Math.cos(mid.pitch);
    const listener = { position: mid.position, forward: [-Math.sin(mid.yaw) * cp, Math.sin(mid.pitch), -Math.cos(mid.yaw) * cp] };
    const out = await render({ seconds, events, listener });
    const f32 = (b64) => new Float32Array(new Uint8Array(Buffer.from(b64, 'base64')).buffer);
    writeFileSync(join(outDir, `seg-${String(i).padStart(3, '0')}.wav`), wav(f32(out.l), f32(out.r)));
    console.log(`seg ${i} ${e.take}: ${events.length} sounds, peak ${out.peak.toFixed(3)}`);
  }
  if (chrome.errors.length) console.log('page errors:', chrome.errors.slice(0, 5));
} finally {
  await chrome.close();
}
