// A contact sheet of a captured shot: every n-th frame (or the last frame of
// each half second for a scout), numbered, four across.
//
//   node apps/range/scripts/trailer/sheet.mjs <shot dir> [every n frames | scout]
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const [dir, every = 'scout'] = process.argv.slice(2);
const info = JSON.parse(readFileSync(`${dir}/shot.json`, 'utf8'));
const files = readdirSync(`${dir}/frames`).filter((f) => f.endsWith('.jpg')).sort();
const step = every === 'scout' ? info.fps / 2 : Number(every);
const picked = files.filter((_, i) => (every === 'scout' ? (i + 1) % step === 0 : i % step === 0));
const inputs = picked.flatMap((f) => ['-i', `${dir}/frames/${f}`]);
const cols = 4;
const rows = Math.ceil(picked.length / cols);
const labels = picked.map((f, i) => `[${i}]scale=480:-1,drawtext=text='${i + 1}  ${f.replace('.jpg', '')}':x=8:y=8:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`);
const pad = Array.from({ length: rows * cols - picked.length }, (_, i) => `color=black:s=480x270:d=1[p${i}]`);
const all = [...picked.map((_, i) => `[v${i}]`), ...pad.map((_, i) => `[p${i}]`)].join('');
const layout = Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join('|');
const filter = [...labels, ...pad, `${all}xstack=inputs=${rows * cols}:layout=${layout}[out]`].join(';');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', `${dir}/sheet.jpg`]);
console.log(`${dir}/sheet.jpg (${picked.length} frames)`);
