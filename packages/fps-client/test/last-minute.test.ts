import { describe, expect, it } from 'vitest';
import { STATS, blastDamage, type GrenadeOutput } from '@duty-shooter/fps-core';
import { LAST_MINUTE, LAST_TEN, MatchClockView, clockClass, clockFace, fuseDrawn, matchClockHtml } from '../src/hud/match-clock';
import { COUNTDOWN_CALLS, clockRan, clockSpeaks, colourDrain, countdownCall, countdownLine, countdownVoice, eased, lastMinuteLight, lastTenBeat } from '../src/last-minute';
import { GRENADE_WARNINGS_MOST, fuseBlink, grenadeWarnings, type WarnedPlayer } from '../src/hud/grenade-warnings';

describe('the match clock', () => {
  it('reads time left until the last minute, then T-minus, then tenths', () => {
    expect(clockFace(599.2)).toMatchObject({ text: 'T−10:00', act: 'match' });
    expect(clockFace(60.01)).toMatchObject({ text: 'T−1:01', act: 'match', fuse: 1 });
    expect(clockFace(60)).toMatchObject({ text: 'T−1:00', act: 'minute' });
    expect(clockFace(47.3)).toMatchObject({ text: 'T−0:48', act: 'minute' });
    expect(clockFace(10.01)).toMatchObject({ text: 'T−0:11', act: 'minute' });
    expect(clockFace(10)).toMatchObject({ text: 'T−10.0', act: 'ten' });
    expect(clockFace(9.49)).toMatchObject({ text: 'T−09.4', act: 'ten' });
    expect(clockFace(0.04)).toMatchObject({ text: 'T−00.0', act: 'ten' });
    expect(clockFace(-3)).toMatchObject({ text: 'T−00.0', act: 'ten', fuse: 0 });
  });

  it('never reads a later time as the clock runs down, and keeps its width within each act', () => {
    let last = Infinity;
    const widths = new Map<string, Set<number>>();
    for (let t = 75; t >= 0; t -= 1 / 60) {
      const face = clockFace(t);
      const read = face.act === 'ten' ? Number(face.text.slice(2)) : face.text.replace('T−', '').split(':').reduce((m, s) => m * 60 + Number(s), 0);
      expect(read, `at ${t}`).toBeLessThanOrEqual(last);
      last = face.act === 'ten' && last > 10 ? 10 : read;
      (widths.get(face.act) ?? widths.set(face.act, new Set()).get(face.act)!).add(face.text.length);
    }
    for (const [act, seen] of widths) expect(seen.size, act).toBe(1);
  });

  it('burns its fuse down through the last minute and ticks as each of the last ten seconds turns', () => {
    expect(clockFace(45).fuse).toBeCloseTo(0.75, 5);
    expect(clockFace(15).fuse).toBeCloseTo(0.25, 5);
    expect(clockFace(11).tick).toBe(false);
    expect(clockFace(8.95).tick).toBe(true);
    expect(clockFace(8.5).tick).toBe(false);
    expect(clockFace(0).tick).toBe(false);
    // Ten ticks in the last ten seconds, each a fifth of a second long.
    let ticks = 0;
    let on = false;
    for (let t = 12; t >= 0; t -= 1 / 120) {
      const tick = clockFace(t).tick;
      if (tick && !on) ticks++;
      on = tick;
    }
    expect(ticks).toBe(LAST_TEN);
  });

  it('counts T-minus from the first second, its quiet fuse burning down to the last minute', () => {
    expect(clockFace(600, 600)).toMatchObject({ text: 'T−10:00', act: 'match', fuse: 1 });
    expect(clockFace(330, 600).fuse).toBeCloseTo(0.5, 5);
    expect(clockFace(60.5, 600).fuse).toBeLessThan(0.01);
    // There the alert fuse lights, full.
    expect(clockFace(60, 600)).toMatchObject({ act: 'minute', fuse: 1 });
    // A match of unknown length keeps its quiet fuse whole.
    expect(clockFace(330).fuse).toBe(1);
    expect(matchClockHtml(330, 600)).toContain('scaleX(0.5)');
  });

  it('draws the quiet fuse before the last minute and the alert one in it', () => {
    expect(matchClockHtml(200)).toBe('<span class="clock">T−3:20</span><span class="fuse quiet"><i style="transform:scaleX(1)"></i></span>');
    expect(matchClockHtml(30)).toContain('<span class="fuse">');
    expect(clockClass(clockFace(200))).toBe('clock');
    expect(clockClass(clockFace(30))).toBe('clock tminus');
    expect(clockClass(clockFace(4.95))).toBe('clock tminus ten tick');
    expect(clockClass(clockFace(4.5))).toBe('clock tminus ten');
  });

  it('does not rebuild the match bar for the last minute: its markup stands still while the clock is painted into it', () => {
    const markup = new Set<string>();
    for (let t = LAST_MINUTE; t >= 0; t -= 1 / 60) markup.add(matchClockHtml(t));
    expect(markup.size).toBe(1);
    // Painted: the text on every tenth it reads, the fuse a few times a second, and nothing on a frame where neither moved.
    const el = () => {
      const writes = { text: 0, cls: 0, style: 0 };
      const node = {
        isConnected: true,
        style: { set transform(_: string) { writes.style++; } },
        set textContent(_: string) { writes.text++; },
        set className(_: string) { writes.cls++; },
      };
      return { node, writes };
    };
    const clock = el();
    const fuse = el();
    let queries = 0;
    const bar = { querySelector: (q: string) => (queries++, q === '.fuse i' ? fuse.node : clock.node) } as unknown as HTMLElement;
    const view = new MatchClockView();
    view.paint(bar, 90);
    expect(queries).toBe(0);
    for (let t = LAST_MINUTE; t > 0; t -= 1 / 120) view.paint(bar, t);
    expect(queries).toBe(2);
    // 50 whole seconds, then 100 tenths, and the first reading.
    expect(clock.writes.text).toBeGreaterThanOrEqual(150);
    expect(clock.writes.text).toBeLessThanOrEqual(152);
    // The class changes at the last ten and on and off each of its ten ticks.
    expect(clock.writes.cls).toBeLessThanOrEqual(22);
    expect(fuse.writes.style).toBeLessThanOrEqual(201);
    // A rebuilt bar has new, empty elements: they are found again and painted whole.
    clock.node.isConnected = false;
    const again = el();
    const bar2 = { querySelector: (q: string) => (q === '.fuse i' ? fuse.node : again.node) } as unknown as HTMLElement;
    view.paint(bar2, 30);
    expect(again.writes).toEqual({ text: 1, cls: 1, style: 0 });
    expect(fuseDrawn(0.5)).toBe('0.5');
    expect(fuseDrawn(0.2512)).toBe('0.25');
    expect(fuseDrawn(7)).toBe('1');
  });
});

