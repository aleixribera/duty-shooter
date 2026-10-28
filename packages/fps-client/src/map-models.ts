import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { color, float, mix, vertexColor } from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Color, Group, Matrix4, Mesh, MeshStandardNodeMaterial, Quaternion, Vector3, type BufferGeometry, type Material, type Object3D } from 'three/webgpu';
import { lampMaterial } from './surface-materials';
import type { Family, Finish, MapModels, ModelPlacement } from './surfaces';

/** How each family shines on a model (the finishes' patterns are for the baked surfaces; models take their colour). */
const SHEEN: Partial<Record<Family, { roughness: number; metalness: number }>> = {
  paint: { roughness: 0.55, metalness: 0.1 },
  sheetMetal: { roughness: 0.5, metalness: 0.35 },
  glass: { roughness: 0.1, metalness: 0 },
  plastic: { roughness: 0.5, metalness: 0 },
};

/** How much of the light baked occlusion takes away in the deepest creases: all of the ambient, part of the sun (contact shading). */
const CREASE_SUN = 0.45;

/**
 * A model material for a finish: its colour, lit like the moving things (see
 * WorldView.lightMoving), or a lamp's glow. A model with ambient occlusion
 * baked into its vertex colours (`occluded`) darkens its creases with it.
 */
function modelMaterial(finish: Finish, occluded: boolean): Material {
  if (finish.family === 'lamp') return lampMaterial(finish);
  const sheen = SHEEN[finish.family] ?? { roughness: 0.85, metalness: 0 };
  const m = new MeshStandardNodeMaterial({ color: new Color(finish.color), roughness: finish.roughness ?? sheen.roughness, metalness: finish.metalness ?? sheen.metalness });
  if (occluded) {
    const ao = vertexColor().r;
    m.aoNode = ao;
    m.colorNode = color(finish.color).mul(mix(float(1 - CREASE_SUN), float(1), ao));
  }
  return m;
}

/**
 * Models are merged by material within squares of the map this wide (m): a
 * few draw calls a map, in the frame and the shadow map alike, while a far
 * corner out of view is still skipped.
 */
const CELL = 160;

/** A placement's transform: turned `yaw` about +y, then moved to its position. */
export function placementMatrix(p: ModelPlacement): Matrix4 {
  return new Matrix4().compose(new Vector3(...p.position), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw), new Vector3(1, 1, 1));
}

/**
 * Loads a map's models and places them, merged into one mesh per material in
 * each square of the map (see `CELL`): the parts of different assets that
 * wear the same finish draw together, so a street of cars, crates and poles
 * costs a few draw calls. Each part's material is named after the map finish
 * it wears. Everything casts and takes shadows like the static surfaces.
 */
export async function loadMapModels(models: MapModels, finishes: Readonly<Record<string, Finish>>): Promise<Group> {
  const { scene } = await new GLTFLoader().loadAsync(models.url);
  scene.updateMatrixWorld(true);
  const materials = new Map<string, Material>();
  const materialFor = (name: string, occluded: boolean) => {
    const key = `${name}${occluded ? ':ao' : ''}`;
    let m = materials.get(key);
    if (!m) {
      const finish = finishes[name];
      if (!finish) throw new Error(`Map model material "${name}" names no finish`);
      m = modelMaterial(finish, occluded);
      materials.set(key, m);
    }
    return m;
  };
  const byAsset = new Map<string, ModelPlacement[]>();
  for (const p of models.placements) byAsset.set(p.asset, [...(byAsset.get(p.asset) ?? []), p]);
  const out = new Group();
  const batches = new Map<string, { material: Material; geometries: BufferGeometry[] }>();
  for (const [asset, placements] of byAsset) {
    const root = scene.getObjectByName(asset);
    if (!root) throw new Error(`The map's model file has no "${asset}"`);
    const toRoot = root.matrixWorld.clone().invert();
    const parts: { geometry: BufferGeometry; material: Material }[] = [];
    root.traverse((o: Object3D) => {
      if (!(o instanceof Mesh)) return;
      const geometry = (o.geometry as BufferGeometry).clone().applyMatrix4(toRoot.clone().multiply(o.matrixWorld));
      const occluded = geometry.hasAttribute('color');
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) parts.push({ geometry, material: materialFor((m as Material).name, occluded) });
    });
    for (const placement of placements) {
      const matrix = placementMatrix(placement);
      const cell = `${Math.floor(placement.position[0] / CELL)},${Math.floor(placement.position[2] / CELL)}`;
      for (const part of parts) {
        const geometry = part.geometry.clone().applyMatrix4(matrix);
        // Only geometry with the same attributes merges; colours (baked occlusion) make their own material anyway.
        const key = `${cell} ${part.material.uuid} ${Object.keys(geometry.attributes).sort().join(',')} ${geometry.index ? 'indexed' : ''}`;
        const batch = batches.get(key) ?? { material: part.material, geometries: [] };
        batch.geometries.push(geometry);
        batches.set(key, batch);
      }
    }
  }
  for (const { material, geometries } of batches.values()) {
    const merged = geometries.length > 1 ? mergeGeometries(geometries) : geometries[0]!;
    // mergeGeometries gives null for attributes that differ in kind; those parts draw on their own.
    for (const geometry of merged ? [merged] : geometries) {
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      out.add(mesh);
    }
    if (merged && geometries.length > 1) for (const g of geometries) g.dispose();
  }
  return out;
}
