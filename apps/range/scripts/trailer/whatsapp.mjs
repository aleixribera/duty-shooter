// A copy of a video that sends cleanly as a WhatsApp video: H.264 High in an MP4 with its index first,
// 8-bit 4:2:0 BT.709, at most 1920 wide and 60 fps, AAC stereo, sized in two passes under a budget
// (default 60 MB, well under WhatsApp's 100 MB video limit).
//
//   node apps/range/scripts/trailer/whatsapp.mjs <in.mp4> <out.mp4> [budget MB]
//
// WIDTH=<px> and FPS=<n> lower the picture, so a small budget goes further: a 16 MB copy (the size every WhatsApp
// client plays inline without squeezing it again) of a minute of fast play reads better at 1280 and 30 fps.
import { execFileSync } from 'node:child_process';
import { rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [input, output, budgetArg] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node whatsapp.mjs <in.mp4> <out.mp4> [budget MB]');
  process.exit(2);
}
const budget = Number(budgetArg ?? 60) * 1024 * 1024 * 8;
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', input], { encoding: 'utf8' }));
const seconds = Number(probe.format.duration);
const video = probe.streams.find((s) => s.codec_type === 'video');
const hasAudio = probe.streams.some((s) => s.codec_type === 'audio');
const [num, den] = video.r_frame_rate.split('/').map(Number);
const fps = Math.min(Number(process.env.FPS ?? 60), num / (den || 1));
const width = Number(process.env.WIDTH ?? 1920);
const audioKbps = hasAudio ? 192 : 0;
// 4 % kept back for the container; never above 10 Mb/s, more than WhatsApp keeps anyway.
const videoKbps = Math.floor(Math.min(10_000, (budget * 0.96) / seconds / 1000 - audioKbps));
if (videoKbps < 500) throw new Error(`${seconds.toFixed(0)} s does not fit ${budgetArg ?? 60} MB at a watchable rate`);

const log = join(tmpdir(), `whatsapp-${process.pid}`);
const common = [
  '-y', '-v', 'error', '-i', input,
  '-map', '0:v:0',
  '-vf', `scale='min(${width},iw)':-2:flags=lanczos,fps=${fps},format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level:v', '4.2',
  '-b:v', `${videoKbps}k`, '-maxrate', `${Math.round(videoKbps * 1.6)}k`, '-bufsize', `${videoKbps * 2}k`,
  '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv',
  '-passlogfile', log,
];
try {
  execFileSync('ffmpeg', [...common, '-pass', '1', '-an', '-f', 'mp4', process.platform === 'win32' ? 'NUL' : '/dev/null'], { stdio: 'inherit' });
  execFileSync('ffmpeg', [
    ...common, '-pass', '2',
    ...(hasAudio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000', '-ac', '2'] : []),
    '-movflags', '+faststart', '-tag:v', 'avc1', output,
  ], { stdio: 'inherit' });
} finally {
  for (const f of [`${log}-0.log`, `${log}-0.log.mbtree`]) rmSync(f, { force: true });
}
const mb = statSync(output).size / 1024 / 1024;
console.log(`${output}: ${mb.toFixed(1)} MB, ${seconds.toFixed(1)} s, ${video.width}x${video.height} -> H.264 ${videoKbps} kb/s${hasAudio ? ` + AAC ${audioKbps} kb/s` : ''}, ${fps.toFixed(2)} fps`);
