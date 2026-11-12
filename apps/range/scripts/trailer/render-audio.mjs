// Renders the trailer's sound offline through the game's own sound system
// (createSoundSystem on an OfflineAudioContext), in headless Chrome:
//
//   sfx <shot dir> <from s> <to s> <out.wav> [cinematic,music,novo]
//       The sounds a captured shot asked for between from and to, each at its moment and heard from where the
//       camera stood, with Range Control's lines as the game said them. 'cinematic' leaves out the idle player's
//       own body and the HUD's sounds (hit markers, damage), for shots that don't look through the player's
//       eyes; 'music' plays the score's scenes and stings as the match changed them; 'novo' leaves out Range
//       Control, for an edit that lays its lines itself. Starts 3 s early so
//       sounds already ringing at 'from' are in, and cuts those 3 s off.
//   music <scene> <seconds> <out.wav> [timeLeft]
//       One scene of the score (menu, match, lateMatch, lastMinute, final10, ...), from its start.
//   sting <name> <seconds> <out.wav>
//       One of the score's stings (matchStart, ringClosing, victory, defeat).
//
// 48 kHz stereo 16-bit WAV. Needs the dev server; muted (nothing plays aloud).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../chrome.mjs';

const [kind, ...args] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173/';
const audio = fileURLToPath(new URL('../../../../packages/fps-client/src/audio/', import.meta.url)).replace(/\\/g, '/');
const RATE = 48000;
const LEAD = 3;
/** Sounds of the player's own body and the HUD: not heard in a shot that isn't through the player's eyes. */
const PLAYER_ONLY = new Set(['hitMarker', 'headshotMarker', 'killMarker', 'damageTaken', 'heartbeat', 'lowHealth', 'tinnitus', 'uiClick', 'uiHover', 'uiBack', 'uiConfirm']);

let job;
let out;
let seconds;
if (kind === 'sfx') {
  const [dir, from, to, file, mode] = args;
  out = file;
  const a = Number(from) - LEAD;
  seconds = Number(to) - a + 2;
  const modes = (mode ?? '').split(',');
  const cinematic = modes.includes('cinematic');
  const music = modes.includes('music');
  const voice = !modes.includes('novo');
  const events = JSON.parse(readFileSync(`${dir}/sounds.json`, 'utf8'))
    .filter((e) => (e.event || (voice && e.say) || (music && (e.scene || e.sting))) && e.t >= a && e.t < Number(to))
    .filter((e) => !cinematic || !e.event || (!e.params?.local && !PLAYER_ONLY.has(e.event)))
    .map((e) => ({ ...e, t: e.t - a }));
  job = { kind, events };
} else if (kind === 'music' || kind === 'sting') {
  const [name, secs, file, timeLeft] = args;
  out = file;
  seconds = Number(secs);
  job = { kind, name, timeLeft: timeLeft === undefined ? null : Number(timeLeft) };
} else {
  console.error('usage: render-audio.mjs sfx <shot dir> <from> <to> <out.wav> [cinematic] | music <scene> <seconds> <out.wav> [timeLeft] | sting <name> <seconds> <out.wav>');
  process.exit(2);
}

const chrome = await launchChrome();
try {
  // A static file of the dev server: a page with the server's origin and none of the game running.
  await chrome.navigate(`${base}textures/asphalt.webp`);
  await chrome.waitFor(`location.protocol === 'http:' && document.readyState === 'complete'`, 30_000);
  // A stalled render never answers: give up after ten minutes, so `finally` closes Chrome.
  const stalled = new Promise((_, no) => setTimeout(() => no(new Error('the render did not finish in 10 min')), 600_000).unref());
  const r = await Promise.race([stalled, chrome.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const job = ${JSON.stringify(job)};
      const { createSoundSystem } = await import('/@fs/${audio}system.ts');
      const rate = ${RATE};
      const ctx = new OfflineAudioContext(2, Math.ceil(rate * ${seconds}), rate);
      const sys = createSoundSystem({ context: ctx });
      const quantum = 128 / rate;
      if (job.kind === 'sfx' && job.events.some((e) => e.say)) {
        // Range Control's recording, decoded before the render starts.
        const { loadRangeControl } = await import('/@fs/${audio}../announcer.ts');
        loadRangeControl(sys.speech);
        for (let i = 0; i < 200 && !sys.speech.state.ready && !sys.speech.state.failed; i++) await new Promise((r) => setTimeout(r, 50));
        if (!sys.speech.state.ready) throw new Error("Range Control's recording did not load");
      }
      if (job.kind === 'sfx') {
        // Every event at its own moment: the render stops there, the listener moves, the sound starts.
        const groups = new Map();
        for (const e of job.events) {
          const q = Math.max(1, Math.round(e.t / quantum)) * quantum;
          if (!groups.has(q)) groups.set(q, []);
          groups.get(q).push(e);
        }
        for (const [q, list] of groups) {
          ctx.suspend(q).then(() => {
            for (const e of list) {
              if (e.listener) sys.setListener(e.listener[0], e.listener[1], e.listener[2]);
              if (e.event) sys.play(e.event, e.params);
              else if (e.say) sys.speech.say(e.say, e.cuts ?? false);
              else if (e.scene) sys.music.setScene(e.scene, e.timeLeft);
              else if (e.sting) sys.music.sting(e.sting);
            }
            ctx.resume();
          });
        }
      } else if (job.kind === 'music') sys.music.setScene(job.name, job.timeLeft);
      else {
        // A sting sounds over a scene: the match's, which is silent itself.
        sys.music.setScene('match');
        sys.music.sting(job.name);
      }
      const buf = await ctx.startRendering();
      const l = buf.getChannelData(0), r = buf.getChannelData(1);
      const skip = job.kind === 'sfx' ? Math.round(${LEAD} * rate) : 0;
      const n = l.length - skip;
      const bytes = new Uint8Array(44 + n * 4);
      const v = new DataView(bytes.buffer);
      const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, rate, true);
      v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
      let peak = 0;
      for (let i = 0; i < n; i++) {
        const a = l[i + skip], b = r[i + skip];
        peak = Math.max(peak, Math.abs(a), Math.abs(b));
        v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, a)) * 32767, true);
        v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, b)) * 32767, true);
      }
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { wav: btoa(s), peak, events: job.events?.length ?? 0 };
    })()`,
  })]);
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  const { wav, peak, events } = r.result.result.value;
  writeFileSync(out, Buffer.from(wav, 'base64'));
  console.log(`${out}: ${seconds.toFixed(1)} s, ${events} events, peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS`);
} finally {
  await chrome.close();
}
