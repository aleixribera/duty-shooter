// Virtual time for frame-locked renders. Injected before the page's own scripts.
// Until __vt.start() the page runs on real time. After it, performance.now, Date.now,
// timers and requestAnimationFrame only move when the rig calls __vt.step(ms), so every
// frame is drawn at an exact moment however long it takes to draw and capture.
// Math.random is seeded too, so a shot plays out the same way each time it is rendered.
(() => {
  const realNow = performance.now.bind(performance);
  const realDateNow = Date.now.bind(Date);
  const realSetTimeout = globalThis.setTimeout.bind(globalThis);
  const realClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const realSetInterval = globalThis.setInterval.bind(globalThis);
  const realClearInterval = globalThis.clearInterval.bind(globalThis);
  const realRaf = globalThis.requestAnimationFrame.bind(globalThis);
  const realCaf = globalThis.cancelAnimationFrame.bind(globalThis);

  let seed = 0x9e3779b9;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const vt = {
    on: false,
    t: 0,
    dateBase: 0,
    timers: new Map(),
    rafs: new Map(),
    nextId: 1e9,
    frames: 0,
  };
  globalThis.__vt = vt;

  performance.now = () => (vt.on ? vt.t : realNow());
  Date.now = () => (vt.on ? Math.floor(vt.dateBase + vt.t) : realDateNow());

  globalThis.setTimeout = (fn, ms = 0, ...args) => {
    if (!vt.on) return realSetTimeout(fn, ms, ...args);
    const id = vt.nextId++;
    vt.timers.set(id, { at: vt.t + Math.max(0, Number(ms) || 0), fn, args, every: 0 });
    return id;
  };
  globalThis.setInterval = (fn, ms = 0, ...args) => {
    if (!vt.on) return realSetInterval(fn, ms, ...args);
    const id = vt.nextId++;
    const every = Math.max(1, Number(ms) || 0);
    vt.timers.set(id, { at: vt.t + every, fn, args, every });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    if (vt.timers.has(id)) vt.timers.delete(id);
    else realClearTimeout(id);
  };
  globalThis.clearInterval = (id) => {
    if (vt.timers.has(id)) vt.timers.delete(id);
    else realClearInterval(id);
  };
  globalThis.requestAnimationFrame = (cb) => {
    const id = vt.nextId++;
    if (vt.on) {
      vt.rafs.set(id, cb);
      return id;
    }
    // Registered on real time: if virtual time starts before it fires, it joins the next step instead.
    const real = realRaf((ts) => {
      if (vt.on) vt.rafs.set(id, cb);
      else cb(ts);
    });
    vt.realRafs ??= new Map();
    vt.realRafs.set(id, real);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    vt.rafs.delete(id);
    const real = vt.realRafs?.get(id);
    if (real !== undefined) realCaf(real);
  };

  vt.start = (randomSeed = 1) => {
    vt.t = realNow();
    vt.dateBase = realDateNow() - vt.t;
    seed = randomSeed >>> 0;
    Math.random = rand;
    vt.on = true;
  };
  vt.seed = (s) => {
    seed = s >>> 0;
  };
  vt.stop = () => {
    vt.on = false;
    for (const [, t] of vt.timers) realSetTimeout(() => t.fn(...t.args), 0);
    vt.timers.clear();
    const rafs = [...vt.rafs.values()];
    vt.rafs.clear();
    for (const cb of rafs) realRaf(cb);
  };
  /** Moves time on by `ms`, firing the timers due on the way, then draws one frame. */
  vt.step = (ms) => {
    const end = vt.t + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of vt.timers) if (t.at <= end && (next === null || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      vt.t = Math.max(vt.t, t.at);
      if (t.every) t.at += t.every;
      else vt.timers.delete(id);
      try {
        typeof t.fn === 'function' ? t.fn(...t.args) : (0, eval)(t.fn);
      } catch (e) {
        console.error(e);
      }
    }
    vt.t = end;
    const rafs = [...vt.rafs.values()];
    vt.rafs.clear();
    for (const cb of rafs) {
      try {
        cb(vt.t);
      } catch (e) {
        console.error(e);
      }
    }
    vt.frames++;
    return rafs.length;
  };
})();
