import { createWorld, type PlayerOutput, type Solid, type Vec3 } from '@duty-shooter/fps-core';
import { box } from '@duty-shooter/fps-core/harness';
import { Box3, Mesh, Scene, Vector3, type Object3D } from 'three/webgpu';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BODIES, PlayersView, SOLDIER_LEVELS } from '../src/players-view';
import { Soldier } from '../src/soldier';
import { loadTestSoldier } from './helpers/soldier';

beforeAll(loadTestSoldier);

function player(kind: 'player' | 'dummy' = 'player', id = 'p1', team = 0): PlayerOutput {
  return { id, team, kind, alive: true, position: [0, 0, 0], velocity: [0, 0, 0], yaw: 0, pitch: 0, stance: 'stand', movement: 'walk', eyeHeight: 1.6, weapon: { id: 'm4a1', action: 'ready', actionTime: 0, ads: 0, reload: null }, grenade: null } as unknown as PlayerOutput;
}

/** The colours a soldier is drawn in (hex). */
function colours(root: Object3D): Set<string> {
  const out = new Set<string>();
  root.traverseVisible((o) => {
    const c = (o as Mesh).isMesh ? (o as Mesh).geometry.getAttribute('color') : undefined;
    for (let i = 0; c && i < c.count; i++) out.add([c.getX(i), c.getY(i), c.getZ(i)].map((v) => v.toFixed(4)).join());
  });
  return out;
}