describe("the last minute's light", () => {
  it('is nothing before the last minute, or with no clock, and whole at its end', () => {
    expect(lastMinuteLight(null)).toBe(0);
    expect(lastMinuteLight(600)).toBe(0);
    expect(lastMinuteLight(LAST_MINUTE)).toBe(0);
    expect(lastMinuteLight(0)).toBe(1);
    expect(lastMinuteLight(-2)).toBe(1);
  });

  it('only grows as the clock runs down, fastest at the start, with no step in it', () => {
    let last = 0;
    for (let t = LAST_MINUTE; t >= 0; t -= 0.1) {
      const now = lastMinuteLight(t);
      expect(now).toBeGreaterThanOrEqual(last);
      expect(now - last).toBeLessThan(0.01);
      last = now;
    }
    expect(lastMinuteLight(40)).toBeGreaterThan(0.45);
    expect(lastMinuteLight(59) - lastMinuteLight(60)).toBeGreaterThan(lastMinuteLight(1) - lastMinuteLight(2));
  });

  it('beats once on each of the last ten seconds and is quiet between and around them', () => {
    expect(lastTenBeat(null)).toBe(0);
    expect(lastTenBeat(10.5)).toBe(0);
    expect(lastTenBeat(0)).toBe(0);
    expect(lastTenBeat(7)).toBe(1);
    expect(lastTenBeat(6.999)).toBeGreaterThan(0.95);
    expect(lastTenBeat(6.5)).toBeLessThan(0.02);
    let beats = 0;
    let high = false;
    for (let t = 12; t >= -1; t -= 1 / 120) {
      const up = lastTenBeat(t) > 0.5;
      if (up && !high) beats++;
      high = up;
    }
    expect(beats).toBe(LAST_TEN);
  });
});

