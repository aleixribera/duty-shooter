import { PING_WHEEL, STATS, placePing, type BattleRoyaleState, type PingEvent, type PingKind, type PingRequest, type PlayerId, type Vec3 } from '@duty-shooter/fps-core';

/**
 * Pings on the client (ticket 66): what the Squad has marked, what a press of
 * the ping key marks, and how each reads on the screen, the compass and the
 * island map.
 */

/** What each kind says, on its marker and in the feed. */
export const PING_LABELS: Readonly<Record<PingKind, string>> = {
  enemy: 'Enemy',
  go: 'Going here',
  defend: 'Defend here',
  help: 'Need help',
  drop: 'Supply Drop',
  card: 'Reboot Card',
  beacon: 'Beacon',
};

/** A ping as the HUD holds it. */
export interface PingMark {
  readonly id: number;
  readonly kind: PingKind;
  readonly player: PlayerId;
  /** Who pinged, as the feed and the marker name them ("You" for yours). */
  readonly name: string;
  readonly position: Vec3;
  readonly target: PlayerId | null;
  /** Server time it stands until. */
  readonly until: number;
  readonly mine: boolean;
}

/** The Squad's pings standing now: one place each, enemies as marked. */
export class PingBoard {
  #marks: PingMark[] = [];

  /** Takes in a ping the server sent; returns false for one already held (a resend). */
  add(e: PingEvent, name: string, mine: boolean): boolean {
    if (this.#marks.some((m) => m.id === e.id)) return false;
    // A seat's newest place replaces its last.
    if (placePing(e.kind)) this.#marks = this.#marks.filter((m) => !(m.player === e.player && placePing(m.kind)));
    this.#marks.push({ id: e.id, kind: e.kind, player: e.player, name, position: e.position, target: e.target, until: e.until, mine });
    return true;
  }

  /** The pings standing at server time `time`, oldest first. */
  live(time: number): readonly PingMark[] {
    if (this.#marks.some((m) => m.until <= time)) this.#marks = this.#marks.filter((m) => m.until > time);
    return this.#marks;
  }

  clear(): void {
    this.#marks = [];
  }
}

/** The feed's line for a ping: who, and what they marked. */
export function pingCallout(kind: PingKind, name: string, cell: string): string {
  const where = cell ? ` in ${cell}` : '';
  switch (kind) {
    case 'enemy':
      return `${name}: Enemy spotted`;
    case 'go':
      return `${name}: Going here${where}`;
    case 'defend':
      return `${name}: Defend here${where}`;
    case 'help':
      return `${name}: Need help${where}`;
    case 'drop':
      return `${name}: Supply Drop${where}`;
    case 'card':
      return `${name}: Reboot Card${where}`;
    case 'beacon':
      return `${name}: Beacon${where}`;
  }
}

/** Mouse travel (px) or stick push (0..1, scaled by 100) inside which the wheel picks nothing, and a release cancels. */
export const WHEEL_DEAD = 18;

/** The wheel's choice for a push of (dx, dy) screen pixels from where it opened: up, right, down, left as PING_WHEEL runs; null inside the dead zone. */
export function wheelPick(dx: number, dy: number): PingKind | null {
  if (Math.hypot(dx, dy) < WHEEL_DEAD) return null;
  // Clockwise from straight up.
  const angle = (Math.atan2(dx, -dy) + Math.PI * 2 + Math.PI / 4) % (Math.PI * 2);
  return PING_WHEEL[Math.floor(angle / (Math.PI / 2))] ?? null;
}

/** Someone the crosshair may be on. */
export interface Aimable {
  readonly id: PlayerId;
  /** The point to aim at: their chest. */
  readonly at: Vec3;
}

/** What the crosshair is on, for a ping. */
export interface PingAim {
  readonly eye: Vec3;
  /** Unit view direction. */
  readonly forward: Vec3;
  /** Where the view ray first meets the world, or null for the sky. */
  readonly hit: Vec3 | null;
  /** Enemies in sight, by their chests. */
  readonly enemies: readonly Aimable[];
  readonly royale: BattleRoyaleState | null;
  /** Your side, for the Cards you can mark. */
  readonly team: number | null;
}

/** An enemy within this many degrees of the crosshair is the one under it. */
const ENEMY_CONE = 3;
/** A crate, a Card or a Beacon within this many degrees is aimed at, however far the ground behind it. */
const THING_CONE = 2.5;

const toward = (eye: Vec3, at: Vec3, forward: Vec3): { off: number; distance: number } => {
  const d: Vec3 = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
  const distance = Math.hypot(d[0], d[1], d[2]);
  const cos = distance === 0 ? 1 : (d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2]) / distance;
  return { off: (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI, distance };
};

/**
 * What a ping marks where the crosshair is: `kind` as the wheel chose it, or
 * the thing under the crosshair for a tap (an enemy, a crate, a Card, a
 * Beacon, else the ground: "going here"). Null when it is on nothing (the sky).
 */
export function aimPing(aim: PingAim, kind: PingKind | null): PingRequest | null {
  const { eye, forward, hit } = aim;
  const reach = hit ? Math.hypot(hit[0] - eye[0], hit[1] - eye[1], hit[2] - eye[2]) : Infinity;
  if (kind === null || kind === 'enemy') {
    let best: { id: PlayerId; at: Vec3; off: number } | null = null;
    for (const e of aim.enemies) {
      const t = toward(eye, e.at, forward);
      if (t.off <= ENEMY_CONE && t.distance <= Math.min(reach + 1, STATS.ping.enemyReach.value) && (!best || t.off < best.off)) best = { id: e.id, at: e.at, off: t.off };
    }
    if (best) return { kind: 'enemy', at: best.at, target: best.id };
    if (kind === 'enemy') return hit ? { kind: 'enemy', at: hit } : null;
  }
  if (kind === null) {
    const r = aim.royale;
    const near = (p: Vec3) => (hit !== null && Math.hypot(p[0] - hit[0], p[2] - hit[2]) <= STATS.ping.objectReach.value) || toward(eye, [p[0], p[1] + 0.5, p[2]], forward).off <= THING_CONE;
    const things: [PingKind, Vec3][] = [
      ...(r?.drops ?? []).filter((d) => !d.opened).map((d): [PingKind, Vec3] => ['drop', d.position]),
      ...(r?.cards ?? []).flatMap((c): [PingKind, Vec3][] => (c.team === aim.team && c.position ? [['card', c.position]] : [])),
      ...(r?.beacons ?? []).map((b): [PingKind, Vec3] => ['beacon', b.position]),
    ];
    let best: { kind: PingKind; at: Vec3; off: number } | null = null;
    for (const [k, p] of things) {
      if (!near(p)) continue;
      const off = toward(eye, p, forward).off;
      if (!best || off < best.off) best = { kind: k, at: p, off };
    }
    if (best) return { kind: best.kind, at: best.at };
  }
  if (!hit) return null;
  return { kind: kind ?? 'go', at: hit };
}
