import { clamp, float, floor, luminance, materialColor, materialRoughness, mix, mx_fractal_noise_float, positionGeometry, step, vec3 } from 'three/tsl';
import type { Material, Mesh, Object3D } from 'three/webgpu';
import type { CamoId } from '../customize';

/**
 * Camos on a gun (PLAN item 7): a paint pattern laid over the gun's coated
 * surfaces (polymer, anodising, phosphate, blued and nitrided steel, stocks),
 * never its bare steel, brass, glass, sights or inserts. The pattern is drawn
 * in the model's own space, so it runs across a part's faces unbroken; the
 * baked surface's light and dark (wear, grime, stipple) still show through it.
 */

type Rgb = readonly [number, number, number];

/** Finishes that take paint: gunsmith.py's finish names, and the M4A1's own. */
const PAINTED = new Set(['polymer', 'anodised', 'phosphate', 'nitride', 'stipple', 'composite', 'sand', 'blued', 'walnut', 'checkered', 'Reference anodized aluminium', 'Reference polymer', 'Reference phosphate steel']);

/** Each camo's colours (linear), base first; `digital` draws it in square blocks; `metal` is a plated finish. */
const CAMOS: { readonly [C in CamoId]: { readonly colours: readonly [Rgb, Rgb, Rgb, Rgb]; readonly digital: boolean; readonly metal: boolean } } = {
  sand: { colours: [[0.3, 0.22, 0.13], [0.42, 0.33, 0.2], [0.17, 0.115, 0.065], [0.24, 0.17, 0.1]], digital: false, metal: false },
  forest: { colours: [[0.09, 0.1, 0.05], [0.045, 0.065, 0.03], [0.12, 0.085, 0.045], [0.018, 0.018, 0.016]], digital: false, metal: false },
  urban: { colours: [[0.2, 0.2, 0.2], [0.075, 0.075, 0.08], [0.38, 0.38, 0.38], [0.03, 0.03, 0.032]], digital: true, metal: false },
  night: { colours: [[0.03, 0.035, 0.055], [0.06, 0.07, 0.11], [0.014, 0.014, 0.02], [0.09, 0.1, 0.15]], digital: true, metal: false },
  gold: { colours: [[0.95, 0.66, 0.24], [0.88, 0.58, 0.2], [0.95, 0.66, 0.24], [0.88, 0.58, 0.2]], digital: false, metal: true },
};

/** About one blotch every 7 cm. */
const SCALE = 14;
/** The tone of a bare coated surface the shading is measured against: gunsmith.py's black finishes. */
const REFERENCE = 0.075;

const made = new WeakMap<Material, Map<CamoId, Material>>();

/** Whether `material` is a coated finish that takes a camo. */
function painted(material: Material): boolean {
  return PAINTED.has(material.name.replace(/\.\d+$/, ''));
}

/** `base` painted in `camo`; made once per material and camo. */
function camoMaterial(base: Material, camo: CamoId): Material {
  let byCamo = made.get(base);
  if (!byCamo) made.set(base, (byCamo = new Map()));
  const have = byCamo.get(camo);
  if (have) return have;
  const spec = CAMOS[camo];
  const m = base.clone() as Material & { colorNode: unknown; metalnessNode: unknown; roughnessNode: unknown };
  const old = (base as Material & { colorNode?: unknown }).colorNode;
  const surface = (old ?? materialColor) as typeof materialColor;
  // How light or dark the baked surface is here against its plain coat: worn edges lighter, grime and stipple darker.
  const tint = base.userData['tint'] as Rgb | undefined;
  const reference = tint ? Math.max(0.02, 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2]) : REFERENCE;
  const shade = clamp(luminance(surface.rgb).div(reference), 0.5, 1.6);
  const p = spec.digital ? floor(positionGeometry.mul(SCALE * 6)).div(6) : positionGeometry.mul(SCALE);
  const a = mx_fractal_noise_float(p, 3, 2.0, 0.5);
  const b = mx_fractal_noise_float(p.mul(1.9).add(vec3(17.3, 4.1, 9.7)), 3, 2.0, 0.5);
  const [c0, c1, c2, c3] = spec.colours.map((c) => vec3(c[0], c[1], c[2]));
  let colour = mix(c0!, c1!, step(0.06, a));
  colour = mix(colour, c2!, step(0.16, b));
  colour = mix(colour, c3!, step(0.3, a.negate()));
  m.colorNode = colour.mul(shade);
  m.metalnessNode = float(spec.metal ? 1 : 0.06);
  if (spec.metal) m.roughnessNode = materialRoughness.mul(0.5).add(0.08);
  m.name = base.name;
  byCamo.set(camo, m);
  return m;
}

/**
 * Paints the gun under `root` in `camo`, or back to its own finish (null). Optics (`optic:*`) keep theirs; anything
 * added to the gun later (a fitting) is painted by the next call.
 */
export function paintGun(root: Object3D, camo: CamoId | null): void {
  const visit = (o: Object3D) => {
    if (o.name.startsWith('optic:')) return;
    const mesh = o as Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material)) {
      const own = (mesh.userData['ownMaterial'] as Material | undefined) ?? mesh.material;
      if (painted(own)) {
        mesh.userData['ownMaterial'] = own;
        mesh.material = camo ? camoMaterial(own, camo) : own;
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
}