describe('the calls on the way down', () => {
  const run = (from: number, to: number, step = 1 / 60) => {
    const said: string[] = [];
    let before: number | null = null;
    for (let t = from; t >= to; t -= step) {
      const call = countdownCall(before, t);
      if (call) said.push(call.line);
      before = t;
    }
    return said;
  };

  it('says each line once as the clock passes it', () => {
    expect(run(75, 0)).toEqual(['t60', 't30', 't10', 'five', 'four', 'three', 'two', 'one']);
    expect(run(75, 0, 1 / 20)).toEqual(COUNTDOWN_CALLS.map((c) => c.line));
  });

  it('counts the last five seconds out, each as the clock turns to it, and says the later of two a long frame passes', () => {
    expect(countdownCall(5.01, 4.99)?.line).toBe('five');
    expect(countdownCall(1.01, 0.99)?.line).toBe('one');
    expect(countdownCall(0.99, 0.5)).toBeNull();
    // A frame that takes a second and a half: "four" is already late, "three" is not.
    expect(countdownCall(4.2, 2.7)?.line).toBe('three');
  });

  it('says nothing for what a match joined late, or a clock that was set, has already passed', () => {
    // Joined with 20 s left: the minute and the half are behind you.
    expect(run(20, 6)).toEqual(['t10']);
    expect(countdownCall(null, 45)).toBeNull();
    expect(countdownCall(600, 45)).toBeNull();
    expect(countdownCall(30, 30)).toBeNull();
    expect(countdownCall(29, 31)).toBeNull();
    expect(countdownCall(30.01, null)).toBeNull();
  });

  it('calls a mark once when the clock steps back over it, as an online clock being corrected does', () => {
    // 60.2, 59.9 (called), a correction back to 60.3, then on down: the mark is not passed a second time.
    const readings = [60.2, 59.9, 60.3, 60.1, 59.95, 59.8, 59.5];
    let was: number | null = null;
    const said: string[] = [];
    for (const now of readings) {
      const call = countdownCall(was, now);
      if (call) said.push(call.line);
      was = clockRan(was, now);
    }
    expect(said).toEqual(['t60']);
    expect(was).toBe(59.5);
    // A clock that is set, or goes, is followed at once: the next match's marks are its own.
    expect(clockRan(3, 600)).toBe(600);
    expect(clockRan(3, null)).toBeNull();
    expect(clockRan(null, 42)).toBe(42);
    expect(clockRan(59.9, 60.3)).toBe(59.9);
  });

  it('writes on the HUD only what the clock does not already say', () => {
    expect(COUNTDOWN_CALLS.filter((c) => c.show !== null).map((c) => c.at)).toEqual([60]);
  });

  it("names what the map ends in: the bomb, Switchyard's train, or only the time", () => {
    const [minute, half] = COUNTDOWN_CALLS;
    const nuke = countdownLine(minute!, 'nuke')!;
    const train = countdownLine(minute!, 'train')!;
    const plain = countdownLine(minute!, null)!;
    expect(new Set([nuke, train, plain]).size).toBe(3);
    // A map that ends in nothing gets only the time.
    expect(plain.length).toBeLessThan(Math.min(nuke.length, train.length));
    expect(countdownLine(half!, 'nuke')).toBeNull();
    // The voice says what the HUD writes.
    expect(countdownVoice(minute!, 'nuke')).toBe('t60Nuke');
    expect(countdownVoice(minute!, 'train')).toBe('t60Train');
    expect(countdownVoice(minute!, null)).toBe('t60');
    expect(countdownVoice(half!, 'nuke')).toBe('t30');
  });
});

