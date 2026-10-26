import { createWorld, type PlayerOutput } from '@duty-shooter/fps-core';
import { Box3, Mesh, Scene, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { PlayersView } from '../src/players-view';

function player(kind: 'player' | 'dummy' = 'player'): PlayerOutput {
  return { id: 1, kind, alive: true, position: [0, 0, 0], velocity: [0, 0, 0], yaw: 0, pitch: 0, stance: 'stand', movement: 'walk', eyeHeight: 1.6 } as PlayerOutput;
}

describe('player presentation', () => {
  it('keeps ragdoll transforms finite when a redesigned soldier dies', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    view.update([player()], 1 / 60);
    view.update([{ ...player(), alive: false }], 1 / 60);
    for (let i = 0; i < 60; i++) view.update([{ ...player(), alive: false }], 1 / 60);
    scene.traverse((object) => {
      expect(object.position.toArray().every(Number.isFinite)).toBe(true);
      expect(object.quaternion.toArray().every(Number.isFinite)).toBe(true);
    });
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
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      draws++;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
    });
    expect(draws).toBeLessThanOrEqual(22);
    expect(triangles).toBeLessThan(10_000);
    const size = new Box3().setFromObject(scene).getSize(new Vector3());
    expect(size.y).toBeGreaterThan(1.5);
    expect(size.y).toBeLessThan(2);
    view.dispose();
  });
});