describe('player presentation', () => {
  it('leaves a body lying where a soldier dies, and stands a new soldier up when they are back', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const soldiers = () => scene.children[0]!.children;
    view.update([player()], 1 / 60);
    view.hit('p1', [0, 0, 1], 30);
    const dead = { ...player(), alive: false };
    for (let i = 0; i < 120; i++) view.update([dead], 1 / 60);
    scene.traverse((object) => {
      expect(object.position.toArray().every(Number.isFinite)).toBe(true);
      expect(object.quaternion.toArray().every(Number.isFinite)).toBe(true);
    });
    // One body, in one piece, down on the ground.
    expect(soldiers()).toHaveLength(1);
    scene.updateMatrixWorld(true);
    const lying = new Box3().setFromObject(scene);
    expect(lying.max.y).toBeLessThan(0.8);
    expect(lying.min.y).toBeGreaterThan(-0.1);
    // Back in the match: a soldier stands beside the body, which sinks away in its own time.
    view.update([player()], 1 / 60);
    expect(soldiers()).toHaveLength(2);
    for (let t = 0; t < BODIES.lies + BODIES.sinks; t += 1 / 30) view.update([player()], 1 / 30);
    expect(soldiers()).toHaveLength(1);
    view.dispose();
  });

  it('keeps no more bodies than it allows: the oldest sink away at once instead of vanishing', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const ids = Array.from({ length: BODIES.most + 4 }, (_, i) => `p${i}`);
    const dead = ids.map((id) => ({ ...player('player', id), alive: false }));
    view.update(ids.map((id) => player('player', id)), 1 / 60);
    view.update(dead, 1 / 60);
    view.update(dead, 1 / 60);
    const bodies = scene.children[0]!.children;
    expect(bodies).toHaveLength(BODIES.most + 4);
    for (let t = 0; t < BODIES.sinks / 2; t += 1 / 60) view.update(dead, 1 / 60);
    // The four oldest are on their way down, the rest lie where they fell.
    expect(bodies.filter((body) => body.position.y < -0.05)).toHaveLength(4);
    for (let t = 0; t < BODIES.sinks / 2 + 0.1; t += 1 / 60) view.update(dead, 1 / 60);
    expect(bodies).toHaveLength(BODIES.most);
    view.dispose();
  });

  describe('where a body falls', () => {
    const FLOOR = box({ min: [-30, -1, -30], max: [30, 0, 30], material: 'concrete' });
    /** Kills a soldier standing at the origin facing -Z, shot from the front `after` seconds after the hit, and returns its body's bounds once it lies. */
    const shot = (solids: readonly Solid[], after = 0, push: Vec3 = [0, 0, 1]) => {
      const scene = new Scene();
      const view = new PlayersView(scene, createWorld(solids), null);
      view.update([player()], 1 / 60);
      view.hit('p1', push, 30);
      for (let t = 0; t < after; t += 1 / 60) view.update([player()], 1 / 60);
      const dead = { ...player(), alive: false };
      for (let i = 0; i < 150; i++) view.update([dead], 1 / 60);
      scene.updateMatrixWorld(true);
      const lying = new Box3().setFromObject(scene);
      view.dispose();
      return lying;
    };

    it('throws it onto its back by the shot that killed it', () => {
      expect(shot([FLOOR]).max.z).toBeGreaterThan(1.3);
    });

    it('folds it where it stood when the last hit was a while ago: something else killed it', () => {
      const lying = shot([FLOOR], 2);
      expect(lying.max.z).toBeLessThan(1);
      expect(lying.min.z).toBeGreaterThan(-1);
    });

    it('folds it short of a wall behind it, at knee height or lower', () => {
      for (const height of [3, 0.35]) {
        const lying = shot([FLOOR, box({ min: [-5, 0, 1.2], max: [5, height, 1.5], material: 'concrete' })]);
        expect(lying.max.z, `a wall ${height} m high`).toBeLessThan(1.2);
      }
    });

    it('folds it short of a drop behind it, and does not slide it over the edge', () => {
      const lying = shot([box({ min: [-30, -1, -30], max: [30, 0, 1], material: 'concrete' })]);
      expect(lying.max.z).toBeLessThan(1);
      expect(lying.min.y).toBeGreaterThan(-0.1);
    });
  });

  it('shows the body of a soldier who dies on the frame it stops being a far stand-in', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const viewer: Vec3 = [0, 1.6, 0];
    const at = (z: number, alive: boolean) => [{ ...player(), position: [0, 0, z], alive }] as unknown as PlayerOutput[];
    view.update(at(SOLDIER_LEVELS.far + 30, true), 1 / 60, undefined, viewer);
    expect(scene.children[0]!.children[0]!.visible).toBe(false);
    view.update(at(SOLDIER_LEVELS.far - SOLDIER_LEVELS.margin - 2, false), 1 / 60, undefined, viewer);
    view.update(at(SOLDIER_LEVELS.far - SOLDIER_LEVELS.margin - 2, false), 1 / 60, undefined, viewer);
    expect(scene.children[0]!.children).toHaveLength(1);
    expect(scene.children[0]!.children[0]!.visible).toBe(true);
    view.dispose();
  });

  it('draws a body like the soldier it was: its shadow near, and nothing at all where a soldier is a stand-in', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const dead = [{ ...player(), alive: false }];
    view.update([player()], 1 / 60, undefined, [0, 1.6, 5]);
    view.update(dead, 1 / 60, undefined, [0, 1.6, 5]);
    const body = scene.children[0]!.children[0]!;
    const casts = () => {
      let any = false;
      body.traverseVisible((o) => (any ||= (o as Mesh).isMesh && o.castShadow));
      return any;
    };
    view.update(dead, 1 / 60, undefined, [0, 1.6, 5]);
    expect([body.visible, casts()]).toEqual([true, true]);
    view.update(dead, 1 / 60, undefined, [0, 1.6, (SOLDIER_LEVELS.near + SOLDIER_LEVELS.far) / 2]);
    expect([body.visible, casts()]).toEqual([true, false]);
    view.update(dead, 1 / 60, undefined, [0, 1.6, SOLDIER_LEVELS.far + 30]);
    expect(body.visible).toBe(false);
    view.dispose();
  });

  it('lets go of a soldier whose side changes while it is dead, once', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const viewer: Vec3 = [0, 1.6, SOLDIER_LEVELS.far + 30];
    // Dead as a far stand-in, it leaves no body: its soldier waits for it to come back.
    view.update([player('player', 'p1', 1)], 1 / 60, { teams: true, self: 1 }, viewer);
    view.update([{ ...player('player', 'p1', 1), alive: false }], 1 / 60, { teams: true, self: 1 }, viewer);
    const disposed = vi.spyOn(Soldier.prototype, 'dispose');
    for (let i = 0; i < 5; i++) view.update([{ ...player('player', 'p1', 2), alive: false }], 1 / 60, { teams: true, self: 1 }, viewer);
    expect(disposed).toHaveBeenCalledTimes(1);
    disposed.mockRestore();
    view.dispose();
  });

  it('animates a smooth stride when a player starts and stops moving', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    view.update([player()], 1 / 60);
    const hip = scene.getObjectByName('shinL')?.parent?.parent;
    expect(hip).toBeDefined();
    const angles: number[] = [];
    for (let i = 0; i < 150; i++) {
      const velocity: [number, number, number] = i < 90 ? [0, 0, 3] : [0, 0, 0];
      view.update([{ ...player(), velocity }], 1 / 60);
      angles.push(hip!.rotation.x);
    }
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(0.3);
    const largestStep = Math.max(...angles.slice(1).map((angle, i) => Math.abs(angle - angles[i]!)));
    expect(largestStep).toBeLessThan(0.2);
    expect(Math.abs(angles.at(-1)!)).toBeLessThan(0.01);
    view.dispose();
  });

  it('keeps the redesigned soldier within a small geometry and draw-call budget', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    view.update([player()], 1 / 60);
    scene.updateMatrixWorld(true);
    let draws = 0;
    let triangles = 0;
    scene.traverseVisible((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      draws++;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
    });
    // One skinned mesh: eight soldiers in view cost 8 draw calls, 16 with their shadows.
    expect(draws).toBe(1);
    expect(triangles).toBeLessThan(10_000);
    const size = new Box3().setFromObject(scene).getSize(new Vector3());
    expect(size.y).toBeGreaterThan(1.5);
    expect(size.y).toBeLessThan(2);
    view.dispose();
  });

  it('dresses each team in its own uniform, and everyone in free-for-all in a neutral one', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const roots = () => scene.children[0]!.children;
    view.update([player('player', 'p1', 1), player('player', 'p2', 2)], 1 / 60, { teams: true, self: 1 });
    const [blue, orange] = roots().map(colours);
    expect(blue).not.toEqual(orange);
    view.update([player('player', 'p1', 1), player('player', 'p2', 2)], 1 / 60, { teams: false, self: null });
    const [a, b] = roots().map(colours);
    expect(a).toEqual(b);
    expect(a).not.toEqual(blue);
    expect(a).not.toEqual(orange);
    view.dispose();
  });
});
