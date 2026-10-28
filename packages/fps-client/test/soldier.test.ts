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
  readonly speed?: number;
  readonly pitch?: number;
  readonly eyeHeight?: number;
  readonly ads?: number;
  readonly action?: PlayerOutput['weapon']['action'];
  readonly reload?: 'tactical' | 'empty';
  readonly grenade?: PlayerOutput['grenade'];
};

function output(id: WeaponId, s: State, t: number): PlayerOutput {
  return {
    id: 'p1', team: 0, kind: 'player', alive: true, position: [0, 0, 0], velocity: [0, 0, -(s.speed ?? 0)], yaw: 0.7, pitch: s.pitch ?? 0,
    movement: s.movement ?? 'walk', mantle: null, stance: s.stance ?? 'stand', eyeHeight: s.eyeHeight ?? 1.6, health: 100, landing: null,
    weapon: { id, slot: 0, action: s.action ?? 'ready', actionTime: t, reload: s.reload ?? null, ammo: 10, ads: s.ads ?? 0, spread: 0, canFire: true, shotIndex: 0, sway: [0, 0] },
    grenade: s.grenade ?? null,
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
});
