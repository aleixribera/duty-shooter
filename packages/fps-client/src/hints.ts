/**
 * First-match hints (next-level ticket 26): one line at a time, each at the
 * moment it matters, each gone the moment the player does the thing, and
 * none ever shown to someone who already does it. Pure rules: the game feeds
 * the facts of this frame and draws what comes back; `hint-store.ts` keeps
 * what a browser has learned.
 */

/** The things a first match teaches, in no order: the rules below decide when each one matters. */
export const HINT_IDS = ['move', 'fire', 'aim', 'sprint', 'reload', 'swap', 'grenade', 'loadout', 'scoreboard'] as const;
export type HintId = (typeof HINT_IDS)[number];

/** What the player is doing and what is true of the match, this frame. */
export interface HintFacts {
  /** Alive and in control: the match is live (past its countdown), nothing is paused. */
  readonly fighting: boolean;
  /** Dead with a respawn coming: the quiet seconds a loadout or the scores can be looked at. */
  readonly waiting: boolean;
  /** Faster than a stroll. */
  readonly moving: boolean;
  readonly sprinting: boolean;
  /** Sights up (or on their way). */
  readonly aiming: boolean;
  readonly reloading: boolean;
  /** Rounds left in the magazine, as a share of a full one. */
  readonly magazine: number;
  /** The weapon in hand, to see a swap. */
  readonly weapon: string;
  readonly grenades: number;
  /** A grenade in hand or leaving it. */
  readonly throwing: boolean;
  /** The loadout screen was opened since the last frame. */
  readonly loadoutOpened: boolean;
  /** The match has a scoreboard to open. */
  readonly board: boolean;
  readonly scoreboard: boolean;
  /** Playing with thumbs on the glass: the Fire button is a mark with no word on it, and auto-fire pulls the trigger unasked. */
  readonly thumbs: boolean;
  /** The Fire button under a thumb (not auto-fire's own pull). */
  readonly firing: boolean;
}

/** What a browser has learned: the hints done with for good, and how often each was shown without being followed. */
export interface HintMemory {
  readonly done: readonly HintId[];
  readonly shown: Readonly<Partial<Record<HintId, number>>>;
}

export const NO_HINTS_SEEN: HintMemory = { done: [], shown: {} };

export interface HintState {
  readonly memory: HintMemory;
  /** The hint on screen, and when it went up (s). */
  readonly current: HintId | null;
  readonly since: number;
  /** When the last hint left (s): the next waits a breath. */
  readonly rested: number;
  /** The weapon in hand a frame ago, and seconds spent fighting this life. */
  readonly weapon: string | null;
  readonly fought: number;
  /** Hints already shown this life: one that timed out comes back next life, not at once. */
  readonly thisLife: readonly HintId[];
  readonly time: number;
}

export function hintState(memory: HintMemory): HintState {
  return { memory, current: null, since: 0, rested: -Infinity, weapon: null, fought: 0, thisLife: [], time: 0 };
}

/** How long a hint stays up unfollowed before it steps aside (s), the breath between two (s), and the showings after which one is dropped for good. */
export const HINT_STAYS = 12;
/** How long a hint has to be up to count as read (s). */
export const HINT_READ = 2;
export const HINT_REST = 1.5;
export const HINT_SHOWINGS = 2;
/** The magazine share that makes reloading worth a word, and the seconds of fighting before a grenade is. */
const RELOAD_AT = 0.5;
export const GRENADE_AFTER = 20;

/** Whether the player is doing the thing right now. Doing it counts whether or not its hint is up. */
function doing(id: HintId, f: HintFacts, s: HintState): boolean {
  switch (id) {
    case 'move':
      return f.fighting && f.moving;
    case 'fire':
      return f.fighting && f.thumbs && f.firing;
    case 'aim':
      return f.fighting && f.aiming;
    case 'sprint':
      return f.fighting && f.sprinting;
    case 'reload':
      return f.fighting && f.reloading;
    case 'swap':
      return f.fighting && s.weapon !== null && f.weapon !== s.weapon;
    case 'grenade':
      return f.fighting && f.throwing;
    case 'loadout':
      return f.loadoutOpened;
    case 'scoreboard':
      return f.board && f.scoreboard;
  }
}

/** The hints, most pressing first: what a dead player can look at, then what the gun needs, then how to move. */
const ORDER: readonly HintId[] = ['loadout', 'scoreboard', 'reload', 'swap', 'move', 'fire', 'aim', 'sprint', 'grenade'];

/** Whether this is the moment for the hint. */
function matters(id: HintId, f: HintFacts, s: HintState, done: ReadonlySet<HintId>): boolean {
  switch (id) {
    case 'loadout':
      return f.waiting;
    case 'scoreboard':
      return f.waiting && f.board && done.has('loadout');
    case 'reload':
      return f.fighting && f.magazine <= RELOAD_AT && !f.reloading;
    case 'swap':
      // A reload under way is when the other weapon is the faster answer.
      return f.fighting && f.reloading && done.has('reload');
    case 'move':
      return f.fighting;
    case 'fire':
      // A touch player's: a mouse button needs no introduction, a mark on the glass does.
      return f.fighting && f.thumbs && done.has('move');
    case 'aim':
      return f.fighting && done.has('move') && (!f.thumbs || done.has('fire'));
    case 'sprint':
      return f.fighting && done.has('move') && done.has('aim');
    case 'grenade':
      return f.fighting && f.grenades > 0 && done.has('move') && done.has('aim') && s.fought >= GRENADE_AFTER;
  }
}

