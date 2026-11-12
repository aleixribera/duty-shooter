import { moveGrenade, type Grenade, type GrenadeOutput } from '../combat/grenade';
import { zoneCentre, type HitPose, type HitZone } from '../combat/hitboxes';
import { sightBlocked } from '../combat/projectiles';
import { angleDelta, anglesOf, DEG, viewDirection, type Vec3 } from '../math';
import { hashString, noise } from '../random';
import { SeatIndex } from '../seats';
import { TICK_SECONDS, type PlayerId, type PlayerOutput, type SimEvent } from '../simulation';
import { STATS, type WeaponId } from '../stats';
import { Button, usercmd, type ButtonName, type UserCmd } from '../usercmd';
import type { World } from '../world';
import { moddedRow, shotLoudness } from '../weapon/attachments';
import { kitInHand, type ThrowableId } from '../weapon/loadout';
import { coverBits, coverNear } from './cover-spots';
import { LONG_SIGHTLINE, findPath, linkKind, nearestNode, startNode, type NavGraph } from './nav';
import { longSightlines, navMiddle, nodesNear } from './nav-queries';
import { REVIVE_APPROACH } from './planner';
import type { BotProfile } from './profile';
import { botSees } from './sight';
import { RUN, wallAt, type GroundOrder } from './squad-plan';
import type { SquadIntel } from './squad-intel';
import type { PingRequest } from '../pings';
import { TRAP_HEARD, type TrapSound } from '../sound-traps';

/** What a bot knows each tick: the latest simulation output, as the server has it. */
export interface BotView {
  readonly tick: number;
  /** Simulation time (s). */
  readonly time: number;
  readonly self: PlayerOutput;
  /** Everyone in the match, the bot included. */
  readonly players: readonly PlayerOutput[];
  /** The same players indexed, shared by every bot of a tick; made from `players` when absent. */
  readonly seats?: SeatIndex;
  /** Ticks between this bot's thoughts: more than 1 for one far from anybody, who keeps doing what it last chose in between. 1 when absent. */
  readonly thinkEvery?: number;
  /** The latest tick's events. */
  readonly events: readonly SimEvent[];
  /** Sound traps set off last tick (ticket 72): birds flushing, metal rattling, gravel sliding. */
  readonly sounds?: readonly TrapSound[];
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
  /** The tick's routes are spent: keep to the last usercmd this once, as a bot thinking less often does, unless that wouldn't be safe. */
  readonly rest?: boolean;
  /** Battle Royale: what its Squad has it doing. With this it uses the ground (see `squad-plan.ts`) instead of roaming; without it, it plays as it always has. */
  readonly ground?: GroundOrder;
  /** A team mode: what its team has pinged (a Battle Royale's is the ground's). */
  readonly intel?: SquadIntel;
}

/** Work the bots of one tick share. */
export interface ThinkBudget {
  /** Grenade arcs left to simulate this tick. */
  arcs: number;
  /** Routes planned so far this tick. */
  plans: number;
}

/** Grenade arcs a bot may simulate in a tick when no shared budget is given; a whole aim takes 27. */
const THROW_ARCS_PER_TICK = 3;

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
  /** A place its team doesn't hold, taken by standing in it: it keeps walking in while it fights, whatever distance its gun likes to hold at (a scoped rifle excepted, which shoots standing). */
  readonly take?: boolean;
}

/** How near (m) a crate a bot stands to open it: inside the opening reach. */
const GROUND_USE = 1.5;

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
/** The farthest any of these carries (m). */
const HEARD_MOST = Math.max(FOOTSTEPS.sprint, THUD);
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
/**
 * Seconds of a target's movement a bot remembers, for aiming a moment behind it: at least this, and always enough to
 * judge the target's motion as the bot last saw it (its `perceptionLag` back, over two `STEADY` spans), however slow
 * its eyes. A Bot Match's Easy bots see further back than this allowed, read every walk as a sudden turn and never
 * fired a bolt-action (ticket 83).
 */
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
 * direction this much more often. `burst`: an automatic's bursts run this many
 * times as long as the profile's (a machine gun settles as it fires, so its
 * bursts are long). `pace`: beyond the first (m), a round a press is placed
 * with care and the next waits the second (s), for the sights to come back.
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
  readonly burst: number;
  readonly pace: readonly [beyond: number, seconds: number] | null;
}

const TACTICS: Readonly<Record<WeaponId, Tactics>> = {
  m4a1: { range: null, ads: null, reach: Infinity, push: false, rush: null, hold: 35, scoped: false, juke: 1, burst: 1, pace: null },
  smg: { range: [9, 13], ads: 10, reach: 45, push: false, rush: null, hold: 22, scoped: false, juke: 2, burst: 1, pace: null },
  shotgun: { range: [2.5, 4], ads: 6, reach: 10, push: true, rush: 8, hold: null, scoped: false, juke: 1, burst: 1, pace: null },
  sniper: { range: [28, 45], ads: 0, reach: Infinity, push: false, rush: null, hold: null, scoped: true, juke: 1, burst: 1, pace: null },
  pistol: { range: [6, 12], ads: 10, reach: 45, push: false, rush: null, hold: 16, scoped: false, juke: 1, burst: 1, pace: null },
  // Past the M4A1's close band, where its four hits beat the rifle's five; aimed nearly always (the hip sprays), and it stays put with a target in view.
  lmg: { range: [20, 30], ads: 5, reach: Infinity, push: false, rush: null, hold: 50, scoped: false, juke: 1, burst: 2.6, pace: null },
  // Inside its two-shot band but out of an SMG's; always through the optic, and far off each round waits for the last one's kick to come back.
  dmr: { range: [24, 38], ads: 0, reach: Infinity, push: false, rush: null, hold: 60, scoped: false, juke: 1, burst: 1, pace: [28, 0.36] },
  // Well inside the one-burst band, and aimed: from the hip a burst rarely lands whole.
  burst: { range: [14, 24], ads: 6, reach: Infinity, push: false, rush: null, hold: 36, scoped: false, juke: 1, burst: 1, pace: null },
  // Inside its two-shot band (12 m); every round placed, since a miss costs 0.4 s and there are six.
  revolver: { range: [5, 10], ads: 5, reach: 35, push: false, rush: null, hold: 12, scoped: false, juke: 1, burst: 1, pace: [0, 0.4] },
};
/** A gun's long bursts (`burst` above 1) only this near (m): farther off, the climb a long burst walks up takes it off the body before the weight settles it. */
const LONG_BURSTS_WITHIN = 36;
/** The profiles' fight ranges run from about this close to this far (m): a weapon's band is placed along it. */
const FIGHT_RANGES: readonly [number, number] = [5, 26];
/** A followed goal that has moved this far (m) gets a new route. */
const REPLAN_MOVE = 2;

/** The route key while heading for an objective (a player id never looks like it). */
const OBJECTIVE_KEY = '#objective';

/** On the ground of a Battle Royale. A route counts this many metres against a node with no cover near it, so it hugs cover where it can. */
const OPEN_GROUND = 1.2;
/** A bound runs the bot's roam length times this; a stop at the end of one lasts this long (s), twice that for a careful bot. */
const BOUND: readonly [number, number] = [0.8, 1.6];
const STOP: readonly [number, number] = [0.6, 1.8];
/** A hunter's stops are this share of the rest's. */
const HUNT_STOP = 0.4;
/** Holding a spot in a rally: this many times its usual hold (s). */
const SPOT_HOLD: readonly [number, number] = [2, 5];
/** Within this far (m) of its spot at the end of the route there, a bot is at it. */
const SPOT_THERE = 1;
/** Held up this long (s) below where its route goes next, a bot jumps at it (a mantle where there's a ledge). */
const WEDGED = 0.6;
/** How far round a rally (m) it looks for a spot, and how many it weighs. */
const SPOT_REACH = 8;
const SPOTS_WEIGHED = 24;
/** Near a squadmate's spot (m) is taken. */
const SPOT_ROOM = 3;
/** A fight is taken to cover this near (m), once every so often (s). */
const STAND_REACH = 9;
const STAND_AGAIN = 4;
const STAND_MAX = 3;
/** Hiding from a fight it's losing: cover this near (m). */
const HIDE_REACH = 14;
const HIDE_WEIGHED = 8;
/** Enemies seen this recently (s) and this near (m) count toward being outgunned. */
const OUTGUNNED_MEMORY = 4;
const OUTGUNNED_REACH = 50;
/** More enemies than this past its own Squad and it hides. */
const OUTGUNNED_MARGIN = 2;
/** A fight is opened at any range this long (s) after being hit. */
const SHOT_MEMORY = 3;
/** A target that went out of sight this near or far (m) isn't worth a way round. */
const FLANK_RANGE: readonly [number, number] = [8, 45];
/** How wide (m) a flank swings, as a share of the range, and the least; the longest (s) it may take. */
const FLANK_SWING = 0.7;
const FLANK_LEAST = 10;
const FLANK_MAX = 9;
/** Battle Royale (ticket 64). A Revive is weighed this often (s), for a Downed squadmate this near (m). */
const REVIVE_THINK = 0.25;
const REVIVE_LOOK = 90;
/** It needs this much spare (s) on the Bleed-out, and the seat this far (m) inside the wall, now and when it'd be done. */
const REVIVE_SPARE = 1.5;
const REVIVE_WALL = 3;
/** Its Squad must have had no brush with an enemy for this long (s) first, the boldest to the most careful, while an enemy it knows of is near but out of sight. */
const REVIVE_CALM: readonly [number, number] = [2, 6];
/** The same with no enemy it knows of near: the fight is over (s). */
const REVIVE_SETTLE: readonly [number, number] = [1, 2.5];
/** An enemy known of this recently (s), believed this near (m) the seat or the bot, that could see either or the way between: not now. */
const REVIVE_KNOWN = 12;
const REVIVE_SIGHT = 80;
/** On the ground of a Battle Royale, gunfire is heard this far (m) in the open and through walls, placed roughly (by this share of the distance, and more when muffled). */
const FAR_HEARING = 120;
const FAR_MUFFLED = 60;
const FAR_BLUR = 0.12;
/** A hit from farther than {@link HEARING} or out of sight gives a direction: the bearing, this far off at most (rad), and the range only as roughly as {@link FAR_BLUR} places gunfire, twice over. */
const HIT_BEARING = 8 * DEG;
const HIT_RANGE = 2;
/** Spotting (ticket 64): seconds to notice a figure, about this plus its distance over this (m), before stance, stillness and gunfire. */
const SPOT_BASE = 0.12;
const SPOT_DISTANCE = 45;
/** One seen this recently (s) is picked up again at once. */
const REACQUIRE = 2;
/** Beyond this distance (m) the field of view is a box this wide each side: someone far off to one side goes unseen. */
const BOX = 25 * Math.tan(50 * DEG);
/** A squadmate's fresh sighting this near (m) is worth going to help with, for a bold bot. */
const HELP_RANGE = 45;
/** A squadmate's ping is news for this long (s): a bot thinking less often still turns to it. */
const PING_HEED = 3;
/** Farther than this (m), a pinged enemy is only remembered: nothing it could do about them from here. */
const PING_REACH = 100;
/** An enemy it saw before within this long (s) is no news to ping. */
const PING_NEWS = 4;
/** How far (m) each gun has a real shot at someone, for opening a fight on the ground (before a bot's boldness). */
const OPENS_AT: Readonly<Record<WeaponId, number>> = { m4a1: 55, smg: 35, shotgun: 15, sniper: 70, pistol: 25, lmg: 60, dmr: 65, burst: 50, revolver: 20 };
/** How far (m) a bot on the ground chases what it last saw or heard: the boldest farther. */
const CHASE_REACH: readonly [number, number] = [25, 70];
/** A Downed bot lies still with a mate this near (m); makes for one this near; and looks for new ground this often (s). */
const CRAWL_MATE_HERE = 3;
const CRAWL_MATE = 30;
const CRAWL_LOOK = 3;
/** How far (m) it looks for cover to crawl to. */
const CRAWL_COVER = 8;
/** Stuck on the ground: how far (m) it steps aside to. */
const STEP_ASIDE = 8;
/** Someone in the way of a run from the wall, this near (m), gets fought. */
const RUN_FIGHT = 15;
/** A Downed enemy comes this many metres behind one on its feet. */
const DOWNED_LAST = 20;
/**
 * How long (s) a bot lets a seat it sees Downed lie before finishing it, the boldest to the most careful:
 * meanwhile it watches the body for the squadmate who comes for it, as people do. Finished at once,
 * nearly every Down died where it fell and bots revived 8% of them (ticket 40).
 */
