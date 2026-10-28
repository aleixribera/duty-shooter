import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { attribute, float, mix } from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BufferAttribute, BufferGeometry, Color, Group, Matrix4, Mesh, MeshStandardNodeMaterial, Quaternion, Vector3, type Material, type Object3D } from 'three/webgpu';
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
 * The one material every model finish but the lamps wears, lit like the moving
 * things (see WorldView.lightMoving): each vertex carries its finish's colour,
 * roughness and metalness, and the ambient occlusion baked into the model's
 * vertex colours (1 where it has none), which darkens its creases. So models of
 * every finish merge into the same few meshes.
 */
function finishMaterial(): Material {
  const m = new MeshStandardNodeMaterial();
  const ao = attribute<'float'>('modelAo', 'float');
  const pbr = attribute<'vec2'>('finishPbr', 'vec2');
  m.colorNode = attribute<'vec3'>('finishColor', 'vec3').mul(mix(float(1 - CREASE_SUN), float(1), ao));
  m.roughnessNode = pbr.x;
  m.metalnessNode = pbr.y;
  m.aoNode = ao;
  return m;
}

/**
 * A part's geometry with only what the model materials read: position, normal,
 * an index, and its finish and baked occlusion per vertex (see `finishMaterial`).
 */
function finishGeometry(source: BufferGeometry, finish: Finish): BufferGeometry {
  if (!source.hasAttribute('normal')) source.computeVertexNormals();
  const position = source.getAttribute('position');
  const n = position.count;
  const g = new BufferGeometry();
  g.setAttribute('position', position);
  g.setAttribute('normal', source.getAttribute('normal'));
  g.setIndex(source.index ?? Array.from({ length: n }, (_, i) => i));
  const colour = new Color(finish.color);
  const sheen = SHEEN[finish.family] ?? { roughness: 0.85, metalness: 0 };
  const roughness = finish.roughness ?? sheen.roughness;
  const metalness = finish.metalness ?? sheen.metalness;
  const occlusion = source.getAttribute('color');
  const finishColor = new Float32Array(n * 3);
  const finishPbr = new Float32Array(n * 2);
  const modelAo = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    finishColor[i * 3] = colour.r;
    finishColor[i * 3 + 1] = colour.g;
    finishColor[i * 3 + 2] = colour.b;
    finishPbr[i * 2] = roughness;
    finishPbr[i * 2 + 1] = metalness;
    modelAo[i] = occlusion ? occlusion.getX(i) : 1;
  }
  g.setAttribute('finishColor', new BufferAttribute(finishColor, 3));
  g.setAttribute('finishPbr', new BufferAttribute(finishPbr, 2));
  g.setAttribute('modelAo', new BufferAttribute(modelAo, 1));
  return g;
}

/** The triangles of `geometry` a material group draws (all of it without groups), as their own geometry. */
function groupGeometry(geometry: BufferGeometry, start: number, count: number): BufferGeometry {
  const g = geometry.clone();
  const index = geometry.index ? Array.from(geometry.index.array.slice(start, start + count)) : Array.from({ length: count }, (_, i) => start + i);
  g.setIndex(index);
  g.clearGroups();
  return g;
}

/**
 * Models are merged within squares of the map this wide (m): a few draw calls
 * a map, in the frame and the shadow map alike, while a far corner out of view
 * is still skipped.
 */
const CELL = 160;

/** A placement's transform: turned `yaw` about +y, then moved to its position. */
export function placementMatrix(p: ModelPlacement): Matrix4 {
  return new Matrix4().compose(new Vector3(...p.position), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw), new Vector3(1, 1, 1));
}

/**
 * Loads a map's models and places them, merged into one mesh in each square
 * of the map (see `CELL`) for every finish together (see `finishMaterial`),
 * and one per lamp finish: a street of cars, crates and poles costs a draw
 * call or two. Each part's material is named after the map finish it wears.
 * Everything casts and takes shadows like the static surfaces.
 */
export async function loadMapModels(models: MapModels, finishes: Readonly<Record<string, Finish>>): Promise<Group> {
  const { scene } = await new GLTFLoader().loadAsync(models.url);
  scene.updateMatrixWorld(true);
  const shared = finishMaterial();
  const lamps = new Map<string, Material>();
  const finishOf = (name: string): Finish => {
    const finish = finishes[name];
    if (!finish) throw new Error(`Map model material "${name}" names no finish`);
    return finish;
  };
  const materialFor = (name: string, finish: Finish): Material => {
    if (finish.family !== 'lamp') return shared;
    let m = lamps.get(name);
    if (!m) {
      m = lampMaterial(finish);
      lamps.set(name, m);
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
      const materials = (Array.isArray(o.material) ? o.material : [o.material]) as Material[];
      // A mesh wearing several finishes draws each from its own group of triangles.
      const groups = Array.isArray(o.material) && geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
      for (const group of groups) {
        const name = materials[group.materialIndex ?? 0]?.name ?? '';
        const finish = finishOf(name);
        const count = Number.isFinite(group.count) ? group.count : (geometry.index ?? geometry.getAttribute('position')).count;
        parts.push({ geometry: finishGeometry(groupGeometry(geometry, group.start, count), finish), material: materialFor(name, finish) });
      }
    });
    for (const placement of placements) {
      const matrix = placementMatrix(placement);
      const cell = `${Math.floor(placement.position[0] / CELL)},${Math.floor(placement.position[2] / CELL)}`;
      for (const part of parts) {
        const key = `${cell} ${part.material.uuid}`;
        const batch = batches.get(key) ?? { material: part.material, geometries: [] };
        batch.geometries.push(part.geometry.clone().applyMatrix4(matrix));
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
