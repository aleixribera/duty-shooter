// gpu-toggle.mjs's in-page measurement, made into a probe for laptop-bench.mjs (Firefox on the laptop, dev-mode build).
//   node laptop-toggle.mjs <what> [cycles=8] [period=2500] > probe.js
// then on the laptop: PROBE="$(cat probe.js)" PROBE_S=400 node duty-bench.mjs "http://localhost:8471/?map=<map>&spot=<spot>&stats&hz=1000" out.json
// `what` as in gpu-toggle.mjs; those needing `__Basic` or a temporary hook don't work here.
import { readFileSync } from 'node:fs';
const [what = 'depthfirst', cycles = '8', period = '2500'] = process.argv.slice(2);
const src = readFileSync(new URL('../one-picture/gpu-toggle.mjs', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('chrome.evaluate(`') + 'chrome.evaluate(`'.length, src.search(/`\);\r?\n\s*console\.log\(`\$\{what\}/));
const filled = new Function('what', 'cycles', 'period', 'process', 'return `' + body + '`;')(what, Number(cycles), Number(period), { env: {} });
// `post:<variant>`: the picture's output swapped for one of the alternatives a temporary hook in pipeline.ts
// leaves on `globalThis.__post` (see the ticket), to price one part of the post-processing.
const post = what.startsWith('post:') ? `if (globalThis.__post) { const P = globalThis.__post; P.pipeline.outputNode = v ? P.real : P.variants[${JSON.stringify(what.slice(5))}]; P.pipeline.needsUpdate = true; }` : '';
// `ao:<samples>:<temporal 0|1>`: the ambient occlusion's samples and its per-frame rotation, against the game's own (needs `globalThis.__ao`).
const [, aoSamples, aoTemporal] = what.split(':');
const aoSet = what.startsWith('ao:') ? `if (globalThis.__ao) { const A = globalThis.__ao; A.__real ??= A.samples.value; A.samples.value = v ? A.__real : ${Number(aoSamples)}; A.useTemporalFiltering = v ? false : ${aoTemporal === '1'}; }` : '';
const page = filled.replace(/on = v;/, `on = v; ${post} ${aoSet}`).replace(/import\('\/node_modules\/\.vite\/deps\/three_webgpu\.js'\)/, 'Promise.resolve({})');
process.stdout.write(`(async () => {
  while (!document.body.dataset.bake || !globalThis.duty?.game) await new Promise((r) => setTimeout(r, 500));
  await new Promise((r) => setTimeout(r, 8000));
  return await ${page};
})()`);
