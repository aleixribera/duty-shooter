import { moveGrenade, type Grenade, type GrenadeOutput } from '../combat/grenade';
import { zoneCentre, type HitPose, type HitZone } from '../combat/hitboxes';
import { sightBlocked } from '../combat/projectiles';
import { angleDelta, anglesOf, DEG, viewDirection, type Vec3 } from '../math';
import { hashString, noise } from '../random';
import { TICK_SECONDS, type PlayerId, type PlayerOutput, type SimEvent } from '../simulation';
import { STATS, type WeaponId } from '../stats';
import { Button, usercmd, type ButtonName, type UserCmd } from '../usercmd';
import type { World } from '../world';
import { LONG_SIGHTLINE, findPath, linkKind, nearestNode, type NavGraph } from './nav';
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
  /** Live grenades, as anyone could see them land; none when absent. */
  readonly grenades?: readonly GrenadeOutput[];
  /** Whether `other` is on the other side (any other player in free-for-all). */
  isEnemy(other: PlayerOutput): boolean;
  /** Where its team's planner sends it (a zone to take or hold), or null to roam freely. */
  readonly objective?: BotObjective | null;
  /** What a death costs: a few seconds ('respawn'), or the rest of the round ('round', as in Charge). 'respawn' when absent. */
  readonly lives?: 'respawn' | 'round';
  /**
   * The arcs left this tick for every bot's grenade aiming together, shared so
   * a tick where several bots aim at once stays short; each bot gets
   * `THROW_ARCS_PER_TICK` of its own when absent.
   */
  readonly budget?: ThinkBudget;
}

/** Work the bots of one tick share. */
export interface ThinkBudget {
  /** Grenade arcs left to simulate this tick. */
  arcs: number;
}

/** Grenade arcs a bot may simulate in a tick when no shared budget is given; a whole aim takes 27. */
export const THROW_ARCS_PER_TICK = 3;

/** A place a bot is sent to and stays in: a circle on the ground. */
export interface BotObjective {
  readonly position: Vec3;
  readonly radius: number;
  /** Once there, stand still holding use (to plant or defuse), unless an enemy is in view. */
  readonly use?: boolean;
  /** Hold use even with an enemy in view (the fuse is nearly out). */
  readonly urgent?: boolean;
  /** The clock is running out: no holding back. */
  readonly hurry?: boolean;
}

/** A bot sent to an objective chases a noise no farther than this (m) beyond its edge. */
const OBJECTIVE_LEASH = 12;

/** Sight is checked this often (ticks), not every tick. */
const PERCEIVE_TICKS = 6;
const SIGHT_RANGE = 70;
/** Half the field of view a bot notices enemies in; a target already fought is tracked wider. */
const FOV = 50 * DEG;
const TRACK_FOV = 85 * DEG;
/** Enemies this close are noticed whichever way the bot faces (footsteps, the rustle of a body). */
const SENSE = 3.5;
/** Gunfire is heard this far (m) in the open, and this far through walls, where it only gives a rough idea of where. */
const HEARING = 40;
const MUFFLED_HEARING = 22;
/** Footsteps carry this far (m) by gait; slower than `QUIET` (m/s), or in the air, they make none. */
const FOOTSTEPS = { sprint: 20, walk: 11, crouch: 4 } as const;
const QUIET = 1;
/** A landing, a slide or a mantle carries this far (m); a reload this far. */
const THUD = 14;
const RELOAD_HEARING = 15;
/** Through walls a footstep, thud or reload carries this share of the way, and gives only a rough idea of where. */
const MUFFLED = 0.55;
/** Arriving where a chased enemy should be and finding nobody, a bot searches about this long (s). */
const SEARCH = 1.5;
/** A teammate's death (or the bot's own) marks where the killer was, for this long (s), through respawns; this many at most. */
const DANGER_MEMORY = 25;
const DANGERS = 3;
/** A callout of a death is off by about this much (m), and a tenth of how far away it happened more. */
const CALLOUT_ERROR = 1.5;
/** A teammate's death this near (m) is close enough to trade. */
const TRADE_RANGE = 20;
/** Routes keep out of sight of a danger spot (or an enemy closed in on) this near (m). */
const DANGER_REACH = 40;
/** On the move, a danger spot in sight this near (m), within `CHECK_ARC` of the way, gets checked. */
const CHECK_RANGE = 30;
const CHECK_ARC = 75 * DEG;
/** Breaking off a fight to heal: under this much health, and this much more for a careful bot, while the enemy has more left. */
const HURT = 25;
const HURT_CAREFUL = 40;
/** Cover to heal in is out of the enemy's sight and a short dash away (m): a long run under fire is a shot in the back; a bot stays until healed (this long, s, at most), and doesn't break off again for a while (s). */
const SHELTER_SEARCH = 6;
const RECOVER_MAX = 12;
const RECOVER_PAUSE = 8;
/** Healed enough to fight on. */
const HEALED = 95;
/** Damage dealt to an enemy counts for this long (s): after it they've healed. */
const DEALT_MEMORY = 7;
/** A careful bot goes quietly (no sprinting) with an enemy known this near (m) this recently (s), and crouch-walks within `SNEAK` (m) of one it is after. */
const QUIET_RANGE = 25;
const QUIET_MEMORY = 10;
const SNEAK = 10;
/** A gun whose fighting band ends nearer than this (m) plays bolder. */
const CLOSE_RANGE = 15;
/** Once in a fight (an enemy seen this recently, s), speed beats silence. */
const SPOTTED = 4;
/** Seconds of a target's movement a bot remembers, for aiming a moment behind it. */
const TRAIL = 0.4;
/** Seconds a target can be out of sight before the bot stops shooting at where it was. */
const LOSE_TARGET = 0.6;
/** How fast aim error settles (s). */
const SETTLE = 0.35;
/** A target counts as moving steadily when its velocity over two spans this long (s) differs by under `STEADY_CHANGE` (m/s). */
const STEADY = 0.1;
const STEADY_CHANGE = 1.2;
/** Turning while not fighting (rad/s). */
const LOOK_RATE = 200 * DEG;
/** Fraction of the remaining turn made each second (easing, before the rate cap). */
const EASE = 16;

/**
 * How a bot fights with each weapon. `range`: the band its preferred
 * distance falls in, placed by how far the bot likes to fight, or null to keep
 * the profile's own (the M4A1, which the profiles were tuned on). `ads`: aims
 * down sights beyond this (m), null for the profile's. `reach`: fires only
 * this near (m). `push`: closes in even with the target in view. `rush`:
 * sprints at a target in view farther than this (m), holding fire, or null.
 * `scoped`: stops to aim, fires only scoped in, and holds long lanes.
 * `hold`: with the target in view, closes in only beyond this (m); null for
 * just beyond the preferred distance. `juke`: near its preferred distance, strafes all the time, changing
 * direction this much more often.
 */
interface Tactics {
  readonly range: readonly [number, number] | null;
  readonly ads: number | null;
  readonly reach: number;
  readonly push: boolean;
  readonly rush: number | null;
  readonly hold: number | null;
  readonly scoped: boolean;
  readonly juke: number;
}

const TACTICS: Readonly<Record<WeaponId, Tactics>> = {
  m4a1: { range: null, ads: null, reach: Infinity, push: false, rush: null, hold: 35, scoped: false, juke: 1 },
  smg: { range: [9, 13], ads: 10, reach: 45, push: false, rush: null, hold: 22, scoped: false, juke: 2 },
  shotgun: { range: [2.5, 4], ads: 6, reach: 10, push: true, rush: 8, hold: null, scoped: false, juke: 1 },
  sniper: { range: [28, 45], ads: 0, reach: Infinity, push: false, rush: null, hold: null, scoped: true, juke: 1 },
  pistol: { range: [6, 12], ads: 10, reach: 45, push: false, rush: null, hold: 16, scoped: false, juke: 1 },
};
/** The profiles' fight ranges run from about this close to this far (m): a weapon's band is placed along it. */
const FIGHT_RANGES: readonly [number, number] = [5, 26];
/** A followed goal that has moved this far (m) gets a new route. */
const REPLAN_MOVE = 2;

/** The route key while heading for an objective (a player id never looks like it). */
const OBJECTIVE_KEY = '#objective';

