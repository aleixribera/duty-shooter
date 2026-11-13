// In-page probe for laptop-bench.mjs (PROBE): waits for a `?bench` flight, then sums each render pass's GPU time for 12 s.
// Needs `duty.renderer`, so it runs against a development-mode build (NODE_ENV=development vite build --mode development).
(async () => {
  const t0 = performance.now();
  while (![...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))) {
    if (performance.now() - t0 > 240000) return 'flight never started: ' + document.body.innerText.slice(0, 200);
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 3000));
  return await new Promise((done) => {
    const r = duty.renderer;
    const backend = r.backend;
    const names = new Map();
    const realBegin = backend.beginRender;
    backend.beginRender = function (ctx) {
      const t = ctx.renderTarget;
      const name = t ? (t.texture?.name || 'rt') + ' ' + t.width + 'x' + t.height + (t.samples > 1 ? ' x' + t.samples : '') + ' mrt' + (t.textures?.length ?? 1) : 'screen';
      const out = realBegin.apply(this, arguments);
      const uid = backend.get(ctx).timestampUID;
      if (uid) names.set(uid.split(':f')[0], name);
      return out;
    };
    const sums = new Map();
    let reads = 0;
    const pool = backend.timestampQueryPool.render;
    const realResolve = pool._resolveQueries.bind(pool);
    pool._resolveQueries = async function () {
      const total = await realResolve();
      for (const [uid, ms] of pool.timestamps) {
        const [, id] = uid.match(/^(.*):f(\d+)$/);
        const key = names.get(id) ?? 'ctx ' + id;
        sums.set(key, (sums.get(key) ?? 0) + ms);
      }
      reads += pool.frames?.length ?? 1;
      return total;
    };
    let frames = 0;
    const count = () => { frames++; if (!stop) requestAnimationFrame(count); };
    let stop = false;
    requestAnimationFrame(count);
    const start = performance.now();
    setTimeout(() => {
      stop = true;
      backend.beginRender = realBegin;
      const secs = (performance.now() - start) / 1000;
      const rows = [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([k, ms]) => (ms / reads).toFixed(3).padStart(7) + ' ms  ' + k);
      const all = [...sums.values()].reduce((a, b) => a + b, 0) / reads;
      done(JSON.stringify({ canvas: [r.domElement.width, r.domElement.height], frameMs: (secs * 1000 / frames).toFixed(1), reads, gpuTotalMs: all.toFixed(3), rows }, null, 1));
    }, 12000);
  });
})()
