import { describe, expect, it } from 'vitest';
import { GRENADE_AFTER, HINT_CALM, HINT_READ, HINT_REST, HINT_SHOWINGS, HINT_STAYS, NO_HINTS_SEEN, hintLine, hintState, stepHints, type HintFacts, type HintMemory, type HintNames, type HintState } from '../src/hints';
import { parseHintMemory } from '../src/hint-store';
import { goalLine } from '../src/ui/model';

/** A player standing still in a live match with a full gun, doing nothing. */
const idle: HintFacts = {
  fighting: true,
  waiting: false,
  moving: false,
  sprinting: false,
  aiming: false,
  reloading: false,
  magazine: 1,
  weapon: 'm4a1',
  grenades: 1,
  throwing: false,
  loadoutOpened: false,
  board: true,
  scoreboard: false,
  thumbs: false,
  firing: false,
  clash: false,
};
const dead: HintFacts = { ...idle, fighting: false, waiting: true };

/** Runs `seconds` of the same facts at 10 Hz. */
function run(s: HintState, f: HintFacts, seconds: number): HintState {
  for (let i = 0; i < Math.round(seconds * 10); i++) s = stepHints(s, f, 0.1);
  return s;
}

const knows = (...done: HintMemory['done']): HintMemory => ({ done, shown: {} });

