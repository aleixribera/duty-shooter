import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@duty-shooter/fps-core';
import { courseLines } from '../src/hud/course-clock';
import { COURSE_LIMIT, CourseRun, courseDelta, courseGrade, courseTime, type CourseGates } from '../src/course-run';

/** A start pad at the origin whose way out is -Z, and a finish pad 20 m on, 2 m up. */
const GATES: CourseGates = {
  start: { min: [-2, -0.1, -1], max: [2, 2.5, 1] },
  toward: [0, -1],
  finish: { min: [-2, 1.9, -22], max: [2, 4.5, -18] },
  par: { gold: 20, silver: 25, bronze: 32 },
};

const ON_PAD: Vec3 = [0, 0, 0];
const OUT: Vec3 = [0, 0, -1.2];
const MIDWAY: Vec3 = [0, 2, -10];
const FINISH: Vec3 = [0, 2, -20];

describe('a run at the Course', () => {
  it('starts as the start pad is left the right way and ends on the finish pad, timed between the two', () => {
    const run = new CourseRun(GATES);
    expect(run.update(ON_PAD, 100)).toBeNull();
    expect(run.elapsed(100)).toBeNull();
    expect(run.update(OUT, 100.5)).toEqual({ type: 'start' });
    expect(run.update(MIDWAY, 110)).toBeNull();
    expect(run.elapsed(110)).toBeCloseTo(9.5);
    const end = run.update(FINISH, 123.75);
    expect(end).toEqual({ type: 'finish', seconds: expect.closeTo(23.25, 6) });
    // Over: standing on the finish pad is not another finish.
    expect(run.update(FINISH, 124)).toBeNull();
    expect(run.elapsed(124)).toBeNull();
  });

  it('starts nothing when the pad is left the wrong way', () => {
    const run = new CourseRun(GATES);
    run.update(ON_PAD, 0);
    expect(run.update([0, 0, 1.4], 1)).toBeNull();
    expect(run.update([3, 0, 0], 2)).toBeNull();
    expect(run.elapsed(2)).toBeNull();
    // Round the pad to the finish without ever starting: no time.
    expect(run.update(FINISH, 30)).toBeNull();
  });

  it('takes a flying start: through the pad at a run is a start like any other', () => {
    const run = new CourseRun(GATES);
    expect(run.update([0, 0, 1.3], 0)).toBeNull();
    expect(run.update([0, 0, 0.2], 0.1)).toBeNull();
    expect(run.update([0, 0, -1.05], 0.3)).toEqual({ type: 'start' });
  });

  it('is off when the start pad is stepped on again, and that sets the next one ready', () => {
    const run = new CourseRun(GATES);
    run.update(ON_PAD, 0);
    run.update(OUT, 1);
    expect(run.update(ON_PAD, 5)).toEqual({ type: 'abandon' });
    expect(run.elapsed(5)).toBeNull();
    expect(run.update(OUT, 6)).toEqual({ type: 'start' });
    expect(run.elapsed(8)).toBeCloseTo(2);
  });

  it('is off when the runner dies, and when it has gone on too long', () => {
    const dead = new CourseRun(GATES);
    dead.update(ON_PAD, 0);
    dead.update(OUT, 1);
    expect(dead.update(null, 4)).toEqual({ type: 'abandon' });
    expect(dead.update(null, 5)).toBeNull();
    expect(dead.update(FINISH, 6)).toBeNull();

    const lost = new CourseRun(GATES);
    lost.update(ON_PAD, 0);
    lost.update(OUT, 1);
    expect(lost.update(MIDWAY, COURSE_LIMIT)).toBeNull();
    expect(lost.update(MIDWAY, COURSE_LIMIT + 1.5)).toEqual({ type: 'abandon' });
  });

  it('does not count the finish pad from underneath or above it', () => {
    const run = new CourseRun(GATES);
    run.update(ON_PAD, 0);
    run.update(OUT, 1);
    expect(run.update([0, 0, -20], 10)).toBeNull();
    expect(run.update([0, 6, -20], 11)).toBeNull();
    expect(run.update(FINISH, 12)).toMatchObject({ type: 'finish' });
  });

  it('forgets everything when reset', () => {
    const run = new CourseRun(GATES);
    run.update(ON_PAD, 0);
    run.update(OUT, 1);
    run.reset();
    expect(run.elapsed(3)).toBeNull();
    expect(run.update(FINISH, 4)).toBeNull();
  });
});

describe('a Course time', () => {
  it('is written to the hundredth, with minutes only once there are any', () => {
    expect(courseTime(27.414)).toBe('27.41');
    expect(courseTime(9.005)).toBe('9.01');
    expect(courseTime(0)).toBe('0.00');
    expect(courseTime(59.999)).toBe('1:00.00');
    expect(courseTime(64.9)).toBe('1:04.90');
  });

  it('is set against another as time ahead or behind', () => {
    expect(courseDelta(27.0, 27.42)).toBe('-0.42');
    expect(courseDelta(28.49, 27.42)).toBe('+1.07');
    expect(courseDelta(27.42, 27.42)).toBe('+0.00');
  });

  it('earns the best grade whose time it is inside', () => {
    expect(courseGrade(19.99, GATES.par)).toBe('gold');
    expect(courseGrade(20, GATES.par)).toBe('gold');
    expect(courseGrade(24, GATES.par)).toBe('silver');
    expect(courseGrade(31.5, GATES.par)).toBe('bronze');
    expect(courseGrade(40, GATES.par)).toBeNull();
  });
});

describe('the Course clock on the HUD', () => {
  const par = GATES.par;
  it('on the start pad shows the grades to beat, then the best once there is one', () => {
    const fresh = courseLines({ kind: 'ready', best: null, par }).note;
    for (const t of ['20.00', '25.00', '32.00']) expect(fresh).toContain(t);
    // With a best, only the grade still above it.
    const best = courseLines({ kind: 'ready', best: 21.5, par }).note;
    expect(best).toContain('21.50');
    expect(best).toContain('20.00');
    expect(best).not.toContain('25.00');
  });

  it('after a finish names the grade and how the run stands on the best before it', () => {
    const gold = courseLines({ kind: 'result', seconds: 19.58, grade: 'gold', before: 20 });
    expect(gold).toMatchObject({ figure: '19.58', best: true });
    expect(gold.note).toContain('-0.42');
    const bronze = courseLines({ kind: 'result', seconds: 26, grade: 'bronze', before: 20 });
    expect(bronze).toMatchObject({ figure: '26.00', best: false });
    expect(bronze.note).toContain('+6.00');
    const first = courseLines({ kind: 'result', seconds: 40, grade: null, before: null });
    expect(first.best).toBe(true);
    expect(new Set([gold.label, bronze.label, first.label]).size).toBe(3);
  });
});
