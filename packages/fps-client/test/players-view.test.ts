import { createWorld, type PlayerOutput } from '@duty-shooter/fps-core';
import { Box3, Mesh, Scene, Vector3, type Object3D } from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { BODIES, PlayersView } from '../src/players-view';
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
    expect(view.chest('p1')).not.toBeNull();
    view.dispose();
  });

  it('keeps no more bodies than it allows, the oldest going first', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const ids = Array.from({ length: BODIES.most + 4 }, (_, i) => `p${i}`);
    view.update(ids.map((id) => player('player', id)), 1 / 60);
    view.update(ids.map((id) => ({ ...player('player', id), alive: false })), 1 / 60);
    view.update(ids.map((id) => ({ ...player('player', id), alive: false })), 1 / 60);
    expect(scene.children[0]!.children).toHaveLength(BODIES.most);
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
