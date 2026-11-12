// Page-side camera helpers for the trailer's shots. Injected after the game is up, as globalThis.cine.
(() => {
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (x) => {
    x = clamp(x);
    return x * x * (3 - 2 * x);
  };
  const smoother = (x) => {
    x = clamp(x);
    return x * x * x * (x * (x * 6 - 15) + 10);
  };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeIn = (x) => Math.pow(clamp(x), 3);
  const v = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    lerp: (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    flat: (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]),
  };
  /** Catmull-Rom through `pts` at u in [0, 1] (uniform over the points). */
  function spline(pts, u) {
    if (pts.length === 1) return pts[0];
    const n = pts.length - 1;
    const x = clamp(u) * n;
    const i = Math.min(n - 1, Math.floor(x));
    const f = x - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    const out = [];
    for (let k = 0; k < 3; k++) {
      const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
      out.push(0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f));
    }
    return out;
  }
  /** Yaw and pitch that look from `from` to `to` (yaw 0 looks down -Z). */
  function look(from, to) {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }
  function shot(position, target, fov = 40, roll = 0) {
    const { yaw, pitch } = look(position, target);
    return { position, yaw, pitch, roll, fov };
  }
  /** A hand-held drift: small, smooth, the same for the same t. */
  function shake(t, amount = 1, seed = 0) {
    const n = (f, p) => Math.sin(t * f + p + seed) * 0.5 + Math.sin(t * f * 2.3 + p * 1.7 + seed) * 0.3 + Math.sin(t * f * 5.1 + p * 0.3 + seed) * 0.2;
    return { yaw: n(0.9, 1.1) * 0.006 * amount, pitch: n(1.1, 2.7) * 0.005 * amount, roll: n(0.7, 4.2) * 0.004 * amount };
  }
  function handheld(s, t, amount = 1, seed = 0) {
    const h = shake(t, amount, seed);
    return { ...s, yaw: s.yaw + h.yaw, pitch: s.pitch + h.pitch, roll: s.roll + h.roll };
  }
  function players() {
    const g = duty.game, d = g.driver;
    if (!d) return [];
    const list = d.others(0).filter((p) => p.kind === 'player');
    const me = g.player;
    if (me && !list.some((p) => p.id === me.id)) list.push(me);
    return list;
  }
  function named(name) {
    const d = duty.game.driver;
    return players().find((p) => d.nameOf(p.id) === name) ?? null;
  }
  // Who is fighting: every gunshot the game plays, with where it came from (the rig feeds it).
  const gun = [];
  function noteShot(t, pos) {
    gun.push({ t, pos });
    if (gun.length > 600) gun.shift();
  }
  const eye = (p) => [p.position[0], p.position[1] + (p.eyeHeight ?? 1.6), p.position[2]];
  const byId = (id) => players().find((p) => p.id === id) ?? null;
  /** The shooter with most shots in the last `ms` (and within `area`, if given) and the nearest enemy in front of them. */
  function fight(ms = 2500, area = null) {
    const now = performance.now();
    const live = players().filter((p) => p.alive);
    const count = new Map();
    for (const g of gun) {
      if (now - g.t > ms) continue;
      let best = null, bd = 2.5;
      for (const p of live) {
        const d = v.len(v.sub(eye(p), g.pos));
        if (d < bd) (bd = d), (best = p);
      }
      if (best && (!area || area(best))) count.set(best.id, (count.get(best.id) ?? 0) + 1);
    }
    const ranked = [...count].sort((x, y) => y[1] - x[1]);
    for (const [id] of ranked) {
      const a = live.find((p) => p.id === id);
      const fwd = [-Math.sin(a.yaw), 0, -Math.cos(a.yaw)];
      let b = null, bd = 45;
      for (const p of live) {
        if (p.team === a.team && p.id !== a.id && duty.game.driver.match?.mode !== 'ffa') continue;
        if (p.id === a.id) continue;
        const d = v.sub(p.position, a.position);
        const dist = Math.hypot(d[0], d[2]);
        if (dist < bd && (d[0] * fwd[0] + d[2] * fwd[2]) / dist > 0.6) (bd = dist), (b = p);
      }
      if (b) return { a, b, shots: count.get(id) };
    }
    return null;
  }
  /** `want` pulled in toward `from` short of any wall between them. */
  function clear(from, want, margin = 0.3) {
    const h = duty.game.rayHit?.(from, want);
    if (h === null || h === undefined) return want;
    const L = v.len(v.sub(want, from)) || 1;
    return v.lerp(from, want, Math.max(0, h - margin / L));
  }
  /** Drops a subject that has been dead a while, so the camera finds the next fight. */
  function keepAlive(s, t) {
    const a = s.a ? byId(s.a) : null;
    if (a && a.alive) return (s.deadAt = undefined);
    s.deadAt ??= t;
    if (t - s.deadAt > 0.7) (s.a = undefined), (s.b = undefined), (s.deadAt = undefined);
  }
  /** Exponential follow toward `to`, frame-rate independent; state kept in `s[key]`. */
  function follow(s, key, to, rate, t) {
    const last = s[key];
    if (!last || s.lastT === undefined) return (s[key] = to.slice());
    const dt = Math.max(0, t - s.lastT);
    const k = 1 - Math.exp(-rate * dt);
    return (s[key] = last.map((x, i) => x + (to[i] - x) * k));
  }
  /**
   * Over the shoulder of whoever is firing, toward their target. Locks onto the pair it holds at t = 0.
   * opts: side (1 right, -1 left), back (m behind), up, fov, lead (how far toward the target the eye aims, 0..1), area(p).
   */
  function overShoulder(s, t, opts = {}) {
    const { side = 1, back = 2.3, up = 0.35, fov = 38, lead = 0.65, rate = 5, area = null } = opts;
    keepAlive(s, t);
    if (t < 0 || !s.a) {
      const f = fight(2500, area);
      if (f) (s.a = f.a.id), (s.b = f.b.id);
    }
    const a = s.a ? byId(s.a) : null;
    const b = s.b ? byId(s.b) : null;
    if (!a) return s.prev ?? shot([0, 30, 30], [0, 0, 0], 40);
    const ae = eye(a);
    const toward = b ? v.sub(eye(b), ae) : [-Math.sin(a.yaw), 0, -Math.cos(a.yaw)];
    const flat = Math.hypot(toward[0], toward[2]) || 1;
    const f = [toward[0] / flat, 0, toward[2] / flat];
    const r = [-f[2], 0, f[0]];
    const want = [ae[0] - f[0] * back + r[0] * 0.55 * side, ae[1] + up, ae[2] - f[2] * back + r[2] * 0.55 * side];
    const aim = b ? v.lerp(ae, eye(b), lead) : v.add(ae, v.scale(f, 10));
    const pos = follow(s, 'pos', clear(ae, want), rate, t);
    const at = follow(s, 'at', aim, rate * 0.8, t);
    s.lastT = t;
    return (s.prev = handheld(shot(pos, at, fov), t, 1.2, 3));
  }
  /** Beside a runner, tracking with them: picks the fastest live player (inside `area`) at t <= 0. */
  function tracking(s, t, opts = {}) {
    const { dist = 4, up = 0.2, fov = 34, ahead = 1.5, area = null, rate = 4, side = 1 } = opts;
    keepAlive(s, t);
    if (t < 0 || !s.a) {
      const fast = players().filter((p) => p.alive && (!area || area(p))).sort((x, y) => Math.hypot(y.velocity[0], y.velocity[2]) - Math.hypot(x.velocity[0], x.velocity[2]))[0];
      if (fast) s.a = fast.id;
    }
    const a = s.a ? byId(s.a) : null;
    if (!a) return s.prev ?? shot([0, 30, 30], [0, 0, 0], 40);
    const vel = [a.velocity[0], 0, a.velocity[2]];
    const sp = Math.hypot(vel[0], vel[2]);
    const dir = follow(s, 'dir', sp > 0.5 ? [vel[0] / sp, 0, vel[2] / sp] : [-Math.sin(a.yaw), 0, -Math.cos(a.yaw)], 2, t);
    const n = Math.hypot(dir[0], dir[2]) || 1;
    const f = [dir[0] / n, 0, dir[2] / n];
    const r = [-f[2], 0, f[0]];
    const ae = eye(a);
    const want = [ae[0] + r[0] * dist * side + f[0] * ahead, ae[1] - 0.6 + up, ae[2] + r[2] * dist * side + f[2] * ahead];
    const pos = follow(s, 'pos', clear(ae, want), rate, t);
    const at = follow(s, 'at', [ae[0] + f[0] * 0.8, ae[1] - 0.3, ae[2] + f[2] * 0.8], rate * 1.5, t);
    s.lastT = t;
    return (s.prev = handheld(shot(pos, at, fov), t, 1, 7));
  }
  globalThis.cine = { lerp, clamp, smooth, smoother, easeIn, easeOut, v, spline, look, shot, shake, handheld, players, named, noteShot, fight, follow, clear, overShoulder, tracking, eye, byId, gun };
})();
