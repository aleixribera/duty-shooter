import { STATS, hitBody, raycastWorld, type HitPose, type TeamId, type Vec3, type WeaponId, type World } from '@duty-shooter/fps-core';
import { attribute, cameraPosition, clamp, dot, float, max, min, mx_noise_float, positionWorld, uv, vec2, vec3 } from 'three/tsl';
import { horizonColor, skyZenith, sunColor, sunDir } from './surface-materials';
import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, MeshBasicNodeMaterial, NormalBlending, PlaneGeometry, type Camera, type Scene } from 'three/webgpu';

/** Someone a bullet can stop in: a pose for the hitboxes, and who they are. */
export interface TracerBody extends HitPose {
  readonly id: string;
  readonly team: TeamId;
  readonly alive: boolean;
}

/** Who fired, so a tracer passes through them and, in a team mode (`team` not null), through their teammates. */
export interface TracerShooter {
  readonly id: string;
  readonly team: TeamId | null;
}

/** A point this module writes into (a {@link Vec3} is read-only). */
type Point = [number, number, number];

export interface FlightEnd {
  /** Seconds after leaving the muzzle. */
  time: number;
  point: Point;
}

const G = STATS.weapon.projectileGravity.value;
/** World tested in steps this long along the flight (m). */
const STEP = 25;
/** A body further than this from the path where it passes is not tested (m). */
const BODY_NEAR = 2.5;

const sa: Point = [0, 0, 0];
const sb: Point = [0, 0, 0];

function along(out: Point, eye: Vec3, dir: Vec3, speed: number, t: number): Point {
  const s = speed * t;
  out[0] = eye[0] + dir[0] * s;
  out[1] = eye[1] + dir[1] * s - 0.5 * G * t * t;
  out[2] = eye[2] + dir[2] * s;
  return out;
}

/**
 * Where a bullet fired from `eye` along `dir` at `speed` stops, as the
 * simulation flies it: the same gravity drop, the same world test, and the
 * hitboxes of the bodies as drawn (lag compensation makes those what the
 * server tests). Teammates in a team mode and the shooter don't stop it.
 */
export function flightEnd(
  world: World,
  eye: Vec3,
  dir: Vec3,
  speed: number,
  bodies: readonly TracerBody[],
  shooter: TracerShooter | null,
  maxRange: number,
  out: FlightEnd = { time: 0, point: [0, 0, 0] },
  /** One more body outside the list (you, among the others). */
  extra: TracerBody | null = null,
): FlightEnd {
  const tMax = maxRange / speed;
  let tBody = Infinity;
  for (let k = 0; k <= bodies.length; k++) {
    const b = k < bodies.length ? (bodies[k] as TracerBody) : extra;
    if (!b) continue;
    if (!b.alive || (shooter && (b.id === shooter.id || (shooter.team !== null && b.team === shooter.team)))) continue;
    const cx = b.position[0] - eye[0];
    const cy = b.position[1] + 0.9 - eye[1];
    const cz = b.position[2] - eye[2];
    const s = cx * dir[0] + cy * dir[1] + cz * dir[2];
    if (s < -BODY_NEAR || s / speed > tMax) continue;
    const ts = Math.max(0, s / speed);
    along(sa, eye, dir, speed, ts);
    if (Math.hypot(sa[0] - b.position[0], sa[1] - b.position[1] - 0.9, sa[2] - b.position[2]) > BODY_NEAR) continue;
    const t0 = Math.max(0, ts - BODY_NEAR / speed);
    const t1 = ts + BODY_NEAR / speed;
    const hit = hitBody(b, along(sa, eye, dir, speed, t0), along(sb, eye, dir, speed, t1));
    if (hit) tBody = Math.min(tBody, t0 + hit.t * (t1 - t0));
  }
  const stop = Math.min(tBody, tMax);
  const step = STEP / speed;
  for (let t0 = 0; t0 < stop; t0 += step) {
    const t1 = Math.min(t0 + step, stop);
    const hit = raycastWorld(world, along(sa, eye, dir, speed, t0), along(sb, eye, dir, speed, t1));
    if (hit) {
      out.time = t0 + hit.t * (t1 - t0);
      out.point[0] = hit.point[0];
      out.point[1] = hit.point[1];
      out.point[2] = hit.point[2];
      return out;
    }
  }
  out.time = stop;
  along(out.point, eye, dir, speed, stop);
  return out;
}