describe('the clock having the voice to itself', () => {
  it('keeps everything else quiet for three seconds before a call, so the call is on its second', () => {
    expect(clockSpeaks(64)).toBe(false);
    expect(clockSpeaks(62.9)).toBe(true);
    expect(clockSpeaks(60.01)).toBe(true);
    // Sixty has been called: another line may wait behind it.
    expect(clockSpeaks(60)).toBe(false);
    expect(clockSpeaks(45)).toBe(false);
    expect(clockSpeaks(32)).toBe(true);
    expect(clockSpeaks(29)).toBe(false);
    expect(clockSpeaks(13.5)).toBe(false);
  });

  it('keeps it from just before ten to the end: ten, the count, and nothing over the last second', () => {
    for (const left of [12.9, 10, 8, 5, 2.5, 0.4, 0, -1]) expect(clockSpeaks(left), String(left)).toBe(true);
  });

  it('is never in the way of a match with no clock', () => {
    expect(clockSpeaks(null)).toBe(false);
  });
});

describe('colour drained by low health', () => {
  it('starts under 30 health, is whole at 8, and is nothing for the dead', () => {
    expect(colourDrain(100)).toBe(0);
    expect(colourDrain(30)).toBe(0);
    expect(colourDrain(29)).toBeGreaterThan(0);
    expect(colourDrain(19)).toBeCloseTo(0.5, 5);
    expect(colourDrain(8)).toBe(1);
    expect(colourDrain(1)).toBe(1);
    expect(colourDrain(0)).toBe(0);
    expect(colourDrain(null)).toBe(0);
  });

  it('eases toward where it is going and lands on it', () => {
    expect(eased(0, 1, 3, 0.1)).toBeCloseTo(0.3, 5);
    expect(eased(1, 0, 3, 0.1)).toBeCloseTo(0.7, 5);
    expect(eased(0.95, 1, 3, 0.1)).toBe(1);
    expect(eased(0.2, 0.2, 3, 0.1)).toBe(0.2);
    expect(eased(0, 1, 3, -1)).toBe(0);
  });
});

