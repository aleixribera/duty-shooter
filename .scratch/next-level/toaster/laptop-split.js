// In-page probe for laptop-bench.mjs (PROBE), dev-mode build, `?bench` flight: where a frame's time goes.
// Alternates 0.75 s windows: normal; every texture copy skipped; TRAA's depth copy skipped (TRAA's history and depth copies,
// which no pass timestamp covers). Reports frame ms of each, and the main thread's JS per frame in the normal ones.
(async () => {
  const t0 = performance.now();
  while (![...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))) {
    if (performance.now() - t0 > 240000) return 'flight never started';
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 2000));
  const r = duty.renderer;
  const realCopy = r.copyTextureToTexture;
  const realRaf = window.requestAnimationFrame;
  let js = 0, jsFrames = 0, measuring = false;
  window.requestAnimationFrame = function (cb) {
    return realRaf.call(window, (t) => { const s = performance.now(); cb(t); if (measuring) { js += performance.now() - s; jsFrames++; } });
  };
  const sums = { normal: [0, 0], nocopy: [0, 0], nodepth: [0, 0] };
  for (let i = 0; i < 36; i++) {
    const mode = ['normal', 'nocopy', 'nodepth'][i % 3];
    r.copyTextureToTexture = mode === 'normal' ? realCopy : function (src) { if (mode === 'nocopy' || src.isDepthTexture) return; return realCopy.apply(this, arguments); };
    await new Promise((d) => setTimeout(d, 250));
    let frames = 0; let stop = false;
    measuring = mode === 'normal';
    const count = () => { frames++; if (!stop) realRaf.call(window, count); };
    realRaf.call(window, count);
    const s = performance.now();
    await new Promise((d) => setTimeout(d, 750));
    stop = true; measuring = false;
    sums[mode][0] += performance.now() - s; sums[mode][1] += frames;
  }
  r.copyTextureToTexture = realCopy;
  window.requestAnimationFrame = realRaf;
  return JSON.stringify({ normalMs: (sums.normal[0] / sums.normal[1]).toFixed(1), nocopyMs: (sums.nocopy[0] / sums.nocopy[1]).toFixed(1), nodepthMs: (sums.nodepth[0] / sums.nodepth[1]).toFixed(1), jsPerFrameMs: (js / jsFrames).toFixed(1) });
})()