/** With the primary dry and an enemy this near (m), out comes the pistol. */
const PISTOL_RANGE = 10;
/** Inside this range (m) a shotgun's cone covers the body: no need to line the shot up. */
const POINT_BLANK = 7;
/** A scoped bot backs off from a target this much closer than it likes. */
const BACK_OFF = 0.45;
/** Jukes within this far (m) beyond the preferred distance. */
const JUKE_REACH = 5;
/** Aimed enough to open fire, when aiming down sights. */
const SIGHTED = 0.7;
/** Scoped in enough to fire, and slow enough (m/s) to count as stopped. */
const SCOPED_IN = 0.9;
const STOPPED = 0.6;

/** A frag goes to an enemy seen this recently (s), this near (m) and out of sight, landing within `THROW_MISS` (m) of them. */
const THROW_MEMORY = 4;
const THROW_RANGE = 25;
const THROW_MISS = 3;
/** Never at someone this near (m): the blast would reach the thrower. */
const THROW_MIN = STATS.grenade.radius.value + 1;
/** Seconds a frag is cooked before it leaves the hand, and between throws. */
const COOK = 1.2;
const THROW_PAUSE = 6;
/** A live frag this near (m) and in sight sends a bot running. */
const FLEE_RANGE = STATS.grenade.radius.value;
/** What a node in an enemy's sight adds to a route closing in on it (m of detour). */
const EXPOSED = 6;
/** Where a bot runs from a frag: nodes this far (m) around it. */
const FLEE_SEARCH = 14;

interface Sighting {
  readonly position: Vec3;
  readonly time: number;
  readonly seen: boolean;
  /** How it was moving when seen (zero when only heard). */
  readonly velocity: Vec3;
}

const STILL: Vec3 = [0, 0, 0];

/** Where an enemy killed a teammate (or the bot) from. */
interface Danger {
  readonly position: Vec3;
  readonly time: number;
  readonly killer: PlayerId;
}

interface Engagement {
  readonly id: PlayerId;
  /** Where the target has been lately, newest last: the bot aims a moment behind. */
  readonly trail: { time: number; pose: HitPose }[];
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
/** Whether `p` is partway along the leg a→b: between its ends, within 0.5 m of its line, at a's level. */
function onLeg(p: Vec3, a: Vec3, b: Vec3): boolean {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz);
  if (len < 0.1 || Math.abs(p[1] - a[1]) > 0.8) return false;
  const along = ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / len;
  const across = Math.abs((p[0] - a[0]) * dz - (p[2] - a[2]) * dx) / len;
  return along > 0 && along < len && across < 0.5;
}
/** `p` moved a random 0..`radius` m sideways (a rough idea of where something is). */
const blur = (p: Vec3, radius: number, r1: number, r2: number): Vec3 => [p[0] + Math.cos(r1 * Math.PI * 2) * radius * r2, p[1], p[2] + Math.sin(r1 * Math.PI * 2) * radius * r2];
const yawTo = (a: Vec3, b: Vec3) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));

