import { zoneCentre, type HitPose, type HitZone } from '../combat/hitboxes';
import { segmentSolid } from '../combat/projectiles';
import { angleDelta, anglesOf, DEG, type Vec3 } from '../math';
import { hashString, noise } from '../random';
import { TICK_SECONDS, type PlayerId, type PlayerOutput, type SimEvent } from '../simulation';
import { Button, usercmd, type ButtonName, type UserCmd } from '../usercmd';
import type { World } from '../world';
import { findPath, linkKind, nearestNode, type NavGraph } from './nav';
import type { BotProfile } from './profile';

/** What a bot knows each tick: the latest simulation output, as the server has it. */
export interface BotView {
  readonly tick: number;
  /** Simulation time (s). */
  readonly time: number;
  readonly self: PlayerOutput;
  /** Everyone in the match, the bot included. */
  readonly players: readonly PlayerOutput[];
  /** The latest tick's events. */
  readonly events: readonly SimEvent[];
  /** Whether `other` is on the other side (any other player in free-for-all). */
  isEnemy(other: PlayerOutput): boolean;
}

/** Sight is checked this often (ticks), not every tick. */
const PERCEIVE_TICKS = 6;
const SIGHT_RANGE = 70;
/** Half the field of view a bot notices enemies in; a target already fought is tracked wider. */
const FOV = 62 * DEG;
const TRACK_FOV = 100 * DEG;
/** Enemies this close are noticed whichever way the bot faces (footsteps, the rustle of a body). */
const SENSE = 3.5;
const HEARING = 40;
/** Seconds a sighting or a noise is worth chasing. */
const MEMORY = 6;
/** Seconds a target can be out of sight before the bot stops shooting at where it was. */
const LOSE_TARGET = 0.6;
/** How fast aim error settles (s). */
const SETTLE = 0.35;
/** Turning while not fighting (rad/s). */
const LOOK_RATE = 200 * DEG;
/** Fraction of the remaining turn made each second (easing, before the rate cap). */
const EASE = 16;

interface Sighting {
  readonly position: Vec3;
  readonly time: number;
  readonly seen: boolean;
}

interface Engagement {
  readonly id: PlayerId;
  /** When the bot starts aiming (it has noticed, and reacted). */
  readonly react: number;
  readonly zone: HitZone;
  errYaw: number;
  errPitch: number;
  visible: boolean;
  lastSeen: number;
  /** Crouch to shoot at range in this fight. */
  readonly crouch: boolean;
  /** Firing until, then paused until (bursts at range). */
  burstUntil: number;
  pauseUntil: number;
}

const pose = (p: PlayerOutput): HitPose => ({ position: p.position, yaw: p.yaw, stance: p.stance, eyeHeight: p.eyeHeight });
const eyeOf = (p: PlayerOutput): Vec3 => [p.position[0], p.position[1] + p.eyeHeight, p.position[2]];
const flat = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2]);
const yawTo = (a: Vec3, b: Vec3) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));

/** True when glass-free sight from `a` to `b` is blocked: walls, roofs and cars hide, windows don't. */
function sightBlocked(world: World, a: Vec3, b: Vec3): boolean {
  return (
    world.bullets.firstHit(a, b, (i) => {
      const s = world.solids[i]!;
      return s.prop === null && s.material !== 'glass' ? segmentSolid(a, b, s) : null;
    }) !== null
  );
}

/**
 * One bot: reads the match the way a player would (what's in its view and
 * in line of sight, what it hears, what hits it) and produces a usercmd per
 * tick, through the same simulation as everyone else. It roams the nav
 * graph, fights what it sees with a human reaction time and imperfect aim,
 * chases what it last saw or heard, sometimes holds an angle, and reloads
 * when things are quiet. Deterministic for a given name and match.
 */
