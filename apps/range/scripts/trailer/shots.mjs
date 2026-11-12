// The trailer's shots, for capture.mjs. Each shot:
//   params   extra URL parameters (the map behind the menu, a match length)
//   setup    async (page) => {}: menus, a match, real-time seconds for the bots to spread out
//   camera   the source of a page-side function (t, game, state) => { position, yaw, pitch, roll?, fov? } | null,
//            called every frame on the virtual clock (t in seconds from the shot's first frame); null is the player's view
//   drive    async (page, t) => {}: optional, per frame, before the frame is drawn (keys, the mouse)
//   seconds, fps, preroll, ui (true keeps the HUD)
// Yaw 0 looks down -Z; positive pitch looks up.
import { fileURLToPath } from 'node:url';

/** Opens the main menu's Bot Match on a map and mode, and waits until it plays. */
async function botMatch(page, map, mode = 'Team deathmatch', teams = ['Mixed teams']) {
  for (const p of ['Bot Match', map, mode, ...teams, 'Start']) {
    if (!(await page.click(p))) throw new Error(`no "${p}" button`);
    await page.sleep(300);
  }
  if (!(await page.waitFor(`duty.game.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('the match did not start');
}

const REPO = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\\/g, '/');
const MAP_IDS = { Switchyard: 'switchyard', 'Survival Town': 'survival-town', 'Station Nine': 'station-nine' };

/** The bots' routes on the page, as globalThis.__nav: the map's nav graph (as the route worker builds it) and A*. */
async function loadNav(page, map) {
  const id = MAP_IDS[map];
  if (!id) throw new Error(`no map id for ${map}`);
  const ok = await page.js(`(async () => {
    const { mapRoutes } = await import('/@fs/${REPO}apps/range/src/map/routes-worker.ts');
    const { findPath } = await import('/@fs/${REPO}packages/fps-core/src/bots/nav.ts');
    const graph = mapRoutes(${JSON.stringify(id)});
    globalThis.__nav = graph ? { graph, findPath } : null;
    return !!graph;
  })()`);
  if (!ok) throw new Error(`${map} has no nav graph`);
}

/** Hides the menu over a map, for shots of the map alone. */
async function mapOnly(page) {
  await page.js('duty.menu.hide()');
  await page.sleep(3000);
}

/** A location scout: each [from, to, fov] pose held half a second (TAA settles), at 20 frames a second; the last frame of each is the still. */
function scout(params, setup, poses) {
  return {
    params,
    setup,
    fps: 20,
    preroll: 1,
    seconds: poses.length * 0.5,
    camera: `(t) => { const p = ${JSON.stringify(poses)}[Math.max(0, Math.min(${poses.length - 1}, Math.floor(t / 0.5 + 1e-6)))]; return C.at(p[0], p[1], p[2] ?? 45); }`,
  };
}

/** Coverage of a Bot Match: real-time seconds for the bots to meet, then the director's cuts on the virtual clock. */
function coverage(map, { seconds = 40, warm = 20, mode, teams, params = '', segment = 4.5, styles } = {}) {
  return {
    params,
    seconds,
    preroll: 1,
    async setup(page) {
      await botMatch(page, map, mode, teams);
      await page.sleep(warm * 1000);
    },
    camera: `(t, game, state) => C.director(t, state, ${JSON.stringify({ segment, styles, avoid: ['p1'] })})`,
  };
}

/**
 * A match's last minute and its ending: the director through the last seconds (the warning-lamp light, the siren),
 * then the game's own ending shot (the nuke, the train) once the match is over.
 */
function finale(map, { matchtime = 75, warm = 22, seconds = 72, segment = 4 } = {}) {
  return {
    params: `matchtime=${matchtime}`,
    seconds,
    preroll: 1,
    async setup(page) {
      await botMatch(page, map);
      await page.sleep(warm * 1000);
    },
    camera: `(t, game, state) => (duty.game.driver?.match?.phase === 'playing' ? C.director(t, state, ${JSON.stringify({ segment, avoid: ['p1'] })}) : ((state.endedAt ??= t), null))`,
  };
}

/**
 * The player's own eyes: a scripted player who follows the nearest teammate and, with an enemy in sight within
 * `range` m, turns to them on a damped aim (no snap), aims down sights and fires once on target; `chase` keeps
 * walking at them (a shotgun's range). The page-side steer runs every frame on the virtual clock.
 */
const steer = ({ range = 40, chase = 0 }) => `(() => {
  const g = duty.game, d = g.driver, me = g.player, s = (globalThis.__steer ??= { yawV: 0, pitchV: 0 });
  // Dead: the turn starts again from rest after the respawn.
  if (!me || !me.alive || !d) return ((s.yawV = s.pitchV = 0), (s.at = null), { walk: false, fire: false, ads: false, sprint: false });
  const others = d.others(0).filter((p) => p.kind === 'player' && p.alive);
  const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
  const foes = others.filter((p) => p.team !== me.team).map((p) => ({ p, d: C.flat(p.position, me.position), at: [p.position[0], p.position[1] + p.eyeHeight * 0.82, p.position[2]] }))
    .filter((f) => f.d < ${range} && C.clear(eye, f.at)).sort((a, b) => a.d - b.d);
  const foe = foes[0] ?? null;
  // Follow the teammate nearest the enemy (the front), so the player is drawn to the fight.
  const enemies = others.filter((p) => p.team !== me.team);
  const front = (p) => Math.min(999, ...enemies.map((e) => C.flat(e.position, p.position)));
  const mates = others.filter((p) => p.team === me.team).sort((a, b) => front(a) - front(b));
  // To the leader by the bots' own routes (__nav, loaded by loadNav), worked out again every half second: from the
  // nearest node in clear sight to the node nearest them. The player heads for the furthest node of the route
  // within 9 m still in sight, so corners are cut only where nothing is in the way.
  const now = performance.now() / 1000;
  const sight = (q) => C.clear(eye, [q[0], q[1] + 1.2, q[2]]);
  const m = mates[0];
  const nav = globalThis.__nav;
  if (m && nav && !(now - (s.routedAt ?? -9) < 0.5)) {
    s.routedAt = now;
    const nodes = nav.graph.nodes;
    const near = (p, seen) => {
      let best = -1, bd = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].escape) continue;
        const q = nodes[i].position, dd = C.flat(q, p) + Math.abs(q[1] - p[1]) * 3;
        if (dd < bd && (!seen || (dd < 12 && sight(q)))) { bd = dd; best = i; }
      }
      return best;
    };
    const from = near(me.position, true), to = near(m.position, false);
    s.route = from >= 0 && to >= 0 ? (nav.findPath(nav.graph, from, to) ?? []).map((i) => nodes[i].position) : [];
  }
  let path = null;
  for (const q of s.route ?? []) {
    if (C.flat(q, eye) > 9) break;
    if (C.flat(q, eye) > 1.2 && sight(q)) path = q;
  }
  const ahead = path ?? (s.route ?? []).find((q) => C.flat(q, eye) > 1.2) ?? m?.position ?? null;
  // Caught up with the leader: look where they look (at the threat), not at the wall beside them.
  const idle = !!m && C.flat(m.position, me.position) <= 4;
  const watch = idle ? [m.position[0] - Math.sin(m.yaw) * 20, eye[1], m.position[2] - Math.cos(m.yaw) * 20] : null;
  const goal = foe ? foe.at : watch ?? (ahead ? [ahead[0], eye[1], ahead[2]] : null);
  // Stuck against something for a second while walking: jump (a fence, a step), as a player would.
  if (!(now - (s.mark?.t ?? -9) < 1)) {
    s.jump = !!s.mark && s.mark.walk && C.flat(s.mark.p, me.position) < 0.4;
    s.mark = { t: now, p: [...me.position], walk: !!s.walking };
  } else s.jump = false;
  const look = g.input.angles;
  if (!goal) return { walk: false, fire: false, ads: false, sprint: false };
  const want = C.look(eye, goal);
  // The view is the mouse's angles plus the simulation's recoil and flinch: aim the view, pulling down against the kick.
  const kickYaw = Math.atan2(Math.sin(me.yaw - look.yaw), Math.cos(me.yaw - look.yaw)), kickPitch = me.pitch - look.pitch;
  let dy = want.yaw - kickYaw - look.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const dp = (foe ? want.pitch : 0) - kickPitch - look.pitch;
  // A critically damped spring toward the target, a little slower without a foe: a person's turn, not a snap.
  const w = foe ? 11 : 4, h = s.at === null || s.at === undefined ? 1 / 60 : Math.min(0.1, Math.max(1e-3, now - s.at));
  s.at = now;
  s.yawV += (w * w * dy - 2 * w * s.yawV) * h;
  s.pitchV += (w * w * dp - 2 * w * s.pitchV) * h;
  g.input.setAngles(look.yaw + s.yawV * h, look.pitch + s.pitchV * h);
  const err = Math.hypot(dy, dp);
  const far = mates[0] ? C.flat(mates[0].position, me.position) : 0;
  const closing = !!foe && foe.d > ${chase} && ${chase} > 0;
  // Reload on an empty magazine, or a low one with no one in sight.
  const ammo = me.weapon.ammo, reload = me.weapon.action !== 'reload' && (ammo === 0 || (!foe && ammo <= 4));
  const walk = (!foe && far > 4) || closing;
  s.walking = walk;
  return { walk, sprint: !foe && far > 12, jump: s.jump, fire: !!foe && err < 0.035 && ammo > 0, ads: !!foe && err < 0.4, reload, dist: foe?.d ?? 0 };
})()`;

/**
 * A Bot Match through the player's eyes, HUD and all. `loadout` is the player's (Loadout in fps-core); `pulse`
 * presses the trigger once per shot for guns that aren't full auto.
 */
function firstPerson(map, { seconds = 30, warm = 12, params = '', loadout, range, chase, pulse = false, mode } = {}) {
  const STEER = steer({ range, chase });
  return {
    params,
    seconds,
    preroll: 0.5,
    ui: true,
    settings: loadout ? { loadout: { grenade: 'frag', tactical: 'smoke', perk: null, ...loadout } } : undefined,
    async setup(page) {
      await botMatch(page, map, mode);
      await loadNav(page, map);
      await page.sleep(warm * 1000);
    },
    camera: null,
    async drive(page, t) {
      const want = await page.js(STEER);
      const held = (page.held ??= { walk: false, sprint: false, fire: false, ads: false, pressed: false, n: 0 });
      if (want.walk !== held.walk) await page.key(want.walk ? 'keyDown' : 'keyUp', 'KeyW');
      if (want.sprint !== held.sprint && want.sprint) {
        await page.key('keyDown', 'ShiftLeft', 'Shift');
        await page.key('keyUp', 'ShiftLeft', 'Shift');
      }
      if (want.ads !== held.ads) await page.mouse(want.ads ? 'mousePressed' : 'mouseReleased', 'right');
      if (want.reload) {
        await page.key('keyDown', 'KeyR');
        await page.key('keyUp', 'KeyR');
      }
      if (want.jump) {
        await page.key('keyDown', 'Space', ' ');
        await page.key('keyUp', 'Space', ' ');
      }
      // Once the match is over the game's own ending plays: without the result and scoreboard over it.
      if (!held.over && (await page.js(`duty.game.driver?.match?.phase !== 'playing'`))) {
        held.over = true;
        await page.js(`(() => { const s = document.createElement('style'); s.textContent = 'body *:not(canvas) { visibility: hidden !important; } canvas { visibility: visible !important; }'; document.head.append(s); })()`);
      }
      // Semi-automatics are pressed for two frames in every eight; full auto is held up close, and fired in
      // short bursts past 12 m, as a player keeps the kick down.
      const press = want.fire && (pulse ? held.n++ % 8 < 2 : want.dist < 12 || held.n++ % 20 < 11);
      if (!want.fire) held.n = 0;
      if (press !== held.pressed) await page.mouse(press ? 'mousePressed' : 'mouseReleased', 'left');
      Object.assign(held, want, { pressed: press });
    },
  };
}

/**
 * A map's ending (the nuke, the train) played on the bare map through Game.previewEnding, under a camera of
 * our own: `offset` is the ending's time at the shot's first frame. Before that the ending isn't on.
 */
function ending(map, camera, { offset = 0, seconds = 10, fps = 60 } = {}) {
  return {
    params: `map=${map}`,
    setup: mapOnly,
    seconds,
    fps,
    preroll: 0.5,
    camera: `(t, game, state) => { game.previewEnding = t < 0 ? null : t + ${offset}; return (${camera})(t, game, state); }`,
  };
}

const TOWN_GZ = [420, 0, -160];
const STATION_GZ = [430, 0, -260];

export const SHOTS = {
  // The mannequin out by the vehicles, facing the camera, the test site's ground zero over its shoulder.
  'nuke-mannequin': ending('survival-town', `(t) => {
    const m = [8.6, 0, 4.7], gz = ${JSON.stringify(TOWN_GZ)};
    const d = [gz[0] - m[0], gz[2] - m[2]], n = Math.hypot(d[0], d[1]), u = [d[0] / n, d[1] / n];
    const back = 2.6 - t * 0.04;
    const lens = [m[0] - u[0] * back - u[1] * 0.7, 0.75, m[2] - u[1] * back + u[0] * 0.7];
    // Tilting up after the cloud as it climbs, from the horizon to about 24 degrees.
    const up = C.ease(Math.min(1, Math.max(0, (t - 2.2) / 7))) * 0.42;
    return C.at(lens, [m[0] + u[0] * 60, 1.6 + Math.tan(up) * 60, m[2] + u[1] * 60], 52);
  }`, { offset: 0.6, seconds: 12, fps: 120 }),
  // Across the town from the west: the houses and the water tower in silhouette against the flash.
  'nuke-wide': ending('survival-town', `(t) => C.move(t, 12, [[-78, 4, 52], [-74, 4.5, 49]], [[60, 6, -10], [70, 70, -20]], [34, 36])`, { offset: 0.8, seconds: 12 }),
  // Station Nine's tower shot from the shot tower's foot.
  'nuke-station': ending('station-nine', `(t) => C.move(t, 12, [[-4, 1.3, -24], [-5, 1.6, -22]], [[${STATION_GZ[0]}, 30, ${STATION_GZ[2]}], [${STATION_GZ[0]}, 110, ${STATION_GZ[2]}]], 40)`, { offset: 0.8, seconds: 12 }),
  // Low by the main line, looking east up it: the train's lamps come on out of the dusk and it fills the lens.
  'train-low': ending('switchyard', `(t) => C.at([-8, 0.55, -29.4], [70, 2.2, -34.2], 28)`, { offset: 0, seconds: 9, fps: 120 }),
  // From the long lane over the barrier, panning with it.
  'train-wide': ending('switchyard', `(t) => C.move(t, 8, [[6, 4.5, -18], [-6, 5.5, -17]], [[60, 2.5, -34], [-40, 3, -34]], 55)`, { offset: 1.5, seconds: 8 }),
  'fp-yard': firstPerson('Switchyard'),
  'fp-town': firstPerson('Survival Town'),
  // The gameplay trailer's takes: one gun per map, the player's own HUD.
  'gp-yard': firstPerson('Switchyard', { seconds: 40, loadout: { primary: 'm4a1', secondary: 'pistol' } }),
  'gp-town': firstPerson('Survival Town', { seconds: 40, warm: 8, loadout: { primary: 'shotgun', secondary: 'revolver' }, range: 26, chase: 7, pulse: true }),
  'gp-station': firstPerson('Station Nine', { seconds: 40, loadout: { primary: 'sniper', secondary: 'pistol' }, range: 70, pulse: true }),
  'gp-lmg': firstPerson('Station Nine', { seconds: 30, loadout: { primary: 'lmg', secondary: 'pistol' } }),
  // The last minute and the nuke through the player's eyes: a 90 s match from 63 s left, past T minus sixty to the ending.
  'gp-finale': {
    ...firstPerson('Survival Town', { seconds: 74, params: 'matchtime=90', loadout: { primary: 'smg', secondary: 'pistol' } }),
    async setup(page) {
      await botMatch(page, 'Survival Town');
      await loadNav(page, 'Survival Town');
      if (!(await page.waitFor('(() => { const d = duty.game.driver, m = d?.match; return !!m && m.phaseEnds - d.serverTime < 63; })()', 120_000))) throw new Error('no last minute');
    },
  },
  'finale-town': finale('Survival Town'),
  'finale-yard': finale('Switchyard'),
  'cover-yard': coverage('Switchyard'),
  'cover-town': coverage('Survival Town'),
  'cover-station': coverage('Station Nine', { seconds: 32 }),
  'scout-town': scout('map=survival-town', mapOnly, [
    [[20, 1.2, -4], [-5, 2, 6], 40],
    [[-2, 1.6, 4], [3, 3, 24], 50],
    [[10, 12, -10], [0, 1, 8], 45],
    [[-25, 1.7, 2], [10, 1.5, 2], 40],
    [[-60, 6, -40], [0, 4, 5], 30],
    [[-30, 34, 0], [0, 0, 2], 50],
    [[6, 0.6, 14], [-6, 2.5, 26], 55],
    [[30, 3, 25], [0, 3, 10], 35],
  ]),
  'scout-yard': scout('map=switchyard', mapOnly, [
    [[-45, 0.6, -8], [0, 1.5, -5], 40],
    [[-40, 1.7, -20.5], [40, 1.7, -20.5], 35],
    [[0, 40, 50], [0, 0, 0], 50],
    [[-5, 2, 14.5], [10, 2, 14.5], 60],
    [[15, 1, -2], [23.5, 6, -10], 50],
    [[55, 15, 10], [0, 0, -5], 40],
    [[-20, 1.6, -3], [20, 1.6, -3], 45],
    [[0, 6, -40], [0, 2, 0], 45],
  ]),
  'scout-station': scout('map=station-nine', mapOnly, [
    [[-10, 1.5, -15], [0, 10, -40], 50],
    [[-20, 0.5, -20.5], [0, 0, -20.5], 50],
    [[-15, 6, 8], [0, 1, -2], 45],
    [[-12, 2, 20], [5, 1, 15], 50],
    [[0, 38, 46], [0, 0, 0], 50],
    [[30, 3, 30], [-10, 4, -10], 40],
    [[19.3, 7, -24.2], [-5, 0, 0], 50],
    [[-37, 1.7, -4.5], [0, 2, -4.5], 40],
  ]),
  'test-orbit': {
    params: 'map=survival-town',
    setup: mapOnly,
    seconds: 3,
    camera: `(t) => {
      const a = 0.6 + t * 0.12;
      const r = 38;
      const p = [Math.sin(a) * r, 9, Math.cos(a) * r];
      return { position: p, yaw: a, pitch: -0.18, fov: 40 };
    }`,
  },
};

export { botMatch, mapOnly };
