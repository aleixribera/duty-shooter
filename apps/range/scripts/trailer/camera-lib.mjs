// Page-side camera helpers for the trailer's shots, put on the page as `C`
// before a shot's first frame. Yaw 0 looks down -Z; positive pitch looks up.
export const CAMERA_LIB = `(() => {
  const lerp = (a, b, k) => a + (b - a) * k;
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  const easeOut = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
  const easeIn = (k) => Math.pow(Math.min(1, Math.max(0, k)), 3);
  /** Yaw and pitch from one point looking at another. */
  const look = (from, to) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  };
  /** A camera at 'from' looking at 'to'. */
  const at = (from, to, fov = 45, roll = 0) => ({ position: from, ...look(from, to), fov, roll });
  /** Catmull-Rom through points (arrays), k in [0, 1] over the whole path. */
  const spline = (pts, k) => {
    if (pts.length === 1) return pts[0];
    const n = pts.length - 1;
    const f = Math.min(n - 1e-9, Math.max(0, k * n));
    const i = Math.floor(f), u = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    return p1.map((_, d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u * u + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u * u * u));
  };
  /** A move: the camera along 'from' points, looking along 'to' points, over 'seconds', eased at both ends unless linear. */
  const move = (t, seconds, from, to, fov = 45, opts = {}) => {
    const raw = Math.min(1, Math.max(0, t / seconds));
    const k = opts.linear ? raw : opts.out ? easeOut(raw) : ease(raw);
    const f = Array.isArray(fov) ? lerp(fov[0], fov[1], k) : fov;
    return at(spline(from, k), spline(to, k), f, opts.roll ? lerp(opts.roll[0], opts.roll[1], k) : 0);
  };
  /** A slow handheld sway, seeded, in radians. */
  const sway = (t, amount = 0.004, seed = 0) => ({
    yaw: amount * (Math.sin(t * 0.9 + seed) * 0.6 + Math.sin(t * 2.3 + seed * 2) * 0.3 + Math.sin(t * 5.1 + seed * 3) * 0.1),
    pitch: amount * 0.7 * (Math.sin(t * 1.1 + seed * 5) * 0.6 + Math.sin(t * 2.9 + seed) * 0.3 + Math.sin(t * 6.3 + seed * 7) * 0.1),
  });
  const handheld = (cam, t, amount, seed) => { const s = sway(t, amount, seed); return { ...cam, yaw: cam.yaw + s.yaw, pitch: cam.pitch + s.pitch }; };
  const players = () => (duty.game.driver ? duty.game.driver.others(0).filter((p) => p.kind === 'player') : []);
  const byId = (id) => players().find((p) => p.id === id) ?? null;
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  /** The live player nearest a point, optionally with a test. */
  const nearest = (point, test = () => true) => players().filter((p) => p.alive && test(p)).reduce((a, p) => (!a || flat(p.position, point) < flat(a.position, point) ? p : a), null);
  /** Exponential smoothing of a vector held in state[key]. */
  const smooth = (state, key, target, dt, rate) => {
    const prev = state[key] ?? target;
    const k = 1 - Math.exp(-dt * rate);
    const next = prev.map((v, i) => v + (target[i] - v) * k);
    state[key] = next;
    return next;
  };
  // The map's solids as boxes (an oriented one by its bounds), for keeping the lens out of walls.
  const boxes = (duty.map.solids ?? []).map((s) => [s.min, s.max]);
  /** The fraction along from->to of the first solid hit, or 1 when clear. */
  const ray = (from, to) => {
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    let best = 1;
    for (const [mn, mx] of boxes) {
      let t0 = 0, t1 = best, hit = true;
      for (let a = 0; a < 3 && hit; a++) {
        if (Math.abs(d[a]) < 1e-9) { if (from[a] < mn[a] || from[a] > mx[a]) hit = false; continue; }
        let u = (mn[a] - from[a]) / d[a], v = (mx[a] - from[a]) / d[a];
        if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u); t1 = Math.min(t1, v);
        if (t0 > t1) hit = false;
      }
      if (hit && t0 < best) best = t0;
    }
    return best;
  };
  const clear = (from, to) => ray(from, to) >= 0.999;
  const fwd = (yaw) => [-Math.sin(yaw), 0, -Math.cos(yaw)];
  const right = (yaw) => [Math.cos(yaw), 0, -Math.sin(yaw)];
  const add = (a, ...rest) => rest.reduce((p, [v, k]) => p.map((x, i) => x + v[i] * k), [...a]);
  const chest = (p) => [p.position[0], p.position[1] + p.eyeHeight * 0.8, p.position[2]];
  const head = (p) => [p.position[0], p.position[1] + p.eyeHeight, p.position[2]];

  /** Where a style puts the camera on player p at time t, and what it looks at; null when the lens would sit in a wall. */
  const setups = {
    shoulder: (p, t, side) => {
      const h = head(p), f = fwd(p.yaw), r = right(p.yaw);
      const want = add(h, [f, -2.1], [r, 0.55 * side], [[0, 1, 0], 0.12]);
      const k = ray(h, want);
      if (k < 0.55) return null;
      const lens = add(h, [f, -2.1 * (k - 0.05)], [r, 0.55 * side * (k - 0.05)], [[0, 1, 0], 0.12]);
      return { lens, aim: add(h, [f, 18], [[0, 1, 0], Math.tan(p.pitch) * 18]), fov: 48 };
    },
    profile: (p, t, side) => {
      const c = chest(p), f = fwd(p.yaw), r = right(p.yaw);
      const lens = add(c, [r, 4.2 * side], [f, 0.8], [[0, 1, 0], -0.25]);
      return clear(lens, c) ? { lens, aim: add(c, [f, 1.2]), fov: 36 } : null;
    },
    front: (p, t, side) => {
      const c = chest(p), f = fwd(p.yaw), r = right(p.yaw);
      const lens = add(c, [f, 3.6], [r, 1.4 * side], [[0, 1, 0], -0.45]);
      return clear(lens, c) ? { lens, aim: add(c, [[0, 1, 0], 0.1]), fov: 44 } : null;
    },
    orbit: (p, t, side, t0) => {
      const c = chest(p), a = p.yaw + side * (1.2 + (t - t0) * 0.22);
      const lens = add(c, [fwd(a), 6], [[0, 1, 0], 1.6]);
      return clear(lens, c) ? { lens, aim: c, fov: 40 } : null;
    },
    low: (p, t, side) => {
      const c = chest(p), f = fwd(p.yaw), r = right(p.yaw);
      const lens = add([p.position[0], p.position[1] + 0.35, p.position[2]], [f, -2.6], [r, 1.1 * side]);
      return clear(lens, c) ? { lens, aim: add(head(p), [f, 6], [[0, 1, 0], 0.6]), fov: 52 } : null;
    },
  };

  /**
   * The director: follows a player who is in a fight, a new one (and a new setup) every 'segment' seconds,
   * or soon after its subject falls. Logs each cut to state.cuts. opts: { segment, styles, avoid (ids) }.
   */
  const director = (t, state, opts = {}) => {
    const dt = state.lastT === undefined ? 1 / 60 : Math.max(1e-3, t - state.lastT);
    state.lastT = t;
    const all = players();
    state.fired ??= {};
    state.shot ??= {};
    for (const p of all) {
      const i = p.weapon?.shotIndex ?? 0;
      if (state.shot[p.id] !== undefined && state.shot[p.id] !== i) state.fired[p.id] = t;
      state.shot[p.id] = i;
    }
    const segment = opts.segment ?? 4.5;
    const styles = opts.styles ?? ['front', 'profile', 'orbit', 'low', 'front', 'profile', 'shoulder'];
    let cur = state.id ? all.find((p) => p.id === state.id) : null;
    if (cur && !cur.alive && state.deadAt === undefined) state.deadAt = t;
    // Someone else opens fire while this subject has gone quiet: cut to them.
    const quiet = cur && (state.fired[cur.id] === undefined || t - state.fired[cur.id] > 2.5);
    const opener = quiet && t - state.t0 > 2.2 && all.some((p) => p.alive && p.id !== cur.id && !(opts.avoid ?? []).includes(p.id) && state.fired[p.id] !== undefined && t - state.fired[p.id] < 0.3);
    const due = !cur || t >= state.segEnd || opener || (state.deadAt !== undefined && t - state.deadAt > 1.4);
    if (due) {
      const live = all.filter((p) => p.alive && !(opts.avoid ?? []).includes(p.id));
      const scored = live.map((p) => {
        const foes = live.filter((q) => q.team !== p.team || p.team === undefined);
        const foe = foes.reduce((a, q) => (!a || flat(q.position, p.position) < flat(a.position, p.position) ? q : a), null);
        const d = foe ? flat(foe.position, p.position) : 99;
        const sees = foe ? clear(head(p), head(foe)) : false;
        const recent = state.fired[p.id] !== undefined && t - state.fired[p.id] < 1.2;
        return { p, s: (d < 30 ? 2 : 0) + (sees && d < 40 ? 3 : 0) + (recent ? 4 : 0) - d * 0.03 - (p.id === state.id ? 6 : 0) - (state.recent?.includes(p.id) ? 2 : 0) };
      }).sort((a, b) => b.s - a.s);
      state.style = ((state.styleIndex = ((state.styleIndex ?? -1) + 1) % styles.length), styles[state.styleIndex]);
      state.side = state.side === 1 ? -1 : 1;
      for (const { p } of scored) {
        const order = [state.style, ...styles.filter((s) => s !== state.style)];
        const ok = order.find((s) => setups[s](p, t, state.side, t));
        if (ok) { cur = p; state.style = ok; break; }
      }
      if (!cur) cur = scored[0]?.p ?? null;
      state.id = cur?.id;
      state.recent = [cur?.id, ...(state.recent ?? [])].slice(0, 3);
      state.t0 = t;
      state.segEnd = t + segment;
      state.deadAt = undefined;
      state.lens = undefined;
      state.aim = undefined;
      (state.cuts ??= []).push({ t, id: cur?.id, style: state.style, weapon: cur?.weapon?.id });
    }
    if (!cur) return state.last ?? null;
    const foe = all.filter((q) => q.alive && q.team !== cur.team).reduce((a, q) => (!a || flat(q.position, cur.position) < flat(a.position, cur.position) ? q : a), null);
    (state.frames ??= []).push([Math.round(t * 1000) / 1000, cur.id, state.fired[cur.id] === t ? 1 : 0, foe ? Math.round(flat(foe.position, cur.position)) : -1, cur.alive ? 1 : 0, all.filter((p) => state.fired[p.id] === t).length]);
    const shot = setups[state.style](cur, t, state.side, state.t0) ?? setups.shoulder(cur, t, state.side, state.t0) ?? { lens: state.lens ?? head(cur), aim: chest(cur), fov: 45 };
    const lens = smooth(state, 'lens', shot.lens, dt, 5);
    const aim = smooth(state, 'aim', shot.aim, dt, 7);
    const cam = handheld(at(lens, aim, shot.fov), t, 0.006, (state.cuts?.length ?? 0) * 1.7);
    state.last = cam;
    return cam;
  };

  globalThis.C = { lerp, mix, ease, easeOut, easeIn, look, at, spline, move, sway, handheld, players, byId, flat, nearest, smooth, ray, clear, fwd, right, add, chest, head, setups, director };
})()`;