/** Live tracers at once; a burst beyond it takes the oldest slot. */
const TRACERS = 192;
/** Smoke trail pieces at once. */
const SMOKE = 640;
/** The streak's length in seconds of flight: about 6 m for a rifle round. */
const STREAK_SECONDS = 0.01;
/** The muzzle's offset from the eye is gone after this much of the flight (m), or half of a short one. */
const CONVERGE = 20;
/** Screen width of a streak, as a share of its distance: about 3 px at 1080p, the glow's soft edge included. */
const WIDTH_PER_METRE = 0.0034;
const MIN_WIDTH = 0.008;
/** A sniper's smoke: pieces along the path, at most this many per shot. */
const SMOKE_PIECES = 72;
const SMOKE_PIECE = 3;
/** A smoke piece's width (m) as it is laid, and what it spreads to by the end of its life. */
const SMOKE_BORN = 0.04;
const SMOKE_SPREAD = 0.55;
/** How long a smoke piece hangs in the air (s): this, plus up to SMOKE_LIFE_JITTER. */
const SMOKE_LIFE = 1.7;
const SMOKE_LIFE_JITTER = 0.4;
/** The air the smoke drifts on (m/s): a dusk breeze, and the warm trail rising. */
const WIND: Vec3 = [0.32, 0.16, 0.14];
/** How bright each kind of shot's tracer is: shotgun pellets dimmer, many at once. */
const BRIGHT: Readonly<Record<WeaponId, number>> = { m4a1: 1, smg: 0.85, shotgun: 0.45, sniper: 1, pistol: 0.75, lmg: 1, dmr: 1, burst: 1, revolver: 0.85 };

/** The quad's columns from tail `t` to head `h`, turned to face the camera, `w` wide. */
function writeQuad(m: Float32Array, o: number, h: Vec3, t: Vec3, w: number, cx: number, cy: number, cz: number): void {
  const ax = h[0] - t[0];
  const ay = h[1] - t[1];
  const az = h[2] - t[2];
  const mx = (h[0] + t[0]) / 2;
  const my = (h[1] + t[1]) / 2;
  const mz = (h[2] + t[2]) / 2;
  const vx = cx - mx;
  const vy = cy - my;
  const vz = cz - mz;
  let sx = ay * vz - az * vy;
  let sy = az * vx - ax * vz;
  let sz = ax * vy - ay * vx;
  let sl = Math.hypot(sx, sy, sz);
  if (sl < 1e-9) {
    // Seen end on: any side will do.
    sx = 0;
    sy = 1;
    sz = 0;
    sl = 1;
  }
  const k = w / sl;
  sx *= k;
  sy *= k;
  sz *= k;
  let nx = sy * az - sz * ay;
  let ny = sz * ax - sx * az;
  let nz = sx * ay - sy * ax;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  m[o] = sx;
  m[o + 1] = sy;
  m[o + 2] = sz;
  m[o + 3] = 0;
  m[o + 4] = ax;
  m[o + 5] = ay;
  m[o + 6] = az;
  m[o + 7] = 0;
  m[o + 8] = nx;
  m[o + 9] = ny;
  m[o + 10] = nz;
  m[o + 11] = 0;
  m[o + 12] = mx;
  m[o + 13] = my;
  m[o + 14] = mz;
  m[o + 15] = 1;
}

/**
 * A smoke piece from `a` to `b`, `w` wide, as a quad in the screen's plane:
 * along the piece as seen, and never shorter than its width, so seen end on
 * (down the line it was fired along) it is a round puff rather than nothing.
 * The quad runs `w / 2` past each end, so neighbours overlap into one plume.
 * Returns the share of its length taken by each rounded end.
 */
