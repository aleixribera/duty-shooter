import { readFileSync } from 'node:fs';
import { STATS, WEAPON_IDS, isShellReload, type PlayerOutput, type WeaponId } from '@duty-shooter/fps-core';
import { Box3, Matrix4, Mesh, Quaternion, Vector3 } from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { HOLDS, Soldier, soldierModel, type Look } from '../src/soldier';
import { buildM4A1 } from '../src/viewmodel/m4a1';
import { loadTestSoldier } from './helpers/soldier';

beforeAll(loadTestSoldier);

const LOOKS: Look[] = [
  { uniform: 0x5d6447, vest: 0x3d4232, skin: 0xc08f6a, helmet: 0x4b5139, boots: 0x2a2622, accent: 0x5d6447 },
  { uniform: 0x40577a, vest: 0x26364d, skin: 0xc08f6a, helmet: 0x2f4362, boots: 0x22252b, accent: 0x3d8bff },
];

type State = {
  readonly stance?: PlayerOutput['stance'];
  readonly movement?: PlayerOutput['movement'];
  readonly mantle?: PlayerOutput['mantle'];
  readonly speed?: number;
  readonly pitch?: number;
  readonly eyeHeight?: number;
  readonly ads?: number;
  readonly action?: PlayerOutput['weapon']['action'];
  readonly reload?: 'tactical' | 'empty';
  readonly grenade?: PlayerOutput['grenade'];
  readonly downed?: PlayerOutput['downed'];
  readonly reviving?: number;
};

function output(id: WeaponId, s: State, t: number): PlayerOutput {
  return {
    id: 'p1', team: 0, kind: 'player', alive: true, position: [0, 0, 0], velocity: [0, 0, -(s.speed ?? 0)], yaw: 0.7, pitch: s.pitch ?? 0,
    movement: s.movement ?? 'walk', mantle: s.mantle ?? null, stance: s.stance ?? 'stand', eyeHeight: s.eyeHeight ?? 1.6, health: 100, landing: null,
    weapon: { id, slot: 0, action: s.action ?? 'ready', actionTime: t, reload: s.reload ?? null, ammo: 10, ads: s.ads ?? 0, spread: 0, canFire: true, shotIndex: 0, sway: [0, 0] },
    grenade: s.grenade ?? null, downed: s.downed ?? null, reviving: s.reviving ?? null,
  } as unknown as PlayerOutput;
}

/** Every pose and action the game puts a soldier in, held for `duration` seconds. */
function poses(id: WeaponId): { name: string; duration: number; state: (t: number) => State }[] {
  const row = STATS.weapons[id];
  const r = row.reload;
  const reloads = isShellReload(r)
    ? [{ name: 'shell reload', duration: r.start.value + 3 * r.perShell.value, state: () => ({ action: 'reload' as const, reload: 'tactical' as const }) }]
    : (['tactical', 'empty'] as const).map((kind) => ({
        name: `${kind} reload`,
        duration: kind === 'empty' ? r.emptyDuration.value : r.tacticalDuration.value,
        state: () => ({ action: 'reload' as const, reload: kind }),
      }));
  const crouchEye = STATS.stance.crouchEyeHeight.value;
  return [
    { name: 'idle', duration: 1, state: () => ({}) },
    { name: 'look up', duration: 1, state: () => ({ pitch: 1.3 }) },
    { name: 'look down', duration: 1, state: () => ({ pitch: -1.3 }) },
    { name: 'aim', duration: 1, state: () => ({ ads: 1, pitch: 0.3 }) },
    { name: 'walk', duration: 1.5, state: () => ({ speed: 4 }) },
    { name: 'aimed walk', duration: 1.5, state: () => ({ speed: 2, ads: 1 }) },
    { name: 'sprint', duration: 1.5, state: () => ({ speed: 7, movement: 'sprint' }) },
    { name: 'crouch', duration: 1, state: () => ({ stance: 'crouch', eyeHeight: crouchEye }) },
    { name: 'crouched aim', duration: 1, state: () => ({ stance: 'crouch', eyeHeight: crouchEye, ads: 1, pitch: -0.4 }) },
    { name: 'prone', duration: 1.5, state: () => ({ stance: 'prone', eyeHeight: 0.4 }) },
    { name: 'prone aim', duration: 1.5, state: () => ({ stance: 'prone', eyeHeight: 0.4, ads: 1, pitch: 0.2 }) },
    { name: 'slide', duration: 0.8, state: () => ({ movement: 'slide', speed: 6 }) },
    { name: 'jump', duration: 0.8, state: () => ({ movement: 'airborne', speed: 4 }) },
    ...reloads,
    { name: 'cycle', duration: row.handling.cycleTime?.value ?? 0.5, state: () => ({ action: 'cycle' }) },
    { name: 'draw', duration: row.handling.drawTime.value, state: () => ({ action: 'draw' }) },
    { name: 'holster', duration: row.handling.holsterTime.value, state: () => ({ action: 'holster' }) },
    { name: 'inspect', duration: 2, state: () => ({ action: 'inspect' }) },
    { name: 'melee', duration: STATS.melee.duration.value, state: () => ({ action: 'melee' }) },
    {
      name: 'grenade',
      duration: 1.5,
      state: (t) => ({ action: 'grenade', grenade: t < 1 ? { phase: 'cook', time: t } : { phase: 'throw', time: t - 1 } }),
    },
  ];
}

