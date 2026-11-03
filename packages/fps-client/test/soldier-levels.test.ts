import { createWorld, type PlayerOutput, type Vec3 } from '@duty-shooter/fps-core';
import { InstancedMesh, PerspectiveCamera, Scene, type Mesh, type Object3D } from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { PlayersView, SOLDIER_LEVELS } from '../src/players-view';
import { loadTestSoldier } from './helpers/soldier';

beforeAll(loadTestSoldier);

const VIEWER: Vec3 = [0, 1.6, 0];

function soldierAt(id: string, x: number, z: number, more: Partial<PlayerOutput> = {}): PlayerOutput {
  return { id, team: 0, kind: 'player', alive: true, position: [x, 0, z], velocity: [0, 0, 0], yaw: 0, pitch: 0, stance: 'stand', movement: 'walk', eyeHeight: 1.6, weapon: { id: 'm4a1', action: 'ready', actionTime: 0, ads: 0, reload: null }, grenade: null, ...more } as unknown as PlayerOutput;
}

/** What the scene draws: each visible mesh is a draw call (an instanced one draws all its instances), and its triangles. */
function drawn(scene: Scene) {
  let draws = 0;
  let triangles = 0;
  let shadowCasters = 0;
  scene.updateMatrixWorld(true);
  scene.traverseVisible((o: Object3D) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const instances = (mesh as unknown as InstancedMesh).isInstancedMesh ? (mesh as unknown as InstancedMesh).count : 1;
    if (instances === 0) return;
    draws++;
    if (mesh.castShadow) shadowCasters++;
    triangles += ((mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3) * instances;
  });
  return { draws, triangles, shadowCasters };
}

/** The soldier's left hip, which swings with the stride. */
const hipOf = (scene: Scene, nth = 0) => scene.getObjectsByProperty('name', 'hipL')[nth]!;

describe('soldier levels (ticket 10): full near, cheap animated mid, instanced far', () => {
  it('draws a near soldier in full, posed every frame and casting its shadow', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const angles: number[] = [];
    for (let i = 0; i < 12; i++) {
      view.update([soldierAt('a', 0, 10 + i * 0.05, { velocity: [0, 0, 3] })], 1 / 60, undefined, VIEWER);
      angles.push(hipOf(scene).rotation.x);
    }
    const changes = angles.slice(1).filter((a, i) => a !== angles[i]).length;
    expect(changes).toBe(11);
    const d = drawn(scene);
    expect(d.draws).toBe(1);
    expect(d.shadowCasters).toBe(1);
    view.dispose();
  });

  it('poses a soldier at mid range a few times a second, on the spot every frame, without a shadow', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const z = (SOLDIER_LEVELS.near + SOLDIER_LEVELS.far) / 2;
    const angles: number[] = [];
    const positions: number[] = [];
    for (let i = 0; i < 12; i++) {
      view.update([soldierAt('a', 0, z + i * 0.05, { velocity: [0, 0, 3] })], 1 / 60, undefined, VIEWER);
      angles.push(hipOf(scene).rotation.x);
      positions.push(hipOf(scene).parent!.parent!.position.z);
    }
    const changes = angles.slice(1).filter((a, i) => a !== angles[i]).length;
    expect(changes).toBeGreaterThanOrEqual(2);
    expect(changes).toBeLessThanOrEqual(12 / SOLDIER_LEVELS.midEvery + 1);
    // Still walking: the stride keeps swinging between poses.
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(0.01);
    // Where it stands follows every frame.
    expect(positions.slice(1).every((p, i) => p > positions[i]!)).toBe(true);
    expect(drawn(scene).shadowCasters).toBe(0);
    view.dispose();
  });

  it('draws every far soldier of a look in one instanced call of a few hundred triangles each, in its stance', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const far = SOLDIER_LEVELS.far + 30;
    const crowd = Array.from({ length: 40 }, (_, i) => soldierAt(`b${i}`, (i - 20) * 4, far, i % 4 === 0 ? { stance: 'crouch' } : {}));
    view.update(crowd, 1 / 60, undefined, VIEWER);
    const d = drawn(scene);
    // Standing and crouched: one call each, not one per soldier.
    expect(d.draws).toBe(2);
    expect(d.triangles / crowd.length).toBeLessThan(400);
    expect(d.shadowCasters).toBe(0);
    view.dispose();
  });

  it('brings a soldier back to full detail as it comes near, and lets go of it far again', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const at = (z: number) => view.update([soldierAt('a', 0, z)], 1 / 60, undefined, VIEWER);
    at(SOLDIER_LEVELS.far + 50);
    expect(drawn(scene)).toMatchObject({ draws: 1, shadowCasters: 0 });
    expect(scene.getObjectsByProperty('isSkinnedMesh', true).filter((o) => o.visible && o.parent?.visible)).toHaveLength(0);
    at(10);
    expect(drawn(scene)).toMatchObject({ draws: 1, shadowCasters: 1 });
    expect(scene.getObjectsByProperty('isInstancedMesh', true).filter((o) => (o as InstancedMesh).count > 0 && o.visible)).toHaveLength(0);
    at(SOLDIER_LEVELS.far + 50);
    expect(drawn(scene)).toMatchObject({ draws: 1, shadowCasters: 0 });
    view.dispose();
  });

  it('keeps a soldier on the line between levels from flickering between them', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const line = SOLDIER_LEVELS.far;
    const levels: number[] = [];
    for (let i = 0; i < 20; i++) {
      view.update([soldierAt('a', 0, line + (i % 2 ? 1 : -1))], 1 / 60, undefined, VIEWER);
      levels.push(scene.getObjectsByProperty('isInstancedMesh', true).some((o) => (o as InstancedMesh).count > 0 && o.visible) ? 1 : 0);
    }
    expect(new Set(levels).size).toBe(1);
    view.dispose();
  });

  it('draws a far soldier seen through a scope as near as the scope brings it', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    view.update([soldierAt('a', 0, SOLDIER_LEVELS.far + 50)], 1 / 60, undefined, VIEWER, 6);
    expect(drawn(scene)).toMatchObject({ draws: 1, shadowCasters: 1 });
    view.dispose();
  });

  it('shows a far stand-in among the samples, so its shader is compiled before a far soldier needs it', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const camera = new PerspectiveCamera();
    const hide = view.showSamples(camera);
    expect(scene.getObjectsByProperty('isInstancedMesh', true).filter((o) => o.visible)).toHaveLength(1);
    hide();
    expect(scene.getObjectsByProperty('isInstancedMesh', true)).toHaveLength(0);
    view.dispose();
  });

  it('draws everyone in full without a viewer (the range, the viewers and tools)', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    view.update([soldierAt('a', 0, 900)], 1 / 60);
    expect(drawn(scene)).toMatchObject({ draws: 1, shadowCasters: 1 });
    view.dispose();
  });
});
