// Cuts a trailer from captured shots (capture.mjs), cards (cards.mjs) and sound, by an edit list:
//
//   node apps/range/scripts/trailer/edit.mjs <edl.json> <out.mp4> [--draft]
//
// edl.json (paths relative to the EDL's folder):
//   { "fps": 60, "grade": "<ffmpeg filter for every shot, optional>", "cards": "cards", "loudness": -14,
//     "shots": [
//       { "clip": "gp-yard", "from": 4.0, "to": 7.2, "speed": 1, "sfx": "", "gain": 0, "tail": 0,
//         "over": "slate-yard", "overIn": 0.2, "overOut": 0.4, "fadeIn": 0, "fadeOut": 0 },
//       { "card": "title", "seconds": 2, "fadeIn": 0.2, "fadeOut": 0.4 } ],
//     "audio": [
//       { "file": "audio/m-lastMinute.wav", "at": 12, "from": 0, "seconds": 20, "gain": -4, "fadeIn": 0.5, "fadeOut": 1 },
//       { "vo": "t60Nuke", "at": 30, "gain": 0 } ] }
//
// A shot plays its clip's frames from..to (seconds of the capture) at `speed` (0.5: a 120 fps capture at half
// speed), with its own sound unless `sfx` is false: render-audio.mjs's sfx, with its mode ("cinematic",
// "music", or both), placed under the shot, cut with it, or ringing `tail` seconds past the cut. `over` lays a
// transparent card over the shot. A card shot is a full-frame card. `audio` lays music or Range Control's
// recorded lines (`vo`, from the game's own recording) on the timeline. The mix is brought to `loudness` LUFS
// (true peak -1 dB). Shots and sounds are cached in <edl folder>/cache by what made them.
//
// Needs ffmpeg on PATH, and the dev server for the shots' sound.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [edlPath, outPath, ...flags] = process.argv.slice(2);
if (!edlPath || !outPath) {
  console.error('usage: node edit.mjs <edl.json> <out.mp4> [--draft]');
  process.exit(2);
}
const draft = flags.includes('--draft');
const edl = JSON.parse(readFileSync(edlPath, 'utf8'));
const root = dirname(resolve(edlPath));
const at = (p) => resolve(root, p);
const cache = join(root, 'cache');
mkdirSync(cache, { recursive: true });
const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../../../../packages/fps-client/src/audio/assets');
const fps = edl.fps ?? 60;
const [W, H] = draft ? [960, 540] : [1920, 1080];
const RATE = 48000;

const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const key = (o) => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);
const n3 = (x) => Number(x).toFixed(3);
/** What a file is now, for a cache key: a recaptured clip or a redrawn card makes a new one. */
const stamp = (f) => (existsSync(f) ? `${statSync(f).size}:${statSync(f).mtimeMs}` : 'none');
const cardFile = (name) => join(at(edl.cards ?? 'cards'), `${name}.png`);

// ---- Picture: each shot its own segment (same codec and size, so they join without re-encoding). ----
const enc = draft
  ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-r', String(fps)]
  : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(fps), '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709'];