const FINISH_WAIT: readonly [number, number] = [1.5, 4.5];
/** The route key on the way round an enemy. */
const FLANK_KEY = '#flank';

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
/** A flash goes to an enemy this near (m) and no nearer, so its thrower isn't caught in it (ticket 20). */
const FLASH_RANGE = 16;
const FLASH_MIN = 5;
/** A smoke thrown to cover a retreat leaves the hand this far under level (rad): it lands a few metres toward the threat. */
const SMOKE_PITCH = -0.6;
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
  #progress: { position: Vec3; time: number } = { position: [0, 0, 0], time: 0 };
  #blocked = 0;
  /** Backing off and sidestepping to get unstuck, until then. */
  #unstickUntil = 0;
  #unstickSide = 1;
  #lastButtons = 0;
  /** The usercmd it last chose, held while it isn't thinking. */
  #held: UserCmd | null = null;
  /** The events of the ticks since it last thought, and how many ticks that is. */
  #unheard: (readonly SimEvent[])[] = [];
  /** The sound traps set off while it wasn't thinking, heard on its next thought like the events. */
  #unheardTraps: TrapSound[] = [];
  #sinceThought = 0;
  /** The tick's seats, for everything below. */
  #seats = new SeatIndex([]);
  #meleeAt = 0;
  /** A paced weapon's next press comes no sooner than this. */
  #pressAt = 0;
  #lastTime = 0;
  /** No weapon switch before then (one press at a time). */
  #switchAt = 0;
  /** A frag being cooked: where to throw it, and when it leaves the hand. */
  /** A throw under way: where to, when to let go, and what (a frag, or a tactical: ticket 20). */
  #throw: { yaw: number; pitch: number; release: number; started: number; kind: ThrowableId } | null = null;
  /** What the arc being solved is for. */
  #aimingKind: ThrowableId = 'frag';
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
  /** Metres to the next stop on a bound, and where it last counted from. */
  #bound = 0;
  #boundFrom: Vec3 = [0, 0, 0];
  /** The cover node it holds in a rally, and when it moves on. */
  #spot: number | null = null;
  #spotUntil = 0;
  /** A cover node it's fighting its way to, until when; no new one before `#standAt`. */
  #stand: { node: number; until: number } | null = null;
  #standAt = 0;
  /** The way round to an enemy that went out of sight. */
  #flank: { node: number; id: PlayerId; until: number } | null = null;
  /** When it last took a hit. */
  #shotAt = -Infinity;
  /** When a Downed bot next looks for ground. */
  #crawlAt = 0;
  /** On the way to the spot it picked, not yet holding it. */
  #walkingToSpot = false;
  /** How far along noticing each enemy in view it is (1 is noticed), and when it last looked. */
  readonly #spotting = new Map<PlayerId, number>();
  #lookedAt = 0;
  /** Blinded by a flash until this simulation time (s): it sees nobody meanwhile (ticket 20). */
  #blindUntil = -Infinity;
  /** When each enemy was last heard or seen firing: gunfire gives a body away. */
  readonly #loud = new Map<PlayerId, number>();
  /** Seats the feed (which every player sees) has shown going Down, not since Revived or out. */
  readonly #downs = new Set<PlayerId>();
  /** The Downed squadmate it has said it will Revive, when it next weighs that, and the enemy eye its way there keeps out of. */
  #reviving: PlayerId | null = null;
  #reviveAt = 0;
  /** Its primary is shot dry with nothing to reload from: the pistol stays in hand. */
  #dry = false;
  #reviveThreat: Vec3 | null = null;
  /** The ping it means to send, when it last pinged, and the pings (by their time) it has already answered. */
  #pingOut: PingRequest | null = null;
  #pingedAt = -Infinity;
  readonly #heeded = new Map<PlayerId, number>();
  #lookedOut = -Infinity;

  constructor(id: PlayerId, profile: BotProfile, nav: NavGraph, world: World) {
    this.id = id;
    this.profile = profile;
    this.#nav = nav;
    this.#world = world;
    this.#seed = hashString(`${profile.name}:${id}`);
  }

  /**
   * A new match: what it knew of the last one is no use and nobody in this one
   * could know it, so it starts afresh, as a person does.
   */
  newMatch(): void {
    this.#memory.clear();
    this.#loud.clear();
    this.#downs.clear();
    this.#spotting.clear();
    this.#reloading.clear();
    this.#dealt.clear();
    this.#dangers = [];
    this.#target = null;
    this.#chasing = null;
    this.#reviving = null;
    this.#reviveThreat = null;
    this.#shotAt = -Infinity;
    this.#lastEnemySeen = -Infinity;
    this.#unheard = [];
    this.#unheardTraps = [];
    this.#pingOut = null;
    this.#pingedAt = -Infinity;
    this.#heeded.clear();
    this.#lookedOut = -Infinity;
    // The next thought starts its life afresh, too.
    this.#alive = false;
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

  /** What the bot knows of `id`: where, when (s), and whether it saw them rather than heard or was told (tests and soaks). */
  recall(id: PlayerId): { readonly position: Vec3; readonly time: number; readonly seen: boolean } | null {
    return this.#memory.get(id) ?? null;
  }

  /** The ping it decided on in its last thought (an enemy it just spotted), taken once; the server checks and sends it as a person's. */
  takePing(): PingRequest | null {
    const ping = this.#pingOut;
    this.#pingOut = null;
    return ping;
  }

  /** The danger spots the bot keeps in mind, newest first (tests and debugging). */
  get dangers(): readonly Vec3[] {
    return this.#dangers.filter((d) => this.#lastTime - d.time < DANGER_MEMORY).map((d) => d.position);
  }

  /** What the bot is up to, for tests and debugging. */
  get activity(): 'use' | 'flee' | 'throw' | 'cover' | 'flank' | 'fight' | 'chase' | 'search' | 'hold' | 'roam' {
    if (this.#using) return 'use';
    if (this.#flee) return 'flee';
    if (this.#throw) return 'throw';
    if (this.#recover) return 'cover';
    if (this.#flank) return 'flank';
    if (this.#target) return 'fight';
    if (this.#chasing && this.#chasing !== OBJECTIVE_KEY) return 'chase';
    if (this.#search && this.#search.until > this.#lastTime) return 'search';
    // Watching from a spot by the rally is a hold too, standing or not.
    if (this.#spot !== null && !this.#walkingToSpot && this.#spotUntil > this.#lastTime) return 'hold';
    return this.#holdUntil > this.#lastTime ? 'hold' : 'roam';
  }

  /** The bot's usercmd for this tick. */
  think(sees: BotView): UserCmd {
    this.#sinceThought += 1;
    const every = sees.thinkEvery ?? 1;
    if ((sees.rest || (every > 1 && (sees.tick + this.#seed) % every !== 0)) && this.#held && sees.self.alive && this.#alive && !this.#delicate(sees.self)) {
      if (sees.events.length > 0) this.#unheard.push(sees.events);
      if (sees.sounds) this.#unheardTraps.push(...sees.sounds);
      return this.#held;
    }
    // A first thought plans a route too, so it waits as well, standing as it is.
    if (sees.rest && !this.#held && sees.self.alive) return usercmd({ forward: 0, right: 0, yaw: sees.self.yaw, pitch: sees.self.pitch, buttons: [] });
    const ticks = this.#sinceThought;
    this.#sinceThought = 0;
    // What it missed meanwhile, it hears now.
    const missed = this.#unheardTraps.length > 0 ? { sounds: [...this.#unheardTraps, ...(sees.sounds ?? [])] } : {};
    const heard = this.#unheard.length > 0 || this.#unheardTraps.length > 0 ? { ...sees, events: [...this.#unheard.flat(), ...sees.events], ...missed } : sees;
    this.#unheard = [];
    this.#unheardTraps = [];
    this.#seats = heard.seats ?? new SeatIndex(heard.players);
    this.#readFeed(heard.events);
    for (const e of heard.events) if (e.type === 'flashed' && e.player === sees.self.id) this.#blindUntil = Math.max(this.#blindUntil, sees.time + e.duration);
    const view = heard.ground ? this.#groundJob(this.#reviveChoice(heard)) : heard;
    const seconds = ticks * TICK_SECONDS;
    const { self, time } = view;
    this.#lastTime = time;
    const r = (n: number) => noise(this.#seed, view.tick, n);
    if (!self.alive || self.downed) {
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
      this.#stand = null;
      this.#flank = null;
      this.#spot = null;
      return self.alive && view.ground ? this.#crawl(view, seconds) : this.#cmd(0, 0, []);
    }
    if (!this.#alive || flat(self.position, this.#lastPos) > 3) this.#reset(view);
    this.#alive = true;
    this.#lastPos = self.position;
    const eye = eyeOf(self);

    // The sum passed a multiple of the interval: a bot thinking every tick looks on exactly that tick, one that isn't on the next it thinks.
    const beat = view.tick + this.#seed;
    const perceiving = Math.floor(beat / PERCEIVE_TICKS) !== Math.floor((beat - ticks) / PERCEIVE_TICKS);
    if (perceiving) {
      if (view.ground || view.intel) this.#takeIntel(view, r);
      this.#perceive(view, eye, r);
      this.#check = this.#angleToCheck(view, eye);
    }
    this.#hear(view);
    this.#listen(view, eye, perceiving);
    if (this.#target || (this.#search && time >= this.#search.until)) this.#search = null;
    const caution = (this.#caution = this.#weigh(view));
    const ground = view.ground ?? null;
    const hurry = view.objective?.hurry === true || ground?.hurry === true;
    if (this.#flank && (hurry || this.#target?.visible || time >= this.#flank.until)) this.#flank = null;

    // The fight: keep it while the target lives and was seen moments ago.
    let target = this.#target;
    const tp = target ? this.#seats.get(target.id) : undefined;
    if (target && (!tp || !tp.alive || (!target.visible && time - target.lastSeen > LOSE_TARGET))) {
      // Out of sight, not dead: a careful bot holds the angle they went behind, for them to come back round, rather than chase.
      // On the ground of a Battle Royale, the bolder go round to them instead.
      if (tp?.alive && ground && !hurry && !this.#recover && this.#flanks(view, tp, r)) {
        this.#holdUntil = 0;
      } else if (tp?.alive && caution > 0.55 && !this.#recover && !hurry) {
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
      const memory = Math.max(TRAIL, this.profile.perceptionLag + 2 * STEADY);
      while (target.trail.length > 1 && target.trail[0]!.time < time - memory) target.trail.shift();
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
      const hurt = self.health < HURT + HURT_CAREFUL * caution;
      if (ground ? (hurt && theirs > self.health) || this.#outgunned(view, ground) : hurt && theirs > self.health + 10) this.#breakOff(view, eyeOf(tp));
    }
    if (ground && perceiving && fighting && target?.visible && tp && !using && !hurry && !this.#recover && !this.#stand && time >= this.#standAt && range > POINT_BLANK && !tactics.push) this.#takeStand(view, tp, range);
    if (this.#stand && (time >= this.#stand.until || this.#recover)) this.#stand = null;
    const retreating = this.#recover !== null && !this.#recover.arrived;
    if (using || this.#throw || fighting) this.#aiming = null;
    else if (this.#aiming) this.#aim(view);
    else if (perceiving) this.#considerThrow(view, eye);

    // Where to look.
    // The view is the usercmd plus recoil and flinch; follow that offset, a little late.
    const follow = 1 - Math.exp(-seconds / (0.03 + 0.25 * (1 - this.profile.recoilControl)));
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
    } else if (this.#throw?.kind === 'smoke') {
      // A smoke to cover the way out: a glance back at the threat to lob it, then on (ticket 20).
      lookYaw = this.#throw.yaw;
      lookPitch = this.#throw.pitch;
    } else if (retreating || (ground?.hurry && !(fighting && target?.visible && range < RUN_FIGHT))) {
      // Running for cover, or from the wall: eyes on the way.
      const ahead = this.#lookAhead(self.position);
      if (ahead) lookYaw = yawTo(self.position, ahead);
      lookPitch = 0;
    } else if (fighting && target && tp) {
      // Out of sight for a moment: keep aiming where it was last seen.
      const last = this.#memory.get(tp.id)?.position ?? tp.position;
      // Aim where the target was a moment ago, carried on the way it was moving then: a person's eye and hand
      // lag behind what moves and follow its motion, so they keep up with a steady strafe and fall behind when it turns.
      const row = moddedRow(self.weapon.id, kitInHand(self.loadout, self.weapon));
      const flight = range / row.handling.muzzleVelocity.value;
      const seen = this.#perceived(target, tp, time, flight);
      const point: Vec3 = target.visible ? zoneCentre(seen, target.zone) : [last[0], last[1] + 1.4, last[2]];
      const aim = anglesOf([point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]]);
      const settle = Math.exp(-seconds / SETTLE);
      const p = this.profile;
      // A scope magnifies the picture, so the same unsteady hand is off by less of an angle.
      const magnified = 1 + (row.handling.zoom.value - 1) * self.weapon.ads;
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
      ads = range > (tactics.ads ?? p.adsRange) && self.movement !== 'sprint';
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
        // A round a press that pays for where it lands (a marksman rifle far off, a revolver's six): inside the torso too, without the wait for a steady target.
        const paced = tactics.pace !== null && range > tactics.pace[0];
        const width = careful || paced ? 0.2 : 0.32;
        const tolerance = Math.atan2(width, Math.max(range, 1)) + (ads ? (careful ? 0.1 : paced ? 0.2 : 0.4) : 1.2) * DEG;
        // Sight is checked a few times a second; a shot checks it again, so a target that just stepped behind cover isn't shot through it.
        const clear = () => botSees(this.#world, eye, zoneCentre(pose(tp), 'head')) || botSees(this.#world, eye, zoneCentre(pose(tp), 'upperTorso'));
        // And only once the aim has settled on the body and the target has moved steadily for a moment, so the lead is right.
        const lined = Math.hypot(target.errYaw, target.errPitch) < Math.atan2(width, Math.max(range, 1));
        const steady = !careful || (lined && this.#steady(target, time));
        // Sights on the way up: wait for them rather than spray the first rounds (the M4A1 keeps the profiles' tuned habit).
        const sighted = !ads || tactics.range === null || self.weapon.ads >= SIGHTED;
        const ready = steady && sighted && (!tactics.scoped || (self.weapon.ads >= SCOPED_IN && speed < STOPPED));
        if (off < tolerance && self.weapon.ammo > 0 && range <= tactics.reach && ready && clear()) {
          if (mode !== 'auto') {
            // One round (or one burst) a press: release, then press again, a paced one once its wait is over.
            fire = !(this.#lastButtons & Button.Fire) && time >= this.#pressAt;
            if (fire && paced) this.#pressAt = time + tactics.pace![1];
          } else if (range > this.profile.burstRange) {
            if (time >= target.pauseUntil && time >= target.burstUntil) {
              target.burstUntil = time + (0.22 + 0.25 * r(11)) * this.profile.burst * (range <= LONG_BURSTS_WITHIN ? tactics.burst : 1);
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
    this.#turn(lookYaw, lookPitch, rate, seconds);

    // Where to go.
    let move: Vec3 | null = null;
    let backOff = false;
    if (using) {
      // Standing still with use held.
      buttons.push('Use');
    } else if (this.#flee) {
      move = this.#fleeStep(view);
    } else if ((this.#throw && this.#throw.kind !== 'smoke') || this.#aiming) {
      // Standing still to aim and throw (a smoke thrown to cover a retreat goes on the move).
    } else if (retreating) {
      move = this.#advance(self, this.#nav.nodes[this.#recover!.node]!.position);
    } else if (ground?.hurry && !(fighting && target?.visible && range < RUN_FIGHT)) {
      // The wall: nothing else matters unless someone's in the way.
      move = this.#follow(view, ground.rally, OBJECTIVE_KEY);
    } else if (this.#flank) {
      move = this.#flanking(view);
    } else if (this.#stand) {
      move = this.#advance(self, this.#nav.nodes[this.#stand.node]!.position);
      if (move === null) this.#stand = null;
    } else if (fighting && target && tp) {
      // With the target in view, a bot closes in only beyond the distance its weapon holds at: walking straight at a gun is the easiest shot there is.
      const holdAt = tactics.hold ?? want + (tactics.rush !== null && tactics.rush < 12 ? 0.5 : 2);
      // Someone heard (or seen) reloading is worth rushing, for a bot with the stomach for it.
      const reloading = (this.#reloading.get(tp.id) ?? -Infinity) > time && this.profile.aggression > 0.45 && !tactics.scoped;
      // In cover to heal, it fights whoever comes from there, and goes nowhere.
      const closeIn = !this.#recover && (rushing || reloading || !target.visible || (!tactics.scoped && range > holdAt));
      // Sent to take a zone: a lane held from outside it never takes it, so on in while fighting.
      const taking = order?.take === true && !tactics.scoped && !this.#recover && flat(self.position, order.position) > order.radius * 0.7;
      if (taking) move = this.#follow(view, order.position, OBJECTIVE_KEY);
      // Closing in to fight up close: by the way the target can't see.
      else if (closeIn) move = this.#follow(view, this.#memory.get(tp.id)?.position ?? tp.position, tp.id, tactics.push ? eyeOf(tp) : null);
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
      if ((target.crouch && range > 14 && !move) || (ground && self.weapon.action === 'reload')) buttons.push('Crouch');
    } else if (this.#recover) {
      // Down behind cover until healed.
      buttons.push('Crouch');
    } else {
      const chase = this.#chasing ? this.#memory.get(this.#chasing) : undefined;
      const leashed = (at: Vec3) => (ground && order === null ? flat(at, self.position) < this.#chaseReach() : order === null || flat(at, order.position) < order.radius + OBJECTIVE_LEASH);
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
        // Off to the objective, by the quickest way; to a Revive, out of sight of the enemy it knows of where there's a way.
        move = this.#follow(view, order.position, OBJECTIVE_KEY, this.#reviving ? this.#reviveThreat : null);
        this.#holdUntil = 0;
      } else if (ground) {
        move = this.#useGround(view, ground, r, buttons);
      } else if (time >= this.#holdUntil) {
        move = this.#roam(view, r);
      } else if (this.#holdCrouch) buttons.push('Crouch');
    }

    // Steering: the move direction in the bot's own frame.
    let forward = backOff ? -0.8 : 0;
    // In cover to heal it stays put: a strafe there walks it back out into sight.
    let right = fighting && !this.#throw && !using && !this.#recover?.arrived ? this.#strafe * (ads ? 1 : 0.8) : 0;
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
      if ((this.#flee || retreating || (ground?.hurry && !fighting)) && forward > 0.5 && !climbing && !laddering) buttons.push('Sprint');
      else if ((rushing || (fighting && tactics.push && target?.visible === false)) && forward > 0.5 && !climbing && !laddering) {
        // Weaving a little on the way in.
        right = 0.35 * Math.sin(time * 2.6 + (this.#seed % 13));
        buttons.push('Sprint');
      } else if (creeping && !laddering) {
        buttons.push('Crouch');
      } else if (!fighting && long && forward > 0.8 && !climbing && !laddering && !quiet) {
        buttons.push('Sprint');
        if (self.movement === 'sprint' && time > this.#slideUntil + 3 && r(16) < this.profile.slide) this.#slideUntil = time + 0.5;
      }
      if (time < this.#slideUntil && !laddering) buttons.push('Crouch');
      // Up a climb link, or held up on the way to higher ground (a kerb of rubble, a sill the nav walked): jump, which mantles where there's a ledge.
      // Not at or on a ladder, where Jump would keep it from taking hold or throw it off; standing, as a mantle needs;
      // not in a fight, where standing still is strafing, not stuck, and a mantle would go where it aims rather than its route.
      const wedged = this.#stuck(view, r) && !fighting && !laddering && self.movement !== 'ladder' && self.stance === 'stand';
      if (((climbing && this.#blocked >= 2) || wedged) && !(this.#lastButtons & Button.Jump)) buttons.push('Jump');
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
    // A primary with nothing left to reload from (a Supply Drop's sniper, shot dry) is put away for good.
    const dry = w.slot === 0 && w.ammo === 0 && w.reserve === 0;
    if (w.slot === 0 && !dry) this.#dry = false;
    else if (dry) this.#dry = true;
    const toPistol = w.slot === 0 && w.ammo === 0 && ((fighting && target?.visible === true && range < PISTOL_RANGE) || dry);
    const toPrimary = w.slot === 1 && !fighting && time - this.#lastEnemySeen > 2 && !this.#dry;
    const switching = (toPistol || toPrimary) && !busy && time >= this.#switchAt && !(this.#lastButtons & Button.SwitchWeapon);
    if (switching) {
      buttons.push('SwitchWeapon');
      this.#switchAt = time + 1;
    }
    // Reload in a quiet moment, or when empty, or once in cover (whatever is left in the magazine).
    const covered = this.#recover?.arrived === true && !(fighting && target?.visible) && w.ammo < this.profile.reloadBelow * 2;
    if (!switching && !toPistol && w.action === 'ready' && ((w.ammo < this.profile.reloadBelow && !fighting && time - this.#lastEnemySeen > 1) || w.ammo === 0 || covered) && !(this.#lastButtons & Button.Reload)) buttons.push('Reload');
    const holding = using ? null : this.#cooking(view);
    if (holding) buttons.push(holding === 'frag' ? 'Grenade' : 'Tactical');

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
    this.#held = cmd;
    return cmd;
  }

  /** On a ladder or a ledge, or about to be, where a step too far misses the way: these take every tick, however far off anybody is. */
  #delicate(self: PlayerOutput): boolean {
    if (self.movement === 'ladder' || self.movement === 'mantle') return true;
    const at = this.#path[this.#step];
    if (at === undefined) return false;
    const after = this.#path[this.#step + 1];
    const next = after === undefined ? null : linkKind(this.#nav, at, after);
    const leg = this.#nextLink();
    return this.#nav.nodes[at]!.precise || next === 'climb' || next === 'ladder' || leg === 'climb' || leg === 'ladder';
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
    this.#spot = null;
    this.#stand = null;
    this.#flank = null;
    this.#bound = 0;
    this.#boundFrom = view.self.position;
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
    const flash = self.loadout.tactical === 'flash' && self.tacticals > 0;
    if ((self.grenades <= 0 && !flash) || self.grenade !== null || time < this.#nextThrow || self.movement === 'mantle') return;
    for (const [id, m] of this.#memory) {
      const d = flat(self.position, m.position);
      // A flash (ticket 20) for one close by, before a push: a bold bot reaches for it first, and any bot when out of frags.
      const flashing = flash && d <= FLASH_RANGE && d >= FLASH_MIN && (self.grenades <= 0 || this.profile.aggression >= 0.5);
      if (!m.seen || time - m.time > THROW_MEMORY || d > THROW_RANGE || (d < THROW_MIN && !flashing)) continue;
      if (!flashing && self.grenades <= 0) continue;
      const p = this.#seats.get(id);
      if (!p?.alive) continue;
      const body: Vec3 = [m.position[0], m.position[1] + 1, m.position[2]];
      if (!sightBlocked(this.#world, eye, body)) continue;
      // Tried either way: no fresh look for a moment.
      this.#nextThrow = time + 2;
      this.#aimingKind = flashing ? 'flash' : 'frag';
      // A flash is aimed to go off over them, as it gets there; a frag to land by them as its cooked fuse runs out.
      this.#aiming = new ThrowSolve(this.#world, eye, flashing ? body : m.position, flashing ? STATS.tactical.flash.fuse.value : STATS.grenade.fuse.value - COOK);
      this.#aim(view);
      return;
    }
  }

  /**
   * A smoke (ticket 20) between it and `threat` as it breaks off to heal: a
   * short throw low toward them, so the cloud stands across the way they'd
   * see it go.
   */
  #smokeOff(view: BotView, threat: Vec3): void {
    const { self, time } = view;
    if (self.loadout.tactical !== 'smoke' || self.tacticals <= 0 || self.grenade !== null || this.#throw || self.movement === 'mantle') return;
    const yaw = Math.atan2(-(threat[0] - self.position[0]), -(threat[2] - self.position[2]));
    this.#aiming = null;
    this.#throw = { yaw, pitch: SMOKE_PITCH, release: time + 0.1, started: time, kind: 'smoke' };
  }

  /** Aims the throw a few more arcs; once found, one that lands close enough is cooked and thrown. */
  #aim(view: BotView): void {
    const solve = this.#aiming!;
    const { self, time } = view;
    const kind = this.#aimingKind;
    if ((kind === 'frag' ? self.grenades : self.tacticals) <= 0 || self.grenade !== null || self.movement === 'mantle') {
      this.#aiming = null;
      return;
    }
    const budget = view.budget ?? { arcs: THROW_ARCS_PER_TICK };
    budget.arcs -= solve.step(budget.arcs);
    if (!solve.done) return;
    this.#aiming = null;
    const arc = solve.best;
    if (arc.miss > THROW_MISS) return;
    this.#throw = { yaw: arc.yaw, pitch: arc.pitch, release: time + (kind === 'frag' ? COOK : 0.1), started: time, kind };
    this.#holdUntil = 0;
  }

  /** What to hold the throw button for this tick (null: nothing): through the cook, until the view is on the arc. */
  #cooking(view: BotView): ThrowableId | null {
    const t = this.#throw;
    if (!t) return null;
    const { self, time } = view;
    // The press didn't take (the weapon was busy): give up.
    if (time > t.started + 0.3 && self.grenade === null) {
      this.#throw = null;
      return null;
    }
    const aimed = Math.abs(angleDelta(self.yaw, t.yaw)) < 0.6 * DEG && Math.abs(self.pitch - t.pitch) < 0.6 * DEG;
    // A frag cooked too long goes off in the hand; a tactical only waits so long on the aim.
    const late = time - t.started > (t.kind === 'frag' ? STATS.grenade.fuse.value - 0.8 : 1.5);
    if (self.grenade?.phase === 'cook' && ((time >= t.release && aimed) || late)) {
      this.#throw = null;
      if (t.kind !== 'smoke') this.#nextThrow = time + THROW_PAUSE;
      return null;
    }
    return t.kind;
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
      // A frag is run from; a smoke or a flash isn't worth the run.
      if (this.#flee?.grenade === g.id || (g.kind !== undefined && g.kind !== 'frag')) continue;
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
    for (const i of nodesNear(this.#nav, from, FLEE_SEARCH)) {
      const n = nodes[i]!;
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
  #turn(yaw: number, pitch: number, rate: number, seconds: number): void {
    const max = rate * seconds;
    const ease = 1 - Math.exp(-EASE * seconds);
    const dy = angleDelta(this.#lookYaw, yaw);
    const dp = pitch - this.#lookPitch;
    const step = (d: number) => Math.sign(d) * Math.min(Math.abs(d), Math.max(Math.abs(d) * ease, 0.4 * DEG * (seconds / TICK_SECONDS)), max);
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
    let best: { p: PlayerOutput; score: number; chest: boolean } | null = null;
    let keep = false;
    let fell: PlayerOutput | null = null;
    const wait = FINISH_WAIT[0] + (FINISH_WAIT[1] - FINISH_WAIT[0]) * (1 - this.profile.aggression);
    const ground = view.ground ?? null;
    const looked = Math.max(0, Math.min(0.5, time - this.#lookedAt));
    this.#lookedAt = time;
    const noticing = ground ? new Set<PlayerId>() : null;
    // Blinded by a flash: nobody is seen, and the fight goes on from memory (it may still fire where it last saw them).
    const blind = time < this.#blindUntil;
    for (const i of this.#seats.near(self.position, SIGHT_RANGE)) {
      const p = view.players[i]!;
      if (blind || p.id === self.id || !p.alive || !view.isEnemy(p)) continue;
      const d = flat(self.position, p.position);
      if (d > SIGHT_RANGE) continue;
      const off = Math.abs(angleDelta(self.yaw, yawTo(eye, eyeOf(p))));
      const tracked = this.#target?.id === p.id;
      // On the ground of a Battle Royale the view is a box at range: far off to one side goes unseen.
      const fov = tracked ? TRACK_FOV : ground && d > BOX / Math.tan(FOV) ? Math.atan2(BOX, d) : FOV;
      if (d > SENSE && off > fov) continue;
      const head = zoneCentre(pose(p), 'head');
      const chest = zoneCentre(pose(p), 'upperTorso');
      const chestSeen = botSees(this.#world, eye, chest);
      if (!chestSeen && !botSees(this.#world, eye, head)) continue;
      if (noticing && !tracked && d > SENSE) {
        // Noticing takes a moment, more for someone far off, low or still, much less for one firing or called out.
        const known = this.#memory.get(p.id);
        if (!(known?.seen && time - known.time < REACQUIRE)) {
          noticing.add(p.id);
          const meter = (this.#spotting.get(p.id) ?? 0) + looked * this.#spotRate(view, p, d, off);
          if (meter < 1) {
            this.#spotting.set(p.id, meter);
            continue;
          }
          this.#spotting.delete(p.id);
        }
      }
      const before = this.#memory.get(p.id);
      this.#memory.set(p.id, { position: p.position, time, seen: true, velocity: p.velocity });
      ground?.intel.report(p.id, { position: p.position, time, seen: true, velocity: p.velocity, by: self.id });
      if (!(before?.seen && time - before.time < PING_NEWS)) this.#pingSeen(view, p);
      // A reload in plain view.
      if (p.weapon.action === 'reload') this.#reloading.set(p.id, time + 1);
      this.#lastEnemySeen = time;
      // Downed a moment ago: left to lie while the bot watches for who comes for them.
      if (p.downed && STATS.royale.bleedOut.value - p.downed.bleedOut < wait) {
        if (tracked) fell = p;
        continue;
      }
      if (tracked) keep = true;
      // Someone who isn't after it, beyond where its gun has a real shot (farther for the bold), it lets go by rather than give itself away.
      if (ground && !tracked && d > this.#opensAt(TACTICS[self.weapon.id], self.weapon.id) && time - this.#shotAt > SHOT_MEMORY) continue;
      const score = d + off * 12 + (p.downed ? DOWNED_LAST : 0);
      if (!best || score < best.score) best = { p, score, chest: chestSeen };
    }
    if (noticing) for (const id of this.#spotting.keys()) if (!noticing.has(id)) this.#spotting.delete(id);
    if (fell && !best) {
      // Its own target went down and nobody else is in view: eyes on the body until it's time to finish it.
      this.#target = null;
      this.#chasing = null;
      this.#holdUntil = time + wait - (STATS.royale.bleedOut.value - fell.downed!.bleedOut);
      this.#holdYaw = yawTo(self.position, fell.position);
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
      // Off by more on a target on the move, while on the move itself, and when just hit (Battle Royale).
      const situation = ground ? 1 + 0.4 * Math.min(1, Math.hypot(best.p.velocity[0], best.p.velocity[2]) / 5) + (Math.hypot(self.velocity[0], self.velocity[2]) > 2 ? 0.3 : 0) + (time - this.#shotAt < 1 ? 0.3 : 0) : 1;
      const e = p.aimError * (1 + Math.min(d, 40) / 40) * situation;
      // Someone at the edge of view or far off takes longer to notice (on the ground of a Battle Royale, the spotting above did that).
      const notice = ground ? 0 : 0.22 * Math.min(1, off / FOV) ** 2 + (0.15 * Math.min(d, 50)) / 50;
      // A big turn onto them sometimes swings past before settling back.
      const turn = angleDelta(self.yaw, yawTo(eye, eyeOf(best.p)));
      const swing = Math.abs(turn) > 25 * DEG && r(6) < p.overshoot ? Math.sign(turn) * (2 + 4 * r(7)) * DEG : 0;
      this.#target = {
        id: best.p.id,
        trail: [],
        react: time + p.reaction * (0.85 + 0.35 * r(1)) + notice,
        // Only a head over the cover: that's what it aims at.
        zone: r(2) < p.headshots || (ground !== null && !best.chest) ? 'head' : 'upperTorso',
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

  /** What the feed shows every player: who went Down, who got up, who is out (and so makes no more noise). */
  #readFeed(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'down') this.#downs.add(e.victim);
      else if (e.type === 'revive') this.#downs.delete(e.target);
      else if (e.type === 'kill') {
        this.#downs.delete(e.victim);
        this.#loud.delete(e.victim);
      }
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
      if (e.type !== 'shot' && e.type !== 'hit' && e.type !== 'reload' && e.type !== 'kill') continue;
      const r = (n: number) => noise(this.#seed, view.tick, 100 + k * 8 + n);
      if (e.type === 'shot' && e.shooter !== self.id) {
        const ground = view.ground ?? null;
        // A suppressor carries half as far, a compensator farther (ticket 19).
        const loud = shotLoudness(e.muzzle);
        const d = flat(self.position, e.origin);
        if (d > (ground ? FAR_HEARING : HEARING) * loud) continue;
        const shooter = this.#seats.get(e.shooter);
        if (!shooter || !view.isEnemy(shooter)) continue;
        const muffled = d > SENSE && sightBlocked(this.#world, eye, e.origin);
        if (d > (ground ? (muffled ? FAR_MUFFLED : FAR_HEARING) : muffled ? MUFFLED_HEARING : HEARING) * loud) continue;
        this.#loud.set(e.shooter, time);
        const known = this.#memory.get(e.shooter);
        // Near, it's placed as before; farther off on the island, only roughly: a bearing and about how far.
        const rough = ground && d > HEARING ? d * FAR_BLUR * (muffled ? 1.6 : 1) : 0;
        const heard = muffled || rough > 0 ? blur(shooter.position, 2 + 4 * r(0) + rough, r(1), 1) : shooter.position;
        if (!known || !known.seen || time - known.time > 1) {
          this.#memory.set(e.shooter, { position: heard, time, seen: false, velocity: STILL });
          ground?.intel.report(e.shooter, { position: heard, time, seen: false, velocity: STILL, by: self.id }, d <= HEARING);
        }
        if (!this.#target && !this.#chasing && (!ground || d < this.#chaseReach())) this.#chasing = e.shooter;
      } else if (e.type === 'hit' && e.shooter === self.id && e.victim !== self.id) {
        const before = this.#dealt.get(e.victim);
        const kept = before && time - before.time < DEALT_MEMORY ? before.damage : 0;
        this.#dealt.set(e.victim, { damage: kept + e.damage, time });
      } else if (e.type === 'hit' && e.victim === self.id && e.shooter !== self.id) {
        const shooter = this.#seats.get(e.shooter);
        if (!shooter) continue;
        this.#shotAt = time;
        // Whoever is hitting it gives themselves away: the flash is where it looks.
        this.#loud.set(e.shooter, time);
        // Near and in sight, the flash places them; from far off or out of sight, a hit gives a direction and a rough guess at the range.
        const d = flat(self.position, shooter.position);
        const unseen = sightBlocked(this.#world, eye, eyeOf(shooter));
        const rough = d > HEARING || unseen ? d * FAR_BLUR * (unseen ? 1.6 : 1) * HIT_RANGE : 0;
        let felt: Vec3;
        if (rough === 0) felt = blur(shooter.position, 1 + 3 * r(2), r(3), 1);
        else {
          const bearing = Math.atan2(shooter.position[0] - self.position[0], shooter.position[2] - self.position[2]) + (r(2) - 0.5) * 2 * HIT_BEARING;
          const range = Math.max(SENSE, d + (r(3) - 0.5) * 2 * rough);
          felt = [self.position[0] + Math.sin(bearing) * range, shooter.position[1], self.position[2] + Math.cos(bearing) * range];
        }
        this.#memory.set(e.shooter, { position: felt, time, seen: false, velocity: STILL });
        view.ground?.intel.report(e.shooter, { position: felt, time, seen: false, velocity: STILL, by: self.id });
        if (!this.#target) {
          this.#alert = { yaw: yawTo(eye, eyeOf(shooter)) + (r(4) - 0.5) * 50 * DEG, until: time + 1.2 };
          this.#chasing = e.shooter;
          this.#holdUntil = 0;
        }
      } else if (e.type === 'reload' && e.phase === 'start' && e.player !== self.id) {
        const p = this.#seats.get(e.player);
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
    if (view.sounds) this.#hearTraps(view, view.sounds);
  }

  /**
   * A sound trap going off says someone ran past it: the bot learns about
   * where (the trap's spot, rougher the farther off), not who it saw, and a
   * near one turns its head that way.
   */
  #hearTraps(view: BotView, sounds: readonly TrapSound[]): void {
    const { self, time } = view;
    for (const [k, e] of sounds.entries()) {
      const d = flat(self.position, e.position);
      if (d > TRAP_HEARD) continue;
      // Of those who ran past, the first enemy: a squadmate beside them doesn't hide them.
      const p = e.players.map((id) => this.#seats.get(id)).find((o) => o !== undefined && o.id !== self.id && view.isEnemy(o));
      if (!p) continue;
      const known = this.#memory.get(p.id);
      if (known?.seen && time - known.time < 1) continue;
      const r = (n: number) => noise(this.#seed, view.tick, 700 + k * 4 + n);
      // About where the trap is, on the ground under it: birds call from the canopy, but nobody runs up there.
      const ground = this.#world.terrain?.heightAt(e.position[0], e.position[2]) ?? e.position[1];
      const heard = blur([e.position[0], Math.min(e.position[1], ground), e.position[2]], 3 + d * FAR_BLUR * 2 * r(0), r(1), 1);
      this.#memory.set(p.id, { position: heard, time, seen: false, velocity: STILL });
      view.ground?.intel.report(p.id, { position: heard, time, seen: false, velocity: STILL, by: self.id }, d <= HEARING);
      if (this.#target || this.#chasing || d > HEARING) continue;
      this.#alert = { yaw: yawTo(eyeOf(self), heard) + (r(2) - 0.5) * 30 * DEG, until: time + 1 };
      if (r(3) < this.profile.aggression * 0.5) this.#chasing = p.id;
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
    const killer = this.#seats.get(e.killer);
    if (!killer || !view.isEnemy(killer)) return;
    const own = e.victim === self.id;
    const victim = this.#seats.get(e.victim);
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
      const sides = this.#seats.sides(self.team);
      const mates = sides.own - 1;
      const foes = sides.others;
      if (mates === 0 && foes > 0) c += 0.15;
      c -= 0.1 * Math.max(-2, Math.min(3, mates + 1 - foes));
    }
    c += (1 - self.health / 100) * 0.4;
    if (this.#dangers.some((d) => time - d.time < 8 && flat(d.position, self.position) < 20)) c += 0.15;
    if (view.objective?.hurry || view.ground?.hurry) c -= 0.6;
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
    const node = (view.ground ? this.#hide(self.position, threat) : null) ?? this.#shelter(self.position, threat);
    if (node === null) {
      this.#recoverAt = time + 1;
      return;
    }
    this.#recover = { node, threat, until: time + RECOVER_MAX, arrived: false };
    this.#smokeOff(view, threat);
    this.#holdUntil = 0;
    this.#search = null;
    this.#chasing = null;
    this.#stand = null;
    this.#flank = null;
    this.#plan(self.position, node, view, true, threat);
  }

  /** The nearest cover sheltered from `threat`, not toward it, that truly hides a body from there. */
  #hide(from: Vec3, threat: Vec3): number | null {
    const away = flat(from, threat);
    let tried = 0;
    for (const { node } of coverNear(this.#nav, from, HIDE_REACH, threat)) {
      const n = this.#nav.nodes[node]!.position;
      if (Math.abs(n[1] - from[1]) > 2.5 || flat(n, threat) < away - 2) continue;
      if (tried++ >= HIDE_WEIGHED) break;
      if (!botSees(this.#world, threat, [n[0], n[1] + 0.9, n[2]])) return node;
    }
    return null;
  }

  /** More enemies have been seen lately than its Squad can answer. */
  #outgunned(view: BotView, ground: GroundOrder): boolean {
    const { self, time } = view;
    let enemies = 0;
    for (const [id, m] of this.#memory) if (m.seen && time - m.time < OUTGUNNED_MEMORY && flat(m.position, self.position) < OUTGUNNED_REACH && this.#seats.get(id)?.alive) enemies += 1;
    return enemies > ground.mates + OUTGUNNED_MARGIN - 1;
  }

  /** Fights from cover if there's some a step or two away and it isn't behind any: on the move there, still shooting. */
  #takeStand(view: BotView, tp: PlayerOutput, range: number): void {
    const { self, time } = view;
    this.#standAt = time + STAND_AGAIN;
    const spots = coverNear(this.#nav, self.position, STAND_REACH, tp.position);
    if (spots.length === 0 || spots[0]!.distance < 1.2) return;
    const spot = spots.find((s) => flat(this.#nav.nodes[s.node]!.position, tp.position) > range - 3);
    if (!spot) return;
    this.#stand = { node: spot.node, until: time + STAND_MAX };
    this.#plan(self.position, spot.node, view);
  }

  /** Whether to go round to `tp`, who just went out of sight; if so, starts on the way, out of their sight where it can. */
  #flanks(view: BotView, tp: PlayerOutput, r: (n: number) => number): boolean {
    const { self, time } = view;
    const last = this.#memory.get(tp.id)?.position ?? tp.position;
    const range = flat(self.position, last);
    if (range < FLANK_RANGE[0] || range > FLANK_RANGE[1] || this.#flank) return false;
    // Flankers always do, others as bold as they are; in a Squad the second seat goes while the first keeps them busy.
    const slot = view.ground!.slot;
    const style = this.profile.style === 'flanker' ? 1 : this.profile.aggression;
    if (r(81) > style * (slot % 2 === 1 ? 1.4 : 1)) return false;
    const [dx, dz] = [(last[0] - self.position[0]) / range, (last[2] - self.position[2]) / range];
    const swing = Math.max(FLANK_LEAST, range * FLANK_SWING);
    const side = r(82) < 0.5 ? 1 : -1;
    const eye: Vec3 = [last[0], last[1] + 1.5, last[2]];
    for (const way of [side, -side]) {
      const at: Vec3 = [last[0] - dz * way * swing - dx * range * 0.15, last[1], last[2] + dx * way * swing - dz * range * 0.15];
      const node = nearestNode(this.#nav, this.#world, at);
      const p = this.#nav.nodes[node]!.position;
      if (Math.abs(p[1] - self.position[1]) > 4) continue;
      this.#flank = { node, id: tp.id, until: time + FLANK_MAX };
      this.#chasing = FLANK_KEY;
      this.#plan(self.position, node, view, true, eye);
      return true;
    }
    return false;
  }

  /** On the way round; there, it comes in on where the enemy was. */
  #flanking(view: BotView): Vec3 | null {
    const flank = this.#flank!;
    const at = this.#nav.nodes[flank.node]!.position;
    const move = this.#advance(view.self, at);
    if (move !== null) return move;
    this.#flank = null;
    const m = this.#memory.get(flank.id);
    if (m) {
      this.#memory.set(flank.id, { ...m, time: view.time });
      this.#chasing = flank.id;
    }
    return null;
  }

  /** How far (m) it opens a fight on someone not after it, on the ground of a Battle Royale: its gun's real reach, by its own boldness, the same all match. */
  #opensAt(tactics: Tactics, weapon: WeaponId): number {
    return Math.min(SIGHT_RANGE, OPENS_AT[weapon] * (0.7 + 0.6 * this.profile.aggression), tactics.reach);
  }

  /** How far (m) it chases on the ground of a Battle Royale: its own boldness, the same all match. */
  #chaseReach(): number {
    return CHASE_REACH[0] + (CHASE_REACH[1] - CHASE_REACH[0]) * this.profile.aggression;
  }

  /** How fast (share a second) it notices `p` in plain view at `d` m, `off` rad from where it looks. */
  #spotRate(view: BotView, p: PlayerOutput, d: number, off: number): number {
    const { time } = view;
    let rate = 1 / (SPOT_BASE + Math.max(d, 3) / SPOT_DISTANCE);
    const speed = Math.hypot(p.velocity[0], p.velocity[2]);
    if (p.downed || p.stance !== 'stand') rate *= 0.6;
    if (speed < QUIET) rate *= 0.6;
    else if (p.movement === 'sprint') rate *= 1.25;
    // Muzzle flash and noise give a body away; so does knowing roughly where to look.
    if (time - (this.#loud.get(p.id) ?? -Infinity) < 1.5) rate *= 3;
    const told = this.#memory.get(p.id);
    if (told && time - told.time < 5) rate *= 2;
    return rate * (1 - 0.5 * Math.min(1, off / FOV) ** 2);
  }

  /**
   * What its squadmates have seen and heard, taken into its own memory as
   * told rather than seen (a little off, more the farther away it is). A
   * fresh sighting near enough sends a bold bot to help and turns the rest
   * toward it.
   */
  #takeIntel(view: BotView, r: (n: number) => number): void {
    const { self, time } = view;
    const intel = (view.ground?.intel ?? view.intel)!;
    let k = 0;
    for (const [id, c] of intel.callouts(time)) {
      if (c.by === self.id) continue;
      const known = this.#memory.get(id);
      const pinged = c.pinged !== undefined && time - c.pinged <= PING_HEED && this.#heeded.get(id) !== c.pinged;
      if (known && known.time >= c.time && !pinged) continue;
      const d = flat(self.position, c.position);
      const at = blur(c.position, CALLOUT_ERROR + d / 20, r(400 + k), r(401 + k));
      k += 2;
      if (!known || known.time < c.time) this.#memory.set(id, { position: at, time: c.time, seen: false, velocity: c.velocity });
      if (pinged) {
        this.#heeded.set(id, c.pinged!);
        this.#heedPing(view, id, at, d);
        continue;
      }
      if (!c.seen || time - c.time > 1 || d > HELP_RANGE || this.#target || this.#chasing || this.#using || this.#flee || this.#recover || this.#reviving) continue;
      this.#alert = { yaw: yawTo(self.position, at), until: time + 1 };
      if (this.#bold()) {
        this.#chasing = id;
        this.#holdUntil = 0;
      }
    }
    this.#heedLookout(view, intel);
  }

  /**
   * A squadmate pinged an enemy: whether to do anything about it is the bot's
   * own call. Busy (in a fight of its own, using, fleeing, healing, reviving)
   * or too far off, it only remembers; otherwise it turns to look, and goes
   * for them if they're within its gun's reach and it's bold enough or they're
   * close.
   */
  #heedPing(view: BotView, id: PlayerId, at: Vec3, d: number): void {
    const { self, time } = view;
    if (d > PING_REACH || this.#target || this.#using || this.#flee || this.#recover || this.#reviving) return;
    this.#alert = { yaw: yawTo(self.position, at), until: time + 1.5 };
    if (this.#chasing || self.health < HURT) return;
    if (d <= this.#opensAt(TACTICS[self.weapon.id], self.weapon.id) && (this.#bold() || d <= CLOSE_RANGE * 2)) {
      this.#chasing = id;
      this.#holdUntil = 0;
    }
  }

  /** "Enemy here" pinged at a place: a bot with nothing better to do looks that way. */
  #heedLookout(view: BotView, intel: SquadIntel): void {
    const { self, time } = view;
    const l = intel.lookout(self.id, time, PING_HEED);
    if (!l || l.time === this.#lookedOut) return;
    this.#lookedOut = l.time;
    if (flat(self.position, l.point) > PING_REACH || this.#target || this.#using || this.#flee || this.#recover || this.#reviving) return;
    this.#alert = { yaw: yawTo(self.position, l.point), until: time + 1.5 };
  }

  /** An enemy it has just spotted: it pings them for its Squad, unless it pinged lately or a squadmate already has. */
  #pingSeen(view: BotView, p: PlayerOutput): void {
    const intel = view.ground?.intel ?? view.intel;
    const every = STATS.ping.botEvery.value;
    if (!intel || view.time - this.#pingedAt < every) return;
    const said = intel.callout(p.id)?.pinged;
    if (said !== undefined && view.time - said < every) return;
    this.#pingedAt = view.time;
    this.#pingOut = { kind: 'enemy', at: p.position, target: p.id };
  }

  /** Battle Royale: a job its ground gives it (opening a Supply Drop it went for), when it has no Revive to see to. */
  #groundJob(view: BotView): BotView {
    const use = view.ground?.use;
    return use && !view.objective && view.self.alive && !view.self.downed ? { ...view, objective: { position: use, radius: GROUND_USE, use: true } } : view;
  }

  /**
   * Battle Royale: whether to go and Revive a Downed squadmate now, as this bot
   * judges it, a few times a second; the view with that Revive as its
   * objective if so. One squadmate goes for each Downed seat (the first to say
   * so), and only when it's sensible (see {@link #worthReviving}).
   */
  #reviveChoice(view: BotView): BotView {
    const { self, time } = view;
    const intel = view.ground!.intel;
    if (!self.alive || self.downed) {
      if (this.#reviving) intel.release(self.id);
      this.#reviving = null;
      return view;
    }
    if (time >= this.#reviveAt) {
      this.#reviveAt = time + REVIVE_THINK;
      const was = this.#reviving;
      this.#reviving = null;
      let best: { p: PlayerOutput; d: number } | null = null;
      for (const i of this.#seats.near(self.position, REVIVE_LOOK)) {
        const p = view.players[i]!;
        if (p.id === self.id || !p.alive || !p.downed || p.team !== self.team) continue;
        const by = intel.reviver(p.id);
        const holder = by && by !== self.id ? this.#seats.get(by) : undefined;
        if (holder?.alive && !holder.downed) continue;
        if (by && by !== self.id) intel.release(by, p.id);
        const d = flat(self.position, p.position);
        if (d <= REVIVE_LOOK && (!best || d < best.d)) best = { p, d };
      }
      if (best && this.#worthReviving(view, best.p, best.d, was === best.p.id) && intel.claim(best.p.id, self.id, time)) this.#reviving = best.p.id;
      if (was && was !== this.#reviving) intel.release(self.id, was);
    }
    const seat = this.#reviving ? this.#seats.get(this.#reviving) : undefined;
    if (!seat?.alive || !seat.downed) {
      if (this.#reviving) intel.release(self.id, this.#reviving);
      this.#reviving = null;
      return view;
    }
    return { ...view, objective: { position: seat.position, radius: REVIVE_APPROACH, use: true } };
  }

  /**
   * Whether a Revive of `seat`, `d` m off, is sensible now: there's time on the
   * Bleed-out and the Ring for it, the bot isn't in a fight or under fire, its
   * Squad has had a quiet moment first (longer the more careful it is, unless
   * it's already at it), and no enemy it knows of could see the seat, the bot,
   * or the way between. A fight won (no enemy known of near) is safe.
   */
  #worthReviving(view: BotView, seat: PlayerOutput, d: number, already: boolean): boolean {
    const { self, time } = view;
    const ground = view.ground!;
    const need = d / RUN + STATS.royale.reviveTime.value * (1 - seat.downed!.revive) + REVIVE_SPARE;
    if (need > seat.downed!.bleedOut) return false;
    const inside = (c: { x: number; z: number; radius: number }) => Math.hypot(seat.position[0] - c.x, seat.position[2] - c.z) < c.radius - REVIVE_WALL;
    if (!inside(wallAt(ground.ring, time)) || !inside(wallAt(ground.ring, time + need))) return false;
    if ((this.#target?.visible && time >= this.#target.react) || time - this.#shotAt < SHOT_MEMORY) return false;
    this.#reviveThreat = null;
    const body: Vec3 = [seat.position[0], seat.position[1] + 0.4, seat.position[2]];
    const chest = zoneCentre(pose(self), 'upperTorso');
    const between: Vec3 = [(seat.position[0] + self.position[0]) / 2, (seat.position[1] + self.position[1]) / 2 + 1.2, (seat.position[2] + self.position[2]) / 2];
    for (const [id, m] of this.#memory) {
      if (time - m.time > REVIVE_KNOWN) continue;
      // Out (the kill feed took it from memory) or Down as the feed showed: no eye on the Revive.
      if (this.#downs.has(id)) continue;
      const eye: Vec3 = [m.position[0], m.position[1] + 1.5, m.position[2]];
      if (flat(eye, seat.position) > REVIVE_SIGHT && flat(eye, self.position) > REVIVE_SIGHT) continue;
      this.#reviveThreat ??= eye;
      if (botSees(this.#world, eye, body) || botSees(this.#world, eye, chest) || (d > 6 && botSees(this.#world, eye, between))) return false;
    }
    // A moment's quiet first: longer with an enemy it knows of still about (only out of sight), shorter once none is.
    const [lo, hi] = this.#reviveThreat ? REVIVE_CALM : REVIVE_SETTLE;
    return already || time - ground.intel.contact >= lo + (hi - lo) * this.#caution;
  }

  /** Downed: stays by a mate who's come, else crawls to the nearest mate, else to cover from whoever did it, else on toward the rally. */
  #crawl(view: BotView, seconds: number): UserCmd {
    const { self, time } = view;
    const ground = view.ground!;
    let mate: PlayerOutput | null = null;
    let near = CRAWL_MATE;
    for (const i of this.#seats.near(self.position, CRAWL_MATE)) {
      const p = view.players[i]!;
      if (p.id === self.id || !p.alive || p.downed || p.team !== self.team) continue;
      const d = flat(p.position, self.position);
      if (d < near) {
        near = d;
        mate = p;
      }
    }
    if ((self.downed?.revive ?? 0) > 0 || near < CRAWL_MATE_HERE) return this.#cmd(0, 0, []);
    if (time >= this.#crawlAt) {
      this.#crawlAt = time + CRAWL_LOOK;
      const threat = this.#dangers[0]?.position;
      const cover = coverNear(this.#nav, self.position, CRAWL_COVER, threat)[0];
      const to = mate ? nearestNode(this.#nav, this.#world, mate.position) : cover ? cover.node : nearestNode(this.#nav, this.#world, ground.rally);
      this.#plan(self.position, to, view);
    }
    const move = this.#advance(self, this.#nav.nodes[this.#path.at(-1) ?? 0]!.position);
    if (!move) return this.#cmd(0, 0, []);
    this.#turn(yawTo(self.position, move), 0, LOOK_RATE, seconds);
    const d = angleDelta(self.yaw, yawTo(self.position, move));
    return this.#cmd(Math.cos(d), -Math.sin(d), []);
  }

  /** What to look like while holding: what it knows of, or a side of its own in a Squad. */
  #facing(ground: GroundOrder, at: Vec3): number {
    return this.#holdFacing(at) + ((ground.slot * Math.PI * 2) / 3) * (this.#memory.size === 0 ? 1 : 0);
  }

  /** Stops where it stands for a moment, crouched: at the end of a bound, or to wait for a squadmate. */
  #stopHere(view: BotView, ground: GroundOrder, seconds: number): void {
    this.#holdUntil = view.time + seconds;
    this.#holdYaw = this.#facing(ground, view.self.position);
    this.#holdCrouch = true;
  }

  /**
   * A Squad's way of getting about: bound from cover to cover toward the rally,
   * stopping low at each to look; once there, take a spot with something to
   * hide behind, watch from it a while, and shift to another. Never a stop in
   * the open unless the ground has nothing to offer.
   */
  #useGround(view: BotView, ground: GroundOrder, r: (n: number) => number, buttons: ButtonName[]): Vec3 | null {
    const { self, time } = view;
    const nodes = this.#nav.nodes;
    if (!ground.hurry && time < this.#holdUntil) {
      if (this.#holdCrouch) buttons.push('Crouch');
      return null;
    }
    const spotted = this.#spot !== null && flat(nodes[this.#spot]!.position, ground.rally) <= ground.radius + SPOT_REACH;
    if (spotted && time >= this.#spotUntil && !this.#walkingToSpot) this.#spot = null;
    if (!spotted) this.#spot = null;
    if (this.#spot === null && flat(self.position, ground.rally) > ground.radius) {
      if (ground.wait) this.#bound = 0;
      const move = this.#follow(view, ground.rally, OBJECTIVE_KEY);
      this.#bound -= flat(self.position, this.#boundFrom);
      this.#boundFrom = self.position;
      if (this.#bound <= 0) {
        const at = this.#path[Math.max(0, this.#step - 1)];
        if (at !== undefined && (coverBits(this.#nav)?.[at] ?? 0) !== 0) {
          const [lo, hi] = STOP;
          const hold = (lo + (hi - lo) * r(84)) * (1 + this.#caution) * (ground.hunt ? HUNT_STOP : 1);
          this.#stopHere(view, ground, ground.wait ? hold + 1 : hold);
          this.#bound = this.profile.roam * (BOUND[0] + (BOUND[1] - BOUND[0]) * r(85));
          return null;
        }
      }
      return move;
    }
    if (this.#spot === null) {
      this.#spot = this.#pickSpot(view, ground, r);
      this.#walkingToSpot = this.#spot !== null;
      if (this.#spot === null) {
        this.#stopHere(view, ground, 1 + 2 * r(86));
        return null;
      }
      this.#plan(self.position, this.#spot, view);
    }
    if (this.#walkingToSpot) {
      const move = this.#advance(self, nodes[this.#spot]!.position);
      // At the end of the route and within a stride of the spot is there: the last of it may be against what it hides behind.
      const there = this.#step >= this.#path.length && flat(self.position, nodes[this.#spot]!.position) < SPOT_THERE;
      if (move !== null && !there) return move;
      this.#walkingToSpot = false;
      const [lo, hi] = SPOT_HOLD;
      const hold = this.profile.holdTime * (lo + (hi - lo) * r(87)) * (ground.hunt ? HUNT_STOP : 1);
      this.#spotUntil = time + hold;
      this.#stopHere(view, ground, hold);
    }
    return null;
  }

  /** The best place round the rally to hold: sheltered from what it knows of, hides a body standing, near, and not a squadmate's. */
  #pickSpot(view: BotView, ground: GroundOrder, r: (n: number) => number): number | null {
    const { self, time } = view;
    let threat: Vec3 | undefined;
    let latest = time - 20;
    for (const m of this.#memory.values()) {
      if (m.time > latest) {
        latest = m.time;
        threat = m.position;
      }
    }
    const spots = coverNear(this.#nav, ground.rally, ground.radius + SPOT_REACH, threat);
    const bits = coverBits(this.#nav);
    let best: number | null = null;
    let bestScore = -Infinity;
    const count = (b: number) => {
      let n = 0;
      for (let k = b; k; k &= k - 1) n += 1;
      return n;
    };
    for (const [k, s] of spots.entries()) {
      if (k >= SPOTS_WEIGHED * 4) break;
      if (k % 4 !== Math.floor(r(88) * 4) && spots.length > SPOTS_WEIGHED) continue;
      const p = this.#nav.nodes[s.node]!.position;
      let score = (s.full ? 3 : 0) + count(bits?.[s.node] ?? 0) - flat(p, self.position) * 0.15 + r(89 + k) * 2;
      for (const i of this.#seats.near(p, SPOT_ROOM)) {
        const q = view.players[i]!;
        if (q.id !== self.id && q.team === self.team && flat(q.position, p) < SPOT_ROOM) score -= 12;
      }
      if (score > bestScore) {
        bestScore = score;
        best = s.node;
      }
    }
    return best;
  }

  /** The nearest node out of `threat`'s sight, not toward it, within a short run of `from`; null when there's none. */
  #shelter(from: Vec3, threat: Vec3): number | null {
    const away = flat(from, threat);
    let best: number | null = null;
    let bestRun = Infinity;
    for (const i of nodesNear(this.#nav, from, SHELTER_SEARCH)) {
      const n = this.#nav.nodes[i]!;
      const run = flat(from, n.position);
      if (run > SHELTER_SEARCH || run >= bestRun || Math.abs(n.position[1] - from[1]) > 2.5 || flat(n.position, threat) < away - 2) continue;
      if (botSees(this.#world, threat, [n.position[0], n.position[1] + 1.2, n.position[2]])) continue;
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
    for (const k of this.#seats.near(self.position, HEARD_MOST)) {
      const p = view.players[k]!;
      const thud = p.landing !== null || ((p.movement === 'slide' || p.movement === 'mantle') && steps);
      if (!thud && !steps) continue;
      if (p.id === self.id || !p.alive || !view.isEnemy(p)) continue;
      const speed = Math.hypot(p.velocity[0], p.velocity[2]);
      const grounded = p.movement !== 'airborne' && p.movement !== 'mantle';
      const gait = p.stance !== 'stand' ? FOOTSTEPS.crouch : p.movement === 'sprint' ? FOOTSTEPS.sprint : FOOTSTEPS.walk;
      // Soft Soles (ticket 20): their steps and landings carry half as far.
      const soft = p.loadout.perk === 'softSoles' ? STATS.perks.softSoles.value : 1;
      const reach = (thud ? THUD : grounded && speed >= QUIET ? gait : 0) * soft;
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
    if (!known || !known.seen || time - known.time > 1) {
      const at = blur(p.position, muffled ? 2 + 3 * r1 : 0.8 * r1, r2, 1);
      this.#memory.set(p.id, { position: at, time, seen: false, velocity: STILL });
      view.ground?.intel.report(p.id, { position: at, time, seen: false, velocity: STILL, by: self.id });
    }
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
    // A walk over everyone, but only as often as a bot needs somewhere new to go.
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
    const lanes = TACTICS[self.weapon.id].scoped ? longSightlines(this.#nav) : [];
    const pool = inside.length > 0 ? inside : lanes.length > 0 ? lanes : null;
    const candidates = Array.from({ length: 16 }, (_, k) => (pool ? pool[Math.floor(r(30 + k) * pool.length)]! : Math.floor(r(30 + k) * nodes.length)));
    if (hunch) candidates.push(this.#nav.index ? this.#nav.index.closest(hunch, 1)[0]! : nearestTo(nodes, hunch));
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

  #inside: { objective: BotObjective; nodes: number[] } | null = null;

  /** The nav nodes inside an objective (the nearest one when none is). */
  #nodesIn(objective: BotObjective): readonly number[] {
    if (this.#inside?.objective !== objective) {
      const nodes = nodesNear(this.#nav, objective.position, objective.radius).filter((i) => {
        const n = this.#nav.nodes[i]!;
        return flat(n.position, objective.position) <= objective.radius * 0.8 && Math.abs(n.position[1] - objective.position[1]) < 2;
      });
      this.#inside = { objective, nodes: nodes.length > 0 ? nodes : [nearestNode(this.#nav, this.#world, objective.position)] };
    }
    return this.#inside.nodes;
  }

  /** Which way to watch while holding: toward the newest noise or danger spot, else toward the middle of the map. */
  #holdFacing(at: Vec3): number {
    let latest: { position: Vec3; time: number } | null = null;
    for (const m of this.#memory.values()) if (!latest || m.time > latest.time) latest = m;
    for (const d of this.#dangers) if ((!latest || d.time > latest.time) && this.#lastTime - d.time < DANGER_MEMORY) latest = d;
    if (latest) return yawTo(at, latest.position);
    return yawTo(at, navMiddle(this.#nav));
  }

  /** A route from `from` to node `to`; a fresh one (not a retry when stuck) restarts the progress clock. */
  #plan(from: Vec3, to: number, view: BotView, fresh = true, unseenBy: Vec3 | null = null): void {
    if (view.budget) view.budget.plans += 1;
    // Stranded in the shallows or a pit, the way out is where it starts.
    const start = startNode(this.#nav, this.#world, from);
    // Out of sight of `unseenBy` (or else the newest danger spot near) where there's a way: each node it can see costs as much as a detour.
    const watcher = unseenBy ?? this.#watcher(from, view.time);
    const exposure = watcher ? new Exposure(this.#nav, this.#world, watcher) : null;
    const bits = view.ground ? coverBits(this.#nav) : null;
    const costs = bits ? (i: number) => (bits[i] === 0 ? OPEN_GROUND : 0) + (exposure ? exposure.cost(i) : 0) : exposure ? (i: number) => exposure.cost(i) : undefined;
    const path = findPath(this.#nav, start, to, costs) ?? [];
    this.#path = path;
    // Replanned partway along the first leg (the nearest node is the one just left behind): carry on along it rather than turn back to its start.
    // Out of a fight only: a fighting bot strafes off its route, so where it stands says nothing about which way it was going.
    this.#step = this.#target === null && path.length > 1 && !['climb','ladder'].includes(linkKind(this.#nav, path[0]!, path[1]!) ?? '') && onLeg(from, this.#nav.nodes[path[0]!]!.position, this.#nav.nodes[path[1]!]!.position) ? 1 : 0;
    this.#from = from;
    if (fresh) this.#progress = { position: from, time: view.time };
  }

  /** Moves along the route past nodes already reached; the point to head for now, or null at the end. */
  #advance(self: PlayerOutput, goal: Vec3): Vec3 | null {
    const nodes = this.#nav.nodes;
    while (this.#step < this.#path.length) {
      const n = nodes[this.#path[this.#step]!]!;
      const next = this.#step + 1 < this.#path.length ? linkKind(this.#nav, this.#path[this.#step]!, this.#path[this.#step + 1]!) : null;
      // Movement can attach from a little outside the precise endpoint. Once
      // attached, advance to the destination instead of walking back to the
      // lower node after dismounting and falling off the roof.
      if (self.movement === 'ladder' && next === 'ladder' && flat(self.position,n.position)<1.1 && Math.abs(self.position[1]-n.position[1])<1.5) {
        this.#step += 1;
        continue;
      }
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

  /**
   * When the bot has barely moved for a while: back off a step to one side and
   * find the way again; after longer, go somewhere else. True while it is held
   * up below where its route goes next, for a jump at it (a mantle, where it
   * can get onto something).
   */
  #stuck(view: BotView, r: (n: number) => number): boolean {
    const { self, time } = view;
    // Height gained counts only once landed: hopping at a ledge it can't get onto is no progress.
    const climbed = self.movement !== 'airborne' && Math.abs(self.position[1] - this.#progress.position[1]) > 0.5;
    if (flat(self.position, this.#progress.position) > 0.6 || climbed) {
      this.#progress = { position: self.position, time };
      return false;
    }
    const still = time - this.#progress.time;
    const next = this.#path[this.#step];
    const wedged = still > WEDGED && still <= 4 && next !== undefined && this.#nav.nodes[next]!.position[1] > self.position[1] + STATS.movement.stepHeight.value;
    if (still > 1.2 && time >= this.#unstickUntil + 0.6) {
      this.#unstickUntil = time + 0.45;
      this.#unstickSide = r(50) < 0.5 ? -1 : 1;
      if (this.#goal !== null) this.#plan(self.position, this.#goal, view, false);
      else this.#replanAt = 0;
    }
    if (still > 4 && view.ground) {
      // Off the line for a moment; the run to the rally picks up after.
      const near = nodesNear(this.#nav, self.position, STEP_ASIDE);
      this.#spot = null;
      if (near.length > 0) this.#plan(self.position, near[Math.floor(r(51) * near.length)]!, view);
      this.#replanAt = time + still;
    } else if (still > 4) {
      this.#goal = this.#pickGoal(view, r);
      this.#chasing = null;
      this.#plan(self.position, this.#goal, view);
    }
    return wedged;
  }
}

/**
 * What each node costs a route for standing in sight of `watcher`. A class and
 * not a closure: a route is tens of thousands of these calls, compiled in with
 * the search, and each new closure could throw that out halfway along a route,
 * leaving the rest of it to run interpreted at 15 to 40 ms.
 */
class Exposure {
  readonly #seen = new Map<number, number>();
  readonly #nav: NavGraph;
  readonly #world: World;
  readonly #watcher: Vec3;

  constructor(nav: NavGraph, world: World, watcher: Vec3) {
    this.#nav = nav;
    this.#world = world;
    this.#watcher = watcher;
  }

  cost(i: number): number {
    let c = this.#seen.get(i);
    if (c === undefined) {
      const p = this.#nav.nodes[i]!.position;
      c = flat(p, this.#watcher) > DANGER_REACH || !botSees(this.#world, this.#watcher, [p[0], p[1] + 1.2, p[2]]) ? 0 : EXPOSED;
      this.#seen.set(i, c);
    }
    return c;
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
class ThrowSolve {
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