export class Bot {
  readonly id: PlayerId;
  readonly profile: BotProfile;
  readonly #nav: NavGraph;
  readonly #world: World;
  readonly #seed: number;
  /** The usercmd angles last sent; the view adds recoil and flinch on top. */
  #yaw = 0;
  #pitch = 0;
  /** Where the bot means its view to point. */
  #lookYaw = 0;
  #lookPitch = 0;
  /** How much recoil and flinch the bot has pulled back so far: it follows the real offset a moment behind, like a hand on a mouse. */
  #compYaw = 0;
  #compPitch = 0;
  #alive = false;
  #lastPos: Vec3 = [0, 0, 0];
  #path: number[] = [];
  #step = 0;
  /** Where the route was planned from (the start of its first leg). */
  #from: Vec3 = [0, 0, 0];
  #goal: number | null = null;
  #recentGoals: number[] = [];
  /** A goal given by {@link goTo}, taken up at the next roaming decision. */
  #ordered: number | null = null;
  #chasing: PlayerId | null = null;
  #replanAt = 0;
  readonly #memory = new Map<PlayerId, Sighting>();
  #target: Engagement | null = null;
  #lastEnemySeen = -Infinity;
  /** Turn toward where a hit came from, until then. */
  #alert: { position: Vec3; until: number } | null = null;
  #strafe = 0;
  #strafeUntil = 0;
  #holdUntil = 0;
  #holdYaw = 0;
  #holdCrouch = false;
  #slideUntil = 0;
  #tactical = false;
  #progress: { position: Vec3; time: number } = { position: [0, 0, 0], time: 0 };
  #blocked = 0;
  /** Backing off and sidestepping to get unstuck, until then. */
  #unstickUntil = 0;
  #unstickSide = 1;
  #lastButtons = 0;
  #meleeAt = 0;
  #lastTime = 0;

  constructor(id: PlayerId, profile: BotProfile, nav: NavGraph, world: World) {
    this.id = id;
    this.profile = profile;
    this.#nav = nav;
    this.#world = world;
    this.#seed = hashString(`${profile.name}:${id}`);
  }

  /** Sends the bot to the node nearest `position`, as its next roaming goal (scripted bots and tests). */
  goTo(position: Vec3): void {
    this.#ordered = nearestNode(this.#nav, this.#world, position);
    this.#goal = null;
    this.#holdUntil = 0;
  }

  /** Where the bot is heading: the route's nodes from the next one on. */
  get route(): readonly Vec3[] {
    return this.#path.slice(this.#step).map((i) => this.#nav.nodes[i]!.position);
  }

  /** The enemy the bot is fighting, if any, and whether it can see them right now (tests and debugging). */
  get target(): { readonly id: PlayerId; readonly visible: boolean } | null {
    return this.#target ? { id: this.#target.id, visible: this.#target.visible } : null;
  }

