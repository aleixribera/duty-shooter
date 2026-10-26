import { describe, expect, it } from 'vitest';
import { DEG, STATS, createWorld, orientedBox, playerClip, raycastWorld, yawBox, type PlayerOutput, type Solid, type UserCmd, type Vec3 } from '@duty-shooter/fps-core';
import { box, createHeadlessMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { FLOOR, hold, me, measuredSpeed, soloMatch, ticks } from './support/movement';

const HALF = STATS.stance.hullHalfWidth.value;
const ANGLES = [0, 15, 30, 45, 60, 75, 110, 200].map((a) => a * DEG);

/** Unit forward of a view yaw on the ground plane (yaw 0 looks down -Z). */
const forwardOf = (yaw: number): Vec3 => [-Math.sin(yaw), 0, -Math.cos(yaw)];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** How far an axis-aligned hull reaches along a horizontal unit direction. */
const hullSupport = (n: Vec3) => HALF * (Math.abs(n[0]) + Math.abs(n[2]));

/** A wall `distance` m ahead of the origin along `yaw`, its face turned to look back at the origin. */
function wallFacing(yaw: number, distance: number, options: { height?: number; thickness?: number; blocks?: 'both' | 'players' | 'bullets' } = {}): Solid {
  const thickness = options.thickness ?? 0.4;
  const height = options.height ?? 3;
  const f = forwardOf(yaw);
  return yawBox({
    center: [f[0] * (distance + thickness / 2), height / 2, f[2] * (distance + thickness / 2)],
    size: [80, height, thickness],
    yaw,
    material: 'wood',
    ...(options.blocks ? { blocks: options.blocks } : {}),
  });
}

describe('yaw-rotated solids: the movement sweep', () => {
  for (const yaw of ANGLES) {
    const deg = Math.round(yaw / DEG);

    it(`walking straight into a wall turned ${deg}° stops with the hull touching its face`, () => {
      const match = soloMatch({ solids: [FLOOR, wallFacing(yaw, 4)], yaw });
      const out = hold(match, ticks(2), usercmd({ yaw, forward: 1 }));

      const reached = dot(out.at(-1)!.position, forwardOf(yaw));
      expect(reached).toBeCloseTo(4 - hullSupport(forwardOf(yaw)), 6);
      // It never went further on any tick.
      expect(Math.max(...out.map((p) => dot(p.position, forwardOf(yaw))))).toBeLessThanOrEqual(4 - hullSupport(forwardOf(yaw)) + 1e-9);
    });

    it(`sliding along a wall turned ${deg}° keeps most of the speed along the wall`, () => {
      // Walk 40° off the wall's normal: into it and along it.
      const walkYaw = yaw + 40 * DEG;
      const match = soloMatch({ solids: [FLOOR, wallFacing(yaw, 1.5)], yaw: walkYaw });
      const out = hold(match, ticks(3), usercmd({ yaw: walkYaw, forward: 1 }));

      const normal = forwardOf(yaw);
      const limit = 1.5 - hullSupport(normal);
      expect(Math.max(...out.map((p) => dot(p.position, normal)))).toBeLessThanOrEqual(limit + 1e-9);
      expect(dot(out.at(-1)!.position, normal)).toBeCloseTo(limit, 6);
      // Along the wall, the player keeps the tangential part of walk speed (sin 40°).
      expect(measuredSpeed(out)).toBeGreaterThan(STATS.movement.walkSpeed.value * Math.sin(40 * DEG) * 0.95);
    });

    it(`steps up onto a low platform turned ${deg}°`, () => {
      const height = STATS.movement.stepHeight.value * 0.6;
      const f = forwardOf(yaw);
      const platform = yawBox({ center: [f[0] * 4, height / 2, f[2] * 4], size: [3, height, 3], yaw: yaw + 0.3, material: 'wood' });
      const match = soloMatch({ solids: [FLOOR, platform], yaw });
      const out = hold(match, ticks(1), usercmd({ yaw, forward: 1 }));

      expect(out.some((p) => p.movement === 'airborne' && p.velocity[1] > 0)).toBe(false);
      expect(out.at(-1)!.position[1]).toBeCloseTo(height, 9);
    });

    it(`lands on a platform turned ${deg}°`, () => {
      const platform = yawBox({ center: [0, 0.5, 0], size: [2, 1, 2], yaw, material: 'metal' });
      const match = soloMatch({ solids: [FLOOR, platform], position: [0.3, 3, 0.2] });
      const out = hold(match, ticks(1.5), usercmd());

      expect(out.find((p) => p.landing)?.landing?.fallHeight).toBeCloseTo(2, 6);
      expect(out.at(-1)!.position[1]).toBe(1);
    });

    it(`mantles onto a ledge turned ${deg}°, head-on and from 30° off`, () => {
      const height = (STATS.mantle.lowVaultMaxHeight.value + STATS.mantle.waistMantleMaxHeight.value) / 2;
      for (const off of [0, 30 * DEG]) {
        const f = forwardOf(yaw);
        // The face just inside mantle reach of the hull.
        const face = hullSupport(f) + 0.25;
        const ledge = yawBox({ center: [f[0] * (face + 1.5), height / 2, f[2] * (face + 1.5)], size: [6, height, 3], yaw, material: 'concrete' });
        const look = yaw + off;
        const match = soloMatch({ solids: [FLOOR, ledge], yaw: look });
        hold(match, ticks(0.2), usercmd({ yaw: look }));
        const start = match.latest.tick;
        const out = match.run(ticks(2), (t) => ({ p: t === start + 1 ? usercmd({ yaw: look, forward: 1, buttons: ['Jump'] }) : usercmd({ yaw: look }) })).map(me);

        expect(out[0]).toMatchObject({ movement: 'mantle', mantle: 'waist' });
        expect(out.at(-1)!.position[1]).toBeCloseTo(height, 6);
      }
    });
  }

  it('lets a hull that starts inside a rotated solid walk out of it', () => {
    const block = yawBox({ center: [0, 1, 0], size: [1.2, 2, 1.2], yaw: 0.5, material: 'wood' });
    const match = soloMatch({ solids: [FLOOR, block], position: [0.2, 0, 0.1] });
    const out = hold(match, ticks(1.5), usercmd({ forward: 1 }));

    expect(out.at(-1)!.position[2]).toBeLessThan(-2);
  });

  it('refuses to build a solid that blocks players and is tilted', () => {
    expect(() => orientedBox({ center: [0, 0, 0], size: [1, 1, 1], yaw: 0, pitch: 10 * DEG, roll: 0, material: 'wood', blocks: 'both' })).toThrow(/vertical axis/);
    expect(() => orientedBox({ center: [0, 0, 0], size: [1, 1, 1], yaw: 0.4, pitch: 0, roll: 5 * DEG, material: 'wood', blocks: 'players' })).toThrow(/vertical axis/);
    expect(() => orientedBox({ center: [0, 0, 0], size: [1, 1, 1], yaw: 0.4, pitch: 10 * DEG, roll: 5 * DEG, material: 'wood', blocks: 'bullets' })).not.toThrow();
  });
});

describe('player clip and bullet surfaces', () => {
  const DUMMY_AT = 12;
  /** The shooter at the origin facing -Z with a dummy 12 m down range, and a solid between them. */
  function range(between: Solid) {
    return createHeadlessMatch({
      solids: [FLOOR, between],
      players: [
        { id: 'p', team: 1, position: [0, 0, 0] },
        { id: 'd', team: 2, position: [0, 0, -DUMMY_AT], yaw: Math.PI, dummy: {} },
      ],
    });
  }
  /** Draws, then fires one aimed shot at the dummy's chest; returns every tick's outputs. */
  function shoot(match: ReturnType<typeof range>) {
    const draw = ticks(STATS.weapon.drawTime.value) + 2;
    const pitch = Math.atan2(1.2 - STATS.stance.standEyeHeight.value, DUMMY_AT);
    match.run(draw, () => ({ p: usercmd({ pitch, buttons: ['Ads'] }) }));
    return [match.step({ p: usercmd({ pitch, buttons: ['Ads', 'Fire'], firePresses: [0] }) }), ...match.run(ticks(0.5), () => ({ p: usercmd({ pitch, buttons: ['Ads'] }) }))];
  }

  it('player clip blocks the hull', () => {
    const match = soloMatch({ solids: [FLOOR, playerClip({ min: [-5, 0, -3.2], max: [5, 50, -3], material: 'concrete' })] });
    const out = hold(match, ticks(2), usercmd({ forward: 1 }));

    expect(out.at(-1)!.position[2]).toBeCloseTo(-3 + HALF, 9);
  });

  it('player clip never stops a bullet', () => {
    const clip = playerClip({ min: [-5, 0, -6.2], max: [5, 50, -6], material: 'concrete' });
    const out = shoot(range(clip));

    expect(out.flatMap((o) => o.events).filter((e) => e.type === 'hit')).toHaveLength(1);
    expect(out.flatMap((o) => o.events).filter((e) => e.type === 'impact')).toHaveLength(0);
    expect(raycastWorld(createWorld([clip]), [0, 1, 0], [0, 1, -20])).toBeNull();
  });

  it('bullet surfaces stop bullets', () => {
    const surface = box({ min: [-5, 0, -6.2], max: [5, 3, -6], material: 'wood', blocks: 'bullets' });
    const out = shoot(range(surface));

    expect(out.flatMap((o) => o.events).filter((e) => e.type === 'hit')).toHaveLength(0);
    expect(out.flatMap((o) => o.events).find((e) => e.type === 'impact')).toMatchObject({ material: 'wood', normal: [0, 0, 1] });
  });

  it('bullet surfaces never block the hull', () => {
    const surface = box({ min: [-5, 0, -3.2], max: [5, 3, -3], material: 'wood', blocks: 'bullets' });
    const match = soloMatch({ solids: [FLOOR, surface] });
    const out = hold(match, ticks(2), usercmd({ forward: 1 }));

    expect(out.at(-1)!.position[2]).toBeLessThan(-6);
  });

  it('a fully oriented bullet surface is hit at the right point, with its face normal', () => {
    // A slab tilted 30° back, the ray through its centre: it enters the top face 0.1 / sin 30° = 0.2 m before the centre.
    const slab = orientedBox({ center: [0, 2, -10], size: [4, 0.2, 4], yaw: 0, pitch: 30 * DEG, roll: 0, material: 'sheetMetal', blocks: 'bullets' });
    const hit = raycastWorld(createWorld([slab]), [0, 2, 0], [0, 2, -20])!;

    expect(hit.material).toBe('sheetMetal');
    expect(hit.point[0]).toBeCloseTo(0, 9);
    expect(hit.point[1]).toBeCloseTo(2, 9);
    expect(hit.point[2]).toBeCloseTo(-9.8, 9);
    expect(hit.normal[0]).toBeCloseTo(0, 9);
    expect(hit.normal[1]).toBeCloseTo(Math.cos(30 * DEG), 9);
    expect(hit.normal[2]).toBeCloseTo(Math.sin(30 * DEG), 9);
  });

  it('a yaw-rotated solid is hit on its rotated face', () => {
    const wall = wallFacing(30 * DEG, 5);
    const f = forwardOf(30 * DEG);
    const hit = raycastWorld(createWorld([wall]), [0, 1, 0], [f[0] * 20, 1, f[2] * 20])!;

    expect(hit.t * 20).toBeCloseTo(5, 9);
    expect(hit.normal[0]).toBeCloseTo(-f[0], 9);
    expect(hit.normal[2]).toBeCloseTo(-f[2], 9);
  });
});

/** Deterministic pseudo-random numbers for building test worlds. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A cluttered 40 x 40 m world of every kind of solid. */
function randomWorld(seed: number): Solid[] {
  const r = rng(seed);
  const at = (span: number) => (r() - 0.5) * span;
  const solids: Solid[] = [box({ min: [-25, -1, -25], max: [25, 0, 25], material: 'grass' })];
  for (let i = 0; i < 90; i++) {
    const kind = r();
    const size: Vec3 = [0.3 + r() * 4, 0.2 + r() * 2.5, 0.3 + r() * 4];
    const center: Vec3 = [at(40), size[1] / 2 + (r() < 0.2 ? r() * 2 : 0), at(40)];
    if (kind < 0.35) solids.push(box({ min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2], max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2], material: 'wood' }));
    else if (kind < 0.7) solids.push(yawBox({ center, size, yaw: r() * Math.PI * 2, material: 'brick' }));
    else if (kind < 0.8) solids.push(playerClip({ min: [center[0], 0, center[2]], max: [center[0] + size[0], size[1], center[2] + 0.3], material: 'concrete' }));
    else if (kind < 0.9) solids.push(yawBox({ center, size, yaw: r() * 6, material: 'glass', blocks: 'bullets' }));
    else solids.push(orientedBox({ center, size, yaw: r() * 6, pitch: r() - 0.5, roll: r() - 0.5, material: 'sheetMetal', blocks: 'bullets' }));
  }
  return solids;
}