describe('first-match hints', () => {
  it('a first spawn says how to move, after a breath', () => {
    let s = stepHints(hintState(NO_HINTS_SEEN), idle, 0.1);
    expect(s.current).toBe('move');
    s = run(s, idle, 1);
    expect(s.current).toBe('move');
  });

  it('doing the thing takes the hint down and it never comes back', () => {
    let s = run(hintState(NO_HINTS_SEEN), idle, 1);
    s = stepHints(s, { ...idle, moving: true }, 0.1);
    expect(s.current).toBeNull();
    expect(s.memory.done).toContain('move');
    // The next one waits a breath, then it is the next thing a new player needs: the sights.
    s = run(s, idle, HINT_REST / 2);
    expect(s.current).toBeNull();
    s = run(s, idle, HINT_REST);
    expect(s.current).toBe('aim');
    // A second visit, with what was learned: moving is never said again.
    expect(run(hintState(s.memory), idle, 30).memory.done).toContain('move');
    expect(stepHints(hintState(s.memory), idle, 0.1).current).toBe('aim');
  });

  it('someone who already does a thing is never told it', () => {
    // Sprinting and aiming before any hint was up: learned all the same.
    const s = stepHints(hintState(NO_HINTS_SEEN), { ...idle, moving: true, sprinting: true, aiming: true }, 0.1);
    expect(s.memory.done).toEqual(expect.arrayContaining(['move', 'sprint', 'aim']));
    expect(run(s, idle, 5).current).toBeNull();
  });

  it('one hint at a time, each at its moment', () => {
    const s = run(hintState(knows('move', 'aim', 'sprint')), idle, 5);
    // Nothing to say with a full magazine and the fight young.
    expect(s.current).toBeNull();
    // Half a magazine down: reload.
    const low = run(s, { ...idle, magazine: 0.4 }, 0.2);
    expect(low.current).toBe('reload');
    // Reloading learns it; while the reload runs, the other weapon is the faster answer.
    let r = stepHints(low, { ...idle, magazine: 0.4, reloading: true }, 0.1);
    expect(r.memory.done).toContain('reload');
    r = run(r, { ...idle, magazine: 0.4, reloading: true }, HINT_REST + 0.2);
    expect(r.current).toBe('swap');
    // Swapping is seen as the weapon in hand changing.
    r = stepHints(r, { ...idle, weapon: 'pistol' }, 0.1);
    expect(r.memory.done).toContain('swap');
    expect(r.current).toBeNull();
  });

  it('the swap is offered only while the magazine is short, not over a full one at the end of a reload', () => {
    const reloading = { ...idle, magazine: 0.4, reloading: true };
    let r = run(hintState(knows('move', 'aim', 'sprint', 'reload')), reloading, HINT_REST + 0.2);
    expect(r.current).toBe('swap');
    // The magazine goes in partway through; the reload runs on, and the hint steps aside.
    r = stepHints(r, { ...reloading, magazine: 1 }, 0.1);
    expect(r.current).toBeNull();
    // Nor is it put up over the full magazine for the rest of the reload.
    expect(run(r, { ...reloading, magazine: 1 }, HINT_REST + 1).current).toBeNull();
  });

  it('the grenade waits until the fight is a while old, and for a grenade to throw', () => {
    const start = hintState(knows('move', 'aim', 'sprint'));
    expect(run(start, idle, GRENADE_AFTER - 2).current).toBeNull();
    expect(run(start, idle, GRENADE_AFTER + HINT_REST + 1).current).toBe('grenade');
    expect(run(start, { ...idle, grenades: 0 }, GRENADE_AFTER + 5).current).toBeNull();
    const thrown = stepHints(run(start, idle, GRENADE_AFTER + HINT_REST + 1), { ...idle, throwing: true }, 0.1);
    expect(thrown.memory.done).toContain('grenade');
  });

  it('a lesson waits for a quiet moment: none starts in a fight, one up steps aside when a fight starts', () => {
    const fight: HintFacts = { ...idle, clash: true };
    // Moving learned: the sights are next, but not while shots are flying, nor in the seconds after.
    let s = run(hintState(knows('move')), fight, 5);
    expect(s.current).toBeNull();
    s = run(s, idle, HINT_CALM - 0.5);
    expect(s.current).toBeNull();
    s = run(s, idle, 1);
    expect(s.current).toBe('aim');
    // Up and read, then a shot: it goes at once, isn't counted as shown, and comes back in the next quiet.
    s = run(s, idle, HINT_READ + 0.5);
    s = stepHints(s, fight, 0.1);
    expect(s.current).toBeNull();
    expect(s.memory.shown.aim ?? 0).toBe(0);
    s = run(s, idle, HINT_CALM - 0.5);
    expect(s.current).toBeNull();
    s = run(s, idle, 1);
    expect(s.current).toBe('aim');
    // What a fight is for still says its word in one: half a magazine gone mid-fight calls for a reload.
    expect(run(hintState(knows('move', 'aim', 'sprint')), { ...fight, magazine: 0.3 }, 1).current).toBe('reload');
  });

  it('dead with a respawn coming: the loadout and its key, then the scores', () => {
    let s = run(hintState(knows('move')), dead, 0.2);
    expect(s.current).toBe('loadout');
    s = stepHints(s, { ...dead, loadoutOpened: true }, 0.1);
    expect(s.memory.done).toContain('loadout');
    s = run(s, dead, HINT_REST + 0.2);
    expect(s.current).toBe('scoreboard');
    s = stepHints(s, { ...dead, scoreboard: true }, 0.1);
    expect(s.memory.done).toContain('scoreboard');
    // A match with no scoreboard (the range) never offers it.
    expect(run(hintState(knows('move', 'loadout')), { ...dead, board: false }, 5).current).toBeNull();
  });

  it('a hint whose moment passes steps aside, and comes back next life', () => {
    let s = run(hintState(knows('move')), dead, 0.2);
    expect(s.current).toBe('loadout');
    // Respawned a second later: too short to count as read.
    s = run(s, idle, 0.5);
    expect(s.current).not.toBe('loadout');
    expect(s.memory.shown.loadout).toBeUndefined();
    s = run(s, dead, 2);
    expect(s.current).toBe('loadout');
  });

  it('unfollowed, a hint leaves after its stay and is dropped for good after its showings', () => {
    let s = run(hintState(NO_HINTS_SEEN), idle, 0.2);
    expect(s.current).toBe('move');
    s = run(s, idle, HINT_STAYS + 0.2);
    expect(s.current).toBeNull();
    expect(s.memory.shown.move).toBe(1);
    // Not again this life.
    s = run(s, idle, 10);
    expect(s.current).toBeNull();
    // Next life it comes back; unfollowed again, it is done with.
    for (let life = 1; life < HINT_SHOWINGS; life++) {
      s = run(s, dead, 1);
      s = run(s, { ...dead, loadoutOpened: true }, 0.1);
      s = run(s, idle, HINT_REST + 0.3);
      expect(s.current).toBe('move');
      s = run(s, idle, HINT_STAYS + 0.2);
    }
    expect(s.memory.done).toContain('move');
    expect(HINT_READ).toBeLessThan(HINT_STAYS);
  });

  it('nothing shows while the player is held (paused, a countdown, the end)', () => {
    const held: HintFacts = { ...idle, fighting: false };
    expect(run(hintState(NO_HINTS_SEEN), held, 20).current).toBeNull();
  });

  it('memory changes identity only when there is something to save', () => {
    const s = hintState(NO_HINTS_SEEN);
    expect(stepHints(s, { ...idle, fighting: false }, 0.1).memory).toBe(s.memory);
    expect(stepHints(s, { ...idle, moving: true }, 0.1).memory).not.toBe(s.memory);
  });
});

