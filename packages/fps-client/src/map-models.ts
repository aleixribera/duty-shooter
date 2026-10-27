import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardNodeMaterial, Quaternion, Vector3, type BufferGeometry, type Material, type Object3D } from 'three/webgpu';
import { lampMaterial } from './surface-materials';
import type { Family, Finish, MapModels, ModelPlacement } from './surfaces';

/** How each family shines on a model (the finishes' patterns are for the baked surfaces; models take their colour). */
const SHEEN: Partial<Record<Family, { roughness: number; metalness: number }>> = {
  paint: { roughness: 0.55, metalness: 0.1 },
  sheetMetal: { roughness: 0.5, metalness: 0.35 },
  glass: { roughness: 0.1, metalness: 0 },
  plastic: { roughness: 0.5, metalness: 0 },
};

/** A model material for a finish: its colour, lit like the moving things (see WorldView.lightMoving), or a lamp's glow. */
function modelMaterial(finish: Finish): Material {
  if (finish.family === 'lamp') return lampMaterial(finish);
  const sheen = SHEEN[finish.family] ?? { roughness: 0.85, metalness: 0 };
  return new MeshStandardNodeMaterial({ color: new Color(finish.color), ...sheen });
}

/** A placement's transform: turned `yaw` about +y, then moved to its position. */
export function placementMatrix(p: ModelPlacement): Matrix4 {
  return new Matrix4().compose(new Vector3(...p.position), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw), new Vector3(1, 1, 1));
}

/**
 * Loads a map's models and places them: one instanced mesh per part of each
 * asset (a part per material), so a dozen freight cars cost a few draw
 * calls. Each part's material is named after the map finish it wears.
 * Everything casts and takes shadows like the static surfaces.
 */
export async function loadMapModels(models: MapModels, finishes: Readonly<Record<string, Finish>>): Promise<Group> {
  const { scene } = await new GLTFLoader().loadAsync(models.url);
  scene.updateMatrixWorld(true);
  const materials = new Map<string, Material>();
  const materialFor = (name: string) => {
    let m = materials.get(name);
    if (!m) {
      const finish = finishes[name];
      if (!finish) throw new Error(`Map model material "${name}" names no finish`);
      m = modelMaterial(finish);
      materials.set(name, m);
    }
    return m;
  };
  const byAsset = new Map<string, ModelPlacement[]>();
  for (const p of models.placements) byAsset.set(p.asset, [...(byAsset.get(p.asset) ?? []), p]);
  const out = new Group();
  for (const [asset, placements] of byAsset) {
    const root = scene.getObjectByName(asset);
    if (!root) throw new Error(`The map's model file has no "${asset}"`);
    const toRoot = root.matrixWorld.clone().invert();
    const parts: { geometry: BufferGeometry; material: Material }[] = [];
    root.traverse((o: Object3D) => {
      if (!(o instanceof Mesh)) return;
      const geometry = (o.geometry as BufferGeometry).clone().applyMatrix4(toRoot.clone().multiply(o.matrixWorld));
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) parts.push({ geometry, material: materialFor((m as Material).name) });
    });
    const matrices = placements.map(placementMatrix);
    for (const part of parts) {
      const mesh = new InstancedMesh(part.geometry, part.material, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      out.add(mesh);
    }
  }
  return out;
}
