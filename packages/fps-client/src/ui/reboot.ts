import { STATS, type BattleRoyaleState, type BeaconState, type PlayerId, type PlayerOutput, type TeamId } from '@duty-shooter/fps-core';

/**
 * What the client reads off a Battle Royale's Reboot: how each Beacon looks,
 * the use prompt at one, what an out player is told of their Card, and the
 * marks the compass and the island map draw. Plain numbers and text, no DOM
 * and no three.js, so the world, the HUD and tests agree.
 */

const R = STATS.royale.reboot;
const LIGHT = '#ffe2b0';
const ALERT = '#ff6159';

/** A Beacon's light: its colour, how bright (emissive), the column of light over it (0 to 1) and whether its head turns. */
export interface BeaconLook {
  readonly colour: string;
  readonly glow: number;
  readonly beam: number;
  readonly turn: boolean;
}

/** How Beacon `b` looks at simulation time `time` (null: Reboot is closed, it is dark); `now` (s) paces the pulse. */
export function beaconLook(b: BeaconState | null, time: number, now: number): BeaconLook {
  if (!b) return { colour: '#000000', glow: 0, beam: 0, turn: false };
  if (b.channel) return { colour: LIGHT, glow: 2.2 + Math.sin(now * 9) * 1.2, beam: 0.28 + Math.sin(now * 9) * 0.06, turn: true };
  if (b.ready !== undefined && b.ready > time) return { colour: ALERT, glow: 0.5, beam: 0, turn: false };
  return { colour: LIGHT, glow: 1.4, beam: 0, turn: false };
}

const flat = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The names of the seats whose Cards `id` carries. */
function carried(state: BattleRoyaleState, id: PlayerId, nameOf: (id: PlayerId) => string): string[] {
  return (state.cards ?? []).filter((c) => c.carrier === id).map((c) => nameOf(c.owner));
}

/** A list of names as a line reads them. */
function names(list: readonly string[]): string {
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** The use prompt for `self` carrying Cards at a Beacon, or null. */
export function rebootPrompt(self: PlayerOutput, state: BattleRoyaleState, time: number, useLabel: string, nameOf: (id: PlayerId) => string): string | null {
  if (!state.reboot || !self.alive || self.downed) return null;
  const who = carried(state, self.id, nameOf);
  if (who.length === 0) return null;
  const b = (state.beacons ?? []).find((x) => flat(x.position, self.position) <= R.beaconReach.value);
  if (!b) return null;
  if (b.channel?.by === self.id) return `Rebooting ${names(who)}  ${Math.max(0, Math.ceil(R.channel.value - (time - b.channel.since)))} s`;
  if (b.channel) return null;
  if (b.ready !== undefined && b.ready > time) return `Beacon resting  ${clock(b.ready - time)}`;
  return `Hold ${useLabel}  Reboot ${names(who)}`;
}

/** What an out player is told of their own Card while they watch, or null when they have none. */
export function cardNote(id: PlayerId, state: BattleRoyaleState, time: number, nameOf: (id: PlayerId) => string): string | null {
  const card = (state.cards ?? []).find((c) => c.owner === id);
  if (!card) return null;
  if (card.carrier) {
    const b = (state.beacons ?? []).find((x) => x.channel?.by === card.carrier);
    if (b?.channel) return `${nameOf(card.carrier)} is rebooting you: ${Math.max(0, Math.ceil(R.channel.value - (time - b.channel.since)))} s`;
    return `${nameOf(card.carrier)} carries your Reboot Card to a Beacon`;
  }
  return `Your Reboot Card lies where you fell: ${Math.max(0, Math.ceil((card.until ?? time) - time))} s for a squadmate to take it`;
}

/** A Beacon or a Card as the compass and the island map mark them. */
export interface RebootMark {
  readonly kind: 'beacon' | 'card';
  readonly x: number;
  readonly z: number;
  /** A Beacon: ready, rebooting or resting. A Card: lying. */
  readonly state: 'ready' | 'busy' | 'resting' | 'lying';
  /** A Card: whose, and the seconds it has left. */
  readonly name?: string;
  readonly left?: number;
}

/**
 * What the HUD marks for Squad `team`: every Beacon while Reboot is open, and
 * its own Cards lying on the island. `carrying` asks for the nearest ready
 * Beacon only, for the compass of one who carries a Card.
 */
export function rebootMarks(state: BattleRoyaleState, team: TeamId | null, time: number, nameOf: (id: PlayerId) => string): RebootMark[] {
  if (!state.reboot) return [];
  const out: RebootMark[] = [];
  for (const b of state.beacons ?? []) {
    out.push({ kind: 'beacon', x: b.position[0], z: b.position[2], state: b.channel ? 'busy' : b.ready !== undefined && b.ready > time ? 'resting' : 'ready' });
  }
  for (const c of state.cards ?? []) {
    if (c.team !== team || !c.position) continue;
    out.push({ kind: 'card', x: c.position[0], z: c.position[2], state: 'lying', name: nameOf(c.owner), left: Math.max(0, Math.ceil((c.until ?? time) - time)) });
  }
  return out;
}

/** The feed's line for a Reboot event, or null for one it doesn't tell. */
export function rebootFeed(e: { type: 'card'; action: string; ownerName: string; playerName: string | null } | { type: 'reboot'; action: string; playerName: string; names: readonly string[] }, cell: string): string | null {
  const where = cell ? ` in ${cell}` : '';
  if (e.type === 'card') return e.action === 'take' && e.playerName ? `${e.playerName} took ${e.ownerName}'s Reboot Card` : null;
  if (e.action === 'start') return `${e.playerName} is rebooting ${names(e.names)}${where}`;
  if (e.action === 'done') return `${e.playerName} rebooted ${names(e.names)}${where}`;
  return null;
}