/**
 * One bot: reads the match the way a player would (what's in its view and
 * in line of sight, what it hears, what hits it) and produces a usercmd per
 * tick, through the same simulation as everyone else. It roams the nav
 * graph, fights what it sees with a human reaction time and imperfect aim
 * that trails a moment behind the target, chases what it last saw or
 * roughly heard, sometimes holds an angle, and reloads when things are
 * quiet, all in its own style (see {@link BotProfile}). Deterministic for a
 * given name and match.
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
  /** Where the route being followed leads. */
  #followed: Vec3 = [0, 0, 0];
  readonly #memory = new Map<PlayerId, Sighting>();
  #target: Engagement | null = null;
  /** Standing still holding use for its objective (planting or defusing). */
  #using = false;
  #lastEnemySeen = -Infinity;
  /** Turn toward roughly where a hit came from, until then. */
  #alert: { yaw: number; until: number } | null = null;
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
  /** No weapon switch before then (one press at a time). */
  #switchAt = 0;
  /** A frag being cooked: where to throw it, and when it leaves the hand. */
  #throw: { yaw: number; pitch: number; release: number; started: number } | null = null;
  #nextThrow = 0;
  /** A throw being aimed, a few arcs a tick. */
  #aiming: ThrowSolve | null = null;
  /** Running from a live frag: to which node, until when, and which grenade. */
  #flee: { node: number; until: number; grenade: number } | null = null;
  /** Looking about where a chased enemy should have been, toward `yaw`, from `start` until `until`. */
  #search: { yaw: number; start: number; until: number } | null = null;
  /** Enemies heard (or seen) starting a reload, and until when they're busy with it. */
  readonly #reloading = new Map<PlayerId, number>();
  /** Danger spots, newest first: kept through deaths, as a player remembers where they were shot from. */
  #dangers: Danger[] = [];
  /** A danger spot to check while on the move (picked a few times a second), or null. */
  #check: Vec3 | null = null;
  /** How carefully it plays this tick, 0 to 1 (see {@link #weigh}). */
  #caution = 0.5;
  /** Damage it has dealt each enemy lately, and when last: whoever has more left is winning. */
  readonly #dealt = new Map<PlayerId, { damage: number; time: number }>();
  /** Breaking off to heal: the cover node, the eye it hides from, until when at most, and whether it got there. */
  #recover: { node: number; threat: Vec3; until: number; arrived: boolean } | null = null;
  #recoverAt = 0;

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

  /** Where the bot believes `id` was when it last saw or heard them, or null (tests and debugging). */
  believedPosition(id: PlayerId): Vec3 | null {
    return this.#memory.get(id)?.position ?? null;
  }

  /** The danger spots the bot keeps in mind, newest first (tests and debugging). */
  get dangers(): readonly Vec3[] {
    return this.#dangers.filter((d) => this.#lastTime - d.time < DANGER_MEMORY).map((d) => d.position);
  }

  /** What the bot is up to, for tests and debugging. */
  get activity(): 'use' | 'flee' | 'throw' | 'cover' | 'fight' | 'chase' | 'search' | 'hold' | 'roam' {
    if (this.#using) return 'use';
    if (this.#flee) return 'flee';
    if (this.#throw) return 'throw';
    if (this.#recover) return 'cover';
    if (this.#target) return 'fight';
    if (this.#chasing && this.#chasing !== OBJECTIVE_KEY) return 'chase';
    if (this.#search && this.#search.until > this.#lastTime) return 'search';
    return this.#holdUntil > this.#lastTime ? 'hold' : 'roam';
  }

  /** The bot's usercmd for this tick. */
  think(view: BotView): UserCmd {
    const { self, time } = view;
    this.#lastTime = time;
    const r = (n: number) => noise(this.#seed, view.tick, n);
    if (!self.alive) {
      // Killed: it saw who did it, and from where.
      for (const e of view.events) if (e.type === 'kill' && e.victim === self.id) this.#marked(view, e, r(70), r(71), r(72));
      this.#using = false;
      this.#alive = false;
      this.#target = null;
      this.#throw = null;
      this.#aiming = null;
      this.#flee = null;
      this.#search = null;
      this.#recover = null;
      return this.#cmd(0, 0, []);
    }
    if (!this.#alive || flat(self.position, this.#lastPos) > 3) this.#reset(view);
    this.#alive = true;
    this.#lastPos = self.position;
    const eye = eyeOf(self);

    const perceiving = (view.tick + this.#seed) % PERCEIVE_TICKS === 0;
    if (perceiving) {
      this.#perceive(view, eye, r);
      this.#check = this.#angleToCheck(view, eye);
    }
    this.#hear(view);
    this.#listen(view, eye, perceiving);
    if (this.#target || (this.#search && time >= this.#search.until)) this.#search = null;
    const caution = (this.#caution = this.#weigh(view));
    const hurry = view.objective?.hurry === true;

    // The fight: keep it while the target lives and was seen moments ago.
    let target = this.#target;
    const tp = target ? view.players.find((p) => p.id === target!.id) : undefined;
    if (target && (!tp || !tp.alive || (!target.visible && time - target.lastSeen > LOSE_TARGET))) {
      // Out of sight, not dead: a careful bot holds the angle they went behind, for them to come back round, rather than chase.
      if (tp?.alive && caution > 0.55 && !this.#recover && !hurry) {
        const last = this.#memory.get(tp.id)?.position ?? tp.position;
        this.#holdUntil = time + 2 + 2 * r(25);
        this.#holdYaw = yawTo(self.position, last);
        this.#holdCrouch = r(26) < this.profile.crouch + 0.3;
        this.#chasing = null;
      }
      this.#target = target = null;
    }
    if (target && tp) {
      target.trail.push({ time, pose: pose(tp) });
      while (target.trail.length > 1 && target.trail[0]!.time < time - TRAIL) target.trail.shift();
    }
    const fighting = target !== null && tp !== undefined && time >= target.react;
    const range = tp ? flat(self.position, tp.position) : Infinity;
    const tactics = TACTICS[self.weapon.id];
    const want = this.#fightRange(tactics);
    const speed = Math.hypot(self.velocity[0], self.velocity[2]);
    // On the job: planting or defusing, which only an enemy in view interrupts (unless it can't wait).
    const order = view.objective ?? null;
    const using = (this.#using =
      order?.use === true && flat(self.position, order.position) <= order.radius && (order.urgent === true || !(fighting && target?.visible === true)));
    if (using) {
      this.#flee = null;
      this.#throw = null;
    } else this.#watchGrenades(view, eye);
    // Hurt and losing: off to cover to heal; healed (or tired of waiting), back to it.
    if (this.#recover) {
      const at = this.#nav.nodes[this.#recover.node]!.position;
      if (self.health >= HEALED || time >= this.#recover.until || using || hurry) {
        this.#recover = null;
        this.#recoverAt = time + RECOVER_PAUSE;
        this.#goal = null;
        this.#path = [];
      } else if (!this.#recover.arrived && flat(self.position, at) < 1 && Math.abs(self.position[1] - at[1]) < 0.8) this.#recover.arrived = true;
    } else if (perceiving && fighting && target?.visible && tp && !using && !hurry && time >= this.#recoverAt && range > POINT_BLANK) {
      const left = this.#dealt.get(tp.id);
      const theirs = 100 - (left && time - left.time < DEALT_MEMORY ? left.damage : 0);
      if (self.health < HURT + HURT_CAREFUL * caution && theirs > self.health + 10) this.#breakOff(view, eyeOf(tp));
    }
    const retreating = this.#recover !== null && !this.#recover.arrived;
    if (using || this.#throw || fighting) this.#aiming = null;
    else if (this.#aiming) this.#aim(view);
    else if ((view.tick + this.#seed) % PERCEIVE_TICKS === 0) this.#considerThrow(view, eye);

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
    const rushing = !using && fighting && target !== null && target.visible && tactics.rush !== null && range > tactics.rush && self.weapon.ammo > 0;
    if (using) {
      // Eyes on whoever is coming, if anyone; otherwise level.
      if (target && tp) lookYaw = yawTo(self.position, tp.position);
      lookPitch = -0.05;
    } else if (retreating) {
      // Running for cover: eyes on the way.
      const ahead = this.#lookAhead(self.position);
      if (ahead) lookYaw = yawTo(self.position, ahead);
      lookPitch = 0;
    } else if (fighting && target && tp) {
      // Out of sight for a moment: keep aiming where it was last seen.
      const last = this.#memory.get(tp.id)?.position ?? tp.position;
      // Aim where the target was a moment ago, carried on the way it was moving then: a person's eye and hand
      // lag behind what moves and follow its motion, so they keep up with a steady strafe and fall behind when it turns.
      const flight = range / STATS.weapons[self.weapon.id].handling.muzzleVelocity.value;
      const seen = this.#perceived(target, tp, time, flight);
      const point: Vec3 = target.visible ? zoneCentre(seen, target.zone) : [last[0], last[1] + 1.4, last[2]];
      const aim = anglesOf([point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]]);
      const settle = Math.exp(-TICK_SECONDS / SETTLE);
      const p = this.profile;
      // A scope magnifies the picture, so the same unsteady hand is off by less of an angle.
      const magnified = 1 + (STATS.weapons[self.weapon.id].handling.zoom.value - 1) * self.weapon.ads;
      const wobble = (p.aimError * p.wobble) / magnified;
      target.errYaw = target.errYaw * settle + wobble * Math.sin(time * p.wobbleRate + (this.#seed % 7)) * (1 - settle);
      target.errPitch = target.errPitch * settle + (wobble * 0.6 * Math.sin(time * p.wobbleRate * 1.3 + (this.#seed % 5)) + p.aimBias / magnified) * (1 - settle);
      // Through a scope, steer against the sway as far as the bot's hand is steady.
      const [swayYaw, swayPitch] = self.weapon.sway;
      lookYaw = aim.yaw + target.errYaw - swayYaw * p.recoilControl;
      lookPitch = aim.pitch + target.errPitch - swayPitch * p.recoilControl;
      rate = p.turnRate;
      // Rushing in: eyes on the route, which may swing out to cover, until the target is near.
      const ahead = this.#lookAhead(self.position);
      if ((rushing || (tactics.push && !target.visible)) && ahead && flat(self.position, ahead) > 0.5) {
        lookYaw = yawTo(self.position, ahead);
        lookPitch = 0;
      }
      ads = range > (tactics.ads ?? p.adsRange) && self.movement !== 'sprint' && self.movement !== 'tacticalSprint';
      // A scope comes up only once the bot has stopped.
      if (tactics.scoped) ads = speed < STOPPED * 2;
      if (rushing) ads = false;
      if (target.visible && !rushing) {
        // Fire once the view (with recoil) is where the bot means to aim, to within the body's width.
        // Through a scope, that's where the swaying reticle sits.
        const off = Math.hypot(angleDelta(self.yaw + swayYaw, aim.yaw + target.errYaw), self.pitch + swayPitch - (aim.pitch + target.errPitch));
        // One round a cycle (pump or bolt) is placed with care: a shotgun's cone centred on the body, or half the pellets go past it
        // (but point blank, where the cone covers the body anyway); a rifle round inside the torso, not at its edge.
        const mode = STATS.weapons[self.weapon.id].traits.fireMode;
        const careful = mode === 'bolt' || (mode === 'pump' && range > POINT_BLANK);
        const width = careful ? 0.2 : 0.32;
        const tolerance = Math.atan2(width, Math.max(range, 1)) + (ads ? (careful ? 0.1 : 0.4) : 1.2) * DEG;
        // Sight is checked a few times a second; a shot checks it again, so a target that just stepped behind cover isn't shot through it.
        const clear = () => !sightBlocked(this.#world, eye, zoneCentre(pose(tp), 'head')) || !sightBlocked(this.#world, eye, zoneCentre(pose(tp), 'upperTorso'));
        // And only once the aim has settled on the body and the target has moved steadily for a moment, so the lead is right.
        const lined = Math.hypot(target.errYaw, target.errPitch) < Math.atan2(width, Math.max(range, 1));
        const steady = !careful || (lined && this.#steady(target, time));
        // Sights on the way up: wait for them rather than spray the first rounds (the M4A1 keeps the profiles' tuned habit).
        const sighted = !ads || tactics.range === null || self.weapon.ads >= SIGHTED;
        const ready = steady && sighted && (!tactics.scoped || (self.weapon.ads >= SCOPED_IN && speed < STOPPED));
        if (off < tolerance && self.weapon.ammo > 0 && range <= tactics.reach && ready && clear()) {
          if (mode !== 'auto') {
            // One round a press: release, then press again.
            fire = !(this.#lastButtons & Button.Fire);
          } else if (range > this.profile.burstRange) {
            if (time >= target.pauseUntil && time >= target.burstUntil) {
              target.burstUntil = time + (0.22 + 0.25 * r(11)) * this.profile.burst;
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
    } else if (this.#throw) {
      lookYaw = this.#throw.yaw;
      lookPitch = this.#throw.pitch;
    } else if (this.#alert && time < this.#alert.until) {
      lookYaw = this.#alert.yaw;
      lookPitch = 0;
    } else if (this.#recover) {
      // In cover: watching the way the enemy would come.
      const threat = this.#recover.threat;
      lookYaw = yawTo(eye, threat) + 0.3 * Math.sin(time * 0.8 + (this.#seed % 7));
      lookPitch = anglesOf([threat[0] - eye[0], threat[1] - eye[1], threat[2] - eye[2]]).pitch;
    } else if (this.#search && !this.#chasing) {
      // Where did they go: a look about, either side of the way they were heading.
      lookYaw = this.#search.yaw + 0.8 * Math.sin((time - this.#search.start) * 2.4);
      lookPitch = -0.03;
    } else if (time < this.#holdUntil) {
      // A sniper watches its lane down the scope, sweeping less.
      lookYaw = this.#holdYaw + (tactics.scoped ? 0.15 : 0.45) * Math.sin(time * 0.9 + (this.#seed % 11));
      lookPitch = -0.04;
      if (tactics.scoped) ads = true;
    } else {
      const ahead = this.#lookAhead(self.position);
      const chase = this.#chasing ? this.#memory.get(this.#chasing) : undefined;
      const check = this.#check;
      if (chase && flat(self.position, chase.position) < 18) {
        lookYaw = yawTo(eye, chase.position);
        lookPitch = anglesOf([chase.position[0] - eye[0], chase.position[1] + 1.4 - eye[1], chase.position[2] - eye[2]]).pitch;
      } else if (check && ahead && Math.abs(angleDelta(yawTo(self.position, ahead), yawTo(self.position, check))) < CHECK_ARC) {
        // Walking past where a teammate was shot from: eyes on that angle, at head height.
        lookYaw = yawTo(eye, check);
        lookPitch = anglesOf([check[0] - eye[0], check[1] + 1.5 - eye[1], check[2] - eye[2]]).pitch;
      } else if (ahead) {
        lookYaw = yawTo(self.position, ahead);
        lookPitch = Math.max(-0.35, Math.min(0.35, Math.atan2(ahead[1] - self.position[1], Math.max(1, flat(self.position, ahead))))) - 0.03;
      }
    }
    if (this.#nextLink() === 'ladder' && this.#step > 0) {
      const from = this.#nav.nodes[this.#path[this.#step-1]!]!.position;
      const to = this.#nav.nodes[this.#path[this.#step]!]!.position;
      lookYaw = yawTo(from,to);
      lookPitch = 0;
    }
    this.#turn(lookYaw, lookPitch, rate);

    // Where to go.
    let move: Vec3 | null = null;
    let backOff = false;
    if (using) {
      // Standing still with use held.
      buttons.push('Use');
    } else if (this.#flee) {
      move = this.#fleeStep(view);
    } else if (this.#throw || this.#aiming) {
      // Standing still to aim and throw.
    } else if (retreating) {
      move = this.#advance(self, this.#nav.nodes[this.#recover!.node]!.position);
    } else if (fighting && target && tp) {
      // With the target in view, a bot closes in only beyond the distance its weapon holds at: walking straight at a gun is the easiest shot there is.
      const holdAt = tactics.hold ?? want + (tactics.rush !== null && tactics.rush < 12 ? 0.5 : 2);
      // Someone heard (or seen) reloading is worth rushing, for a bot with the stomach for it.
      const reloading = (this.#reloading.get(tp.id) ?? -Infinity) > time && this.profile.aggression > 0.45 && !tactics.scoped;
      // In cover to heal, it fights whoever comes from there, and goes nowhere.
      const closeIn = !this.#recover && (rushing || reloading || !target.visible || (!tactics.scoped && range > holdAt));
      // Closing in to fight up close: by the way the target can't see.
      if (closeIn) move = this.#follow(view, this.#memory.get(tp.id)?.position ?? tp.position, tp.id, tactics.push ? eyeOf(tp) : null);
      if (time >= this.#strafeUntil) {
        // Jukes only near its own fighting distance; farther out it fights like anyone.
        const juke = range < want + JUKE_REACH ? tactics.juke : 1;
        this.#strafe = r(13) < this.profile.standStill && juke === 1 ? 0 : r(14) < 0.5 ? -1 : 1;
        this.#strafeUntil = time + (this.profile.strafeTime * (0.6 + 0.8 * r(15))) / juke;
      }
      // A sniper stands still to shoot, and backs away from someone getting close.
      if (tactics.scoped && target.visible) {
        this.#strafe = 0;
        backOff = range < want * BACK_OFF;
      }
      if (target.crouch && range > 14 && !move) buttons.push('Crouch');
    } else if (this.#recover) {
      // Down behind cover until healed.
      buttons.push('Crouch');
    } else {
      const chase = this.#chasing ? this.#memory.get(this.#chasing) : undefined;
      const leashed = (at: Vec3) => order === null || flat(at, order.position) < order.radius + OBJECTIVE_LEASH;
      // Roaming inside the objective only: an older goal elsewhere is dropped.
      if (order && this.#goal !== null && flat(this.#nav.nodes[this.#goal]!.position, order.position) > order.radius) this.#goal = null;
      if (chase && time - chase.time < this.profile.chase && leashed(chase.position)) {
        // To the corner they went round, eyes on it (see the look above): running on to where they might be by now walks past one who stopped.
        move = this.#follow(view, chase.position, this.#chasing!);
        const there = flat(self.position, chase.position);
        if (there < 2 || (this.#step >= this.#path.length && there < 4)) {
          // Nobody here: look about the way they were going before moving on.
          const v = chase.velocity;
          const yaw = Math.hypot(v[0], v[2]) > QUIET ? Math.atan2(-v[0], -v[2]) : self.yaw;
          this.#search = { yaw, start: time, until: time + SEARCH * (1 + r(24)) };
          this.#memory.delete(this.#chasing!);
          this.#chasing = null;
          move = null;
        }
      } else if (this.#search) {
        // Standing to search.
      } else if (order && flat(self.position, order.position) > order.radius * 0.7) {
        // Off to the objective, by the quickest way.
        move = this.#follow(view, order.position, OBJECTIVE_KEY);
        this.#holdUntil = 0;
      } else if (time >= this.#holdUntil) {
        move = this.#roam(view, r);
      } else if (this.#holdCrouch) buttons.push('Crouch');
    }

    // Steering: the move direction in the bot's own frame.
    let forward = backOff ? -0.8 : 0;
    let right = fighting && !this.#throw && !using ? this.#strafe * (ads ? 1 : 0.8) : 0;
    const climbing = move !== null && this.#nextLink() === 'climb';
    const laddering = move !== null && this.#nextLink() === 'ladder';
    if (move) {
      const dir = yawTo(self.position, move);
      const d = angleDelta(self.yaw, dir);
      const dist = flat(self.position, move);
      const k = dist < 0.6 ? 0.5 : 1;
      forward = Math.cos(d) * k;
      right = fighting ? Math.max(-1, Math.min(1, right * 0.6 - Math.sin(d) * k)) : -Math.sin(d) * k;
      const speed = Math.hypot(self.velocity[0], self.velocity[2]);
      this.#blocked = speed < 0.5 && self.movement !== 'mantle' && self.movement !== 'airborne' && self.movement !== 'ladder' ? this.#blocked + 1 : 0;
      // Sprint the long legs when nothing's in sight, and away from a frag; slide now and then.
      const long = this.#remaining(self.position) > 7;
      // Near an enemy it knows of but hasn't been fighting, a careful bot keeps its footsteps quiet, and creeps up on one it's after.
      const quiet = caution > 0.5 && !hurry && !this.#flee && !retreating && time - this.#lastEnemySeen > SPOTTED && this.#threatNear(view);
      const creeping = quiet && caution > 0.7 && !fighting && this.#chasing !== null && this.#chasing !== OBJECTIVE_KEY && this.#nearest(view) < SNEAK;
      if ((this.#flee || retreating) && forward > 0.5 && !climbing && !laddering) buttons.push('Sprint');
      else if ((rushing || (fighting && tactics.push && target?.visible === false)) && forward > 0.5 && !climbing && !laddering) {
        // Weaving a little on the way in.
        right = 0.35 * Math.sin(time * 2.6 + (this.#seed % 13));
        buttons.push('Sprint', 'TacticalSprint');
      } else if (creeping && !laddering) {
        buttons.push('Crouch');
      } else if (!fighting && long && forward > 0.8 && !climbing && !laddering && !quiet) {
        buttons.push('Sprint');
        if (this.#tactical) buttons.push('TacticalSprint');
        if (self.movement === 'sprint' && time > this.#slideUntil + 3 && r(16) < this.profile.slide) this.#slideUntil = time + 0.5;
      }
      if (time < this.#slideUntil && !laddering) buttons.push('Crouch');
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

    // The pistol when the primary runs dry close up; the primary again once things are quiet.
    const w = self.weapon;
    const busy = w.action === 'holster' || w.action === 'draw' || w.action === 'grenade' || self.grenade !== null;
    const toPistol = w.slot === 0 && w.ammo === 0 && fighting && target?.visible === true && range < PISTOL_RANGE;
    const toPrimary = w.slot === 1 && !fighting && time - this.#lastEnemySeen > 2;
    const switching = (toPistol || toPrimary) && !busy && time >= this.#switchAt && !(this.#lastButtons & Button.SwitchWeapon);
    if (switching) {
      buttons.push('SwitchWeapon');
      this.#switchAt = time + 1;
    }
    // Reload in a quiet moment, or when empty, or once in cover (whatever is left in the magazine).
    const covered = this.#recover?.arrived === true && !(fighting && target?.visible) && w.ammo < this.profile.reloadBelow * 2;
    if (!switching && !toPistol && w.action === 'ready' && ((w.ammo < this.profile.reloadBelow && !fighting && time - this.#lastEnemySeen > 1) || w.ammo === 0 || covered) && !(this.#lastButtons & Button.Reload)) buttons.push('Reload');
    if (!using && this.#cooking(view)) buttons.push('Grenade');

    // Finish the current ladder even if combat or a new objective changes
    // the route mid-climb; jumping or stopping here would strand the bot.
    if (self.movement === 'ladder') return this.#cmd(1,0,[]);
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
    this.#blocked = 0;
    this.#unstickUntil = 0;
    this.#slideUntil = 0;
    this.#strafe = 0;
    this.#throw = null;
    this.#aiming = null;
    this.#flee = null;
    this.#search = null;
    this.#reloading.clear();
    this.#check = null;
    this.#recover = null;
    this.#dealt.clear();
  }

  /** Where the bot likes to fight with this weapon (m). */
  #fightRange(tactics: Tactics): number {
    if (!tactics.range) return this.profile.fightRange;
    const [lo, hi] = tactics.range;
    const t = Math.max(0, Math.min(1, (this.profile.fightRange - FIGHT_RANGES[0]) / (FIGHT_RANGES[1] - FIGHT_RANGES[0])));
    return lo + (hi - lo) * t;
  }

  /**
   * A frag for an enemy that ducked out of sight: seen moments ago, near
   * enough to reach and far enough to be safe, and a solved arc that lands
   * close to where they were. The bot then stands, cooks and throws.
   */
  #considerThrow(view: BotView, eye: Vec3): void {
    const { self, time } = view;
    if (self.grenades <= 0 || self.grenade !== null || time < this.#nextThrow || self.movement === 'mantle') return;
    for (const [id, m] of this.#memory) {
      const d = flat(self.position, m.position);
      if (!m.seen || time - m.time > THROW_MEMORY || d > THROW_RANGE || d < THROW_MIN) continue;
      const p = view.players.find((x) => x.id === id);
      if (!p?.alive) continue;
      const body: Vec3 = [m.position[0], m.position[1] + 1, m.position[2]];
      if (!sightBlocked(this.#world, eye, body)) continue;
      // Tried either way: no fresh look for a moment.
      this.#nextThrow = time + 2;
      this.#aiming = new ThrowSolve(this.#world, eye, m.position, STATS.grenade.fuse.value - COOK);
      this.#aim(view);
      return;
    }
  }

  /** Aims the throw a few more arcs; once found, one that lands close enough is cooked and thrown. */
  #aim(view: BotView): void {
    const solve = this.#aiming!;
    const { self, time } = view;
    if (self.grenades <= 0 || self.grenade !== null || self.movement === 'mantle') {
      this.#aiming = null;
      return;
    }
    const budget = view.budget ?? { arcs: THROW_ARCS_PER_TICK };
    budget.arcs -= solve.step(budget.arcs);
    if (!solve.done) return;
    this.#aiming = null;
    const arc = solve.best;
    if (arc.miss > THROW_MISS) return;
    this.#throw = { yaw: arc.yaw, pitch: arc.pitch, release: time + COOK, started: time };
    this.#holdUntil = 0;
  }

  /** Whether to hold the grenade button this tick: through the cook, until the view is on the arc. */
  #cooking(view: BotView): boolean {
    const t = this.#throw;
    if (!t) return false;
    const { self, time } = view;
    // The press didn't take (the weapon was busy): give up.
    if (time > t.started + 0.3 && self.grenade === null) {
      this.#throw = null;
      return false;
    }
    const aimed = Math.abs(angleDelta(self.yaw, t.yaw)) < 0.6 * DEG && Math.abs(self.pitch - t.pitch) < 0.6 * DEG;
    const late = time - t.started > STATS.grenade.fuse.value - 0.8;
    if (self.grenade?.phase === 'cook' && ((time >= t.release && aimed) || late)) {
      this.#throw = null;
      this.#nextThrow = time + THROW_PAUSE;
      return false;
    }
    return true;
  }

  /** A live frag near and in sight: run for the spot nearby that is out of its reach or behind cover. */
  #watchGrenades(view: BotView, eye: Vec3): void {
    const { self, time } = view;
    if (this.#flee && time >= this.#flee.until) {
      this.#flee = null;
      this.#goal = null;
      this.#path = [];
    }
    for (const g of view.grenades ?? []) {
      if (this.#flee?.grenade === g.id) continue;
      const at: Vec3 = [g.position[0], g.position[1] + 0.2, g.position[2]];
      if (flat(self.position, g.position) > FLEE_RANGE || Math.abs(g.position[1] - self.position[1]) > 3 || sightBlocked(this.#world, eye, at)) continue;
      const node = this.#cover(self.position, at);
      this.#flee = { node, until: g.explodeAt + 0.1, grenade: g.id };
      this.#throw = null;
      this.#holdUntil = 0;
      this.#plan(self.position, node, view);
      return;
    }
  }

  /** The node near `from` that best gets away from a blast at `blast`: out of its sight or reach, and not far to run. */
  #cover(from: Vec3, blast: Vec3): number {
    const nodes = this.#nav.nodes;
    let best = nearestNode(this.#nav, this.#world, from);
    let bestScore = -Infinity;
    for (const [i, n] of nodes.entries()) {
      const run = flat(from, n.position);
      if (run > FLEE_SEARCH || Math.abs(n.position[1] - from[1]) > 2.5) continue;
      const away = flat(blast, n.position);
      const hidden = sightBlocked(this.#world, blast, [n.position[0], n.position[1] + 1.2, n.position[2]]);
      const score = (hidden ? 30 : 0) + Math.min(away, FLEE_RANGE + 3) * 3 - run;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  #fleeStep(view: BotView): Vec3 | null {
    const flee = this.#flee!;
    return this.#advance(view.self, this.#nav.nodes[flee.node]!.position);
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

  /** Whether the target has moved steadily (no turn or sudden start) over the last moment the bot has seen. */
  #steady(target: Engagement, time: number): boolean {
    const seenUntil = time - this.profile.perceptionLag;
    const at = (t: number) => target.trail.find((x) => x.time >= t)?.pose.position;
    const [a, b, c] = [at(seenUntil - 2 * STEADY), at(seenUntil - STEADY), at(seenUntil)];
    if (!a || !b || !c) return false;
    const change = Math.hypot(c[0] - 2 * b[0] + a[0], c[2] - 2 * b[2] + a[2]) / STEADY;
    return change < STEADY_CHANGE;
  }

  /** The target as the bot perceives it: where it was `perceptionLag` ago, led on by its motion at the time (and on for `flight` more seconds, the round's time in the air). */
  #perceived(target: Engagement, tp: PlayerOutput, time: number, flight = 0): HitPose {
    const { perceptionLag: lag, tracking } = this.profile;
    const trail = target.trail;
    const i = trail.findIndex((t) => t.time >= time - lag);
    if (i < 0) return pose(tp);
    const then = trail[i]!.pose;
    const before = trail[Math.max(0, i - 6)]!;
    const dt = trail[i]!.time - before.time;
    if (dt <= 0) return then;
    const lead = ((lag + flight) * tracking) / dt;
    const p = then.position;
    const q = before.pose.position;
    return { ...then, position: [p[0] + (p[0] - q[0]) * lead, p[1] + (p[1] - q[1]) * lead, p[2] + (p[2] - q[2]) * lead] };
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
      this.#memory.set(p.id, { position: p.position, time, seen: true, velocity: p.velocity });
      // A reload in plain view.
      if (p.weapon.action === 'reload') this.#reloading.set(p.id, time + 1);
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
      const p = this.profile;
      const e = p.aimError * (1 + Math.min(d, 40) / 40);
      // Someone at the edge of view or far off takes longer to notice.
      const notice = 0.22 * Math.min(1, off / FOV) ** 2 + (0.15 * Math.min(d, 50)) / 50;
      // A big turn onto them sometimes swings past before settling back.
      const turn = angleDelta(self.yaw, yawTo(eye, eyeOf(best.p)));
      const swing = Math.abs(turn) > 25 * DEG && r(6) < p.overshoot ? Math.sign(turn) * (2 + 4 * r(7)) * DEG : 0;
      this.#target = {
        id: best.p.id,
        trail: [],
        react: time + p.reaction * (0.85 + 0.35 * r(1)) + notice,
        zone: r(2) < p.headshots ? 'head' : 'upperTorso',
        errYaw: (r(3) - 0.5) * 2 * e + swing,
        errPitch: (r(4) - 0.5) * 1.2 * e,
        visible: true,
        lastSeen: time,
        crouch: r(5) < p.crouch,
        burstUntil: 0,
        pauseUntil: 0,
      };
      this.#chasing = best.p.id;
      this.#holdUntil = 0;
    }
  }

  /**
   * Gunfire nearby, and hits taken, give away where enemies are: exactly in
   * the open, roughly through walls (and only nearer), and a hit gives only
   * a rough direction to turn to.
   */
  #hear(view: BotView): void {
    const { self, time } = view;
    const eye = eyeOf(self);
    for (const [k, e] of view.events.entries()) {
      const r = (n: number) => noise(this.#seed, view.tick, 100 + k * 8 + n);
      if (e.type === 'shot' && e.shooter !== self.id) {
        const shooter = view.players.find((p) => p.id === e.shooter);
        if (!shooter || !view.isEnemy(shooter)) continue;
        const d = flat(self.position, e.origin);
        const muffled = d > SENSE && sightBlocked(this.#world, eye, e.origin);
        if (d > (muffled ? MUFFLED_HEARING : HEARING)) continue;
        const known = this.#memory.get(e.shooter);
        const heard = muffled ? blur(shooter.position, 2 + 4 * r(0), r(1), 1) : shooter.position;
        if (!known || !known.seen || time - known.time > 1) this.#memory.set(e.shooter, { position: heard, time, seen: false, velocity: STILL });
        if (!this.#target && !this.#chasing) this.#chasing = e.shooter;
      } else if (e.type === 'hit' && e.shooter === self.id && e.victim !== self.id) {
        const before = this.#dealt.get(e.victim);
        const kept = before && time - before.time < DEALT_MEMORY ? before.damage : 0;
        this.#dealt.set(e.victim, { damage: kept + e.damage, time });
      } else if (e.type === 'hit' && e.victim === self.id && e.shooter !== self.id) {
        const shooter = view.players.find((p) => p.id === e.shooter);
        if (!shooter) continue;
        this.#memory.set(e.shooter, { position: blur(shooter.position, 1 + 3 * r(2), r(3), 1), time, seen: false, velocity: STILL });
        if (!this.#target) {
          this.#alert = { yaw: yawTo(eye, eyeOf(shooter)) + (r(4) - 0.5) * 50 * DEG, until: time + 1.2 };
          this.#chasing = e.shooter;
          this.#holdUntil = 0;
        }
      } else if (e.type === 'reload' && e.phase === 'start' && e.player !== self.id) {
        const p = view.players.find((x) => x.id === e.player);
        if (p && view.isEnemy(p) && this.#heard(view, eye, p, RELOAD_HEARING, r(5), r(6))) this.#reloading.set(p.id, time + 1.5);
      } else if (e.type === 'kill') {
        this.#memory.delete(e.victim);
        if (this.#target?.id === e.victim) this.#target = null;
        if (this.#chasing === e.victim) this.#chasing = null;
        // Whoever held that spot is down: it's clear, for now.
        this.#dangers = this.#dangers.filter((d) => d.killer !== e.victim);
        this.#marked(view, e, r(0), r(1), r(2));
      }
    }
  }

  /**
   * A death by an enemy's hand, of a teammate (not in free-for-all, where
   * there are none) or of the bot itself, makes where the killer was a
   * danger spot: exactly for its own death, as roughly as a callout for a
   * teammate's, more so the farther off. A teammate's killer is remembered
   * there too; near enough, a bot with the stomach for it goes to trade, and
   * the others watch that way.
   */
  #marked(view: BotView, e: Extract<SimEvent, { type: 'kill' }>, r1: number, r2: number, r3: number): void {
    const { self, time } = view;
    if (e.killer === null || e.killer === self.id) return;
    const killer = view.players.find((p) => p.id === e.killer);
    if (!killer || !view.isEnemy(killer)) return;
    const own = e.victim === self.id;
    const victim = view.players.find((p) => p.id === e.victim);
    if (!own && (!victim || view.isEnemy(victim))) return;
    const d = own ? 0 : flat(self.position, victim!.position);
    const at = own ? killer.position : blur(killer.position, CALLOUT_ERROR + d / 10, r1, 0.4 + 0.6 * r2);
    this.#dangers = [{ position: at, time, killer: killer.id }, ...this.#dangers.filter((x) => x.killer !== killer.id && time - x.time < DANGER_MEMORY)].slice(0, DANGERS);
    if (own) return;
    const known = this.#memory.get(killer.id);
    if (!known || !known.seen || time - known.time > 1) this.#memory.set(killer.id, { position: at, time, seen: false, velocity: STILL });
    if (this.#target || this.#using || this.#flee || d > TRADE_RANGE) return;
    this.#search = null;
    if (this.#bold()) {
      this.#chasing = killer.id;
      this.#holdUntil = 0;
    } else {
      this.#chasing = null;
      this.#holdUntil = time + 2 + 2 * r3;
      this.#holdYaw = yawTo(self.position, at);
    }
  }

  /** Whether the bot pushes toward trouble (trades, chases) rather than waiting for it to come. */
  #bold(): boolean {
    return this.#caution < 0.5;
  }

  /**
   * How carefully to play now, 0 (all in) to 1 (every step counted): the
   * style's own care (less with a gun made for close range, which has to
   * push to fight), more when a death is for the round, when it is the
   * last of its side, when hurt, or just after a teammate went down near it;
   * less when its side outnumbers the other (as the scoreboard tells in a
   * round), and much less when the clock says hurry.
   */
  #weigh(view: BotView): number {
    const { self, time } = view;
    let c = 1 - this.profile.aggression;
    const band = TACTICS[self.weapon.id].range;
    if (band && band[1] < CLOSE_RANGE) c -= 0.15;
    if (view.lives === 'round') {
      c += 0.25;
      let mates = 0;
      let foes = 0;
      for (const p of view.players) {
        if (p.id === self.id || !p.alive || p.kind !== 'player') continue;
        if (view.isEnemy(p)) foes += 1;
        else mates += 1;
      }
      if (mates === 0 && foes > 0) c += 0.15;
      c -= 0.1 * Math.max(-2, Math.min(3, mates + 1 - foes));
    }
    c += (1 - self.health / 100) * 0.4;
    if (this.#dangers.some((d) => time - d.time < 8 && flat(d.position, self.position) < 20)) c += 0.15;
    if (view.objective?.hurry) c -= 0.6;
    return Math.max(0, Math.min(1, c));
  }

  /** Whether an enemy it knows of (seen or heard lately, or a danger spot) is near enough to hear its footsteps. */
  #threatNear(view: BotView): boolean {
    return this.#nearest(view) < QUIET_RANGE || this.#dangers.some((d) => view.time - d.time < DANGER_MEMORY && flat(d.position, view.self.position) < QUIET_RANGE);
  }

  /** How far (m) the nearest enemy it knows of lately is believed to be. */
  #nearest(view: BotView): number {
    let best = Infinity;
    for (const m of this.#memory.values()) if (view.time - m.time < QUIET_MEMORY) best = Math.min(best, flat(m.position, view.self.position));
    return best;
  }

  /** Breaks off to the nearest cover out of `threat`'s sight, if there is any close; otherwise fights on. */
  #breakOff(view: BotView, threat: Vec3): void {
    const { self, time } = view;
    const node = this.#shelter(self.position, threat);
    if (node === null) {
      this.#recoverAt = time + 1;
      return;
    }
    this.#recover = { node, threat, until: time + RECOVER_MAX, arrived: false };
    this.#holdUntil = 0;
    this.#search = null;
    this.#chasing = null;
    this.#plan(self.position, node, view, true, threat);
  }

  /** The nearest node out of `threat`'s sight, not toward it, within a short run of `from`; null when there's none. */
  #shelter(from: Vec3, threat: Vec3): number | null {
    const away = flat(from, threat);
    let best: number | null = null;
    let bestRun = Infinity;
    for (const [i, n] of this.#nav.nodes.entries()) {
      const run = flat(from, n.position);
      if (run > SHELTER_SEARCH || run >= bestRun || Math.abs(n.position[1] - from[1]) > 2.5 || flat(n.position, threat) < away - 2) continue;
      if (!sightBlocked(this.#world, threat, [n.position[0], n.position[1] + 1.2, n.position[2]])) continue;
      best = i;
      bestRun = run;
    }
    return best;
  }

  /** The newest danger spot near and in sight, to check on the move; null when there's none. */
  #angleToCheck(view: BotView, eye: Vec3): Vec3 | null {
    for (const d of this.#dangers) {
      if (view.time - d.time >= DANGER_MEMORY || flat(view.self.position, d.position) > CHECK_RANGE) continue;
      if (!sightBlocked(this.#world, eye, [d.position[0], d.position[1] + 1.5, d.position[2]])) return d.position;
    }
    return null;
  }

  /** The eye of the newest danger spot within reach of `from`, for routes to keep out of its sight; null when there's none. */
  #watcher(from: Vec3, time: number): Vec3 | null {
    const d = this.#dangers.find((x) => time - x.time < DANGER_MEMORY && flat(from, x.position) < DANGER_REACH);
    return d ? [d.position[0], d.position[1] + 1.5, d.position[2]] : null;
  }

  /**
   * Footsteps by gait (a few times a second) and thuds (landings, slides,
   * mantles): an enemy moving nearby gives away roughly where they are. A
   * fresh noise turns a bot that isn't busy toward it; one with the stomach
   * for it goes to look, the others wait for whoever it is to show.
   */
  #listen(view: BotView, eye: Vec3, steps: boolean): void {
    const { self, time } = view;
    for (const [k, p] of view.players.entries()) {
      if (p.id === self.id || !p.alive || !view.isEnemy(p)) continue;
      const thud = p.landing !== null || ((p.movement === 'slide' || p.movement === 'mantle') && steps);
      if (!thud && !steps) continue;
      const speed = Math.hypot(p.velocity[0], p.velocity[2]);
      const grounded = p.movement !== 'airborne' && p.movement !== 'mantle';
      const gait = p.stance !== 'stand' ? FOOTSTEPS.crouch : p.movement === 'sprint' || p.movement === 'tacticalSprint' ? FOOTSTEPS.sprint : FOOTSTEPS.walk;
      const reach = thud ? THUD : grounded && speed >= QUIET ? gait : 0;
      if (reach === 0) continue;
      const known = this.#memory.get(p.id);
      // Seen just now: the eyes already said it all.
      if (known?.seen && time - known.time < 0.3) continue;
      const r = (n: number) => noise(this.#seed, view.tick, 300 + k * 4 + n);
      if (!this.#heard(view, eye, p, reach, r(0), r(1))) continue;
      const fresh = !known || time - known.time > 3;
      if (!fresh || this.#target || this.#chasing || this.#using || this.#flee || this.#throw) continue;
      const toward = yawTo(eye, eyeOf(p)) + (r(2) - 0.5) * 30 * DEG;
      this.#alert = { yaw: toward, until: time + 1 };
      this.#search = null;
      if (r(3) < this.profile.aggression) this.#chasing = p.id;
      else {
        this.#holdUntil = time + 1.5 + 1.5 * r(3);
        this.#holdYaw = toward;
      }
    }
  }

  /**
   * Whether a sound `p` makes, carrying `reach` m in the open, reaches the
   * bot; if so the bot remembers about where it came from (roughly through
   * walls), unless it saw them a moment ago.
   */
  #heard(view: BotView, eye: Vec3, p: PlayerOutput, reach: number, r1: number, r2: number): boolean {
    const { self, time } = view;
    const d = Math.hypot(flat(self.position, p.position), p.position[1] - self.position[1]);
    if (d > reach) return false;
    const muffled = d > SENSE && sightBlocked(this.#world, eye, eyeOf(p));
    if (muffled && d > reach * MUFFLED) return false;
    const known = this.#memory.get(p.id);
    if (!known || !known.seen || time - known.time > 1) this.#memory.set(p.id, { position: blur(p.position, muffled ? 2 + 3 * r1 : 0.8 * r1, r2, 1), time, seen: false, velocity: STILL });
    return true;
  }

  /** The next point along the route to `goal` (a moving one is re-planned now and then). */
  #follow(view: BotView, goal: Vec3, key: PlayerId, unseenBy: Vec3 | null = null): Vec3 | null {
    const { self, time } = view;
    // Replanned when the goal has moved (each second at most) or the bot got stuck: replanning a route to the same place only turns the bot back to where it started.
    const moved = flat(goal, this.#followed) > REPLAN_MOVE || this.#replanAt === 0;
    if (this.#chasing !== key || (time >= this.#replanAt && moved) || this.#step >= this.#path.length) {
      this.#chasing = key;
      this.#followed = goal;
      this.#replanAt = time + 1;
      this.#plan(self.position, nearestNode(this.#nav, this.#world, goal), view, true, unseenBy);
    }
    return this.#advance(self, goal);
  }

  /** Wandering: a fresh goal when the last one is reached, sometimes holding an angle there first. */
  #roam(view: BotView, r: (n: number) => number): Vec3 | null {
    const { self, time } = view;
    if (this.#goal !== null && this.#step >= this.#path.length) {
      const reached = this.#nav.nodes[this.#goal]!;
      this.#goal = null;
      // A sniper always settles in to watch the lane it came for, and for longer; so does a bot holding an objective.
      const scoped = TACTICS[self.weapon.id].scoped;
      // A careful bot stops to watch more often; one in a hurry never does.
      if (!view.objective?.hurry && (scoped || view.objective || r(21) < this.profile.hold * (0.6 + 0.8 * this.#caution))) {
        this.#holdUntil = time + this.profile.holdTime * (0.6 + 0.8 * r(22)) * (scoped ? 2.5 : 1);
        this.#holdYaw = scoped && reached.sightline >= LONG_SIGHTLINE ? reached.sightYaw : this.#holdFacing(self.position);
        this.#holdCrouch = r(23) < this.profile.crouch;
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
    if (enemies.length > 0 && r(90) < this.profile.hunch) {
      const e = enemies[Math.floor(r(91) * enemies.length)]!.position;
      const angle = r(92) * Math.PI * 2;
      const off = 8 + r(93) * 12;
      hunch = [e[0] + Math.cos(angle) * off, e[1], e[2] + Math.sin(angle) * off];
    }
    // Inside its objective, if it has one; a sniper picks among the spots with a long view.
    const inside = view.objective ? this.#nodesIn(view.objective) : [];
    const lanes = TACTICS[self.weapon.id].scoped ? this.#longSightlines() : [];
    const pool = inside.length > 0 ? inside : lanes.length > 0 ? lanes : null;
    const candidates = Array.from({ length: 16 }, (_, k) => (pool ? pool[Math.floor(r(30 + k) * pool.length)]! : Math.floor(r(30 + k) * nodes.length)));
    if (hunch) candidates.push(nearestTo(nodes, hunch));
    let best = 0;
    let bestScore = -Infinity;
    for (const [k, i] of candidates.entries()) {
      const p = nodes[i]!.position;
      const d = flat(self.position, p);
      let score = -Math.abs(d - this.profile.roam) * 0.6 + r(60 + k) * 12;
      if (hunch && flat(hunch, p) < 10) score += 20;
      for (const n of noises) if (flat(n.position, p) < 12) score += 14 * this.profile.aggression + 4;
      // Where a teammate went down: the bold go to settle it, the rest give it a wide berth.
      for (const g of this.#dangers) if (time - g.time < DANGER_MEMORY && flat(g.position, p) < 10) score += this.#bold() ? 8 : -16;
      for (const m of mates) if (flat(m.position, p) < 7) score += this.profile.teamwork;
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

  #lanes: number[] | null = null;
  #inside: { objective: BotObjective; nodes: number[] } | null = null;

  /** The nav nodes inside an objective (the nearest one when none is). */
  #nodesIn(objective: BotObjective): readonly number[] {
    if (this.#inside?.objective !== objective) {
      const nodes = this.#nav.nodes.flatMap((n, i) => (flat(n.position, objective.position) <= objective.radius * 0.8 && Math.abs(n.position[1] - objective.position[1]) < 2 ? [i] : []));
      this.#inside = { objective, nodes: nodes.length > 0 ? nodes : [nearestNode(this.#nav, this.#world, objective.position)] };
    }
    return this.#inside.nodes;
  }

  /** The nav nodes with a long view, for holding a lane with a sniper rifle. */
  #longSightlines(): readonly number[] {
    this.#lanes ??= this.#nav.nodes.flatMap((n, i) => (n.sightline >= LONG_SIGHTLINE ? [i] : []));
    return this.#lanes;
  }

  /** Which way to watch while holding: toward the newest noise or danger spot, else toward the middle of the map. */
  #holdFacing(at: Vec3): number {
    let latest: { position: Vec3; time: number } | null = null;
    for (const m of this.#memory.values()) if (!latest || m.time > latest.time) latest = m;
    for (const d of this.#dangers) if ((!latest || d.time > latest.time) && this.#lastTime - d.time < DANGER_MEMORY) latest = d;
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
  #plan(from: Vec3, to: number, view: BotView, fresh = true, unseenBy: Vec3 | null = null): void {
    const start = nearestNode(this.#nav, this.#world, from);
    // Out of sight of `unseenBy` (or else the newest danger spot near) where there's a way: each node it can see costs as much as a detour.
    const watcher = unseenBy ?? this.#watcher(from, view.time);
    const seen = new Map<number, number>();
    const exposure = watcher
      ? (i: number) => {
          let c = seen.get(i);
          if (c === undefined) {
            const p = this.#nav.nodes[i]!.position;
            c = flat(p, watcher) > DANGER_REACH || sightBlocked(this.#world, watcher, [p[0], p[1] + 1.2, p[2]]) ? 0 : EXPOSED;
            seen.set(i, c);
          }
          return c;
        }
      : undefined;
    const path = findPath(this.#nav, start, to, exposure) ?? [];
    this.#path = path;
    // Replanned partway along the first leg (the nearest node is the one just left behind): carry on along it rather than turn back to its start.
    // Out of a fight only: a fighting bot strafes off its route, so where it stands says nothing about which way it was going.
    this.#step = this.#target === null && path.length > 1 && !['climb','ladder'].includes(linkKind(this.#nav, path[0]!, path[1]!) ?? '') && onLeg(from, this.#nav.nodes[path[0]!]!.position, this.#nav.nodes[path[1]!]!.position) ? 1 : 0;
    this.#from = from;
    if (fresh) this.#progress = { position: from, time: view.time };
    this.#tactical = noise(this.#seed, view.tick, 40) < this.profile.tacticalSprint;
  }

  /** Moves along the route past nodes already reached; the point to head for now, or null at the end. */
  #advance(self: PlayerOutput, goal: Vec3): Vec3 | null {
    const nodes = this.#nav.nodes;
    while (this.#step < this.#path.length) {
      const n = nodes[this.#path[this.#step]!]!;
      const next = this.#step + 1 < this.#path.length ? linkKind(this.#nav, this.#path[this.#step]!, this.#path[this.#step + 1]!) : null;
      const radius = n.precise || next === 'climb' || next === 'ladder' ? 0.3 : 0.9;
      const reached = flat(self.position, n.position) < radius && Math.abs(self.position[1] - n.position[1]) < 0.8 && self.movement !== 'mantle' && self.movement !== 'ladder';
      if (!reached) break;
      this.#step += 1;
    }
    if (this.#step < this.#path.length) {
      // Head for a point a little ahead on the leg itself, so the bot keeps to the line the nav graph checked (through a doorway, up the stairs).
      const b = nodes[this.#path[this.#step]!]!;
      const a = this.#step > 0 ? nodes[this.#path[this.#step - 1]!]! : null;
      const from = a?.position ?? this.#from;
      if (this.#nextLink() === 'climb' || this.#nextLink() === 'ladder') return b.position;
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

  /**
   * A point a little ahead along the route, to look at while moving. Facing
   * a climb, the ledge itself: a mantle goes the way the bot looks, and a
   * look past the ledge (up a roof climb, say) can aim it off the crate.
   */
  #lookAhead(from: Vec3): Vec3 | null {
    const nodes = this.#nav.nodes;
    if (this.#nextLink() === 'climb' || this.#nextLink() === 'ladder') {
      const p = nodes[this.#path[this.#step]!]!.position;
      return [p[0], p[1] + 1.5, p[2]];
    }
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
    // Height gained counts only once landed: hopping at a ledge it can't get onto is no progress.
    const climbed = self.movement !== 'airborne' && Math.abs(self.position[1] - this.#progress.position[1]) > 0.5;
    if (flat(self.position, this.#progress.position) > 0.6 || climbed) {
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

/** Where a frag thrown from `eye` along (yaw, pitch) is when it goes off `fuse` seconds later, stepped as the simulation steps it. */
function blastPoint(world: World, eye: Vec3, yaw: number, pitch: number, fuse: number): Vec3 {
  const G = STATS.grenade;
  const d = viewDirection(yaw, pitch + G.throwLift.value * DEG);
  const g: Grenade = { id: -1, thrower: '', team: 0, position: [eye[0], eye[1], eye[2]], velocity: [d[0] * G.throwSpeed.value, d[1] * G.throwSpeed.value, d[2] * G.throwSpeed.value], explodeAt: fuse, resting: false };
  for (let t = 0; t < fuse - 1e-9 && !g.resting; t += TICK_SECONDS) moveGrenade(g, world, TICK_SECONDS);
  return g.position;
}

/**
 * Aims the throw that sets a frag off nearest `target`: straight at it, at the
 * pitch (searched coarsely, then finely) whose bounces and roll end closest.
 * Each arc is a whole flight simulated, so it goes a few arcs at a time
 * (`step`) rather than in one tick. `best.miss` is how far from the target it
 * goes off (m).
 */
export class ThrowSolve {
  readonly #world: World;
  readonly #eye: Vec3;
  readonly #target: Vec3;
  readonly #fuse: number;
  /** Pitches still to try in this pass; the fine pass is queued when the coarse one ends. */
  #queue: number[] = [];
  #coarse = true;
  best: { yaw: number; pitch: number; miss: number };

  constructor(world: World, eye: Vec3, target: Vec3, fuse: number) {
    this.#world = world;
    this.#eye = eye;
    this.#target = target;
    this.#fuse = fuse;
    this.best = { yaw: yawTo(eye, target), pitch: 0, miss: Infinity };
    for (let deg = -20; deg <= 60; deg += 4) this.#queue.push(deg * DEG);
  }

  get done(): boolean {
    return !this.#coarse && this.#queue.length === 0;
  }

  /** Tries up to `arcs` more pitches; returns how many it tried. */
  step(arcs: number): number {
    let tried = 0;
    while (tried < arcs && !this.done) {
      const pitch = this.#queue.shift();
      if (pitch === undefined) {
        this.#coarse = false;
        const coarse = this.best.pitch;
        for (let k = -3; k <= 3; k++) if (k !== 0) this.#queue.push(coarse + k * 0.66 * DEG);
        continue;
      }
      tried += 1;
      const p = blastPoint(this.#world, this.#eye, this.best.yaw, pitch, this.#fuse);
      const miss = flat(p, this.#target) + Math.abs(p[1] - this.#target[1]);
      if (miss < this.best.miss) this.best = { yaw: this.best.yaw, pitch, miss };
    }
    return tried;
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