describe('the grenade indicator', () => {
  const me: WarnedPlayer = { id: 'me', position: [0, 0, 0], yaw: 0, stance: 'stand', eyeHeight: STATS.stance.standEyeHeight.value, team: 0, alive: true, health: 100 };
  const frag = (over: Partial<GrenadeOutput> = {}): GrenadeOutput => ({ id: 1, thrower: 'them', team: 1, position: [0, 0, -5], velocity: [0, 0, 0], explodeAt: 12, resting: true, ...over });
  const reach = STATS.grenade.warningRadius.value;

  it('marks a live grenade within the warning radius, and none beyond it', () => {
    expect(grenadeWarnings(me, [frag({ position: [0, 0.9, -(reach - 0.2)] })], 10, false)).toHaveLength(1);
    expect(grenadeWarnings(me, [frag({ position: [0, 0.9, -(reach + 0.4)] })], 10, false)).toHaveLength(0);
    // The radius reaches a little past the blast: every grenade that can hurt you is marked.
    expect(reach).toBeGreaterThan(STATS.grenade.radius.value);
  });

  it('points the way the grenade lies: ahead is 0, to the left a quarter turn', () => {
    const ahead = grenadeWarnings(me, [frag({ position: [0, 0, -4] })], 10, false)[0]!;
    const left = grenadeWarnings(me, [frag({ position: [-4, 0, 0] })], 10, false)[0]!;
    const behind = grenadeWarnings(me, [frag({ position: [0, 0, 4] })], 10, false)[0]!;
    expect(ahead.worldYaw).toBeCloseTo(0, 5);
    expect(left.worldYaw).toBeCloseTo(Math.PI / 2, 5);
    expect(Math.abs(behind.worldYaw)).toBeCloseTo(Math.PI, 5);
  });

  it('says how long the fuse has', () => {
    expect(grenadeWarnings(me, [frag({ explodeAt: 10.4 })], 10, false)[0]!.fuse).toBeCloseTo(0.4, 5);
    expect(grenadeWarnings(me, [frag({ explodeAt: 9 })], 10, false)[0]!.fuse).toBe(0);
  });

  it('fills in where the blast would take the health you have, measured as the simulation measures it', () => {
    const lying = (z: number) => grenadeWarnings(me, [frag({ position: [0, 0, z] })], 10, false)[0]!;
    // A grenade on the ground 2.2 m from your feet: nearer your legs than the middle of your body, and it kills.
    expect(lying(-2.2).metres).toBeLessThan(2.3);
    expect(blastDamage(lying(-2.2).metres)).toBeGreaterThanOrEqual(100);
    expect(lying(-2.2).lethal).toBe(true);
    // Either side of the line, on the ground: the mark says what the blast would do.
    for (let z = 1; z <= 6; z += 0.05) {
      const w = lying(-z);
      expect(w.lethal, `at ${z}`).toBe(blastDamage(w.metres) >= 100);
    }
    expect(lying(-1.5).lethal).toBe(true);
    expect(lying(-3).lethal).toBe(false);
    // Hurt, a blast that far off is enough.
    expect(grenadeWarnings({ ...me, health: 20 }, [frag({ position: [0, 0, -5] })], 10, false)[0]!.lethal).toBe(true);
    expect(grenadeWarnings({ ...me, health: 20 }, [frag({ position: [0, 0, -6.5] })], 10, false)[0]!.lethal).toBe(false);
    // Prone, the body lies toward the grenade: its head is nearer than its feet position says.
    const prone: WarnedPlayer = { ...me, stance: 'prone', eyeHeight: STATS.stance.proneEyeHeight.value };
    const ahead = grenadeWarnings(prone, [frag({ position: [0, 0, -3] })], 10, false)[0]!;
    expect(ahead.metres).toBeLessThan(lying(-3).metres);
    expect(ahead.lethal).toBe(true);
  });

  it("leaves out a teammate's grenade where sides are played, and keeps your own", () => {
    const mates = frag({ id: 2, thrower: 'mate', team: 0 });
    const mine = frag({ id: 3, thrower: 'me', team: 0 });
    expect(grenadeWarnings(me, [mates, mine, frag()], 10, true).map((w) => w.id).sort()).toEqual([1, 3]);
    // Free-for-all: everybody's can hurt you.
    expect(grenadeWarnings(me, [mates, mine, frag()], 10, false)).toHaveLength(3);
  });

  it('does not mark your own throw on its way out, and does once it comes back or lies', () => {
    const out = frag({ thrower: 'me', team: 0, position: [0, 1.4, -1], velocity: [0, 3, -15], resting: false });
    const back = frag({ thrower: 'me', team: 0, position: [0, 1.4, -3], velocity: [0, -1, 6], resting: false });
    const lying = frag({ thrower: 'me', team: 0, position: [0, 0, -4], velocity: [0, 0, 0], resting: true });
    expect(grenadeWarnings(me, [out], 10, false)).toEqual([]);
    expect(grenadeWarnings(me, [back], 10, false)).toHaveLength(1);
    expect(grenadeWarnings(me, [lying], 10, false)).toHaveLength(1);
    // Somebody else's is marked whichever way it flies.
    expect(grenadeWarnings(me, [{ ...out, thrower: 'them', team: 1 }], 10, false)).toHaveLength(1);
  });

  it('marks the nearest few, nearest first, and nothing for the dead', () => {
    const many = Array.from({ length: 7 }, (_, i) => frag({ id: i, position: [0, 0.9, -(1 + i)] }));
    const marks = grenadeWarnings(me, many.reverse(), 10, false);
    expect(marks).toHaveLength(GRENADE_WARNINGS_MOST);
    expect(marks.map((w) => w.id)).toEqual([0, 1, 2, 3]);
    expect(grenadeWarnings({ ...me, alive: false }, many, 10, false)).toEqual([]);
    expect(grenadeWarnings(null, many, 10, false)).toEqual([]);
  });

  it('blinks through the last second of the fuse only', () => {
    expect(fuseBlink(2)).toBe(false);
    expect(fuseBlink(1)).toBe(false);
    let turns = 0;
    let was = false;
    for (let f = 0.999; f > 0; f -= 0.001) {
      const now = fuseBlink(f);
      if (now !== was) turns++;
      was = now;
    }
    expect(turns).toBeGreaterThanOrEqual(15);
  });
});