/** The gun's bounds from a GLB's accessor bounds, without decoding its textures. */
function glbBounds(file: string): Box3 {
  const bytes = readFileSync(new URL(`../src/viewmodel/assets/${file}`, import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as {
    scenes: { nodes: number[] }[];
    nodes: { mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { min: number[]; max: number[] }[];
  };
  const box = new Box3();
  const visit = (i: number, parent: Matrix4) => {
    const n = gltf.nodes[i]!;
    const [tx = 0, ty = 0, tz = 0] = n.translation ?? [];
    const [qx = 0, qy = 0, qz = 0, qw = 1] = n.rotation ?? [];
    const [sx = 1, sy = 1, sz = 1] = n.scale ?? [];
    const world = parent.clone().multiply(new Matrix4().compose(new Vector3(tx, ty, tz), new Quaternion(qx, qy, qz, qw), new Vector3(sx, sy, sz)));
    for (const prim of n.mesh === undefined ? [] : gltf.meshes[n.mesh]!.primitives) {
      const a = gltf.accessors[prim.attributes.POSITION]!;
      box.union(new Box3(new Vector3(...a.min), new Vector3(...a.max)).applyMatrix4(world));
    }
    for (const c of n.children ?? []) visit(c, world);
  };
  for (const root of gltf.scenes[0]!.nodes) visit(root, new Matrix4());
  return box;
}

function gunBounds(id: WeaponId): Box3 {
  return id === 'm4a1' ? new Box3().setFromObject(buildM4A1({ detail: 'low' }).root) : glbBounds(`${id}.glb`);
}

describe('the third-person soldier holding each weapon', () => {
  it('takes its hold points from the weapon models: the stock at the butt plate, the hands on the gun', () => {
    for (const id of WEAPON_IDS) {
      const box = gunBounds(id);
      const hold = HOLDS[id];
      if (hold.stock) expect(Math.abs(box.max.z - hold.stock[2]), `${id} stock`).toBeLessThan(0.015);
      const near = box.clone().expandByScalar(0.03);
      for (const [name, palm] of [['grip', hold.right], ['support', hold.left], ['magazine', hold.mag]] as const) {
        expect(near.containsPoint(new Vector3(...palm.pos)), `${id} ${name}`).toBe(true);
      }
      // The support hand is ahead of the grip on a long gun.
      if (hold.stock) expect(hold.left.pos[2]).toBeLessThan(hold.right.pos[2] - 0.1);
    }
  });

  it('keeps both hands on every gun in every pose and action', () => {
    const misses: string[] = [];
    for (const id of WEAPON_IDS) {
      for (const look of LOOKS) {
        for (const pose of poses(id)) {
          const soldier = new Soldier(soldierModel()!, look);
          soldier.hold(id, new Mesh());
          const dt = 1 / 60;
          let worst: [number, number] = [0, 0];
          for (let t = 0; t <= pose.duration; t += dt) {
            soldier.update(output(id, pose.state(t), t), dt);
            worst = [Math.max(worst[0], soldier.handError[0]), Math.max(worst[1], soldier.handError[1])];
          }
          if (worst[0] > 0.01 || worst[1] > 0.01) misses.push(`${id} ${pose.name}: left ${worst[0].toFixed(3)} m, right ${worst[1].toFixed(3)} m`);
          soldier.dispose();
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it('points the barrel where the soldier aims, with the gun in front of the chest', () => {
    for (const id of WEAPON_IDS) {
      for (const state of [{}, { ads: 1 }, { pitch: 0.9 }, { pitch: -0.9, ads: 1 }, { stance: 'crouch' as const }]) {
        const soldier = new Soldier(soldierModel()!, LOOKS[0]!);
        soldier.hold(id, new Mesh());
        const p = output(id, state, 0);
        for (let i = 0; i < 90; i++) soldier.update(p, 1 / 60);
        soldier.root.updateMatrixWorld(true);
        const barrel = new Vector3(0, 0, -1).applyQuaternion(soldier.gunMount.getWorldQuaternion(new Quaternion()));
        const aim = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(1, 0, 0), p.pitch).applyAxisAngle(new Vector3(0, 1, 0), p.yaw);
        expect(barrel.angleTo(aim), `${id} ${JSON.stringify(state)}`).toBeLessThan(0.01);
        // The grip ahead of the vest's front, in the soldier's frame.
        const grip = soldier.root.worldToLocal(soldier.gunMount.localToWorld(new Vector3(...HOLDS[id].right.pos)));
        expect(grip.z, `${id} grip`).toBeLessThan(-0.05);
        soldier.dispose();
      }
    }
  });

  describe('Downed and Reviving', () => {
    const jointAt = (soldier: Soldier, name: string) => {
      soldier.root.updateMatrixWorld(true);
      return soldier.root.getObjectByName(name)!.getWorldPosition(new Vector3());
    };
    const standing = (id: WeaponId) => {
      const soldier = new Soldier(soldierModel()!, LOOKS[0]!);
      soldier.hold(id, new Mesh());
      return soldier;
    };
    const settle = (soldier: Soldier, state: State, seconds = 1.5) => {
      for (let i = 0; i < seconds * 60; i++) soldier.update(output('m4a1', state, i / 60), 1 / 60);
    };
    const crawling: State = { stance: 'prone', eyeHeight: 0.4, downed: { bleedOut: 20, revive: 0 } };

    it('lies flat on the chest with the gun put away', () => {
      const soldier = standing('m4a1');
      settle(soldier, crawling);
      expect(jointAt(soldier, 'hips').y).toBeLessThan(0.25);
      expect(jointAt(soldier, 'neck').y).toBeLessThan(0.45);
      expect(soldier.gunMount.visible).toBe(false);
    });

    it('crawls with its arms by the distance it covers, and holds still when it stops', () => {
      const soldier = standing('m4a1');
      settle(soldier, crawling);
      const still = jointAt(soldier, 'wristL').clone();
      settle(soldier, crawling, 0.5);
      expect(jointAt(soldier, 'wristL').distanceTo(still)).toBeLessThan(0.001);
      settle(soldier, { ...crawling, speed: 0.7 }, 0.45);
      expect(jointAt(soldier, 'wristL').distanceTo(still)).toBeGreaterThan(0.1);
    });

    it('kneels over a squadmate with both hands down while it Revives', () => {
      const soldier = standing('m4a1');
      settle(soldier, { stance: 'crouch', eyeHeight: 1, reviving: 0.5 });
      expect(jointAt(soldier, 'hips').y).toBeLessThan(0.65);
      for (const wrist of ['wristL', 'wristR']) {
        expect(jointAt(soldier, wrist).y, wrist).toBeLessThan(0.4);
      }
      expect(soldier.gunMount.visible).toBe(false);
    });

    it('stays out of the ground, whatever its arms and legs are doing', () => {
      for (const [name, state] of [['crawl', { ...crawling, speed: 0.7 }], ['revive', { stance: 'crouch', eyeHeight: 1, reviving: 0.5 } as State]] as const) {
        const soldier = standing('m4a1');
        settle(soldier, state);
        for (let i = 0; i < 90; i++) {
          soldier.update(output('m4a1', state, 0), 1 / 60);
          soldier.root.updateMatrixWorld(true);
          for (const piece of soldier.parts.values()) {
            const lowest = new Box3().setFromObject(piece, true).min.y;
            expect(lowest, `${name}: ${piece.name}`).toBeGreaterThan(-0.04);
          }
        }
      }
    });

    it('gets back up as it was: gun out, hands on it, no turn left over from the clip', () => {
      const fresh = standing('m4a1');
      const soldier = standing('m4a1');
      settle(fresh, {}, 3);
      settle(soldier, crawling);
      settle(soldier, {}, 3);
      expect(soldier.gunMount.visible).toBe(true);
      expect(soldier.handError[0]).toBeLessThan(0.01);
      expect(soldier.handError[1]).toBeLessThan(0.01);
      for (const joint of ['hips', 'spine', 'hipL', 'hipR', 'kneeL', 'ankleR', 'neck']) {
        expect(jointAt(soldier, joint).distanceTo(jointAt(fresh, joint)), joint).toBeLessThan(0.01);
      }
    });
  });
  describe('Dying', () => {
    /** A soldier facing -Z, settled in `state`. */
    const settled = (state: State = {}) => {
      const soldier = new Soldier(soldierModel()!, LOOKS[0]!);
      soldier.hold('m4a1', new Mesh());
      for (let i = 0; i < 60; i++) soldier.update({ ...output('m4a1', state, i / 60), yaw: 0 }, 1 / 60);
      return soldier;
    };
    /** Plays the death out, checking on the way that nothing goes through the ground. Returns where the head ends up. */
    const fallen = (soldier: Soldier, name: string) => {
      for (let i = 0; i < 120; i++) {
        soldier.fall(1 / 60);
        soldier.root.updateMatrixWorld(true);
        for (const piece of soldier.parts.values()) {
          expect(new Box3().setFromObject(piece, true).min.y, `${name}: ${piece.name}`).toBeGreaterThan(-0.07);
        }
      }
      expect(soldier.fall(1 / 60)).toBe(1);
      for (const piece of soldier.parts.values()) {
        expect(new Box3().setFromObject(piece, true).max.y, `${name}: ${piece.name}`).toBeLessThan(0.75);
      }
      return soldier.root.getObjectByName('neck')!.getWorldPosition(new Vector3());
    };

    it('is thrown onto its back by a shot from the front, and onto its chest by one from behind', () => {
      const front = settled();
      front.die([0, 0, 2.5]);
      expect(front.dead).toBe(true);
      expect(front.gunMount.visible).toBe(false);
      expect(fallen(front, 'from the front').z).toBeGreaterThan(0.6);
      const behind = settled({ speed: 6, movement: 'sprint' });
      behind.die([0, 0, -2.5]);
      expect(fallen(behind, 'from behind').z).toBeLessThan(-0.6);
    });

    it('folds onto the side the shot pushed it to', () => {
      for (const side of [1, -1]) {
        const soldier = settled({ stance: 'crouch', eyeHeight: 1 });
        soldier.die([side * 2.5, 0, 0]);
        const head = fallen(soldier, `pushed ${side}`);
        expect(head.x * side).toBeGreaterThan(0.3);
        expect(Math.abs(head.z)).toBeLessThan(0.5);
      }
    });

    it('folds up where it stands with no room to fall its length', () => {
      const soldier = settled();
      soldier.die([0, 0, 2.5], (right, back) => back === 0 && right > 0);
      const head = fallen(soldier, 'against a wall');
      expect(head.x).toBeGreaterThan(0.3);
      expect(Math.abs(head.z)).toBeLessThan(0.5);
    });

    it('stays on its chest when it dies prone or Downed', () => {
      for (const state of [{ stance: 'prone', eyeHeight: 0.4 }, { stance: 'prone', eyeHeight: 0.4, downed: { bleedOut: 20, revive: 0 } }] as State[]) {
        const soldier = settled(state);
        soldier.die([0, 0, 2.5]);
        expect(fallen(soldier, 'prone').z).toBeLessThan(-0.6);
      }
    });
  });

  describe('Mantling (ticket 67)', () => {
    const jointAt = (soldier: Soldier, name: string) => {
      soldier.root.updateMatrixWorld(true);
      return soldier.root.getObjectByName(name)!.getWorldPosition(new Vector3());
    };
    const standing = () => {
      const soldier = new Soldier(soldierModel()!, LOOKS[0]!);
      soldier.hold('m4a1', new Mesh());
      for (let i = 0; i < 90; i++) soldier.update(output('m4a1', {}, i / 60), 1 / 60);
      return soldier;
    };
    const mantle = (soldier: Soldier, band: NonNullable<PlayerOutput['mantle']>, seconds: number) => {
      for (let i = 0; i < seconds * 60; i++) soldier.update(output('m4a1', { movement: 'mantle', mantle: band }, i / 60), 1 / 60);
    };

    it('climbs with both hands up on the ledge, the gun put away, then pulls a knee up', () => {
      const soldier = standing();
      mantle(soldier, 'highClimb', 0.15);
      for (const wrist of ['wristL', 'wristR']) expect(jointAt(soldier, wrist).y, wrist).toBeGreaterThan(jointAt(soldier, 'neck').y);
      expect(soldier.gunMount.visible).toBe(false);
      mantle(soldier, 'highClimb', 0.25);
      // Standing, the knee is a thigh (0.42 m) under the hip.
      expect(jointAt(soldier, 'kneeR').y).toBeGreaterThan(jointAt(soldier, 'hipR').y - 0.25);
    });

    it('vaults a low wall one-handed: the left hand down on it, the gun kept in the right', () => {
      const soldier = standing();
      mantle(soldier, 'lowVault', 0.2);
      expect(jointAt(soldier, 'wristL').y).toBeLessThan(jointAt(soldier, 'hips').y);
      expect(soldier.gunMount.visible).toBe(true);
      expect(soldier.handError[1]).toBeLessThan(0.01);
    });

    it('plays a new mantle from its start, and stands back up as it was', () => {
      const fresh = standing();
      const soldier = standing();
      mantle(soldier, 'highClimb', 1.2);
      for (let i = 0; i < 180; i++) {
        soldier.update(output('m4a1', {}, i / 60), 1 / 60);
        fresh.update(output('m4a1', {}, i / 60), 1 / 60);
      }
      expect(soldier.gunMount.visible).toBe(true);
      for (const joint of ['hips', 'spine', 'wristL', 'wristR', 'kneeR', 'neck']) {
        expect(jointAt(soldier, joint).distanceTo(jointAt(fresh, joint)), joint).toBeLessThan(0.01);
      }
      mantle(soldier, 'highClimb', 0.15);
      expect(jointAt(soldier, 'wristL').y).toBeGreaterThan(jointAt(soldier, 'neck').y);
    });
  });
});