  /** What the bot is up to, for tests and debugging. */
  get activity(): 'fight' | 'chase' | 'hold' | 'roam' {
    if (this.#target) return 'fight';
    if (this.#chasing) return 'chase';
    return this.#holdUntil > this.#lastTime ? 'hold' : 'roam';
  }

  /** The bot's usercmd for this tick. */
  think(view: BotView): UserCmd {
    const { self, time } = view;
    this.#lastTime = time;
    const r = (n: number) => noise(this.#seed, view.tick, n);
    if (!self.alive) {
      this.#alive = false;
      this.#target = null;
      return this.#cmd(0, 0, []);
    }
    if (!this.#alive || flat(self.position, this.#lastPos) > 3) this.#reset(view);
    this.#alive = true;
    this.#lastPos = self.position;
    const eye = eyeOf(self);

    if ((view.tick + this.#seed) % PERCEIVE_TICKS === 0) this.#perceive(view, eye, r);
    this.#hear(view);

    // The fight: keep it while the target lives and was seen moments ago.
    let target = this.#target;
    const tp = target ? view.players.find((p) => p.id === target!.id) : undefined;
    if (target && (!tp || !tp.alive || (!target.visible && time - target.lastSeen > LOSE_TARGET))) {
      this.#target = target = null;
    }
    const fighting = target !== null && tp !== undefined && time >= target.react;
    const range = tp ? flat(self.position, tp.position) : Infinity;

    // Where to look.
    // The view is the usercmd plus recoil and flinch; follow that offset, a little late.
    const follow = 1 - Math.exp(-TICK_SECONDS / (0.03 + 0.25 * (1 - this.profile.recoilControl)));
    this.#compYaw += (angleDelta(this.#yaw, self.yaw) - this.#compYaw) * follow;
    this.#compPitch += (self.pitch - this.#pitch - this.#compPitch) * follow;
    let lookYaw = this.#lookYaw;
    let lookPitch = this.#lookPitch;
    let rate = LOOK_RATE;
    let ads = false;
    let fire = false;
    const buttons: ButtonName[] = [];
    if (fighting && target && tp) {
      // Out of sight for a moment: keep aiming where it was last seen.
      const last = this.#memory.get(tp.id)?.position ?? tp.position;
      const point: Vec3 = target.visible ? zoneCentre(pose(tp), target.zone) : [last[0], last[1] + 1.4, last[2]];
      const aim = anglesOf([point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]]);
      const settle = Math.exp(-TICK_SECONDS / SETTLE);
      const wobble = this.profile.aimError * 0.25;
      target.errYaw = target.errYaw * settle + wobble * Math.sin(time * 1.9 + (this.#seed % 7)) * (1 - settle);
      target.errPitch = target.errPitch * settle + wobble * 0.6 * Math.sin(time * 2.3 + (this.#seed % 5)) * (1 - settle);
      lookYaw = aim.yaw + target.errYaw;
      lookPitch = aim.pitch + target.errPitch;
      rate = this.profile.turnRate;
      ads = range > 9 && self.movement !== 'sprint' && self.movement !== 'tacticalSprint';
      if (target.visible) {
        // Fire once the view (with recoil) is where the bot means to aim, to within the body's width.
        const off = Math.hypot(angleDelta(self.yaw, aim.yaw + target.errYaw), self.pitch - (aim.pitch + target.errPitch));
        const tolerance = Math.atan2(0.32, Math.max(range, 1)) + (ads ? 0.4 : 1.2) * DEG;
        // Sight is checked a few times a second; a shot checks it again, so a target that just stepped behind cover isn't shot through it.
        const clear = () => !sightBlocked(this.#world, eye, zoneCentre(pose(tp), 'head')) || !sightBlocked(this.#world, eye, zoneCentre(pose(tp), 'upperTorso'));
        if (off < tolerance && self.weapon.ammo > 0 && clear()) {
          if (range > 22) {
            if (time >= target.pauseUntil && time >= target.burstUntil) {
              target.burstUntil = time + 0.22 + 0.25 * r(11);
              target.pauseUntil = target.burstUntil + 0.18 + 0.2 * r(12);
            }
            fire = time < target.burstUntil;
          } else fire = true;
        }
        if (range < 1.6 && time >= this.#meleeAt) {
          buttons.push('Melee');
          this.#meleeAt = time + 0.8;
        }
      }
    } else if (this.#alert && time < this.#alert.until) {
      lookYaw = yawTo(eye, this.#alert.position);
      lookPitch = 0;
    } else if (time < this.#holdUntil) {
      lookYaw = this.#holdYaw + 0.45 * Math.sin(time * 0.9 + (this.#seed % 11));
      lookPitch = -0.04;
    } else {
      const ahead = this.#lookAhead(self.position);
      const chase = this.#chasing ? this.#memory.get(this.#chasing) : undefined;
      if (chase && flat(self.position, chase.position) < 18) {
        lookYaw = yawTo(eye, chase.position);
        lookPitch = anglesOf([chase.position[0] - eye[0], chase.position[1] + 1.4 - eye[1], chase.position[2] - eye[2]]).pitch;
      } else if (ahead) {
        lookYaw = yawTo(self.position, ahead);
        lookPitch = Math.max(-0.35, Math.min(0.35, Math.atan2(ahead[1] - self.position[1], Math.max(1, flat(self.position, ahead))))) - 0.03;
      }
    }
    this.#turn(lookYaw, lookPitch, rate);

    // Where to go.
    let move: Vec3 | null = null;
    if (fighting && target && tp) {
      const want = 8 + (1 - this.profile.aggression) * 14;
      if (!target.visible || range > want + 4) move = this.#follow(view, this.#memory.get(tp.id)?.position ?? tp.position, tp.id);
      if (time >= this.#strafeUntil) {
        this.#strafe = r(13) < 0.15 ? 0 : r(14) < 0.5 ? -1 : 1;
        this.#strafeUntil = time + 0.4 + 0.8 * r(15);
      }
      if (target.crouch && range > 14 && !move) buttons.push('Crouch');
    } else {
      const chase = this.#chasing ? this.#memory.get(this.#chasing) : undefined;
      if (chase && time - chase.time < MEMORY) {
        move = this.#follow(view, chase.position, this.#chasing!);
        if (flat(self.position, chase.position) < 2) {
          this.#memory.delete(this.#chasing!);
          this.#chasing = null;
        }
      } else if (time >= this.#holdUntil) {
        move = this.#roam(view, r);
      } else if (this.#holdCrouch) buttons.push('Crouch');
    }

    // Steering: the move direction in the bot's own frame.
    let forward = 0;
    let right = fighting ? this.#strafe * (ads ? 1 : 0.8) : 0;
    const climbing = move !== null && this.#nextLink() === 'climb';
    if (move) {
      const dir = yawTo(self.position, move);
      const d = angleDelta(self.yaw, dir);
      const dist = flat(self.position, move);
      const k = dist < 0.6 ? 0.5 : 1;
      forward = Math.cos(d) * k;
      right = fighting ? Math.max(-1, Math.min(1, right * 0.6 - Math.sin(d) * k)) : -Math.sin(d) * k;
      const speed = Math.hypot(self.velocity[0], self.velocity[2]);
      this.#blocked = speed < 0.5 && self.movement !== 'mantle' && self.movement !== 'airborne' ? this.#blocked + 1 : 0;
      // Sprint the long legs when nothing's in sight; slide now and then.
      const long = this.#remaining(self.position) > 7;
      if (!fighting && long && forward > 0.8 && !climbing) {
        buttons.push('Sprint');
        if (this.#tactical) buttons.push('TacticalSprint');
        if (self.movement === 'sprint' && time > this.#slideUntil + 3 && r(16) < 0.004) this.#slideUntil = time + 0.5;
      }
      if (time < this.#slideUntil) buttons.push('Crouch');
      if (climbing && this.#blocked >= 2 && !(this.#lastButtons & Button.Jump)) buttons.push('Jump');
      this.#stuck(view, r);
      if (time < this.#unstickUntil) {
        forward = -0.4;
        right = this.#unstickSide;
      }
    } else {
      this.#blocked = 0;
      this.#progress = { position: self.position, time };
    }

    // Reload in a quiet moment, or when empty.
    const w = self.weapon;
    if (w.action === 'ready' && ((w.ammo < 12 && !fighting && time - this.#lastEnemySeen > 1) || w.ammo === 0) && !(this.#lastButtons & Button.Reload)) buttons.push('Reload');

    if (ads) buttons.push('Ads');
    if (fire) buttons.push('Fire');
    return this.#cmd(forward, right, buttons);
  }

  #cmd(forward: number, right: number, buttons: ButtonName[]): UserCmd {
    const cmd = usercmd({ forward, right, yaw: this.#yaw, pitch: this.#pitch, buttons });
    this.#lastButtons = cmd.buttons;
    return cmd;
  }

  /** Fresh life (or a teleport, at match start): forget the route and the fight, face where the spawn faces. */
  #reset(view: BotView): void {
    this.#yaw = this.#lookYaw = view.self.yaw;
    this.#pitch = this.#lookPitch = 0;
    this.#compYaw = this.#compPitch = 0;
    this.#path = [];
    this.#goal = null;
    this.#target = null;
    this.#chasing = null;
    this.#alert = null;
    this.#holdUntil = 0;
    this.#progress = { position: view.self.position, time: view.time };
    this.#tactical = false;
  }

  /** Eases the usercmd angles toward a look direction, no faster than `rate`. */
  #turn(yaw: number, pitch: number, rate: number): void {
    const max = rate * TICK_SECONDS;
    const ease = 1 - Math.exp(-EASE * TICK_SECONDS);
    const dy = angleDelta(this.#lookYaw, yaw);
    const dp = pitch - this.#lookPitch;
    const step = (d: number) => Math.sign(d) * Math.min(Math.abs(d), Math.max(Math.abs(d) * ease, 0.4 * DEG), max);
    this.#lookYaw += step(dy);
    this.#lookPitch = Math.max(-1.4, Math.min(1.4, this.#lookPitch + step(dp)));
    this.#yaw = this.#lookYaw - this.#compYaw;
    this.#pitch = this.#lookPitch - this.#compPitch;
  }

  /** What the bot can see: living enemies in its view and line of sight. Picks or keeps the one to fight. */
  #perceive(view: BotView, eye: Vec3, r: (n: number) => number): void {
    const { self, time } = view;
    let best: { p: PlayerOutput; score: number } | null = null;
    let keep = false;
    for (const p of view.players) {
      if (p.id === self.id || !p.alive || !view.isEnemy(p)) continue;
      const d = flat(self.position, p.position);
      if (d > SIGHT_RANGE) continue;
      const off = Math.abs(angleDelta(self.yaw, yawTo(eye, eyeOf(p))));
      const tracked = this.#target?.id === p.id;
      if (d > SENSE && off > (tracked ? TRACK_FOV : FOV)) continue;
      const head = zoneCentre(pose(p), 'head');
      const chest = zoneCentre(pose(p), 'upperTorso');
      if (sightBlocked(this.#world, eye, head) && sightBlocked(this.#world, eye, chest)) continue;
      this.#memory.set(p.id, { position: p.position, time, seen: true });
      this.#lastEnemySeen = time;
      if (tracked) keep = true;
      const score = d + off * 12;
      if (!best || score < best.score) best = { p, score };
    }
    const target = this.#target;
    if (target) {
      if (keep) {
        target.visible = true;
        target.lastSeen = time;
      } else target.visible = false;
    }
    if ((!target || (!keep && best)) && best) {
      const d = flat(self.position, best.p.position);
      const off = Math.abs(angleDelta(self.yaw, yawTo(eye, eyeOf(best.p))));
      const e = this.profile.aimError * (1 + Math.min(d, 40) / 40);
      this.#target = {
        id: best.p.id,
        react: time + this.profile.reaction * (0.85 + 0.35 * r(1)) + (off > 20 * DEG ? 0.12 : 0),
        zone: r(2) < this.profile.headshots ? 'head' : 'upperTorso',
        errYaw: (r(3) - 0.5) * 2 * e,
        errPitch: (r(4) - 0.5) * 1.2 * e,
        visible: true,
        lastSeen: time,
        crouch: r(5) < 0.3,
        burstUntil: 0,
        pauseUntil: 0,
      };
      this.#chasing = best.p.id;
      this.#holdUntil = 0;
    }
  }

  /** Gunfire nearby, and hits taken, give away where enemies are. */
  #hear(view: BotView): void {
    const { self, time } = view;
    for (const e of view.events) {
      if (e.type === 'shot' && e.shooter !== self.id) {
        const shooter = view.players.find((p) => p.id === e.shooter);
        if (!shooter || !view.isEnemy(shooter) || flat(self.position, e.origin) > HEARING) continue;
        const known = this.#memory.get(e.shooter);
        if (!known || !known.seen || time - known.time > 1) this.#memory.set(e.shooter, { position: shooter.position, time, seen: false });
        if (!this.#target && !this.#chasing) this.#chasing = e.shooter;
      } else if (e.type === 'hit' && e.victim === self.id && e.shooter !== self.id) {
        const shooter = view.players.find((p) => p.id === e.shooter);
        if (!shooter) continue;
        this.#memory.set(e.shooter, { position: shooter.position, time, seen: false });
        if (!this.#target) {
          this.#alert = { position: eyeOf(shooter), until: time + 1.2 };
          this.#chasing = e.shooter;
          this.#holdUntil = 0;
        }
      } else if (e.type === 'kill') {
        this.#memory.delete(e.victim);
        if (this.#target?.id === e.victim) this.#target = null;
        if (this.#chasing === e.victim) this.#chasing = null;
      }
    }
  }

  /** The next point along the route to `goal` (a moving one is re-planned now and then). */
  #follow(view: BotView, goal: Vec3, key: PlayerId): Vec3 | null {
    const { self, time } = view;
    if (this.#chasing !== key || time >= this.#replanAt || this.#step >= this.#path.length) {
      this.#chasing = key;
      this.#replanAt = time + 1;
      this.#plan(self.position, nearestNode(this.#nav, this.#world, goal), view);
    }
    return this.#advance(self, goal);
  }

  /** Wandering: a fresh goal when the last one is reached, sometimes holding an angle there first. */
  #roam(view: BotView, r: (n: number) => number): Vec3 | null {
    const { self, time } = view;
    if (this.#goal !== null && this.#step >= this.#path.length) {
      this.#goal = null;
      if (r(21) < (1 - this.profile.aggression) * 0.6) {
        this.#holdUntil = time + 1.5 + 2.5 * r(22);
        this.#holdYaw = this.#holdFacing(self.position);
        this.#holdCrouch = r(23) < 0.3;
        return null;
      }
    }
    if (this.#goal === null) {
      this.#goal = this.#ordered ?? this.#pickGoal(view, r);
      this.#ordered = null;
      this.#plan(self.position, this.#goal, view);
    }
    return this.#advance(self, this.#nav.nodes[this.#goal]!.position);
  }

  /** Somewhere worth going: a fair walk away, toward recent noise, away from teammates and recent goals. */
  #pickGoal(view: BotView, r: (n: number) => number): number {
    const { self, time } = view;
    const nodes = this.#nav.nodes;
    const mates = view.players.filter((p) => p.id !== self.id && p.alive && !view.isEnemy(p));
    const noises = [...this.#memory.values()].filter((m) => time - m.time < 15);
    // Now and then a rough idea of where an enemy is (as a player reads footsteps and the kill feed), so nobody can hide for good.
    const enemies = view.players.filter((p) => p.alive && view.isEnemy(p));
    let hunch: Vec3 | null = null;
    if (enemies.length > 0 && r(90) < 0.35 + 0.4 * this.profile.aggression) {
      const e = enemies[Math.floor(r(91) * enemies.length)]!.position;
      const angle = r(92) * Math.PI * 2;
      const off = 3 + r(93) * 8;
      hunch = [e[0] + Math.cos(angle) * off, e[1], e[2] + Math.sin(angle) * off];
    }
    const candidates = Array.from({ length: 16 }, (_, k) => Math.floor(r(30 + k) * nodes.length));
    if (hunch) candidates.push(nearestTo(nodes, hunch));
    let best = 0;
    let bestScore = -Infinity;
    for (const [k, i] of candidates.entries()) {
      const p = nodes[i]!.position;
      const d = flat(self.position, p);
      let score = -Math.abs(d - 24) * 0.6 + r(60 + k) * 12;
      if (hunch && flat(hunch, p) < 10) score += 20;
      for (const n of noises) if (flat(n.position, p) < 12) score += 14 * this.profile.aggression + 4;
      for (const m of mates) if (flat(m.position, p) < 7) score -= 12;
      if (this.#recentGoals.some((g) => flat(nodes[g]!.position, p) < 6)) score -= 18;
      if (p[1] > 2.5) score -= 3;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    this.#recentGoals = [best, ...this.#recentGoals].slice(0, 4);
    return best;
  }

  /** Which way to watch while holding: toward the last noise, else toward the middle of the map. */
  #holdFacing(at: Vec3): number {
    let latest: Sighting | null = null;
    for (const m of this.#memory.values()) if (!latest || m.time > latest.time) latest = m;
    if (latest) return yawTo(at, latest.position);
    const nodes = this.#nav.nodes;
    let cx = 0;
    let cz = 0;
    for (const n of nodes) {
      cx += n.position[0];
      cz += n.position[2];
    }
    return yawTo(at, [cx / nodes.length, 0, cz / nodes.length]);
  }

  /** A route from `from` to node `to`; a fresh one (not a retry when stuck) restarts the progress clock. */
  #plan(from: Vec3, to: number, view: BotView, fresh = true): void {
    const start = nearestNode(this.#nav, this.#world, from);
    const path = findPath(this.#nav, start, to) ?? [];
    this.#path = path;
    this.#step = 0;
    this.#from = from;
    if (fresh) this.#progress = { position: from, time: view.time };
    this.#tactical = noise(this.#seed, view.tick, 40) < 0.25;
  }

  /** Moves along the route past nodes already reached; the point to head for now, or null at the end. */
  #advance(self: PlayerOutput, goal: Vec3): Vec3 | null {
    const nodes = this.#nav.nodes;
    while (this.#step < this.#path.length) {
      const n = nodes[this.#path[this.#step]!]!;
      const next = this.#step + 1 < this.#path.length ? linkKind(this.#nav, this.#path[this.#step]!, this.#path[this.#step + 1]!) : null;
      const radius = n.precise || next === 'climb' ? 0.3 : 0.9;
      const reached = flat(self.position, n.position) < radius && Math.abs(self.position[1] - n.position[1]) < 0.8 && self.movement !== 'mantle';
      if (!reached) break;
      this.#step += 1;
    }
    if (this.#step < this.#path.length) {
      // Head for a point a little ahead on the leg itself, so the bot keeps to the line the nav graph checked (through a doorway, up the stairs).
      const b = nodes[this.#path[this.#step]!]!;
      const a = this.#step > 0 ? nodes[this.#path[this.#step - 1]!]! : null;
      const from = a?.position ?? this.#from;
      if (this.#nextLink() === 'climb') return b.position;
      const dx = b.position[0] - from[0];
      const dz = b.position[2] - from[2];
      const len = Math.hypot(dx, dz);
      if (len < 0.1) return b.position;
      const t = ((self.position[0] - from[0]) * dx + (self.position[2] - from[2]) * dz) / (len * len);
      const lead = b.precise || a?.precise ? 0.5 : 1.2;
      const k = Math.min(1, Math.max(0, t) + lead / len);
      return [from[0] + dx * k, b.position[1], from[2] + dz * k];
    }
    // Past the last node: the last few metres straight at the goal, if it's close.
    return flat(self.position, goal) > 0.5 && flat(self.position, goal) < 3 ? goal : null;
  }

  #nextLink(): string | null {
    if (this.#step === 0 || this.#step >= this.#path.length) return null;
    return linkKind(this.#nav, this.#path[this.#step - 1]!, this.#path[this.#step]!);
  }

  /** A point a little ahead along the route, to look at while moving. */
  #lookAhead(from: Vec3): Vec3 | null {
    const nodes = this.#nav.nodes;
    for (let i = this.#step; i < this.#path.length; i++) {
      const p = nodes[this.#path[i]!]!.position;
      if (flat(from, p) > 3 || i === this.#path.length - 1) return [p[0], p[1] + 1.5, p[2]];
    }
    return null;
  }

  /** Route length left (m). */
  #remaining(from: Vec3): number {
    const nodes = this.#nav.nodes;
    let total = 0;
    let at = from;
    for (let i = this.#step; i < this.#path.length; i++) {
      const p = nodes[this.#path[i]!]!.position;
      total += flat(at, p);
      at = p;
    }
    return total;
  }

  /** When the bot has barely moved for a while: back off a step to one side and find the way again; after longer, go somewhere else. */
  #stuck(view: BotView, r: (n: number) => number): void {
    const { self, time } = view;
    if (flat(self.position, this.#progress.position) > 0.6 || Math.abs(self.position[1] - this.#progress.position[1]) > 0.5) {
      this.#progress = { position: self.position, time };
      return;
    }
    const still = time - this.#progress.time;
    if (still > 1.2 && time >= this.#unstickUntil + 0.6) {
      this.#unstickUntil = time + 0.45;
      this.#unstickSide = r(50) < 0.5 ? -1 : 1;
      if (this.#goal !== null) this.#plan(self.position, this.#goal, view, false);
      else this.#replanAt = 0;
    }
    if (still > 4) {
      this.#goal = this.#pickGoal(view, r);
      this.#chasing = null;
      this.#plan(self.position, this.#goal, view);
    }
  }
}

/** The node nearest `p` in plan, a little against height differences. */
function nearestTo(nodes: NavGraph['nodes'], p: Vec3): number {
  let best = 0;
  let bestD = Infinity;
  for (const [i, n] of nodes.entries()) {
    const d = flat(n.position, p) + Math.abs(n.position[1] - p[1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