/**
 * One frame of the hints: `dt` seconds on, with the frame's facts. Returns
 * the next state; `current` is the line to draw, and `memory` changes when
 * there is something new to keep (compare by identity).
 */
export function stepHints(s: HintState, f: HintFacts, dt: number): HintState {
  const time = s.time + dt;
  let { done, shown } = s.memory;
  let memory = s.memory;
  let current = s.current;
  let since = s.since;
  let rested = s.rested;
  // A new life: what timed out last life may come back.
  const fresh = f.fighting && s.fought === 0;
  let thisLife = fresh ? [] : s.thisLife;
  const fought = f.fighting ? s.fought + dt : f.waiting ? 0 : s.fought;

  const learn = (id: HintId) => {
    if (!done.includes(id)) done = [...done, id];
  };
  for (const id of HINT_IDS) if (!done.includes(id) && doing(id, f, s)) learn(id);
  if (current !== null) {
    if (done.includes(current)) {
      current = null;
      rested = time;
    } else if (time - since >= HINT_STAYS || !matters(current, f, s, new Set(done))) {
      // Unfollowed for long enough, or its moment passed: it steps aside. Up long enough to be read, that was a showing; shown often enough, it is dropped for good.
      const times = (shown[current] ?? 0) + (time - since >= HINT_READ ? 1 : 0);
      if (times !== (shown[current] ?? 0)) shown = { ...shown, [current]: times };
      if (times >= HINT_SHOWINGS) learn(current);
      current = null;
      rested = time;
    }
  }
  if (current === null && time - rested >= HINT_REST) {
    const known = new Set(done);
    const next = ORDER.find((id) => !known.has(id) && !thisLife.includes(id) && matters(id, f, s, known));
    if (next) {
      current = next;
      since = time;
      thisLife = [...thisLife, next];
    }
  }
  if (done !== s.memory.done || shown !== s.memory.shown) memory = { done, shown };
  return { memory, current, since, rested, weapon: f.fighting ? f.weapon : null, fought, thisLife, time };
}

/** What the player holds: which names the hint's keys take. */
export type HintDevice = 'keys' | 'pad' | 'touch';

/** One control named in a hint: a key cap's text, or the mark on a touch control (a name in `TOUCH_GLYPHS`; `use` is the button that says Use). */
export interface HintKey {
  readonly cap?: string;
  readonly glyph?: string;
}

export interface HintLine {
  readonly id: HintId;
  readonly keys: readonly HintKey[];
  readonly text: string;
}

/** The names a device gives each control a hint mentions. */
export interface HintNames {
  /** Keys: the four move keys as one cap ("WASD") or four. Pad: the left stick. */
  readonly move: readonly string[];
  readonly fire: string;
  readonly ads: string;
  readonly sprint: string;
  readonly crouch: string;
  readonly reload: string;
  readonly switchWeapon: string;
  readonly grenade: string;
  readonly use: string;
  readonly scoreboard: string;
}

/**
 * The hint as its line says it on this device. `names` is unused on touch, where the marks on the glass name the
 * controls; `autoFire` is whether the gun fires by itself there.
 */
export function hintLine(id: HintId, device: HintDevice, names: HintNames, autoFire = true): HintLine {
  const touch = device === 'touch';
  const cap = (...caps: readonly string[]): HintKey[] => caps.map((c) => ({ cap: c }));
  const glyph = (g: string): HintKey[] => [{ glyph: g }];
  switch (id) {
    case 'fire':
      return { id, keys: touch ? glyph('fire') : cap(names.fire), text: touch && autoFire ? 'Aim at an enemy and the gun fires. Or hold this' : 'Fire' };
    case 'move':
      return touch ? { id, keys: glyph('stick'), text: 'Left thumb moves, right thumb looks' } : { id, keys: cap(...names.move), text: device === 'pad' ? 'Move. The right stick looks' : 'Move. The mouse looks' };
    case 'aim':
      return { id, keys: touch ? glyph('ads') : cap(names.ads), text: 'Aim down the sights: tighter, and slower to turn' };
    case 'sprint':
      return touch
        ? { id, keys: [...glyph('stick'), ...glyph('crouch')], text: 'Push the stick all the way up to sprint. Crouch on the run to slide' }
        : { id, keys: cap(names.sprint, names.crouch), text: 'Sprint. Crouch on the run to slide' };
    case 'reload':
      return { id, keys: touch ? glyph('reload') : cap(names.reload), text: 'Reload' };
    case 'swap':
      return { id, keys: touch ? glyph('switchWeapon') : cap(names.switchWeapon), text: 'Swap to your other weapon: faster than a reload' };
    case 'grenade':
      return { id, keys: touch ? glyph('grenade') : cap(names.grenade), text: 'Throw a grenade. Hold it to cook the fuse' };
    case 'loadout':
      return { id, keys: touch ? glyph('use') : cap(names.use), text: 'Change your loadout before you respawn' };
    case 'scoreboard':
      return { id, keys: touch ? glyph('scoreboard') : cap(names.scoreboard), text: touch ? 'The scores' : 'Hold for the scores' };
  }
}