describe('the Fire hint belongs to touch', () => {
  const thumbs: HintFacts = { ...idle, thumbs: true };

  it('comes after moving and before the sights, and goes when the thumb fires', () => {
    let s = run(hintState(knows('move')), thumbs, HINT_REST + 0.2);
    expect(s.current).toBe('fire');
    s = stepHints(s, { ...thumbs, firing: true }, 0.1);
    expect(s.current).toBeNull();
    expect(s.memory.done).toContain('fire');
    s = run(s, thumbs, HINT_REST + 0.2);
    expect(s.current).toBe('aim');
  });

  it('is never shown to a mouse or a pad: the sights come straight after moving', () => {
    const s = run(hintState(knows('move')), idle, HINT_REST + 0.2);
    expect(s.current).toBe('aim');
    // Firing with a mouse teaches nothing about the glass: a later touch session still gets the line.
    expect(stepHints(s, { ...idle, firing: true }, 0.1).memory.done).not.toContain('fire');
  });

  it('says the gun fires by itself where auto-fire is on, and only names the button where it is off', () => {
    const names: HintNames = { move: ['WASD'], fire: 'LMB', ads: 'RMB', sprint: 'Shift', crouch: 'C', reload: 'R', switchWeapon: 'Q', grenade: 'G', use: 'F', scoreboard: 'Tab' };
    const auto = hintLine('fire', 'touch', names, true);
    const manual = hintLine('fire', 'touch', names, false);
    for (const line of [auto, manual]) expect(line).toMatchObject({ id: 'fire', keys: [{ glyph: 'fire' }] });
    // Auto-fire has more to explain than a button that only fires.
    expect(auto.text.length).toBeGreaterThan(manual.text.length);
  });
});

describe('a hint line names the controls of the device in hand', () => {
  const names: HintNames = { move: ['WASD'], fire: 'LMB', ads: 'RMB', sprint: 'Shift', crouch: 'C', reload: 'R', switchWeapon: 'Q', grenade: 'G', use: 'F', scoreboard: 'Tab' };
  const pad: HintNames = { move: ['Left stick'], fire: 'R2', ads: 'L2', sprint: 'L3', crouch: '○', reload: '□', switchWeapon: '△', grenade: 'R1', use: 'L1', scoreboard: 'Touchpad' };

  it('keys: the bound keys as caps', () => {
    expect(hintLine('move', 'keys', names)).toMatchObject({ id: 'move', keys: [{ cap: 'WASD' }] });
    expect(hintLine('move', 'keys', names).text).toMatch(/mouse/i);
    expect(hintLine('loadout', 'keys', names).keys).toEqual([{ cap: 'F' }]);
    expect(hintLine('sprint', 'keys', names).keys).toEqual([{ cap: 'Shift' }, { cap: 'C' }]);
    expect(hintLine('scoreboard', 'keys', names).keys).toEqual([{ cap: 'Tab' }]);
  });

  it('pad: its buttons', () => {
    expect(hintLine('move', 'pad', pad)).toMatchObject({ id: 'move', keys: [{ cap: 'Left stick' }] });
    expect(hintLine('move', 'pad', pad).text).toMatch(/right stick/i);
    expect(hintLine('reload', 'pad', pad).keys).toEqual([{ cap: '□' }]);
  });

  it('touch: the marks on the glass, never a key', () => {
    for (const id of ['move', 'fire', 'aim', 'sprint', 'reload', 'swap', 'grenade', 'loadout', 'scoreboard'] as const) {
      const line = hintLine(id, 'touch', names);
      expect(line.keys.length).toBeGreaterThan(0);
      expect(line.keys.every((k) => k.cap === undefined && typeof k.glyph === 'string')).toBe(true);
      expect(line.text).not.toMatch(/mouse|key|Hold for/i);
    }
  });
});

describe('the stored hint memory', () => {
  it('keeps what it knows and drops the rest', () => {
    expect(parseHintMemory({ done: ['move', 'move', 'fly', 3], shown: { aim: 2, fly: 1, reload: -1, swap: 'x' } })).toEqual({ done: ['move'], shown: { aim: 2 } });
  });
  it('a damaged save means the hints show again', () => {
    expect(parseHintMemory(null)).toEqual(NO_HINTS_SEEN);
    expect(parseHintMemory('yes')).toEqual(NO_HINTS_SEEN);
    expect(parseHintMemory({ done: 'all' })).toEqual(NO_HINTS_SEEN);
  });
});

describe('the goal, said at the countdown', () => {
  it('says what wins and what the clock running out means', () => {
    const clocked = goalLine({ mode: 'tdm', killLimit: 75, timeLimit: 600 });
    const open = goalLine({ mode: 'tdm', killLimit: 75, timeLimit: null });
    expect(clocked).toContain('75');
    expect(open).toContain('75');
    // Without a clock there is nothing to say about it running out.
    expect(open.length).toBeLessThan(clocked.length);
    const ffa = goalLine({ mode: 'ffa', killLimit: 30, timeLimit: 600 });
    expect(ffa).toContain('30');
    expect(goalLine({ mode: 'outposts', killLimit: null, scoreLimit: 200, timeLimit: 600 })).toContain('200');
    const royale = goalLine({ mode: 'battle-royale', killLimit: null });
    expect(royale).toBeTruthy();
    expect(new Set([clocked, ffa, royale]).size).toBe(3);
  });
  it('Charge says the side\'s job this round', () => {
    const attack = goalLine({ mode: 'charge', killLimit: null }, true);
    const defend = goalLine({ mode: 'charge', killLimit: null }, false);
    expect(attack).toBeTruthy();
    expect(defend).toBeTruthy();
    expect(attack).not.toBe(defend);
  });
});