function writePuff(m: Float32Array, o: number, a: Vec3, b: Vec3, w: number, cx: number, cy: number, cz: number): number {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const mz = (a[2] + b[2]) / 2;
  let vx = mx - cx;
  let vy = my - cy;
  let vz = mz - cz;
  const vl = Math.hypot(vx, vy, vz) || 1;
  vx /= vl;
  vy /= vl;
  vz /= vl;
  const ax = b[0] - a[0];
  const ay = b[1] - a[1];
  const az = b[2] - a[2];
  const d = ax * vx + ay * vy + az * vz;
  // The piece as seen: its part across the view.
  let px = ax - d * vx;
  let py = ay - d * vy;
  let pz = az - d * vz;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-6) {
    // Exactly end on: any direction across the view.
    px = -vz;
    py = 0;
    pz = vx;
    pl = Math.hypot(px, pz);
    if (pl < 1e-6) {
      px = 1;
      pz = 0;
      pl = 1;
    }
    px /= pl;
    py = 0;
    pz /= pl;
    pl = 0;
  } else {
    px /= pl;
    py /= pl;
    pz /= pl;
  }
  const length = pl + w;
  // Across: the view crossed with the piece.
  let sx = vy * pz - vz * py;
  let sy = vz * px - vx * pz;
  let sz = vx * py - vy * px;
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx *= w / sl;
  sy *= w / sl;
  sz *= w / sl;
  m[o] = sx;
  m[o + 1] = sy;
  m[o + 2] = sz;
  m[o + 3] = 0;
  m[o + 4] = px * length;
  m[o + 5] = py * length;
  m[o + 6] = pz * length;
  m[o + 7] = 0;
  m[o + 8] = -vx;
  m[o + 9] = -vy;
  m[o + 10] = -vz;
  m[o + 11] = 0;
  m[o + 12] = mx;
  m[o + 13] = my;
  m[o + 14] = mz;
  m[o + 15] = 1;
  return (0.5 * w) / length;
}

function layer(max: number, material: MeshBasicNodeMaterial, name: string): { mesh: InstancedMesh; alpha: InstancedBufferAttribute } {
  const geometry = new PlaneGeometry(1, 1);
  const alpha = new InstancedBufferAttribute(new Float32Array(max), 1);
  alpha.setUsage(DynamicDrawUsage);
  geometry.setAttribute('tAlpha', alpha);
  const mesh = new InstancedMesh(geometry, material, max);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.name = name;
  return { mesh, alpha };
}

/**
 * Every bullet's tracer: a small bright streak flying the bullet's real path
 * at its muzzle velocity, from the muzzle you see (your viewmodel's, or a
 * soldier's) onto the eye's line the bullet really flies, so it lands on
 * the hit. A sniper round also leaves a thin trail of smoke that lingers and
 * drifts. Two instanced draws, fixed pools, nothing allocated per shot.
 */
export class Tracers {
  readonly streaks: InstancedMesh;
  readonly trails: InstancedMesh;
  readonly #streakAlpha: InstancedBufferAttribute;
  readonly #trailAlpha: InstancedBufferAttribute;
  readonly #trailCap: InstancedBufferAttribute;
  readonly #world: World;
  readonly #root: Scene;

  // One slot per tracer.
  readonly #live = new Uint8Array(TRACERS);
  readonly #drawn = new Uint8Array(TRACERS);
  readonly #sniper = new Uint8Array(TRACERS);
  readonly #shooter: string[] = new Array<string>(TRACERS).fill('');
  /** eye, direction, muzzle offset, landing correction, end: 3 each. */
  readonly #eye = new Float64Array(TRACERS * 3);
  readonly #dir = new Float64Array(TRACERS * 3);
  readonly #off = new Float64Array(TRACERS * 3);
  readonly #corr = new Float64Array(TRACERS * 3);
  readonly #end = new Float64Array(TRACERS * 3);
  readonly #age = new Float64Array(TRACERS);
  readonly #tEnd = new Float64Array(TRACERS);
  readonly #speed = new Float64Array(TRACERS);
  readonly #conv = new Float64Array(TRACERS);
  readonly #bright = new Float32Array(TRACERS);
  readonly #smokeT = new Float64Array(TRACERS);
  #next = 0;
  #flying = 0;
  #fired = 0;

