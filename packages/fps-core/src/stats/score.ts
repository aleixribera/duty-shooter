import type { Estimated, Stat, Unit } from './types';

const COLLECTED = '2026-11-09';

function game<U extends Unit>(value: number, unit: U, why: string): Stat<U> {
  const provenance: Estimated = { kind: 'estimated', method: `Game value for Duty Shooter, not measured from any game: ${why}`, collected: COLLECTED };
  return { value, unit, provenance };
}

/**
 * The points table (ticket 11): what a seat's Score is made of. Every number
 * is the owner's, from the next-level spec; a kill is the unit the rest is
 * read against.
 */
export const SCORE = {
  kill: game(100, 'points', 'the unit of Score: everything else is weighed against one kill.'),
  headshot: game(50, 'points', 'on top of the kill, for a bullet that killed through the head.'),
  assist: game(50, 'points', 'half a kill, for real damage to someone another seat then killed.'),
  /** What makes an Assist. */
  assistDamage: game(30, 'HP', 'damage dealt to the victim that earns an Assist: more than one stray bullet, under a third of their health.'),
  assistWindow: game(8, 's', 'how long before the kill that damage still counts: about one fight.'),
  longShot: game(25, 'points', 'on top of the kill, for a bullet from past the long-shot range.'),
  longShotRange: game(40, 'm', 'past the rifle fights of the arena maps, where a kill takes aim.'),
  longShotRangeSniper: game(90, 'm', 'the sniper is made for 40 m, so its long shot starts where it is hard too.'),
  revenge: game(25, 'points', 'on top of the kill, when the victim was the seat that last killed you.'),
  firstBlood: game(50, 'points', "on top of the match's first kill."),
  /** Multi-kills: each kill within the window of the one before. */
  multiKillWindow: game(3.5, 's', 'a kill this soon after the last one carries the multi-kill on.'),
  doubleKill: game(50, 'points', 'the second kill of a multi-kill.'),
  tripleKill: game(100, 'points', 'the third kill of a multi-kill.'),
  multiKill: game(150, 'points', 'the fourth kill of a multi-kill, and each one after it.'),
  /** Streaks: kills without dying. */
  streak3: game(50, 'points', 'the third kill without dying.'),
  streak5: game(100, 'points', 'the fifth kill without dying.'),
  streak7: game(150, 'points', 'the seventh kill without dying.'),
  streak10: game(250, 'points', 'the tenth kill without dying.'),
  melee: game(50, 'points', 'on top of a kill with the melee: it has to be done within arm’s reach.'),
  grenade: game(25, 'points', 'on top of a kill with a grenade.'),
  /** Outposts. */
  capture: game(150, 'points', 'for each seat of the capturing team standing in the zone as it is taken: worth more than a kill, so the objective is played.'),
  zoneKill: game(25, 'points', 'on top of a kill made from inside a zone, or of someone standing in one.'),
  /** Charge. */
  plant: game(200, 'points', 'planting the charge: two kills, for standing still in a site.'),
  defuse: game(300, 'points', 'defusing the charge: three kills, it wins the round.'),
  /** Battle Royale. */
  finish: game(25, 'points', 'for the kill of a Downed seat: the Down already scored as the kill.'),
  revive: game(100, 'points', 'a Revive brings a squadmate back, as much as taking an enemy out.'),
  reboot: game(150, 'points', 'a Reboot brings back seats that were out: more than a Revive.'),
} as const;
