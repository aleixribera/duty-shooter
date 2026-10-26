import { Float32BufferAttribute, Mesh, Object3D, type Material } from 'three/webgpu';
import type { M4A1Model } from './m4a1';

/** Dispose a loaded glTF scene, including when loading finishes after teardown. */
export function disposeAuthored(root: Object3D): void {
  const materials = new Set<Material>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  for (const material of materials) material.dispose();
  root.removeFromParent();
}

function meshNamed(root: Object3D, name: string): Mesh {
  const result = root.getObjectByName(name) as Mesh | undefined;
  if (!result?.isMesh || Array.isArray(result.material)) throw new Error(`Missing M4A1 mesh: ${name}`);
  return result;
}

function adoptFinish(target: Mesh, source: Mesh): void {
  if (Array.isArray(source.material)) throw new Error('Expected a single weapon material');
  const count = target.geometry.getAttribute('position').count;
  const edgeMask = target.geometry.getAttribute('color');
  const surf = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    surf[i * 3] = 1;
    surf[i * 3 + 1] = edgeMask ? edgeMask.getY(i) : 0;
    surf[i * 3 + 2] = 1;
  }
  target.geometry.setAttribute('surf', new Float32BufferAttribute(surf, 3));
  const imported = Array.isArray(target.material) ? target.material : [target.material];
  target.material = source.material.clone();
  for (const material of imported) material.dispose();
}

/**
 * Attach the Blender-authored parts after validating the whole asset. The
 * original meshes stay available as a fallback if the download fails.
 */
export function attachAuthoredM4(gun: M4A1Model, scene: Object3D): () => void {
  const receiver = meshNamed(scene, 'authored_magwell');
  const stock = meshNamed(scene, 'authored_stock');
  const muzzle = meshNamed(scene, 'authored_muzzle');
  const magazine = meshNamed(scene, 'authored_magazine');
  const marks = meshNamed(scene, 'authored_magazine_marks');
  const wellFallback = meshNamed(gun.root, 'magwell');
  const upperFallback = meshNamed(gun.root, 'upperReceiver');
  const lowerFallback = meshNamed(gun.root, 'lowerReceiverBody');
  const sightFallback = meshNamed(gun.root, 'rearSightBody');
  const handguardFallback = meshNamed(gun.root, 'handguard');
  const stockFallback = meshNamed(gun.root, 'stock');
  const gripFallback = meshNamed(gun.root, 'polymer');
  const muzzleFallback = meshNamed(gun.root, 'muzzleDevice');
  const magazineFallback = meshNamed(gun.magazine, 'magazineBody');

  adoptFinish(receiver, wellFallback);
  adoptFinish(stock, stockFallback);
  adoptFinish(muzzle, muzzleFallback);
  adoptFinish(magazine, magazineFallback);
  const originals = [wellFallback, upperFallback, lowerFallback, sightFallback, handguardFallback, stockFallback, gripFallback, muzzleFallback, magazineFallback];
  for (const original of originals) original.visible = false;
  scene.traverse((object) => { object.frustumCulled = false; });

  // These two meshes are authored in magazine-local coordinates, so they
  // inherit the existing reload motion and visibility without retiming it.
  gun.magazine.add(magazine, marks);
  gun.root.add(scene);
  return () => {
    for (const original of originals) original.visible = true;
    disposeAuthored(scene);
    disposeAuthored(magazine);
    disposeAuthored(marks);
  };
}
