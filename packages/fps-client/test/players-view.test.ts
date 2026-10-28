import { createWorld, type PlayerOutput } from '@duty-shooter/fps-core';
import { Box3, Mesh, Scene, Vector3, type Object3D } from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { PlayersView } from '../src/players-view';
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

/** Ids of the players whose nameplates are showing. */
function nameplates(scene: Scene): string[] {
  const out: string[] = [];
  scene.traverse((o) => {
    if (o.name === 'nameplate' && o.visible && o.parent?.visible) out.push(o.userData['player'] as string);
  });
  return out.sort();
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
    view.update([player('player', 'p1', 1), player('player', 'p2', 2)], 1 / 60, { teams: true, self: 1, names: new Map() });
    const [blue, orange] = roots().map(colours);
    expect(blue).not.toEqual(orange);
    view.update([player('player', 'p1', 1), player('player', 'p2', 2)], 1 / 60, { teams: false, self: null, names: new Map() });
    const [a, b] = roots().map(colours);
    expect(a).toEqual(b);
    expect(a).not.toEqual(blue);
    expect(a).not.toEqual(orange);
    view.dispose();
  });

  it('shows nameplates over living teammates only', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    const names = new Map([
      ['p2', 'Ally'],
      ['p3', 'Enemy'],
      ['p4', 'Ally two'],
    ]);
    const players = [player('player', 'p2', 1), player('player', 'p3', 2), player('player', 'p4', 1)];
    view.update(players, 1 / 60, { teams: true, self: 1, names });
    expect(nameplates(scene)).toEqual(['p2', 'p4']);
    // A teammate down loses theirs.
    view.update([players[0]!, players[1]!, { ...players[2]!, alive: false }], 1 / 60, { teams: true, self: 1, names });
    expect(nameplates(scene)).toEqual(['p2']);
    // No teams, no teammates.
    view.update(players, 1 / 60, { teams: false, self: null, names });
    expect(nameplates(scene)).toEqual([]);
    view.dispose();
  });

  it('depth-tests nameplates, so a wall in front of a teammate hides theirs', () => {
    const scene = new Scene();
    const view = new PlayersView(scene, createWorld([]), null);
    view.update([player('player', 'p2', 1)], 1 / 60, { teams: true, self: 1, names: new Map([['p2', 'Ally']]) });
    let plate: Object3D | null = null;
    scene.traverse((o) => {
      if (o.name === 'nameplate') plate = o;
    });
    const material = (plate as unknown as Mesh).material as { depthTest: boolean };
    expect(material.depthTest).toBe(true);
    view.dispose();
  });
});