  // One slot per smoke piece.
  readonly #sA = new Float32Array(SMOKE * 3);
  readonly #sB = new Float32Array(SMOKE * 3);
  readonly #sAge = new Float32Array(SMOKE);
  readonly #sLife = new Float32Array(SMOKE);
  readonly #sSeed = new Float32Array(SMOKE);
  #sNext = 0;
  #smoke = 0;

  readonly #h: Point = [0, 0, 0];
  readonly #t: Point = [0, 0, 0];
  readonly #flight: FlightEnd = { time: 0, point: [0, 0, 0] };
  readonly #shooterScratch: { id: string; team: TeamId | null } = { id: '', team: null };

  constructor(scene: Scene, world: World) {
    this.#world = world;
    this.#root = scene;
    const across = float(1).sub(uv().x.sub(0.5).abs().mul(2));
    // The streak: a hot white core in a warm glow, brightest at the head and fading back to the tail.
    const streak = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    streak.colorNode = vec3(1, 0.6, 0.28).mul(3.2).add(vec3(1, 0.92, 0.75).mul(across.pow(4).mul(4)));
    streak.opacityNode = across.pow(1.5).mul(uv().y.pow(1.2).mul(0.75).add(0.25)).mul(attribute<'float'>('tAlpha', 'float'));
    // The smoke: a soft rounded capsule per piece, overlapping its neighbours, made lumpy by noise fixed
    // in the world so the pieces join into one puffy plume. Lit by the map's sky, and by its sun most
    // when you look toward it (smoke scatters light forward), so a dusk trail glows warm.
    const smoke = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending });
    const cap = max(attribute<'float'>('tCap', 'float'), float(1e-3));
    const endward = clamp(cap.sub(min(uv().y, float(1).sub(uv().y))).div(cap), 0, 1);
    const r = vec2(uv().x.sub(0.5).mul(2), endward).length();
    const body = clamp(float(1).sub(r), 0, 1);
    const lumps = mx_noise_float(positionWorld.mul(1.7)).mul(0.55).add(mx_noise_float(positionWorld.mul(vec3(4.1, 5.3, 4.1))).mul(0.3));
    const puff = clamp(body.mul(1.9).add(lumps).sub(0.2), 0, 1);
    smoke.opacityNode = puff.mul(puff).mul(attribute<'float'>('tAlpha', 'float'));
    const look = positionWorld.sub(cameraPosition).normalize();
    const forward = clamp(dot(look, sunDir), 0, 1).pow(3);
    const shade = lumps.mul(0.35).add(0.85);
    smoke.colorNode = sunColor
      .mul(forward.mul(0.5).add(0.22))
      .add(horizonColor.mul(0.32))
      .add(skyZenith.mul(0.4))
      .mul(shade.mul(0.78));
    const s = layer(TRACERS, streak, 'tracers');
    const t = layer(SMOKE, smoke, 'tracer-smoke');
    this.#trailCap = new InstancedBufferAttribute(new Float32Array(SMOKE), 1);
    this.#trailCap.setUsage(DynamicDrawUsage);
    t.mesh.geometry.setAttribute('tCap', this.#trailCap);
    this.streaks = s.mesh;
    this.#streakAlpha = s.alpha;
    this.trails = t.mesh;
    this.#trailAlpha = t.alpha;
    this.streaks.renderOrder = 3;
    this.trails.renderOrder = 2;
    scene.add(this.streaks, this.trails);
  }

  /** Tracers in flight. */
  get flying(): number {
    return this.#flying;
  }

  /** Tracers fired since the start. */
  get fired(): number {
    return this.#fired;
  }

  /** Smoke pieces hanging in the air. */
  get smoke(): number {
    return this.#smoke;
  }

  /**
   * A bullet leaving `muzzle` (what you see) on the path the simulation flies
   * from `eye` along `direction`. `bodies` are the soldiers as drawn; the
   * shooter's team keeps it from stopping in a teammate (null without teams).
   */
  fire(shooter: string, weapon: WeaponId, eye: Vec3, direction: Vec3, muzzle: Vec3, bodies: readonly TracerBody[], team: TeamId | null, extra: TracerBody | null = null): void {
    const speed = STATS.weapons[weapon].handling.muzzleVelocity.value;
    const who = this.#shooterScratch;
    who.id = shooter;
    who.team = team;
    const end = flightEnd(this.#world, eye, direction, speed, bodies, who, STATS.weapon.projectileMaxRange.value, this.#flight, extra);
    let i = this.#next;
    for (let k = 0; k < TRACERS && this.#live[i]; k++) i = (i + 1) % TRACERS;
    this.#next = (i + 1) % TRACERS;
    if (!this.#live[i]) this.#flying += 1;
    this.#fired += 1;
    this.#live[i] = 1;
    this.#drawn[i] = 0;
    this.#sniper[i] = weapon === 'sniper' ? 1 : 0;
    this.#shooter[i] = shooter;
    const o = i * 3;
    for (let a = 0; a < 3; a++) {
      this.#eye[o + a] = eye[a] as number;
      this.#dir[o + a] = direction[a] as number;
      this.#off[o + a] = (muzzle[a] as number) - (eye[a] as number);
    }
    this.#age[i] = 0;
    this.#speed[i] = speed;
    this.#bright[i] = BRIGHT[weapon];
    this.#smokeT[i] = 0;
    this.#setEnd(i, end.time, end.point);
  }

  /**
   * The simulation says `shooter`'s bullet stopped at `point` (a hit or an
   * impact): the tracer of theirs whose line passes there lands on it.
   */
  land(shooter: string, point: Vec3): void {
    let best = -1;
    let bestMiss = 1.5;
    for (let i = 0; i < TRACERS; i++) {
      if (!this.#live[i] || this.#shooter[i] !== shooter) continue;
      const o = i * 3;
      const px = point[0] - (this.#eye[o] as number);
      const py = point[1] - (this.#eye[o + 1] as number);
      const pz = point[2] - (this.#eye[o + 2] as number);
      const s = px * (this.#dir[o] as number) + py * (this.#dir[o + 1] as number) + pz * (this.#dir[o + 2] as number);
      if (s <= 0) continue;
      const t = s / (this.#speed[i] as number);
      // Not yet past where it would land: it can still be moved there.
      if ((this.#age[i] as number) > t && this.#drawn[i]) continue;
      const drop = 0.5 * G * t * t;
      const miss = Math.hypot(px - (this.#dir[o] as number) * s, py + drop - (this.#dir[o + 1] as number) * s, pz - (this.#dir[o + 2] as number) * s);
      if (miss < bestMiss) {
        bestMiss = miss;
        best = i;
      }
    }
    if (best < 0) return;
    const o = best * 3;
    const s = Math.hypot(point[0] - (this.#eye[o] as number), point[1] - (this.#eye[o + 1] as number), point[2] - (this.#eye[o + 2] as number));
    this.#setEnd(best, s / (this.#speed[best] as number), point);
  }

  #setEnd(i: number, time: number, point: Vec3): void {
    const o = i * 3;
    this.#tEnd[i] = time;
    const speed = this.#speed[i] as number;
    this.#conv[i] = Math.max(1e-3, Math.min(CONVERGE, 0.5 * speed * time));
    // The eye's path ends a little off `point` (the simulation's steps, or a hit that moved it): the correction grows along the flight so it lands there exactly.
    const s = speed * time;
    const drop = 0.5 * G * time * time;
    for (let a = 0; a < 3; a++) {
      this.#end[o + a] = point[a] as number;
      this.#corr[o + a] = (point[a] as number) - ((this.#eye[o + a] as number) + (this.#dir[o + a] as number) * s - (a === 1 ? drop : 0));
    }
  }

  /** Where tracer `i` is `t` seconds out. */
  #at(i: number, t: number, out: Point): Point {
    const o = i * 3;
    const speed = this.#speed[i] as number;
    const s = speed * t;
    const tEnd = this.#tEnd[i] as number;
    let k = Math.max(0, 1 - s / (this.#conv[i] as number));
    k *= k;
    const f = tEnd > 0 ? Math.min(1, t / tEnd) : 1;
    const c = f * f;
    out[0] = (this.#eye[o] as number) + (this.#dir[o] as number) * s + (this.#off[o] as number) * k + (this.#corr[o] as number) * c;
    out[1] = (this.#eye[o + 1] as number) + (this.#dir[o + 1] as number) * s - 0.5 * G * t * t + (this.#off[o + 1] as number) * k + (this.#corr[o + 1] as number) * c;
    out[2] = (this.#eye[o + 2] as number) + (this.#dir[o + 2] as number) * s + (this.#off[o + 2] as number) * k + (this.#corr[o + 2] as number) * c;
    if (t >= tEnd) {
      out[0] = this.#end[o] as number;
      out[1] = this.#end[o + 1] as number;
      out[2] = this.#end[o + 2] as number;
    }
    return out;
  }

  update(dt: number, camera: Camera): void {
    const cam = camera.matrixWorld.elements;
    const cx = cam[12] as number;
    const cy = cam[13] as number;
    const cz = cam[14] as number;
    const m = this.streaks.instanceMatrix.array as Float32Array;
    const alpha = this.#streakAlpha.array as Float32Array;
    const h = this.#h;
    const tl = this.#t;
    let n = 0;
    if (this.#flying > 0) {
      for (let i = 0; i < TRACERS; i++) {
        if (!this.#live[i]) continue;
        const speed = this.#speed[i] as number;
        const tEnd = this.#tEnd[i] as number;
        const length = STREAK_SECONDS;
        let age = (this.#age[i] as number) + dt;
        // Every tracer shows at least once, however long the frame.
        if (!this.#drawn[i]) age = Math.min(age, tEnd + length * 0.5);
        this.#age[i] = age;
        if (age - length >= tEnd) {
          this.#live[i] = 0;
          this.#flying -= 1;
          continue;
        }
        const headT = Math.min(age, tEnd);
        const tailT = Math.max(0, age - length);
        this.#at(i, headT, h);
        this.#at(i, tailT, tl);
        if (this.#sniper[i]) this.#trail(i, headT, speed, tEnd);
        const dist = Math.hypot((h[0] + tl[0]) / 2 - cx, (h[1] + tl[1]) / 2 - cy, (h[2] + tl[2]) / 2 - cz);
        writeQuad(m, n * 16, h, tl, Math.max(MIN_WIDTH, dist * WIDTH_PER_METRE), cx, cy, cz);
        // Fades in over its first metres out of the muzzle, so it never starts as a blot on the gun.
        alpha[n] = (this.#bright[i] as number) * Math.min(1, (speed * headT) / 3);
        this.#drawn[i] = 1;
        n += 1;
      }
    }
    this.streaks.count = n;
    if (n > 0) {
      this.streaks.instanceMatrix.needsUpdate = true;
      this.#streakAlpha.needsUpdate = true;
    }
    this.#updateSmoke(dt, cx, cy, cz);
  }

  /** Lays smoke pieces along tracer `i`'s path up to `headT`. */
  #trail(i: number, headT: number, speed: number, tEnd: number): void {
    const piece = Math.max(SMOKE_PIECE, (speed * tEnd) / SMOKE_PIECES) / speed;
    let from = this.#smokeT[i] as number;
    while (from < headT && (from + piece <= headT || headT >= tEnd)) {
      const to = Math.min(from + piece, tEnd);
      this.#at(i, from, this.#h);
      this.#at(i, to, this.#t);
      const j = this.#sNext;
      this.#sNext = (j + 1) % SMOKE;
      if (this.#sLife[j] === 0 || (this.#sAge[j] as number) >= (this.#sLife[j] as number)) this.#smoke += 1;
      const o = j * 3;
      for (let a = 0; a < 3; a++) {
        this.#sA[o + a] = this.#h[a] as number;
        this.#sB[o + a] = this.#t[a] as number;
      }
      this.#sAge[j] = 0;
      this.#sLife[j] = SMOKE_LIFE + Math.random() * SMOKE_LIFE_JITTER;
      this.#sSeed[j] = Math.random() * Math.PI * 2;
      from = to;
    }
    this.#smokeT[i] = from;
  }

  #updateSmoke(dt: number, cx: number, cy: number, cz: number): void {
    const m = this.trails.instanceMatrix.array as Float32Array;
    const alpha = this.#trailAlpha.array as Float32Array;
    const caps = this.#trailCap.array as Float32Array;
    const a = this.#h;
    const b = this.#t;
    let n = 0;
    if (this.#smoke > 0) {
      for (let j = 0; j < SMOKE; j++) {
        const life = this.#sLife[j] as number;
        if (life === 0) continue;
        const age = (this.#sAge[j] as number) + dt;
        this.#sAge[j] = age;
        if (age >= life) {
          this.#sLife[j] = 0;
          this.#smoke -= 1;
          continue;
        }
        const u = age / life;
        const seed = this.#sSeed[j] as number;
        const o = j * 3;
        // Each end drifts on the wind and curls a little its own way, so the trail bends as it spreads.
        const curlA = Math.sin(seed + age * 1.7) * 0.18 * age;
        const curlB = Math.cos(seed * 1.3 + age * 1.4) * 0.18 * age;
        a[0] = (this.#sA[o] as number) + WIND[0] * age + curlA;
        a[1] = (this.#sA[o + 1] as number) + WIND[1] * age + Math.abs(curlB) * 0.4;
        a[2] = (this.#sA[o + 2] as number) + WIND[2] * age + curlB;
        b[0] = (this.#sB[o] as number) + WIND[0] * age + curlB;
        b[1] = (this.#sB[o + 1] as number) + WIND[1] * age + Math.abs(curlA) * 0.4;
        b[2] = (this.#sB[o + 2] as number) + WIND[2] * age + curlA;
        const dist = Math.hypot((a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy, (a[2] + b[2]) / 2 - cz);
        // It spreads fast at first, then slowly; far away it keeps a few pixels so it still reads.
        const spread = SMOKE_BORN + (SMOKE_SPREAD - SMOKE_BORN) * Math.sqrt(Math.min(1, age / 1.6));
        const width = Math.max(spread, dist * WIDTH_PER_METRE * 3);
        caps[n] = writePuff(m, n * 16, b, a, width, cx, cy, cz);
        // Thinner as it spreads (the same smoke over more air), gone at the end of its life, and faded right at
        // your eye so your own trail never fogs the scope.
        alpha[n] = Math.min(1, age * 25) * (SMOKE_BORN / spread) ** 0.2 * (1 - u) ** 0.4 * Math.min(1, Math.max(0, (dist - 0.6) / 2.5));
        n += 1;
      }
    }
    this.trails.count = n;
    if (n > 0) {
      this.trails.instanceMatrix.needsUpdate = true;
      this.#trailAlpha.needsUpdate = true;
      this.#trailCap.needsUpdate = true;
    }
  }

  /** Clears every tracer and trail (a new map, a new match). */
  clear(): void {
    this.#live.fill(0);
    this.#sLife.fill(0);
    this.#flying = 0;
    this.#smoke = 0;
    this.streaks.count = 0;
    this.trails.count = 0;
  }

  dispose(): void {
    this.#root.remove(this.streaks, this.trails);
    for (const mesh of [this.streaks, this.trails]) {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicNodeMaterial).dispose();
    }
  }
}