/** Four players running, jumping, crouching, mantling and firing about the world. */
function busyScript(seed: number) {
  const r = rng(seed * 31 + 7);
  const plan = Array.from({ length: 4 }, () => ({ turn: (r() - 0.5) * 0.06, phase: r() * 100 }));
  return (tick: number): Record<string, UserCmd> =>
    Object.fromEntries(
      plan.map((p, i) => [
        `p${i}`,
        usercmd({
          forward: Math.sin((tick + p.phase) / 37) > -0.3 ? 1 : -1,
          right: Math.sin((tick + p.phase) / 13),
          yaw: tick * p.turn + i,
          pitch: Math.sin(tick / 50) * 0.3,
          buttons: [
            ...((tick + i * 11) % 47 === 0 ? (['Jump'] as const) : []),
            ...((tick + i * 5) % 200 < 30 ? (['Crouch'] as const) : []),
            ...((tick + i * 3) % 90 < 40 ? (['Sprint'] as const) : []),
            ...((tick + i) % 25 < 6 ? (['Fire'] as const) : []),
          ],
        }),
      ]),
    );
}

describe('the spatial grid', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`gives the same movement and hits as a linear scan (random world ${seed})`, () => {
      const solids = randomWorld(seed);
      const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, team: i + 1, position: [i * 3 - 4.5, 0, 0] as Vec3, yaw: i }));
      const script = busyScript(seed);
      const gridded = createHeadlessMatch({ solids, players }).run(ticks(10), script);
      const linear = createHeadlessMatch({ solids, players, spatialIndex: false }).run(ticks(10), script);

      expect(gridded).toEqual(linear);
      // The players really did get about and fire, so the comparison means something.
      const moved = gridded.at(-1)!.players.map((p: PlayerOutput) => Math.hypot(p.position[0] - (players.find((q) => q.id === p.id)!.position[0]), p.position[2]));
      expect(Math.max(...moved)).toBeGreaterThan(5);
      expect(gridded.flatMap((o) => o.events).some((e) => e.type === 'impact')).toBe(true);
    });
  }

  it('gives the same raycasts as a linear scan, near and far', () => {
    for (const seed of [11, 12, 13]) {
      const solids = randomWorld(seed);
      const gridded = createWorld(solids);
      const linear = createWorld(solids, { spatialIndex: false });
      const r = rng(seed);
      for (let i = 0; i < 2000; i++) {
        const a: Vec3 = [(r() - 0.5) * 60, r() * 4, (r() - 0.5) * 60];
        const length = r() < 0.5 ? r() * 15 : r() * 300;
        const dir: Vec3 = [r() - 0.5, (r() - 0.5) * 0.5, r() - 0.5];
        const k = length / Math.hypot(...dir);
        const b: Vec3 = [a[0] + dir[0] * k, a[1] + dir[1] * k, a[2] + dir[2] * k];
        expect(raycastWorld(gridded, a, b)).toEqual(raycastWorld(linear, a, b));
      }
    }
  });
});
