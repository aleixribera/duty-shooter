import { readFile } from 'node:fs/promises';
import { Box3, Mesh, Raycaster, Vector3 } from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { attachAuthoredM4, disposeAuthored } from '../src/viewmodel/authored-m4a1';
import { buildM4A1 } from '../src/viewmodel/m4a1';
import { Viewmodel } from '../src/viewmodel/viewmodel';

async function loadAsset() {
  const bytes = await readFile(new URL('../src/viewmodel/assets/m4a1-details.glb', import.meta.url));
  return (await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '')).scene;
}

describe('authored M4A1', () => {
  it('retains a valid lightweight weapon for other players', () => {
    const gun = buildM4A1({ detail: 'low' });
    let meshCount = 0;
    gun.root.traverse((object) => { if ((object as Mesh).isMesh) meshCount++; });
    expect(meshCount).toBe(3);
    for (const name of ['metal', 'polymer', 'magazineBody']) {
      const mesh = gun.root.getObjectByName(name) as Mesh | undefined;
      expect(mesh?.isMesh).toBe(true);
      expect(mesh!.geometry.index!.count).toBeGreaterThan(0);
      const positions = mesh!.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))).toBe(true);
      }
    }
    const polymer = gun.root.getObjectByName('polymer')!;
    gun.root.updateMatrixWorld(true);
    const throughStock = new Raycaster(new Vector3(.03, -.045, .21), new Vector3(-1, 0, 0), 0, .06);
    const acrossStock = new Raycaster(new Vector3(.03, 0, .21), new Vector3(-1, 0, 0), 0, .06);
    expect(throughStock.intersectObject(polymer).length).toBe(0);
    expect(acrossStock.intersectObject(polymer).length).toBeGreaterThan(0);
    gun.dispose();
  });

  it('keeps the remodeled magazine aligned and moving with the reload mount', async () => {
    const gun = buildM4A1({ detail: 'high' });
    const scene = await loadAsset();
    let triangles = 0;
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) triangles += (mesh.geometry.index?.count ?? 0) / 3;
    });
    expect(triangles).toBeLessThan(60_000);
    const release = attachAuthoredM4(gun, scene);
    const magazine = gun.magazine.getObjectByName('authored_magazine');
    expect(magazine?.parent).toBe(gun.magazine);
    expect(gun.magazine.getObjectByName('authored_magazine_marks')?.parent).toBe(gun.magazine);
    expect(gun.magazine.getObjectByName('magazineBody')?.visible).toBe(false);
    expect(gun.root.getObjectByName('handguard')?.visible).toBe(false);

    gun.root.updateMatrixWorld(true);
    const muzzle = scene.getObjectByName('authored_muzzle')!;
    const muzzleBounds = new Box3().setFromObject(muzzle);
    expect(muzzleBounds.min.z).toBeCloseTo(gun.sockets.muzzle.position.z, 3);
    expect(muzzleBounds.max.z).toBeCloseTo(-.529, 3);
    const receiver = scene.getObjectByName('authored_magwell')!;
    const surface = (receiver as Mesh).geometry.getAttribute('surf');
    let wornVertices = 0;
    for (let i = 0; i < surface.count; i++) if (surface.getY(i) > .5) wornVertices++;
    expect(wornVertices).toBeGreaterThan(0);
    expect(wornVertices).toBeLessThan(surface.count * .4);
    const magwellOpening = new Raycaster(new Vector3(0, -.09, -.134), new Vector3(0, 1, 0), 0, .06);
    expect(magwellOpening.intersectObject(receiver).length).toBe(0);
    const sight = gun.sockets.rearSight.position;
    const throughSight = new Raycaster(new Vector3(sight.x, sight.y, .005), new Vector3(0, 0, -1), 0, .06);
    expect(throughSight.intersectObject(receiver).length).toBe(0);
    const onRing = new Raycaster(new Vector3(sight.x + .004, sight.y, .005), new Vector3(0, 0, -1), 0, .06);
    expect(onRing.intersectObject(receiver).length).toBeGreaterThan(0);
    const gripSocket = gun.sockets.rightGrip.position;
    const grip = scene.getObjectByName('authored_stock')!;
    const towardGrip = new Raycaster(gripSocket.clone(), new Vector3(-1, 0, 0), 0, .03);
    expect(towardGrip.intersectObject(grip).length).toBeGreaterThan(0);
    const before = new Box3().setFromObject(magazine!).getCenter(new Vector3());
    const newBounds = new Box3().setFromObject(magazine!);
    const oldBounds = new Box3().setFromObject(gun.magazine.getObjectByName('magazineBody')!);
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(Math.abs(newBounds.min[axis] - oldBounds.min[axis])).toBeLessThan(.007);
      expect(Math.abs(newBounds.max[axis] - oldBounds.max[axis])).toBeLessThan(.007);
    }
    // The magazine extends below its mount, in the same local space as the
    // original magazine and the reload track.
    expect(before.y).toBeLessThan(gun.magazine.position.y - .05);
    expect(before.z).toBeGreaterThan(-.19);
    expect(before.z).toBeLessThan(-.08);
    gun.magazine.position.y -= .12;
    gun.root.updateMatrixWorld(true);
    const after = new Box3().setFromObject(magazine!).getCenter(new Vector3());
    expect(after.y - before.y).toBeCloseTo(-.12, 5);
    expect(after.z).toBeCloseTo(before.z, 5);

    release();
    expect(gun.magazine.getObjectByName('magazineBody')?.visible).toBe(true);
    expect(gun.magazine.getObjectByName('authored_magazine')).toBeUndefined();
    gun.dispose();
  });

  it('leaves the complete procedural fallback visible when the asset is incomplete', async () => {
    const gun = buildM4A1({ detail: 'high' });
    const scene = await loadAsset();
    const missing = scene.getObjectByName('authored_magazine_marks')!;
    scene.remove(missing);
    expect(() => attachAuthoredM4(gun, scene)).toThrow('authored_magazine_marks');
    for (const name of ['magwell', 'upperReceiver', 'lowerReceiverBody', 'rearSightBody', 'handguard', 'stock', 'polymer', 'muzzleDevice', 'magazineBody']) {
      expect(gun.root.getObjectByName(name)?.visible).toBe(true);
    }
    disposeAuthored(scene);
    disposeAuthored(missing);
    gun.dispose();
  });

  it('disposes a model that finishes loading after the viewmodel is destroyed', async () => {
    const bytes = await readFile(new URL('../src/viewmodel/assets/m4a1-details.glb', import.meta.url));
    const asset = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
    const mesh = asset.scene.getObjectByName('authored_magwell') as Mesh;
    const disposed = vi.spyOn(mesh.geometry, 'dispose');
    let finish!: (value: GLTF) => void;
    const pending = new Promise<GLTF>((resolve) => { finish = resolve; });
    const loader = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockReturnValue(pending);
    try {
      const viewmodel = new Viewmodel();
      viewmodel.dispose();
      finish(asset);
      await vi.waitFor(() => expect(disposed).toHaveBeenCalledOnce());
      expect(viewmodel.gun.root.getObjectByName('authored_magwell')).toBeUndefined();
    } finally {
      loader.mockRestore();
    }
  });
});
