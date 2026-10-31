import type { Zone, ZoneState } from '@duty-shooter/fps-core';
import {
  abs,
  atan,
  cameraFar,
  cameraNear,
  cameraWorldMatrix,
  cross,
  dFdx,
  dFdy,
  float,
  fract,
  fwidth,
  min,
  mix,
  normalize,
  perspectiveDepthToViewZ,
  positionView,
  smoothstep,
  step,
  uniform,
  vec2,
  vec4,
  viewportDepthTexture,
} from 'three/tsl';
import { BackSide, Color, CylinderGeometry, Mesh, MeshBasicNodeMaterial, type Scene } from 'three/webgpu';

/** The ring's colours: the HUD's team colours (`--ds-blue`, `--ds-orange`), and a light grey while nobody holds it. */
const NEUTRAL = 0xc9ccd1;
const TEAM_COLORS: Readonly<Record<number, number>> = { 1: 0x3d8bff, 2: 0xff9a3c };
/** The bright band round the edge (m), and how opaque it and the faint fill inside are (at the centre, and at the band). */
const BAND = 0.22;
const BAND_ALPHA = 0.85;
const FILL_ALPHA = [0.16, 0.05] as const;
/** The surfaces painted: from this far below the zone's floor to this far above it (m: the ground, its curbs and rails, not a car's frame or a crate's top), and only those facing up. */
const BELOW = 0.5;
const ABOVE = 0.6;

/**
 * A circle on the ground at each Outposts zone, its capture radius exactly:
 * a bright band round the edge over a faint fill, grey while neutral and in
 * the holder's colour once taken. A capture under way sweeps round the ring
 * in the taking team's colour as its progress grows (and back as it drains),
 * and a contested zone pulses.
 *
 * Each ring is a projected decal: a volume round the zone that, for every
 * pixel it covers, rebuilds the scene point behind it from the depth buffer
 * and paints it when it lies inside the circle, near the floor and faces up.
 * So the ring follows whatever the ground is (curbs, rails and sleepers,
 * ballast) without floating over it or fighting it for depth,
 * and anything in front of it (a wall, a car) hides it as usual.
 */
export class ZoneRings {
  readonly #rings: readonly Ring[];
  readonly #scene: Scene;

  constructor(scene: Scene, zones: readonly Zone[]) {
    this.#scene = scene;
    // One depth copy for all of them.
    const depth = viewportDepthTexture();
    this.#rings = zones.map((zone) => {
      const ring = makeRing(zone, depth);
      scene.add(ring.mesh);
      return ring;
    });
  }

  /** Every ring's mesh, shown or not. */
  get meshes(): readonly Mesh[] {
    return this.#rings.map((ring) => ring.mesh);
  }

  /** Shows each ring with its zone's state, or hides them all (`null`: not an Outposts match, or not while playing). */
  update(states: readonly ZoneState[] | null, time: number): void {
    for (const ring of this.#rings) {
      const s = states?.find((x) => x.id === ring.id);
      ring.mesh.visible = !!s;
      if (!s) continue;
      const look = ringLook(s);
      ring.owner.value.setHex(look.owner);
      ring.taker.value.setHex(look.taker);
      ring.progress.value = look.progress;
      ring.alpha.value = s.contested ? 0.55 + 0.45 * Math.abs(Math.sin(time * Math.PI * 1.6)) : 1;
    }
  }

  dispose(): void {
    for (const ring of this.#rings) {
      this.#scene.remove(ring.mesh);
      ring.mesh.geometry.dispose();
      (ring.mesh.material as MeshBasicNodeMaterial).dispose();
    }
  }
}

/** How a zone's ring looks: the holder's colour (grey while neutral), and the taking team's colour swept round it as far as its capture has got. */
export function ringLook(s: ZoneState): { owner: number; taker: number; progress: number } {
  return { owner: TEAM_COLORS[s.owner] ?? NEUTRAL, taker: TEAM_COLORS[s.capturing] ?? NEUTRAL, progress: s.capturing ? s.progress : 0 };
}

/** One zone's ring: its mesh, and the uniforms its colours, sweep and pulse are drawn from. */
type Ring = ReturnType<typeof makeRing>;

function makeRing(zone: Zone, depth: ReturnType<typeof viewportDepthTexture>) {
  const [cx, cy, cz] = zone.center;
  const r = zone.radius;
  const owner = uniform(new Color(NEUTRAL));
  const taker = uniform(new Color(NEUTRAL));
  const progress = uniform(0);
  const alpha = uniform(1);
  // The scene point behind this pixel: the volume's own view position, scaled out to the depth buffer's.
  const sceneZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  const world = cameraWorldMatrix.mul(vec4(positionView.mul(sceneZ.div(positionView.z)), 1)).xyz;
  const dx = world.x.sub(cx);
  const dz = world.z.sub(cz);
  const d = vec2(dx, dz).length();
  // A pixel's worth of distance, for smooth edges; capped where the depth jumps (an object's outline).
  const aa = min(fwidth(d), float(0.08));
  const inside = smoothstep(float(r).add(aa), float(r).sub(aa), d);
  const band = smoothstep(float(r - BAND).sub(aa), float(r - BAND).add(aa), d);
  const fill = mix(float(FILL_ALPHA[0]), float(FILL_ALPHA[1]), d.div(r));
  const h = world.y.sub(cy);
  const near = step(-BELOW, h).mul(step(h, ABOVE));
  const up = abs(normalize(cross(dFdx(world), dFdy(world))).y);
  const flat = smoothstep(float(0.5), float(0.75), up);
  // 0 to 1 clockwise from north, seen from above: how far round the capture has swept.
  const along = fract(atan(dx, dz.negate()).div(Math.PI * 2));
  const swept = step(along.add(1e-4), progress);
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, side: BackSide, fog: false });
  m.colorNode = mix(owner, taker, swept);
  m.opacityNode = mix(fill, float(BAND_ALPHA), band).mul(inside).mul(near).mul(flat).mul(alpha);
  // The volume: a little wider than the circle, from below the floor to above it.
  const geometry = new CylinderGeometry(r + 0.1, r + 0.1, BELOW + ABOVE + 0.2, 48);
  geometry.translate(cx, cy + (ABOVE - BELOW) / 2, cz);
  const mesh = new Mesh(geometry, m);
  mesh.visible = false;
  mesh.renderOrder = 1;
  return { id: zone.id, mesh, owner, taker, progress, alpha };
}