const timeline = [];
let t = 0;
const segments = [];
for (const [i, s] of edl.shots.entries()) {
  const fades = (seconds) => [s.fadeIn ? `fade=t=in:st=0:d=${n3(s.fadeIn)}` : null, s.fadeOut ? `fade=t=out:st=${n3(seconds - s.fadeOut)}:d=${n3(s.fadeOut)}` : null].filter(Boolean);
  let seconds;
  let args;
  let inputs;
  if (s.card) {
    // Whole frames, so the timeline under the picture is the picture's.
    seconds = Math.round(s.seconds * fps) / fps;
    inputs = [cardFile(s.card)];
    const vf = [`scale=${W}:${H}`, ...fades(seconds), 'format=yuv420p'].join(',');
    args = ['-loop', '1', '-framerate', String(fps), '-t', n3(seconds), '-i', cardFile(s.card), '-vf', vf, '-frames:v', String(Math.round(seconds * fps))];
  } else {
    const shot = JSON.parse(readFileSync(join(at(s.clip), 'shot.json'), 'utf8'));
    const speed = s.speed ?? 1;
    const first = Math.round(s.from * shot.fps);
    const count = Math.round((s.to - s.from) * shot.fps);
    if (first < 0 || first + count > shot.frames) throw new Error(`shot ${i}: ${s.clip} has frames 0..${shot.frames}, not ${first}..${first + count}`);
    // Whole output frames: the picture's length, which the sound is laid against.
    seconds = Math.round((count / shot.fps / speed) * fps) / fps;
    inputs = [join(at(s.clip), 'shot.json'), ...(s.over ? [cardFile(s.over)] : [])];
    const chain = [`scale=${W}:${H}:flags=lanczos`, edl.grade && s.grade !== false ? edl.grade : null, s.grade || null, ...fades(seconds)].filter(Boolean);
    const frameInputs = ['-start_number', String(first), '-framerate', String(shot.fps * speed), '-i', join(at(s.clip), 'frames', '%05d.jpg')];
    if (s.over) {
      const o = [`fade=t=in:st=0:d=${n3(s.overIn ?? 0.01)}:alpha=1`, s.overOut ? `fade=t=out:st=${n3(seconds - s.overOut)}:d=${n3(s.overOut)}:alpha=1` : null].filter(Boolean);
      args = [...frameInputs, '-loop', '1', '-framerate', String(fps), '-t', n3(seconds), '-i', cardFile(s.over),
        '-filter_complex', `[0:v]${chain.join(',')}[v];[1:v]scale=${W}:${H},format=rgba,${o.join(',')}[o];[v][o]overlay=format=auto,format=yuv420p`, '-frames:v', String(Math.round(seconds * fps))];
    } else args = [...frameInputs, '-vf', [...chain, 'format=yuv420p'].join(','), '-frames:v', String(Math.round(seconds * fps))];
  }
  const file = join(cache, `v-${key({ s, W, H, fps, grade: edl.grade, draft, files: inputs.map(stamp) })}.mp4`);
  if (!existsSync(file)) {
    // Encoded beside the cache file and moved in whole: a stopped encode never leaves a half segment to reuse.
    const part = file.replace(/\.mp4$/, '.part.mp4');
    ff([...args, ...enc, '-an', part]);
    renameSync(part, file);
    console.log(`shot ${i + 1}/${edl.shots.length}: ${s.card ?? `${s.clip} ${s.from}-${s.to}`} (${seconds.toFixed(2)} s)`);
  }
  segments.push(file);
  timeline.push({ s, start: t, seconds });
  t += seconds;
}
const total = t;
const list = join(cache, 'concat.txt');
writeFileSync(list, segments.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
const picture = join(cache, `picture-${draft ? 'draft' : 'full'}.mp4`);
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', picture]);

// ---- Sound: every shot's own, the music and Range Control, laid on the timeline. ----
const layers = [];
for (const { s, start, seconds } of timeline) {
  if (s.card || s.sfx === false || (s.speed ?? 1) !== 1) continue;
  const tail = s.tail ?? 0;
  const wav = join(cache, `a-${key({ clip: s.clip, from: s.from, to: s.to + tail, sfx: s.sfx ?? '', sounds: stamp(join(at(s.clip), 'sounds.json')) })}.wav`);
  if (!existsSync(wav)) execFileSync('node', [join(here, 'render-audio.mjs'), 'sfx', at(s.clip), String(s.from), String(s.to + tail), wav, s.sfx ?? ''], { stdio: 'inherit' });
  layers.push({ file: wav, at: start, from: 0, seconds: seconds + tail, gain: s.gain ?? 0, fadeIn: 0.012, fadeOut: tail ? Math.min(tail, 0.4) : 0.02 });
}
const vo = JSON.parse(readFileSync(join(assets, 'controller.json'), 'utf8')).lines;
for (const a of edl.audio ?? []) {
  if (a.vo) {
    const line = vo[a.vo];
    if (!line) throw new Error(`no Range Control line ${a.vo}`);
    // The line as the game plays it: the next one starts 0.18 s after its end in the recording.
    layers.push({ file: join(assets, 'controller.mp3'), at: a.at, from: line.start, seconds: line.seconds + 0.06, gain: a.gain ?? 0, fadeIn: 0.005, fadeOut: 0.05, vo: true });
  } else layers.push({ file: at(a.file), at: a.at, from: a.from ?? 0, seconds: a.seconds, gain: a.gain ?? 0, fadeIn: a.fadeIn ?? 0, fadeOut: a.fadeOut ?? 0 });
}
const inputs = layers.flatMap((l) => ['-i', l.file]);
const chains = layers.map((l, i) => {
  const parts = [`atrim=start=${n3(l.from)}${l.seconds ? `:duration=${n3(l.seconds)}` : ''}`, 'asetpts=PTS-STARTPTS', `aresample=${RATE}`, 'aformat=channel_layouts=stereo'];
  if (l.fadeIn) parts.push(`afade=t=in:st=0:d=${n3(l.fadeIn)}`);
  if (l.fadeOut && l.seconds) parts.push(`afade=t=out:st=${n3(Math.max(0, l.seconds - l.fadeOut))}:d=${n3(l.fadeOut)}`);
  parts.push(`volume=${l.gain}dB`, `adelay=${Math.round(l.at * 1000)}:all=1`);
  return `[${i}:a]${parts.join(',')}[a${i}]`;
});
const mixed = `${chains.join(';')};${layers.map((_, i) => `[a${i}]`).join('')}amix=inputs=${layers.length}:normalize=0:dropout_transition=0,apad,atrim=duration=${n3(total)}`;
const raw = join(cache, 'mix-raw.wav');
// -t as well as the atrim: a broken input once kept this graph running until it had filled the disk.
ff([...inputs, '-filter_complex', `${mixed}[m]`, '-map', '[m]', '-t', n3(total), '-c:a', 'pcm_s24le', '-ar', String(RATE), raw]);
// Two passes of loudness: measure, then bring the whole mix to the target in one linear move, peaks held under -1 dBTP.
const target = edl.loudness ?? -14;
const pass = spawnSync('ffmpeg', ['-hide_banner', '-i', raw, '-af', `loudnorm=I=${target}:TP=-1:LRA=11:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
const measured = JSON.parse(pass.stderr.slice(pass.stderr.lastIndexOf('{'), pass.stderr.lastIndexOf('}') + 1));
const norm = `loudnorm=I=${target}:TP=-1:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
const mix = join(cache, 'mix.wav');
// Then a limiter at -2 dBFS on 4x oversampled audio (so it catches peaks between samples): the linear move can
// push gunshots over the ceiling, and the AAC encode adds about a decibel on top of what goes in.
ff(['-i', raw, '-af', `${norm},aresample=${RATE * 4},alimiter=limit=0.794:attack=1:release=60:level=false,aresample=${RATE}`, '-c:a', 'pcm_s16le', mix]);

mkdirSync(dirname(resolve(outPath)), { recursive: true });
ff(['-i', picture, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', outPath]);
console.log(`${outPath}: ${total.toFixed(2)} s, ${edl.shots.length} shots, ${layers.length} sound layers, mix measured ${measured.input_i} LUFS -> ${target}`);
