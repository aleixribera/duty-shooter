import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '@duty-shooter/fps-core';
import { createHeadlessMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { CourseRun, courseGrade } from '@duty-shooter/fps-client';
import { buildMap, collisionSolids } from '../src/map/map';

const map = buildMap();
const solids = collisionSolids(map);
const gates = map.course.run;
/** Where each gap's near platform ends. */
const gapEdges = map.course.gaps.map((g) => g.runUp.position[2] - g.runUpLength);
/** The near faces of the climbs to the 10 m tower, along -Z. */
const faces = [-44.85, -46.35, -47.85, -53.85, -55.35];

interface Runner {
  /** How close (m) to a face the runner presses Jump to climb it: about 0.8 is clean, much more is early and wastes a hop. */
  readonly reach: number;
  /** Slide into each gap's edge and jump out of the slide. */
  readonly slideJump: boolean;
}

/** A scripted run along x = 8, -Z, from behind the start pad: the Course clock's time, or null if it never finished. */
function runCourse(runner: Runner): number | null {
  const match = createHeadlessMatch({ solids, players: [{ id: 'p', team: 1, position: [8, 0.02, 4], yaw: 0 }] });
  const clock = new CourseRun(gates);
  let pressed = false;
  for (let i = 0, t = 0; i < Math.round(40 / TICK_SECONDS); i++) {
    const me = match.latest.players[0]!;
    const z = me.position[2];
    const grounded = me.movement !== 'airborne';
    const buttons: ('Sprint' | 'Crouch' | 'Jump')[] = ['Sprint'];
    let jump = false;
    const edge = gapEdges.find((e) => z > e && z - e < 3);
    if (edge !== undefined && grounded) {
      if (runner.slideJump && z - edge < 1.6 && z - edge > 0.25) buttons.push('Crouch');
      if (z - edge < 0.25) jump = true;
    }
    if (grounded && faces.some((f) => z > f && z - f < runner.reach)) jump = true;
    if (jump && !pressed) buttons.push('Jump');
    pressed = jump && !pressed;
    const out = match.step({ p: usercmd({ yaw: 0, forward: 1, buttons }) }).players[0]!;
    t += TICK_SECONDS;
    const event = clock.update(out.alive ? out.position : null, t);
    if (event?.type === 'finish') return event.seconds;
    if (event?.type === 'abandon') return null;
  }
  return null;
}

describe('the Practice Range Course', () => {
  it('starts at the foot of the stairs and finishes on the 10 m tower', () => {
    const tower = map.course.drops.find((d) => d.outcome === 'lethal')!;
    expect(gates.finish.min[1]).toBeCloseTo(tower.height - 0.1, 6);
    expect(gates.start.max[2]).toBeGreaterThan(map.course.stairs.start.position[2]);
  });

  it('is gold for clean timing, silver at best for a runner who climbs early, and a slide-jump never costs time', () => {
    const clean = runCourse({ reach: 0.8, slideJump: false });
    const slide = runCourse({ reach: 0.8, slideJump: true });
    const early = runCourse({ reach: 1.2, slideJump: false });
    expect(clean).not.toBeNull();
    expect(courseGrade(clean!, gates.par)).toBe('gold');
    expect(slide!).toBeLessThanOrEqual(clean!);
    expect(courseGrade(early!, gates.par)).toBe('silver');
  });
});
