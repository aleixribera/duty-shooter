// The ambient occlusion's samples and per-frame rotation, seen: one frame of a spot per setting, in this PC's scripted Chrome.
//   node .scratch/next-level/toaster/ao-look.mjs <base url of a dev build with the __ao hook> <map> <spot> <out prefix>
// The dev build carries the temporary hook (`globalThis.__ao` = the GTAO node; see the ticket, pass 32).
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const [base, map, spot, out] = process.argv.slice(2);
const settings = (process.env.AO ?? '8:0,6:1,4:1,3:1').split(',');
const chrome = await launchChrome();
try {
  // spot `bench`: the dev flight instead, so each frame is taken with the camera moving (the temporal AA's weakest case).
  const moving = spot === 'bench';
  await chrome.navigate(`${base}?map=${map}&${moving ? 'bench' : `spot=${encodeURIComponent(spot)}`}&hz=1000`);
  await chrome.waitFor(moving ? 'globalThis.__ao' : 'document.body.dataset.bake && globalThis.__ao', 240_000);
  await sleep(moving ? Number(process.env.AT ?? 3000) : 8000);
  // RAW=1: the screen shows the occlusion buffer itself (red), with no temporal AA over it.
  if (process.env.RAW) await chrome.evaluate(`(() => { const P = globalThis.__post; P.pipeline.outputNode = globalThis.__ao.getTextureNode(); P.pipeline.needsUpdate = true; })()`);
  // TURN=<rad a frame>: the spot's camera keeps turning, so every frame is taken in motion.
  if (process.env.TURN) await chrome.evaluate(`(() => { const s = duty.game.overview; let t = 0; const f = () => { duty.game.overview = { ...s, yaw: s.yaw + Math.sin(t += ${Number(process.env.TURN)}) * 0.6 }; requestAnimationFrame(f); }; f(); })()`);
  for (const [i, s] of settings.entries()) {
    const [n, t] = s.split(':');
    await chrome.evaluate(`(() => { const A = globalThis.__ao; A.samples.value = ${Number(n)}; A.useTemporalFiltering = ${t === '1'}; })()`);
    await sleep(moving ? 1500 : 6000);
    // FRAMES=<k>: k frames a setting, 150 ms apart (`-f<j>` in the name), to average what the temporal AA would.
    for (let f = 0; f < Number(process.env.FRAMES ?? 1); f++) {
      const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${out}-${moving ? `${i}-` : ''}${n}-${t}${process.env.FRAMES ? `-f${f}` : ''}.png`, Buffer.from((shot.result ?? shot).data, 'base64'));
      await sleep(150);
    }
    console.log('shot', s);
  }
  console.log('errors', JSON.stringify(chrome.errors.slice(0, 5)));
} finally {
  await chrome.close();
}
