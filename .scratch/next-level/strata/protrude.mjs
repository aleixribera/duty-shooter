// Ticket 100: how far rock-strata's mesh stands out of its solids, in metres at a big ledge's and a pillar's scale.
//   node .scratch/next-level/strata/protrude.mjs apps/range/public/models/vegetation.glb apps/range/src/map/kit-solids.ts
// The camera (0.03 m near plane) walks into the drawn rock where this passes the player's radius.
import fs from 'node:fs';
const [glb, ks] = process.argv.slice(2);
const src = fs.readFileSync(ks, 'utf8');
const st = src.indexOf("'rock-strata': [");
const block = src.slice(st).split(/\r?\n  \],/)[0];
const boxes = [...block.matchAll(/c: \[([^\]]+)\], s: \[([^\]]+)\]/g)].map(m => ({ c: m[1].split(',').map(Number), s: m[2].split(',').map(Number) }));
const buf = fs.readFileSync(glb); const jl = buf.readUInt32LE(12); const gl = JSON.parse(buf.subarray(20, 20 + jl).toString()); const bin = 20 + jl + 8;
const mesh = gl.meshes.find(m => m.name === 'rock-strata'); const pa = gl.accessors[mesh.primitives[0].attributes.POSITION]; const pv = gl.bufferViews[pa.bufferView];
const pts = []; for (let i = 0; i < pa.count; i++) pts.push([0,1,2].map(k => buf.readFloatLE(bin + (pv.byteOffset||0) + (pa.byteOffset||0) + (i*3+k)*4)));
for (const [label, S] of [['ledge 13.4x2.9x6.8', [13.4, 2.9, 6.8]], ['pillar 3.4x9.3x3.4', [3.4, 9.3, 3.4]]]) {
  const d = pts.map(p => Math.min(...boxes.map(b => Math.hypot(...[0,1,2].map(k => Math.max(0, Math.abs(p[k] - b.c[k]) - b.s[k] / 2) * S[k]))))).sort((a, b) => a - b);
  const q = f => d[Math.floor(f * (d.length - 1))].toFixed(2);
  console.log(label, 'boxes', boxes.length, 'out of solids (m): median', q(0.5), 'p90', q(0.9), 'p99', q(0.99), 'max', q(1), '>0.3m', d.filter(x => x > 0.3).length + '/' + d.length);
}
