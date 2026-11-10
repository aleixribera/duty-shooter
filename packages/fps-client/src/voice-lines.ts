/**
 * Everything Range Control says (next-level ticket 16): the voice on the
 * site's loudspeakers that opens a match, calls the lead, counts the last
 * minute down to the bomb and closes the range. One table, because three
 * things read it: the game (which line, when), the captions (its text) and
 * `tools/voice/build.py`, which records every line into
 * `src/audio/assets/controller.mp3`. A line changed here has to be recorded
 * again, and `voice-lines.test.ts` fails until it is.
 *
 * The wording is partly the voice's own doing: the recorder checks every line
 * by having a speech recogniser listen to it, and a line it cannot say
 * clearly is said another way (it swallows a line that opens on "Gun game",
 * "defenders, hold the sites" and "supply drop inbound"; it says the lines
 * below).
 *
 * This file imports nothing and uses no syntax Node cannot strip, so the
 * recorder can load it as it stands.
 */

export const VOICE_LINES = {
  // A match opens. "Hot" is range talk for live fire, and has one way of being said.
  liveTdm: 'Team deathmatch. The range is hot.',
  liveFfa: 'Free for all. The range is hot.',
  liveOutposts: 'Outposts. Take them and hold them. The range is hot.',
  liveGunGame: 'This is Gun Game. The range is hot.',
  // Charge is played in rounds, and each side is told its job.
  roundAttack: 'Attackers. Plant the charge.',
  roundDefend: 'Defenders, keep them off the sites.',
  chargePlanted: 'Charge planted.',
  chargeDefused: 'Charge defused.',
  // Who is ahead, said from where you stand.
  leadOurs: 'Your team has taken the lead.',
  leadTheirs: 'Enemy team has taken the lead.',
  leadYou: 'You have taken the lead.',
  leadLost: 'You have lost the lead.',
  // The last minute: the countdown to the map's ending.
  t60: 'T minus sixty seconds.',
  t60Nuke: 'T minus sixty seconds. This site will be destroyed.',
  t60Train: 'T minus sixty seconds. Clear the main line.',
  t30: 'Thirty seconds.',
  t10: 'Ten seconds.',
  five: 'Five.',
  four: 'Four.',
  three: 'Three.',
  two: 'Two.',
  one: 'One.',
  // A match that ends before its clock does.
  ceaseFire: 'Cease fire. Cease fire.',
  // Battle Royale.
  ringClosing: 'The Ring is closing.',
  supplyDrop: 'Supply drop incoming.',
  squads10: 'Ten squads left.',
  squads5: 'Five squads left.',
  squads3: 'Three squads left.',
  squads2: 'Two squads left.',
  players10: 'Ten players left.',
  players5: 'Five players left.',
  players3: 'Three players left.',
  players2: 'Two players left.',
} as const;

export type VoiceLineId = keyof typeof VOICE_LINES;

export const VOICE_LINE_IDS = Object.keys(VOICE_LINES) as VoiceLineId[];

/**
 * How a line is given to the recorder where its spelling would be said wrong
 * or flat. What is written on screen is always `VOICE_LINES`.
 */
export const VOICE_SPOKEN: Partial<Record<VoiceLineId, string>> = {
  // Written as one word, the voice swallows it.
  liveOutposts: 'Out posts. Take them and hold them. The range is hot.',
};

/** Lines that are the clock itself: each cuts in on whatever is being said, because a second late it is wrong. */
export const VOICE_ON_THE_SECOND: readonly VoiceLineId[] = ['five', 'four', 'three', 'two', 'one'];

/** The text a recording was made from: what `controller.json` keeps beside each line, to tell a stale recording. */
export function voiceSource(id: VoiceLineId): string {
  return VOICE_SPOKEN[id] ?? VOICE_LINES[id];
}
