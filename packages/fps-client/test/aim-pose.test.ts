import { describe, expect, it } from 'vitest';
import { aimPose, KIT_RIGS } from '../src/viewmodel/kit';

/** A gun-space point after the aimed turn (about x) and offset: where it sits in view space. */
function aimed(p: readonly [number, number, number], pose: ReturnType<typeof aimPose>): [number, number, number] {
  const c = Math.cos(pose.pitch);
  const s = Math.sin(pose.pitch);
  return [p[0] + pose.offset[0], p[1] * c - p[2] * s + pose.offset[1], p[1] * s + p[2] * c + pose.offset[2]];
}

describe('aimPose', () => {
  it('puts the rear point on the view axis, eye relief in front, with no turn when there is no front sight', () => {
    const rig = KIT_RIGS.smg;
    const pose = aimPose(rig.rearSight, rig.frontSight, rig.eyeRelief);
    expect(pose.pitch).toBe(0);
    const rear = aimed(rig.rearSight, pose);
    expect(rear[0]).toBeCloseTo(0, 9);
    expect(rear[1]).toBeCloseTo(0, 9);
    expect(rear[2]).toBeCloseTo(-rig.eyeRelief, 9);
  });

  it("lays the shotgun's head-up line through its bead along the view axis, the receiver well under it", () => {
    const rig = KIT_RIGS.shotgun;
    const front = rig.frontSight!;
    const pose = aimPose(rig.rearSight, front, rig.eyeRelief);
    expect(pose.pitch).toBeGreaterThan(0);
    const rear = aimed(rig.rearSight, pose);
    const bead = aimed(front, pose);
    expect(rear[1]).toBeCloseTo(0, 9);
    expect(rear[2]).toBeCloseTo(-rig.eyeRelief, 9);
    expect(bead[0]).toBeCloseTo(0, 9);
    expect(bead[1]).toBeCloseTo(0, 9);
    // The receiver's top front edge (tools/weapon/shotgun.py: top 0.04, front 0.17 m forward) at least 2.5 degrees under the bead.
    const edge = aimed([0, 0.04, -0.17], pose);
    expect(Math.atan2(-edge[1], -edge[2]) * (180 / Math.PI)).toBeGreaterThan(2.5);
  });
});
